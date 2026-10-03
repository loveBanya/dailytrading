import { bybitPublicGet } from "./bybit-client";

export interface MarketTicker {
  symbol: string;
  lastPrice: number;
  change24h: number;
  high24h: number;
  low24h: number;
  turnover24h: number;
  /** 바이비트 선물 최소 주문 수량 */
  minOrderQty?: number;
  /** 바이비트 선물 수량 단위 */
  qtyStep?: number;
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
  "SOXLUSDT",
  "KORUUSDT",
  "ICPUSDT",
];

interface InstrumentInfoResult {
  list?: Array<{
    symbol: string;
    lotSizeFilter?: {
      minOrderQty?: string;
      qtyStep?: string;
    };
  }>;
}

const lotCache = new Map<
  string,
  { minOrderQty: number; qtyStep: number; at: number }
>();

async function lotSizeFor(symbol: string): Promise<{
  minOrderQty?: number;
  qtyStep?: number;
}> {
  const hit = lotCache.get(symbol);
  if (hit && Date.now() - hit.at < 60 * 60 * 1000) {
    return { minOrderQty: hit.minOrderQty, qtyStep: hit.qtyStep };
  }
  try {
    const result = await bybitPublicGet<InstrumentInfoResult>(
      "/v5/market/instruments-info",
      { category: "linear", symbol }
    );
    const filter = result.list?.[0]?.lotSizeFilter;
    const minOrderQty = Number(filter?.minOrderQty);
    const qtyStep = Number(filter?.qtyStep);
    if (minOrderQty > 0 && qtyStep > 0) {
      lotCache.set(symbol, { minOrderQty, qtyStep, at: Date.now() });
      return { minOrderQty, qtyStep };
    }
  } catch {
    if (hit) return { minOrderQty: hit.minOrderQty, qtyStep: hit.qtyStep };
  }
  return {};
}

let linearCache: {
  at: number;
  list: NonNullable<TickerListResult["list"]>;
} | null = null;

async function linearTickers() {
  if (linearCache && Date.now() - linearCache.at < 20_000) return linearCache.list;
  const result = await bybitPublicGet<TickerListResult>("/v5/market/tickers", {
    category: "linear",
  });
  const list = result.list ?? [];
  linearCache = { at: Date.now(), list };
  return list;
}

/** 심볼 앞글자 검색. 수량 단위는 고른 뒤에 따로 가져온다. */
export async function searchMarketTickers(
  query: string,
  limit = 8
): Promise<MarketTicker[]> {
  const q = query.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (q.length < 1) return [];
  const base = q.endsWith("USDT") ? q.slice(0, -4) : q;
  if (base.length < 1) return [];
  const list = await linearTickers();
  const ranked = list
    .map((t) => {
      if (!t.symbol.endsWith("USDT")) return null;
      const name = t.symbol.slice(0, -4);
      let score = 3;
      if (name === base) score = 0;
      else if (name.startsWith(base)) score = 1;
      else if (name.includes(base)) score = 2;
      else return null;
      return { t, score, turnover: Number(t.turnover24h) || 0 };
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .sort((a, b) => a.score - b.score || b.turnover - a.turnover)
    .slice(0, limit);

  return ranked.map(({ t }) => ({
    symbol: t.symbol,
    lastPrice: Number(t.lastPrice),
    change24h: Number(t.price24hPcnt) * 100,
    high24h: Number(t.highPrice24h),
    low24h: Number(t.lowPrice24h),
    turnover24h: Number(t.turnover24h),
  }));
}

export async function fetchMarketTickers(
  symbols: string[] = DEFAULT_SYMBOLS
): Promise<MarketTicker[]> {
  const list = await linearTickers();
  const wanted = new Set(symbols);
  const rows = list.filter((t) => wanted.has(t.symbol));
  const lots = await Promise.all(rows.map((t) => lotSizeFor(t.symbol)));
  return rows
    .map((t, i) => ({
      symbol: t.symbol,
      lastPrice: Number(t.lastPrice),
      change24h: Number(t.price24hPcnt) * 100,
      high24h: Number(t.highPrice24h),
      low24h: Number(t.lowPrice24h),
      turnover24h: Number(t.turnover24h),
      minOrderQty: lots[i]?.minOrderQty,
      qtyStep: lots[i]?.qtyStep,
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
