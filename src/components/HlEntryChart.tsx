"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type UTCTimestamp,
} from "lightweight-charts";
import type { HlCandle } from "@/lib/hyperliquid/client";
import {
  candleCacheKey,
  getCachedCandles,
  getStaleCandles,
  setCachedCandles,
  type HlCandleInterval,
} from "@/lib/hyperliquid/candleCache";
import type {
  HlOpenPosition,
  HlRecentEntry,
  HlSide,
  HlTrader,
} from "@/lib/hyperliquid/types";
import { formatKst } from "@/lib/utils/format";
import { HlTraderPerfBadge } from "./HlTraderPerfBadge";

function pickInterval(ageMs: number): {
  interval: HlCandleInterval;
  barMs: number;
} {
  if (ageMs < 4 * 3600_000) return { interval: "5m", barMs: 5 * 60_000 };
  if (ageMs < 36 * 3600_000) return { interval: "15m", barMs: 15 * 60_000 };
  if (ageMs < 6 * 86400_000) return { interval: "1h", barMs: 3600_000 };
  return { interval: "4h", barMs: 4 * 3600_000 };
}

function kstClock(sec: number): string {
  return new Date(sec * 1000).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fmtPx(n: number): string {
  return n.toLocaleString(undefined, { maximumSignificantDigits: 6 });
}

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

/** 진입·청산(익절) 라운드 — 최근진입 / 열린포지션 / 히스토리 공용 */
export type HlChartRound = {
  coin: string;
  side: HlSide;
  avgPx: number;
  firstTime: number;
  lastTime: number;
  fills?: number;
  kind?: "OPEN" | "FLIP" | "POSITION" | "CLOSE";
  label?: string | null;
  address?: string;
  notional?: number;
  /** 청산·익절가 (있으면 마커) */
  exitPx?: number | null;
  exitTime?: number | null;
  /** 열린 포지션 현재가 */
  liveMarkPx?: number | null;
};

export function roundFromEntry(
  entry: HlRecentEntry,
  position?: HlOpenPosition | null
): HlChartRound {
  return {
    coin: entry.coin,
    side: entry.side,
    avgPx: entry.avgPx,
    firstTime: entry.firstTime,
    lastTime: entry.lastTime,
    fills: entry.fills,
    kind: entry.kind,
    label: entry.label,
    address: entry.address,
    notional: entry.notional,
    liveMarkPx:
      position?.mark_price != null ? Number(position.mark_price) : null,
  };
}

export function roundFromPosition(
  p: HlOpenPosition,
  trader?: HlTrader | null
): HlChartRound | null {
  const px = p.entry_price != null ? Number(p.entry_price) : null;
  if (px == null || !(px > 0)) return null;
  const t = p.opened_at
    ? new Date(p.opened_at).getTime()
    : new Date(p.updated_at).getTime();
  return {
    coin: p.coin,
    side: p.side,
    avgPx: px,
    firstTime: t,
    lastTime: t,
    kind: "POSITION",
    label: trader?.label ?? null,
    address: trader?.address,
    notional: p.position_value != null ? Math.abs(Number(p.position_value)) : undefined,
    liveMarkPx: p.mark_price != null ? Number(p.mark_price) : null,
  };
}

export function HlEntryChart({
  round,
  entry,
  position,
  trader,
  onClose,
}: {
  round?: HlChartRound;
  /** @deprecated round 권장 — 호환용 */
  entry?: HlRecentEntry;
  position?: HlOpenPosition | null;
  trader?: HlTrader | null;
  onClose: () => void;
}) {
  const resolved: HlChartRound | null =
    round ??
    (entry ? roundFromEntry(entry, position) : null) ??
    (position ? roundFromPosition(position, trader) : null);

  const ref = useRef<HTMLDivElement>(null);
  const [candles, setCandles] = useState<HlCandle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { interval, barMs } = useMemo(() => {
    if (!resolved) return pickInterval(3600_000);
    const endMs = resolved.exitTime ?? Date.now();
    return pickInterval(Math.max(endMs - resolved.firstTime, 3600_000));
  }, [resolved]);

  useEffect(() => {
    if (!resolved) return;
    let cancel = false;
    const start = resolved.firstTime - barMs * 80;
    const end = (resolved.exitTime ?? Date.now()) + barMs * 20;
    const key = candleCacheKey(resolved.coin, interval, start, end);
    const fresh = getCachedCandles(key, interval);
    if (fresh && fresh.length > 0) {
      setCandles(fresh);
      setLoading(false);
      setError(null);
      return;
    }
    const stale = getStaleCandles(key);
    if (stale && stale.length > 0) {
      setCandles(stale);
      setLoading(true);
      setError(null);
    } else {
      setLoading(true);
      setError(null);
    }
    const ac = new AbortController();
    void (async () => {
      try {
        const res = await fetch(
          `/api/hl-traders/candles?coin=${encodeURIComponent(resolved.coin)}&interval=${interval}&start=${start}&end=${end}`,
          { signal: ac.signal, cache: "no-store" }
        );
        const data = (await res.json()) as {
          candles?: HlCandle[];
          error?: string;
        };
        if (data.error && !(data.candles && data.candles.length)) {
          throw new Error(data.error);
        }
        if (cancel) return;
        const list = data.candles ?? [];
        setCachedCandles(key, list);
        setCandles(list);
      } catch (err) {
        if (ac.signal.aborted || cancel) return;
        const fallback = getStaleCandles(key);
        if (fallback && fallback.length > 0) {
          setCandles(fallback);
        } else {
          setError(err instanceof Error ? err.message : "차트 실패");
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
      ac.abort();
    };
  }, [resolved, interval, barMs]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !resolved || candles.length === 0) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#71717a",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "rgba(63,63,70,0.45)" },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: number) => kstClock(time),
      },
      localization: { timeFormatter: (time: number) => kstClock(time) },
      crosshair: { mode: CrosshairMode.Normal },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#34d399",
      downColor: "#f87171",
      borderUpColor: "#34d399",
      borderDownColor: "#f87171",
      wickUpColor: "#34d399",
      wickDownColor: "#f87171",
      priceLineVisible: false,
    });
    series.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    const sideColor = resolved.side === "LONG" ? "#34d399" : "#f87171";
    const exitColor = resolved.side === "LONG" ? "#60a5fa" : "#fbbf24";

    series.createPriceLine({
      price: resolved.avgPx,
      color: sideColor,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "진입",
    });

    if (resolved.exitPx != null && resolved.exitPx > 0) {
      series.createPriceLine({
        price: resolved.exitPx,
        color: exitColor,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "익절·청산",
      });
    } else if (resolved.liveMarkPx != null && resolved.liveMarkPx > 0) {
      series.createPriceLine({
        price: resolved.liveMarkPx,
        color: "rgba(244,244,245,0.55)",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: "현재",
      });
    }

    if (position?.liquidation_px != null && Number(position.liquidation_px) > 0) {
      series.createPriceLine({
        price: Number(position.liquidation_px),
        color: "rgba(251,191,36,0.7)",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: "청산가",
      });
    }

    const snapTime = (ms: number) => {
      const sec = Math.floor(ms / 1000);
      let best = candles[0]!.time;
      for (const c of candles) {
        if (c.time <= sec) best = c.time;
        else break;
      }
      return best as UTCTimestamp;
    };

    const firstT = snapTime(resolved.firstTime);
    const lastT = snapTime(resolved.lastTime);
    const entryMarker = {
      position:
        resolved.side === "LONG" ? ("belowBar" as const) : ("aboveBar" as const),
      color: sideColor,
      shape:
        resolved.side === "LONG" ? ("arrowUp" as const) : ("arrowDown" as const),
    };

    const markers = [];
    if (firstT === lastT) {
      markers.push({
        ...entryMarker,
        time: firstT,
        text: resolved.side === "LONG" ? "1 롱 진입" : "1 숏 진입",
      });
    } else {
      markers.push(
        { ...entryMarker, time: firstT, text: "1 분할 시작" },
        { ...entryMarker, time: lastT, text: "분할 끝" }
      );
    }

    if (resolved.exitTime != null && resolved.exitPx != null) {
      const exitT = snapTime(resolved.exitTime);
      markers.push({
        time: exitT,
        position:
          resolved.side === "LONG" ? ("aboveBar" as const) : ("belowBar" as const),
        color: exitColor,
        shape: "circle" as const,
        text: "2 익절·청산",
      });
    }

    createSeriesMarkers(series, markers);
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles, resolved, position]);

  if (!resolved) {
    return (
      <div className="rounded-md border border-zinc-700 bg-zinc-950/70 p-3 text-sm text-zinc-500">
        차트에 쓸 진입가가 없습니다.
        <button
          type="button"
          onClick={onClose}
          className="ml-2 text-zinc-400 underline"
        >
          닫기
        </button>
      </div>
    );
  }

  const last = candles[candles.length - 1]?.close ?? null;
  const comparePx =
    resolved.exitPx ?? resolved.liveMarkPx ?? last;
  const movePct =
    comparePx != null && resolved.avgPx > 0
      ? ((comparePx - resolved.avgPx) / resolved.avgPx) * 100
      : null;
  const pnlPct =
    movePct == null ? null : resolved.side === "LONG" ? movePct : -movePct;
  const durationMin = Math.round(
    ((resolved.exitTime ?? resolved.lastTime) - resolved.firstTime) / 60_000
  );
  const sideKo = resolved.side === "LONG" ? "롱" : "숏";
  const closed = resolved.exitTime != null && resolved.exitPx != null;

  const lows = candles.map((c) => c.low);
  const highs = candles.map((c) => c.high);
  const before = candles.filter((c) => c.time * 1000 < resolved.firstTime);
  const rangeLow = before.length
    ? Math.min(...before.map((c) => c.low))
    : Math.min(...lows, resolved.avgPx);
  const rangeHigh = before.length
    ? Math.max(...before.map((c) => c.high))
    : Math.max(...highs, resolved.avgPx);
  const rangePos =
    rangeHigh > rangeLow
      ? ((resolved.avgPx - rangeLow) / (rangeHigh - rangeLow)) * 100
      : null;

  return (
    <div className="rounded-md border border-zinc-700 bg-zinc-950/70 p-3">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1 text-sm">
          <p className="text-zinc-200">
            <span className="font-medium">
              {resolved.label ?? resolved.address?.slice(0, 8) ?? "트레이더"}
            </span>
            {" · "}
            <span className="font-medium text-zinc-100">{resolved.coin}</span>{" "}
            <span
              className={
                resolved.side === "LONG" ? "text-emerald-400" : "text-rose-400"
              }
            >
              {sideKo}{" "}
              {closed
                ? "라운드"
                : resolved.kind === "FLIP"
                  ? "(방향 전환)"
                  : resolved.kind === "POSITION"
                    ? "보유중"
                    : "진입"}
            </span>
          </p>
          <p className="text-xs leading-relaxed text-zinc-400">
            {formatKst(resolved.firstTime)}에 평균 {fmtPx(resolved.avgPx)}
            {resolved.notional != null ? ` · ${fmtUsd(resolved.notional)}` : ""}
            {resolved.fills && resolved.fills > 1
              ? ` · ${resolved.fills}회 분할`
              : ""}
            {durationMin > 0 && closed ? ` · 보유 ${durationMin}분` : ""}.
            {rangePos != null && (
              <>
                {" "}
                진입 전 구간{" "}
                <span className="text-zinc-200">
                  {rangePos <= 25
                    ? "저점권"
                    : rangePos >= 75
                      ? "고점권"
                      : "중간"}
                  ({rangePos.toFixed(0)}%)
                </span>
                .
              </>
            )}
            {closed && resolved.exitPx != null && (
              <>
                {" "}
                {formatKst(resolved.exitTime!)}에 {fmtPx(resolved.exitPx)}으로
                청산
                {pnlPct != null && (
                  <>
                    {" → "}
                    <span
                      className={
                        pnlPct >= 0 ? "text-emerald-400" : "text-rose-400"
                      }
                    >
                      {pnlPct >= 0 ? "+" : ""}
                      {pnlPct.toFixed(2)}%
                    </span>
                  </>
                )}
                .
              </>
            )}
            {!closed && comparePx != null && pnlPct != null && (
              <>
                {" "}
                현재 {fmtPx(comparePx)} → 진입 대비{" "}
                <span
                  className={pnlPct >= 0 ? "text-emerald-400" : "text-rose-400"}
                >
                  {pnlPct >= 0 ? "+" : ""}
                  {pnlPct.toFixed(2)}%
                </span>
                .
              </>
            )}
          </p>
          {position && (
            <p className="text-xs text-zinc-500">
              지금 보유: {position.side} {Number(position.size).toPrecision(5)} ·
              평단{" "}
              {position.entry_price != null
                ? fmtPx(Number(position.entry_price))
                : "-"}
              {position.leverage != null ? ` · ${position.leverage}x` : ""}
              {position.liquidation_px != null
                ? ` · 청산가 ${fmtPx(Number(position.liquidation_px))}`
                : ""}
            </p>
          )}
          {trader ? <HlTraderPerfBadge trader={trader} /> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:text-zinc-200"
        >
          닫기
        </button>
      </div>
      {loading && candles.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-500">
          차트 불러오는 중…
        </p>
      ) : error ? (
        <p className="py-16 text-center text-sm text-rose-300">{error}</p>
      ) : (
        <div ref={ref} className="h-64 w-full" />
      )}
      <p className="mt-1 text-[10px] text-zinc-600">
        {interval} 캔들 · ①진입
        {closed ? " · ②익절·청산" : " · 점선 현재가"}
        {position?.liquidation_px ? " · 노란 점선 = 강제청산가" : ""}
      </p>
    </div>
  );
}
