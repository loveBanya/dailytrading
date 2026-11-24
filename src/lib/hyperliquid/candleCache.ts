import type { HlCandle } from "./client";

export type HlCandleInterval = "5m" | "15m" | "1h" | "4h";

type CacheEntry = {
  at: number;
  candles: HlCandle[];
  promise?: Promise<HlCandle[]>;
};

/** 브라우저·서버 공용 메모리 캐시 (프로세스/탭 단위) */
const store = new Map<string, CacheEntry>();

const TTL_MS: Record<HlCandleInterval, number> = {
  "5m": 90_000,
  "15m": 3 * 60_000,
  "1h": 5 * 60_000,
  "4h": 10 * 60_000,
};

/** 같은 구간을 묶기 위해 start/end를 봉 단위로 내림 */
export function candleCacheKey(
  coin: string,
  interval: HlCandleInterval,
  start: number,
  end: number
): string {
  const barMs =
    interval === "5m"
      ? 5 * 60_000
      : interval === "15m"
        ? 15 * 60_000
        : interval === "1h"
          ? 3600_000
          : 4 * 3600_000;
  const s = Math.floor(start / barMs);
  const e = Math.floor(end / barMs);
  return `${coin.toUpperCase()}:${interval}:${s}:${e}`;
}

export function getCachedCandles(
  key: string,
  interval: HlCandleInterval
): HlCandle[] | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS[interval]) return null;
  return hit.candles;
}

/** 만료돼도 있으면 즉시 표시용(stale) */
export function getStaleCandles(key: string): HlCandle[] | null {
  return store.get(key)?.candles ?? null;
}

export function setCachedCandles(key: string, candles: HlCandle[]): void {
  store.set(key, { at: Date.now(), candles });
  if (store.size > 120) {
    const oldest = [...store.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) store.delete(oldest[0]);
  }
}

/**
 * 동일 키 요청은 한 번만 날리고 공유.
 * fetcher는 네트워크 호출만 담당.
 */
export async function loadCandlesCached(
  key: string,
  interval: HlCandleInterval,
  fetcher: () => Promise<HlCandle[]>
): Promise<{ candles: HlCandle[]; fromCache: boolean }> {
  const fresh = getCachedCandles(key, interval);
  if (fresh) return { candles: fresh, fromCache: true };

  const existing = store.get(key);
  if (existing?.promise) {
    const candles = await existing.promise;
    return { candles, fromCache: false };
  }

  const promise = fetcher()
    .then((candles) => {
      setCachedCandles(key, candles);
      return candles;
    })
    .catch((err) => {
      const cur = store.get(key);
      if (cur?.promise === promise) {
        store.set(key, { at: cur.at, candles: cur.candles });
      }
      throw err;
    });

  store.set(key, {
    at: existing?.at ?? 0,
    candles: existing?.candles ?? [],
    promise,
  });

  const candles = await promise;
  return { candles, fromCache: false };
}

export function candleTtlMs(interval: HlCandleInterval): number {
  return TTL_MS[interval];
}
