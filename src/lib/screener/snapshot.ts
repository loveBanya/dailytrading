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

export function retPct(
  direction: string,
  entry: number,
  priceNow: number
): number {
  if (!entry) return 0;
  const raw = ((priceNow - entry) / entry) * 100;
  return direction.startsWith("SHORT") ? -raw : raw;
}
