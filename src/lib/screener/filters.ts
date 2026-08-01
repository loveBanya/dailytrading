import type { ScreenerExchange, UniverseTicker } from "./types";

const STABLES = new Set([
  "USDC",
  "FDUSD",
  "TUSD",
  "USDP",
  "DAI",
  "BUSD",
  "USD1",
  "USDE",
  "EUR",
  "USDT",
]);

const LEVERAGE_RE = /(UP|DOWN|BULL|BEAR|3L|3S|2L|2S|5L|5S)$/i;

export function baseFromSymbol(symbol: string): string {
  return symbol.replace(/USDT$/i, "").toUpperCase();
}

export function isExcludedBase(base: string): boolean {
  if (STABLES.has(base)) return true;
  if (LEVERAGE_RE.test(base)) return true;
  return false;
}

export function filterUniverse(
  tickers: UniverseTicker[],
  minTurnover24h: number
): UniverseTicker[] {
  return tickers
    .filter((t) => t.symbol.endsWith("USDT"))
    .filter((t) => !isExcludedBase(t.baseAsset))
    .filter((t) => t.turnover24h >= minTurnover24h)
    .filter((t) => t.lastPrice > 0)
    .sort((a, b) => b.turnover24h - a.turnover24h);
}

export function takeTop(
  tickers: UniverseTicker[],
  n: number
): UniverseTicker[] {
  return tickers.slice(0, Math.max(1, Math.min(n, 200)));
}

export function exchangeLabel(ex: ScreenerExchange): string {
  return ex === "binance" ? "바이낸스" : "바이비트";
}
