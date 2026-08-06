import type { ScreenerCandidate } from "./types";

/** 메모/즐찾/가상투자에 저장하는 당시 상태 */
export function candidateSnapshot(c: ScreenerCandidate) {
  return {
    price: c.price,
    direction: c.direction,
    label: c.label,
    stars: c.stars,
    scoreTotal: c.scoreTotal,
    scoreLong: c.scoreLong,
    scoreShort: c.scoreShort,
    strongestStrategy: c.strongestStrategy,
    change5m: c.change5m,
    change15m: c.change15m,
    change1h: c.change1h,
    change24h: c.change24h,
    volMult: c.volMult,
    turnoverMult: c.turnoverMult,
    turnover24h: c.turnover24h,
    rsi: c.rsi,
    macdState: c.macdState,
    emaState: c.emaState,
    bbState: c.bbState,
    atr: c.atr,
    atrChange: c.atrChange,
    oiChangePct: c.oiChangePct,
    fundingRate: c.fundingRate,
    breakoutState: c.breakoutState,
    entryPrice: c.entryPrice,
    stopPrice: c.stopPrice,
    tp1: c.tp1,
    tp2: c.tp2,
    rr1: c.rr1,
    rr2: c.rr2,
    timeframe: c.timeframe,
    candleCloseTime: c.candleCloseTime,
    signalAt: c.signalAt,
    reasons: c.reasons.slice(0, 5),
    risks: c.risks.slice(0, 5),
  };
}

export type CoinSnapshot = ReturnType<typeof candidateSnapshot>;

/** 가상투자/메모 스냅샷에서 ScreenerDetail용 candidate 복원 */
export function candidateFromParts(args: {
  exchange: string;
  symbol: string;
  direction?: string;
  price?: number | null;
  entryPrice?: number | null;
  snapshot?: Record<string, unknown> | null;
}): ScreenerCandidate {
  const snap = args.snapshot ?? {};
  const num = (k: string, fallback = 0) => {
    const v = snap[k];
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  };
  const numOrNull = (k: string): number | null => {
    const v = snap[k];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const str = (k: string, fallback = "") => {
    const v = snap[k];
    return typeof v === "string" ? v : fallback;
  };
  const symbol = args.symbol.toUpperCase();
  const direction = (args.direction ||
    str("direction", "WAIT")) as ScreenerCandidate["direction"];
  const price =
    args.price ??
    numOrNull("price") ??
    args.entryPrice ??
    numOrNull("entryPrice") ??
    0;

  return {
    exchange: (args.exchange === "bybit" ? "bybit" : "binance") as ScreenerCandidate["exchange"],
    symbol,
    baseAsset: symbol.replace(/USDT$/i, ""),
    price,
    direction,
    label: str("label", direction),
    stars: num("stars", 0),
    scoreTotal: num("scoreTotal", 0),
    scoreLong: num("scoreLong", 0),
    scoreShort: num("scoreShort", 0),
    strongestStrategy: (snap.strongestStrategy as ScreenerCandidate["strongestStrategy"]) ?? null,
    strategyScores: [],
    change5m: num("change5m"),
    change15m: num("change15m"),
    change1h: num("change1h"),
    change24h: num("change24h"),
    volMult: num("volMult"),
    turnoverMult: num("turnoverMult"),
    turnover24h: num("turnover24h"),
    oiChangePct: numOrNull("oiChangePct"),
    fundingRate: numOrNull("fundingRate"),
    rsi: num("rsi"),
    macdState: str("macdState", "—"),
    emaState: str("emaState", "—"),
    bbState: str("bbState", "—"),
    atr: num("atr"),
    atrChange: num("atrChange"),
    breakoutState: str("breakoutState", "—"),
    entryPrice: args.entryPrice ?? numOrNull("entryPrice"),
    stopPrice: numOrNull("stopPrice"),
    tp1: numOrNull("tp1"),
    tp2: numOrNull("tp2"),
    rr1: numOrNull("rr1"),
    rr2: numOrNull("rr2"),
    reasons: Array.isArray(snap.reasons)
      ? (snap.reasons as string[])
      : [],
    risks: Array.isArray(snap.risks) ? (snap.risks as string[]) : [],
    candleCloseTime: num("candleCloseTime", Date.now()),
    timeframe: str("timeframe", "15m"),
    signalAt: str("signalAt", new Date().toISOString()),
    takerBuyRatio: numOrNull("takerBuyRatio"),
    support: numOrNull("support"),
    resistance: numOrNull("resistance"),
  };
}

export function retPct(
  direction: string,
  entry: number,
  priceNow: number
): number {
  if (!entry) return 0;
  const raw = ((priceNow - entry) / entry) * 100;
  return direction.startsWith("SHORT") ? -raw : raw;
}
