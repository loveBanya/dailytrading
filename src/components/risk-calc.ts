import type { MarketTicker } from "@/lib/exchanges/market";

export type Side = "long" | "short";

export interface SavedInputs {
  equity: string;
  riskPct: string;
  entry: string;
  stop: string;
  leverage: string;
  feePct: string;
  rewardR: string;
  side: Side;
  coin: string;
  qtyUnit: string;
  customEntry: string;
  customStop: string;
  customQtyUnit: string;
}

export const RISK_STORAGE_KEY = "dailytrading.riskcalc.v1";

export const RISK_DEFAULTS: SavedInputs = {
  equity: "1000",
  riskPct: "3",
  entry: "",
  stop: "",
  leverage: "10",
  feePct: "0.055",
  rewardR: "2",
  side: "long",
  coin: "",
  qtyUnit: "",
  customEntry: "",
  customStop: "",
  customQtyUnit: "",
};

export type CustomQuote = { entry: string; stop: string; qtyUnit: string };

export const COIN_STEP: Record<string, string> = {
  BTC: "0.001",
  ETH: "0.01",
  XRP: "0.1",
  SOXL: "0.01",
  KORU: "0.01",
};

export const QTY_UNIT_PRESETS = ["0.001", "0.01", "0.1", "1"] as const;

export const COIN_SHORTCUTS = [
  ["BTCUSDT", "비트", "BTC"],
  ["ETHUSDT", "이더", "ETH"],
  ["XRPUSDT", "리플", "XRP"],
  ["SOXLUSDT", "SOXL", "SOXL"],
  ["KORUUSDT", "KORU", "KORU"],
] as const;

export function qtyFmt(n: number, step?: number): string {
  if (step && step > 0) {
    const decimals = (String(step).split(".")[1] ?? "").length;
    return n.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  const digits = n >= 1000 ? 2 : n >= 1 ? 4 : 6;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function floorToStep(qty: number, step: number): number {
  if (!(step > 0)) return qty;
  const decimals = (String(step).split(".")[1] ?? "").length;
  const units = Math.floor(qty / step + 1e-8);
  return Number((units * step).toFixed(decimals));
}

export function money(n: number, digits = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function priceFmt(n: number): string {
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function won(usdtAmt: number, fx: number): string {
  return `₩${Math.round(usdtAmt * fx).toLocaleString("ko-KR")}`;
}

export function ratioLabel(rewardPerRisk: number): string {
  if (!Number.isFinite(rewardPerRisk) || rewardPerRisk <= 0) return "—";
  const rounded =
    rewardPerRisk >= 10
      ? rewardPerRisk.toFixed(1)
      : rewardPerRisk.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `1 : ${rounded}`;
}

export interface RiskResult {
  riskAmount: number;
  margin: number;
  betPct: number;
  notional: number;
  qty: number;
  rawQty: number;
  qtyStep: number;
  minOrderQty: number;
  lotApplied: boolean;
  belowMin: boolean;
  roundTripFee: number;
  stopPrice: number;
  stopPct: number;
  tpPrice: number;
  tpPct: number;
  netLoss: number;
  netProfit: number;
  netRatio: number;
  liqPrice: number;
  stopBeyondLiq: boolean;
  tpInvalid: boolean;
  wrongSide: boolean;
}

export function computeRisk(input: {
  equity: string;
  riskPct: string;
  entry: string;
  stop: string;
  leverage: string;
  feePct: string;
  rewardR: string;
  side: Side;
  qtyUnit: string;
}): RiskResult | null {
  const eq = Number(input.equity);
  const risk = Number(input.riskPct);
  const px = Number(input.entry);
  const stopPx = Number(input.stop);
  const lev = Number(input.leverage);
  const fee = Number(input.feePct);
  const rr = Number(input.rewardR);

  if (
    !(eq > 0) ||
    !(risk > 0) ||
    !(px > 0) ||
    !(stopPx > 0) ||
    !(lev >= 1) ||
    !(fee >= 0) ||
    !(rr > 0)
  ) {
    return null;
  }

  const riskAmount = eq * (risk / 100);
  const distance = Math.abs(px - stopPx);
  const wrongSide = input.side === "long" ? stopPx >= px : stopPx <= px;
  const feeRate = fee / 100;
  const lossPerUnit = distance + px * feeRate * 2;
  const rawQty = lossPerUnit > 0 ? riskAmount / lossPerUnit : 0;
  const qtyStep = Number(input.qtyUnit);
  const lotApplied = qtyStep > 0;
  const minOrderQty = lotApplied ? qtyStep : 0;
  const steppedQty = lotApplied ? floorToStep(rawQty, qtyStep) : rawQty;
  const belowMin = lotApplied && steppedQty < minOrderQty;
  const qty = belowMin ? rawQty : steppedQty;
  const notional = qty * px;
  const roundTripFee = notional * feeRate * 2;
  const margin = notional / lev;
  const betPct = eq > 0 ? (margin / eq) * 100 : 0;
  const stopPct = px > 0 ? (distance / px) * 100 : 0;
  const tpDistance = distance * rr;
  const tpPrice = input.side === "long" ? px + tpDistance : px - tpDistance;
  const tpPct = px > 0 ? (tpDistance / px) * 100 : 0;
  const netLoss = qty * distance + roundTripFee;
  const netProfit = qty * tpDistance - roundTripFee;
  const netRatio = netLoss > 0 ? netProfit / netLoss : 0;
  const liqPrice =
    input.side === "long" ? px * (1 - 1 / lev) : px * (1 + 1 / lev);
  const stopBeyondLiq =
    !wrongSide &&
    (input.side === "long" ? stopPx <= liqPrice : stopPx >= liqPrice);
  const tpInvalid = input.side === "short" && tpPrice <= 0;

  return {
    riskAmount,
    margin,
    betPct,
    notional,
    qty,
    rawQty,
    qtyStep,
    minOrderQty,
    lotApplied,
    belowMin,
    roundTripFee,
    stopPrice: stopPx,
    stopPct,
    tpPrice,
    tpPct,
    netLoss,
    netProfit,
    netRatio,
    liqPrice,
    stopBeyondLiq,
    tpInvalid,
    wrongSide,
  };
}

export function quoteFromTicker(
  current: {
    coin: string;
    entry: string;
    stop: string;
    qtyUnit: string;
  },
  ticker: MarketTicker
): { entry: string; coin: string; qtyUnit: string; customQuote?: CustomQuote } {
  const base = ticker.symbol.replace(/USDT$/i, "");
  const customQuote = !COIN_STEP[current.coin]
    ? { entry: current.entry, stop: current.stop, qtyUnit: current.qtyUnit }
    : undefined;
  const step =
    ticker.qtyStep && ticker.qtyStep > 0
      ? String(ticker.qtyStep)
      : COIN_STEP[base];
  return {
    entry: ticker.lastPrice.toFixed(2),
    coin: base,
    qtyUnit: step ?? current.qtyUnit,
    customQuote,
  };
}
