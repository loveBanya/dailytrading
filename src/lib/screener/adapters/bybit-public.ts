import { bybitPublicGet } from "@/lib/exchanges/bybit-client";
import { cacheAgeSec, TTL, withCache } from "../cache";
import type { OhlcvCandle, Timeframe, UniverseTicker } from "../types";
import { baseFromSymbol } from "../filters";
import type { ExchangePublicAdapter } from "./types";

const TF_MAP: Record<Timeframe, string> = {
  "5m": "5",
  "15m": "15",
  "1h": "60",
  "4h": "240",
};

interface InstrumentsResult {
  list?: Array<{
    symbol: string;
    status: string;
    quoteCoin: string;
    contractType?: string;
    baseCoin?: string;
  }>;
}

interface TickersResult {
  list?: Array<{
    symbol: string;
    lastPrice: string;
    price24hPcnt: string;
    turnover24h: string;
    highPrice24h: string;
    lowPrice24h: string;
    fundingRate?: string;
    openInterestValue?: string;
  }>;
}

interface KlineResult {
  list?: string[][];
}

export const bybitPublicAdapter: ExchangePublicAdapter = {
  exchange: "bybit",

  async listUniverse() {
    return withCache("bybit:universe", TTL.tickers, async () => {
      const [inst, tickers] = await Promise.all([
        withCache("bybit:instruments", TTL.instruments, () =>
          bybitPublicGet<InstrumentsResult>("/v5/market/instruments-info", {
            category: "linear",
            limit: "1000",
          })
        ),
        bybitPublicGet<TickersResult>("/v5/market/tickers", {
          category: "linear",
        }),
      ]);

      const tradable = new Set(
        (inst.list ?? [])
          .filter(
            (s) =>
              s.status === "Trading" &&
              s.quoteCoin === "USDT" &&
              (s.contractType === "LinearPerpetual" || !s.contractType)
          )
          .map((s) => s.symbol)
      );

      return (tickers.list ?? [])
        .filter((t) => tradable.has(t.symbol) && t.symbol.endsWith("USDT"))
        .map(
          (t): UniverseTicker => ({
            exchange: "bybit",
            symbol: t.symbol,
            baseAsset: baseFromSymbol(t.symbol),
            lastPrice: Number(t.lastPrice),
            change24hPct: Number(t.price24hPcnt) * 100,
            turnover24h: Number(t.turnover24h),
            high24h: Number(t.highPrice24h),
            low24h: Number(t.lowPrice24h),
          })
        );
    });
  },

  async fetchKlines(symbol, timeframe, limit = 120) {
    const key = `bybit:klines:${symbol}:${timeframe}:${limit}`;
    return withCache(key, TTL.klines, async () => {
      const result = await bybitPublicGet<KlineResult>("/v5/market/kline", {
        category: "linear",
        symbol,
        interval: TF_MAP[timeframe],
        limit: String(limit),
      });
      // Bybit returns newest first
      return (result.list ?? [])
        .map(
          (r): OhlcvCandle => ({
            time: Number(r[0]),
            open: Number(r[1]),
            high: Number(r[2]),
            low: Number(r[3]),
            close: Number(r[4]),
            volume: Number(r[5]),
            turnover: Number(r[6]),
          })
        )
        .sort((a, b) => a.time - b.time);
    });
  },

  async fetchFundingRate(symbol) {
    const key = `bybit:funding:${symbol}`;
    try {
      return await withCache(key, TTL.funding, async () => {
        const result = await bybitPublicGet<TickersResult>(
          "/v5/market/tickers",
          { category: "linear", symbol }
        );
        const row = result.list?.[0];
        if (!row?.fundingRate) return null;
        return Number(row.fundingRate);
      });
    } catch {
      return null;
    }
  },

  async fetchOpenInterestChangePct(symbol) {
    const key = `bybit:oi:${symbol}`;
    try {
      return await withCache(key, TTL.oi, async () => {
        const result = await bybitPublicGet<{
          list?: Array<{ openInterest: string; timestamp: string }>;
        }>("/v5/market/open-interest", {
          category: "linear",
          symbol,
          intervalTime: "1h",
          limit: "3",
        });
        const list = (result.list ?? [])
          .map((r) => ({
            oi: Number(r.openInterest),
            ts: Number(r.timestamp),
          }))
          .sort((a, b) => a.ts - b.ts);
        if (list.length < 2 || !list[list.length - 2].oi) return null;
        const prev = list[list.length - 2].oi;
        const last = list[list.length - 1].oi;
        return ((last - prev) / prev) * 100;
      });
    } catch {
      return null;
    }
  },
};

export function bybitCacheAges() {
  return {
    tickersAgeSec: cacheAgeSec("bybit:universe"),
    klinesAgeSec: cacheAgeSec("bybit:klines:BTCUSDT:15m:120"),
    oiAgeSec: cacheAgeSec("bybit:oi:BTCUSDT"),
    fundingAgeSec: cacheAgeSec("bybit:funding:BTCUSDT"),
  };
}
