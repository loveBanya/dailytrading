import { createHmac } from "crypto";

export function hmacSha256(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || Number.isNaN(minutes)) return "-";
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${m}m`;
  return `${h}h${m.toString().padStart(2, "0")}m`;
}

export function formatPnl(pnl: number): string {
  const sign = pnl >= 0 ? "+" : "";
  return `${sign}$${pnl.toFixed(2)}`;
}

export function formatPrice(price: number): string {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

export function baseAssetFromSymbol(symbol: string): string {
  return symbol
    .replace(/USDT$/i, "")
    .replace(/USDC$/i, "")
    .replace(/PERP$/i, "")
    .replace(/-$/, "");
}

/** 진입/청산 가격으로 TP/SL 추정 (방향 기준) */
export function inferStatus(
  side: "LONG" | "SHORT",
  entry: number,
  exit: number,
  pnl: number
): "TP" | "SL" | "CLOSED" {
  if (Math.abs(pnl) < 0.01) return "CLOSED";
  const profitable =
    side === "LONG" ? exit > entry : exit < entry;
  return profitable || pnl > 0 ? "TP" : "SL";
}

export function durationMinutes(entry: Date, exit: Date): number {
  return Math.max(0, Math.round((exit.getTime() - entry.getTime()) / 60_000));
}
