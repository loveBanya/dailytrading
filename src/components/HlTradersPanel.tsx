"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatKst, formatPnl, formatUsd } from "@/lib/utils/format";
import {
  HL_ENTRIES_EVENT,
  HL_POLL_HOURS,
  HL_SYNCED_EVENT,
  readHlCache,
  recentCacheKey,
  writeHlCache,
} from "@/lib/hyperliquid/cache";
import {
  HlEntryChart,
  roundFromPosition,
  type HlChartRound,
} from "./HlEntryChart";
import { HlEntryTimeline } from "./HlEntryTimeline";
import { HlCoinBoardChart } from "./HlCoinBoardChart";
import { HlBiasPanel } from "./HlBiasPanel";
import { HlTraderPerfBadge } from "./HlTraderPerfBadge";
import { importanceScore } from "@/lib/hyperliquid/perf";
import {
  INITIAL_SNAPSHOT_NOTE,
  type HlEventType,
  type HlFill,
  type HlLeaderboardRow,
  type HlOpenPosition,
  type HlPortfolioSlice,
  type HlPositionEvent,
  type HlRecentEntry,
  type HlTrader,
} from "@/lib/hyperliquid/types";

type SubView = "all" | "watch" | "chart" | "board" | "history";
type ScoreFilter = "all" | "focus" | "watch";

const TRADERS_CACHE_KEY = "traders";
const HL_PINS_KEY = "dailytrading.hl.pins.v1";
const ENTRY_HOURS = [6, 24, 72] as const;
const ENTRY_MIN_NOTIONAL = [0, 10_000, 100_000] as const;

function loadPins(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(HL_PINS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function persistPins(ids: Set<string>): void {
  localStorage.setItem(HL_PINS_KEY, JSON.stringify([...ids]));
}

function roundFromCloseEvent(
  ev: HlPositionEvent,
  all: HlPositionEvent[],
  trader?: HlTrader | null
): HlChartRound | null {
  const exitTime = new Date(ev.observed_at).getTime();
  const exitPx =
    ev.mark_price != null
      ? Number(ev.mark_price)
      : ev.entry_price != null
        ? Number(ev.entry_price)
        : null;
  const prior = all
    .filter(
      (e) =>
        e.trader_id === ev.trader_id &&
        e.coin === ev.coin &&
        (e.event_type === "OPEN" || e.event_type === "FLIP") &&
        new Date(e.observed_at).getTime() <= exitTime
    )
    .sort(
      (a, b) =>
        new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime()
    )[0];
  const entryPx =
    prior?.entry_price != null
      ? Number(prior.entry_price)
      : ev.entry_price != null
        ? Number(ev.entry_price)
        : null;
  if (entryPx == null || !(entryPx > 0) || exitPx == null || !(exitPx > 0)) {
    return null;
  }
  const entryTime = prior
    ? new Date(prior.observed_at).getTime()
    : exitTime;
  return {
    coin: ev.coin,
    side: prior?.side ?? ev.side,
    avgPx: entryPx,
    firstTime: entryTime,
    lastTime: entryTime,
    kind: "CLOSE",
    label: trader?.label ?? null,
    address: trader?.address,
    exitPx,
    exitTime,
  };
}

function timeAgo(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

const EVENT_LABEL: Record<HlEventType, string> = {
  OPEN: "오픈",
  INCREASE: "증액",
  DECREASE: "감액",
  CLOSE: "청산",
  FLIP: "플립",
};

function shortAddr(a: string): string {
  if (a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function fmtUsdCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return formatUsd(n);
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  const pct = n * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function pnlClass(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n === 0) return "text-zinc-400";
  return n > 0 ? "text-emerald-400" : "text-rose-400";
}

export function HlTradersPanel() {
  const [view, setView] = useState<SubView>("all");
  const [entries, setEntries] = useState<HlRecentEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entryHours, setEntryHours] = useState<number>(24);
  const [entryMin, setEntryMin] = useState<number>(10_000);
  const [traders, setTraders] = useState<HlTrader[]>([]);
  const [positions, setPositions] = useState<HlOpenPosition[]>([]);
  /** null = 전체 */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrationHint, setMigrationHint] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => new Set());
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const [watchChart, setWatchChart] = useState<{
    round: HlChartRound;
    position: HlOpenPosition | null;
    trader: HlTrader | null;
  } | null>(null);

  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPinnedIds(loadPins());
  }, []);

  const togglePin = useCallback((id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistPins(next);
      return next;
    });
  }, []);

  const [board, setBoard] = useState<HlLeaderboardRow[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);

  const [events, setEvents] = useState<HlPositionEvent[]>([]);
  const [fills, setFills] = useState<HlFill[]>([]);
  const [portfolio, setPortfolio] = useState<HlPortfolioSlice[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [hideSnapshot, setHideSnapshot] = useState(true);

  const visibleEvents = useMemo(
    () =>
      hideSnapshot
        ? events.filter((e) => e.note !== INITIAL_SNAPSHOT_NOTE)
        : events,
    [events, hideSnapshot]
  );

  const selected = useMemo(
    () => traders.find((t) => t.id === selectedId) ?? null,
    [traders, selectedId]
  );

  const selectedPositions = useMemo(
    () =>
      (selectedId
        ? positions.filter((p) => p.trader_id === selectedId)
        : [...positions]
      ).sort(
        (a, b) =>
          Math.abs(Number(b.position_value ?? 0)) -
          Math.abs(Number(a.position_value ?? 0))
      ),
    [positions, selectedId]
  );

  const traderLabel = useCallback(
    (id: string) => {
      const t = traders.find((x) => x.id === id);
      return t ? t.label || shortAddr(t.address) : "-";
    },
    [traders]
  );

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/hl-traders");
      const data = (await res.json()) as {
        traders?: HlTrader[];
        positions?: HlOpenPosition[];
        error?: string;
        needsMigration?: boolean;
        migrationHint?: string;
      };
      if (data.needsMigration) {
        setMigrationHint(
          data.migrationHint ??
            "supabase/migrations/012_hl_traders.sql 을 실행하세요."
        );
      } else {
        setMigrationHint(null);
      }
      if (data.error && !data.needsMigration) throw new Error(data.error);
      const list = data.traders ?? [];
      const pos = data.positions ?? [];
      setTraders(list);
      setPositions(pos);
      setCachedAt(null);
      writeHlCache(TRADERS_CACHE_KEY, { traders: list, positions: pos });
      setSelectedId((prev) =>
        prev && list.some((t) => t.id === prev) ? prev : null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "불러오기 실패");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const cached = readHlCache<{
      traders: HlTrader[];
      positions: HlOpenPosition[];
    }>(TRADERS_CACHE_KEY);
    if (cached) {
      setTraders(cached.data.traders);
      setPositions(cached.data.positions);
      setCachedAt(cached.at);
      setLoading(false);
    }
    const cachedEntries = readHlCache<HlRecentEntry[]>(recentCacheKey(24));
    if (cachedEntries) setEntries(cachedEntries.data);
    void load();
  }, [load]);

  useEffect(() => {
    const onEntries = (e: Event) => {
      if (entryHours !== HL_POLL_HOURS) return;
      const list = (e as CustomEvent<HlRecentEntry[]>).detail;
      if (Array.isArray(list)) setEntries(list);
    };
    window.addEventListener(HL_ENTRIES_EVENT, onEntries);
    return () => window.removeEventListener(HL_ENTRIES_EVENT, onEntries);
  }, [entryHours]);

  useEffect(() => {
    const onSynced = () => void load();
    window.addEventListener(HL_SYNCED_EVENT, onSynced);
    return () => window.removeEventListener(HL_SYNCED_EVENT, onSynced);
  }, [load]);

  const loadBoard = useCallback(async () => {
    setBoardLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hl-traders/leaderboard?limit=40");
      const data = (await res.json()) as {
        rows?: HlLeaderboardRow[];
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setBoard(data.rows ?? []);
      writeHlCache("leaderboard", data.rows ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "리더보드 실패");
    } finally {
      setBoardLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (traderId: string | null) => {
    const cacheKey = `history:${traderId ?? "all"}`;
    const cached = readHlCache<{
      events: HlPositionEvent[];
      fills: HlFill[];
      portfolio: HlPortfolioSlice[];
    }>(cacheKey);
    if (cached) {
      setEvents(cached.data.events);
      setFills(cached.data.fills);
      setPortfolio(cached.data.portfolio);
    } else {
      setEvents([]);
      setFills([]);
      setPortfolio([]);
    }
    setHistoryLoading(true);
    setError(null);
    try {
      const qs = traderId
        ? `traderId=${encodeURIComponent(traderId)}&limit=120&fills=1&portfolio=1`
        : "limit=300";
      const res = await fetch(`/api/hl-traders/history?${qs}`);
      const data = (await res.json()) as {
        events?: HlPositionEvent[];
        fills?: HlFill[] | null;
        portfolio?: HlPortfolioSlice[] | null;
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      const next = {
        events: data.events ?? [],
        fills: data.fills ?? [],
        portfolio: data.portfolio ?? [],
      };
      setEvents(next.events);
      setFills(next.fills);
      setPortfolio(next.portfolio);
      writeHlCache(cacheKey, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "히스토리 실패");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadEntries = useCallback(
    async (fresh = false) => {
      const key = recentCacheKey(entryHours);
      const cached = readHlCache<HlRecentEntry[]>(key);
      if (cached) setEntries(cached.data);
      setEntriesLoading(true);
      try {
        const res = await fetch(
          `/api/hl-traders/recent?hours=${entryHours}${fresh ? "&fresh=1" : ""}`
        );
        const data = (await res.json()) as {
          entries?: HlRecentEntry[];
          error?: string;
        };
        if (data.error) throw new Error(data.error);
        const list = data.entries ?? [];
        setEntries(list);
        writeHlCache(key, list);
      } catch (err) {
        setError(err instanceof Error ? err.message : "최근 진입 실패");
      } finally {
        setEntriesLoading(false);
      }
    },
    [entryHours]
  );

  useEffect(() => {
    if (view !== "all" && view !== "chart") return;
    if (traders.length === 0) return;
    // 차트 탭은 캐시·기존 목록이 있으면 재요청하지 않음 (HL 429 완화)
    if (view === "chart" && entries.length > 0) return;
    void loadEntries();
  }, [view, traders.length, loadEntries, entries.length]);

  useEffect(() => {
    if (view !== "board") return;
    if (board.length === 0) {
      const cached = readHlCache<HlLeaderboardRow[]>("leaderboard");
      if (cached) setBoard(cached.data);
      if (!cached || Date.now() - cached.at > 10 * 60_000) void loadBoard();
    }
  }, [view, board.length, loadBoard]);

  useEffect(() => {
    if (view === "history") void loadHistory(selectedId);
  }, [view, selectedId, loadHistory]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/hl-traders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: address.trim(),
          label: label.trim() || undefined,
          sync: true,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        needsMigration?: boolean;
        migrationHint?: string;
      };
      if (data.needsMigration) {
        setMigrationHint(data.migrationHint ?? null);
      }
      if (data.error) throw new Error(data.error);
      setAddress("");
      setLabel("");
      await load();
      setView("watch");
    } catch (err) {
      setError(err instanceof Error ? err.message : "추가 실패");
    } finally {
      setSaving(false);
    }
  }

  async function handleSync(traderId?: string) {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/hl-traders/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(traderId ? { traderId } : {}),
      });
      const data = (await res.json()) as {
        error?: string;
        needsMigration?: boolean;
        migrationHint?: string;
        eventsCreated?: number;
      };
      if (data.needsMigration) setMigrationHint(data.migrationHint ?? null);
      if (data.error) throw new Error(data.error);
      await load();
      if (view === "history") await loadHistory(selectedId);
      if (view === "all") await loadEntries(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "동기화 실패");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("이 트레이더를 관심 목록에서 제거할까요?")) return;
    await fetch(`/api/hl-traders?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    await load();
  }

  async function followFromBoard(row: HlLeaderboardRow) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/hl-traders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: row.address,
          label: row.displayName || shortAddr(row.address),
          sync: true,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (data.error) throw new Error(data.error);
      await load();
      setView("watch");
    } catch (err) {
      setError(err instanceof Error ? err.message : "추가 실패");
    } finally {
      setSaving(false);
    }
  }

  const watchedAddresses = useMemo(
    () => new Set(traders.map((t) => t.address.toLowerCase())),
    [traders]
  );

  const weekSlice = portfolio.find((p) => p.window === "week");
  const monthSlice = portfolio.find((p) => p.window === "month");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-400">
          Hyperliquid 공개 지갑을 관심에 두고 포지션·변경 이력을 추적합니다.
          <span className="ml-2 text-xs text-zinc-600">
            {refreshing
              ? "최신 데이터 받는 중…"
              : cachedAt
                ? `저장본 표시 중 (${timeAgo(cachedAt)})`
                : "5분마다 자동 동기화"}
          </span>
        </p>
        <button
          type="button"
          disabled={syncing || traders.length === 0}
          onClick={() => void handleSync()}
          className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40"
        >
          {syncing ? "동기화 중…" : "전체 동기화"}
        </button>
      </div>

      {migrationHint && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-100">
          <p className="font-medium">DB 테이블이 필요합니다</p>
          <p className="mt-1 text-xs text-amber-200/70">{migrationHint}</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <form
        onSubmit={handleAdd}
        className="flex flex-wrap items-end gap-2 rounded-md border border-zinc-800/80 bg-zinc-950/40 p-3"
      >
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-zinc-500">지갑 주소</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x…"
            className="w-56 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-sm text-zinc-100 outline-none focus:border-emerald-500/50 sm:w-72"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-zinc-500">별칭</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="탑트레이더 A"
            className="w-32 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500/50"
          />
        </label>
        <button
          type="submit"
          disabled={saving || !address.trim()}
          className="rounded-md border border-emerald-700/60 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40"
        >
          {saving ? "추가 중…" : "관심 추가"}
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["all", "모아보기"],
            ["chart", "코인 차트"],
            ["watch", "관심·포지션"],
            ["board", "리더보드"],
            ["history", "히스토리"],
          ] as const
        ).map(([id, name]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
              view === id
                ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-200"
                : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {traders.length > 0 && (view === "watch" || view === "history") && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className={`rounded border px-2.5 py-1 text-xs transition ${
              selectedId == null
                ? "border-emerald-600/60 bg-emerald-500/10 text-emerald-200"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            전체 {traders.length}명
          </button>
          {traders.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedId(t.id)}
              className={`rounded border px-2.5 py-1 text-xs transition ${
                selectedId === t.id
                  ? "border-zinc-500 bg-zinc-800 text-zinc-100"
                  : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t.label || shortAddr(t.address)}
              {t.account_value != null ? (
                <span className="ml-1.5 text-zinc-600">
                  {fmtUsdCompact(Number(t.account_value))}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <p className="py-8 text-center text-sm text-zinc-500">불러오는 중…</p>
      )}

      {!loading && view === "all" && (
        <AllTradersView
          traders={traders}
          positions={positions}
          entries={entries}
          entriesLoading={entriesLoading}
          entryHours={entryHours}
          entryMin={entryMin}
          pinnedIds={pinnedIds}
          scoreFilter={scoreFilter}
          onScoreFilterChange={setScoreFilter}
          onTogglePin={togglePin}
          onHoursChange={setEntryHours}
          onMinChange={setEntryMin}
          onRefreshEntries={() => void loadEntries(true)}
          onOpenTrader={(id) => {
            setSelectedId(id);
            setView("watch");
          }}
        />
      )}

      {!loading && view === "chart" && (
        <HlCoinBoardChart
          traders={traders}
          positions={positions}
          entries={entries}
          entriesLoading={entriesLoading}
          pinnedIds={pinnedIds}
          onNeedEntries={() => {
            if (entries.length === 0) void loadEntries();
          }}
          onOpenTrader={(id) => {
            setSelectedId(id);
            setView("watch");
          }}
        />
      )}

      {!loading && view === "watch" && (
        <div className="space-y-4">
          {traders.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              관심 트레이더가 없습니다. 주소를 추가하거나 리더보드에서
              따라가세요.
            </p>
          ) : (
            <>
              {selected && (
                <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-medium text-zinc-200">
                        {selected.label || shortAddr(selected.address)}
                      </span>
                      <a
                        href={`https://app.hyperliquid.xyz/explorer/address/${selected.address}`}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 font-mono text-xs text-zinc-500 underline hover:text-zinc-300"
                      >
                        {shortAddr(selected.address)}
                      </a>
                      {selected.last_synced_at && (
                        <span className="ml-2 text-xs text-zinc-600">
                          동기화 {formatKst(selected.last_synced_at)}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={syncing}
                        onClick={() => void handleSync(selected.id)}
                        className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
                      >
                        동기화
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setView("history");
                        }}
                        className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200"
                      >
                        히스토리
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(selected.id)}
                        className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-rose-400/80 hover:text-rose-300"
                      >
                        제거
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <HlTraderPerfBadge
                      trader={selected}
                      importance={importanceScore(selected, {
                        pinned: pinnedIds.has(selected.id),
                        exposureUsd: selectedPositions
                          .filter((p) => p.trader_id === selected.id)
                          .reduce(
                            (s, p) =>
                              s + Math.abs(Number(p.position_value ?? 0)),
                            0
                          ),
                      })}
                    />
                    <button
                      type="button"
                      onClick={() => togglePin(selected.id)}
                      className={`rounded border px-2 py-0.5 text-[11px] ${
                        pinnedIds.has(selected.id)
                          ? "border-sky-600/60 text-sky-300"
                          : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {pinnedIds.has(selected.id) ? "핀 해제" : "핀 고정"}
                    </button>
                  </div>
                  {selected.note ? (
                    <p className="text-xs leading-relaxed text-zinc-500">
                      {selected.note}
                    </p>
                  ) : null}
                </div>
              )}

              {selectedId == null && (
                <div className="space-y-3">
                  <HlBiasPanel />
                  {selectedPositions.length > 0 && (
                    <AllPositionsSummary positions={selectedPositions} />
                  )}
                </div>
              )}

              {watchChart && (
                <HlEntryChart
                  round={watchChart.round}
                  position={watchChart.position}
                  trader={watchChart.trader}
                  onClose={() => setWatchChart(null)}
                />
              )}

              {selectedPositions.length === 0 ? (
                <p className="py-6 text-center text-sm text-zinc-500">
                  열린 포지션이 없습니다. 동기화하면 스냅샷이 갱신됩니다.
                </p>
              ) : (
                <div className="max-h-[560px] overflow-auto pretty-scroll">
                  <p className="mb-1 text-[11px] text-zinc-600">
                    줄을 누르면 진입·현재가 차트가 열립니다.
                  </p>
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="sticky top-0 border-b border-zinc-800 bg-zinc-950 text-[11px] uppercase tracking-wide text-zinc-500">
                      <tr>
                        {selectedId == null && (
                          <th className="px-2 py-2 font-medium">트레이더</th>
                        )}
                        <th className="px-2 py-2 font-medium">코인</th>
                        <th className="px-2 py-2 font-medium">방향</th>
                        <th className="px-2 py-2 font-medium">크기</th>
                        <th className="px-2 py-2 font-medium">진입</th>
                        <th className="px-2 py-2 font-medium">가치</th>
                        <th className="px-2 py-2 font-medium">미실현</th>
                        <th className="px-2 py-2 font-medium">레버</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPositions.map((p) => {
                        const tr = traders.find((t) => t.id === p.trader_id);
                        return (
                          <tr
                            key={p.id}
                            onClick={() => {
                              const round = roundFromPosition(p, tr ?? null);
                              if (!round) return;
                              setWatchChart({
                                round,
                                position: p,
                                trader: tr ?? null,
                              });
                            }}
                            className="cursor-pointer border-b border-zinc-900/80 text-zinc-300 hover:bg-zinc-800/40"
                          >
                            {selectedId == null && (
                              <td className="px-2 py-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedId(p.trader_id);
                                  }}
                                  className="text-left text-xs text-zinc-400 hover:text-emerald-300 hover:underline"
                                >
                                  {traderLabel(p.trader_id)}
                                </button>
                              </td>
                            )}
                            <td className="px-2 py-2 font-medium text-zinc-100">
                              {p.coin}
                            </td>
                            <td
                              className={`px-2 py-2 ${
                                p.side === "LONG"
                                  ? "text-emerald-400"
                                  : "text-rose-400"
                              }`}
                            >
                              {p.side}
                            </td>
                            <td className="px-2 py-2 tabular-nums">
                              {Number(p.size).toPrecision(6)}
                            </td>
                            <td className="px-2 py-2 tabular-nums text-zinc-400">
                              {p.entry_price != null
                                ? Number(p.entry_price).toLocaleString()
                                : "-"}
                            </td>
                            <td className="px-2 py-2 tabular-nums">
                              {fmtUsdCompact(
                                p.position_value != null
                                  ? Number(p.position_value)
                                  : null
                              )}
                            </td>
                            <td
                              className={`px-2 py-2 tabular-nums ${pnlClass(
                                p.unrealised_pnl != null
                                  ? Number(p.unrealised_pnl)
                                  : null
                              )}`}
                            >
                              {p.unrealised_pnl != null
                                ? formatPnl(Number(p.unrealised_pnl))
                                : "-"}
                            </td>
                            <td className="px-2 py-2 tabular-nums text-zinc-500">
                              {p.leverage != null ? `${p.leverage}x` : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!loading && view === "board" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              disabled={boardLoading}
              onClick={() => void loadBoard()}
              className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
            >
              {boardLoading ? "불러오는 중…" : "리더보드 새로고침"}
            </button>
          </div>
          {boardLoading && board.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              리더보드 불러오는 중…
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-zinc-800 text-[11px] uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-2 py-2 font-medium">#</th>
                    <th className="px-2 py-2 font-medium">주소</th>
                    <th className="px-2 py-2 font-medium">잔고</th>
                    <th className="px-2 py-2 font-medium">일 PnL</th>
                    <th className="px-2 py-2 font-medium">주 ROI</th>
                    <th className="px-2 py-2 font-medium">월 ROI</th>
                    <th className="px-2 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {board.map((row, i) => {
                    const following = watchedAddresses.has(
                      row.address.toLowerCase()
                    );
                    return (
                      <tr
                        key={row.address}
                        className="border-b border-zinc-900/80 text-zinc-300"
                      >
                        <td className="px-2 py-2 tabular-nums text-zinc-600">
                          {i + 1}
                        </td>
                        <td className="px-2 py-2">
                          <span className="font-mono text-xs">
                            {shortAddr(row.address)}
                          </span>
                          {row.displayName ? (
                            <span className="ml-2 text-xs text-zinc-500">
                              {row.displayName}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {fmtUsdCompact(row.accountValue)}
                        </td>
                        <td
                          className={`px-2 py-2 tabular-nums ${pnlClass(row.pnlDay)}`}
                        >
                          {fmtUsdCompact(row.pnlDay)}
                        </td>
                        <td
                          className={`px-2 py-2 tabular-nums ${pnlClass(row.roiWeek)}`}
                        >
                          {fmtPct(row.roiWeek)}
                        </td>
                        <td
                          className={`px-2 py-2 tabular-nums ${pnlClass(row.roiMonth)}`}
                        >
                          {fmtPct(row.roiMonth)}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            disabled={following || saving}
                            onClick={() => void followFromBoard(row)}
                            className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:text-emerald-300 disabled:opacity-40"
                          >
                            {following ? "관심 중" : "따라가기"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!loading && view === "history" && (
        <div className="space-y-5">
          {historyLoading && events.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              히스토리 불러오는 중…
            </p>
          ) : (
            <>
              {(weekSlice || monthSlice) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {weekSlice && (
                    <PortfolioMini
                      title="주간 계좌가치"
                      points={weekSlice.accountValueHistory}
                    />
                  )}
                  {monthSlice && (
                    <PortfolioMini
                      title="월간 PnL"
                      points={monthSlice.pnlHistory}
                      asPnl
                    />
                  )}
                </div>
              )}

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-zinc-200">
                    포지션 변경 기록
                    {selectedId == null ? (
                      <span className="ml-2 text-xs font-normal text-zinc-500">
                        전체 트레이더
                      </span>
                    ) : null}
                  </h3>
                  <label className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                    <input
                      type="checkbox"
                      checked={hideSnapshot}
                      onChange={(e) => setHideSnapshot(e.target.checked)}
                      className="size-3.5 accent-emerald-500"
                    />
                    초기 스냅샷 숨기기
                  </label>
                </div>
                {watchChart && view === "history" && (
                  <div className="mb-3">
                    <HlEntryChart
                      round={watchChart.round}
                      position={watchChart.position}
                      trader={watchChart.trader}
                      onClose={() => setWatchChart(null)}
                    />
                  </div>
                )}
                {visibleEvents.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    아직 기록된 변경이 없습니다. 5분마다 자동 동기화되면서
                    오픈·증감·청산이 쌓입니다.
                  </p>
                ) : (
                  <ul className="max-h-96 space-y-1.5 overflow-y-auto pretty-scroll">
                    <p className="mb-1 text-[11px] text-zinc-600">
                      오픈·청산 줄을 누르면 진입·익절 차트가 열립니다.
                    </p>
                    {visibleEvents.map((ev) => {
                      const tr = traders.find((t) => t.id === ev.trader_id);
                      const chartable =
                        ev.event_type === "CLOSE" ||
                        ev.event_type === "OPEN" ||
                        ev.event_type === "FLIP";
                      return (
                        <li key={ev.id}>
                          <button
                            type="button"
                            disabled={!chartable}
                            onClick={() => {
                              if (ev.event_type === "CLOSE") {
                                const round = roundFromCloseEvent(
                                  ev,
                                  events,
                                  tr
                                );
                                if (!round) return;
                                setWatchChart({
                                  round,
                                  position: null,
                                  trader: tr ?? null,
                                });
                                return;
                              }
                              if (
                                ev.event_type === "OPEN" ||
                                ev.event_type === "FLIP"
                              ) {
                                const px =
                                  ev.entry_price != null
                                    ? Number(ev.entry_price)
                                    : ev.mark_price != null
                                      ? Number(ev.mark_price)
                                      : null;
                                if (px == null || !(px > 0)) return;
                                const t = new Date(ev.observed_at).getTime();
                                const pos =
                                  positions.find(
                                    (p) =>
                                      p.trader_id === ev.trader_id &&
                                      p.coin === ev.coin &&
                                      p.side === ev.side
                                  ) ?? null;
                                setWatchChart({
                                  round: {
                                    coin: ev.coin,
                                    side: ev.side,
                                    avgPx: px,
                                    firstTime: t,
                                    lastTime: t,
                                    kind:
                                      ev.event_type === "FLIP"
                                        ? "FLIP"
                                        : "OPEN",
                                    label: tr?.label ?? null,
                                    address: tr?.address,
                                    liveMarkPx:
                                      pos?.mark_price != null
                                        ? Number(pos.mark_price)
                                        : ev.mark_price != null
                                          ? Number(ev.mark_price)
                                          : null,
                                  },
                                  position: pos,
                                  trader: tr ?? null,
                                });
                              }
                            }}
                            className={`flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded border border-zinc-800/80 bg-zinc-950/30 px-2.5 py-1.5 text-left text-sm ${
                              chartable
                                ? "cursor-pointer hover:border-zinc-600 hover:bg-zinc-900/50"
                                : "opacity-80"
                            }`}
                          >
                            <span className="text-[11px] text-zinc-600">
                              {formatKst(ev.observed_at)}
                            </span>
                            {selectedId == null && (
                              <span
                                role="link"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedId(ev.trader_id);
                                  setView("watch");
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.stopPropagation();
                                    setSelectedId(ev.trader_id);
                                    setView("watch");
                                  }
                                }}
                                className="text-xs text-zinc-400 hover:text-emerald-300 hover:underline"
                              >
                                {traderLabel(ev.trader_id)}
                              </span>
                            )}
                            <span className="font-medium text-zinc-200">
                              {ev.coin}
                            </span>
                            <span
                              className={
                                ev.side === "LONG"
                                  ? "text-emerald-400"
                                  : "text-rose-400"
                              }
                            >
                              {ev.side}
                            </span>
                            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-300">
                              {EVENT_LABEL[ev.event_type]}
                            </span>
                            <span className="tabular-nums text-zinc-500">
                              {ev.size_before ?? 0} → {ev.size_after ?? 0}
                            </span>
                            {ev.note ? (
                              <span className="text-xs text-zinc-600">
                                {ev.note}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium text-zinc-200">
                  최근 체결 (HL)
                </h3>
                {fills.length === 0 ? (
                  <p className="text-sm text-zinc-500">체결 내역이 없습니다.</p>
                ) : (
                  <div className="max-h-72 overflow-auto pretty-scroll">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="sticky top-0 border-b border-zinc-800 bg-zinc-950 text-[11px] uppercase tracking-wide text-zinc-500">
                        <tr>
                          <th className="px-2 py-2 font-medium">시각</th>
                          <th className="px-2 py-2 font-medium">코인</th>
                          <th className="px-2 py-2 font-medium">방향</th>
                          <th className="px-2 py-2 font-medium">가격</th>
                          <th className="px-2 py-2 font-medium">크기</th>
                          <th className="px-2 py-2 font-medium">실현</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fills.slice(0, 80).map((f, i) => (
                          <tr
                            key={`${f.hash}-${i}`}
                            className="border-b border-zinc-900/80 text-zinc-300"
                          >
                            <td className="px-2 py-1.5 text-xs text-zinc-500">
                              {f.time ? formatKst(f.time) : "-"}
                            </td>
                            <td className="px-2 py-1.5">{f.coin}</td>
                            <td className="px-2 py-1.5 text-xs text-zinc-400">
                              {f.dir || f.side}
                            </td>
                            <td className="px-2 py-1.5 tabular-nums">
                              {f.px.toLocaleString()}
                            </td>
                            <td className="px-2 py-1.5 tabular-nums">
                              {f.sz}
                            </td>
                            <td
                              className={`px-2 py-1.5 tabular-nums ${pnlClass(f.closedPnl)}`}
                            >
                              {formatPnl(f.closedPnl)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AllPositionsSummary({ positions }: { positions: HlOpenPosition[] }) {
  const { longNtl, shortNtl, coins } = useMemo(() => {
    let longNtl = 0;
    let shortNtl = 0;
    const m = new Map<
      string,
      { long: number; short: number; longT: Set<string>; shortT: Set<string> }
    >();
    for (const p of positions) {
      const v = Math.abs(Number(p.position_value ?? 0));
      const cur = m.get(p.coin) ?? {
        long: 0,
        short: 0,
        longT: new Set<string>(),
        shortT: new Set<string>(),
      };
      if (p.side === "LONG") {
        longNtl += v;
        cur.long += v;
        cur.longT.add(p.trader_id);
      } else {
        shortNtl += v;
        cur.short += v;
        cur.shortT.add(p.trader_id);
      }
      m.set(p.coin, cur);
    }
    const coins = [...m.entries()]
      .map(([coin, c]) => ({
        coin,
        long: c.long,
        short: c.short,
        longN: c.longT.size,
        shortN: c.shortT.size,
      }))
      .sort((a, b) => b.longN + b.shortN - (a.longN + a.shortN) || b.long + b.short - (a.long + a.short))
      .slice(0, 12);
    return { longNtl, shortNtl, coins };
  }, [positions]);

  const total = longNtl + shortNtl;
  return (
    <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="text-zinc-300">
          전체 포지션 {positions.length}개
        </span>
        <span className="text-xs tabular-nums">
          <span className="text-emerald-400">롱 {fmtUsdCompact(longNtl)}</span>
          <span className="mx-2 text-zinc-600">/</span>
          <span className="text-rose-400">숏 {fmtUsdCompact(shortNtl)}</span>
        </span>
      </div>
      {total > 0 && (
        <div className="flex h-1.5 overflow-hidden rounded-full bg-rose-500/60">
          <div
            className="bg-emerald-500/80"
            style={{ width: `${(longNtl / total) * 100}%` }}
          />
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {coins.map((c) => (
          <span
            key={c.coin}
            className="rounded border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400"
            title={`롱 ${fmtUsdCompact(c.long)} / 숏 ${fmtUsdCompact(c.short)}`}
          >
            <span className="text-zinc-200">{c.coin}</span>
            {c.longN > 0 && (
              <span className="ml-1 text-emerald-400">롱{c.longN}</span>
            )}
            {c.shortN > 0 && (
              <span className="ml-1 text-rose-400">숏{c.shortN}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function AllTradersView({
  traders,
  positions,
  entries,
  entriesLoading,
  entryHours,
  entryMin,
  pinnedIds,
  scoreFilter,
  onScoreFilterChange,
  onTogglePin,
  onHoursChange,
  onMinChange,
  onRefreshEntries,
  onOpenTrader,
}: {
  traders: HlTrader[];
  positions: HlOpenPosition[];
  entries: HlRecentEntry[];
  entriesLoading: boolean;
  entryHours: number;
  entryMin: number;
  pinnedIds: Set<string>;
  scoreFilter: ScoreFilter;
  onScoreFilterChange: (f: ScoreFilter) => void;
  onTogglePin: (id: string) => void;
  onHoursChange: (h: number) => void;
  onMinChange: (n: number) => void;
  onRefreshEntries: () => void;
  onOpenTrader: (id: string) => void;
}) {
  const traderById = useMemo(() => {
    const m = new Map(traders.map((t) => [t.id, t]));
    return m;
  }, [traders]);

  const visibleEntries = useMemo(
    () => entries.filter((e) => e.notional >= entryMin),
    [entries, entryMin]
  );
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const entryKey = (e: HlRecentEntry) =>
    `${e.traderId}-${e.coin}-${e.side}-${e.firstTime}`;
  const focusEntry = focusKey
    ? visibleEntries.find((e) => entryKey(e) === focusKey) ?? null
    : null;
  const focusPosition = focusEntry
    ? positions.find(
        (p) =>
          p.trader_id === focusEntry.traderId &&
          p.coin === focusEntry.coin &&
          p.side === focusEntry.side
      ) ?? null
    : null;

  const lastEntryByTrader = useMemo(() => {
    const m = new Map<string, HlRecentEntry>();
    for (const e of visibleEntries) {
      const cur = m.get(e.traderId);
      if (!cur || e.lastTime > cur.lastTime) m.set(e.traderId, e);
    }
    return m;
  }, [visibleEntries]);

  const cards = useMemo(() => {
    return traders
      .map((t) => {
        const list = positions
          .filter((p) => p.trader_id === t.id)
          .map((p) => ({ ...p, value: Math.abs(Number(p.position_value ?? 0)) }))
          .sort((a, b) => b.value - a.value);
        const longNtl = list
          .filter((p) => p.side === "LONG")
          .reduce((s, p) => s + p.value, 0);
        const shortNtl = list
          .filter((p) => p.side === "SHORT")
          .reduce((s, p) => s + p.value, 0);
        const upnl = list.reduce(
          (s, p) => s + Number(p.unrealised_pnl ?? 0),
          0
        );
        const exposure = longNtl + shortNtl;
        const imp = importanceScore(t, {
          pinned: pinnedIds.has(t.id),
          hasRecentEntry: lastEntryByTrader.has(t.id),
          exposureUsd: exposure,
        });
        return {
          trader: t,
          list,
          longNtl,
          shortNtl,
          upnl,
          last: lastEntryByTrader.get(t.id) ?? null,
          imp,
        };
      })
      .filter((c) => {
        if (scoreFilter === "focus") return c.imp.tier === "focus";
        if (scoreFilter === "watch")
          return c.imp.tier === "focus" || c.imp.tier === "watch";
        return true;
      })
      .sort((a, b) => {
        if (a.imp.score !== b.imp.score) return b.imp.score - a.imp.score;
        const ta = a.last?.lastTime ?? 0;
        const tb = b.last?.lastTime ?? 0;
        if (ta !== tb) return tb - ta;
        return b.longNtl + b.shortNtl - (a.longNtl + a.shortNtl);
      });
  }, [traders, positions, lastEntryByTrader, pinnedIds, scoreFilter]);

  const coinSummary = useMemo(() => {
    const m = new Map<string, { long: number; short: number; traders: Set<string> }>();
    for (const e of visibleEntries) {
      const cur = m.get(e.coin) ?? { long: 0, short: 0, traders: new Set() };
      if (e.side === "LONG") cur.long += e.notional;
      else cur.short += e.notional;
      cur.traders.add(e.traderId);
      m.set(e.coin, cur);
    }
    return [...m.entries()]
      .map(([coin, v]) => ({ coin, ...v, count: v.traders.size }))
      .filter((c) => c.count >= 2)
      .sort((a, b) => b.count - a.count || b.long + b.short - (a.long + a.short))
      .slice(0, 8);
  }, [visibleEntries]);

  if (traders.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        관심 트레이더가 없습니다. 주소를 추가하거나 리더보드에서 따라가세요.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <HlBiasPanel />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-zinc-500">
          점수 = 실적·규모·최근진입·핀. 65↑ 주목 · 40↑ 관심
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", "전체"],
              ["focus", "주목만"],
              ["watch", "관심↑"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => onScoreFilterChange(k)}
              className={`rounded border px-2 py-0.5 text-[11px] ${
                scoreFilter === k
                  ? "border-sky-600/60 text-sky-300"
                  : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-zinc-200">
            최근 진입
            <span className="ml-2 text-xs font-normal text-zinc-500">
              {visibleEntries.length}건 · HL 체결 기준
            </span>
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {ENTRY_HOURS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => onHoursChange(h)}
                className={`rounded border px-2 py-0.5 text-[11px] ${
                  entryHours === h
                    ? "border-emerald-600/60 text-emerald-300"
                    : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {h}h
              </button>
            ))}
            <span className="mx-1 h-3 w-px bg-zinc-800" />
            {ENTRY_MIN_NOTIONAL.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onMinChange(n)}
                className={`rounded border px-2 py-0.5 text-[11px] ${
                  entryMin === n
                    ? "border-emerald-600/60 text-emerald-300"
                    : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {n === 0 ? "전체" : `≥${fmtUsdCompact(n)}`}
              </button>
            ))}
            <button
              type="button"
              disabled={entriesLoading}
              onClick={onRefreshEntries}
              className="ml-1 rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
            >
              {entriesLoading ? "불러오는 중…" : "새로고침"}
            </button>
          </div>
        </div>

        {coinSummary.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {coinSummary.map((c) => {
              const longBias = c.long >= c.short;
              return (
                <span
                  key={c.coin}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                    longBias
                      ? "border-emerald-700/50 text-emerald-300"
                      : "border-rose-700/50 text-rose-300"
                  }`}
                  title={`롱 ${fmtUsdCompact(c.long)} / 숏 ${fmtUsdCompact(c.short)}`}
                >
                  {c.coin} · {c.count}명 {longBias ? "롱" : "숏"} 우세
                </span>
              );
            })}
          </div>
        )}

        {focusEntry && (
          <div className="mb-3">
            <HlEntryChart
              key={focusKey}
              entry={focusEntry}
              position={focusPosition}
              trader={traderById.get(focusEntry.traderId) ?? null}
              onClose={() => setFocusKey(null)}
            />
          </div>
        )}

        {entriesLoading && entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">
            체결 불러오는 중…
          </p>
        ) : visibleEntries.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">
            조건에 맞는 최근 진입이 없습니다.
          </p>
        ) : (
          <div className="space-y-4">
            <HlEntryTimeline
              entries={visibleEntries}
              focusKey={focusKey}
              entryKey={entryKey}
              onSelect={(e) =>
                setFocusKey((k) =>
                  k === entryKey(e) ? null : entryKey(e)
                )
              }
            />

            <details className="group">
              <summary className="cursor-pointer list-none text-[11px] text-zinc-500 hover:text-zinc-300">
                목록으로 보기
                <span className="ml-1 text-zinc-600 group-open:hidden">▾</span>
                <span className="ml-1 hidden text-zinc-600 group-open:inline">
                  ▴
                </span>
              </summary>
              <div className="mt-2 max-h-[320px] overflow-auto pretty-scroll">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="sticky top-0 border-b border-zinc-800 bg-zinc-950 text-[11px] uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">시각</th>
                      <th className="px-2 py-1.5 font-medium">트레이더</th>
                      <th className="px-2 py-1.5 font-medium">신뢰</th>
                      <th className="px-2 py-1.5 font-medium">코인</th>
                      <th className="px-2 py-1.5 font-medium">방향</th>
                      <th className="px-2 py-1.5 font-medium">규모</th>
                      <th className="px-2 py-1.5 font-medium">평균가</th>
                      <th className="px-2 py-1.5 font-medium">체결</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEntries.map((e) => (
                      <tr
                        key={entryKey(e)}
                        onClick={() =>
                          setFocusKey((k) =>
                            k === entryKey(e) ? null : entryKey(e)
                          )
                        }
                        className={`cursor-pointer border-b border-zinc-900/80 text-zinc-300 hover:bg-zinc-800/40 ${
                          focusKey === entryKey(e) ? "bg-zinc-800/60" : ""
                        }`}
                      >
                        <td
                          className="px-2 py-1.5 text-xs text-zinc-500"
                          title={formatKst(e.lastTime)}
                        >
                          {timeAgo(e.lastTime)}
                        </td>
                        <td className="px-2 py-1.5">
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              onOpenTrader(e.traderId);
                            }}
                            className="text-left text-zinc-200 hover:text-emerald-300 hover:underline"
                          >
                            {e.label || shortAddr(e.address)}
                          </button>
                        </td>
                        <td className="px-2 py-1.5">
                          {traderById.get(e.traderId) ? (
                            <HlTraderPerfBadge
                              trader={traderById.get(e.traderId)!}
                              compact
                            />
                          ) : (
                            <span className="text-[11px] text-zinc-600">-</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 font-medium text-zinc-100">
                          {e.coin}
                        </td>
                        <td
                          className={`px-2 py-1.5 ${
                            e.side === "LONG"
                              ? "text-emerald-400"
                              : "text-rose-400"
                          }`}
                        >
                          {e.side}
                          {e.kind === "FLIP" ? (
                            <span className="ml-1 rounded bg-zinc-800 px-1 text-[10px] text-amber-300">
                              플립
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums">
                          {fmtUsdCompact(e.notional)}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums text-zinc-400">
                          {e.avgPx.toLocaleString(undefined, {
                            maximumSignificantDigits: 6,
                          })}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums text-zinc-500">
                          {e.fills}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        )}
      </div>

      {cards.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">
          필터에 맞는 트레이더가 없습니다. 점수 필터를 낮추거나 핀을
          고정해 보세요.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ trader, list, longNtl, shortNtl, upnl, last, imp }) => {
          const total = longNtl + shortNtl;
          const longPct = total > 0 ? (longNtl / total) * 100 : 0;
          const pinned = pinnedIds.has(trader.id);
          return (
            <div
              key={trader.id}
              className={`flex flex-col gap-2 rounded-md border bg-zinc-950/40 p-3 text-left transition ${
                imp.tier === "focus"
                  ? "border-sky-700/50"
                  : "border-zinc-800 hover:border-zinc-600"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onOpenTrader(trader.id)}
                  className="truncate font-medium text-zinc-100 hover:text-emerald-300 hover:underline"
                >
                  {trader.label || shortAddr(trader.address)}
                </button>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    title={pinned ? "핀 해제" : "핀 고정"}
                    onClick={() => onTogglePin(trader.id)}
                    className={`rounded border px-1.5 py-0.5 text-[10px] ${
                      pinned
                        ? "border-sky-600/60 text-sky-300"
                        : "border-zinc-800 text-zinc-600 hover:text-zinc-400"
                    }`}
                  >
                    {pinned ? "핀" : "고정"}
                  </button>
                  <span className="text-xs tabular-nums text-zinc-500">
                    {fmtUsdCompact(
                      trader.account_value != null
                        ? Number(trader.account_value)
                        : null
                    )}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenTrader(trader.id)}
                className="text-left"
              >
                <HlTraderPerfBadge
                  trader={trader}
                  compact
                  importance={imp}
                />
              </button>

              {total > 0 ? (
                <>
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-rose-500/60">
                    <div
                      className="bg-emerald-500/80"
                      style={{ width: `${longPct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] tabular-nums">
                    <span className="text-emerald-400">
                      롱 {fmtUsdCompact(longNtl)}
                    </span>
                    <span className={pnlClass(upnl)}>
                      미실현 {fmtUsdCompact(upnl)}
                    </span>
                    <span className="text-rose-400">
                      숏 {fmtUsdCompact(shortNtl)}
                    </span>
                  </div>
                  <ul className="space-y-0.5 text-xs">
                    {list.slice(0, 3).map((p) => (
                      <li key={p.id} className="flex justify-between gap-2">
                        <span>
                          <span className="text-zinc-300">{p.coin}</span>
                          <span
                            className={`ml-1.5 ${
                              p.side === "LONG"
                                ? "text-emerald-400/80"
                                : "text-rose-400/80"
                            }`}
                          >
                            {p.side === "LONG" ? "L" : "S"}
                            {p.leverage != null ? ` ${p.leverage}x` : ""}
                          </span>
                        </span>
                        <span className="tabular-nums text-zinc-500">
                          {fmtUsdCompact(p.value)}
                        </span>
                      </li>
                    ))}
                    {list.length > 3 && (
                      <li className="text-[11px] text-zinc-600">
                        외 {list.length - 3}개
                      </li>
                    )}
                  </ul>
                </>
              ) : (
                <p className="text-xs text-zinc-600">열린 포지션 없음</p>
              )}

              <button
                type="button"
                onClick={() => onOpenTrader(trader.id)}
                className="mt-auto border-t border-zinc-800/80 pt-1.5 text-left text-[11px]"
              >
                {last ? (
                  <span className="text-zinc-400">
                    최근 진입{" "}
                    <span className="text-zinc-200">{last.coin}</span>{" "}
                    <span
                      className={
                        last.side === "LONG"
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }
                    >
                      {last.side}
                    </span>{" "}
                    {fmtUsdCompact(last.notional)} · {timeAgo(last.lastTime)}
                  </span>
                ) : (
                  <span className="text-zinc-600">
                    {entryHours}h 내 진입 없음
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PortfolioMini({
  title,
  points,
  asPnl,
}: {
  title: string;
  points: Array<{ time: number; value: number }>;
  asPnl?: boolean;
}) {
  if (points.length < 2) {
    return (
      <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
        <p className="text-xs text-zinc-500">{title}</p>
        <p className="mt-2 text-sm text-zinc-600">데이터 부족</p>
      </div>
    );
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const last = values[values.length - 1];
  const first = values[0];
  const delta = last - first;
  const range = max - min || 1;
  const w = 220;
  const h = 48;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p.value - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-xs text-zinc-500">{title}</p>
        <p className={`text-sm tabular-nums ${pnlClass(asPnl ? last : delta)}`}>
          {asPnl ? formatPnl(last) : formatPnl(delta)}
        </p>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full text-emerald-400/80">
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
