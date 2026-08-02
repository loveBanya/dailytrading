"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ScanFilters,
  ScanResult,
  ScreenerCandidate,
  StrategyId,
} from "@/lib/screener/types";
import { DEFAULT_FILTERS, STRATEGY_LABELS } from "@/lib/screener/types";
import { exchangeLabel } from "@/lib/screener/filters";
import { formatKst } from "@/lib/utils/format";
import { ScreenerDetail } from "./ScreenerDetail";

type SortKey = keyof ScreenerCandidate | "rank";

const REFRESH_OPTS = [
  { value: 0, label: "수동" },
  { value: 30, label: "30초" },
  { value: 60, label: "1분" },
  { value: 180, label: "3분" },
  { value: 300, label: "5분" },
];

const STRATEGY_OPTS = Object.entries(STRATEGY_LABELS) as [StrategyId, string][];

function stars(n: number): string {
  return "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n));
}

function dirCls(d: string): string {
  if (d.startsWith("LONG")) return "text-emerald-400";
  if (d.startsWith("SHORT")) return "text-rose-400";
  return "text-zinc-400";
}

export function ScreenerPanel() {
  const [filters, setFilters] = useState<ScanFilters>({
    ...DEFAULT_FILTERS,
    topN: 40,
  });
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshSec, setRefreshSec] = useState(60);
  const [sortKey, setSortKey] = useState<SortKey>("scoreTotal");
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<ScreenerCandidate | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [exclusions, setExclusions] = useState<
    Array<{ id: string; exchange: string; symbol: string; reason: string | null }>
  >([]);
  const [favorites, setFavorites] = useState<
    Array<{
      id: string;
      exchange: string;
      symbol: string;
      favorited_at: string;
      snapshot: Record<string, unknown>;
    }>
  >([]);
  const [showLists, setShowLists] = useState(false);
  const [paperMsg, setPaperMsg] = useState<string | null>(null);
  const [excludeInput, setExcludeInput] = useState("");

  const loadMeta = useCallback(async () => {
    try {
      const [exRes, favRes] = await Promise.all([
        fetch("/api/screener/exclusions"),
        fetch("/api/screener/favorites"),
      ]);
      const ex = (await exRes.json()) as { items?: typeof exclusions };
      const fav = (await favRes.json()) as { items?: typeof favorites };
      if (ex.items) setExclusions(ex.items);
      if (fav.items) setFavorites(fav.items);
    } catch {
      /* tables may not exist yet */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        exchange: filters.exchange,
        timeframe: filters.timeframe,
        direction: filters.direction,
        minTurnover24h: String(filters.minTurnover24h),
        minVolMult: String(filters.minVolMult),
        minScore: String(filters.minScore),
        minStars: String(filters.minStars),
        maxChange15m: String(filters.maxChange15m),
        maxDrop15m: String(filters.maxDrop15m),
        rsiMin: String(filters.rsiMin),
        rsiMax: String(filters.rsiMax),
        minRr: String(filters.minRr),
        topN: String(filters.topN),
      });
      if (filters.strategies.length) {
        qs.set("strategies", filters.strategies.join(","));
      }
      const res = await fetch(`/api/screener/scan?${qs}`);
      const data = (await res.json()) as ScanResult & { error?: string };
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "스캔 실패");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (!refreshSec) return;
    const id = setInterval(() => void load(), refreshSec * 1000);
    return () => clearInterval(id);
  }, [refreshSec, load]);

  const favKeys = useMemo(
    () => new Set(favorites.map((f) => `${f.exchange}:${f.symbol}`)),
    [favorites]
  );

  const rows = useMemo(() => {
    const list = [...(result?.candidates ?? [])];
    list.sort((a, b) => {
      const av = a[sortKey as keyof ScreenerCandidate];
      const bv = b[sortKey as keyof ScreenerCandidate];
      const an = typeof av === "number" ? av : String(av ?? "");
      const bn = typeof bv === "number" ? bv : String(bv ?? "");
      if (typeof an === "number" && typeof bn === "number") {
        return sortAsc ? an - bn : bn - an;
      }
      return sortAsc
        ? String(an).localeCompare(String(bn))
        : String(bn).localeCompare(String(an));
    });
    return list;
  }, [result, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  function toggleStrategy(id: StrategyId) {
    setFilters((f) => {
      const has = f.strategies.includes(id);
      return {
        ...f,
        strategies: has
          ? f.strategies.filter((x) => x !== id)
          : [...f.strategies, id],
      };
    });
  }

  function setMacdStrategies() {
    setFilters((f) => ({
      ...f,
      strategies: ["golden_cross", "dead_cross", "macd_momentum"],
      minScore: 50,
    }));
  }

  async function addExclusionManual() {
    const raw = excludeInput.trim().toUpperCase();
    if (!raw) return;
    const symbol = raw.endsWith("USDT") ? raw : `${raw}USDT`;
    await fetch("/api/screener/exclusions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exchange: filters.exchange === "all" ? "binance" : filters.exchange,
        symbol,
        reason: "수동 제외",
      }),
    });
    setExcludeInput("");
    await loadMeta();
    await load();
  }

  async function removeExclusion(id: string) {
    await fetch(`/api/screener/exclusions?id=${id}`, { method: "DELETE" });
    await loadMeta();
    await load();
  }

  async function startPaper(
    trackType: "scan" | "macd",
    macdOnly = false
  ) {
    const candidates = result?.candidates ?? [];
    setPaperMsg(null);
    const res = await fetch("/api/screener/paper", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "start",
        trackType,
        macdOnly,
        candidates,
      }),
    });
    const data = (await res.json()) as { started?: number; error?: string };
    if (data.error) setPaperMsg(data.error);
    else
      setPaperMsg(
        `${trackType === "macd" ? "MACD" : "스캔"} 가상투자 ${data.started ?? 0}건 시작 · 스크리너 성과에서 다음 추적 시 수익률 확인`
      );
  }

  const inputCls =
    "rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-500">
          공개 선물 데이터로 롱/숏 관찰 후보를 점수화합니다. 자동주문 없음.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={refreshSec}
            onChange={(e) => setRefreshSec(Number(e.target.value))}
            className={inputCls}
          >
            {REFRESH_OPTS.map((o) => (
              <option key={o.value} value={o.value}>
                새로고침 {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400"
          >
            필터 {showFilters ? "숨기기" : "보기"}
          </button>
          <button
            type="button"
            onClick={() => setShowLists((v) => !v)}
            className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400"
          >
            제외·즐찾 ({exclusions.length}/{favorites.length})
          </button>
          <button
            type="button"
            onClick={() => setMacdStrategies()}
            className="rounded border border-violet-500/40 px-2 py-1 text-xs text-violet-300"
          >
            MACD 필터
          </button>
          <button
            type="button"
            disabled={!result?.candidates.length}
            onClick={() => void startPaper("scan")}
            className="rounded border border-sky-500/40 px-2 py-1 text-xs text-sky-300 disabled:opacity-40"
          >
            후보 가상투자
          </button>
          <button
            type="button"
            disabled={!result?.candidates.length}
            onClick={() => void startPaper("macd", true)}
            className="rounded border border-violet-500/40 px-2 py-1 text-xs text-violet-300 disabled:opacity-40"
          >
            MACD 가상투자
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {loading ? "스캔 중…" : "수동 새로고침"}
          </button>
        </div>
      </div>

      {paperMsg && (
        <p className="text-xs text-sky-300/90">{paperMsg}</p>
      )}

      {showLists && (
        <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-medium text-zinc-400">
              제외 코인
            </h3>
            <div className="mb-2 flex gap-1">
              <input
                value={excludeInput}
                onChange={(e) => setExcludeInput(e.target.value)}
                placeholder="예: 1000PEPE 또는 XYZUSDT"
                className={`${inputCls} flex-1`}
              />
              <button
                type="button"
                onClick={() => void addExclusionManual()}
                className="rounded border border-zinc-700 px-2 text-xs text-zinc-300"
              >
                추가
              </button>
            </div>
            <ul className="pretty-scroll max-h-40 space-y-1 overflow-y-auto text-xs">
              {exclusions.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-2 text-zinc-400"
                >
                  <span>
                    {e.symbol}
                    <span className="ml-1 text-zinc-600">{e.exchange}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void removeExclusion(e.id)}
                    className="text-rose-400/80 hover:text-rose-300"
                  >
                    해제
                  </button>
                </li>
              ))}
              {exclusions.length === 0 && (
                <li className="text-zinc-600">제외 목록 비어 있음</li>
              )}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium text-zinc-400">
              즐겨찾기 (등록 시각·당시 상태)
            </h3>
            <ul className="pretty-scroll max-h-40 space-y-1.5 overflow-y-auto text-xs">
              {favorites.map((f) => (
                <li
                  key={f.id}
                  className="rounded border border-zinc-800/80 px-2 py-1"
                >
                  <p className="text-zinc-200">
                    {f.symbol.replace(/USDT$/i, "")}
                    <span className="ml-1 text-zinc-600">{f.exchange}</span>
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {formatKst(f.favorited_at)} KST
                    {f.snapshot?.direction != null &&
                      ` · ${String(f.snapshot.direction)}`}
                    {f.snapshot?.price != null &&
                      ` · $${String(f.snapshot.price)}`}
                    {f.snapshot?.macdState != null &&
                      ` · MACD ${String(f.snapshot.macdState)}`}
                    {f.snapshot?.scoreTotal != null &&
                      ` · ${String(f.snapshot.scoreTotal)}점`}
                  </p>
                </li>
              ))}
              {favorites.length === 0 && (
                <li className="text-zinc-600">즐겨찾기 없음</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {showFilters && (
        <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          <div className="flex flex-wrap gap-2">
            <select
              value={filters.exchange}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  exchange: e.target.value as ScanFilters["exchange"],
                }))
              }
              className={inputCls}
            >
              <option value="binance">바이낸스</option>
              <option value="bybit">바이비트</option>
              <option value="all">전체</option>
            </select>
            <select
              value={filters.timeframe}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  timeframe: e.target.value as ScanFilters["timeframe"],
                }))
              }
              className={inputCls}
            >
              <option value="5m">5분</option>
              <option value="15m">15분</option>
              <option value="1h">1시간</option>
            </select>
            <select
              value={filters.direction}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  direction: e.target.value as ScanFilters["direction"],
                }))
              }
              className={inputCls}
            >
              <option value="ALL">롱+숏</option>
              <option value="LONG">롱만</option>
              <option value="SHORT">숏만</option>
            </select>
            <label className="text-xs text-zinc-500">
              최소거래대금
              <input
                type="number"
                value={filters.minTurnover24h}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    minTurnover24h: Number(e.target.value),
                  }))
                }
                className={`${inputCls} ml-1 w-28`}
              />
            </label>
            <label className="text-xs text-zinc-500">
              거래량배율
              <select
                value={filters.minVolMult}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    minVolMult: Number(e.target.value),
                  }))
                }
                className={`${inputCls} ml-1`}
              >
                {[1.5, 2, 2.5, 3, 5].map((v) => (
                  <option key={v} value={v}>
                    {v}배
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-500">
              최소점수
              <input
                type="number"
                value={filters.minScore}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    minScore: Number(e.target.value),
                  }))
                }
                className={`${inputCls} ml-1 w-16`}
              />
            </label>
            <label className="text-xs text-zinc-500">
              별점≥
              <input
                type="number"
                min={1}
                max={5}
                value={filters.minStars}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    minStars: Number(e.target.value),
                  }))
                }
                className={`${inputCls} ml-1 w-14`}
              />
            </label>
            <label className="text-xs text-zinc-500">
              분석수
              <input
                type="number"
                value={filters.topN}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    topN: Number(e.target.value),
                  }))
                }
                className={`${inputCls} ml-1 w-16`}
              />
            </label>
            <label className="text-xs text-zinc-500">
              최소RR
              <input
                type="number"
                step="0.1"
                value={filters.minRr}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    minRr: Number(e.target.value),
                  }))
                }
                className={`${inputCls} ml-1 w-16`}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STRATEGY_OPTS.map(([id, label]) => {
              const on = filters.strategies.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleStrategy(id)}
                  className={`rounded border px-2 py-0.5 text-[11px] ${
                    on
                      ? "border-sky-500/50 bg-sky-500/10 text-sky-300"
                      : "border-zinc-800 text-zinc-500"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-amber-300/80">{error}</p>}
      {result && (
        <p className="text-xs text-zinc-600">
          스캔 {formatKst(result.meta.scannedAt)} KST · 유동성 종목{" "}
          {result.meta.universeSize} · 분석 {result.meta.analyzed} · 후보{" "}
          {rows.length}
          {result.meta.cache.tickersAgeSec != null
            ? ` · 티커 캐시 ${result.meta.cache.tickersAgeSec}s`
            : ""}
          {result.meta.errors.length
            ? ` · 부분오류 ${result.meta.errors.length}`
            : ""}
        </p>
      )}

      <div className="pretty-scroll overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full min-w-[1400px] text-left text-xs">
          <thead className="bg-zinc-950 text-zinc-500">
            <tr>
              {(
                [
                  ["rank", "#"],
                  ["symbol", "심볼"],
                  ["direction", "방향"],
                  ["stars", "별"],
                  ["scoreTotal", "종합"],
                  ["scoreLong", "롱"],
                  ["scoreShort", "숏"],
                  ["strongestStrategy", "전략"],
                  ["change15m", "15m%"],
                  ["change1h", "1h%"],
                  ["change24h", "24h%"],
                  ["volMult", "Vol×"],
                  ["turnoverMult", "대금×"],
                  ["rsi", "RSI"],
                  ["oiChangePct", "OI%"],
                  ["fundingRate", "펀딩"],
                  ["rr1", "RR"],
                  ["price", "가격"],
                ] as [SortKey, string][]
              ).map(([k, label]) => (
                <th key={k} className="cursor-pointer px-2 py-2 font-medium">
                  <button type="button" onClick={() => toggleSort(k)}>
                    {label}
                    {sortKey === k ? (sortAsc ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => (
              <tr
                key={`${c.exchange}-${c.symbol}`}
                className="cursor-pointer border-t border-zinc-800/80 hover:bg-zinc-900/60"
                onClick={() => setSelected(c)}
              >
                <td className="px-2 py-2 text-zinc-500">{i + 1}</td>
                <td className="px-2 py-2">
                  <span className="font-medium text-zinc-100">
                    {favKeys.has(`${c.exchange}:${c.symbol}`) ? "★ " : ""}
                    {c.baseAsset}
                  </span>
                  <span className="ml-1 text-zinc-600">
                    {exchangeLabel(c.exchange)}
                  </span>
                </td>
                <td className={`px-2 py-2 font-medium ${dirCls(c.direction)}`}>
                  {c.direction}
                </td>
                <td className="px-2 py-2 text-amber-400/90">{stars(c.stars)}</td>
                <td className="px-2 py-2 tabular-nums text-zinc-100">
                  {c.scoreTotal}
                </td>
                <td className="px-2 py-2 tabular-nums text-emerald-400/80">
                  {c.scoreLong}
                </td>
                <td className="px-2 py-2 tabular-nums text-rose-400/80">
                  {c.scoreShort}
                </td>
                <td className="px-2 py-2 text-zinc-400">
                  {c.strongestStrategy
                    ? STRATEGY_LABELS[c.strongestStrategy]
                    : "-"}
                </td>
                <td
                  className={`px-2 py-2 tabular-nums ${
                    c.change15m >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {c.change15m.toFixed(2)}
                </td>
                <td
                  className={`px-2 py-2 tabular-nums ${
                    c.change1h >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {c.change1h.toFixed(2)}
                </td>
                <td
                  className={`px-2 py-2 tabular-nums ${
                    c.change24h >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {c.change24h.toFixed(2)}
                </td>
                <td className="px-2 py-2 tabular-nums text-zinc-300">
                  {c.volMult.toFixed(1)}
                </td>
                <td className="px-2 py-2 tabular-nums text-zinc-300">
                  {c.turnoverMult.toFixed(1)}
                </td>
                <td className="px-2 py-2 tabular-nums text-zinc-300">
                  {c.rsi.toFixed(0)}
                </td>
                <td className="px-2 py-2 tabular-nums text-zinc-400">
                  {c.oiChangePct != null ? c.oiChangePct.toFixed(1) : "—"}
                </td>
                <td className="px-2 py-2 tabular-nums text-zinc-400">
                  {c.fundingRate != null
                    ? `${(c.fundingRate * 100).toFixed(3)}%`
                    : "—"}
                </td>
                <td className="px-2 py-2 tabular-nums text-zinc-300">
                  {c.rr1 ?? "—"}
                </td>
                <td className="px-2 py-2 tabular-nums text-zinc-200">
                  {c.price}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && (
          <p className="p-6 text-center text-sm text-zinc-500">
            조건에 맞는 후보가 없습니다. 최소점수·거래대금 필터를 낮춰보세요.
          </p>
        )}
      </div>

      {selected && (
        <ScreenerDetail
          candidate={selected}
          favorited={favKeys.has(`${selected.exchange}:${selected.symbol}`)}
          onClose={() => setSelected(null)}
          onExcluded={() => {
            void loadMeta();
            void load();
          }}
          onFavoriteChange={() => void loadMeta()}
        />
      )}
    </div>
  );
}
