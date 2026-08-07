"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Trade } from "@/lib/exchanges/types";
import type {
  DailyPnl,
  MonthlyStat,
  OverallStats,
} from "@/lib/stats/compute";
import { dayKeyKst } from "@/lib/stats/compute";
import type { WalletOverview } from "@/lib/exchanges/wallet";
import type { FearGreed, MarketTicker } from "@/lib/exchanges/market";
import { TradeChartCard } from "./TradeChartCard";
import { SyncButton } from "./SyncButton";
import { StatsPanels } from "./StatsPanels";
import { MarketPanel } from "./MarketPanel";
import { BookmarkPanel } from "./BookmarkPanel";
import { CollapsiblePositions } from "./CollapsiblePositions";
import { CashLedgerPanel } from "./CashLedgerPanel";
import { KellyPanel } from "./KellyPanel";
import { MindsetPanel } from "./MindsetPanel";
import { JournalPostsPanel } from "./JournalPostsPanel";
import { ScreenerPanel } from "./screener/ScreenerPanel";
import { ScreenerPerfPanel } from "./screener/ScreenerPerfPanel";
import { WatchEvaluatePanel } from "./screener/WatchEvaluatePanel";
import { EquityCurvePanel } from "./EquityCurvePanel";
import { ReviewCommentsFeed } from "./ReviewCommentsFeed";
import { AlarmSettingsButton } from "./AlarmSettingsButton";
import { AlarmToastHost } from "./AlarmToastHost";
import { AlertsPanel } from "./AlertsPanel";
import {
  checkNewTradeFills,
  checkPositionAlarms,
  checkPositionChanges,
} from "@/lib/alarms/notify";
import {
  ALARM_HISTORY_EVENT,
  unreadAlarmCount,
} from "@/lib/alarms/history";
import type { AlarmTargetTab } from "@/lib/alarms/toast";
import { loadSavedTab, saveTab } from "@/lib/prefs";
import { exchangeLabel, statusLabel } from "@/lib/utils/labels";
import { useRouter } from "next/navigation";

type Tab =
  | "trades"
  | "review"
  | "live"
  | "overview"
  | "cash"
  | "mindset"
  | "posts"
  | "screener"
  | "screener-watch"
  | "screener-perf"
  | "alerts"
  | "bookmarks";
type SortKey = "newest" | "oldest" | "pnl_desc" | "pnl_asc";
type PeriodMode = "all" | "year" | "month" | "range";
type RangePreset = "today" | "7d" | "30d" | "custom";

const TAB_IDS: Tab[] = [
  "trades",
  "review",
  "live",
  "overview",
  "cash",
  "mindset",
  "posts",
  "screener",
  "screener-watch",
  "screener-perf",
  "alerts",
  "bookmarks",
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "최신순" },
  { value: "oldest", label: "오래된순" },
  { value: "pnl_desc", label: "수익 높은순" },
  { value: "pnl_asc", label: "수익 낮은순" },
];

const PERIOD_OPTIONS: { value: PeriodMode; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "year", label: "연도별" },
  { value: "month", label: "월별" },
  { value: "range", label: "기간별" },
];

const RANGE_PRESETS: { value: Exclude<RangePreset, "custom">; label: string }[] =
  [
    { value: "today", label: "오늘" },
    { value: "7d", label: "7일" },
    { value: "30d", label: "한달" },
  ];

function kstToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function addDaysKst(yyyyMmDd: string, deltaDays: number): string {
  const d = new Date(`${yyyyMmDd}T12:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function rangeForPreset(preset: Exclude<RangePreset, "custom">): {
  from: string;
  to: string;
} {
  const to = kstToday();
  if (preset === "today") return { from: to, to };
  if (preset === "7d") return { from: addDaysKst(to, -6), to };
  return { from: addDaysKst(to, -29), to };
}

function isMissingTable(msg: string | null): boolean {
  if (!msg) return false;
  return (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("Could not find the table")
  );
}

function sortTrades(list: Trade[], sort: SortKey): Trade[] {
  const arr = [...list];
  switch (sort) {
    case "oldest":
      return arr.sort(
        (a, b) =>
          new Date(a.exit_time).getTime() - new Date(b.exit_time).getTime()
      );
    case "pnl_desc":
      return arr.sort((a, b) => Number(b.pnl) - Number(a.pnl));
    case "pnl_asc":
      return arr.sort((a, b) => Number(a.pnl) - Number(b.pnl));
    case "newest":
    default:
      return arr.sort(
        (a, b) =>
          new Date(b.exit_time).getTime() - new Date(a.exit_time).getTime()
      );
  }
}

function filterTradesByPeriod(
  list: Trade[],
  mode: PeriodMode,
  year: string,
  month: string,
  rangeFrom: string,
  rangeTo: string
): Trade[] {
  if (mode === "all") return list;
  return list.filter((t) => {
    const day = dayKeyKst(t.exit_time);
    if (mode === "year") return year ? day.startsWith(year) : true;
    if (mode === "month") return month ? day.startsWith(month) : true;
    if (mode === "range") {
      if (rangeFrom && day < rangeFrom) return false;
      if (rangeTo && day > rangeTo) return false;
      return true;
    }
    return true;
  });
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${y}년 ${Number(m)}월`;
}

function tradeMatchesSearch(
  trade: Trade,
  query: string,
  commentText: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const sideKo = trade.side === "LONG" ? "롱" : "숏";
  const style = trade.trade_style ?? "";
  const tags = (trade.tags ?? []).join(" ");
  const haystack = [
    trade.symbol,
    trade.base_asset ?? "",
    trade.side,
    sideKo,
    trade.exchange,
    exchangeLabel(trade.exchange),
    trade.status,
    statusLabel(trade.status),
    trade.notes ?? "",
    tags,
    style,
    String(trade.pnl ?? ""),
    String(trade.entry_price ?? ""),
    String(trade.exit_price ?? ""),
    commentText,
    trade.is_review ? "오답노트 오답" : "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

export function TradeJournal() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("trades");
  const [tabReady, setTabReady] = useState(false);
  const [sort, setSort] = useState<SortKey>("newest");
  const [periodMode, setPeriodMode] = useState<PeriodMode>("all");
  const [filterYear, setFilterYear] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [rangePreset, setRangePreset] = useState<RangePreset>("7d");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradesLoading, setTradesLoading] = useState(true);
  const [tradesError, setTradesError] = useState<string | null>(null);
  const [tradeSearch, setTradeSearch] = useState("");
  const [cardsExpandedDefault, setCardsExpandedDefault] = useState(true);
  const [cardOpenOverrides, setCardOpenOverrides] = useState<
    Record<string, boolean>
  >({});
  const [commentTextByTrade, setCommentTextByTrade] = useState<
    Record<string, string>
  >({});
  const seenTradeIds = useRef<Set<string> | null>(null);
  const seenPositionKeys = useRef<Set<string> | null>(null);
  const [alertUnread, setAlertUnread] = useState(0);
  const [highlightTradeId, setHighlightTradeId] = useState<string | null>(
    null
  );

  useEffect(() => {
    setTab(loadSavedTab<Tab>("trades", TAB_IDS));
    setTabReady(true);
  }, []);

  useEffect(() => {
    if (!tabReady) return;
    saveTab(tab);
  }, [tab, tabReady]);

  const goToAlarmTab = useCallback((target: AlarmTargetTab | Tab) => {
    if ((TAB_IDS as string[]).includes(target)) {
      setTab(target as Tab);
    }
  }, []);

  const focusTrade = useCallback((tradeId: string) => {
    setPeriodMode("all");
    setTradeSearch("");
    setTab("trades");
    setCardsExpandedDefault(false);
    setCardOpenOverrides({ [tradeId]: true });
    setHighlightTradeId(tradeId);
    window.setTimeout(() => {
      document
        .getElementById(`trade-${tradeId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 280);
    window.setTimeout(() => {
      setHighlightTradeId((cur) => (cur === tradeId ? null : cur));
    }, 4000);
  }, []);

  useEffect(() => {
    const sync = () => setAlertUnread(unreadAlarmCount());
    sync();
    window.addEventListener(ALARM_HISTORY_EVENT, sync);
    return () => window.removeEventListener(ALARM_HISTORY_EVENT, sync);
  }, []);

  const [overall, setOverall] = useState<OverallStats | null>(null);
  const [monthly, setMonthly] = useState<MonthlyStat[]>([]);
  const [daily, setDaily] = useState<DailyPnl[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [walletOverview, setWalletOverview] = useState<WalletOverview | null>(
    null
  );
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletError, setWalletError] = useState<string | null>(null);

  const [tickers, setTickers] = useState<MarketTicker[]>([]);
  const [fearGreed, setFearGreed] = useState<FearGreed | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);

  const loadTrades = useCallback(async () => {
    setTradesLoading(true);
    setTradesError(null);
    try {
      const res = await fetch(`/api/trades?limit=200&sort=${sort}`);
      const data = (await res.json()) as { trades?: Trade[]; error?: string };
      let list: Trade[] = [];
      if (data.error) {
        // is_review 컬럼 없을 때 폴백
        if (data.error.includes("is_review")) {
          const res2 = await fetch("/api/trades?limit=200");
          const data2 = (await res2.json()) as {
            trades?: Trade[];
            error?: string;
          };
          if (data2.error) throw new Error(data2.error);
          list = sortTrades(data2.trades ?? [], sort);
        } else {
          throw new Error(data.error);
        }
      } else {
        list = data.trades ?? [];
      }
      setTrades(list);
      seenTradeIds.current = checkNewTradeFills(
        list.map((t) => t.id),
        list.map((t) => ({
          id: t.id,
          label: `${t.base_asset ?? t.symbol} ${t.side === "LONG" ? "롱" : "숏"} ${Number(t.pnl) >= 0 ? "+" : ""}${Number(t.pnl).toFixed(2)}`,
        })),
        seenTradeIds.current
      );
    } catch (err) {
      setTradesError(err instanceof Error ? err.message : "불러오기 실패");
    } finally {
      setTradesLoading(false);
    }
  }, [sort]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await fetch("/api/stats");
      const data = (await res.json()) as {
        overall?: OverallStats;
        monthly?: MonthlyStat[];
        daily?: DailyPnl[];
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setOverall(data.overall ?? null);
      setMonthly(data.monthly ?? []);
      setDaily(data.daily ?? []);
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : "통계 불러오기 실패");
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadWallet = useCallback(async () => {
    setWalletLoading(true);
    setWalletError(null);
    try {
      const res = await fetch("/api/wallet");
      const data = (await res.json()) as WalletOverview & { error?: string };
      if (data.error) throw new Error(data.error);
      setWalletOverview({
        accounts: data.accounts ?? [],
        wallet: data.wallet ?? null,
        positions: data.positions ?? [],
        totalEquity: data.totalEquity ?? 0,
        totalWalletBalance: data.totalWalletBalance ?? 0,
        totalAvailableBalance: data.totalAvailableBalance ?? 0,
        totalPerpUPL: data.totalPerpUPL ?? 0,
      });
      checkPositionAlarms(data.positions ?? []);
      seenPositionKeys.current = checkPositionChanges(
        data.positions ?? [],
        seenPositionKeys.current
      );
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : "지갑 불러오기 실패");
    } finally {
      setWalletLoading(false);
    }
  }, []);

  const loadMarket = useCallback(async () => {
    setMarketLoading(true);
    setMarketError(null);
    try {
      const res = await fetch("/api/market");
      const data = (await res.json()) as {
        tickers?: MarketTicker[];
        fearGreed?: FearGreed | null;
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setTickers(data.tickers ?? []);
      setFearGreed(data.fearGreed ?? null);
    } catch (err) {
      setMarketError(err instanceof Error ? err.message : "시장 불러오기 실패");
    } finally {
      setMarketLoading(false);
    }
  }, []);

  const loadCommentIndex = useCallback(async () => {
    try {
      const res = await fetch("/api/trades/comments");
      const data = (await res.json()) as {
        comments?: { trade_id: string; body: string }[];
        error?: string;
      };
      if (data.error) return;
      const map: Record<string, string[]> = {};
      for (const c of data.comments ?? []) {
        (map[c.trade_id] ??= []).push(c.body);
      }
      setCommentTextByTrade(
        Object.fromEntries(
          Object.entries(map).map(([id, bodies]) => [id, bodies.join("\n")])
        )
      );
    } catch {
      /* 검색 보조 — 실패해도 매매 목록은 유지 */
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadTrades(),
      loadStats(),
      loadWallet(),
      loadMarket(),
      loadCommentIndex(),
    ]);
  }, [loadTrades, loadStats, loadWallet, loadMarket, loadCommentIndex]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    // 포지션 알람용 — 탭과 무관하게 60초마다 갱신
    const id = setInterval(() => void loadWallet(), 60_000);
    return () => clearInterval(id);
  }, [loadWallet]);

  const positions = walletOverview?.positions ?? [];
  const positionCount = positions.length;
  const dbHint = isMissingTable(tradesError) || isMissingTable(statsError);

  const reviewTrades = useMemo(
    () =>
      trades.filter(
        (t) => t.is_review || (t.tags ?? []).includes("오답노트")
      ),
    [trades]
  );

  const yearOptions = useMemo(() => {
    const set = new Set(trades.map((t) => dayKeyKst(t.exit_time).slice(0, 4)));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [trades]);

  const monthOptions = useMemo(() => {
    const set = new Set(trades.map((t) => dayKeyKst(t.exit_time).slice(0, 7)));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [trades]);

  useEffect(() => {
    if (periodMode === "year" && !filterYear && yearOptions[0]) {
      setFilterYear(yearOptions[0]);
    }
    if (periodMode === "month" && !filterMonth && monthOptions[0]) {
      setFilterMonth(monthOptions[0]);
    }
  }, [periodMode, filterYear, filterMonth, yearOptions, monthOptions]);

  const baseList = tab === "review" ? reviewTrades : trades;
  const filtered = useMemo(
    () =>
      filterTradesByPeriod(
        baseList,
        periodMode,
        filterYear,
        filterMonth,
        rangeFrom,
        rangeTo
      ),
    [baseList, periodMode, filterYear, filterMonth, rangeFrom, rangeTo]
  );
  const searched = useMemo(
    () =>
      filtered.filter((t) =>
        tradeMatchesSearch(t, tradeSearch, commentTextByTrade[t.id] ?? "")
      ),
    [filtered, tradeSearch, commentTextByTrade]
  );
  const displayed = useMemo(
    () => sortTrades(searched, sort),
    [searched, sort]
  );

  function isCardOpen(tradeId: string) {
    return cardOpenOverrides[tradeId] ?? cardsExpandedDefault;
  }

  function expandAllCards() {
    setCardsExpandedDefault(true);
    setCardOpenOverrides({});
  }

  function collapseAllCards() {
    setCardsExpandedDefault(false);
    setCardOpenOverrides({});
  }

  function applyRangePreset(preset: Exclude<RangePreset, "custom">) {
    const { from, to } = rangeForPreset(preset);
    setRangeFrom(from);
    setRangeTo(to);
    setRangePreset(preset);
  }

  function selectPeriodMode(mode: PeriodMode) {
    setPeriodMode(mode);
    if (mode === "range") {
      applyRangePreset(rangePreset === "custom" ? "7d" : rangePreset);
    }
  }

  const periodSummary = useMemo(() => {
    if (periodMode === "all") return "전체 기간";
    if (periodMode === "year") return filterYear ? `${filterYear}년` : "연도 선택";
    if (periodMode === "month")
      return filterMonth ? monthLabel(filterMonth) : "월 선택";
    if (periodMode === "range") {
      const presetLabel =
        RANGE_PRESETS.find((p) => p.value === rangePreset)?.label ?? "직접 지정";
      if (!rangeFrom && !rangeTo) return "기간 선택";
      return `${presetLabel} · ${rangeFrom || "…"} ~ ${rangeTo || "…"}`;
    }
    return "";
  }, [periodMode, filterYear, filterMonth, rangeFrom, rangeTo, rangePreset]);

  const sortLabel =
    SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "최신순";

  function handleTradeUpdated(updated: Trade) {
    setTrades((prev) =>
      prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t))
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-[0.15em] text-zinc-500">
            데일리 트레이딩
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-50">
            매매 대시보드
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <AlarmSettingsButton />
          <button
            type="button"
            onClick={() => void refreshAll()}
            className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
          >
            새로고침
          </button>
          <SyncButton
            onSynced={() => {
              void loadTrades();
              void loadStats();
              void loadCommentIndex();
            }}
          />
          <button
            type="button"
            onClick={() => {
              void (async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                router.replace("/login");
                router.refresh();
              })();
            }}
            className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-500 transition hover:border-zinc-500 hover:text-zinc-300"
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* 실시간 포지션 — 기본 접힘 */}
      <div className="mb-6">
        <CollapsiblePositions
          overview={walletOverview}
          loading={walletLoading}
          error={walletError}
          defaultOpen={false}
        />
      </div>

      {dbHint && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-100">
          <p className="font-medium">매매 기록을 보려면 DB 테이블이 필요합니다</p>
          <p className="mt-2 text-xs text-zinc-500">
            `001_trading_journal.sql` 과 `003_review_notes.sql` 을 실행하세요.
          </p>
        </div>
      )}

      <nav className="pretty-scroll mb-4 flex gap-1 overflow-x-auto border-b border-zinc-800 pb-px">
        {(
          [
            ["trades", "매매 기록"],
            ["review", "오답노트"],
            ["live", "실시간"],
            ["overview", "한눈에"],
            ["screener", "코인 스크리너"],
            ["screener-watch", "지정 평가"],
            ["screener-perf", "스크리너 성과"],
            ["alerts", "알림"],
            ["cash", "입출금"],
            ["mindset", "매매 마인드"],
            ["posts", "글"],
            ["bookmarks", "즐겨찾기"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id as Tab)}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm transition ${
              tab === id
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
            {id === "trades" && trades.length > 0 ? ` (${trades.length})` : ""}
            {id === "review" && reviewTrades.length > 0
              ? ` (${reviewTrades.length})`
              : ""}
            {id === "live" && positionCount > 0
              ? ` (${positionCount})`
              : ""}
            {id === "alerts" && alertUnread > 0 ? ` (${alertUnread})` : ""}
          </button>
        ))}
      </nav>

      {tab === "review" && (
        <ReviewCommentsFeed trades={trades} onOpenTrade={focusTrade} />
      )}

      {(tab === "trades" || tab === "review") && (
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {PERIOD_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => selectPeriodMode(o.value)}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                  periodMode === o.value
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                    : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                }`}
              >
                {o.label}
              </button>
            ))}

            {periodMode === "year" && (
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-emerald-500/50"
              >
                {yearOptions.length === 0 && (
                  <option value="">연도 없음</option>
                )}
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}년
                  </option>
                ))}
              </select>
            )}

            {periodMode === "month" && (
              <select
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-emerald-500/50"
              >
                {monthOptions.length === 0 && (
                  <option value="">월 없음</option>
                )}
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            )}

            {periodMode === "range" && (
              <div className="flex flex-wrap items-center gap-2">
                {RANGE_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => applyRangePreset(p.value)}
                    className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                      rangePreset === p.value
                        ? "border-sky-500/50 bg-sky-500/10 text-sky-300"
                        : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <input
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => {
                    setRangeFrom(e.target.value);
                    setRangePreset("custom");
                    if (!rangeTo) setRangeTo(kstToday());
                  }}
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-200 outline-none focus:border-emerald-500/50"
                />
                <span className="text-xs text-zinc-600">~</span>
                <input
                  type="date"
                  value={rangeTo}
                  onChange={(e) => {
                    setRangeTo(e.target.value || kstToday());
                    setRangePreset("custom");
                  }}
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-200 outline-none focus:border-emerald-500/50"
                />
              </div>
            )}

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={expandAllCards}
                className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200"
              >
                전체펼치기
              </button>
              <button
                type="button"
                onClick={collapseAllCards}
                className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200"
              >
                전체접기
              </button>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-emerald-500/50"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="relative">
            <input
              type="search"
              value={tradeSearch}
              onChange={(e) => setTradeSearch(e.target.value)}
              placeholder="검색: 코인, 롱/숏, 댓글, 원칙/뇌동, 오답…"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50"
            />
            {tradeSearch.trim() && (
              <button
                type="button"
                onClick={() => setTradeSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-300"
              >
                지우기
              </button>
            )}
          </div>

          <p className="text-xs text-zinc-500">
            {periodSummary}
            {" · "}
            <span className="text-zinc-300">{displayed.length}건</span>
            {tradeSearch.trim() && filtered.length !== displayed.length
              ? ` (검색 전 ${filtered.length}건)`
              : periodMode !== "all" && baseList.length !== filtered.length
                ? ` (전체 ${baseList.length}건 중)`
                : ""}
            {" · "}
            정렬 <span className="text-zinc-300">{sortLabel}</span>
            {tab === "review" &&
              " · 위 댓글 모아보기 + 오답노트 지정 매매"}
            {" · "}
            <span className="text-zinc-600">청산일 KST 기준</span>
          </p>
        </div>
      )}

      {(tab === "trades" || tab === "review") && (
        <div className="space-y-8">
          {tradesLoading && (
            <p className="py-16 text-center text-sm text-zinc-500">
              매매 기록을 불러오는 중…
            </p>
          )}

          {tradesError && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-200">
              <p className="font-medium">매매 기록을 불러올 수 없습니다</p>
              <p className="mt-2 text-amber-200/70">{tradesError}</p>
            </div>
          )}

          {!tradesLoading && !tradesError && displayed.length === 0 && (
            <div className="rounded-lg border border-dashed border-zinc-700 p-10 text-center">
              <p className="text-zinc-300">
                {tradeSearch.trim()
                  ? "검색 결과가 없습니다"
                  : tab === "review"
                    ? periodMode !== "all" && reviewTrades.length > 0
                      ? "선택한 기간에 오답노트가 없습니다"
                      : "오답노트에 지정된 매매가 없습니다"
                    : periodMode !== "all" && trades.length > 0
                      ? "선택한 기간에 매매 기록이 없습니다"
                      : "아직 기록된 매매가 없습니다"}
              </p>
              <p className="mt-2 text-sm text-zinc-500">
                {tradeSearch.trim()
                  ? "다른 키워드로 검색하거나 검색어를 지워보세요."
                  : tab === "review"
                    ? "매매 기록에서 「오답노트 지정」을 눌러 추가하세요."
                    : periodMode !== "all" && trades.length > 0
                      ? "기간 필터를 「전체」로 바꾸거나 다른 월/연도를 선택하세요."
                      : "「거래소 동기화」로 기록을 가져오세요."}
              </p>
            </div>
          )}

          {displayed.map((trade) => (
            <TradeChartCard
              key={trade.id}
              trade={trade}
              open={isCardOpen(trade.id)}
              highlighted={highlightTradeId === trade.id}
              onOpenChange={(next) =>
                setCardOpenOverrides((prev) => ({ ...prev, [trade.id]: next }))
              }
              onUpdated={handleTradeUpdated}
              onCommentsMutated={() => void loadCommentIndex()}
            />
          ))}
        </div>
      )}

      {tab === "live" && (
        <div className="space-y-4">
          <CollapsiblePositions
            overview={walletOverview}
            loading={walletLoading}
            error={walletError}
            defaultOpen
          />
          <p className="text-xs text-zinc-600">60초마다 자동 갱신됩니다.</p>
        </div>
      )}

      {tab === "overview" && (
        <div className="space-y-6">
          <Section title="자산 그래프">
            <EquityCurvePanel
              daily={daily}
              totalPnl={overall?.totalPnl ?? 0}
              wallet={walletOverview}
              walletLoading={walletLoading}
            />
          </Section>
          <Section title="All-time PNL">
            <StatsPanels
              overall={overall}
              monthly={monthly}
              daily={daily}
              trades={trades}
              loading={statsLoading}
              error={statsError}
            />
          </Section>
          <Section title="현재 시장">
            <MarketPanel
              tickers={tickers}
              fearGreed={fearGreed}
              loading={marketLoading}
              error={marketError}
            />
          </Section>
          <Section title="켈리 베팅">
            <KellyPanel
              overall={overall}
              loading={statsLoading}
              defaultBankroll={walletOverview?.totalEquity ?? null}
            />
          </Section>
        </div>
      )}

      {tab === "screener" && (
        <Section title="코인 스크리너">
          <ScreenerPanel />
        </Section>
      )}

      {tab === "screener-watch" && (
        <Section title="지정 종목 평가">
          <WatchEvaluatePanel />
        </Section>
      )}

      {tab === "screener-perf" && (
        <Section title="스크리너 성과">
          <ScreenerPerfPanel />
        </Section>
      )}

      {tab === "alerts" && (
        <Section title="알림 모아보기">
          <AlertsPanel onNavigate={goToAlarmTab} />
        </Section>
      )}

      {tab === "cash" && (
        <Section title="현금 입출금">
          <CashLedgerPanel />
        </Section>
      )}

      {tab === "mindset" && (
        <Section title="매매 마인드">
          <MindsetPanel />
        </Section>
      )}

      {tab === "posts" && (
        <Section title="글 · 후기">
          <JournalPostsPanel />
        </Section>
      )}

      {tab === "bookmarks" && (
        <Section title="사이트 즐겨찾기">
          <BookmarkPanel />
        </Section>
      )}

      <AlarmToastHost onNavigate={goToAlarmTab} />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
      <h2 className="mb-4 text-base font-semibold text-zinc-100">{title}</h2>
      {children}
    </section>
  );
}
