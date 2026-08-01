type CacheEntry<T> = { value: T; expiresAt: number; createdAt: number };

const store = new Map<string, CacheEntry<unknown>>();
let active = 0;
const waiters: Array<() => void> = [];

export function cacheGet<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return null;
  }
  return hit.value as T;
}

export function cacheAgeSec(key: string): number | null {
  const hit = store.get(key);
  if (!hit) return null;
  return Math.max(0, Math.round((Date.now() - hit.createdAt) / 1000));
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  const now = Date.now();
  store.set(key, { value, expiresAt: now + ttlMs, createdAt: now });
}

export async function withCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit != null) return hit;
  const value = await loader();
  cacheSet(key, value, ttlMs);
  return value;
}

/** 동시 외부 API 호출 수 제한 */
export async function withConcurrency<T>(
  limit: number,
  tasks: Array<() => Promise<T>>
): Promise<Array<T | Error>> {
  const results: Array<T | Error> = new Array(tasks.length);
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      try {
        results[i] = await runLimited(limit, tasks[i]);
      } catch (err) {
        results[i] = err instanceof Error ? err : new Error(String(err));
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

async function runLimited<T>(limit: number, fn: () => Promise<T>): Promise<T> {
  while (active >= limit) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    const next = waiters.shift();
    if (next) next();
  }
}

export const TTL = {
  tickers: 20_000,
  klines: 55_000,
  oi: 90_000,
  funding: 180_000,
  instruments: 300_000,
} as const;
