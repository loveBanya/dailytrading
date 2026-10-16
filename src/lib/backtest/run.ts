import {
  atr,
  crossedOver,
  crossedUnder,
  dmi,
  ema,
  highest,
  hma,
  lowest,
  num,
  emaNullable,
  rsi,
  sessionVwap,
  sma,
  smaNullable,
  stochRsi,
  supertrend,
} from "./indicators";
import {
  dollarMove,
  type BacktestOutput,
  type BacktestTrade,
  type Bar,
  type Money,
  type Overlay,
} from "./types";

export interface StrategyMeta {
  id: string;
  name: string;
  blurb: string;
  interval: string;
}

export const STRATEGIES: StrategyMeta[] = [
  {
    id: "apex",
    name: "HWR Apex",
    interval: "15",
    blurb:
      "4시간·1시간 추세가 같을 때 15분에서 21이평이나 VWAP 눌림. TP1에서 55%를 줄이고 손절을 본절로 옮긴 뒤 나머지는 TP2.",
  },
  {
    id: "vwap",
    name: "HWR VWAP",
    interval: "15",
    blurb:
      "VWAP을 꼬리로 찍고 종가가 선을 지키면 진입. 9·21 이평 방향이 같을 때만. 익절은 TP1 전량이고, 같은 봉에 손절도 닿으면 종가 위치로 판정.",
  },
  {
    id: "ha",
    name: "HWR HA",
    interval: "15",
    blurb:
      "200 EMA 방향만. 하이킨 몸통이 커지고 스토캐스틱 RSI가 교차한 뒤 3봉 안. 익절 3%, 손절 1.5%.",
  },
  {
    id: "af",
    name: "HWR AF",
    interval: "15",
    blurb:
      "평균 힘이 0을 넘고 종가가 200 EMA와 같은 방향일 때. 손절·익절은 그 봉의 ATR 밴드.",
  },
  {
    id: "macd",
    name: "HWR MACD",
    interval: "60",
    blurb:
      "0선 위 골든크로스, 0선 아래 데드크로스, 또는 그 상태로 0선 돌파. 손절은 ATR 1.5. 반대 신호가 나오면 그 종가로 바꾸고 반대로 진입.",
  },
  {
    id: "hma",
    name: "HWR HMA",
    interval: "15",
    blurb:
      "HMA가 방향을 틀고 ADX가 25 이상. 손절은 밴드 끝, 익절은 2R. 밴드 색이 바뀌면 종가로 청산.",
  },
  {
    id: "ursi",
    name: "HWR URSI",
    interval: "60",
    blurb:
      "RSI 다이버전스가 확정된 봉의 종가에 진입. 원본은 알림만 있어서 손절 ATR 1.5, 익절 2R로 가정.",
  },
];

export function extraIntervals(id: string, interval: string): string[] {
  if (id !== "apex") return [];
  const out: string[] = [];
  if (interval !== "60") out.push("60");
  if (interval !== "240") out.push("240");
  return out;
}

export function intervalMinutes(interval: string): number {
  if (interval === "D") return 1440;
  if (interval === "W") return 10080;
  const n = Number(interval);
  return Number.isFinite(n) && n > 0 ? n : 15;
}

export function htfBars(chartInterval: string, chartBars: number, htf: string): number {
  const chartMin = intervalMinutes(chartInterval);
  const htfMin = intervalMinutes(htf);
  return Math.min(8000, Math.ceil((chartBars * chartMin) / htfMin) + 320);
}

interface RunInput {
  id: string;
  interval: string;
  chart: Bar[];
  extra: Record<string, Bar[]>;
  scalp: boolean;
  money: Money;
}

export function runBacktest(input: RunInput): BacktestOutput {
  switch (input.id) {
    case "vwap":
      return runVwap(input.chart, input.money);
    case "ha":
      return runHa(input.chart, input.money);
    case "af":
      return runAf(input.chart, input.money);
    case "macd":
      return runMacd(input.chart, input.money);
    case "hma":
      return runHma(input.chart, input.money);
    case "ursi":
      return runUrsi(input.chart, input.money);
    default:
      return runApex(input);
  }
}

function cols(bars: Bar[]) {
  return {
    time: bars.map((b) => b.time),
    open: bars.map((b) => b.open),
    high: bars.map((b) => b.high),
    low: bars.map((b) => b.low),
    close: bars.map((b) => b.close),
    volume: bars.map((b) => b.volume),
  };
}

function feeOnly(money: Money): number {
  return money.bet * money.lev * (money.feePct / 100) * 2;
}

function runVwap(bars: Bar[], money: Money): BacktestOutput {
  const c = cols(bars);
  const emaF = ema(c.close, 9);
  const emaS = ema(c.close, 21);
  const vwap = sessionVwap(c.high, c.low, c.close, c.volume, c.time);
  const atrV = atr(c.high, c.low, c.close, 14);
  const trades: BacktestTrade[] = [];
  let lastSig = -1_000;
  let live: {
    side: 1 | -1;
    i: number;
    entry: number;
    sl: number;
    tp: number;
  } | null = null;

  for (let i = 1; i < bars.length; i += 1) {
    const wasLive = live != null;
    if (live && i > live.i) {
      const hitSl = live.side === 1 ? c.low[i] <= live.sl : c.high[i] >= live.sl;
      const hitTp = live.side === 1 ? c.high[i] >= live.tp : c.low[i] <= live.tp;
      if (hitSl || hitTp) {
        const win =
          hitSl && hitTp
            ? live.side === 1
              ? c.close[i] >= live.entry
              : c.close[i] <= live.entry
            : hitTp;
        const exit = win ? live.tp : live.sl;
        trades.push({
          side: live.side,
          entryTime: bars[live.i].time,
          exitTime: bars[i].time,
          entry: live.entry,
          exit,
          sl: live.sl,
          tp: live.tp,
          reason: live.side === 1 ? "지지 롱" : "저항 숏",
          exitReason: win ? "TP1" : "SL",
          r: win ? 1 : -1,
          usd: dollarMove(live.entry, exit, live.side, money),
          win,
        });
        live = null;
      }
    }
    if (
      !wasLive &&
      num(emaF[i]) &&
      num(emaS[i]) &&
      num(vwap[i]) &&
      num(vwap[i - 1]) &&
      num(atrV[i])
    ) {
      const band = Math.max(atrV[i]! * 0.25, 0);
      const holdSup =
        c.low[i] <= vwap[i]! + band &&
        c.low[i] >= vwap[i]! - band &&
        c.close[i] > vwap[i]! &&
        c.close[i - 1] >= vwap[i - 1]!;
      const holdRes =
        c.high[i] >= vwap[i]! - band &&
        c.high[i] <= vwap[i]! + band &&
        c.close[i] < vwap[i]! &&
        c.close[i - 1] <= vwap[i - 1]!;
      const longRaw =
        holdSup && c.close[i] > c.open[i] && emaF[i]! > emaS[i]!;
      const shortRaw =
        holdRes && c.close[i] < c.open[i] && emaF[i]! < emaS[i]!;
      const cooled = i - lastSig >= 6;
      const side: 1 | -1 | 0 =
        longRaw && !shortRaw && cooled ? 1 : shortRaw && !longRaw && cooled ? -1 : 0;
      if (side !== 0) {
        const px = c.close[i];
        const raw =
          side === 1
            ? Math.min(c.low[i], vwap[i]!) - atrV[i]! * 0.1
            : Math.max(c.high[i], vwap[i]!) + atrV[i]! * 0.1;
        const dist = Math.abs(px - raw);
        const adj = Math.max(atrV[i]! * 0.8, Math.min(atrV[i]! * 1.8, dist));
        const sl = side === 1 ? px - adj : px + adj;
        const risk = Math.max(Math.abs(px - sl), 1e-8);
        const tp = side === 1 ? px + risk : px - risk;
        live = { side, i, entry: px, sl, tp };
        lastSig = i;
      }
    }
  }
  if (live) trades.push(openTrade(bars, live, live.side === 1 ? "지지 롱" : "저항 숏"));
  return {
    trades,
    overlays: [
      { name: "EMA 9", color: "#26a69a", values: emaF },
      { name: "EMA 21", color: "#f0c14a", values: emaS },
      { name: "VWAP", color: "#4da3ff", values: vwap },
    ],
    note: "VWAP은 한국시간 자정에 다시 시작합니다.",
  };
}

function runHa(bars: Bar[], money: Money): BacktestOutput {
  const c = cols(bars);
  const ema200 = ema(c.close, 200);
  const haC = c.open.map(
    (open, i) => (open + c.high[i] + c.low[i] + c.close[i]) / 4
  );
  const haO: number[] = new Array(bars.length).fill(0);
  const haBull: boolean[] = new Array(bars.length).fill(false);
  const haBear: boolean[] = new Array(bars.length).fill(false);
  for (let i = 0; i < bars.length; i += 1) {
    haO[i] =
      i === 0 ? (c.open[i] + c.close[i]) / 2 : (haO[i - 1] + haC[i - 1]) / 2;
    const body = Math.abs(haC[i] - haO[i]);
    const prev = i === 0 ? 0 : Math.abs(haC[i - 1] - haO[i - 1]);
    const lowWick = Math.min(haO[i], haC[i]) - Math.min(c.low[i], Math.min(haO[i], haC[i]));
    const upWick = Math.max(c.high[i], Math.max(haO[i], haC[i])) - Math.max(haO[i], haC[i]);
    const tol = Math.max(body * 0.02, 0);
    haBull[i] = haC[i] > haO[i] && body > prev && lowWick <= tol;
    haBear[i] = haC[i] < haO[i] && body > prev && upWick <= tol;
  }
  const rsiV = rsi(haC, 14);
  const stoch = stochRsi(rsiV, 14);
  const k = smaNullable(stoch, 3);
  const d = smaNullable(k, 3);
  const trades: BacktestTrade[] = [];
  let lastUp = -1;
  let lastDn = -1;
  let lastSig = -1_000;
  let live: {
    side: 1 | -1;
    i: number;
    entry: number;
    sl: number;
    tp: number;
  } | null = null;

  for (let i = 1; i < bars.length; i += 1) {
    const wasLive = live != null;
    if (crossedOver(k, d, i)) lastUp = i;
    if (crossedUnder(k, d, i)) lastDn = i;
    if (live && i > live.i) {
      const hitSl = live.side === 1 ? c.low[i] <= live.sl : c.high[i] >= live.sl;
      const hitTp = live.side === 1 ? c.high[i] >= live.tp : c.low[i] <= live.tp;
      if (hitSl || hitTp) {
        const win = hitTp && !hitSl;
        const exit = win ? live.tp : live.sl;
        trades.push({
          side: live.side,
          entryTime: bars[live.i].time,
          exitTime: bars[i].time,
          entry: live.entry,
          exit,
          sl: live.sl,
          tp: live.tp,
          reason: live.side === 1 ? "하이킨 양봉" : "하이킨 음봉",
          exitReason: win ? "TP 3%" : "SL 1.5%",
          r: win ? 2 : -1,
          usd: dollarMove(live.entry, exit, live.side, money),
          win,
        });
        live = null;
      }
    }
    if (!wasLive && num(ema200[i]) && num(k[i]) && num(d[i]) && i - lastSig >= 4) {
      const longSide = c.close[i] > ema200[i]!;
      const shortSide = c.close[i] < ema200[i]!;
      const stochLong = lastUp >= 0 && i - lastUp <= 3;
      const stochShort = lastDn >= 0 && i - lastDn <= 3;
      const longSig = longSide && stochLong && haBull[i] && !(stochShort && haBear[i]);
      const shortSig = shortSide && stochShort && haBear[i] && !(stochLong && haBull[i]);
      const side: 1 | -1 | 0 = longSig ? 1 : shortSig ? -1 : 0;
      if (side !== 0) {
        const px = c.close[i];
        const sl = side === 1 ? px * 0.985 : px * 1.015;
        const tp = side === 1 ? px * 1.03 : px * 0.97;
        live = { side, i, entry: px, sl, tp };
        lastSig = i;
      }
    }
  }
  if (live) trades.push(openTrade(bars, live, live.side === 1 ? "하이킨 양봉" : "하이킨 음봉"));
  return {
    trades,
    overlays: [{ name: "EMA 200", color: "#f0c14a", values: ema200 }],
    note: "차트는 일반봉이고, 신호만 하이킨아시로 계산합니다.",
  };
}

function runAf(bars: Bar[], money: Money): BacktestOutput {
  const c = cols(bars);
  const hh = highest(c.high, 30);
  const ll = lowest(c.low, 30);
  const raw = c.close.map((close, i) => {
    if (!num(hh[i]) || !num(ll[i])) return 0;
    const span = hh[i]! - ll[i]!;
    return span === 0 ? 0 : (close - ll[i]!) / span - 0.5;
  });
  const af = sma(raw, 18);
  for (let i = 0; i < af.length; i += 1) {
    if (!num(hh[i]) || !num(ll[i])) af[i] = null;
  }
  const ema200 = ema(c.close, 200);
  const atrV = atr(c.high, c.low, c.close, 14);
  const trades: BacktestTrade[] = [];
  let lastSig = -1_000;
  let live: {
    side: 1 | -1;
    i: number;
    entry: number;
    sl: number;
    tp: number;
  } | null = null;

  for (let i = 1; i < bars.length; i += 1) {
    const wasLive = live != null;
    if (live && i > live.i) {
      const hitSl = live.side === 1 ? c.low[i] <= live.sl : c.high[i] >= live.sl;
      const hitTp = live.side === 1 ? c.high[i] >= live.tp : c.low[i] <= live.tp;
      if (hitTp && !hitSl) {
        const r = Math.abs(live.tp - live.entry) / Math.max(Math.abs(live.entry - live.sl), 1e-8);
        trades.push(closeAt(bars, live, i, live.tp, "익절", r, true, "0선 돌파", money));
        live = null;
      } else if (hitSl) {
        trades.push(closeAt(bars, live, i, live.sl, "손절", -1, false, "0선 돌파", money));
        live = null;
      }
    }
    if (!wasLive && num(af[i]) && num(af[i - 1]) && num(ema200[i]) && num(atrV[i]) && atrV[i]! > 0) {
      const up = af[i]! > 0 && af[i - 1]! <= 0;
      const dn = af[i]! < 0 && af[i - 1]! >= 0;
      const cooled = i - lastSig >= 2;
      const px = c.close[i];
      const slLong = px - atrV[i]!;
      const tpLong = px + atrV[i]!;
      if (up && px > ema200[i]! && cooled && tpLong > px && slLong < px) {
        live = { side: 1, i, entry: px, sl: slLong, tp: tpLong };
        lastSig = i;
      } else if (dn && px < ema200[i]! && cooled) {
        live = { side: -1, i, entry: px, sl: tpLong, tp: slLong };
        lastSig = i;
      }
    }
  }
  if (live) trades.push(openTrade(bars, live, "0선 돌파"));
  return {
    trades,
    overlays: [{ name: "EMA 200", color: "#f0c14a", values: ema200 }],
    note: "평균 힘 30봉, 스무딩 18. 손익은 진입 봉 ATR 한 배입니다.",
  };
}

function runMacd(bars: Bar[], money: Money): BacktestOutput {
  const c = cols(bars);
  const fast = ema(c.close, 12);
  const slow = ema(c.close, 26);
  const macd = c.close.map((_, i) =>
    num(fast[i]) && num(slow[i]) ? fast[i]! - slow[i]! : null
  );
  const sig = emaNullable(macd, 9);
  const atrV = atr(c.high, c.low, c.close, 14);
  const trades: BacktestTrade[] = [];
  let live: {
    side: 1 | -1;
    i: number;
    entry: number;
    sl: number;
    tp: number;
    risk: number;
  } | null = null;

  for (let i = 1; i < bars.length; i += 1) {
    const longSig =
      num(macd[i]) &&
      num(sig[i]) &&
      num(macd[i - 1]) &&
      num(sig[i - 1]) &&
      ((crossedOver(macd, sig, i) && macd[i]! > 0) ||
        (crossedOver(macd, 0, i) && macd[i]! > sig[i]!));
    const shortSig =
      num(macd[i]) &&
      num(sig[i]) &&
      num(macd[i - 1]) &&
      num(sig[i - 1]) &&
      ((crossedUnder(macd, sig, i) && macd[i]! < 0) ||
        (crossedUnder(macd, 0, i) && macd[i]! < sig[i]!));
    let stopped = false;
    if (live && i > live.i) {
      const hitSl = live.side === 1 ? c.low[i] <= live.sl : c.high[i] >= live.sl;
      const flip = live.side === 1 ? shortSig : longSig;
      if (hitSl) {
        trades.push(closeAt(bars, live, i, live.sl, "손절", -1, false, "MACD", money));
        live = null;
        stopped = true;
      } else if (flip) {
        const move = live.side === 1 ? c.close[i] - live.entry : live.entry - c.close[i];
        const r = move / Math.max(live.risk, 1e-8);
        trades.push(
          closeAt(bars, live, i, c.close[i], "반대 신호", r, r > 0, "MACD", money)
        );
        live = null;
      }
    }
    if (!live && !stopped && num(atrV[i]) && atrV[i]! > 0 && (longSig || shortSig) && !(longSig && shortSig)) {
      const side: 1 | -1 = longSig ? 1 : -1;
      const risk = atrV[i]! * 1.5;
      const px = c.close[i];
      live = {
        side,
        i,
        entry: px,
        sl: side === 1 ? px - risk : px + risk,
        tp: side === 1 ? px + risk * 2 : px - risk * 2,
        risk,
      };
    }
  }
  if (live) trades.push(openTrade(bars, live, "MACD"));
  return {
    trades,
    overlays: [],
    note: "ADX·촙·상위 봉 필터는 원본 기본이 꺼져 있어 여기서도 끄고 계산합니다. 익절 가격은 표시용이고 청산은 손절 또는 반대 신호입니다.",
  };
}

function runHma(bars: Bar[], money: Money): BacktestOutput {
  const c = cols(bars);
  const mid = hma(c.close, 60);
  const hi = hma(c.high, 60);
  const lo = hma(c.low, 60);
  const atrV = atr(c.high, c.low, c.close, 14);
  const di = dmi(c.high, c.low, c.close, 14, 14);
  const trades: BacktestTrade[] = [];
  const bandHi: (number | null)[] = new Array(bars.length).fill(null);
  const bandLo: (number | null)[] = new Array(bars.length).fill(null);
  let bandMult = 1;
  let lastSig = -1_000;
  let live: {
    side: 1 | -1;
    i: number;
    entry: number;
    sl: number;
    tp: number;
    risk: number;
    tpSeen: boolean;
  } | null = null;

  for (let i = 1; i < bars.length; i += 1) {
    if (!num(mid[i]) || !num(mid[i - 1]) || !num(hi[i]) || !num(lo[i]) || !num(atrV[i]) || !num(di.adx[i])) {
      continue;
    }
    const rising = mid[i]! > mid[i - 1]!;
    const prevRising = i > 1 && num(mid[i - 2]) ? mid[i - 1]! > mid[i - 2]! : rising;
    const turnUp = rising && !prevRising;
    const turnDn = !rising && prevRising;
    const strAdx = Math.min(di.adx[i]! / 40, 1);
    const strSlope = Math.min(
      Math.abs(mid[i]! - mid[i - 1]!) / Math.max(atrV[i]! * 0.06, 1e-8),
      1
    );
    const target = 0.28 + (1 - 0.28) * (strAdx * 0.75 + strSlope * 0.25);
    bandMult = (2 / 9) * target + (1 - 2 / 9) * bandMult;
    bandHi[i] = mid[i]! + (hi[i]! - mid[i]!) * bandMult;
    bandLo[i] = mid[i]! - (mid[i]! - lo[i]!) * bandMult;
    const slLong = bandLo[i]! - atrV[i]! * 0.05;
    const slShort = bandHi[i]! + atrV[i]! * 0.05;
    const adxOk = di.adx[i]! >= 25;
    const cooled = i - lastSig >= 4;
    const longSig =
      cooled && adxOk && turnUp && slLong < c.close[i] && c.close[i] > mid[i]!;
    const shortSig =
      cooled && adxOk && turnDn && slShort > c.close[i] && c.close[i] < mid[i]!;

    if (live && i - live.i >= 1) {
      const hitTp = live.side === 1 ? c.high[i] >= live.tp : c.low[i] <= live.tp;
      if (hitTp) live.tpSeen = true;
      const hitSl = live.side === 1 ? c.low[i] <= live.sl : c.high[i] >= live.sl;
      const colorDie = (live.side === 1 && turnDn) || (live.side === -1 && turnUp);
      if (live.tpSeen || hitSl || colorDie) {
        const exit = hitSl ? live.sl : live.tpSeen ? live.tp : c.close[i];
        const pnl = live.side === 1 ? exit - live.entry : live.entry - exit;
        const r = pnl / Math.max(live.risk, 1e-8);
        const win = live.tpSeen && !hitSl ? true : hitSl && !live.tpSeen ? false : r > 0.08 ? true : r < -0.08 ? false : null;
        const why = live.tpSeen && !hitSl ? "TP 2R" : hitSl ? "SL" : "색전환";
        trades.push({
          side: live.side,
          entryTime: bars[live.i].time,
          exitTime: bars[i].time,
          entry: live.entry,
          exit,
          sl: live.sl,
          tp: live.tp,
          reason: "HMA 색전환",
          exitReason: why,
          r,
          usd: dollarMove(live.entry, exit, live.side, money),
          win,
        });
        live = null;
      }
    }
    if (!live) {
      const side: 1 | -1 | 0 = longSig && !shortSig ? 1 : shortSig && !longSig ? -1 : 0;
      if (side !== 0) {
        const px = c.close[i];
        const sl = side === 1 ? slLong : slShort;
        const risk = Math.abs(px - sl);
        live = {
          side,
          i,
          entry: px,
          sl,
          tp: side === 1 ? px + risk * 2 : px - risk * 2,
          risk,
          tpSeen: false,
        };
        lastSig = i;
      }
    }
  }
  if (live) trades.push(openTrade(bars, live, "HMA 색전환"));
  return {
    trades,
    overlays: [
      { name: "HMA", color: "#26c6da", values: mid },
      { name: "밴드 상", color: "#7dd3e0", values: bandHi },
      { name: "밴드 하", color: "#7dd3e0", values: bandLo },
    ],
    note: "RSI 익절은 원본 기본이 꺼져 있습니다.",
  };
}

function runUrsi(bars: Bar[], money: Money): BacktestOutput {
  const c = cols(bars);
  const length = 14;
  const upper = highest(c.close, length);
  const lower = lowest(c.close, length);
  const diff = new Array<number>(bars.length).fill(0);
  for (let i = 1; i < bars.length; i += 1) {
    if (!num(upper[i]) || !num(lower[i]) || !num(upper[i - 1]) || !num(lower[i - 1])) continue;
    const span = upper[i]! - lower[i]!;
    const step = c.close[i] - c.close[i - 1];
    diff[i] = upper[i]! > upper[i - 1]! ? span : lower[i]! < lower[i - 1]! ? -span : step;
  }
  const absDiff = diff.map((v) => Math.abs(v));
  const numMa = emaSeedRma(diff, length);
  const denMa = emaSeedRma(absDiff, length);
  const arsi = diff.map((_, i) => {
    if (!num(numMa[i]) || !num(denMa[i])) return null;
    return denMa[i] === 0 ? 50 : (numMa[i]! / denMa[i]!) * 50 + 50;
  });
  const left = 3;
  const lag = 2;
  const trades: BacktestTrade[] = [];
  let prevLoBar = -1;
  let prevLoPx = 0;
  let prevLoRsi = 0;
  let prevHiBar = -1;
  let prevHiPx = 0;
  let prevHiRsi = 0;
  let live: {
    side: 1 | -1;
    i: number;
    entry: number;
    sl: number;
    tp: number;
  } | null = null;
  const atrV = atr(c.high, c.low, c.close, 14);

  for (let i = left + lag; i < bars.length; i += 1) {
    const wasLive = live != null;
    if (live && i > live.i) {
      const hitSl = live.side === 1 ? c.low[i] <= live.sl : c.high[i] >= live.sl;
      const hitTp = live.side === 1 ? c.high[i] >= live.tp : c.low[i] <= live.tp;
      if (hitSl || hitTp) {
        const win = hitTp && !hitSl;
        trades.push(
          closeAt(
            bars,
            live,
            i,
            win ? live.tp : live.sl,
            win ? "TP 2R" : "SL",
            win ? 2 : -1,
            win,
            live.side === 1 ? "롱 다이버전스" : "숏 다이버전스",
            money
          )
        );
        live = null;
      }
    }
    const p = i - lag;
    if (arsi[p] == null) continue;
    let isLow = true;
    let isHigh = true;
    for (let k = p - left; k <= p + lag; k += 1) {
      if (k === p || arsi[k] == null) {
        if (arsi[k] == null) {
          isLow = false;
          isHigh = false;
        }
        continue;
      }
      if (arsi[k]! <= arsi[p]!) isLow = false;
      if (arsi[k]! >= arsi[p]!) isHigh = false;
    }
    let side: 1 | -1 | 0 = 0;
    if (isLow) {
      const gapOk = prevLoBar < 0 || p - prevLoBar >= 5;
      if (gapOk && prevLoBar >= 0 && c.low[p] < prevLoPx && arsi[p]! > prevLoRsi && arsi[p]! <= 40) {
        side = 1;
      }
      prevLoBar = p;
      prevLoPx = c.low[p];
      prevLoRsi = arsi[p]!;
    }
    if (isHigh) {
      const gapOk = prevHiBar < 0 || p - prevHiBar >= 5;
      if (gapOk && prevHiBar >= 0 && c.high[p] > prevHiPx && arsi[p]! < prevHiRsi && arsi[p]! >= 60) {
        side = side === 1 ? 0 : -1;
      }
      prevHiBar = p;
      prevHiPx = c.high[p];
      prevHiRsi = arsi[p]!;
    }
    if (!wasLive && !live && side !== 0 && num(atrV[i]) && atrV[i]! > 0) {
      const px = c.close[i];
      const risk = atrV[i]! * 1.5;
      live = {
        side,
        i,
        entry: px,
        sl: side === 1 ? px - risk : px + risk,
        tp: side === 1 ? px + risk * 2 : px - risk * 2,
      };
    }
  }
  if (live) trades.push(openTrade(bars, live, live.side === 1 ? "롱 다이버전스" : "숏 다이버전스"));
  return {
    trades,
    overlays: [],
    note: "확정까지 2봉을 기다립니다. 손절·익절은 원본에 없어서 ATR 1.5와 2R로 둡니다.",
  };
}

function emaSeedRma(values: number[], length: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
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

function trendBias(bars: Bar[]): { bias: (number | null)[]; adx: (number | null)[] } {
  const c = cols(bars);
  const e21 = ema(c.close, 21);
  const e50 = ema(c.close, 50);
  const st = supertrend(c.high, c.low, c.close, 3, 10);
  const di = dmi(c.high, c.low, c.close, 14, 14);
  const bias: (number | null)[] = new Array(bars.length).fill(null);
  for (let i = 3; i < bars.length; i += 1) {
    if (!num(e21[i]) || !num(e21[i - 3]) || !num(e50[i]) || !num(st.line[i]) || st.dir[i] == null || !num(di.plus[i]) || !num(di.minus[i])) {
      continue;
    }
    const up =
      c.close[i] > e21[i]! &&
      c.close[i] > st.line[i]! &&
      e21[i]! > e50[i]! &&
      e21[i]! > e21[i - 3]! &&
      st.dir[i]! < 0 &&
      di.plus[i]! > di.minus[i]!;
    const dn =
      c.close[i] < e21[i]! &&
      c.close[i] < st.line[i]! &&
      e21[i]! < e50[i]! &&
      e21[i]! < e21[i - 3]! &&
      st.dir[i]! > 0 &&
      di.minus[i]! > di.plus[i]!;
    bias[i] = up ? 1 : dn ? -1 : 0;
  }
  return { bias, adx: di.adx };
}

function alignLag(chart: Bar[], htf: Bar[], htfSec: number, values: (number | null)[]): (number | null)[] {
  const out: (number | null)[] = new Array(chart.length).fill(null);
  let j = 0;
  for (let i = 0; i < chart.length; i += 1) {
    const t = chart[i].time;
    while (j + 1 < htf.length && htf[j + 1].time + htfSec <= t) j += 1;
    const lastClosed = htf[j] && htf[j].time + htfSec <= t ? j : j - 1;
    const published = lastClosed - 1;
    if (published >= 0) out[i] = values[published] ?? null;
  }
  return out;
}

function runApex(input: RunInput): BacktestOutput {
  const bars = input.chart;
  const chartSec = (Number(input.interval) || 15) * 60;
  const smallBars = input.interval === "60" ? bars : input.extra["60"] ?? [];
  const bigBars = input.interval === "240" ? bars : input.extra["240"] ?? [];
  const tfOk = chartSec > 0 && chartSec <= 60 * 60 && bigBars.length > 50 && smallBars.length > 50;
  const c = cols(bars);
  const atrV = atr(c.high, c.low, c.close, 14);
  const ema8 = ema(c.close, 8);
  const ema21 = ema(c.close, 21);
  const ema50 = ema(c.close, 50);
  const ema200 = ema(c.close, 200);
  const vwap = sessionVwap(c.high, c.low, c.close, c.volume, c.time);
  const di = dmi(c.high, c.low, c.close, 14, 14);
  const stF = supertrend(c.high, c.low, c.close, 2, 7);
  const stM = supertrend(c.high, c.low, c.close, 3, 10);
  const stS = supertrend(c.high, c.low, c.close, 4, 14);
  const rsiV = rsi(c.close, 14);
  const stoch = stochRsi(rsiV, 14);
  const k = smaNullable(stoch, 3);
  const dLine = smaNullable(k, 3);
  const volSma = sma(c.volume, 20);
  const hma55 = hma(c.close, 55);
  const hh = highest(c.high, 99);
  const ll = lowest(c.low, 99);
  const trama: (number | null)[] = new Array(bars.length).fill(null);
  const reg: number[] = new Array(bars.length).fill(0);
  for (let i = 1; i < bars.length; i += 1) {
    const hhHit = num(hh[i]) && num(hh[i - 1]) && hh[i]! > hh[i - 1]! ? 1 : 0;
    const llHit = num(ll[i]) && num(ll[i - 1]) && ll[i]! < ll[i - 1]! ? 1 : 0;
    reg[i] = hhHit || llHit ? 1 : 0;
  }
  const regSma = sma(reg, 99);
  let tramaPrev = c.close[0] ?? 0;
  for (let i = 0; i < bars.length; i += 1) {
    const tc = num(regSma[i]) ? regSma[i]! * regSma[i]! : 0;
    tramaPrev = tramaPrev + tc * (c.close[i] - tramaPrev);
    trama[i] = i >= 99 ? tramaPrev : null;
  }
  const trail: (number | null)[] = new Array(bars.length).fill(null);
  for (let i = 0; i < bars.length; i += 1) {
    if (!num(atrV[i])) continue;
    const nLoss = 1.2 * atrV[i]!;
    const prev = i === 0 || trail[i - 1] == null ? c.close[i] : trail[i - 1]!;
    const prevClose = i === 0 ? c.close[i] : c.close[i - 1];
    if (c.close[i] > prev && prevClose > prev) trail[i] = Math.max(prev, c.close[i] - nLoss);
    else if (c.close[i] < prev && prevClose < prev) trail[i] = Math.min(prev, c.close[i] + nLoss);
    else trail[i] = c.close[i] > prev ? c.close[i] - nLoss : c.close[i] + nLoss;
  }
  const small = trendBias(smallBars);
  const big = trendBias(bigBars);
  const smlBias = alignLag(bars, smallBars, 3600, small.bias);
  const smlAdx = alignLag(bars, smallBars, 3600, small.adx);
  const bigBias = alignLag(bars, bigBars, 14400, big.bias);
  const bigAdx = alignLag(bars, bigBars, 14400, big.adx);

  const scalp = input.scalp;
  const touch = scalp ? 0.4 : 0.3;
  const ext = scalp ? 0.65 : 1.15;
  const rsiMin = scalp ? 36 : 42;
  const rsiMax = scalp ? 72 : 64;
  const adxMin = scalp ? 14 : 16;
  const htfAdxMin = scalp ? 12 : 16;
  const cool = scalp ? 3 : 8;
  const confirm = scalp ? 3 : 5;
  const tp1R = scalp ? 0.6 : 0.8;
  const tp2R = scalp ? 1.3 : 2;
  const q1 = (scalp ? 70 : 55) / 100;
  const slPad = scalp ? 0.06 : 0.12;
  const slMin = scalp ? 0.4 : 0.85;
  const slMax = scalp ? 1.05 : 2;
  const swingLen = scalp ? 5 : 8;
  const pierceMul = scalp ? 0.55 : 0.8;

  const trades: BacktestTrade[] = [];
  let lastSig = -1_000;
  let lastUp = -1;
  let lastDn = -1;
  let live: {
    side: 1 | -1;
    i: number;
    entry: number;
    sl: number;
    origSl: number;
    tp1: number;
    tp2: number;
    hit1: boolean;
    lock: number;
  } | null = null;

  const haC = c.open.map((open, i) => (open + c.high[i] + c.low[i] + c.close[i]) / 4);
  const haO: number[] = new Array(bars.length).fill(0);
  for (let i = 0; i < bars.length; i += 1) {
    haO[i] = i === 0 ? (c.open[i] + c.close[i]) / 2 : (haO[i - 1] + haC[i - 1]) / 2;
  }

  for (let i = 1; i < bars.length; i += 1) {
    const wasLive = live != null;
    if (crossedOver(k, dLine, i)) lastUp = i;
    if (crossedUnder(k, dLine, i)) lastDn = i;
    if (live && i > live.i) {
      const hitSl = live.side === 1 ? c.low[i] <= live.sl : c.high[i] >= live.sl;
      const hit1 = live.side === 1 ? c.high[i] >= live.tp1 : c.low[i] <= live.tp1;
      const hit2 = live.side === 1 ? c.high[i] >= live.tp2 : c.low[i] <= live.tp2;
      const hitBe = live.side === 1 ? c.low[i] <= live.entry : c.high[i] >= live.entry;
      const leg1 =
        live.side === 1
          ? (live.tp1 - live.entry) / live.entry
          : (live.entry - live.tp1) / live.entry;
      const leg2 =
        live.side === 1
          ? (live.tp2 - live.entry) / live.entry
          : (live.entry - live.tp2) / live.entry;
      const push = (exit: number, why: string, r: number, win: boolean | null, move: number) => {
        const gross = Math.max(input.money.bet * input.money.lev * move, -input.money.bet);
        trades.push({
          side: live!.side,
          entryTime: bars[live!.i].time,
          exitTime: bars[i].time,
          entry: live!.entry,
          exit,
          sl: live!.origSl,
          tp: live!.tp2,
          reason: live!.side === 1 ? "눌림 롱" : "눌림 숏",
          exitReason: why,
          r,
          usd: gross - feeOnly(input.money),
          win,
        });
        live = null;
      };
      if (!live.hit1) {
        const fullR = tp1R * q1 + tp2R * (1 - q1);
        if (hit2 && !hitSl) push(live.tp2, "TP2", fullR, true, leg1 * q1 + leg2 * (1 - q1));
        else if (hit1 && !hitSl) {
          live.hit1 = true;
          live.lock = i;
          live.sl = live.entry;
        } else if (hitSl) {
          const move =
            live.side === 1
              ? (live.sl - live.entry) / live.entry
              : (live.entry - live.sl) / live.entry;
          push(live.sl, "손절", -1, false, move);
        }
      } else if (i > live.lock) {
        const fullR = tp1R * q1 + tp2R * (1 - q1);
        const partialR = tp1R * q1;
        if (hit2 && !hitBe) push(live.tp2, "TP2", fullR, true, leg1 * q1 + leg2 * (1 - q1));
        else if (hit2 && hitBe) {
          const kept = live.side === 1 ? c.close[i] >= live.entry : c.close[i] <= live.entry;
          push(
            kept ? live.tp2 : live.entry,
            kept ? "TP2" : "본절",
            kept ? fullR : partialR,
            true,
            kept ? leg1 * q1 + leg2 * (1 - q1) : leg1 * q1
          );
        } else if (hitBe) push(live.entry, "본절", partialR, true, leg1 * q1);
      }
    }
    if (wasLive || !tfOk) continue;
    if (
      !num(atrV[i]) ||
      !num(ema21[i]) ||
      !num(ema21[i - 1]) ||
      !num(ema50[i]) ||
      !num(ema8[i]) ||
      !num(vwap[i]) ||
      !num(vwap[i - 1]) ||
      !num(rsiV[i]) ||
      stS.dir[i] == null ||
      stF.dir[i] == null ||
      stM.dir[i] == null ||
      !num(di.adx[i]) ||
      !num(di.plus[i]) ||
      !num(di.minus[i]) ||
      !num(hma55[i]) ||
      !num(hma55[i - 1]) ||
      !num(trama[i]) ||
      !num(trail[i]) ||
      !num(ema200[i]) ||
      smlBias[i] == null ||
      bigBias[i] == null ||
      smlAdx[i] == null ||
      bigAdx[i] == null
    ) {
      continue;
    }
    const alignL = bigBias[i]! > 0.5 && smlBias[i]! > 0.5;
    const alignS = bigBias[i]! < -0.5 && smlBias[i]! < -0.5;
    if (!alignL && !alignS) continue;
    if (di.adx[i]! < adxMin || bigAdx[i]! < htfAdxMin || smlAdx[i]! < htfAdxMin) continue;
    if (i - lastSig < cool) continue;
    const band = atrV[i]! * touch;
    const pierce = atrV[i]! * pierceMul;
    const rng = c.high[i] - c.low[i];
    const body = Math.abs(c.close[i] - c.open[i]);
    const loWick = Math.min(c.close[i], c.open[i]) - c.low[i];
    const upWick = c.high[i] - Math.max(c.close[i], c.open[i]);
    const midPx = (c.high[i] + c.low[i]) * 0.5;
    const candleL =
      rng > 0 &&
      c.close[i] > c.open[i] &&
      (body >= rng * 0.25 || (loWick >= rng * 0.34 && c.close[i] >= midPx));
    const candleS =
      rng > 0 &&
      c.close[i] < c.open[i] &&
      (body >= rng * 0.25 || (upWick >= rng * 0.34 && c.close[i] <= midPx));
    const ma = scalp ? ema8[i]! : ema21[i]!;
    const maPrev = scalp ? ema8[i - 1]! : ema21[i - 1]!;
    const holdEmaL =
      c.low[i] <= ma + band &&
      c.low[i] >= ma - pierce &&
      c.close[i] > ma &&
      c.close[i - 1] >= maPrev &&
      candleL &&
      (scalp ? ema8[i]! > ema21[i]! : true);
    const holdVwapL =
      c.low[i] <= vwap[i]! + band &&
      c.low[i] >= vwap[i]! - pierce &&
      c.close[i] > vwap[i]! &&
      c.close[i] > ma &&
      c.close[i - 1] >= vwap[i - 1]! &&
      candleL;
    const holdEmaS =
      c.high[i] >= ma - band &&
      c.high[i] <= ma + pierce &&
      c.close[i] < ma &&
      c.close[i - 1] <= maPrev &&
      candleS &&
      (scalp ? ema8[i]! < ema21[i]! : true);
    const holdVwapS =
      c.high[i] >= vwap[i]! - band &&
      c.high[i] <= vwap[i]! + pierce &&
      c.close[i] < vwap[i]! &&
      c.close[i] < ma &&
      c.close[i - 1] <= vwap[i - 1]! &&
      candleS;
    const triggerL = holdEmaL || holdVwapL;
    const triggerS = holdEmaS || holdVwapS;
    const nearL = c.close[i] >= ma && c.close[i] - ma <= atrV[i]! * ext;
    const nearS = c.close[i] <= ma && ma - c.close[i] <= atrV[i]! * ext;
    const rsiOkL = rsiV[i]! >= rsiMin && rsiV[i]! <= rsiMax;
    const rsiOkS = rsiV[i]! <= 100 - rsiMin && rsiV[i]! >= 100 - rsiMax;
    const chartStL = scalp ? stF.dir[i]! < 0 : stS.dir[i]! < 0;
    const chartStS = scalp ? stF.dir[i]! > 0 : stS.dir[i]! > 0;
    const structL = scalp ? ema8[i]! > ema21[i]! : ema21[i]! > ema50[i]!;
    const structS = scalp ? ema8[i]! < ema21[i]! : ema21[i]! < ema50[i]!;
    let swingLo = Infinity;
    let swingHi = -Infinity;
    for (let k = Math.max(0, i - swingLen + 1); k <= i; k += 1) {
      swingLo = Math.min(swingLo, c.low[k]);
      swingHi = Math.max(swingHi, c.high[k]);
    }
    const distL = c.close[i] - (Math.min(swingLo, c.low[i]) - atrV[i]! * slPad);
    const distS = Math.max(swingHi, c.high[i]) + atrV[i]! * slPad - c.close[i];
    const roomL = distL > 0 && distL <= atrV[i]! * slMax;
    const roomS = distS > 0 && distS <= atrV[i]! * slMax;
    const haBody = Math.abs(haC[i] - haO[i]);
    const haPrev = Math.abs(haC[i - 1] - haO[i - 1]);
    const haBull = haC[i] > haO[i] && haBody >= haPrev && haBody > 0;
    const haBear = haC[i] < haO[i] && haBody >= haPrev && haBody > 0;
    const stochL = lastUp >= 0 && i - lastUp <= 3 && num(k[i]) && num(dLine[i]) && k[i]! > dLine[i]! && k[i]! <= 70;
    const stochS = lastDn >= 0 && i - lastDn <= 3 && num(k[i]) && num(dLine[i]) && k[i]! < dLine[i]! && k[i]! >= 30;
    const timeL = hma55[i]! > hma55[i - 1]! || stochL || haBull;
    const timeS = hma55[i]! < hma55[i - 1]! || stochS || haBear;
    const votesL =
      (ema8[i]! > ema21[i]! && ema21[i]! > ema50[i]! ? 1 : 0) +
      (c.close[i] > vwap[i]! ? 1 : 0) +
      (hma55[i]! > hma55[i - 1]! ? 1 : 0) +
      (c.close[i] > trama[i]! ? 1 : 0) +
      (stF.dir[i]! < 0 && stM.dir[i]! < 0 ? 1 : 0) +
      (timeL ? 1 : 0) +
      (num(volSma[i]) && c.volume[i] >= volSma[i]! ? 1 : 0) +
      (di.plus[i]! > di.minus[i]! ? 1 : 0) +
      (c.close[i] > ema200[i]! ? 1 : 0) +
      (c.close[i] > trail[i]! ? 1 : 0);
    const votesS =
      (ema8[i]! < ema21[i]! && ema21[i]! < ema50[i]! ? 1 : 0) +
      (c.close[i] < vwap[i]! ? 1 : 0) +
      (hma55[i]! < hma55[i - 1]! ? 1 : 0) +
      (c.close[i] < trama[i]! ? 1 : 0) +
      (stF.dir[i]! > 0 && stM.dir[i]! > 0 ? 1 : 0) +
      (timeS ? 1 : 0) +
      (num(volSma[i]) && c.volume[i] >= volSma[i]! ? 1 : 0) +
      (di.minus[i]! > di.plus[i]! ? 1 : 0) +
      (c.close[i] < ema200[i]! ? 1 : 0) +
      (c.close[i] < trail[i]! ? 1 : 0);
    const gateL =
      alignL &&
      chartStL &&
      structL &&
      rsiOkL &&
      nearL &&
      roomL &&
      timeL &&
      votesL >= confirm &&
      triggerL &&
      !triggerS;
    const gateS =
      alignS &&
      chartStS &&
      structS &&
      rsiOkS &&
      nearS &&
      roomS &&
      timeS &&
      votesS >= confirm &&
      triggerS &&
      !triggerL;
    const side: 1 | -1 | 0 = gateL && !gateS ? 1 : gateS && !gateL ? -1 : 0;
    if (side === 0) continue;
    const px = c.close[i];
    const dist = side === 1 ? distL : distS;
    const adj = Math.max(atrV[i]! * slMin, dist);
    const sl = side === 1 ? px - adj : px + adj;
    const risk = Math.max(Math.abs(px - sl), 1e-8);
    live = {
      side,
      i,
      entry: px,
      sl,
      origSl: sl,
      tp1: side === 1 ? px + risk * tp1R : px - risk * tp1R,
      tp2: side === 1 ? px + risk * tp2R : px - risk * tp2R,
      hit1: false,
      lock: -1,
    };
    lastSig = i;
  }
  if (live) {
    trades.push({
      side: live.side,
      entryTime: bars[live.i].time,
      exitTime: null,
      entry: live.entry,
      exit: null,
      sl: live.origSl,
      tp: live.tp2,
      reason: live.side === 1 ? "눌림 롱" : "눌림 숏",
      exitReason: "진행 중",
      r: null,
      usd: null,
      win: null,
    });
  }
  const overlays: Overlay[] = [
    { name: "EMA 21", color: "#f0c14a", values: ema21 },
    { name: "EMA 50", color: "#c8cdd8", values: ema50 },
    { name: "VWAP", color: "#4da3ff", values: vwap },
  ];
  return {
    trades,
    overlays,
    note: tfOk
      ? scalp
        ? "알트 단타 수치입니다. 큰 봉은 4시간, 작은 봉은 1시간이고, 차트는 5분이 맞습니다."
        : "큰 봉 4시간, 작은 봉 1시간. 둘 다 닫힌 뒤 한 봉을 더 지나야 추세로 인정합니다. VWAP은 한국시간 자정 기준."
      : "Apex는 차트 봉이 1시간 이하이고 1시간·4시간 봉이 있을 때 신호가 납니다.",
  };
}

function openTrade(
  bars: Bar[],
  live: { side: 1 | -1; i: number; entry: number; sl: number; tp: number },
  reason: string
): BacktestTrade {
  return {
    side: live.side,
    entryTime: bars[live.i].time,
    exitTime: null,
    entry: live.entry,
    exit: null,
    sl: live.sl,
    tp: live.tp,
    reason,
    exitReason: "진행 중",
    r: null,
    usd: null,
    win: null,
  };
}

function closeAt(
  bars: Bar[],
  live: { side: 1 | -1; i: number; entry: number; sl: number; tp: number },
  exitIndex: number,
  exit: number,
  exitReason: string,
  r: number,
  win: boolean | null,
  reason: string,
  money: Money
): BacktestTrade {
  return {
    side: live.side,
    entryTime: bars[live.i].time,
    exitTime: bars[exitIndex].time,
    entry: live.entry,
    exit,
    sl: live.sl,
    tp: live.tp,
    reason,
    exitReason,
    r,
    usd: dollarMove(live.entry, exit, live.side, money),
    win,
  };
}
