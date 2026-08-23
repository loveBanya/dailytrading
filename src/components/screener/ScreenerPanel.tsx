"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ScanFilters,
  ScanResult,
  ScreenerCandidate,
  StrategyId,
} from "@/lib/screener/types";
import { STRATEGY_LABELS } from "@/lib/screener/types";
import { exchangeLabel } from "@/lib/screener/filters";
import { formatKst } from "@/lib/utils/format";
import { ScreenerDetail } from "./ScreenerDetail";
import { fireAlarm } from "@/lib/alarms/notify";
import { loadAlarmSettings } from "@/lib/alarms/settings";
import {
  defaultScreenerFilters,
  loadScreenerFilters,
  saveScreenerFilters,
} from "@/lib/prefs";

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
  const [filters, setFilters] = useState<ScanFilters>(defaultScreenerFilters);
  const [filtersReady, setFiltersReady] = useState(false);
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
  const [paperBusy, setPaperBusy] = useState<string | null>(null);
  const [excludeInput, setExcludeInput] = useState("");
  const seenSignalKeys = useRef<Set<string> | null>(null);

  useEffect(() => {
    setFilters(loadScreenerFilters());
    setFiltersReady(true);
  }, []);

  useEffect(() => {
    if (!filtersReady) return;
    saveScreenerFilters(filters);
  }, [filters, filtersReady]);

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
        assetKind: filters.assetKind ?? "all",
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

      const alarm = loadAlarmSettings();
      if (alarm.enabled && alarm.screenerEnabled && data.candidates?.length) {
        const favSet = new Set(
          favorites.map((f) => `${f.exchange}:${f.symbol}`)
        );
        const nextKeys = new Set<string>();
        const fresh: ScreenerCandidate[] = [];
        for (const c of data.candidates) {
          const key = `${c.exchange}:${c.symbol}:${c.direction}`;
          nextKeys.add(key);
          if (c.stars < alarm.screenerMinStars) continue;
          if (
            alarm.screenerFavoritesOnly &&
            !favSet.has(`${c.exchange}:${c.symbol}`)
          ) {
            continue;
          }
          if (seenSignalKeys.current && !seenSignalKeys.current.has(key)) {
            fresh.push(c);
          }
        }
        // 첫 스캔은 기준만 잡고 울리지 않음
        if (seenSignalKeys.current == null) {
          seenSignalKeys.current = nextKeys;
        } else {
          seenSignalKeys.current = nextKeys;
          if (fresh.length > 0) {
            const top = [...fresh].sort((a, b) => b.stars - a.stars)[0];
            void fireAlarm(
              "screener",
              `${top.exchange}:${top.symbol}`,
              `스크리너 ${fresh.length}건`,
              `${top.symbol} ${top.direction} ★${top.stars}`,
              alarm
            );
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "스캔 실패");
    } finally {
      setLoading(false);
    }
  }, [filters, favorites]);

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

  function selectAllStrategies() {
    setFilters((f) => ({
      ...f,
      strategies: STRATEGY_OPTS.map(([id]) => id),
    }));
  }

  function clearStrategies() {
    setFilters((f) => ({ ...f, strategies: [] }));
  }

  function setMacdStrategies() {
    setFilters((f) => ({
      ...f,
      strategies: [
        "golden_cross",
        "dead_cross",
        "macd_momentum",
        "ema200_macd_zero",
      ],
      minScore: 50,
    }));
  }

  function setEma200MacdStrategies() {
    setFilters((f) => ({
      ...f,
      strategies: ["ema200_macd_zero"],
      minScore: 55,
      direction: "ALL",
    }));
  }

  function setTurtleStrategies() {
    setFilters((f) => ({
      ...f,
      strategies: ["turtle_donchian"],
      minScore: 55,
      direction: "ALL",
    }));
  }

  function setDemandSupplyStrategies() {
    setFilters((f) => ({
      ...f,
      strategies: ["demand_supply"],
      minScore: 55,
      direction: "LONG",
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
    setPaperBusy(trackType);
    try {
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
          `✓ ${trackType === "macd" ? "MACD" : "스캔"} 가상투자 ${data.started ?? 0}건 시작 — 스크리너 성과에서 수익률 확인`
        );
    } finally {
      setPaperBusy(null);
    }
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
            onClick={() => setEma200MacdStrategies()}
            className="rounded border border-emerald-500/40 px-2 py-1 text-xs text-emerald-300"
            title="EMA200 위 + 0선 위 골든 / 골든 상태에서 0선 돌파 (숏은 반대)"
          >
            EMA200·0선
          </button>
          <button
            type="button"
            onClick={() => setTurtleStrategies()}
            className="rounded border border-amber-500/40 px-2 py-1 text-xs text-amber-200"
            title="20봉 고점 돌파 매수 / 10봉 저점 이탈 청산 / 손절 2×ATR / 조건 없으면 관망"
          >
            터틀·돈치안
          </button>
          <button
            type="button"
            onClick={() => setDemandSupplyStrategies()}
            className="rounded border border-rose-500/40 px-2 py-1 text-xs text-rose-200"
            title="당일+10% · 상대거래량5× · $2–20 · 얇은 공급 · 뉴스는 수동 확인"
          >
            수요↑·공급↓
          </button>
          <button
            type="button"
            disabled={!result?.candidates.length || !!paperBusy}
            onClick={() => void startPaper("scan")}
            className="rounded-lg border border-sky-400/50 bg-gradient-to-r from-sky-500/20 to-cyan-500/10 px-3 py-1.5 text-xs font-medium text-sky-200 shadow-[0_0_20px_-8px_rgba(56,189,248,0.8)] transition hover:from-sky-500/30 disabled:opacity-40"
          >
            {paperBusy === "scan" ? "기록 중…" : "⚡ 후보 가상투자"}
          </button>
          <button
            type="button"
            disabled={!result?.candidates.length || !!paperBusy}
            onClick={() => void startPaper("macd", true)}
            className="rounded-lg border border-violet-400/50 bg-gradient-to-r from-violet-500/20 to-fuchsia-500/10 px-3 py-1.5 text-xs font-medium text-violet-200 shadow-[0_0_20px_-8px_rgba(167,139,250,0.8)] transition hover:from-violet-500/30 disabled:opacity-40"
          >
            {paperBusy === "macd" ? "기록 중…" : "📡 MACD 가상투자"}
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
            <select
              value={filters.assetKind ?? "all"}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  assetKind: e.target.value as ScanFilters["assetKind"],
                }))
              }
              className={inputCls}
              title="코인 선물 / 토큰화 주식·원자재·ETF (TradFi)"
            >
              <option value="all">코인+주식</option>
              <option value="crypto">코인만</option>
              <option value="stock">주식·TradFi</option>
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
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={selectAllStrategies}
              className="rounded border border-zinc-600 px-2 py-0.5 text-[11px] text-zinc-300 hover:border-sky-500/40 hover:text-sky-300"
            >
              모두 선택
            </button>
            <button
              type="button"
              onClick={clearStrategies}
              className="rounded border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-500 hover:text-zinc-300"
            >
              선택 해제
            </button>
              <span className="mx-1 text-[10px] text-zinc-600">
                {filters.strategies.length === STRATEGY_OPTS.length
                  ? "전체 선택"
                  : filters.strategies.length === 0
                    ? "미선택 = 전략 필터 없음"
                    : `${filters.strategies.length}개 선택`}
              </span>
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

      {/* 모바일: 카드 / 데스크톱: 테이블 */}
      <div className="space-y-2 md:hidden">
        {rows.map((c, i) => (
          <button
            key={`${c.exchange}-${c.symbol}-m`}
            type="button"
            onClick={() => setSelected(c)}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 text-left transition active:bg-zinc-900"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-100">
                  <span className="mr-1 text-zinc-600">{i + 1}.</span>
                  {favKeys.has(`${c.exchange}:${c.symbol}`) ? "★ " : ""}
                  {c.displayName ?? c.baseAsset}
                  {c.assetKind === "stock" && (
                    <span className="ml-1 rounded bg-amber-500/15 px-1 py-0.5 text-[10px] font-normal text-amber-200/90">
                      주식
                    </span>
                  )}
                  <span className="ml-1 text-[11px] font-normal text-zinc-600">
                    {exchangeLabel(c.exchange)}
                  </span>
                </p>
                <p className={`mt-0.5 text-xs font-medium ${dirCls(c.direction)}`}>
                  {c.direction} · {stars(c.stars)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-base font-semibold tabular-nums text-zinc-50">
                  {c.scoreTotal}
                </p>
                <p className="text-[10px] text-zinc-500">종합</p>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-zinc-400">
              <div>
                <span className="text-zinc-600">15m </span>
                <span
                  className={
                    c.change15m >= 0 ? "text-emerald-400" : "text-rose-400"
                  }
                >
                  {c.change15m.toFixed(1)}%
                </span>
              </div>
              <div>
                <span className="text-zinc-600">RSI </span>
                {c.rsi.toFixed(0)}
              </div>
              <div>
                <span className="text-zinc-600">RR </span>
                {c.rr1 ?? "—"}
              </div>
              <div className="col-span-2 truncate">
                <span className="text-zinc-600">전략 </span>
                {c.strongestStrategy
                  ? STRATEGY_LABELS[c.strongestStrategy]
                  : "—"}
              </div>
              <div className="truncate tabular-nums text-zinc-300">
                {c.price}
              </div>
            </div>
            <div className="mt-1 flex gap-3 text-[11px]">
              <span className="text-emerald-400/80">L {c.scoreLong}</span>
              <span className="text-rose-400/80">S {c.scoreShort}</span>
              <span className="text-zinc-600">Vol×{c.volMult.toFixed(1)}</span>
            </div>
          </button>
        ))}
        {!loading && rows.length === 0 && (
          <p className="p-6 text-center text-sm text-zinc-500">
            조건에 맞는 후보가 없습니다. 필터를 낮춰보세요.
          </p>
        )}
      </div>

      <div className="pretty-scroll hidden overflow-x-auto rounded-lg border border-zinc-800 md:block">
        <table className="w-full min-w-[1100px] text-left text-xs">
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
                  ["rsi", "RSI"],
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
                    {c.displayName ?? c.baseAsset}
                  </span>
                  {c.assetKind === "stock" && (
                    <span className="ml-1 rounded bg-amber-500/15 px-1 text-[10px] text-amber-200/90">
                      주식
                    </span>
                  )}
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
                  {c.rsi.toFixed(0)}
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
