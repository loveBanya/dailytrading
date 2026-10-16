export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Overlay {
  name: string;
  color: string;
  values: (number | null)[];
}

export interface BacktestTrade {
  side: 1 | -1;
  entryTime: number;
  exitTime: number | null;
  entry: number;
  exit: number | null;
  sl: number;
  tp: number;
  reason: string;
  exitReason: string;
  r: number | null;
  usd: number | null;
  /** true 승, false 패, null 본절이거나 아직 안 끝남 */
  win: boolean | null;
}

export interface Money {
  bet: number;
  lev: number;
  /** 편도 수수료 %. 진입·청산 각 한 번. */
  feePct: number;
}

export interface BacktestOutput {
  trades: BacktestTrade[];
  overlays: Overlay[];
  note: string;
}

export function toBars(
  candles: {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }[]
): Bar[] {
  return candles.map((candle) => ({
    time: candle.time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume ?? 0,
  }));
}

/** 가격 변동을 증거금 대비 달러로. 손실은 증거금에서 멈추고, 그다음 왕복 수수료를 뺍니다. */
export function dollarMove(
  entry: number,
  exit: number,
  side: 1 | -1,
  money: Money
): number {
  if (!(entry > 0)) return 0;
  const move =
    side === 1 ? (exit - entry) / entry : (entry - exit) / entry;
  const gross = Math.max(money.bet * money.lev * move, -money.bet);
  const fee = money.bet * money.lev * (money.feePct / 100) * 2;
  return gross - fee;
}
