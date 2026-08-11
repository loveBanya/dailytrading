import type { StrategyId, ScanFilters, WatchAsset } from "@/lib/screener/types";
import { STRATEGY_LABELS, DEFAULT_FILTERS } from "@/lib/screener/types";
import { DEFAULT_WATCH_ASSETS } from "@/lib/screener/watchlist";

export const ALL_STRATEGY_IDS = Object.keys(STRATEGY_LABELS) as StrategyId[];

const TAB_KEY = "dailytrading.ui.tab.v1";
const SCREENER_FILTERS_KEY = "dailytrading.screener.filters.v1";
const WATCH_ASSETS_KEY = "dailytrading.screener.watch.v1";

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
  targetKrw: number;
  deadline: string; // YYYY-MM-DD
  fxRate: number; // KRW per 1 USDT
  startDate: string;
}

const GOAL_KEY = "dailytrading.goal.challenge.v1";

export const DEFAULT_GOAL_CHALLENGE: GoalChallengePrefs = {
  targetKrw: 100_000_000,
  deadline: "2026-12-31",
  fxRate: 1350,
  startDate: "2026-08-11",
};

export function loadGoalChallenge(): GoalChallengePrefs {
  if (typeof window === "undefined") return { ...DEFAULT_GOAL_CHALLENGE };
  try {
    const raw = localStorage.getItem(GOAL_KEY);
    if (!raw) return { ...DEFAULT_GOAL_CHALLENGE };
    const saved = JSON.parse(raw) as Partial<GoalChallengePrefs>;
    return {
      ...DEFAULT_GOAL_CHALLENGE,
      ...saved,
      targetKrw: Number(saved.targetKrw) || DEFAULT_GOAL_CHALLENGE.targetKrw,
      fxRate: Number(saved.fxRate) || DEFAULT_GOAL_CHALLENGE.fxRate,
      deadline: saved.deadline || DEFAULT_GOAL_CHALLENGE.deadline,
      startDate: saved.startDate || DEFAULT_GOAL_CHALLENGE.startDate,
    };
  } catch {
    return { ...DEFAULT_GOAL_CHALLENGE };
  }
}

export function saveGoalChallenge(prefs: GoalChallengePrefs): void {
  try {
    localStorage.setItem(GOAL_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
