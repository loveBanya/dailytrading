"use client";

import { useEffect, useRef, useState } from "react";
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
import type { HlOpenPosition, HlRecentEntry } from "@/lib/hyperliquid/types";
import { formatKst } from "@/lib/utils/format";

function pickInterval(ageMs: number): { interval: string; barMs: number } {
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

const candleCache = new Map<string, { at: number; candles: HlCandle[] }>();

export function HlEntryChart({
  entry,
  position,
  onClose,
}: {
  entry: HlRecentEntry;
  position: HlOpenPosition | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [candles, setCandles] = useState<HlCandle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [{ interval, barMs }] = useState(() =>
    pickInterval(Date.now() - entry.firstTime)
  );

  useEffect(() => {
    let cancel = false;
    const start = entry.firstTime - barMs * 80;
    const end = Date.now();
    const key = `${entry.coin}:${interval}:${Math.floor(start / barMs)}`;
    const hit = candleCache.get(key);
    if (hit && Date.now() - hit.at < 30_000) {
      setCandles(hit.candles);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/hl-traders/candles?coin=${encodeURIComponent(entry.coin)}&interval=${interval}&start=${start}&end=${end}`
        );
        const data = (await res.json()) as {
          candles?: HlCandle[];
          error?: string;
        };
        if (data.error) throw new Error(data.error);
        if (cancel) return;
        const list = data.candles ?? [];
        candleCache.set(key, { at: Date.now(), candles: list });
        setCandles(list);
      } catch (err) {
        if (!cancel) setError(err instanceof Error ? err.message : "차트 실패");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [entry.coin, entry.firstTime, interval, barMs]);

  useEffect(() => {
    const el = ref.current;
    if (!el || candles.length === 0) return;

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

    const sideColor = entry.side === "LONG" ? "#34d399" : "#f87171";
    series.createPriceLine({
      price: entry.avgPx,
      color: sideColor,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "진입",
    });
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
    const firstT = snapTime(entry.firstTime);
    const lastT = snapTime(entry.lastTime);
    const marker = {
      position: entry.side === "LONG" ? ("belowBar" as const) : ("aboveBar" as const),
      color: sideColor,
      shape: entry.side === "LONG" ? ("arrowUp" as const) : ("arrowDown" as const),
    };
    createSeriesMarkers(
      series,
      firstT === lastT
        ? [{ ...marker, time: firstT, text: entry.side === "LONG" ? "롱 진입" : "숏 진입" }]
        : [
            { ...marker, time: firstT, text: "분할 시작" },
            { ...marker, time: lastT, text: "분할 끝" },
          ]
    );

    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles, entry, position]);

  const last = candles[candles.length - 1]?.close ?? null;
  const movePct =
    last != null && entry.avgPx > 0 ? ((last - entry.avgPx) / entry.avgPx) * 100 : null;
  const pnlPct = movePct == null ? null : entry.side === "LONG" ? movePct : -movePct;
  const durationMin = Math.round((entry.lastTime - entry.firstTime) / 60_000);
  const sideKo = entry.side === "LONG" ? "롱" : "숏";

  const lows = candles.map((c) => c.low);
  const highs = candles.map((c) => c.high);
  const before = candles.filter((c) => c.time * 1000 < entry.firstTime);
  const rangeLow = before.length ? Math.min(...before.map((c) => c.low)) : Math.min(...lows);
  const rangeHigh = before.length ? Math.max(...before.map((c) => c.high)) : Math.max(...highs);
  const rangePos =
    rangeHigh > rangeLow ? ((entry.avgPx - rangeLow) / (rangeHigh - rangeLow)) * 100 : null;

  return (
    <div className="rounded-md border border-zinc-700 bg-zinc-950/70 p-3">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1 text-sm">
          <p className="text-zinc-200">
            <span className="font-medium">{entry.label ?? entry.address.slice(0, 8)}</span>
            {" · "}
            <span className="font-medium text-zinc-100">{entry.coin}</span>{" "}
            <span className={entry.side === "LONG" ? "text-emerald-400" : "text-rose-400"}>
              {sideKo} {entry.kind === "FLIP" ? "(방향 전환)" : "진입"}
            </span>
          </p>
          <p className="text-xs leading-relaxed text-zinc-400">
            {formatKst(entry.firstTime)}부터
            {durationMin > 0 ? ` ${durationMin}분 동안 ${entry.fills}회 나눠` : ""}{" "}
            평균 {fmtPx(entry.avgPx)}에 {fmtUsd(entry.notional)} {sideKo}.
            {rangePos != null && (
              <>
                {" "}
                진입 전 구간의{" "}
                <span className="text-zinc-200">
                  {rangePos <= 25 ? "저점권" : rangePos >= 75 ? "고점권" : "중간"}(
                  {rangePos.toFixed(0)}%)
                </span>
                에서 들어감.
              </>
            )}
            {last != null && pnlPct != null && (
              <>
                {" "}
                현재가 {fmtPx(last)} → 진입 대비{" "}
                <span className={pnlPct >= 0 ? "text-emerald-400" : "text-rose-400"}>
                  {pnlPct >= 0 ? "+" : ""}
                  {pnlPct.toFixed(2)}%
                </span>
                .
              </>
            )}
          </p>
          {position && (
            <p className="text-xs text-zinc-500">
              지금 보유: {position.side} {Number(position.size).toPrecision(5)} · 평단{" "}
              {position.entry_price != null ? fmtPx(Number(position.entry_price)) : "-"}
              {position.leverage != null ? ` · ${position.leverage}x` : ""}
              {position.liquidation_px != null
                ? ` · 청산가 ${fmtPx(Number(position.liquidation_px))}`
                : ""}
            </p>
          )}
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
        <p className="py-16 text-center text-sm text-zinc-500">차트 불러오는 중…</p>
      ) : error ? (
        <p className="py-16 text-center text-sm text-rose-300">{error}</p>
      ) : (
        <div ref={ref} className="h-64 w-full" />
      )}
      <p className="mt-1 text-[10px] text-zinc-600">
        {interval} 캔들 · 점선 = 평균 진입가{position?.liquidation_px ? " · 노란 점선 = 청산가" : ""}
      </p>
    </div>
  );
}
