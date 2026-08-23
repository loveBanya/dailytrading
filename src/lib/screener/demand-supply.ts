import { withConcurrency } from "./cache";
import { tickerLabel } from "./filters";
import { mean } from "./indicators";
import type {
  ScreenerExchange,
  UniverseTicker,
} from "./types";
import type { ExchangePublicAdapter } from "./adapters/types";
import { binancePublicAdapter } from "./adapters/binance-public";
import { bybitPublicAdapter } from "./adapters/bybit-public";

export type DemandSupplyScope = "stock" | "crypto" | "all";

export interface DemandSupplyChecks {
  /** 당일 +10% */
  up10: boolean;
  /** 상대거래량 ≥ 5× */
  rvol5: boolean;
  /** 가격 $2–20 */
  priceBand: boolean;
  /** 얇은 공급 근사 */
  thinSupply: boolean;
}

export interface DemandSupplyRow {
  exchange: ScreenerExchange;
  symbol: string;
  baseAsset: string;
  displayName: string;
  assetKind: "crypto" | "stock";
  price: number;
  change24h: number;
  rvol: number;
  turnover24h: number;
  baseVol24h: number;
  checks: DemandSupplyChecks;
  /** 충족 개수 0–4 */
  hitCount: number;
  /** 0–100 순위용 점수 */
  score: number;
  notes: string[];
}

/** 1h봉 기준 롤링 24h ÷ 직전 N일 평균 */
export function dayRelativeVolume(
  volumes: number[],
  barsPerDay = 24,
  lookbackDays = 5
): number {
  const need = barsPerDay * (lookbackDays + 1);
  if (volumes.length < need) return 0;
  const dayVol = (offsetDays: number) => {
    const end = volumes.length - offsetDays * barsPerDay;
    const start = end - barsPerDay;
    if (start < 0 || end <= start) return 0;
    let s = 0;
    for (let i = start; i < end; i++) s += volumes[i];
    return s;
  };
  const recent = dayVol(0);
  const priors: number[] = [];
  for (let d = 1; d <= lookbackDays; d++) {
    const v = dayVol(d);
    if (v > 0) priors.push(v);
  }
  const avg = mean(priors);
  return avg > 0 ? recent / avg : 0;
}

export function scoreDemandSupply(input: {
  price: number;
  change24h: number;
  rvol: number;
  turnover24h: number;
}): {
  checks: DemandSupplyChecks;
  hitCount: number;
  score: number;
  notes: string[];
  baseVol24h: number;
} {
  const { price, change24h, rvol, turnover24h } = input;
  const baseVol24h = price > 0 && turnover24h > 0 ? turnover24h / price : 0;

  const checks: DemandSupplyChecks = {
    up10: change24h >= 10,
    rvol5: rvol >= 5,
    priceBand: price >= 2 && price <= 20,
    thinSupply: baseVol24h > 0 && baseVol24h < 20_000_000,
  };

  const notes: string[] = [];
  let score = 0;
  let hitCount = 0;

  if (checks.up10) {
    score += 26;
    hitCount += 1;
    notes.push(`당일 +${change24h.toFixed(1)}%`);
  } else if (change24h >= 5) {
    score += 10;
    notes.push(`당일 +${change24h.toFixed(1)}% (10%↓)`);
  } else {
    notes.push(`당일 ${change24h.toFixed(1)}%`);
  }

  if (checks.rvol5) {
    score += 26;
    hitCount += 1;
    notes.push(`상대Vol ${rvol.toFixed(1)}×`);
  } else if (rvol >= 3) {
    score += 12;
    notes.push(`상대Vol ${rvol.toFixed(1)}× (5×↓)`);
  } else if (rvol > 0) {
    notes.push(`상대Vol ${rvol.toFixed(1)}×`);
  } else {
    notes.push("상대Vol 산출 부족");
  }

  if (checks.priceBand) {
    score += 20;
    hitCount += 1;
    notes.push(`가격 $${price.toPrecision(4)}`);
  } else {
    notes.push(`가격 $${price.toPrecision(4)} (선호대 밖)`);
  }

  if (checks.thinSupply) {
    score += 20;
    hitCount += 1;
    notes.push(`얇은공급 ${(baseVol24h / 1e6).toFixed(1)}M`);
  } else if (baseVol24h > 0) {
    notes.push(`공급근사 ${(baseVol24h / 1e6).toFixed(1)}M`);
  } else {
    notes.push("공급 데이터 부족");
  }

  // 핵심 조합 보너스
  if (checks.up10 && checks.rvol5) score += 12;
  if (hitCount >= 3) score += 8;

  return {
    checks,
    hitCount,
    score: Math.min(100, score),
    notes,
    baseVol24h,
  };
}

function adaptersFor(
  exchange: ScreenerExchange | "all"
): ExchangePublicAdapter[] {
  if (exchange === "binance") return [binancePublicAdapter];
  if (exchange === "bybit") return [bybitPublicAdapter];
  return [binancePublicAdapter, bybitPublicAdapter];
}

export async function runDemandSupplyRank(options: {
  exchange?: ScreenerExchange | "all";
  scope?: DemandSupplyScope;
  /** 최소 24h 거래대금 (USDT) */
  minTurnover24h?: number;
  /** 스캔 상한 (성능) */
  maxSymbols?: number;
}): Promise<{
  rows: DemandSupplyRow[];
  meta: {
    scannedAt: string;
    universeSize: number;
    analyzed: number;
    errors: string[];
    scope: DemandSupplyScope;
    exchange: ScreenerExchange | "all";
  };
}> {
  const exchange = options.exchange ?? "binance";
  const scope = options.scope ?? "stock";
  const minTurnover = options.minTurnover24h ?? 50_000;
  const maxSymbols = options.maxSymbols ?? 180;
  const adapters = adaptersFor(exchange);
  const errors: string[] = [];

  const universe: UniverseTicker[] = [];
  for (const a of adapters) {
    try {
      universe.push(...(await a.listUniverse()));
    } catch (err) {
      errors.push(
        `${a.exchange} universe: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  let pool = universe.filter(
    (t) =>
      t.symbol.endsWith("USDT") &&
      t.lastPrice > 0 &&
      t.turnover24h >= minTurnover
  );

  if (scope === "stock") {
    pool = pool.filter((t) => t.assetKind === "stock");
  } else if (scope === "crypto") {
    pool = pool.filter((t) => (t.assetKind ?? "crypto") === "crypto");
  }

  // 전체일 때: 주식 전부 + 코인은 등락/대금 상위만 (요청 폭주 방지)
  if (scope === "all") {
    const stocks = pool.filter((t) => t.assetKind === "stock");
    const cryptos = pool
      .filter((t) => (t.assetKind ?? "crypto") === "crypto")
      .filter((t) => Math.abs(t.change24hPct) >= 5 || t.turnover24h >= 5_000_000)
      .sort((a, b) => Math.abs(b.change24hPct) - Math.abs(a.change24hPct))
      .slice(0, Math.max(40, maxSymbols - stocks.length));
    pool = [...stocks, ...cryptos];
  }

  pool = pool
    .sort((a, b) => b.turnover24h - a.turnover24h)
    .slice(0, maxSymbols);

  const tasks = pool.map((ticker) => {
    const adapter =
      adapters.find((a) => a.exchange === ticker.exchange) ?? adapters[0];
    return async (): Promise<DemandSupplyRow | null> => {
      try {
        const klines = await adapter.fetchKlines(ticker.symbol, "1h", 180);
        const volumes = klines.map((c) => c.volume);
        const rvol = dayRelativeVolume(volumes, 24, 5);
        const scored = scoreDemandSupply({
          price: ticker.lastPrice,
          change24h: ticker.change24hPct,
          rvol,
          turnover24h: ticker.turnover24h,
        });
        return {
          exchange: ticker.exchange,
          symbol: ticker.symbol,
          baseAsset: ticker.baseAsset,
          displayName: tickerLabel(ticker),
          assetKind: ticker.assetKind ?? "crypto",
          price: ticker.lastPrice,
          change24h: Number(ticker.change24hPct.toFixed(2)),
          rvol: Number(rvol.toFixed(2)),
          turnover24h: ticker.turnover24h,
          baseVol24h: scored.baseVol24h,
          checks: scored.checks,
          hitCount: scored.hitCount,
          score: scored.score,
          notes: scored.notes,
        };
      } catch (err) {
        errors.push(
          `${ticker.exchange}:${ticker.symbol} ${err instanceof Error ? err.message : String(err)}`
        );
        return null;
      }
    };
  });

  const results = await withConcurrency(5, tasks);
  const rows = results
    .filter((r): r is DemandSupplyRow => !!r && !(r instanceof Error))
    .sort((a, b) => {
      if (b.hitCount !== a.hitCount) return b.hitCount - a.hitCount;
      return b.score - a.score;
    });

  return {
    rows,
    meta: {
      scannedAt: new Date().toISOString(),
      universeSize: universe.length,
      analyzed: pool.length,
      errors: errors.slice(0, 40),
      scope,
      exchange,
    },
  };
}
