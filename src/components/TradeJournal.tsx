"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Trade } from "@/lib/exchanges/types";
import type {
  DailyPnl,
  HourStat,
  MonthlyStat,
  OverallStats,
} from "@/lib/stats/compute";
import type { WalletOverview } from "@/lib/exchanges/wallet";
import type { FearGreed, MarketTicker } from "@/lib/exchanges/market";
import { SyncButton } from "./SyncButton";
import { StatsPanels } from "./StatsPanels";
import { MarketPanel } from "./MarketPanel";
import { BookmarkPanel } from "./BookmarkPanel";
import { CollapsiblePositions } from "./CollapsiblePositions";
import { CashLedgerPanel } from "./CashLedgerPanel";
import { RiskCalculatorPanel } from "./RiskCalculatorPanel";
import { RiskCalcPopup } from "./RiskCalcPopup";
import { MindsetPanel } from "./MindsetPanel";
import { QuickMemo } from "./QuickMemo";
import { JournalPostsPanel } from "./JournalPostsPanel";
import { ScreenerPanel } from "./screener/ScreenerPanel";
import { ScreenerPerfPanel } from "./screener/ScreenerPerfPanel";
import { WatchEvaluatePanel } from "./screener/WatchEvaluatePanel";
import { DemandSupplyPanel } from "./screener/DemandSupplyPanel";
import { EquityCurvePanel } from "./EquityCurvePanel";
import { fetchFxRate } from "@/lib/fx/client";
import { ReviewCommentsFeed } from "./ReviewCommentsFeed";
import { GoalsPanel } from "./GoalsPanel";
import { DailyReviewPanel } from "./DailyReviewPanel";
import { StockMarketPanel } from "./StockMarketPanel";
import { TradingGamePanel } from "./TradingGamePanel";
import { IndicatorBacktestPanel } from "./IndicatorBacktestPanel";
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
import {
  DEFAULT_GOAL_CHALLENGE,
  DEFAULT_OVERVIEW_ORDER,
  loadGoalChallenge,
  loadOverviewOrder,
  loadSavedTab,
  OVERVIEW_SECTION_LABELS,
  saveGoalChallenge,
  saveOverviewOrder,
  saveTab,
  type GoalChallengePrefs,
  type OverviewSectionId,
} from "@/lib/prefs";
import { useRouter } from "next/navigation";

type Tab =
  | "review"
  | "overview"
  | "market"
  | "chart"
  | "mindset"
  | "screener"
  | "screener-perf"
  | "alerts";
/** 스크리너 탭 안에서 고르는 화면 */
type ScreenerView = "demand-supply" | "screener" | "watch";

const SCREENER_VIEW_KEY = "dailytrading.ui.screener.view.v1";

const SCREENER_VIEWS: { id: ScreenerView; label: string }[] = [
  { id: "demand-supply", label: "수요·공급" },
  { id: "screener", label: "코인 스크리너" },
  { id: "watch", label: "지정 평가" },
];

function loadScreenerView(): ScreenerView {
  try {
    const saved = localStorage.getItem(SCREENER_VIEW_KEY);
    return SCREENER_VIEWS.some((v) => v.id === saved)
      ? (saved as ScreenerView)
      : "demand-supply";
  } catch {
    return "demand-supply";
  }
}
const TAB_IDS: Tab[] = [
  "review",
  "overview",
  "market",
  "chart",
  "mindset",
  "screener",
  "screener-perf",
  "alerts",
];

/** 예전에 따로 있던 탭은 합친 탭으로 연다 */
function migrateTab(saved: string): Tab {
  if (saved === "cash" || saved === "live") return "overview";
  if (saved === "posts" || saved === "bookmarks") return "mindset";
  if (saved === "demand-supply" || saved === "screener-watch") return "screener";
  return (TAB_IDS as string[]).includes(saved) ? (saved as Tab) : "review";
}

/** 예전 탭 이름으로 스크리너 탭 안의 화면을 고른다 */
function screenerViewFromOldTab(saved: string): ScreenerView | null {
  if (saved === "demand-supply") return "demand-supply";
  if (saved === "screener-watch") return "watch";
  if (saved === "screener") return "screener";
  return null;
}

function isMissingTable(msg: string | null): boolean {
  if (!msg) return false;
  return (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("Could not find the table")
  );
}

export function TradeJournal() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("review");
  const [screenerView, setScreenerView] =
    useState<ScreenerView>("demand-supply");
  const [tabReady, setTabReady] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradesLoading, setTradesLoading] = useState(true);
  const [tradesError, setTradesError] = useState<string | null>(null);
  const seenTradeIds = useRef<Set<string> | null>(null);
  const tradesLoadId = useRef(0);
  const seenPositionKeys = useRef<Set<string> | null>(null);
  const [alertUnread, setAlertUnread] = useState(0);
  const [reviewFocus, setReviewFocus] = useState<{ id: string; nonce: number } | null>(
    null
  );
  const [goalUsdt, setGoalUsdt] = useState<number | null>(null);
  const [goalPrefs, setGoalPrefs] = useState<GoalChallengePrefs>(() => ({
    ...DEFAULT_GOAL_CHALLENGE,
    dailyHits: {},
  }));
  const [overviewOrder, setOverviewOrder] = useState<OverviewSectionId[]>(
    () => [...DEFAULT_OVERVIEW_ORDER]
  );
  const [overviewOrderOpen, setOverviewOrderOpen] = useState(false);
  const [pageScale, setPageScale] = useState(1);

  useEffect(() => {
    const apply = () => {
      const width = document.documentElement.clientWidth;
      if (width <= 0) return;
      setPageScale(Math.min(1, width / 1152));
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  useEffect(() => {
    const savedTab = loadSavedTab<string>("review", [
      ...TAB_IDS,
      "trades",
      "live",
      "cash",
      "posts",
      "bookmarks",
      "demand-supply",
      "screener-watch",
    ]);
    setTab(migrateTab(savedTab));
    setScreenerView(screenerViewFromOldTab(savedTab) ?? loadScreenerView());
    setOverviewOrder(loadOverviewOrder());
    setGoalPrefs(loadGoalChallenge());
    setTabReady(true);
  }, []);

  useEffect(() => {
    if (!tabReady) return;
    saveTab(tab);
  }, [tab, tabReady]);

  useEffect(() => {
    if (!tabReady) return;
    try {
      localStorage.setItem(SCREENER_VIEW_KEY, screenerView);
    } catch {
      /* ignore */
    }
  }, [screenerView, tabReady]);

  useEffect(() => {
    if (!tabReady) return;
    saveOverviewOrder(overviewOrder);
  }, [overviewOrder, tabReady]);

  useEffect(() => {
    if (!tabReady) return;
    saveGoalChallenge(goalPrefs);
  }, [goalPrefs, tabReady]);

  useEffect(() => {
    if (!tabReady) return;
    let cancel = false;
    void fetchFxRate().then((quote) => {
      if (cancel || !quote) return;
      setGoalPrefs((p) =>
        p.fxRate === quote.rate ? p : { ...p, fxRate: quote.rate }
      );
    });
    return () => {
      cancel = true;
    };
  }, [tabReady]);

  const patchGoalPrefs = useCallback(
    (
      next:
        | GoalChallengePrefs
        | ((p: GoalChallengePrefs) => GoalChallengePrefs)
    ) => {
      setGoalPrefs((p) => (typeof next === "function" ? next(p) : next));
    },
    []
  );

  function moveOverviewSection(id: OverviewSectionId, dir: -1 | 1) {
    setOverviewOrder((order) => {
      const i = order.indexOf(id);
      if (i < 0) return order;
      const j = i + dir;
      if (j < 0 || j >= order.length) return order;
      const next = [...order];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  const goToAlarmTab = useCallback((target: AlarmTargetTab | Tab) => {
    if (target === "live") {
      setTab("overview");
      return;
    }
    if (target === "trades") {
      setTab("review");
      return;
    }
    if ((TAB_IDS as string[]).includes(target)) {
      if (target === "screener") setScreenerView("screener");
      setTab(target as Tab);
    }
  }, []);

  const focusTrade = useCallback((tradeId: string) => {
    setTab("review");
    setReviewFocus({ id: tradeId, nonce: Date.now() });
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
  const [hourly, setHourly] = useState<HourStat[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsRevision, setStatsRevision] = useState(0);

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
      const res = await fetch("/api/trades?limit=200&sort=newest");
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
          list = [...(data2.trades ?? [])].sort(
            (a, b) =>
              new Date(b.exit_time).getTime() - new Date(a.exit_time).getTime()
          );
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
      setTradesLoading(false);

      // 최근 200건을 먼저 보여 주고, 그 이전 기록은 뒤에서 이어 붙인다
      const loadId = ++tradesLoadId.current;
      const ids = new Set(list.map((t) => t.id));
      let page = list;
      while (page.length >= 200) {
        const before = page[page.length - 1]!.exit_time;
        const res = await fetch(
          `/api/trades?limit=200&sort=newest&before=${encodeURIComponent(before)}`
        );
        const data = (await res.json()) as { trades?: Trade[]; error?: string };
        if (loadId !== tradesLoadId.current || data.error) return;
        page = data.trades ?? [];
        const fresh = page.filter((t) => !ids.has(t.id));
        if (fresh.length === 0) break;
        for (const t of fresh) ids.add(t.id);
        setTrades((prev) => {
          const have = new Set(prev.map((t) => t.id));
          return [...prev, ...fresh.filter((t) => !have.has(t.id))];
        });
      }
    } catch (err) {
      setTradesError(err instanceof Error ? err.message : "불러오기 실패");
    } finally {
      setTradesLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await fetch("/api/stats");
      const data = (await res.json()) as {
        overall?: OverallStats;
        monthly?: MonthlyStat[];
        daily?: DailyPnl[];
        hourly?: HourStat[];
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setOverall(data.overall ?? null);
      setMonthly(data.monthly ?? []);
      setDaily(data.daily ?? []);
      setHourly(data.hourly ?? []);
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : "통계 불러오기 실패");
    } finally {
      setStatsLoading(false);
      setStatsRevision((n) => n + 1);
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

  const refreshAll = useCallback(async () => {
    await Promise.all([loadTrades(), loadStats(), loadWallet(), loadMarket()]);
  }, [loadTrades, loadStats, loadWallet, loadMarket]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    // 포지션 알람용 — 탭과 무관하게 60초마다 갱신
    const id = setInterval(() => void loadWallet(), 60_000);
    return () => clearInterval(id);
  }, [loadWallet]);

  const dbHint = isMissingTable(tradesError) || isMissingTable(statsError);

  function handleTradeUpdated(updated: Trade) {
    setTrades((prev) =>
      prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t))
    );
  }

  return (
    <div
      className="mx-auto w-full max-w-6xl px-6 py-10"
      style={
        pageScale < 0.999
          ? { width: 1152, maxWidth: 1152, zoom: pageScale }
          : undefined
      }
    >
      <header className="relative z-40 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-[0.15em] text-zinc-500">
            데일리 트레이딩
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-50">
            매매 대시보드
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <RiskCalcPopup />
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

      <div className="mb-4">
        <QuickMemo defaultOpen={false} />
      </div>

      {/* 실시간 포지션 — 기본 접힘 */}
      <div className="mb-6">
        <CollapsiblePositions
          overview={walletOverview}
          loading={walletLoading}
          error={walletError}
          defaultOpen={false}
          walletFollow={goalPrefs.walletFollow}
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
            ["review", "매매 복기"],
            ["overview", "한눈에"],
            ["market", "시장 현황"],
            ["chart", "차트"],
            ["screener", "스크리너"],
            ["screener-perf", "스크리너 성과"],
            ["alerts", "알림"],
            ["mindset", "마인드·글"],
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
            {id === "review" && trades.length > 0 ? ` (${trades.length})` : ""}
            {id === "alerts" && alertUnread > 0 ? ` (${alertUnread})` : ""}
          </button>
        ))}
      </nav>

      {tab === "review" && (
        <div className="space-y-6">
          {tradesLoading && trades.length === 0 && (
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
          {!(tradesLoading && trades.length === 0) && !tradesError && (
            <DailyReviewPanel
              trades={trades}
              fx={goalPrefs.fxRate > 0 ? goalPrefs.fxRate : 1350}
              lossLimitUsdt={goalPrefs.gameLossLimitUsdt}
              focus={reviewFocus}
              onUpdated={handleTradeUpdated}
            />
          )}
          <details className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <summary className="cursor-pointer text-sm text-zinc-400">
              댓글 모아보기 · 누르면 그 매매 카드로 갑니다
            </summary>
            <div className="mt-3">
              <ReviewCommentsFeed trades={trades} onOpenTrade={focusTrade} />
            </div>
          </details>
        </div>
      )}

      {tab === "market" && (
        <div className="space-y-6">
          <Section title="주식 · 코스피">
            <StockMarketPanel />
          </Section>
          <Section title="코인 시장">
            <MarketPanel
              tickers={tickers}
              fearGreed={fearGreed}
              loading={marketLoading}
              error={marketError}
            />
          </Section>
        </div>
      )}

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-zinc-600">
              목표를 우선하고, 섹션 순서는 아래에서 바꿀 수 있습니다.
            </p>
            <button
              type="button"
              onClick={() => setOverviewOrderOpen((v) => !v)}
              className="rounded border border-zinc-700 px-2.5 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200"
            >
              {overviewOrderOpen ? "순서 닫기" : "한눈에 순서"}
            </button>
          </div>

          {overviewOrderOpen && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
              <p className="mb-2 text-[11px] text-zinc-500">
                ▲▼로 순서를 바꿉니다. 브라우저에 저장됩니다.
              </p>
              <ul className="space-y-1">
                {overviewOrder.map((id, idx) => (
                  <li
                    key={id}
                    className="flex items-center justify-between gap-2 rounded border border-zinc-800 px-2.5 py-1.5"
                  >
                    <span className="text-sm text-zinc-300">
                      <span className="mr-2 tabular-nums text-zinc-600">
                        {idx + 1}.
                      </span>
                      {OVERVIEW_SECTION_LABELS[id]}
                    </span>
                    <span className="flex gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveOverviewSection(id, -1)}
                        className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 disabled:opacity-30"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        disabled={idx === overviewOrder.length - 1}
                        onClick={() => moveOverviewSection(id, 1)}
                        className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 disabled:opacity-30"
                      >
                        ▼
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setOverviewOrder([...DEFAULT_OVERVIEW_ORDER])}
                className="mt-2 text-[11px] text-zinc-500 underline hover:text-zinc-300"
              >
                기본 순서로
              </button>
            </div>
          )}

          {overviewOrder.map((id) => {
            if (id === "monthly_goal") {
              return (
                <Section key={id} title="목표">
                  <GoalsPanel
                    prefs={goalPrefs}
                    onPrefsChange={patchGoalPrefs}
                    wallet={walletOverview}
                    walletLoading={walletLoading}
                    daily={daily}
                    onGoalUsdtChange={setGoalUsdt}
                  />
                </Section>
              );
            }
            if (id === "equity") {
              return (
                <Section key={id} title="자산 그래프">
                  <EquityCurvePanel
                    daily={daily}
                    totalPnl={overall?.totalPnl ?? 0}
                    wallet={walletOverview}
                    walletLoading={walletLoading}
                    goalUsdt={goalUsdt}
                    fxRate={goalPrefs.fxRate}
                    walletFollow={goalPrefs.walletFollow}
                    currency={goalPrefs.horizonCurrency}
                    onCurrencyChange={(horizonCurrency) =>
                      patchGoalPrefs((p) => ({ ...p, horizonCurrency }))
                    }
                  />
                </Section>
              );
            }
            if (id === "pnl") {
              return (
                <Section key={id} title="All-time PNL">
                  <StatsPanels
                    overall={overall}
                    monthly={monthly}
                    daily={daily}
                    hourly={hourly}
                    trades={trades}
                    loading={statsLoading}
                    error={statsError}
                    statsRevision={statsRevision}
                    equityDaily={daily}
                    equityTotalPnl={overall?.totalPnl ?? 0}
                    wallet={walletOverview}
                    walletFollow={goalPrefs.walletFollow}
                    fxRate={goalPrefs.fxRate}
                    currency={goalPrefs.horizonCurrency}
                    onCurrencyChange={(horizonCurrency) =>
                      patchGoalPrefs((p) => ({ ...p, horizonCurrency }))
                    }
                  />
                </Section>
              );
            }
            if (id === "game") {
              return (
                <Section key={id} title="트레이딩 게임">
                  <TradingGamePanel
                    trades={trades}
                    prefs={goalPrefs}
                    onPrefsChange={patchGoalPrefs}
                  />
                </Section>
              );
            }
            if (id === "cash") {
              return (
                <Section key={id} title="현금 입출금 (KRW)">
                  <CashLedgerPanel />
                </Section>
              );
            }
            if (id === "risk_calc") {
              return (
                <Section key={id} title="리스크 계산기">
                  <RiskCalculatorPanel
                    wallet={walletOverview}
                    walletLoading={walletLoading}
                    fxRate={goalPrefs.fxRate}
                    walletFollow={goalPrefs.walletFollow}
                  />
                </Section>
              );
            }
            return null;
          })}
        </div>
      )}

      {tab === "screener" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {SCREENER_VIEWS.map((view) => (
              <button
                key={view.id}
                type="button"
                onClick={() => setScreenerView(view.id)}
                className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                  screenerView === view.id
                    ? view.id === "demand-supply"
                      ? "border-amber-500/60 bg-amber-500/15 text-amber-200"
                      : "border-emerald-500/60 bg-emerald-500/15 text-emerald-200"
                    : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {view.label}
              </button>
            ))}
          </div>
          {screenerView === "demand-supply" && (
            <Section title="수요·공급 (고수요·저공급)">
              <DemandSupplyPanel />
            </Section>
          )}
          {screenerView === "screener" && (
            <Section title="코인 스크리너">
              <ScreenerPanel />
            </Section>
          )}
          {screenerView === "watch" && (
            <Section title="지정 종목 평가">
              <WatchEvaluatePanel />
            </Section>
          )}
        </div>
      )}

      {tab === "screener-perf" && (
        <Section title="스크리너 성과">
          <ScreenerPerfPanel />
        </Section>
      )}

      {tab === "chart" && (
        <Section title="지표 백테스트 · MACD · RSI · ADX · DI · WaveTrend">
          <IndicatorBacktestPanel />
        </Section>
      )}

      {tab === "alerts" && (
        <Section title="알림 모아보기">
          <AlertsPanel onNavigate={goToAlarmTab} />
        </Section>
      )}

      {tab === "mindset" && (
        <div className="space-y-6">
          <Section title="매매 마인드">
            <MindsetPanel />
          </Section>
          <Section title="글 · 후기">
            <JournalPostsPanel />
          </Section>
          <Section title="사이트 즐겨찾기">
            <BookmarkPanel />
          </Section>
        </div>
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
