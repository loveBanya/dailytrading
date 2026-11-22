const PREFIX = "dailytrading.hl.cache.v1:";

/** 백그라운드 폴링이 새 최근 진입 목록을 받았을 때 */
export const HL_ENTRIES_EVENT = "dt-hl-entries";
export const HL_POLL_HOURS = 24;
/** 백그라운드 포지션 동기화가 끝났을 때 */
export const HL_SYNCED_EVENT = "dt-hl-synced";

export function recentCacheKey(hours: number): string {
  return `recent:${hours}`;
}

export interface Cached<T> {
  at: number;
  data: T;
}

export function readHlCache<T>(key: string): Cached<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached<T>;
    return parsed && typeof parsed.at === "number" ? parsed : null;
  } catch {
    return null;
  }
}

export function writeHlCache<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  const value = JSON.stringify({ at: Date.now(), data });
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // 용량 초과 시 HL 캐시만 비우고 한 번 더 시도
    clearHlCache();
    try {
      localStorage.setItem(PREFIX + key, value);
    } catch {
      /* ignore */
    }
  }
}

export function clearHlCache(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}
