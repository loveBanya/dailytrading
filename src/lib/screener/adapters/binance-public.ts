import { cacheAgeSec, TTL, withCache } from "../cache";
import type { OhlcvCandle, Timeframe, UniverseTicker } from "../types";
import { baseFromSymbol } from "../filters";
import type { ExchangePublicAdapter } from "./types";

const BINANCE_FAPI = "https://fapi.binance.com";

const TF_MAP: Record<Timeframe, string> = {
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
};

async function binancePublicGet<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const url = qs ? `${BINANCE_FAPI}${path}?${qs}` : `${BINANCE_FAPI}${path}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Binance public ${path} HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

interface ExchangeInfo {
  symbols: Array<{
    symbol: string;
    status: string;
    contractType: string;
    quoteAsset: string;
    baseAsset: string;
  }>;
}

interface Ticker24h {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
  highPrice: string;
  lowPrice: string;
}

export const binancePublicAdapter: ExchangePublicAdapter = {
  exchange: "binance",

  async listUniverse() {
    return withCache("binance:universe", TTL.tickers, async () => {
      const [info, tickers] = await Promise.all([
        withCache("binance:exchangeInfo", TTL.instruments, () =>
          binancePublicGet<ExchangeInfo>("/fapi/v1/exchangeInfo")
        ),
        binancePublicGet<Ticker24h[]>("/fapi/v1/ticker/24hr"),
      ]);

      const tradableMeta = new Map(
        info.symbols
          .filter(
            (s) =>
              s.status === "TRADING" &&
              s.quoteAsset === "USDT" &&
              (s.contractType === "PERPETUAL" ||
                s.contractType === "TRADIFI_PERPETUAL")
          )
          .map((s) => [
            s.symbol,
            s.contractType === "TRADIFI_PERPETUAL"
              ? ("stock" as const)
              : ("crypto" as const),
          ])
      );

      return tickers
        .filter((t) => tradableMeta.has(t.symbol))
        .map((t): UniverseTicker => {
          const assetKind = tradableMeta.get(t.symbol) ?? "crypto";
          return {
            exchange: "binance",
            symbol: t.symbol,
            baseAsset: baseFromSymbol(t.symbol),
            lastPrice: Number(t.lastPrice),
            change24hPct: Number(t.priceChangePercent),
            turnover24h: Number(t.quoteVolume),
            high24h: Number(t.highPrice),
            low24h: Number(t.lowPrice),
            assetKind,
          };
        });
    });
  },

  async fetchKlines(symbol, timeframe, limit = 120) {
    const key = `binance:klines:${symbol}:${timeframe}:${limit}`;
    return withCache(key, TTL.klines, async () => {
      const rows = await binancePublicGet<unknown[][]>("/fapi/v1/klines", {
        symbol,
        interval: TF_MAP[timeframe],
        limit: String(limit),
      });
      return rows.map(
        (r): OhlcvCandle => ({
          time: Number(r[0]),
          open: Number(r[1]),
          high: Number(r[2]),
          low: Number(r[3]),
          close: Number(r[4]),
          volume: Number(r[5]),
          turnover: Number(r[7]),
          takerBuyVolume: Number(r[9]),
        })
      );
    });
  },

  async fetchFundingRate(symbol) {
    const key = `binance:funding:${symbol}`;
    try {
      return await withCache(key, TTL.funding, async () => {
        const row = await binancePublicGet<{ lastFundingRate: string }>(
          "/fapi/v1/premiumIndex",
          { symbol }
        );
        return Number(row.lastFundingRate);
      });
    } catch {
      return null;
    }
  },

  async fetchOpenInterestChangePct(symbol) {
    const key = `binance:oihist:${symbol}`;
    try {
      return await withCache(key, TTL.oi, async () => {
        const rows = await binancePublicGet<
          Array<{ sumOpenInterest: string; timestamp: number }>
        >("/futures/data/openInterestHist", {
          symbol,
          period: "1h",
          limit: "3",
        });
        if (!rows || rows.length < 2) return null;
        const sorted = [...rows].sort((a, b) => a.timestamp - b.timestamp);
        const prev = Number(sorted[sorted.length - 2].sumOpenInterest);
        const last = Number(sorted[sorted.length - 1].sumOpenInterest);
        if (!prev) return null;
        return ((last - prev) / prev) * 100;
      });
    } catch {
      return null;
    }
  },
};

export function binanceCacheAges() {
  return {
    tickersAgeSec: cacheAgeSec("binance:universe"),
    klinesAgeSec: cacheAgeSec("binance:klines:BTCUSDT:15m:120"),
    oiAgeSec: cacheAgeSec("binance:oihist:BTCUSDT"),
    fundingAgeSec: cacheAgeSec("binance:funding:BTCUSDT"),
  };
}
