/** 간단한 동시성 제한 — HL info API 429 완화 */

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;

  async function run(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      try {
        const value = await worker(items[i]!, i);
        out[i] = { status: "fulfilled", value };
      } catch (reason) {
        out[i] = { status: "rejected", reason };
      }
    }
  }

  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => run()));
  return out;
}

let candleChain: Promise<unknown> = Promise.resolve();

/** 캔들 요청은 전역 직렬화 (동시에 여러 봉 때리지 않음) */
export function enqueueCandleFetch<T>(fn: () => Promise<T>): Promise<T> {
  const run = candleChain.then(fn, fn);
  candleChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
