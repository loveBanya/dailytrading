import { bybitPublicGet } from "./bybit-client";

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

interface KlineResult {
  list?: string[][];
}

const BINANCE_FAPI = "https://fapi.binance.com";

/** Bybit interval → Binance futures interval */
function toBinanceInterval(interval: string): string {
  const map: Record<string, string> = {
    "1": "1m",
    "3": "3m",
    "5": "5m",
    "15": "15m",
    "30": "30m",
    "60": "1h",
    "120": "2h",
    "240": "4h",
    "360": "6h",
    "720": "12h",
    D: "1d",
    W: "1w",
    M: "1M",
  };
  return map[interval] ?? (interval.includes("m") || interval.includes("h")
    ? interval
    : "15m");
}

async function fetchBybitKlines(options: {
  symbol: string;
  interval: string;
  start?: number;
  end?: number;
  limit: number;
}): Promise<Candle[]> {
  const params: Record<string, string> = {
    category: "linear",
    symbol: options.symbol,
    interval: options.interval,
    limit: String(options.limit),
  };
  if (options.start) params.start = String(options.start);
  if (options.end) params.end = String(options.end);

  const result = await bybitPublicGet<KlineResult>(
    "/v5/market/kline",
    params
  );

  return (result.list ?? [])
    .map((row) => ({
      time: Math.floor(Number(row[0]) / 1000),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
    }))
    .sort((a, b) => a.time - b.time);
}

async function fetchBinanceKlines(options: {
  symbol: string;
  interval: string;
  start?: number;
  end?: number;
  limit: number;
}): Promise<Candle[]> {
  const params: Record<string, string> = {
    symbol: options.symbol.toUpperCase(),
    interval: toBinanceInterval(options.interval),
    limit: String(Math.min(options.limit, 1500)),
  };
  if (options.start) params.startTime = String(options.start);
  if (options.end) params.endTime = String(options.end);

  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BINANCE_FAPI}/fapi/v1/klines?${qs}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "DailyTradingJournal/1.0",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Binance public klines HTTP ${res.status}`);
  }
  const rows = (await res.json()) as unknown[][];
  return rows
    .map((row) => ({
      time: Math.floor(Number(row[0]) / 1000),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
    }))
    .sort((a, b) => a.time - b.time);
}

/**
 * 차트용 캔들 조회.
 * Vercel 등에서 Bybit 공개 API가 403인 경우가 많아 Binance로 폴백합니다.
 */
export async function fetchKlines(options: {
  symbol: string;
  interval?: string;
  start?: number;
  end?: number;
  limit?: number;
  /** preferred: bybit | binance | auto */
  prefer?: "bybit" | "binance" | "auto";
}): Promise<Candle[]> {
  const interval = options.interval ?? "15";
  const limit = options.limit ?? 200;
  const prefer = options.prefer ?? "auto";
  const args = {
    symbol: options.symbol,
    interval,
    start: options.start,
    end: options.end,
    limit,
  };

  const tryBybit = prefer !== "binance";
  const tryBinance = prefer !== "bybit";

  if (tryBybit) {
    try {
      return await fetchBybitKlines(args);
    } catch (err) {
      if (!tryBinance) throw err;
      // fall through to Binance
    }
  }

  return fetchBinanceKlines(args);
}

/** 매매 구간에 맞는 interval — 사진처럼 캔들이 크게 보이도록 세밀하게 */
export function pickInterval(entryMs: number, exitMs: number): string {
  const durMin = Math.max(1, (exitMs - entryMs) / 60_000);
  if (durMin <= 90) return "1";
  if (durMin <= 240) return "5";
  if (durMin <= 720) return "15";
  if (durMin <= 2160) return "30";
  if (durMin <= 5760) return "60";
  return "240";
}

/** 차트용 시간 윈도우 (진입 전후 적당히 — 너무 넓지 않게) */
export function chartWindow(entryMs: number, exitMs: number) {
  const hold = Math.max(exitMs - entryMs, 30 * 60 * 1000);
  // 사진처럼: 보유시간의 약 2~2.5배 전후
  const padBefore = Math.max(hold * 2.2, 3 * 60 * 60 * 1000);
  const padAfter = Math.max(hold * 1.2, 2 * 60 * 60 * 1000);
  return {
    start: entryMs - padBefore,
    end: Math.min(Date.now(), exitMs + padAfter),
    interval: pickInterval(entryMs, exitMs),
  };
}
