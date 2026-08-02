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

interface OkxEnvelope {
  code: string;
  msg: string;
  data?: string[][];
}

const BINANCE_FAPI = "https://fapi.binance.com";
/** 선물 fapi가 451일 때 쓰는 공개 데이터 호스트 (스팟 캔들) */
const BINANCE_DATA = "https://data-api.binance.vision";
const OKX_BASE = process.env.OKX_BASE_URL ?? "https://www.okx.com";

const FETCH_HEADERS: HeadersInit = {
  Accept: "application/json",
  "User-Agent": "DailyTradingJournal/1.0",
};

/** Bybit interval → Binance interval */
export function toBinanceInterval(interval: string): string {
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
  return map[interval] ?? (/\d+[mhHdDwW]/.test(interval) ? interval : "15m");
}

/** Bybit interval → OKX bar */
function toOkxBar(interval: string): string {
  const map: Record<string, string> = {
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
    W: "1W",
    M: "1M",
  };
  return map[interval] ?? "15m";
}

function toOkxInstId(symbol: string): string {
  const base = symbol.replace(/USDT$/i, "").toUpperCase();
  return `${base}-USDT-SWAP`;
}

function sortCandles(candles: Candle[]): Candle[] {
  return candles.sort((a, b) => a.time - b.time);
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

  return sortCandles(
    (result.list ?? []).map((row) => ({
      time: Math.floor(Number(row[0]) / 1000),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
    }))
  );
}

async function fetchBinanceUrlKlines(
  base: string,
  path: string,
  options: {
    symbol: string;
    interval: string;
    start?: number;
    end?: number;
    limit: number;
  }
): Promise<Candle[]> {
  const params: Record<string, string> = {
    symbol: options.symbol.toUpperCase(),
    interval: toBinanceInterval(options.interval),
    limit: String(Math.min(options.limit, 1500)),
  };
  if (options.start) params.startTime = String(options.start);
  if (options.end) params.endTime = String(options.end);

  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${base}${path}?${qs}`, {
    headers: FETCH_HEADERS,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Binance klines HTTP ${res.status}`);
  }
  const rows = (await res.json()) as unknown[][];
  return sortCandles(
    rows.map((row) => ({
      time: Math.floor(Number(row[0]) / 1000),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
    }))
  );
}

async function fetchOkxKlines(options: {
  symbol: string;
  interval: string;
  start?: number;
  end?: number;
  limit: number;
}): Promise<Candle[]> {
  const params: Record<string, string> = {
    instId: toOkxInstId(options.symbol),
    bar: toOkxBar(options.interval),
    limit: String(Math.min(options.limit, 300)),
  };
  // OKX: after/before are candle ids (ms). before = end
  if (options.end) params.before = String(options.end);

  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${OKX_BASE}/api/v5/market/candles?${qs}`, {
    headers: FETCH_HEADERS,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`OKX klines HTTP ${res.status}`);
  }
  const data = (await res.json()) as OkxEnvelope;
  if (data.code !== "0") {
    throw new Error(`OKX klines: ${data.msg || data.code}`);
  }

  // OKX: [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm] newest first
  let candles = (data.data ?? []).map((row) => ({
    time: Math.floor(Number(row[0]) / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
  }));

  if (options.start) {
    const startSec = Math.floor(options.start / 1000);
    candles = candles.filter((c) => c.time >= startSec);
  }

  return sortCandles(candles);
}

type Source = "bybit" | "binance" | "binance-data" | "okx";

async function trySources(
  sources: Source[],
  args: {
    symbol: string;
    interval: string;
    start?: number;
    end?: number;
    limit: number;
  }
): Promise<{ candles: Candle[]; source: Source }> {
  const errors: string[] = [];
  for (const src of sources) {
    try {
      let candles: Candle[];
      if (src === "bybit") candles = await fetchBybitKlines(args);
      else if (src === "binance") {
        candles = await fetchBinanceUrlKlines(
          BINANCE_FAPI,
          "/fapi/v1/klines",
          args
        );
      } else if (src === "binance-data") {
        candles = await fetchBinanceUrlKlines(
          BINANCE_DATA,
          "/api/v3/klines",
          args
        );
      } else {
        candles = await fetchOkxKlines(args);
      }
      if (candles.length === 0) {
        errors.push(`${src}: empty`);
        continue;
      }
      return { candles, source: src };
    } catch (err) {
      errors.push(
        `${src}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  throw new Error(`캔들 조회 실패 — ${errors.join(" · ")}`);
}

/**
 * 차트용 캔들 조회.
 * Vercel IP에서 Bybit 403 / Binance 451이 흔해 여러 공개 소스를 순서대로 시도합니다.
 * (차트 라이브러리 lightweight-charts 와는 별개 — 이미 package.json에 포함)
 */
export async function fetchKlines(options: {
  symbol: string;
  interval?: string;
  start?: number;
  end?: number;
  limit?: number;
  prefer?: "bybit" | "binance" | "okx" | "auto";
}): Promise<Candle[]> {
  const result = await fetchKlinesWithSource(options);
  return result.candles;
}

export async function fetchKlinesWithSource(options: {
  symbol: string;
  interval?: string;
  start?: number;
  end?: number;
  limit?: number;
  prefer?: "bybit" | "binance" | "okx" | "auto";
}): Promise<{ candles: Candle[]; source: Source }> {
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

  let sources: Source[];
  if (prefer === "binance") {
    sources = ["binance", "binance-data", "okx", "bybit"];
  } else if (prefer === "bybit") {
    sources = ["bybit", "okx", "binance-data", "binance"];
  } else if (prefer === "okx") {
    sources = ["okx", "bybit", "binance-data", "binance"];
  } else {
    // auto: OKX가 클라우드에서 비교적 안정적인 편 → 앞쪽에 배치
    sources = ["okx", "binance-data", "bybit", "binance"];
  }

  return trySources(sources, args);
}

/** 매매 구간에 맞는 interval */
export function pickInterval(entryMs: number, exitMs: number): string {
  const durMin = Math.max(1, (exitMs - entryMs) / 60_000);
  if (durMin <= 90) return "1";
  if (durMin <= 240) return "5";
  if (durMin <= 720) return "15";
  if (durMin <= 2160) return "30";
  if (durMin <= 5760) return "60";
  return "240";
}

/** 차트용 시간 윈도우 */
export function chartWindow(entryMs: number, exitMs: number) {
  const hold = Math.max(exitMs - entryMs, 30 * 60 * 1000);
  const padBefore = Math.max(hold * 2.2, 3 * 60 * 60 * 1000);
  const padAfter = Math.max(hold * 1.2, 2 * 60 * 60 * 1000);
  return {
    start: entryMs - padBefore,
    end: Math.min(Date.now(), exitMs + padAfter),
    interval: pickInterval(entryMs, exitMs),
  };
}
