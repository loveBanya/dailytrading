import type { StrategyId, ScanFilters } from "@/lib/screener/types";
import { STRATEGY_LABELS, DEFAULT_FILTERS } from "@/lib/screener/types";

export const ALL_STRATEGY_IDS = Object.keys(STRATEGY_LABELS) as StrategyId[];

const TAB_KEY = "dailytrading.ui.tab.v1";
const SCREENER_FILTERS_KEY = "dailytrading.screener.filters.v1";

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
