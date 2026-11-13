import {
  atr,
  crossedOver,
  crossedUnder,
  dmi,
  ema,
  emaNullable,
  num,
  rsi,
  smaNullable,
} from "./indicators";
import { dollarMove, type BacktestTrade, type Bar, type Money } from "./types";

export type SideMode = "long" | "short" | "both";
export type RsiMode = "signal_cross" | "level_cross" | "zone";
export type DiMode = "above" | "cross";
export type WtMode = "extreme" | "any";
export type WtHtfMode = "state" | "cross";
export type ExitSignal = "none" | "macd" | "wt";
export type ConditionId = "macd" | "rsi" | "adx" | "di" | "wt" | "wth";

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
  /** WaveTrend [LazyBear]. 과매도·과매수는 Level 2(±53) 기준 */
  wt: { on: boolean; n1: number; n2: number; ob: number; os: number; mode: WtMode };
  /** 상위 봉 WaveTrend. 길이·레벨은 wt 설정을 같이 쓴다 */
  wth: { on: boolean; tf: string; mode: WtHtfMode };
  /** 크로스는 이 봉 수 안에 났으면 조건을 채운 것으로 본다 */
  window: number;
  stop: { mode: "atr" | "pct"; atrMult: number; pct: number };
  /** 0 이면 익절 없이 반대 신호·시간으로만 나간다 */
  targetR: number;
  exitOn: ExitSignal;
  /** 0 이면 제한 없음 */
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
  window: 3,
  stop: { mode: "atr", atrMult: 1.5, pct: 1 },
  targetR: 2,
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
  /** 차트 봉에 맞춘 상위 봉 WT. 상위 봉이 없으면 전부 null */
  htfWt1: (number | null)[];
  htfWt2: (number | null)[];
}

/** 상위 봉 데이터와 봉 길이(초) */
export interface HigherTf {
  bars: Bar[];
  sec: number;
  chartSec: number;
}

/** WT_CROSS_LB: ap=hlc3, esa=ema(ap,n1), d=ema(|ap-esa|,n1), ci=(ap-esa)/(0.015d), wt1=ema(ci,n2), wt2=sma(wt1,4) */
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

/** 차트 봉 i가 닫힐 때 이미 닫혀 있던 마지막 상위 봉 값을 쓴다 (미래 값을 미리 보지 않음) */
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
  };
}

function crossedWithin(
  test: (i: number) => boolean,
  i: number,
  window: number
): boolean {
  for (let k = i; k > i - Math.max(1, window) && k >= 1; k -= 1) {
    if (test(k)) return true;
  }
  return false;
}

/** WT 크로스. extreme 이면 크로스가 난 봉의 wt2가 과매도(롱)·과매수(숏) 구간이어야 한다 */
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

/** 조건 하나가 봉 i 종가에서 그 방향으로 맞는지 */
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

export function enabledConditions(config: IndicatorConfig): ConditionId[] {
  const out: ConditionId[] = [];
  if (config.macd.on) out.push("macd");
  if (config.rsi.on) out.push("rsi");
  if (config.adx.on) out.push("adx");
  if (config.di.on) out.push("di");
  if (config.wt.on) out.push("wt");
  if (config.wth.on) out.push("wth");
  return out;
}

function oppositeCross(s: IndicatorSeries, side: 1 | -1, j: number, exitOn: ExitSignal): boolean {
  if (exitOn === "macd") {
    return side === 1 ? crossedUnder(s.macd, s.signal, j) : crossedOver(s.macd, s.signal, j);
  }
  if (exitOn === "wt") {
    return side === 1 ? crossedUnder(s.wt1, s.wt2, j) : crossedOver(s.wt1, s.wt2, j);
  }
  return false;
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

  const close = (trade: BacktestTrade, exit: number, time: number, reason: string, risk: number) => {
    trade.exit = exit;
    trade.exitTime = time;
    trade.exitReason = reason;
    const gross = trade.side * (exit - trade.entry);
    trade.r = (gross - (trade.entry + exit) * feeRate) / risk;
    trade.usd = dollarMove(trade.entry, exit, trade.side, money);
    trade.win = trade.usd > 0 ? true : trade.usd < 0 ? false : null;
  };

  let i = 1;
  while (i < bars.length - 1) {
    const side = sides.find((sd) => conditions.every((id) => conditionMet(id, sd, i, s, config)));
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
    const sl = entry - side * dist;
    const tp = config.targetR > 0 ? entry + side * dist * config.targetR : NaN;
    const trade: BacktestTrade = {
      side,
      entryTime: entryBar.time,
      exitTime: null,
      entry,
      exit: null,
      sl,
      tp: Number.isFinite(tp) ? tp : 0,
      reason: conditions.join("+"),
      exitReason: "진행",
      r: null,
      usd: null,
      win: null,
    };

    let j = i + 1;
    for (; j < bars.length; j += 1) {
      const b = bars[j];
      const hitStop = side === 1 ? b.low <= sl : b.high >= sl;
      const hitTarget = Number.isFinite(tp) && (side === 1 ? b.high >= tp : b.low <= tp);
      if (hitStop) {
        // 갭으로 손절가를 넘겨 시작하면 시가에 나간다
        const gapped = side === 1 ? b.open < sl : b.open > sl;
        close(trade, gapped ? b.open : sl, b.time, "손절", dist);
        break;
      }
      if (hitTarget) {
        close(trade, tp, b.time, "익절", dist);
        break;
      }
      if (oppositeCross(s, side, j, config.exitOn)) {
        close(trade, b.close, b.time, "반대신호", dist);
        break;
      }
      if (config.maxBars > 0 && j - (i + 1) + 1 >= config.maxBars) {
        close(trade, b.close, b.time, "시간", dist);
        break;
      }
    }
    trades.push(trade);
    if (trade.exitTime == null) break;
    // 청산한 봉의 종가에서 다음 신호를 다시 본다
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
};

/** 조건 조합을 같은 설정으로 돌려 어떤 필터가 도움이 되는지 본다. 상위 WT는 데이터가 있을 때만 */
export function compareCombos(
  bars: Bar[],
  s: IndicatorSeries,
  config: IndicatorConfig,
  money: Money,
  withHigher: boolean
): { conditions: ConditionId[]; stats: BacktestStats }[] {
  const ids: ConditionId[] = ["macd", "rsi", "adx", "di", "wt"];
  if (withHigher) ids.push("wth");
  const out: { conditions: ConditionId[]; stats: BacktestStats }[] = [];
  for (let mask = 1; mask < 1 << ids.length; mask += 1) {
    const conditions = ids.filter((_, k) => mask & (1 << k));
    // ADX만으로는 방향이 없어서 진입 신호가 되지 않는다
    if (conditions.length === 1 && conditions[0] === "adx") continue;
    const trades = runIndicatorBacktest(bars, s, config, conditions, money);
    out.push({ conditions, stats: summarize(trades) });
  }
  return out;
}
