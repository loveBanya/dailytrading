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
import { importanceScore } from "@/lib/hyperliquid/perf";

type RangeKey = "24h" | "72h" | "7d";

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

function normalizeCoinInput(raw: string): string {
  return raw.trim().replace(/^\$/, "");
}

export function HlCoinBoardChart({
  traders,
  positions,
  entries,
  entriesLoading,
  onNeedEntries,
  onOpenTrader,
}: {
  traders: HlTrader[];
  positions: HlOpenPosition[];
  entries: HlRecentEntry[];
  entriesLoading: boolean;
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

  const [coinInput, setCoinInput] = useState("");
  const [coin, setCoin] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [range, setRange] = useState<RangeKey>("72h");
  const [interval, setInterval] = useState<HlCandleInterval>("1h");
  const [showOpenLines, setShowOpenLines] = useState(true);
  const [focusOnly, setFocusOnly] = useState(false);
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

  const filteredSuggestions = useMemo(() => {
    const q = normalizeCoinInput(coinInput).toLowerCase();
    if (!q) return coinSuggestions.slice(0, 12);
    return coinSuggestions
      .filter((c) => c.coin.toLowerCase().includes(q))
      .slice(0, 12);
  }, [coinInput, coinSuggestions]);

  const selectCoin = useCallback((next: string) => {
    const c = normalizeCoinInput(next);
    if (!c) return;
    setCoin(c);
    setCoinInput(c);
    setPickerOpen(false);
    setSelectedEntryKey(null);
  }, []);

  const focusTraderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of traders) {
      const exposure = positions
        .filter((p) => p.trader_id === t.id)
        .reduce((s, p) => s + Math.abs(Number(p.position_value ?? 0)), 0);
      const hasRecent = entries.some((e) => e.traderId === t.id);
      const imp = importanceScore(t, {
        hasRecentEntry: hasRecent,
        exposureUsd: exposure,
      });
      if (imp.tier === "focus") ids.add(t.id);
    }
    return ids;
  }, [traders, positions, entries]);

  const coinEntries = useMemo(() => {
    if (!coin) return [];
    const now = Date.now();
    const from = now - RANGE_MS[range];
    return entries
      .filter((e) => e.coin === coin && e.lastTime >= from)
      .filter((e) => !focusOnly || focusTraderIds.has(e.traderId))
      .sort((a, b) => b.notional - a.notional);
  }, [entries, coin, range, focusOnly, focusTraderIds]);

  const openOnCoin = useMemo(() => {
    if (!coin) return [];
    return positions
      .filter((p) => p.coin === coin)
      .filter((p) => !focusOnly || focusTraderIds.has(p.trader_id))
      .map((p) => ({
        ...p,
        value: Math.abs(Number(p.position_value ?? 0)),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [positions, coin, focusOnly, focusTraderIds]);

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
        const tr = traderById.get(p.trader_id);
        const name = tr?.label || shortAddr(tr?.address ?? p.trader_id);
        series.createPriceLine({
          price: Number(p.entry_price),
          color:
            p.side === "LONG"
              ? "rgba(52,211,153,0.45)"
              : "rgba(248,113,113,0.45)",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: `${name.slice(0, 10)} ${p.side === "LONG" ? "L" : "S"}`,
        });
      }
    }

    const byBar = new Map<
      string,
      {
        time: UTCTimestamp;
        side: "LONG" | "SHORT";
        count: number;
        top: HlRecentEntry;
      }
    >();
    for (const e of coinEntries) {
      const time = snapTime(candles, e.lastTime);
      const key = `${time}:${e.side}`;
      const cur = byBar.get(key);
      if (!cur) {
        byBar.set(key, { time, side: e.side, count: 1, top: e });
      } else {
        cur.count += 1;
        if (e.notional > cur.top.notional) cur.top = e;
      }
    }

    const markers = [...byBar.values()].map((g) => {
      const name =
        g.top.label ||
        shortAddr(traderById.get(g.top.traderId)?.address ?? g.top.address);
      const text =
        g.count > 1
          ? `${g.side === "LONG" ? "롱" : "숏"}×${g.count}`
          : `${name.slice(0, 8)} ${g.side === "LONG" ? "롱" : "숏"}`;
      return {
        time: g.time,
        position:
          g.side === "LONG" ? ("belowBar" as const) : ("aboveBar" as const),
        color: g.side === "LONG" ? "#34d399" : "#f87171",
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
  }, [candles, coin, coinEntries, openOnCoin, showOpenLines, traderById]);

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
      <div className="flex flex-wrap items-end gap-2 rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
        <div className="relative flex flex-col gap-1">
          <span className="text-[11px] text-zinc-500">코인 선택</span>
          <div className="flex gap-1">
            <input
              value={coinInput}
              onChange={(e) => {
                setCoinInput(e.target.value);
                setPickerOpen(true);
              }}
              onFocus={() => setPickerOpen(true)}
              onBlur={() => {
                window.setTimeout(() => setPickerOpen(false), 150);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  selectCoin(coinInput);
                }
                if (e.key === "Escape") setPickerOpen(false);
              }}
              placeholder="BTC, HYPE, xyz:NVDA…"
              className="w-44 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500/50 sm:w-52"
            />
            <button
              type="button"
              onClick={() => selectCoin(coinInput)}
              disabled={!normalizeCoinInput(coinInput)}
              className="rounded border border-emerald-700/50 px-2.5 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
            >
              보기
            </button>
          </div>
          {pickerOpen && filteredSuggestions.length > 0 && (
            <ul className="absolute left-0 top-full z-20 mt-1 max-h-48 w-full min-w-[14rem] overflow-auto rounded border border-zinc-700 bg-zinc-950 shadow-lg pretty-scroll">
              {filteredSuggestions.map(({ coin: c, n }) => (
                <li key={c}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectCoin(c)}
                    className={`flex w-full items-center justify-between px-2.5 py-1.5 text-left text-sm hover:bg-zinc-800 ${
                      c === coin ? "text-emerald-300" : "text-zinc-200"
                    }`}
                  >
                    <span>{c}</span>
                    {n > 0 ? (
                      <span className="text-[11px] text-zinc-500">
                        진입 {n}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-zinc-500">기간</span>
          <div className="flex gap-1">
            {(["24h", "72h", "7d"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`rounded border px-2 py-1 text-[11px] ${
                  range === r
                    ? "border-emerald-600/60 text-emerald-300"
                    : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-zinc-500">봉</span>
          <div className="flex gap-1">
            {INTERVALS.map((iv) => (
              <button
                key={iv}
                type="button"
                onClick={() => setInterval(iv)}
                className={`rounded border px-2 py-1 text-[11px] ${
                  interval === iv
                    ? "border-emerald-600/60 text-emerald-300"
                    : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {iv}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-1.5 self-end pb-1.5 text-[11px] text-zinc-500">
          <input
            type="checkbox"
            checked={showOpenLines}
            onChange={(e) => setShowOpenLines(e.target.checked)}
            className="size-3.5 accent-emerald-500"
          />
          보유 평단선
        </label>
        <label className="flex items-center gap-1.5 self-end pb-1.5 text-[11px] text-zinc-500">
          <input
            type="checkbox"
            checked={focusOnly}
            onChange={(e) => setFocusOnly(e.target.checked)}
            className="size-3.5 accent-sky-500"
          />
          주목 점수만
        </label>
      </div>

      {!coin ? (
        <p className="rounded-md border border-zinc-800 bg-zinc-950/40 py-16 text-center text-sm text-zinc-500">
          위에서 코인을 고른 뒤 <span className="text-zinc-300">보기</span>를
          누르세요.
          {entriesLoading ? " (진입 목록 불러오는 중…)" : ""}
        </p>
      ) : (
        <>
          <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-2">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 px-1">
              <p className="text-sm text-zinc-200">
                <span className="font-medium">{coin}</span>
                <span className="ml-2 text-xs text-zinc-500">
                  {interval} · {range} · 진입 {coinEntries.length}건
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
                초록↑ 롱 · 빨강↓ 숏 · 봉 전환은 캐시·디바운스 적용
              </p>
            </div>
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
                <div ref={chartRef} className="h-[420px] w-full sm:h-[520px]" />
              </>
            )}
          </div>

          {selected && (
            <div className="rounded-md border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm">
              <p className="text-zinc-200">
                <button
                  type="button"
                  onClick={() => onOpenTrader(selected.traderId)}
                  className="font-medium text-emerald-300 hover:underline"
                >
                  {selected.label || shortAddr(selected.address)}
                </button>
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
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="sticky top-0 border-b border-zinc-800 bg-zinc-950 text-[11px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-2 py-1.5 font-medium">시각</th>
                  <th className="px-2 py-1.5 font-medium">트레이더</th>
                  <th className="px-2 py-1.5 font-medium">방향</th>
                  <th className="px-2 py-1.5 font-medium">규모</th>
                  <th className="px-2 py-1.5 font-medium">평균가</th>
                </tr>
              </thead>
              <tbody>
                {coinEntries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-2 py-6 text-center text-zinc-500"
                    >
                      이 구간에 표시할 진입이 없습니다.
                    </td>
                  </tr>
                ) : (
                  coinEntries.map((e) => (
                    <tr
                      key={entryKey(e)}
                      onClick={() =>
                        setSelectedEntryKey((k) =>
                          k === entryKey(e) ? null : entryKey(e)
                        )
                      }
                      className={`cursor-pointer border-b border-zinc-900/80 text-zinc-300 hover:bg-zinc-800/40 ${
                        selectedEntryKey === entryKey(e)
                          ? "bg-zinc-800/60"
                          : ""
                      }`}
                    >
                      <td className="px-2 py-1.5 text-xs text-zinc-500">
                        {formatKst(e.lastTime)}
                      </td>
                      <td className="px-2 py-1.5">
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            onOpenTrader(e.traderId);
                          }}
                          className="text-left hover:text-emerald-300 hover:underline"
                        >
                          {e.label || shortAddr(e.address)}
                        </button>
                      </td>
                      <td
                        className={`px-2 py-1.5 ${
                          e.side === "LONG"
                            ? "text-emerald-400"
                            : "text-rose-400"
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
