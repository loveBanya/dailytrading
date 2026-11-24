"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  HlTrader,
} from "@/lib/hyperliquid/types";
import { formatKst } from "@/lib/utils/format";
import {
  importanceScore,
  type HlImportance,
} from "@/lib/hyperliquid/perf";
import { ZoomSafeChartBox } from "./ZoomSafeChartBox";

type RangeKey = "24h" | "72h" | "7d";
/** 주목=좋은 기록 위주, 전체=참고도 흐리게 포함 */
type TraderView = "focus" | "all";

const RANGE_MS: Record<RangeKey, number> = {
  "24h": 24 * 3600_000,
  "72h": 72 * 3600_000,
  "7d": 7 * 86400_000,
};

const INTERVALS: HlCandleInterval[] = ["5m", "15m", "1h", "4h"];

function shortAddr(a: string): string {
  if (a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function snapTime(candles: HlCandle[], ms: number): UTCTimestamp {
  const sec = Math.floor(ms / 1000);
  let best = candles[0]!.time;
  for (const c of candles) {
    if (c.time <= sec) best = c.time;
    else break;
  }
  return best as UTCTimestamp;
}

function kstTick(sec: number): string {
  return new Date(sec * 1000).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function traderName(
  e: { label?: string | null; address?: string; traderId?: string },
  byId: Map<string, HlTrader>
): string {
  if (e.label) return e.label;
  if (e.traderId) {
    const t = byId.get(e.traderId);
    if (t?.label) return t.label;
    if (t?.address) return shortAddr(t.address);
  }
  if (e.address) return shortAddr(e.address);
  return "트레이더";
}

export function HlCoinBoardChart({
  traders,
  positions,
  entries,
  entriesLoading,
  pinnedIds,
  onNeedEntries,
  onOpenTrader,
}: {
  traders: HlTrader[];
  positions: HlOpenPosition[];
  entries: HlRecentEntry[];
  entriesLoading: boolean;
  pinnedIds: Set<string>;
  onNeedEntries: () => void;
  onOpenTrader: (id: string) => void;
}) {
  const traderById = useMemo(
    () => new Map(traders.map((t) => [t.id, t])),
    [traders]
  );

  const coinSuggestions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      counts.set(e.coin, (counts.get(e.coin) ?? 0) + 1);
    }
    for (const p of positions) {
      counts.set(p.coin, counts.get(p.coin) ?? 0);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 40)
      .map(([coin, n]) => ({ coin, n }));
  }, [entries, positions]);

  const [coin, setCoin] = useState("");
  const [coinMore, setCoinMore] = useState(false);
  const [range, setRange] = useState<RangeKey>("72h");
  const [interval, setInterval] = useState<HlCandleInterval>("1h");
  const [showOpenLines, setShowOpenLines] = useState(true);
  const [traderView, setTraderView] = useState<TraderView>("focus");
  const [candles, setCandles] = useState<HlCandle[]>([]);
  const [loading, setLoading] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqSeq = useRef(0);

  useEffect(() => {
    onNeedEntries();
  }, [onNeedEntries]);

  useEffect(() => {
    if (!coin && coinSuggestions.length > 0) {
      setCoin(coinSuggestions[0]!.coin);
    }
  }, [coin, coinSuggestions]);

  const selectCoin = useCallback((next: string) => {
    setCoin(next);
    setSelectedEntryKey(null);
  }, []);

  const visibleCoinButtons = coinMore
    ? coinSuggestions
    : coinSuggestions.slice(0, 14);

  const traderMeta = useMemo(() => {
    const m = new Map<string, { imp: HlImportance; focus: boolean }>();
    for (const t of traders) {
      const exposure = positions
        .filter((p) => p.trader_id === t.id)
        .reduce((s, p) => s + Math.abs(Number(p.position_value ?? 0)), 0);
      const hasRecent = entries.some((e) => e.traderId === t.id);
      const pinned = pinnedIds.has(t.id);
      const imp = importanceScore(t, {
        pinned,
        hasRecentEntry: hasRecent,
        exposureUsd: exposure,
      });
      m.set(t.id, {
        imp,
        focus: pinned || imp.tier === "focus",
      });
    }
    return m;
  }, [traders, positions, entries, pinnedIds]);

  const isFocus = useCallback(
    (traderId: string) => traderMeta.get(traderId)?.focus === true,
    [traderMeta]
  );

  const coinEntries = useMemo(() => {
    if (!coin) return [];
    const now = Date.now();
    const from = now - RANGE_MS[range];
    return entries
      .filter((e) => e.coin === coin && e.lastTime >= from)
      .filter((e) => traderView === "all" || isFocus(e.traderId))
      .sort((a, b) => {
        const fa = isFocus(a.traderId) ? 1 : 0;
        const fb = isFocus(b.traderId) ? 1 : 0;
        if (fa !== fb) return fb - fa;
        const sa = traderMeta.get(a.traderId)?.imp.score ?? 0;
        const sb = traderMeta.get(b.traderId)?.imp.score ?? 0;
        if (sa !== sb) return sb - sa;
        return b.notional - a.notional;
      });
  }, [entries, coin, range, traderView, isFocus, traderMeta]);

  const openOnCoin = useMemo(() => {
    if (!coin) return [];
    return positions
      .filter((p) => p.coin === coin)
      .filter((p) => traderView === "all" || isFocus(p.trader_id))
      .map((p) => ({
        ...p,
        value: Math.abs(Number(p.position_value ?? 0)),
        focus: isFocus(p.trader_id),
        score: traderMeta.get(p.trader_id)?.imp.score ?? 0,
      }))
      .sort((a, b) => {
        if (a.focus !== b.focus) return a.focus ? -1 : 1;
        if (a.score !== b.score) return b.score - a.score;
        return b.value - a.value;
      })
      .slice(0, 12);
  }, [positions, coin, traderView, isFocus, traderMeta]);

  /** 이 코인에 등장한 트레이더 요약 (누가 누구인지) */
  const roster = useMemo(() => {
    if (!coin) return [];
    const ids = new Set<string>();
    for (const e of coinEntries) ids.add(e.traderId);
    for (const p of openOnCoin) ids.add(p.trader_id);
    return [...ids]
      .map((id) => {
        const t = traderById.get(id);
        const meta = traderMeta.get(id);
        const open = openOnCoin.filter((p) => p.trader_id === id);
        const recent = coinEntries.filter((e) => e.traderId === id);
        return {
          id,
          name: t?.label || shortAddr(t?.address ?? id),
          focus: meta?.focus ?? false,
          score: meta?.imp.score ?? 0,
          label: meta?.imp.label ?? "참고",
          open,
          recentCount: recent.length,
        };
      })
      .sort((a, b) => {
        if (a.focus !== b.focus) return a.focus ? -1 : 1;
        return b.score - a.score;
      });
  }, [coin, coinEntries, openOnCoin, traderById, traderMeta]);

  useEffect(() => {
    if (!coin) {
      setCandles([]);
      setError(null);
      setLoading(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const end = Date.now();
    const start = end - RANGE_MS[range];
    const key = candleCacheKey(coin, interval, start, end);

    const cached =
      getCachedCandles(key, interval) ?? getStaleCandles(key) ?? null;
    if (cached && cached.length > 0) {
      setCandles(cached);
      setFromCache(true);
      setError(null);
      setLoading(false);
    } else {
      setLoading(true);
    }

    debounceRef.current = setTimeout(() => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const seq = ++reqSeq.current;

      void (async () => {
        try {
          const fresh = getCachedCandles(key, interval);
          if (fresh) {
            if (seq !== reqSeq.current) return;
            setCandles(fresh);
            setFromCache(true);
            setLoading(false);
            setError(null);
            return;
          }

          if (!cached) setLoading(true);
          const res = await fetch(
            `/api/hl-traders/candles?coin=${encodeURIComponent(coin)}&interval=${interval}&start=${start}&end=${end}`,
            { signal: ac.signal, cache: "no-store" }
          );
          const data = (await res.json()) as {
            candles?: HlCandle[];
            error?: string;
            cached?: boolean;
            stale?: boolean;
            warning?: string;
          };
          if (seq !== reqSeq.current) return;
          if (data.error && !(data.candles && data.candles.length)) {
            throw new Error(data.error);
          }
          const list = data.candles ?? [];
          setCachedCandles(key, list);
          setCandles(list);
          setFromCache(Boolean(data.cached || data.stale));
          setError(data.warning ? `제한·지연: 캐시 표시 중` : null);
        } catch (err) {
          if (ac.signal.aborted) return;
          if (seq !== reqSeq.current) return;
          const stale = getStaleCandles(key);
          if (stale && stale.length > 0) {
            setCandles(stale);
            setFromCache(true);
            setError("요청 제한 — 이전 캐시로 표시");
          } else {
            setError(err instanceof Error ? err.message : "차트 실패");
          }
        } finally {
          if (seq === reqSeq.current) setLoading(false);
        }
      })();
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [coin, range, interval]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = chartRef.current;
    if (!el || candles.length === 0 || !coin) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#71717a",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(63,63,70,0.25)" },
        horzLines: { color: "rgba(63,63,70,0.35)" },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: number) => kstTick(time),
      },
      localization: { timeFormatter: (time: number) => kstTick(time) },
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

    if (showOpenLines) {
      for (const p of openOnCoin) {
        if (p.entry_price == null || !(Number(p.entry_price) > 0)) continue;
        const focus = isFocus(p.trader_id);
        const tr = traderById.get(p.trader_id);
        const name = tr?.label || shortAddr(tr?.address ?? p.trader_id);
        const tag = focus ? "★" : "·";
        series.createPriceLine({
          price: Number(p.entry_price),
          color:
            p.side === "LONG"
              ? focus
                ? "rgba(52,211,153,0.85)"
                : "rgba(52,211,153,0.22)"
              : focus
                ? "rgba(248,113,113,0.85)"
                : "rgba(248,113,113,0.22)",
          lineWidth: focus ? 2 : 1,
          lineStyle: focus ? LineStyle.Dashed : LineStyle.Dotted,
          axisLabelVisible: focus,
          title: `${tag}${name.slice(0, 8)} ${p.side === "LONG" ? "L" : "S"}`,
        });
      }
    }

    type BarGroup = {
      time: UTCTimestamp;
      side: "LONG" | "SHORT";
      count: number;
      focusCount: number;
      top: HlRecentEntry;
      topFocus: boolean;
    };
    const byBar = new Map<string, BarGroup>();
    for (const e of coinEntries) {
      const time = snapTime(candles, e.lastTime);
      const focus = isFocus(e.traderId);
      const key = `${time}:${e.side}`;
      const cur = byBar.get(key);
      if (!cur) {
        byBar.set(key, {
          time,
          side: e.side,
          count: 1,
          focusCount: focus ? 1 : 0,
          top: e,
          topFocus: focus,
        });
      } else {
        cur.count += 1;
        if (focus) cur.focusCount += 1;
        const betterFocus = focus && !cur.topFocus;
        const sameTier =
          focus === cur.topFocus && e.notional > cur.top.notional;
        if (betterFocus || sameTier) {
          cur.top = e;
          cur.topFocus = focus;
        }
      }
    }

    const markers = [...byBar.values()].map((g) => {
      const name = traderName(g.top, traderById);
      const sideKo = g.side === "LONG" ? "롱" : "숏";
      const prefix = g.topFocus ? "★" : "";
      let text: string;
      if (g.count > 1 && g.focusCount > 0 && g.focusCount < g.count) {
        text = `${prefix}${name.slice(0, 7)} ${sideKo} ·주목${g.focusCount}`;
      } else if (g.count > 1) {
        text = `${prefix}${name.slice(0, 7)} ${sideKo}×${g.count}`;
      } else {
        text = `${prefix}${name.slice(0, 9)} ${sideKo}`;
      }
      const strong = g.topFocus || g.focusCount > 0;
      return {
        time: g.time,
        position:
          g.side === "LONG" ? ("belowBar" as const) : ("aboveBar" as const),
        color: strong
          ? g.side === "LONG"
            ? "#34d399"
            : "#f87171"
          : g.side === "LONG"
            ? "rgba(52,211,153,0.35)"
            : "rgba(248,113,113,0.35)",
        shape:
          g.side === "LONG" ? ("arrowUp" as const) : ("arrowDown" as const),
        text,
      };
    });
    createSeriesMarkers(
      series,
      markers.sort((a, b) => Number(a.time) - Number(b.time))
    );

    chart.timeScale().fitContent();
    return () => {
      chart.remove();
    };
  }, [
    candles,
    coin,
    coinEntries,
    openOnCoin,
    showOpenLines,
    traderById,
    isFocus,
  ]);

  const entryKey = (e: HlRecentEntry) =>
    `${e.traderId}-${e.coin}-${e.side}-${e.firstTime}`;

  const selected = selectedEntryKey
    ? coinEntries.find((e) => entryKey(e) === selectedEntryKey) ?? null
    : null;

  if (traders.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        관심 트레이더를 먼저 추가하세요.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] text-zinc-500">코인</span>
          {visibleCoinButtons.length === 0 ? (
            <span className="text-[11px] text-zinc-600">
              {entriesLoading ? "불러오는 중…" : "선택 가능한 코인 없음"}
            </span>
          ) : (
            visibleCoinButtons.map(({ coin: c, n }) => (
              <button
                key={c}
                type="button"
                onClick={() => selectCoin(c)}
                className={`rounded border px-2 py-0.5 text-[11px] ${
                  coin === c
                    ? "border-emerald-600/60 text-emerald-300"
                    : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {c}
                {n > 0 ? (
                  <span className="ml-1 text-zinc-600">{n}</span>
                ) : null}
              </button>
            ))
          )}
          {coinSuggestions.length > 14 ? (
            <button
              type="button"
              onClick={() => setCoinMore((v) => !v)}
              className="rounded border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-500 hover:text-zinc-300"
            >
              {coinMore ? "접기" : `더보기 +${coinSuggestions.length - 14}`}
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-zinc-500">기간</span>
            {(["24h", "72h", "7d"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`rounded border px-2 py-0.5 text-[11px] ${
                  range === r
                    ? "border-emerald-600/60 text-emerald-300"
                    : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-zinc-500">봉</span>
            {INTERVALS.map((iv) => (
              <button
                key={iv}
                type="button"
                onClick={() => setInterval(iv)}
                className={`rounded border px-2 py-0.5 text-[11px] ${
                  interval === iv
                    ? "border-emerald-600/60 text-emerald-300"
                    : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {iv}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <input
              type="checkbox"
              checked={showOpenLines}
              onChange={(e) => setShowOpenLines(e.target.checked)}
              className="size-3.5 accent-emerald-500"
            />
            보유 평단선
          </label>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-zinc-500">표시</span>
            {(
              [
                ["focus", "주목만"],
                ["all", "전체(+참고)"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTraderView(k)}
                className={`rounded border px-2 py-0.5 text-[11px] ${
                  traderView === k
                    ? "border-sky-600/60 text-sky-300"
                    : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!coin ? (
        <p className="rounded-md border border-zinc-800 bg-zinc-950/40 py-16 text-center text-sm text-zinc-500">
          코인 버튼을 눌러 차트를 보세요.
          {entriesLoading ? " (목록 불러오는 중…)" : ""}
        </p>
      ) : (
        <>
          <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-2">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 px-1">
              <p className="text-sm text-zinc-200">
                <span className="font-medium">{coin}</span>
                <span className="ml-2 text-xs text-zinc-500">
                  {interval} · {range} ·{" "}
                  {traderView === "focus" ? "주목" : "전체"} 진입{" "}
                  {coinEntries.length}건
                  {openOnCoin.length > 0 ? ` · 보유 ${openOnCoin.length}` : ""}
                </span>
                {loading ? (
                  <span className="ml-2 text-[11px] text-amber-400/80">
                    갱신 중…
                  </span>
                ) : fromCache ? (
                  <span className="ml-2 text-[11px] text-zinc-600">캐시</span>
                ) : null}
              </p>
              <p className="text-[11px] text-zinc-600">
                ★주목 진하게 · 참고 흐리게 · 초록↑롱 · 빨강↓숏
              </p>
            </div>

            {roster.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-1.5 px-1">
                {roster.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onOpenTrader(r.id)}
                    title={`${r.label} · 점수 ${r.score}${
                      r.open.length
                        ? ` · 보유 ${r.open.map((p) => p.side).join("/")}`
                        : ""
                    }`}
                    className={`rounded border px-2 py-0.5 text-[11px] ${
                      r.focus
                        ? "border-sky-700/70 bg-sky-950/40 text-sky-200"
                        : "border-zinc-800 text-zinc-500"
                    }`}
                  >
                    {r.focus ? "★ " : ""}
                    {r.name}
                    <span className="ml-1 tabular-nums text-zinc-600">
                      {r.score}
                    </span>
                    {r.open.length > 0 ? (
                      <span
                        className={`ml-1 ${
                          r.open[0]!.side === "LONG"
                            ? "text-emerald-400/80"
                            : "text-rose-400/80"
                        }`}
                      >
                        {r.open[0]!.side === "LONG" ? "L" : "S"}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
            {error && candles.length === 0 ? (
              <p className="py-24 text-center text-sm text-rose-300">{error}</p>
            ) : candles.length === 0 && loading ? (
              <p className="py-24 text-center text-sm text-zinc-500">
                차트 불러오는 중…
              </p>
            ) : candles.length === 0 ? (
              <p className="py-24 text-center text-sm text-zinc-500">
                캔들이 없습니다.
              </p>
            ) : (
              <>
                {error ? (
                  <p className="mb-1 px-1 text-[11px] text-amber-400/80">
                    {error}
                  </p>
                ) : null}
                <ZoomSafeChartBox
                  ref={chartRef}
                  className="w-full"
                  height={520}
                />
              </>
            )}
          </div>

          {selected && (
            <div className="rounded-md border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm">
              <p className="text-zinc-200">
                {isFocus(selected.traderId) ? (
                  <span className="mr-1.5 rounded border border-sky-700/60 bg-sky-950/50 px-1.5 py-0.5 text-[10px] text-sky-300">
                    ★주목
                  </span>
                ) : (
                  <span className="mr-1.5 rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-500">
                    참고
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onOpenTrader(selected.traderId)}
                  className="font-medium text-emerald-300 hover:underline"
                >
                  {traderName(selected, traderById)}
                </button>
                <span className="ml-1.5 tabular-nums text-xs text-zinc-500">
                  점수 {traderMeta.get(selected.traderId)?.imp.score ?? "—"}
                </span>
                {" · "}
                <span
                  className={
                    selected.side === "LONG"
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }
                >
                  {selected.side}
                </span>{" "}
                {fmtUsd(selected.notional)} @{" "}
                {selected.avgPx.toLocaleString()}
              </p>
              <p className="text-xs text-zinc-500">
                {formatKst(selected.firstTime)}
                {selected.fills > 1 ? ` · ${selected.fills}회 분할` : ""}
              </p>
            </div>
          )}

          <div className="max-h-56 overflow-auto pretty-scroll rounded-md border border-zinc-800">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="sticky top-0 border-b border-zinc-800 bg-zinc-950 text-[11px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-2 py-1.5 font-medium">시각</th>
                  <th className="px-2 py-1.5 font-medium">구분</th>
                  <th className="px-2 py-1.5 font-medium">트레이더</th>
                  <th className="px-2 py-1.5 font-medium">점수</th>
                  <th className="px-2 py-1.5 font-medium">방향</th>
                  <th className="px-2 py-1.5 font-medium">규모</th>
                  <th className="px-2 py-1.5 font-medium">평균가</th>
                </tr>
              </thead>
              <tbody>
                {coinEntries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-2 py-6 text-center text-zinc-500"
                    >
                      {traderView === "focus"
                        ? "이 구간에 주목 트레이더 진입이 없습니다. 「전체(+참고)」로 바꿔 보세요."
                        : "이 구간에 표시할 진입이 없습니다."}
                    </td>
                  </tr>
                ) : (
                  coinEntries.map((e) => {
                    const focus = isFocus(e.traderId);
                    const score = traderMeta.get(e.traderId)?.imp.score;
                    return (
                      <tr
                        key={entryKey(e)}
                        onClick={() =>
                          setSelectedEntryKey((k) =>
                            k === entryKey(e) ? null : entryKey(e)
                          )
                        }
                        className={`cursor-pointer border-b border-zinc-900/80 hover:bg-zinc-800/40 ${
                          selectedEntryKey === entryKey(e)
                            ? "bg-zinc-800/60"
                            : ""
                        } ${focus ? "text-zinc-200" : "text-zinc-500"}`}
                      >
                        <td className="px-2 py-1.5 text-xs text-zinc-500">
                          {formatKst(e.lastTime)}
                        </td>
                        <td className="px-2 py-1.5 text-[11px]">
                          {focus ? (
                            <span className="text-sky-400">★주목</span>
                          ) : (
                            <span className="text-zinc-600">참고</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              onOpenTrader(e.traderId);
                            }}
                            className={`text-left hover:underline ${
                              focus
                                ? "hover:text-emerald-300"
                                : "hover:text-zinc-300"
                            }`}
                          >
                            {traderName(e, traderById)}
                          </button>
                        </td>
                        <td className="px-2 py-1.5 tabular-nums text-xs text-zinc-500">
                          {score ?? "—"}
                        </td>
                        <td
                          className={`px-2 py-1.5 ${
                            e.side === "LONG"
                              ? focus
                                ? "text-emerald-400"
                                : "text-emerald-700"
                              : focus
                                ? "text-rose-400"
                                : "text-rose-800"
                          }`}
                        >
                          {e.side}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums">
                          {fmtUsd(e.notional)}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums text-zinc-400">
                          {e.avgPx.toLocaleString(undefined, {
                            maximumSignificantDigits: 6,
                          })}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
