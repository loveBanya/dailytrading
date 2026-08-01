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

/**
 * Bybit 캔들 조회 (공개 API)
 * interval: 1,3,5,15,30,60,120,240,360,720,D,W,M
 */
export async function fetchKlines(options: {
  symbol: string;
  interval?: string;
  start?: number;
  end?: number;
  limit?: number;
}): Promise<Candle[]> {
  const params: Record<string, string> = {
    category: "linear",
    symbol: options.symbol,
    interval: options.interval ?? "15",
    limit: String(options.limit ?? 200),
  };
  if (options.start) params.start = String(options.start);
  if (options.end) params.end = String(options.end);

  const result = await bybitPublicGet<KlineResult>(
    "/v5/market/kline",
    params
  );

  const candles = (result.list ?? [])
    .map((row) => ({
      time: Math.floor(Number(row[0]) / 1000),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
    }))
    .sort((a, b) => a.time - b.time);

  return candles;
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
