import type { Candle } from "./klines";
import { toBinanceInterval } from "./klines";

/**
 * 브라우저에서 직접 캔들 조회 (유저 IP).
 * Vercel 서버가 거래소에 막힐 때 UI 폴백용.
 * CORS 허용되는 OKX / Binance data-api 만 사용.
 */
export async function fetchKlinesBrowser(options: {
  symbol: string;
  interval?: string;
  start?: number;
  end?: number;
  limit?: number;
}): Promise<Candle[]> {
  const interval = options.interval ?? "15";
  const limit = options.limit ?? 200;
  const errors: string[] = [];

  try {
    return await fetchOkxBrowser({ ...options, interval, limit });
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  try {
    return await fetchBinanceDataBrowser({ ...options, interval, limit });
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  throw new Error(`브라우저 캔들 실패 — ${errors.join(" · ")}`);
}

async function fetchOkxBrowser(options: {
  symbol: string;
  interval: string;
  start?: number;
  end?: number;
  limit: number;
}): Promise<Candle[]> {
  const base = options.symbol.replace(/USDT$/i, "").toUpperCase();
  const barMap: Record<string, string> = {
    "1": "1m",
    "3": "3m",
    "5": "5m",
    "15": "15m",
    "30": "30m",
    "60": "1H",
    "120": "2H",
    "240": "4H",
    "360": "6H",
    "720": "12H",
    D: "1D",
  };
  const params = new URLSearchParams({
    instId: `${base}-USDT-SWAP`,
    bar: barMap[options.interval] ?? "15m",
    limit: String(Math.min(options.limit, 300)),
  });
  if (options.end) params.set("before", String(options.end));

  const res = await fetch(
    `https://www.okx.com/api/v5/market/candles?${params}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(`OKX HTTP ${res.status}`);
  const json = (await res.json()) as {
    code: string;
    msg?: string;
    data?: string[][];
  };
  if (json.code !== "0") throw new Error(json.msg || json.code);

  let candles = (json.data ?? []).map((row) => ({
    time: Math.floor(Number(row[0]) / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
  }));
  if (options.start) {
    const s = Math.floor(options.start / 1000);
    candles = candles.filter((c) => c.time >= s);
  }
  return candles.sort((a, b) => a.time - b.time);
}

async function fetchBinanceDataBrowser(options: {
  symbol: string;
  interval: string;
  start?: number;
  end?: number;
  limit: number;
}): Promise<Candle[]> {
  const params = new URLSearchParams({
    symbol: options.symbol.toUpperCase(),
    interval: toBinanceInterval(options.interval),
    limit: String(Math.min(options.limit, 1000)),
  });
  if (options.start) params.set("startTime", String(options.start));
  if (options.end) params.set("endTime", String(options.end));

  const res = await fetch(
    `https://data-api.binance.vision/api/v3/klines?${params}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Binance data HTTP ${res.status}`);
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
