/** 트레이딩뷰 ta.* 와 같은 씨앗(처음 length개는 SMA)으로 계산합니다. */

export function sma(values: number[], length: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (length < 1) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= length) sum -= values[i - length];
    if (i >= length - 1) out[i] = sum / length;
  }
  return out;
}

export function ema(values: number[], length: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (length < 1) return out;
  const alpha = 2 / (length + 1);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (i < length) {
      sum += values[i];
      if (i === length - 1) out[i] = sum / length;
      continue;
    }
    const prev = out[i - 1];
    if (prev == null) continue;
    out[i] = alpha * values[i] + (1 - alpha) * prev;
  }
  return out;
}

export function rma(values: number[], length: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (length < 1) return out;
  const alpha = 1 / length;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (i < length) {
      sum += values[i];
      if (i === length - 1) out[i] = sum / length;
      continue;
    }
    const prev = out[i - 1];
    if (prev == null) continue;
    out[i] = alpha * values[i] + (1 - alpha) * prev;
  }
  return out;
}

/** null 이 섞인 구간은 그 칸이 모두 숫자일 때만 평균을 냅니다. */
export function smaNullable(
  values: (number | null)[],
  length: number
): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (length < 1) return out;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] != null) {
      sum += values[i]!;
      count += 1;
    }
    if (i >= length && values[i - length] != null) {
      sum -= values[i - length]!;
      count -= 1;
    }
    if (i >= length - 1 && count === length) out[i] = sum / length;
  }
  return out;
}

/** 첫 유효 구간 length개로 씨앗을 만들고, 그 앞의 null 은 건너뜁니다. */
export function emaNullable(
  values: (number | null)[],
  length: number
): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (length < 1) return out;
  const alpha = 2 / (length + 1);
  let sum = 0;
  let counted = 0;
  let seeded = false;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (!seeded) {
      if (value == null) {
        sum = 0;
        counted = 0;
        continue;
      }
      sum += value;
      counted += 1;
      if (counted === length) {
        out[i] = sum / length;
        seeded = true;
      }
      continue;
    }
    const prev = out[i - 1];
    if (value == null || prev == null) continue;
    out[i] = alpha * value + (1 - alpha) * prev;
  }
  return out;
}

export function wma(values: number[], length: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (length < 1) return out;
  const denom = (length * (length + 1)) / 2;
  for (let i = length - 1; i < values.length; i += 1) {
    let acc = 0;
    for (let k = 0; k < length; k += 1) {
      acc += values[i - length + 1 + k] * (k + 1);
    }
    out[i] = acc / denom;
  }
  return out;
}

export function hma(values: number[], length: number): (number | null)[] {
  const half = Math.max(Math.round(length / 2), 1);
  const root = Math.max(Math.round(Math.sqrt(length)), 1);
  const fast = wma(values, half);
  const slow = wma(values, length);
  const diff: number[] = new Array(values.length).fill(0);
  const ready: boolean[] = new Array(values.length).fill(false);
  for (let i = 0; i < values.length; i += 1) {
    if (fast[i] == null || slow[i] == null) continue;
    diff[i] = 2 * fast[i]! - slow[i]!;
    ready[i] = true;
  }
  const out: (number | null)[] = new Array(values.length).fill(null);
  const denom = (root * (root + 1)) / 2;
  for (let i = 0; i < values.length; i += 1) {
    if (i < root - 1) continue;
    let acc = 0;
    let ok = true;
    for (let k = 0; k < root; k += 1) {
      const idx = i - root + 1 + k;
      if (!ready[idx]) {
        ok = false;
        break;
      }
      acc += diff[idx] * (k + 1);
    }
    if (ok) out[i] = acc / denom;
  }
  return out;
}

export function tr(
  high: number[],
  low: number[],
  close: number[]
): number[] {
  const out = new Array<number>(close.length).fill(0);
  for (let i = 0; i < close.length; i += 1) {
    if (i === 0) {
      out[i] = high[i] - low[i];
      continue;
    }
    out[i] = Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1])
    );
  }
  return out;
}

export function atr(
  high: number[],
  low: number[],
  close: number[],
  length: number
): (number | null)[] {
  return rma(tr(high, low, close), length);
}

export function rsi(values: number[], length: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (length < 1 || values.length <= length) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= length; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gain += delta;
    else loss -= delta;
  }
  let avgGain = gain / length;
  let avgLoss = loss / length;
  out[length] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = length + 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    const g = delta > 0 ? delta : 0;
    const l = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (length - 1) + g) / length;
    avgLoss = (avgLoss * (length - 1) + l) / length;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** ta.stoch(rsi, rsi, rsi, length) → 0~100 */
export function stochRsi(rsiValues: (number | null)[], length: number): (number | null)[] {
  const out: (number | null)[] = new Array(rsiValues.length).fill(null);
  for (let i = 0; i < rsiValues.length; i += 1) {
    if (i < length - 1) continue;
    let hi = -Infinity;
    let lo = Infinity;
    let ok = true;
    for (let k = i - length + 1; k <= i; k += 1) {
      const v = rsiValues[k];
      if (v == null) {
        ok = false;
        break;
      }
      hi = Math.max(hi, v);
      lo = Math.min(lo, v);
    }
    const cur = rsiValues[i];
    if (!ok || cur == null) continue;
    out[i] = hi === lo ? 0 : (100 * (cur - lo)) / (hi - lo);
  }
  return out;
}

export function highest(values: number[], length: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = length - 1; i < values.length; i += 1) {
    let m = -Infinity;
    for (let k = i - length + 1; k <= i; k += 1) m = Math.max(m, values[k]);
    out[i] = m;
  }
  return out;
}

export function lowest(values: number[], length: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = length - 1; i < values.length; i += 1) {
    let m = Infinity;
    for (let k = i - length + 1; k <= i; k += 1) m = Math.min(m, values[k]);
    out[i] = m;
  }
  return out;
}

/** 방향 -1 이 상승, 1 이 하락. ta.supertrend 와 같습니다. */
export function supertrend(
  high: number[],
  low: number[],
  close: number[],
  factor: number,
  period: number
): { line: (number | null)[]; dir: (number | null)[] } {
  const atrValues = atr(high, low, close, period);
  const line: (number | null)[] = new Array(close.length).fill(null);
  const dir: (number | null)[] = new Array(close.length).fill(null);
  const upper: number[] = new Array(close.length).fill(0);
  const lower: number[] = new Array(close.length).fill(0);
  for (let i = 0; i < close.length; i += 1) {
    const a = atrValues[i];
    if (a == null) continue;
    const hl2 = (high[i] + low[i]) / 2;
    const basicUpper = hl2 + factor * a;
    const basicLower = hl2 - factor * a;
    if (i === 0 || atrValues[i - 1] == null || line[i - 1] == null) {
      upper[i] = basicUpper;
      lower[i] = basicLower;
      dir[i] = 1;
      line[i] = upper[i];
      continue;
    }
    upper[i] =
      basicUpper < upper[i - 1] || close[i - 1] > upper[i - 1]
        ? basicUpper
        : upper[i - 1];
    lower[i] =
      basicLower > lower[i - 1] || close[i - 1] < lower[i - 1]
        ? basicLower
        : lower[i - 1];
    if (line[i - 1] === upper[i - 1]) {
      dir[i] = close[i] > upper[i] ? -1 : 1;
    } else {
      dir[i] = close[i] < lower[i] ? 1 : -1;
    }
    line[i] = dir[i] === -1 ? lower[i] : upper[i];
  }
  return { line, dir };
}

export function dmi(
  high: number[],
  low: number[],
  close: number[],
  diLength: number,
  adxLength: number
): {
  plus: (number | null)[];
  minus: (number | null)[];
  adx: (number | null)[];
} {
  const n = close.length;
  const plusDm = new Array<number>(n).fill(0);
  const minusDm = new Array<number>(n).fill(0);
  const trValues = tr(high, low, close);
  for (let i = 1; i < n; i += 1) {
    const up = high[i] - high[i - 1];
    const down = low[i - 1] - low[i];
    plusDm[i] = up > down && up > 0 ? up : 0;
    minusDm[i] = down > up && down > 0 ? down : 0;
  }
  const smoothPlus = rma(plusDm, diLength);
  const smoothMinus = rma(minusDm, diLength);
  const smoothTr = rma(trValues, diLength);
  const plus: (number | null)[] = new Array(n).fill(null);
  const minus: (number | null)[] = new Array(n).fill(null);
  const dx: number[] = new Array(n).fill(0);
  const dxReady: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i += 1) {
    const trv = smoothTr[i];
    if (trv == null || trv === 0 || smoothPlus[i] == null || smoothMinus[i] == null) {
      continue;
    }
    plus[i] = (100 * smoothPlus[i]!) / trv;
    minus[i] = (100 * smoothMinus[i]!) / trv;
    const sum = plus[i]! + minus[i]!;
    dx[i] = sum === 0 ? 0 : (100 * Math.abs(plus[i]! - minus[i]!)) / sum;
    dxReady[i] = true;
  }
  const adx: (number | null)[] = new Array(n).fill(null);
  const alpha = 1 / adxLength;
  let seed = 0;
  let seeded = 0;
  let prev: number | null = null;
  for (let i = 0; i < n; i += 1) {
    if (!dxReady[i]) continue;
    if (prev == null) {
      seed += dx[i];
      seeded += 1;
      if (seeded === adxLength) {
        prev = seed / adxLength;
        adx[i] = prev;
      }
      continue;
    }
    prev = alpha * dx[i] + (1 - alpha) * prev;
    adx[i] = prev;
  }
  return { plus, minus, adx };
}

/** 한국시간 자정에 리셋하는 세션 VWAP. 가격은 hlc3. */
export function sessionVwap(
  high: number[],
  low: number[],
  close: number[],
  volume: number[],
  time: number[]
): (number | null)[] {
  const out: (number | null)[] = new Array(close.length).fill(null);
  let day = -1;
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < close.length; i += 1) {
    const kstDay = Math.floor((time[i] + 9 * 3600) / 86400);
    if (kstDay !== day) {
      day = kstDay;
      pv = 0;
      vol = 0;
    }
    const typical = (high[i] + low[i] + close[i]) / 3;
    const v = volume[i] > 0 ? volume[i] : 0;
    pv += typical * v;
    vol += v;
    out[i] = vol > 0 ? pv / vol : typical;
  }
  return out;
}

export function crossedOver(
  a: (number | null)[],
  b: number | (number | null)[],
  i: number
): boolean {
  if (i < 1 || a[i] == null || a[i - 1] == null) return false;
  const hi = typeof b === "number" ? b : b[i];
  const lo = typeof b === "number" ? b : b[i - 1];
  if (hi == null || lo == null) return false;
  return a[i]! > hi && a[i - 1]! <= lo;
}

export function crossedUnder(
  a: (number | null)[],
  b: number | (number | null)[],
  i: number
): boolean {
  if (i < 1 || a[i] == null || a[i - 1] == null) return false;
  const hi = typeof b === "number" ? b : b[i];
  const lo = typeof b === "number" ? b : b[i - 1];
  if (hi == null || lo == null) return false;
  return a[i]! < hi && a[i - 1]! >= lo;
}

export function num(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}
