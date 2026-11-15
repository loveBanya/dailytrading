import {
  atr,
  bollinger,
  crossedOver,
  crossedUnder,
  dmi,
  ema,
  emaNullable,
  num,
  rsi,
  smaNullable,
  stochastic,
  supertrend,
} from "./indicators";
import { dollarMove, type BacktestTrade, type Bar, type Money } from "./types";

export type SideMode = "long" | "short" | "both";
export type RsiMode = "signal_cross" | "level_cross" | "zone";
export type DiMode = "above" | "cross";
export type WtMode = "extreme" | "any";
export type WtHtfMode = "state" | "cross";
export type BbMode = "bounce" | "break";
export type EmaMode = "cross" | "above";
export type StochMode = "cross" | "zone_cross";
export type StMode = "flip" | "dir";
/** 고정 R / ATR 배수 / 추적손절 / 1R 부분익절 후 추적 / 익절 없음 */
export type TargetMode = "r" | "atr" | "trail" | "partial" | "none";
export type ExitSignal = "none" | "macd" | "wt" | "ema" | "st";
export type ConditionId =
  | "macd"
  | "rsi"
  | "adx"
  | "di"
  | "wt"
  | "wth"
  | "ema"
  | "bb"
  | "stoch"
  | "st";

export interface IndicatorConfig {
  side: SideMode;
  macd: { on: boolean; fast: number; slow: number; signal: number; zeroFilter: boolean };
  rsi: {
    on: boolean;
    length: number;
    mode: RsiMode;
    signalLength: number;
    level: number;
    zoneMin: number;
    zoneMax: number;
  };
  adx: { on: boolean; length: number; min: number; rising: boolean };
  di: { on: boolean; mode: DiMode };
  wt: { on: boolean; n1: number; n2: number; ob: number; os: number; mode: WtMode };
  wth: { on: boolean; tf: string; mode: WtHtfMode };
  ema: { on: boolean; fast: number; slow: number; mode: EmaMode };
  bb: { on: boolean; length: number; mult: number; mode: BbMode };
  stoch: {
    on: boolean;
    length: number;
    smoothK: number;
    smoothD: number;
    mode: StochMode;
    os: number;
    ob: number;
  };
  st: { on: boolean; factor: number; period: number; mode: StMode };
  window: number;
  stop: { mode: "atr" | "pct"; atrMult: number; pct: number };
  target: {
    mode: TargetMode;
    /** mode=r 또는 partial의 1차 목표 */
    r: number;
    /** mode=atr 익절 거리 (ATR ×) */
    atrMult: number;
    /** trail / partial 나머지 추적 거리 (ATR ×) */
    trailAtr: number;
  };
  exitOn: ExitSignal;
  maxBars: number;
}

export const DEFAULT_INDICATOR_CONFIG: IndicatorConfig = {
  side: "long",
  macd: { on: true, fast: 12, slow: 26, signal: 9, zeroFilter: false },
  rsi: {
    on: true,
    length: 14,
    mode: "signal_cross",
    signalLength: 9,
    level: 50,
    zoneMin: 40,
    zoneMax: 70,
  },
  adx: { on: true, length: 14, min: 20, rising: false },
  di: { on: true, mode: "above" },
  wt: { on: false, n1: 10, n2: 21, ob: 53, os: -53, mode: "extreme" },
  wth: { on: false, tf: "60", mode: "state" },
  ema: { on: false, fast: 9, slow: 21, mode: "cross" },
  bb: { on: false, length: 20, mult: 2, mode: "bounce" },
  stoch: { on: false, length: 14, smoothK: 3, smoothD: 3, mode: "zone_cross", os: 20, ob: 80 },
  st: { on: false, factor: 3, period: 10, mode: "flip" },
  window: 3,
  stop: { mode: "atr", atrMult: 1.5, pct: 1 },
  target: { mode: "r", r: 2, atrMult: 2, trailAtr: 1.5 },
  exitOn: "macd",
  maxBars: 0,
};

export interface IndicatorSeries {
  macd: (number | null)[];
  signal: (number | null)[];
  hist: (number | null)[];
  rsi: (number | null)[];
  rsiSignal: (number | null)[];
  adx: (number | null)[];
  plus: (number | null)[];
  minus: (number | null)[];
  atr: (number | null)[];
  wt1: (number | null)[];
  wt2: (number | null)[];
  htfWt1: (number | null)[];
  htfWt2: (number | null)[];
  emaFast: (number | null)[];
  emaSlow: (number | null)[];
  bbMid: (number | null)[];
  bbUpper: (number | null)[];
  bbLower: (number | null)[];
  stochK: (number | null)[];
  stochD: (number | null)[];
  stLine: (number | null)[];
  stDir: (number | null)[];
}

export interface HigherTf {
  bars: Bar[];
  sec: number;
  chartSec: number;
}

export function waveTrend(bars: Bar[], n1: number, n2: number) {
  const ap = bars.map((b) => (b.high + b.low + b.close) / 3);
  const esa = ema(ap, Math.max(1, n1));
  const dev = ap.map((v, i) => (num(esa[i]) ? Math.abs(v - esa[i]!) : null));
  const d = emaNullable(dev, Math.max(1, n1));
  const ci = ap.map((v, i) =>
    num(esa[i]) && num(d[i]) && d[i]! !== 0 ? (v - esa[i]!) / (0.015 * d[i]!) : null
  );
  const wt1 = emaNullable(ci, Math.max(1, n2));
  const wt2 = smaNullable(wt1, 4);
  return { wt1, wt2 };
}

function alignClosed(
  chart: Bar[],
  htf: HigherTf,
  values: (number | null)[]
): (number | null)[] {
  const out: (number | null)[] = new Array(chart.length).fill(null);
  let j = -1;
  for (let i = 0; i < chart.length; i += 1) {
    const close = chart[i].time + htf.chartSec;
    while (j + 1 < htf.bars.length && htf.bars[j + 1].time + htf.sec <= close) j += 1;
    if (j >= 0) out[i] = values[j] ?? null;
  }
  return out;
}

export function computeSeries(
  bars: Bar[],
  config: IndicatorConfig,
  higher?: HigherTf | null
): IndicatorSeries {
  const close = bars.map((b) => b.close);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const fast = ema(close, Math.max(1, config.macd.fast));
  const slow = ema(close, Math.max(1, config.macd.slow));
  const macd = close.map((_, i) => (num(fast[i]) && num(slow[i]) ? fast[i]! - slow[i]! : null));
  const signal = emaNullable(macd, Math.max(1, config.macd.signal));
  const hist = macd.map((m, i) => (num(m) && num(signal[i]) ? m - signal[i]! : null));
  const r = rsi(close, Math.max(2, config.rsi.length));
  const d = dmi(high, low, close, Math.max(2, config.adx.length), Math.max(2, config.adx.length));
  const wt = waveTrend(bars, config.wt.n1, config.wt.n2);
  let htfWt1: (number | null)[] = new Array(bars.length).fill(null);
  let htfWt2: (number | null)[] = new Array(bars.length).fill(null);
  if (higher && higher.bars.length > 0) {
    const h = waveTrend(higher.bars, config.wt.n1, config.wt.n2);
    htfWt1 = alignClosed(bars, higher, h.wt1);
    htfWt2 = alignClosed(bars, higher, h.wt2);
  }
  const bb = bollinger(close, Math.max(2, config.bb.length), Math.max(0.1, config.bb.mult));
  const stoch = stochastic(
    high,
    low,
    close,
    Math.max(2, config.stoch.length),
    Math.max(1, config.stoch.smoothK),
    Math.max(1, config.stoch.smoothD)
  );
  const st = supertrend(
    high,
    low,
    close,
    Math.max(0.1, config.st.factor),
    Math.max(2, config.st.period)
  );
  return {
    macd,
    signal,
    hist,
    rsi: r,
    rsiSignal: smaNullable(r, Math.max(1, config.rsi.signalLength)),
    adx: d.adx,
    plus: d.plus,
    minus: d.minus,
    atr: atr(high, low, close, 14),
    wt1: wt.wt1,
    wt2: wt.wt2,
    htfWt1,
    htfWt2,
    emaFast: ema(close, Math.max(1, config.ema.fast)),
    emaSlow: ema(close, Math.max(1, config.ema.slow)),
    bbMid: bb.mid,
    bbUpper: bb.upper,
    bbLower: bb.lower,
    stochK: stoch.k,
    stochD: stoch.d,
    stLine: st.line,
    stDir: st.dir,
  };
}

function crossedWithin(test: (i: number) => boolean, i: number, window: number): boolean {
  for (let k = i; k > i - Math.max(1, window) && k >= 1; k -= 1) {
    if (test(k)) return true;
  }
  return false;
}

function wtCross(
  a: (number | null)[],
  b: (number | null)[],
  side: 1 | -1,
  k: number,
  config: IndicatorConfig
): boolean {
  const crossed = side === 1 ? crossedOver(a, b, k) : crossedUnder(a, b, k);
  if (!crossed) return false;
  if (config.wt.mode === "any") return true;
  const v = b[k];
  return num(v) && (side === 1 ? v <= config.wt.os : v >= config.wt.ob);
}

function conditionMet(
  id: ConditionId,
  side: 1 | -1,
  i: number,
  s: IndicatorSeries,
  config: IndicatorConfig
): boolean {
  const w = config.window;
  if (id === "macd") {
    const crossed = crossedWithin(
      (k) => (side === 1 ? crossedOver(s.macd, s.signal, k) : crossedUnder(s.macd, s.signal, k)),
      i,
      w
    );
    if (!crossed) return false;
    if (!config.macd.zeroFilter) return true;
    const m = s.macd[i];
    return num(m) && (side === 1 ? m < 0 : m > 0);
  }
  if (id === "rsi") {
    const r = s.rsi[i];
    if (!num(r)) return false;
    if (config.rsi.mode === "signal_cross") {
      return crossedWithin(
        (k) =>
          side === 1 ? crossedOver(s.rsi, s.rsiSignal, k) : crossedUnder(s.rsi, s.rsiSignal, k),
        i,
        w
      );
    }
    if (config.rsi.mode === "level_cross") {
      const level = side === 1 ? config.rsi.level : 100 - config.rsi.level;
      return crossedWithin(
        (k) => (side === 1 ? crossedOver(s.rsi, level, k) : crossedUnder(s.rsi, level, k)),
        i,
        w
      );
    }
    const lo = side === 1 ? config.rsi.zoneMin : 100 - config.rsi.zoneMax;
    const hi = side === 1 ? config.rsi.zoneMax : 100 - config.rsi.zoneMin;
    return r >= lo && r <= hi;
  }
  if (id === "adx") {
    const a = s.adx[i];
    if (!num(a) || a < config.adx.min) return false;
    if (!config.adx.rising) return true;
    const prev = s.adx[i - 1];
    return num(prev) && a > prev;
  }
  if (id === "wt") {
    return crossedWithin((k) => wtCross(s.wt1, s.wt2, side, k, config), i, w);
  }
  if (id === "wth") {
    if (config.wth.mode === "cross") {
      return crossedWithin((k) => wtCross(s.htfWt1, s.htfWt2, side, k, config), i, w);
    }
    const a = s.htfWt1[i];
    const b = s.htfWt2[i];
    return num(a) && num(b) && (side === 1 ? a > b : a < b);
  }
  if (id === "ema") {
    if (config.ema.mode === "above") {
      // 가격 비교는 emaPriceMet에서
      return num(s.emaFast[i]) && num(s.emaSlow[i]);
    }
    return crossedWithin(
      (k) =>
        side === 1
          ? crossedOver(s.emaFast, s.emaSlow, k)
          : crossedUnder(s.emaFast, s.emaSlow, k),
      i,
      w
    );
  }
  if (id === "bb") {
    // 가격이 필요해서 allConditionsMet → bbMet 에서 판정
    return num(s.bbMid[i]) && num(s.bbUpper[i]) && num(s.bbLower[i]);
  }
  if (id === "stoch") {
    if (config.stoch.mode === "cross") {
      return crossedWithin(
        (k) =>
          side === 1
            ? crossedOver(s.stochK, s.stochD, k)
            : crossedUnder(s.stochK, s.stochD, k),
        i,
        w
      );
    }
    return crossedWithin((k) => {
      const crossed =
        side === 1
          ? crossedOver(s.stochK, s.stochD, k)
          : crossedUnder(s.stochK, s.stochD, k);
      if (!crossed) return false;
      const v = s.stochK[k];
      return num(v) && (side === 1 ? v <= config.stoch.os : v >= config.stoch.ob);
    }, i, w);
  }
  if (id === "st") {
    const dir = s.stDir[i];
    if (!num(dir)) return false;
    // supertrend: dir -1 = 상승, 1 = 하락
    if (config.st.mode === "dir") return side === 1 ? dir < 0 : dir > 0;
    const prev = s.stDir[i - 1];
    if (!num(prev)) return false;
    return side === 1 ? prev > 0 && dir < 0 : prev < 0 && dir > 0;
  }
  const p = s.plus[i];
  const m = s.minus[i];
  if (!num(p) || !num(m)) return false;
  if (config.di.mode === "above") return side === 1 ? p > m : m > p;
  return crossedWithin(
    (k) => (side === 1 ? crossedOver(s.plus, s.minus, k) : crossedUnder(s.plus, s.minus, k)),
    i,
    w
  );
}

function bbMet(
  side: 1 | -1,
  i: number,
  bars: Bar[],
  s: IndicatorSeries,
  config: IndicatorConfig
): boolean {
  const up = s.bbUpper[i];
  const lo = s.bbLower[i];
  const mid = s.bbMid[i];
  if (!num(up) || !num(lo) || !num(mid)) return false;
  const c = bars[i].close;
  const l = bars[i].low;
  const h = bars[i].high;
  if (config.bb.mode === "bounce") {
    // 하단(상단)을 찍고 종가가 다시 밴드 안 · 가운데 쪽으로
    if (side === 1) return l <= lo && c > lo && c < mid;
    return h >= up && c < up && c > mid;
  }
  // breakout: 종가가 밴드 밖
  return side === 1 ? c > up : c < lo;
}

function emaPriceMet(
  side: 1 | -1,
  i: number,
  bars: Bar[],
  s: IndicatorSeries
): boolean {
  const f = s.emaFast[i];
  const sl = s.emaSlow[i];
  if (!num(f) || !num(sl)) return false;
  const c = bars[i].close;
  return side === 1 ? c > f && c > sl : c < f && c < sl;
}

export function enabledConditions(config: IndicatorConfig): ConditionId[] {
  const out: ConditionId[] = [];
  if (config.macd.on) out.push("macd");
  if (config.rsi.on) out.push("rsi");
  if (config.adx.on) out.push("adx");
  if (config.di.on) out.push("di");
  if (config.wt.on) out.push("wt");
  if (config.wth.on) out.push("wth");
  if (config.ema.on) out.push("ema");
  if (config.bb.on) out.push("bb");
  if (config.stoch.on) out.push("stoch");
  if (config.st.on) out.push("st");
  return out;
}

function finishPartial(
  trade: BacktestTrade,
  exit: number,
  time: number,
  reason: string,
  totalUsd: number,
  dist: number,
  money: Money,
  entry: number
) {
  trade.exit = exit;
  trade.exitTime = time;
  trade.exitReason = reason;
  trade.usd = totalUsd;
  const riskUsd = money.bet * money.lev * (dist / entry);
  trade.r = totalUsd / Math.max(riskUsd, 1e-8);
  trade.win = totalUsd > 0 ? true : totalUsd < 0 ? false : null;
}

function oppositeCross(
  s: IndicatorSeries,
  side: 1 | -1,
  j: number,
  exitOn: ExitSignal
): boolean {
  if (exitOn === "macd") {
    return side === 1 ? crossedUnder(s.macd, s.signal, j) : crossedOver(s.macd, s.signal, j);
  }
  if (exitOn === "wt") {
    return side === 1 ? crossedUnder(s.wt1, s.wt2, j) : crossedOver(s.wt1, s.wt2, j);
  }
  if (exitOn === "ema") {
    return side === 1
      ? crossedUnder(s.emaFast, s.emaSlow, j)
      : crossedOver(s.emaFast, s.emaSlow, j);
  }
  if (exitOn === "st") {
    const dir = s.stDir[j];
    const prev = s.stDir[j - 1];
    if (!num(dir) || !num(prev)) return false;
    return side === 1 ? prev < 0 && dir > 0 : prev > 0 && dir < 0;
  }
  return false;
}

function allConditionsMet(
  conditions: ConditionId[],
  side: 1 | -1,
  i: number,
  bars: Bar[],
  s: IndicatorSeries,
  config: IndicatorConfig
): boolean {
  return conditions.every((id) => {
    if (id === "bb") return bbMet(side, i, bars, s, config);
    if (id === "ema" && config.ema.mode === "above") return emaPriceMet(side, i, bars, s);
    return conditionMet(id, side, i, s, config);
  });
}

export function runIndicatorBacktest(
  bars: Bar[],
  s: IndicatorSeries,
  config: IndicatorConfig,
  conditions: ConditionId[],
  money: Money
): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  if (conditions.length === 0 || bars.length < 3) return trades;
  const sides: (1 | -1)[] =
    config.side === "long" ? [1] : config.side === "short" ? [-1] : [1, -1];
  const feeRate = money.feePct / 100;

  const closeTrade = (
    trade: BacktestTrade,
    exit: number,
    time: number,
    reason: string,
    risk: number,
    usdOverride?: number
  ) => {
    trade.exit = exit;
    trade.exitTime = time;
    trade.exitReason = reason;
    const gross = trade.side * (exit - trade.entry);
    trade.r = (gross - (trade.entry + exit) * feeRate) / risk;
    trade.usd =
      usdOverride != null ? usdOverride : dollarMove(trade.entry, exit, trade.side, money);
    trade.win = trade.usd > 0 ? true : trade.usd < 0 ? false : null;
  };

  let i = 1;
  while (i < bars.length - 1) {
    const side = sides.find((sd) =>
      allConditionsMet(conditions, sd, i, bars, s, config)
    );
    if (!side) {
      i += 1;
      continue;
    }
    const entryBar = bars[i + 1];
    const entry = entryBar.open;
    const a = s.atr[i];
    const dist =
      config.stop.mode === "atr"
        ? num(a)
          ? a * config.stop.atrMult
          : NaN
        : (entry * config.stop.pct) / 100;
    if (!(dist > 0)) {
      i += 1;
      continue;
    }
    let sl = entry - side * dist;
    const mode = config.target.mode;
    const tpR =
      mode === "r" || mode === "partial"
        ? entry + side * dist * Math.max(config.target.r, mode === "partial" ? 1 : 0)
        : mode === "atr" && num(a)
          ? entry + side * a * config.target.atrMult
          : NaN;
    const trade: BacktestTrade = {
      side,
      entryTime: entryBar.time,
      exitTime: null,
      entry,
      exit: null,
      sl,
      tp: Number.isFinite(tpR) ? tpR : 0,
      reason: conditions.join("+"),
      exitReason: "진행",
      r: null,
      usd: null,
      win: null,
    };

    let j = i + 1;
    let partialTaken = false;
    let partialUsd = 0;
    let trailDist = num(a) ? a * Math.max(0.1, config.target.trailAtr) : dist;

    for (; j < bars.length; j += 1) {
      const b = bars[j];
      const atrNow = s.atr[j];
      if ((mode === "trail" || (mode === "partial" && partialTaken)) && num(atrNow)) {
        trailDist = atrNow * Math.max(0.1, config.target.trailAtr);
        if (side === 1) sl = Math.max(sl, b.close - trailDist);
        else sl = Math.min(sl, b.close + trailDist);
        trade.sl = sl;
      }

      const hitStop = side === 1 ? b.low <= sl : b.high >= sl;
      const hitTarget =
        Number.isFinite(tpR) &&
        !partialTaken &&
        (mode === "r" || mode === "atr" || mode === "partial") &&
        (side === 1 ? b.high >= tpR : b.low <= tpR);

      if (hitStop) {
        const gapped = side === 1 ? b.open < sl : b.open > sl;
        const exit = gapped ? b.open : sl;
        if (partialTaken) {
          const rest = dollarMove(entry, exit, side, {
            ...money,
            bet: money.bet * 0.5,
          });
          finishPartial(trade, exit, b.time, "부분익절+추적손절", partialUsd + rest, dist, money, entry);
        } else {
          closeTrade(trade, exit, b.time, "손절", dist);
        }
        break;
      }

      if (hitTarget && mode === "partial") {
        partialTaken = true;
        partialUsd = dollarMove(entry, tpR, side, { ...money, bet: money.bet * 0.5 });
        // 본절로 손절 이동 후 추적
        sl = entry;
        trade.sl = sl;
        trade.tp = tpR;
        continue;
      }

      if (hitTarget && (mode === "r" || mode === "atr")) {
        closeTrade(trade, tpR, b.time, "익절", dist);
        break;
      }

      if (oppositeCross(s, side, j, config.exitOn)) {
        if (partialTaken) {
          const rest = dollarMove(entry, b.close, side, {
            ...money,
            bet: money.bet * 0.5,
          });
          finishPartial(trade, b.close, b.time, "부분익절+반대신호", partialUsd + rest, dist, money, entry);
        } else {
          closeTrade(trade, b.close, b.time, "반대신호", dist);
        }
        break;
      }

      if (config.maxBars > 0 && j - (i + 1) + 1 >= config.maxBars) {
        if (partialTaken) {
          const rest = dollarMove(entry, b.close, side, {
            ...money,
            bet: money.bet * 0.5,
          });
          finishPartial(trade, b.close, b.time, "부분익절+시간", partialUsd + rest, dist, money, entry);
        } else {
          closeTrade(trade, b.close, b.time, "시간", dist);
        }
        break;
      }
    }
    trades.push(trade);
    if (trade.exitTime == null) break;
    i = j;
  }
  return trades;
}

export interface BacktestStats {
  closed: number;
  open: number;
  wins: number;
  losses: number;
  winRate: number | null;
  sumR: number;
  avgR: number | null;
  sumUsd: number;
  profitFactor: number | null;
  maxDrawdown: number;
  avgWinUsd: number | null;
  avgLossUsd: number | null;
  worstStreak: number;
  longs: number;
  shorts: number;
}

export function summarize(trades: BacktestTrade[]): BacktestStats {
  const closed = trades.filter((t) => t.exitTime != null && t.usd != null);
  let wins = 0;
  let losses = 0;
  let gw = 0;
  let gl = 0;
  let sumR = 0;
  let sumUsd = 0;
  let peak = 0;
  let eq = 0;
  let dd = 0;
  let streak = 0;
  let worstStreak = 0;
  for (const t of closed) {
    const usd = t.usd!;
    sumR += t.r ?? 0;
    sumUsd += usd;
    if (usd > 0) {
      wins += 1;
      gw += usd;
      streak = 0;
    } else if (usd < 0) {
      losses += 1;
      gl -= usd;
      streak += 1;
      worstStreak = Math.max(worstStreak, streak);
    }
    eq += usd;
    peak = Math.max(peak, eq);
    dd = Math.min(dd, eq - peak);
  }
  const decided = wins + losses;
  return {
    closed: closed.length,
    open: trades.length - closed.length,
    wins,
    losses,
    winRate: decided ? (wins / decided) * 100 : null,
    sumR,
    avgR: closed.length ? sumR / closed.length : null,
    sumUsd,
    profitFactor: gl > 0 ? gw / gl : gw > 0 ? Infinity : null,
    maxDrawdown: dd,
    avgWinUsd: wins ? gw / wins : null,
    avgLossUsd: losses ? gl / losses : null,
    worstStreak,
    longs: closed.filter((t) => t.side === 1).length,
    shorts: closed.filter((t) => t.side === -1).length,
  };
}

export const CONDITION_LABELS: Record<ConditionId, string> = {
  macd: "MACD",
  rsi: "RSI",
  adx: "ADX",
  di: "DI",
  wt: "WT",
  wth: "상위 WT",
  ema: "EMA",
  bb: "볼밴",
  stoch: "스토캐",
  st: "슈퍼트렌드",
};

export const TARGET_LABELS: Record<TargetMode, string> = {
  r: "고정 R",
  atr: "ATR 익절",
  trail: "추적손절",
  partial: "1R 부분익절+추적",
  none: "익절 없음",
};

function allOff(c: IndicatorConfig): IndicatorConfig {
  return {
    ...c,
    macd: { ...c.macd, on: false },
    rsi: { ...c.rsi, on: false },
    adx: { ...c.adx, on: false },
    di: { ...c.di, on: false },
    wt: { ...c.wt, on: false },
    wth: { ...c.wth, on: false },
    ema: { ...c.ema, on: false },
    bb: { ...c.bb, on: false },
    stoch: { ...c.stoch, on: false },
    st: { ...c.st, on: false },
  };
}

export interface NamedStrategy {
  id: string;
  name: string;
  blurb: string;
  apply: (c: IndicatorConfig) => IndicatorConfig;
}

/** 차트 탭에서 한 번에 비교하는 전략 묶음 */
export const NAMED_STRATEGIES: NamedStrategy[] = [
  {
    id: "macd-rsi-adx",
    name: "MACD·RSI + ADX·DI",
    blurb: "골든크로스 + 추세 필터. 익절 2R, MACD 반대로 청산",
    apply: (c) => {
      const o = allOff(c);
      return {
        ...o,
        side: "long",
        macd: { ...o.macd, on: true },
        rsi: { ...o.rsi, on: true, mode: "signal_cross" },
        adx: { ...o.adx, on: true, min: 20 },
        di: { ...o.di, on: true, mode: "above" },
        target: { ...o.target, mode: "r", r: 2 },
        exitOn: "macd",
      };
    },
  },
  {
    id: "macd-trail",
    name: "MACD 크로스 · 추적손절",
    blurb: "MACD만. 익절 없이 ATR 1.5배로 추적",
    apply: (c) => {
      const o = allOff(c);
      return {
        ...o,
        side: "both",
        macd: { ...o.macd, on: true },
        target: { ...o.target, mode: "trail", trailAtr: 1.5 },
        exitOn: "macd",
      };
    },
  },
  {
    id: "macd-partial",
    name: "MACD · 1R 부분익절",
    blurb: "1R에서 절반 익절 → 본절 → ATR 추적으로 나머지",
    apply: (c) => {
      const o = allOff(c);
      return {
        ...o,
        side: "long",
        macd: { ...o.macd, on: true },
        adx: { ...o.adx, on: true, min: 18 },
        target: { ...o.target, mode: "partial", r: 1, trailAtr: 1.2 },
        exitOn: "macd",
      };
    },
  },
  {
    id: "wt-mean",
    name: "WT 과매도 역추세",
    blurb: "과매도 크로스 롱. 익절 1.5R, WT 반대로 청산",
    apply: (c) => {
      const o = allOff(c);
      return {
        ...o,
        side: "long",
        wt: { ...o.wt, on: true, mode: "extreme" },
        target: { ...o.target, mode: "r", r: 1.5 },
        exitOn: "wt",
      };
    },
  },
  {
    id: "wt-partial",
    name: "WT · 부분익절+추적",
    blurb: "과매도 WT. 1R 부분익절 후 추적",
    apply: (c) => {
      const o = allOff(c);
      return {
        ...o,
        side: "long",
        wt: { ...o.wt, on: true, mode: "extreme" },
        target: { ...o.target, mode: "partial", r: 1, trailAtr: 1.5 },
        exitOn: "wt",
      };
    },
  },
  {
    id: "ema-cross",
    name: "EMA 9/21 골든크로스",
    blurb: "이평 크로스. ATR 2배 익절 또는 EMA 반대로 청산",
    apply: (c) => {
      const o = allOff(c);
      return {
        ...o,
        side: "both",
        ema: { ...o.ema, on: true, mode: "cross" },
        target: { ...o.target, mode: "atr", atrMult: 2 },
        exitOn: "ema",
      };
    },
  },
  {
    id: "ema-adx",
    name: "EMA 크로스 + ADX",
    blurb: "이평 크로스에 추세 세기 필터. 추적손절",
    apply: (c) => {
      const o = allOff(c);
      return {
        ...o,
        side: "long",
        ema: { ...o.ema, on: true, mode: "cross" },
        adx: { ...o.adx, on: true, min: 25, rising: true },
        target: { ...o.target, mode: "trail", trailAtr: 2 },
        exitOn: "ema",
      };
    },
  },
  {
    id: "bb-bounce",
    name: "볼밴 하단 반등",
    blurb: "하단 찍고 안으로 들어온 롱. 익절 2R",
    apply: (c) => {
      const o = allOff(c);
      return {
        ...o,
        side: "long",
        bb: { ...o.bb, on: true, mode: "bounce" },
        rsi: { ...o.rsi, on: true, mode: "zone", zoneMin: 20, zoneMax: 45 },
        target: { ...o.target, mode: "r", r: 2 },
        exitOn: "none",
        maxBars: 48,
      };
    },
  },
  {
    id: "bb-break",
    name: "볼밴 돌파 + 슈퍼트렌드",
    blurb: "상단 돌파 롱. 슈퍼트렌드 방향으로만. 추적손절",
    apply: (c) => {
      const o = allOff(c);
      return {
        ...o,
        side: "long",
        bb: { ...o.bb, on: true, mode: "break" },
        st: { ...o.st, on: true, mode: "dir" },
        target: { ...o.target, mode: "trail", trailAtr: 1.5 },
        exitOn: "st",
      };
    },
  },
  {
    id: "stoch-os",
    name: "스토캐 과매도 크로스",
    blurb: "20 아래에서 %K/%D 골든크로스. 익절 1.5R",
    apply: (c) => {
      const o = allOff(c);
      return {
        ...o,
        side: "long",
        stoch: { ...o.stoch, on: true, mode: "zone_cross" },
        target: { ...o.target, mode: "r", r: 1.5 },
        exitOn: "none",
        maxBars: 36,
      };
    },
  },
  {
    id: "st-flip",
    name: "슈퍼트렌드 전환",
    blurb: "방향이 바뀌면 진입·청산. ATR 3배 익절",
    apply: (c) => {
      const o = allOff(c);
      return {
        ...o,
        side: "both",
        st: { ...o.st, on: true, mode: "flip" },
        target: { ...o.target, mode: "atr", atrMult: 3 },
        exitOn: "st",
      };
    },
  },
  {
    id: "stoch-macd",
    name: "스토캐 + MACD",
    blurb: "과매도 스토캐와 MACD 골든크로스. 부분익절",
    apply: (c) => {
      const o = allOff(c);
      return {
        ...o,
        side: "long",
        stoch: { ...o.stoch, on: true, mode: "zone_cross" },
        macd: { ...o.macd, on: true },
        target: { ...o.target, mode: "partial", r: 1, trailAtr: 1.5 },
        exitOn: "macd",
      };
    },
  },
];

/** 켜진 조건만으로 조합 비교. 조건이 많으면 상위 5개만 */
export function compareCombos(
  bars: Bar[],
  s: IndicatorSeries,
  config: IndicatorConfig,
  money: Money,
  withHigher: boolean
): { conditions: ConditionId[]; stats: BacktestStats }[] {
  let ids = enabledConditions(config);
  if (!withHigher) ids = ids.filter((id) => id !== "wth");
  if (ids.length === 0) {
    ids = ["macd", "rsi", "adx", "di", "wt"];
  }
  if (ids.length > 5) ids = ids.slice(0, 5);
  const out: { conditions: ConditionId[]; stats: BacktestStats }[] = [];
  for (let mask = 1; mask < 1 << ids.length; mask += 1) {
    const conditions = ids.filter((_, k) => mask & (1 << k));
    if (conditions.length === 1 && conditions[0] === "adx") continue;
    const trades = runIndicatorBacktest(bars, s, config, conditions, money);
    out.push({ conditions, stats: summarize(trades) });
  }
  return out;
}

/** 이름 있는 전략들을 같은 봉·자금으로 한꺼번에 비교 */
export function compareStrategies(
  bars: Bar[],
  base: IndicatorConfig,
  money: Money,
  higher?: HigherTf | null
): { strategy: NamedStrategy; stats: BacktestStats; config: IndicatorConfig }[] {
  return NAMED_STRATEGIES.map((strategy) => {
    const config = strategy.apply(base);
    const series = computeSeries(bars, config, higher);
    const trades = runIndicatorBacktest(
      bars,
      series,
      config,
      enabledConditions(config),
      money
    );
    return { strategy, stats: summarize(trades), config };
  }).sort(
    (a, b) =>
      Number(b.stats.closed > 0) - Number(a.stats.closed > 0) || b.stats.sumR - a.stats.sumR
  );
}
