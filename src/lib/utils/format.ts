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

/** 진입/청산 가격 + PnL로 TP/SL 추정 */
export function inferStatus(
  side: "LONG" | "SHORT",
  entry: number,
  exit: number,
  pnl: number
): "TP" | "SL" | "CLOSED" {
  if (Math.abs(pnl) < 0.01) return "CLOSED";
  // 수수료 때문에 가격 방향과 PnL이 어긋날 수 있음 → PnL 우선
  return pnl > 0 ? "TP" : "SL";
}

export function durationMinutes(entry: Date, exit: Date): number {
  return Math.max(0, Math.round((exit.getTime() - entry.getTime()) / 60_000));
}

export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** 한국 시간(Asia/Seoul) 표시 */
export function formatKst(
  value: string | number | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...options,
  });
}

