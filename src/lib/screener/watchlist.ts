import type { ScreenerExchange, WatchAsset } from "./types";

export function watchAssetId(
  exchange: ScreenerExchange,
  symbol: string
): string {
  return `${exchange}:${symbol.toUpperCase()}`;
}

export function makeWatchAsset(
  exchange: ScreenerExchange,
  symbol: string,
  label: string
): WatchAsset {
  const sym = symbol.trim().toUpperCase();
  return {
    id: watchAssetId(exchange, sym),
    exchange,
    symbol: sym === "^KS11" ? "^KS11" : sym, // keep caret for KOSPI
    label: label.trim() || sym,
  };
}

/** 심볼 대소문자 / 캐럿 정규화 */
export function normalizeWatchSymbol(
  exchange: ScreenerExchange,
  raw: string
): string {
  const t = raw.trim();
  if (exchange === "yahoo") {
    if (t.toUpperCase() === "KOSPI" || t === "코스피") return "^KS11";
    if (t.toUpperCase() === "^KS11") return "^KS11";
    return t.toUpperCase();
  }
  const u = t.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!u) return "";
  return u.endsWith("USDT") ? u : `${u}USDT`;
}

export const DEFAULT_WATCH_ASSETS: WatchAsset[] = [
  makeWatchAsset("binance", "BTCUSDT", "비트코인"),
  makeWatchAsset("binance", "ETHUSDT", "이더리움"),
  makeWatchAsset("binance", "SOLUSDT", "솔라나"),
  {
    id: "yahoo:^KS11",
    exchange: "yahoo",
    symbol: "^KS11",
    label: "코스피",
  },
  makeWatchAsset("yahoo", "KORU", "코루 (KORU)"),
  makeWatchAsset("yahoo", "EWY", "EWY"),
];

/** 검색 별칭 → 종목 */
export const WATCH_ALIASES: Array<{
  keys: string[];
  asset: WatchAsset;
}> = [
  {
    keys: ["btc", "bitcoin", "비트", "비트코인"],
    asset: DEFAULT_WATCH_ASSETS[0]!,
  },
  {
    keys: ["eth", "ethereum", "이더", "이더리움"],
    asset: DEFAULT_WATCH_ASSETS[1]!,
  },
  {
    keys: ["sol", "solana", "솔", "솔라나"],
    asset: DEFAULT_WATCH_ASSETS[2]!,
  },
  {
    keys: ["kospi", "코스피", "ks11", "^ks11"],
    asset: DEFAULT_WATCH_ASSETS[3]!,
  },
  {
    keys: ["koru", "코루"],
    asset: DEFAULT_WATCH_ASSETS[4]!,
  },
  {
    keys: ["ewy"],
    asset: DEFAULT_WATCH_ASSETS[5]!,
  },
];
