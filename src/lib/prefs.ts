import type { StrategyId, ScanFilters, WatchAsset } from "@/lib/screener/types";
import { STRATEGY_LABELS, DEFAULT_FILTERS } from "@/lib/screener/types";
import { DEFAULT_WATCH_ASSETS } from "@/lib/screener/watchlist";

export const ALL_STRATEGY_IDS = Object.keys(STRATEGY_LABELS) as StrategyId[];

const TAB_KEY = "dailytrading.ui.tab.v1";
const SCREENER_FILTERS_KEY = "dailytrading.screener.filters.v1";
const WATCH_ASSETS_KEY = "dailytrading.screener.watch.v1";
const SCREENER_UNIVERSE_KEY = "dailytrading.screener.universe.v1";

/** 스크리너 유니버스·전략 표시 설정 (필터 선택과 별개 — 아예 제외) */
export interface ScreenerUniversePrefs {
  /** 코인 선물 포함 */
  includeCrypto: boolean;
  /** 토큰화 주식·TradFi 포함 */
  includeStock: boolean;
  /** 필터 UI에 노출할 전략. 비어 있으면 전체 */
  visibleStrategies: StrategyId[];
}

export const DEFAULT_SCREENER_UNIVERSE: ScreenerUniversePrefs = {
  includeCrypto: true,
  includeStock: true,
  visibleStrategies: [],
};

export function loadScreenerUniverse(): ScreenerUniversePrefs {
  if (typeof window === "undefined") return { ...DEFAULT_SCREENER_UNIVERSE };
  try {
    const raw = localStorage.getItem(SCREENER_UNIVERSE_KEY);
    if (!raw) return { ...DEFAULT_SCREENER_UNIVERSE };
    const saved = JSON.parse(raw) as Partial<ScreenerUniversePrefs>;
    const visible = Array.isArray(saved.visibleStrategies)
      ? (saved.visibleStrategies.filter((id) =>
          ALL_STRATEGY_IDS.includes(id as StrategyId)
        ) as StrategyId[])
      : [];
    return {
      includeCrypto: saved.includeCrypto !== false,
      includeStock: saved.includeStock !== false,
      visibleStrategies: visible,
    };
  } catch {
    return { ...DEFAULT_SCREENER_UNIVERSE };
  }
}

export function saveScreenerUniverse(prefs: ScreenerUniversePrefs): void {
  try {
    localStorage.setItem(SCREENER_UNIVERSE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

/** 유니버스 설정 → 스캔용 assetKind */
export function assetKindFromUniverse(
  prefs: ScreenerUniversePrefs
): "all" | "crypto" | "stock" {
  if (prefs.includeCrypto && prefs.includeStock) return "all";
  if (prefs.includeCrypto) return "crypto";
  if (prefs.includeStock) return "stock";
  return "crypto"; // 둘 다 끄면 코인만 폴백
}

export function loadSavedTab<T extends string>(fallback: T, allowed: T[]): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(TAB_KEY);
    if (v && (allowed as string[]).includes(v)) return v as T;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function saveTab(tab: string): void {
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    /* ignore */
  }
}

export function defaultScreenerFilters(): ScanFilters {
  return {
    ...DEFAULT_FILTERS,
    topN: 40,
    strategies: [...ALL_STRATEGY_IDS],
  };
}

export function loadScreenerFilters(): ScanFilters {
  const base = defaultScreenerFilters();
  if (typeof window === "undefined") return base;
  try {
    const raw = localStorage.getItem(SCREENER_FILTERS_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<ScanFilters>;
    const strategies = Array.isArray(saved.strategies)
      ? (saved.strategies.filter((id) =>
          ALL_STRATEGY_IDS.includes(id as StrategyId)
        ) as StrategyId[])
      : base.strategies;
    return {
      ...base,
      ...saved,
      strategies,
    };
  } catch {
    return base;
  }
}

export function saveScreenerFilters(filters: ScanFilters): void {
  try {
    localStorage.setItem(SCREENER_FILTERS_KEY, JSON.stringify(filters));
  } catch {
    /* ignore */
  }
}

export function loadWatchAssets(): WatchAsset[] {
  if (typeof window === "undefined") return [...DEFAULT_WATCH_ASSETS];
  try {
    const raw = localStorage.getItem(WATCH_ASSETS_KEY);
    if (!raw) return [...DEFAULT_WATCH_ASSETS];
    const saved = JSON.parse(raw) as WatchAsset[];
    if (!Array.isArray(saved) || saved.length === 0) {
      return [...DEFAULT_WATCH_ASSETS];
    }
    return saved.filter(
      (a) =>
        a &&
        typeof a.symbol === "string" &&
        (a.exchange === "binance" ||
          a.exchange === "bybit" ||
          a.exchange === "yahoo")
    );
  } catch {
    return [...DEFAULT_WATCH_ASSETS];
  }
}

export function saveWatchAssets(assets: WatchAsset[]): void {
  try {
    localStorage.setItem(WATCH_ASSETS_KEY, JSON.stringify(assets));
  } catch {
    /* ignore */
  }
}

export interface GoalChallengePrefs {
  /** 이번 달 수익 목표 (USDT) — 실전 목표 */
  monthlyTargetUsdt: number;
  /** 최종 목표 (원) — 1억 등, 하단 참고용 */
  targetKrw: number;
  deadline: string; // YYYY-MM-DD
  fxRate: number; // KRW per 1 USDT
  startDate: string;
  /** 이번 달 키 YYYY-MM — 월초 자산 스냅샷용 */
  monthKey: string;
  /** 해당 월 시작 시점 자산(USDT) */
  monthStartEquity: number | null;
  /** 날짜(YYYY-MM-DD) → 일일 목표 달성 여부 (자동) */
  dailyHits: Record<string, boolean>;
}

const GOAL_KEY = "dailytrading.goal.challenge.v1";

export const DEFAULT_GOAL_CHALLENGE: GoalChallengePrefs = {
  monthlyTargetUsdt: 500,
  targetKrw: 100_000_000,
  deadline: "2026-12-31",
  fxRate: 1350,
  startDate: "2026-08-11",
  monthKey: "",
  monthStartEquity: null,
  dailyHits: {},
};

export function loadGoalChallenge(): GoalChallengePrefs {
  if (typeof window === "undefined") return { ...DEFAULT_GOAL_CHALLENGE, dailyHits: {} };
  try {
    const raw = localStorage.getItem(GOAL_KEY);
    if (!raw) return { ...DEFAULT_GOAL_CHALLENGE, dailyHits: {} };
    const saved = JSON.parse(raw) as Partial<GoalChallengePrefs>;
    return {
      ...DEFAULT_GOAL_CHALLENGE,
      ...saved,
      monthlyTargetUsdt:
        Number(saved.monthlyTargetUsdt) ||
        DEFAULT_GOAL_CHALLENGE.monthlyTargetUsdt,
      targetKrw: Number(saved.targetKrw) || DEFAULT_GOAL_CHALLENGE.targetKrw,
      fxRate: Number(saved.fxRate) || DEFAULT_GOAL_CHALLENGE.fxRate,
      deadline: saved.deadline || DEFAULT_GOAL_CHALLENGE.deadline,
      startDate: saved.startDate || DEFAULT_GOAL_CHALLENGE.startDate,
      monthKey: saved.monthKey || "",
      monthStartEquity:
        saved.monthStartEquity == null || saved.monthStartEquity === undefined
          ? null
          : Number(saved.monthStartEquity),
      dailyHits:
        saved.dailyHits && typeof saved.dailyHits === "object"
          ? saved.dailyHits
          : {},
    };
  } catch {
    return { ...DEFAULT_GOAL_CHALLENGE, dailyHits: {} };
  }
}

export function saveGoalChallenge(prefs: GoalChallengePrefs): void {
  try {
    localStorage.setItem(GOAL_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

/** 한눈에 탭 섹션 순서 */
export type OverviewSectionId =
  | "monthly_goal"
  | "equity"
  | "flows"
  | "roadmap"
  | "pnl"
  | "market"
  | "kelly"
  | "ultimate_goal";

export const OVERVIEW_SECTION_LABELS: Record<OverviewSectionId, string> = {
  monthly_goal: "월간 목표",
  equity: "자산 그래프",
  flows: "USDT 자본 흐름",
  roadmap: "학습 로드맵",
  pnl: "All-time PNL",
  market: "현재 시장",
  kelly: "켈리 베팅",
  ultimate_goal: "최종 목표 (1억)",
};

export const DEFAULT_OVERVIEW_ORDER: OverviewSectionId[] = [
  "monthly_goal",
  "equity",
  "flows",
  "roadmap",
  "pnl",
  "market",
  "kelly",
  "ultimate_goal",
];

const OVERVIEW_ORDER_KEY = "dailytrading.overview.order.v1";

export function loadOverviewOrder(): OverviewSectionId[] {
  if (typeof window === "undefined") return [...DEFAULT_OVERVIEW_ORDER];
  try {
    const raw = localStorage.getItem(OVERVIEW_ORDER_KEY);
    if (!raw) return [...DEFAULT_OVERVIEW_ORDER];
    const saved = JSON.parse(raw) as string[];
    if (!Array.isArray(saved)) return [...DEFAULT_OVERVIEW_ORDER];
    const valid = saved.filter((id): id is OverviewSectionId =>
      (DEFAULT_OVERVIEW_ORDER as string[]).includes(id)
    );
    const missing = DEFAULT_OVERVIEW_ORDER.filter((id) => !valid.includes(id));
    return [...valid, ...missing];
  } catch {
    return [...DEFAULT_OVERVIEW_ORDER];
  }
}

export function saveOverviewOrder(order: OverviewSectionId[]): void {
  try {
    localStorage.setItem(OVERVIEW_ORDER_KEY, JSON.stringify(order));
  } catch {
    /* ignore */
  }
}
