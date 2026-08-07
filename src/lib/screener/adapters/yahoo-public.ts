import { cacheAgeSec, TTL, withCache } from "../cache";
import type { OhlcvCandle, Timeframe, UniverseTicker } from "../types";
import type { ExchangePublicAdapter } from "./types";

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";

const HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "application/json",
};

interface YahooChartResult {
  chart: {
    result?: Array<{
      meta: {
        symbol: string;
        shortName?: string;
        longName?: string;
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        currency?: string;
        instrumentType?: string;
      };
      timestamp?: number[];
      indicators: {
        quote: Array<{
          open: Array<number | null>;
          high: Array<number | null>;
          low: Array<number | null>;
          close: Array<number | null>;
          volume: Array<number | null>;
        }>;
      };
    }>;
    error?: { description?: string } | null;
  };
}

function rangeFor(tf: Timeframe, limit: number): string {
  if (tf === "5m") return limit > 200 ? "60d" : "10d";
  if (tf === "15m") return limit > 200 ? "60d" : "30d";
  if (tf === "1h") return "60d";
  return "6mo";
}

function yahooInterval(tf: Timeframe): string {
  if (tf === "4h") return "60m";
  if (tf === "1h") return "60m";
  return tf;
}

function aggregateTo4h(candles: OhlcvCandle[]): OhlcvCandle[] {
  const out: OhlcvCandle[] = [];
  for (let i = 0; i + 3 < candles.length; i += 4) {
    const chunk = candles.slice(i, i + 4);
    const first = chunk[0]!;
    const last = chunk[chunk.length - 1]!;
    out.push({
      time: first.time,
      open: first.open,
      high: Math.max(...chunk.map((c) => c.high)),
      low: Math.min(...chunk.map((c) => c.low)),
      close: last.close,
      volume: chunk.reduce((a, c) => a + c.volume, 0),
      turnover: chunk.reduce((a, c) => a + c.turnover, 0),
    });
  }
  return out;
}

function parseCandles(data: YahooChartResult): OhlcvCandle[] {
  const result = data.chart.result?.[0];
  if (!result?.timestamp?.length) return [];
  const q = result.indicators.quote[0];
  if (!q) return [];
  const candles: OhlcvCandle[] = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const open = q.open[i];
    const high = q.high[i];
    const low = q.low[i];
    const close = q.close[i];
    if (
      open == null ||
      high == null ||
      low == null ||
      close == null ||
      !Number.isFinite(open) ||
      !Number.isFinite(close)
    ) {
      continue;
    }
    const volume = q.volume[i] ?? 0;
    candles.push({
      time: result.timestamp[i]! * 1000,
      open,
      high,
      low,
      close,
      volume: Number(volume) || 0,
      turnover: (Number(volume) || 0) * close,
    });
  }
  return candles;
}

async function fetchYahooChart(
  symbol: string,
  interval: string,
  range: string
): Promise<YahooChartResult> {
  const enc = encodeURIComponent(symbol);
  const url = `${YAHOO_CHART}/${enc}?interval=${interval}&range=${range}&includePrePost=false`;
  const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Yahoo chart ${symbol} HTTP ${res.status}`);
  }
  const data = (await res.json()) as YahooChartResult;
  if (data.chart.error) {
    throw new Error(
      data.chart.error.description ?? `Yahoo chart error for ${symbol}`
    );
  }
  return data;
}

export async function resolveYahooTicker(
  symbol: string
): Promise<UniverseTicker | null> {
  const key = `yahoo:quote:${symbol.toUpperCase()}`;
  return withCache(key, TTL.tickers, async () => {
    try {
      const data = await fetchYahooChart(symbol, "1d", "5d");
      const result = data.chart.result?.[0];
      if (!result) return null;
      const meta = result.meta;
      const candles = parseCandles(data);
      const last = candles[candles.length - 1];
      const prev = candles[candles.length - 2];
      const price = meta.regularMarketPrice ?? last?.close ?? 0;
      const prevClose =
        meta.chartPreviousClose ??
        meta.previousClose ??
        prev?.close ??
        price;
      const change24hPct =
        prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
      const dayTurnover = last?.turnover ?? 0;
      return {
        exchange: "yahoo" as const,
        symbol: meta.symbol || symbol,
        baseAsset: (meta.shortName || meta.symbol || symbol).slice(0, 24),
        lastPrice: price,
        change24hPct,
        turnover24h: dayTurnover,
        high24h: last?.high ?? price,
        low24h: last?.low ?? price,
      };
    } catch {
      return null;
    }
  });
}

export const yahooPublicAdapter: ExchangePublicAdapter = {
  exchange: "yahoo",

  async listUniverse() {
    return [];
  },

  async fetchKlines(symbol, timeframe, limit = 120) {
    const key = `yahoo:klines:${symbol}:${timeframe}:${limit}`;
    return withCache(key, TTL.klines, async () => {
      const interval = yahooInterval(timeframe);
      const range = rangeFor(timeframe, limit);
      const data = await fetchYahooChart(symbol, interval, range);
      let candles = parseCandles(data);
      if (timeframe === "4h") {
        candles = aggregateTo4h(candles);
      }
      return candles.slice(-limit);
    });
  },

  async fetchFundingRate() {
    return null;
  },

  async fetchOpenInterestChangePct() {
    return null;
  },
};

export function yahooCacheAges() {
  return {
    tickersAgeSec: cacheAgeSec("yahoo:quote:EWY"),
    klinesAgeSec: cacheAgeSec("yahoo:klines:EWY:15m:120"),
    oiAgeSec: null as number | null,
    fundingAgeSec: null as number | null,
  };
}
