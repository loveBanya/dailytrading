import { bybitPublicGet } from "./bybit-client";

export interface MarketTicker {
  symbol: string;
  lastPrice: number;
  change24h: number;
  high24h: number;
  low24h: number;
  turnover24h: number;
}

export interface FearGreed {
  value: number;
  classification: string;
  updatedAt: string;
}

export interface MarketOverview {
  tickers: MarketTicker[];
  fearGreed: FearGreed | null;
}

interface TickerListResult {
  list?: Array<{
    symbol: string;
    lastPrice: string;
    price24hPcnt: string;
    highPrice24h: string;
    lowPrice24h: string;
    turnover24h: string;
  }>;
}

const DEFAULT_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "ICPUSDT",
];

export async function fetchMarketTickers(
  symbols: string[] = DEFAULT_SYMBOLS
): Promise<MarketTicker[]> {
  const result = await bybitPublicGet<TickerListResult>(
    "/v5/market/tickers",
    { category: "linear" }
  );

  const wanted = new Set(symbols);
  return (result.list ?? [])
    .filter((t) => wanted.has(t.symbol))
    .map((t) => ({
      symbol: t.symbol,
      lastPrice: Number(t.lastPrice),
      change24h: Number(t.price24hPcnt) * 100,
      high24h: Number(t.highPrice24h),
      low24h: Number(t.lowPrice24h),
      turnover24h: Number(t.turnover24h),
    }))
    .sort(
      (a, b) => symbols.indexOf(a.symbol) - symbols.indexOf(b.symbol)
    );
}

export async function fetchFearGreed(): Promise<FearGreed | null> {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1", {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: Array<{ value: string; value_classification: string; timestamp: string }>;
    };
    const item = data.data?.[0];
    if (!item) return null;
    return {
      value: Number(item.value),
      classification: item.value_classification,
      updatedAt: new Date(Number(item.timestamp) * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function fetchMarketOverview(): Promise<MarketOverview> {
  const [tickers, fearGreed] = await Promise.all([
    fetchMarketTickers(),
    fetchFearGreed(),
  ]);
  return { tickers, fearGreed };
}
