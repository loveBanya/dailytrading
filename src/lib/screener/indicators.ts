import type { OhlcvCandle } from "./types";

/** 미완성 봉 제외 — 마지막이 진행 중이면 제거 */
export function completedCandles(
  candles: OhlcvCandle[],
  intervalMs: number,
  now = Date.now()
): OhlcvCandle[] {
  if (candles.length === 0) return [];
  const last = candles[candles.length - 1];
  if (last.time + intervalMs > now) {
    return candles.slice(0, -1);
  }
  return candles;
}

export function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  out.push(prev);
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function sma(values: number[], period: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : NaN);
  }
  return out;
}

export function rsi(closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(NaN);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9
): { macd: number[]; signal: number[]; hist: number[] } {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const line = emaFast.map((v, i) => v - emaSlow[i]);
  const sig = ema(line, signal);
  const hist = line.map((v, i) => v - sig[i]);
  return { macd: line, signal: sig, hist };
}

export function bollinger(
  closes: number[],
  period = 20,
  mult = 2
): { mid: number[]; upper: number[]; lower: number[]; width: number[] } {
  const mid = sma(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];
  const width: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1 || Number.isNaN(mid[i])) {
      upper.push(NaN);
      lower.push(NaN);
      width.push(NaN);
      continue;
    }
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = closes[j] - mid[i];
      sumSq += d * d;
    }
    const std = Math.sqrt(sumSq / period);
    upper.push(mid[i] + mult * std);
    lower.push(mid[i] - mult * std);
    width.push((2 * mult * std) / mid[i]);
  }
  return { mid, upper, lower, width };
}

export function atr(candles: OhlcvCandle[], period = 14): number[] {
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr.push(candles[i].high - candles[i].low);
      continue;
    }
    const prev = candles[i - 1].close;
    tr.push(
      Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - prev),
        Math.abs(candles[i].low - prev)
      )
    );
  }
  return ema(tr, period);
}

export function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function pctChange(from: number, to: number): number {
  if (!from) return 0;
  return ((to - from) / from) * 100;
}

export function lastFinite(arr: number[]): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (Number.isFinite(arr[i])) return arr[i];
  }
  return NaN;
}

export function slope(arr: number[], lookback = 5): number {
  if (arr.length < lookback + 1) return 0;
  const a = arr[arr.length - 1 - lookback];
  const b = arr[arr.length - 1];
  if (!a) return 0;
  return ((b - a) / Math.abs(a)) * 100;
}

export function recentCross(
  fast: number[],
  slow: number[],
  within = 5
): "golden" | "dead" | null {
  const n = Math.min(fast.length, slow.length);
  if (n < 2) return null;
  for (let i = 0; i < within; i++) {
    const idx = n - 1 - i;
    if (idx < 1) break;
    const prevUp = fast[idx - 1] <= slow[idx - 1];
    const nowUp = fast[idx] > slow[idx];
    const prevDown = fast[idx - 1] >= slow[idx - 1];
    const nowDown = fast[idx] < slow[idx];
    if (prevUp && nowUp) return "golden";
    if (prevDown && nowDown) return "dead";
  }
  return null;
}

/** MACD(또는 임의의 라인)가 0선을 최근 상향/하향 돌파했는지 */
export function recentZeroCross(
  line: number[],
  within = 5
): "up" | "down" | null {
  const n = line.length;
  if (n < 2) return null;
  for (let i = 0; i < within; i++) {
    const idx = n - 1 - i;
    if (idx < 1) break;
    const prev = line[idx - 1];
    const now = line[idx];
    if (!Number.isFinite(prev) || !Number.isFinite(now)) continue;
    if (prev <= 0 && now > 0) return "up";
    if (prev >= 0 && now < 0) return "down";
  }
  return null;
}

export function swingLow(candles: OhlcvCandle[], lookback = 20): number {
  const slice = candles.slice(-lookback);
  return Math.min(...slice.map((c) => c.low));
}

export function swingHigh(candles: OhlcvCandle[], lookback = 20): number {
  const slice = candles.slice(-lookback);
  return Math.max(...slice.map((c) => c.high));
}

export const INTERVAL_MS: Record<string, number> = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
};
