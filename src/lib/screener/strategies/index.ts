import type { OhlcvCandle, StrategyId, StrategyScore } from "../types";
import {
  atr,
  bollinger,
  ema,
  lastFinite,
  macd,
  mean,
  median,
  pctChange,
  recentCross,
  recentZeroCross,
  rsi,
  slope,
  swingHigh,
  swingLow,
} from "../indicators";

export interface TfMetrics {
  candles: OhlcvCandle[];
  closes: number[];
  volumes: number[];
  turnovers: number[];
  last: OhlcvCandle;
  prev: OhlcvCandle;
  volMult: number;
  turnoverMult: number;
  volMedianMult: number;
  changePct: number;
  rsi: number;
  ema20: number;
  ema50: number;
  ema200: number;
  emaSlope20: number;
  emaSlope50: number;
  macdCross: "golden" | "dead" | null;
  macdHistRising: boolean;
  macdAboveZero: boolean;
  /** MACD > Signal (골든크로스 상태 유지) */
  macdBullish: boolean;
  /** MACD 선이 최근 0선 상향/하향 돌파 */
  macdZeroCross: "up" | "down" | null;
  bbUpper: number;
  bbLower: number;
  bbMid: number;
  bbWidth: number;
  bbWidthExpanding: boolean;
  atr: number;
  atrPrev: number;
  high20: number;
  low20: number;
  takerBuyRatio: number | null;
  bodyPct: number;
  upperWickPct: number;
  lowerWickPct: number;
}

export function buildTfMetrics(candles: OhlcvCandle[]): TfMetrics | null {
  if (candles.length < 50) return null;
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const turnovers = candles.map((c) => c.turnover);
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const avgVol = mean(volumes.slice(-21, -1));
  const avgTurn = mean(turnovers.slice(-21, -1));
  const medVol = median(volumes.slice(-21, -1));
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const r = rsi(closes, 14);
  const m = macd(closes);
  const bb = bollinger(closes, 20, 2);
  const a = atr(candles, 14);
  const atrLast = lastFinite(a);
  const atrPrev = a.length >= 6 ? a[a.length - 6] : atrLast;
  const range = last.high - last.low || last.close * 0.001;
  const body = Math.abs(last.close - last.open);
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const taker =
    last.takerBuyVolume != null && last.volume > 0
      ? last.takerBuyVolume / last.volume
      : null;

  const histRising =
    m.hist.length >= 3 &&
    m.hist[m.hist.length - 1] > m.hist[m.hist.length - 2] &&
    m.hist[m.hist.length - 2] > m.hist[m.hist.length - 3];

  const widthNow = lastFinite(bb.width);
  const widthPrev =
    bb.width.length >= 4 ? bb.width[bb.width.length - 4] : widthNow;

  const macdLine = lastFinite(m.macd);
  const macdSig = lastFinite(m.signal);

  return {
    candles,
    closes,
    volumes,
    turnovers,
    last,
    prev,
    volMult: avgVol > 0 ? last.volume / avgVol : 0,
    turnoverMult: avgTurn > 0 ? last.turnover / avgTurn : 0,
    volMedianMult: medVol > 0 ? last.volume / medVol : 0,
    changePct: pctChange(prev.close, last.close),
    rsi: lastFinite(r),
    ema20: lastFinite(e20),
    ema50: lastFinite(e50),
    ema200: lastFinite(e200),
    emaSlope20: slope(e20, 5),
    emaSlope50: slope(e50, 5),
    macdCross: recentCross(m.macd, m.signal, 5),
    macdHistRising: histRising,
    macdAboveZero: macdLine > 0,
    macdBullish: macdLine > macdSig,
    macdZeroCross: recentZeroCross(m.macd, 5),
    bbUpper: lastFinite(bb.upper),
    bbLower: lastFinite(bb.lower),
    bbMid: lastFinite(bb.mid),
    bbWidth: widthNow,
    bbWidthExpanding: widthNow > widthPrev,
    atr: atrLast,
    atrPrev,
    high20: swingHigh(candles, 20),
    low20: swingLow(candles, 20),
    takerBuyRatio: taker,
    bodyPct: body / range,
    upperWickPct: upperWick / range,
    lowerWickPct: lowerWick / range,
  };
}

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

export function scoreStrategies(input: {
  m15: TfMetrics;
  m1h: TfMetrics;
  m5?: TfMetrics | null;
  m4h?: TfMetrics | null;
  oiChangePct: number | null;
  fundingRate: number | null;
  change15m: number;
  change1h: number;
  minVolMult: number;
}): StrategyScore[] {
  const { m15, m1h, oiChangePct, fundingRate, change15m, change1h, minVolMult } =
    input;
  const out: StrategyScore[] = [];

  // volume spike
  {
    let score = 40;
    const notes: string[] = [];
    if (m15.volMult >= minVolMult) {
      score += 25;
      notes.push(`15m 거래량 ${m15.volMult.toFixed(1)}배`);
    }
    if (m15.turnoverMult >= minVolMult) {
      score += 15;
      notes.push(`15m 거래대금 ${m15.turnoverMult.toFixed(1)}배`);
    }
    const risingVol =
      m15.volumes.slice(-3).every((v, i, a) => i === 0 || v >= a[i - 1] * 0.95);
    if (risingVol) score += 10;
    if (m15.takerBuyRatio != null && m15.takerBuyRatio > 0.55 && m15.changePct > 0) {
      score += 8;
      notes.push(`매수 주도 ${(m15.takerBuyRatio * 100).toFixed(0)}%`);
    }
    if (m15.takerBuyRatio != null && m15.takerBuyRatio < 0.45 && m15.changePct < 0) {
      score += 8;
      notes.push(`매도 주도 ${((1 - m15.takerBuyRatio) * 100).toFixed(0)}%`);
    }
    out.push({
      id: "volume_spike",
      score: clamp(score),
      side:
        m15.changePct > 0.2 ? "LONG" : m15.changePct < -0.2 ? "SHORT" : "NEUTRAL",
      notes,
    });
  }

  // trend align
  {
    let long = 30;
    let short = 30;
    const notes: string[] = [];
    if (m15.ema20 > m15.ema50 && m15.ema50 > m15.ema200) {
      long += 30;
      notes.push("15m EMA20>50>200");
    }
    if (m15.ema20 < m15.ema50 && m15.ema50 < m15.ema200) {
      short += 30;
      notes.push("15m EMA20<50<200");
    }
    if (m1h.last.close > m1h.ema200) long += 15;
    if (m1h.last.close < m1h.ema200) short += 15;
    if (m15.emaSlope20 > 0 && m15.emaSlope50 > 0) long += 10;
    if (m15.emaSlope20 < 0 && m15.emaSlope50 < 0) short += 10;
    if (Math.sign(m15.changePct) === Math.sign(m1h.changePct)) {
      if (m15.changePct > 0) long += 10;
      if (m15.changePct < 0) short += 10;
    }
    out.push({
      id: "trend_align",
      score: clamp(Math.max(long, short)),
      side: long >= short ? "LONG" : "SHORT",
      notes,
    });
  }

  // golden / dead cross
  {
    const cross15 = m15.macdCross;
    const emaCross = recentCross(
      ema(m15.closes, 20),
      ema(m15.closes, 50),
      5
    );
    if (cross15 === "golden" || emaCross === "golden") {
      out.push({
        id: "golden_cross",
        score: clamp(70 + (m15.macdHistRising ? 15 : 0)),
        side: "LONG",
        notes: ["최근 골든크로스"],
      });
    } else {
      out.push({ id: "golden_cross", score: 25, side: "NEUTRAL", notes: [] });
    }
    if (cross15 === "dead" || emaCross === "dead") {
      out.push({
        id: "dead_cross",
        score: clamp(70 + (!m15.macdHistRising ? 15 : 0)),
        side: "SHORT",
        notes: ["최근 데드크로스"],
      });
    } else {
      out.push({ id: "dead_cross", score: 25, side: "NEUTRAL", notes: [] });
    }
  }

  // MACD 모멘텀 (히스토그램 방향·제로라인·멀티TF 정렬)
  {
    let long = 0;
    let short = 0;
    const notes: string[] = [];
    if (m15.macdCross === "golden") {
      long += 35;
      notes.push("15m MACD 골든");
    }
    if (m15.macdCross === "dead") {
      short += 35;
      notes.push("15m MACD 데드");
    }
    if (m15.macdHistRising && m15.macdAboveZero) {
      long += 25;
      notes.push("히스토그램↑ + 제로 위");
    }
    if (!m15.macdHistRising && !m15.macdAboveZero) {
      short += 25;
      notes.push("히스토그램↓ + 제로 아래");
    }
    if (m15.macdHistRising && !m15.macdAboveZero) {
      long += 15;
      notes.push("제로 아래에서 히스토그램 상승(전환)");
    }
    if (!m15.macdHistRising && m15.macdAboveZero) {
      short += 15;
      notes.push("제로 위에서 히스토그램 하락(약화)");
    }
    if (m1h.macdHistRising && m1h.macdAboveZero) long += 15;
    if (!m1h.macdHistRising && !m1h.macdAboveZero) short += 15;
    if (m1h.macdCross === "golden") long += 10;
    if (m1h.macdCross === "dead") short += 10;
    const side =
      long === short ? "NEUTRAL" : long > short ? "LONG" : "SHORT";
    out.push({
      id: "macd_momentum",
      score: clamp(Math.max(long, short, 20)),
      side,
      notes,
    });
  }

  // EMA200 위 + (0선 위 골든크로스 | 골든 상태에서 0선 상향 돌파)
  // 숏은 반대: EMA200 아래 + (0선 아래 데드크로스 | 데드 상태에서 0선 하향 돌파)
  {
    const notes: string[] = [];
    const ema200Ok = Number.isFinite(m15.ema200) && m15.ema200 > 0;
    const above200 = ema200Ok && m15.last.close > m15.ema200;
    const below200 = ema200Ok && m15.last.close < m15.ema200;
    const above200_1h =
      Number.isFinite(m1h.ema200) && m1h.last.close > m1h.ema200;
    const below200_1h =
      Number.isFinite(m1h.ema200) && m1h.last.close < m1h.ema200;

    // 롱 A: 0선 위에서 MACD 골든크로스
    const longA =
      above200 && m15.macdCross === "golden" && m15.macdAboveZero;
    // 롱 B: 이미 골든(MACD>Signal) 상태에서 MACD선이 0선 상향 돌파
    const longB =
      above200 && m15.macdBullish && m15.macdZeroCross === "up";

    // 숏 A: 0선 아래에서 MACD 데드크로스
    const shortA =
      below200 && m15.macdCross === "dead" && !m15.macdAboveZero;
    // 숏 B: 이미 데드(MACD<Signal) 상태에서 MACD선이 0선 하향 돌파
    const shortB =
      below200 && !m15.macdBullish && m15.macdZeroCross === "down";

    if (longA || longB) {
      let score = 80;
      if (longA) notes.push("EMA200↑ + 0선 위 MACD 골든크로스");
      if (longB) notes.push("EMA200↑ + 골든 상태에서 0선 상향 돌파");
      if (above200_1h) {
        score += 8;
        notes.push("1h도 EMA200 위");
      }
      if (longA && longB) score += 5;
      if (m15.macdHistRising) score += 5;
      if (m15.volMult >= 1.3) score += 4;
      out.push({
        id: "ema200_macd_zero",
        score: clamp(score),
        side: "LONG",
        notes,
      });
    } else if (shortA || shortB) {
      let score = 80;
      if (shortA) notes.push("EMA200↓ + 0선 아래 MACD 데드크로스");
      if (shortB) notes.push("EMA200↓ + 데드 상태에서 0선 하향 돌파");
      if (below200_1h) {
        score += 8;
        notes.push("1h도 EMA200 아래");
      }
      if (shortA && shortB) score += 5;
      if (!m15.macdHistRising) score += 5;
      if (m15.volMult >= 1.3) score += 4;
      out.push({
        id: "ema200_macd_zero",
        score: clamp(score),
        side: "SHORT",
        notes,
      });
    } else {
      // 세팅 근접(아직 트리거 전)
      let score = 22;
      let side: "LONG" | "SHORT" | "NEUTRAL" = "NEUTRAL";
      if (above200 && m15.macdBullish) {
        score = 40;
        side = "LONG";
        notes.push("EMA200 위·골든 유지 — 0선 돌파 대기");
      } else if (below200 && !m15.macdBullish) {
        score = 40;
        side = "SHORT";
        notes.push("EMA200 아래·데드 유지 — 0선 이탈 대기");
      } else if (above200) {
        notes.push("EMA200 위 — MACD 신호 대기");
      } else if (below200) {
        notes.push("EMA200 아래 — MACD 신호 대기");
      }
      out.push({
        id: "ema200_macd_zero",
        score: clamp(score),
        side,
        notes,
      });
    }
  }

  // breakout high / breakdown low
  {
    const brokeHigh =
      m15.last.close > m15.high20 * 0.999 && m15.prev.close <= m15.high20;
    const fakeHigh = m15.last.high > m15.high20 && m15.last.close < m15.high20;
    let longScore = brokeHigh ? 75 : m15.last.close > m15.high20 * 0.98 ? 55 : 30;
    if (brokeHigh && m15.volMult >= 1.5) longScore += 15;
    if (fakeHigh) longScore -= 25;
    out.push({
      id: "breakout_high",
      score: clamp(longScore),
      side: "LONG",
      notes: brokeHigh ? ["20봉 고점 돌파 마감"] : [],
    });

    const brokeLow =
      m15.last.close < m15.low20 * 1.001 && m15.prev.close >= m15.low20;
    const fakeLow = m15.last.low < m15.low20 && m15.last.close > m15.low20;
    let shortScore = brokeLow ? 75 : m15.last.close < m15.low20 * 1.02 ? 55 : 30;
    if (brokeLow && m15.volMult >= 1.5) shortScore += 15;
    if (fakeLow) shortScore -= 25;
    out.push({
      id: "breakdown_low",
      score: clamp(shortScore),
      side: "SHORT",
      notes: brokeLow ? ["20봉 저점 이탈 마감"] : [],
    });
  }

  // retest
  {
    const nearBreak =
      Math.abs(m15.last.close - m15.high20) / m15.last.close < 0.008 &&
      m15.last.close >= m15.high20 * 0.992;
    out.push({
      id: "retest",
      score: clamp(nearBreak && m15.volMult < 1.2 ? 72 : 35),
      side: nearBreak ? "LONG" : "NEUTRAL",
      notes: nearBreak ? ["돌파대 재테스트 지지 후보"] : [],
    });
  }

  // pullback
  {
    const upTrend = m15.ema20 > m15.ema50 && m1h.last.close > m1h.ema200;
    const nearEma =
      Math.abs(m15.last.close - m15.ema20) / m15.last.close < 0.012 ||
      Math.abs(m15.last.close - m15.ema50) / m15.last.close < 0.015;
    const volDry = m15.volMult < 1.1;
    const bounce = m15.last.close > m15.last.open;
    const ok = upTrend && nearEma && bounce;
    out.push({
      id: "pullback",
      score: clamp(ok ? 70 + (volDry ? 10 : 0) : 32),
      side: ok ? "LONG" : "NEUTRAL",
      notes: ok ? ["상승 추세 눌림목 반등"] : [],
    });
  }

  // overheat revert
  {
    const overheat = m15.rsi >= 75 && change15m > 3;
    const oversold = m15.rsi <= 25 && change15m < -3;
    out.push({
      id: "overheat_revert",
      score: clamp(overheat || oversold ? 68 : 28),
      side: overheat ? "SHORT" : oversold ? "LONG" : "NEUTRAL",
      notes: overheat
        ? ["과열 되돌림 후보"]
        : oversold
          ? ["과매도 되돌림 후보"]
          : [],
    });
  }

  // bb expand
  {
    let score = 35;
    const notes: string[] = [];
    if (m15.bbWidthExpanding) {
      score += 20;
      notes.push("밴드 폭 확대");
    }
    if (m15.last.close > m15.bbUpper && m15.volMult >= 1.5) {
      score += 25;
      notes.push("상단 돌파+거래량");
    }
    if (m15.last.close < m15.bbLower && m15.volMult >= 1.5) {
      score += 25;
      notes.push("하단 이탈+거래량");
    }
    if (m15.upperWickPct > 0.45 && m15.last.close > m15.bbUpper) score -= 20;
    out.push({
      id: "bb_expand",
      score: clamp(score),
      side:
        m15.last.close > m15.bbMid
          ? "LONG"
          : m15.last.close < m15.bbMid
            ? "SHORT"
            : "NEUTRAL",
      notes,
    });
  }

  // oi increase
  {
    let score = 30;
    const notes: string[] = [];
    if (oiChangePct != null && oiChangePct > 1) {
      score += 35;
      notes.push(`OI ${oiChangePct.toFixed(1)}%`);
      if (change1h > 0) score += 20;
      if (change1h < 0) score += 20;
    }
    out.push({
      id: "oi_increase",
      score: clamp(score),
      side: change1h >= 0 ? "LONG" : "SHORT",
      notes,
    });
  }

  // short / long squeeze (proxy via OI drop + price move, funding)
  {
    const shortSq =
      change15m > 1.5 &&
      ((oiChangePct != null && oiChangePct < -1) ||
        (fundingRate != null && fundingRate < -0.0001));
    const longSq =
      change15m < -1.5 &&
      ((oiChangePct != null && oiChangePct < -1) ||
        (fundingRate != null && fundingRate > 0.0001));
    out.push({
      id: "short_squeeze",
      score: clamp(shortSq ? 74 : 22),
      side: shortSq ? "LONG" : "NEUTRAL",
      notes: shortSq ? ["숏 스퀴즈 가능성"] : [],
    });
    out.push({
      id: "long_squeeze",
      score: clamp(longSq ? 74 : 22),
      side: longSq ? "SHORT" : "NEUTRAL",
      notes: longSq ? ["롱 스퀴즈 가능성"] : [],
    });
  }

  // post liq bounce — no public liq → low score placeholder
  out.push({
    id: "post_liq_bounce",
    score: 20,
    side: "NEUTRAL",
    notes: ["청산 데이터 없음"],
  });

  // volatility expand
  {
    const atrUp = m15.atr > m15.atrPrev * 1.15;
    out.push({
      id: "volatility_expand",
      score: clamp(atrUp ? 65 + (Math.abs(m15.changePct) > 0.5 ? 15 : 0) : 30),
      side:
        m15.changePct > 0 ? "LONG" : m15.changePct < 0 ? "SHORT" : "NEUTRAL",
      notes: atrUp ? ["ATR 확대"] : [],
    });
  }

  return out;
}

export function aggregateScores(
  strategies: StrategyScore[],
  ctx: {
    m15: TfMetrics;
    m1h: TfMetrics;
    change15m: number;
    change1h: number;
    change24h: number;
    fundingRate: number | null;
    oiChangePct: number | null;
    filters: { maxChange15m: number; maxDrop15m: number; minRr: number };
    rr1: number | null;
  }
): {
  scoreLong: number;
  scoreShort: number;
  scoreTotal: number;
  strongest: StrategyId | null;
  reasons: string[];
  risks: string[];
  direction: import("../types").Direction;
  label: string;
  stars: number;
} {
  const longStrats = strategies.filter((s) => s.side === "LONG");
  const shortStrats = strategies.filter((s) => s.side === "SHORT");
  const avg = (arr: StrategyScore[]) =>
    arr.length ? arr.reduce((s, x) => s + x.score, 0) / arr.length : 0;

  // weighted composite components
  let long =
    avg(longStrats) * 0.45 +
    (ctx.m15.volMult > 1 ? Math.min(ctx.m15.volMult * 8, 20) : 0) +
    (ctx.m15.ema20 > ctx.m15.ema50 ? 12 : 0) +
    (ctx.m15.rsi >= 50 && ctx.m15.rsi <= 70 ? 12 : ctx.m15.rsi > 45 ? 6 : 0) +
    (ctx.m15.macdCross === "golden" || ctx.m15.macdHistRising ? 10 : 0) +
    (ctx.oiChangePct != null && ctx.oiChangePct > 0 && ctx.change1h > 0 ? 8 : 0);

  let short =
    avg(shortStrats) * 0.45 +
    (ctx.m15.volMult > 1 && ctx.m15.changePct < 0
      ? Math.min(ctx.m15.volMult * 8, 20)
      : 0) +
    (ctx.m15.ema20 < ctx.m15.ema50 ? 12 : 0) +
    (ctx.m15.rsi <= 50 && ctx.m15.rsi >= 30 ? 12 : ctx.m15.rsi < 55 ? 6 : 0) +
    (ctx.m15.macdCross === "dead" || !ctx.m15.macdHistRising ? 8 : 0) +
    (ctx.oiChangePct != null && ctx.oiChangePct > 0 && ctx.change1h < 0 ? 8 : 0);

  const risks: string[] = [];
  if (ctx.change15m >= ctx.filters.maxChange15m) {
    long -= 25;
    risks.push(
      `최근 15분 상승률 ${ctx.change15m.toFixed(1)}% — 추격 롱 위험`
    );
  }
  if (ctx.change15m <= -ctx.filters.maxDrop15m) {
    short -= 25;
    risks.push(
      `최근 15분 하락률 ${ctx.change15m.toFixed(1)}% — 추격 숏 위험`
    );
  }
  if (ctx.change1h >= 15) {
    long -= 30;
    risks.push(`1시간 급등 ${ctx.change1h.toFixed(1)}%`);
  }
  if (ctx.change1h <= -15) {
    short -= 30;
    risks.push(`1시간 급락 ${ctx.change1h.toFixed(1)}%`);
  }
  if (ctx.m15.rsi >= 80) {
    long -= 35;
    risks.push(`RSI ${ctx.m15.rsi.toFixed(0)} 과열`);
  } else if (ctx.m15.rsi >= 75) {
    long -= 15;
    risks.push(`RSI ${ctx.m15.rsi.toFixed(0)} 주의`);
  }
  if (ctx.m15.rsi <= 20) {
    short -= 35;
    risks.push(`RSI ${ctx.m15.rsi.toFixed(0)} 과매도 — 추격 숏 위험`);
  } else if (ctx.m15.rsi <= 30) {
    short -= 12;
    risks.push(`RSI ${ctx.m15.rsi.toFixed(0)} 추격 숏 주의`);
  }
  if (ctx.fundingRate != null && ctx.fundingRate > 0.0003) {
    long -= 12;
    risks.push(`펀딩비 ${(ctx.fundingRate * 100).toFixed(3)}% 롱 과밀`);
  }
  if (ctx.fundingRate != null && ctx.fundingRate < -0.0003) {
    short -= 12;
    risks.push(`펀딩비 ${(ctx.fundingRate * 100).toFixed(3)}% 숏 과밀`);
  }
  if (ctx.m15.upperWickPct > 0.5 && ctx.m15.volMult > 2) {
    long -= 10;
    risks.push("긴 윗꼬리 — 매수 소화 가능성");
  }
  if (ctx.m15.lowerWickPct > 0.5 && ctx.m15.volMult > 2) {
    short -= 10;
    risks.push("긴 아랫꼬리 — 매도 소화 가능성");
  }
  if (ctx.change24h <= -15) {
    long -= 20;
    risks.push("24h -15% 이상 — 단순 롱 추격 제외 권고");
  }
  if (ctx.rr1 != null && ctx.rr1 < ctx.filters.minRr) {
    risks.push(`RR ${ctx.rr1.toFixed(2)} < ${ctx.filters.minRr}`);
    long -= 8;
    short -= 8;
  }

  long = Math.max(0, Math.min(100, long));
  short = Math.max(0, Math.min(100, short));

  const strongest = [...strategies].sort((a, b) => b.score - a.score)[0];
  const scoreTotal = Math.max(long, short);
  const diff = Math.abs(long - short);

  let direction: import("../types").Direction = "WAIT";
  let label = "관망";
  if (diff < 10) {
    direction = "WAIT";
    label = "관망";
  } else if (long > short) {
    if (ctx.m15.rsi >= 73 || ctx.change15m > 5) {
      direction = "LONG_CAUTION";
      label = "조건부 롱 후보";
    } else if (scoreTotal >= 85) {
      direction = "LONG";
      label = "강한 롱 관찰 후보";
    } else if (scoreTotal >= 65) {
      direction = "LONG";
      label = "롱 관찰 후보";
    } else {
      direction = "LONG_CAUTION";
      label = "조건부 롱 후보";
    }
  } else {
    if (ctx.m15.rsi <= 27 || ctx.change15m < -5) {
      direction = "SHORT_CAUTION";
      label = "조건부 숏 후보";
    } else if (scoreTotal >= 85) {
      direction = "SHORT";
      label = "강한 숏 관찰 후보";
    } else if (scoreTotal >= 65) {
      direction = "SHORT";
      label = "숏 관찰 후보";
    } else {
      direction = "SHORT_CAUTION";
      label = "조건부 숏 후보";
    }
  }

  const stars =
    scoreTotal >= 85 ? 5 : scoreTotal >= 75 ? 4 : scoreTotal >= 65 ? 3 : scoreTotal >= 55 ? 2 : 1;

  const reasons = strategies
    .filter((s) => s.score >= 60 && s.notes.length)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .flatMap((s) => s.notes.map((n) => `${n} (${s.score.toFixed(0)}점)`));

  // template core reason
  reasons.unshift(
    `15m 거래량 ${ctx.m15.volMult.toFixed(1)}배·대금 ${ctx.m15.turnoverMult.toFixed(1)}배, RSI ${ctx.m15.rsi.toFixed(0)}, EMA ${ctx.m15.ema20 > ctx.m15.ema50 ? "상승정렬" : ctx.m15.ema20 < ctx.m15.ema50 ? "하락정렬" : "혼조"}`
  );

  return {
    scoreLong: Number(long.toFixed(1)),
    scoreShort: Number(short.toFixed(1)),
    scoreTotal: Number(scoreTotal.toFixed(1)),
    strongest: strongest?.id ?? null,
    reasons,
    risks,
    direction,
    label,
    stars,
  };
}
