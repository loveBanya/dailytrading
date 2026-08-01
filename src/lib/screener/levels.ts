import type { TfMetrics } from "./strategies";

export function computeLevels(
  side: "LONG" | "SHORT",
  m15: TfMetrics,
  atr: number
): {
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  rr1: number;
  rr2: number;
  support: number;
  resistance: number;
} {
  const price = m15.last.close;
  const support = m15.low20;
  const resistance = m15.high20;
  const a = atr || price * 0.01;

  if (side === "LONG") {
    const entry = Math.max(m15.ema20, support * 1.001);
    const stop = Math.min(support, entry - a * 1.2, m15.ema50);
    const risk = Math.max(price - stop, price * 0.003);
    const tp1 = price + risk * 2;
    const tp2 = Math.max(resistance, price + risk * 3);
    return {
      entry: Number(entry.toPrecision(8)),
      stop: Number(stop.toPrecision(8)),
      tp1: Number(tp1.toPrecision(8)),
      tp2: Number(tp2.toPrecision(8)),
      rr1: Number((risk > 0 ? (tp1 - price) / risk : 0).toFixed(2)),
      rr2: Number((risk > 0 ? (tp2 - price) / risk : 0).toFixed(2)),
      support,
      resistance,
    };
  }

  const entry = Math.min(m15.ema20, resistance * 0.999);
  const stop = Math.max(resistance, entry + a * 1.2, m15.ema50);
  const risk = Math.max(stop - price, price * 0.003);
  const tp1 = price - risk * 2;
  const tp2 = Math.min(support, price - risk * 3);
  return {
    entry: Number(entry.toPrecision(8)),
    stop: Number(stop.toPrecision(8)),
    tp1: Number(tp1.toPrecision(8)),
    tp2: Number(tp2.toPrecision(8)),
    rr1: Number((risk > 0 ? (price - tp1) / risk : 0).toFixed(2)),
    rr2: Number((risk > 0 ? (price - tp2) / risk : 0).toFixed(2)),
    support,
    resistance,
  };
}
