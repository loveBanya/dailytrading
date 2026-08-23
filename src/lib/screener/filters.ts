import type {
  AssetKind,
  ScreenerExchange,
  UniverseTicker,
} from "./types";

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

/** 토큰화 주식 표시용 라벨 */
const STOCK_LABELS: Record<string, string> = {
  TSLA: "테슬라",
  AAPL: "애플",
  NVDA: "엔비디아",
  AMZN: "아마존",
  META: "메타",
  GOOGL: "구글",
  MSFT: "마이크로소프트",
  MSTR: "마이크로스트래티지",
  COIN: "코인베이스",
  NFLX: "넷플릭스",
  BABA: "알리바바",
  TSM: "TSMC",
  SAMSUNG: "삼성전자",
  SAMSUNGEM: "삼성전자(우선)",
  SKHYNIX: "SK하이닉스",
  SKHY: "SK하이닉스",
  AMDSTOCK: "AMD",
  AMD: "AMD",
  HOOD: "로빈후드",
  PLTR: "팔란티어",
  INTC: "인텔",
  XAU: "금",
  XAG: "은",
  SPY: "S&P500 ETF",
  QQQ: "나스닥100 ETF",
  QQQQ: "나스닥100 ETF",
  IWM: "러셀2000 ETF",
  SOXX: "반도체 ETF",
  SMH: "반도체 ETF",
  GDX: "금광 ETF",
  EWY: "한국 ETF",
  APPSTOCK: "AppLovin",
  CATSTOCK: "Caterpillar",
  GMESTOCK: "GameStop",
  VRTXSTOCK: "Vertex",
};

export function baseFromSymbol(symbol: string): string {
  return symbol.replace(/USDT$/i, "").toUpperCase();
}

export function isExcludedBase(base: string): boolean {
  if (STABLES.has(base)) return true;
  if (LEVERAGE_RE.test(base)) return true;
  return false;
}

export function stockDisplayName(base: string): string | null {
  const b = base.toUpperCase();
  if (STOCK_LABELS[b]) return STOCK_LABELS[b];
  if (b.endsWith("STOCK") && STOCK_LABELS[b]) return STOCK_LABELS[b];
  return null;
}

export function tickerLabel(t: {
  baseAsset: string;
  assetKind?: AssetKind;
  symbol: string;
}): string {
  const name = stockDisplayName(t.baseAsset);
  if (t.assetKind === "stock" || name) {
    return name ? `${name} · ${t.baseAsset}` : t.baseAsset;
  }
  return t.baseAsset;
}

/** 토큰화 주식은 거래대금이 코인보다 작아 별도 하한 */
export const STOCK_MIN_TURNOVER_24H = 100_000;

export function filterUniverse(
  tickers: UniverseTicker[],
  minTurnover24h: number,
  assetKind: AssetKind | "all" = "all"
): UniverseTicker[] {
  const stockFloor = Math.min(minTurnover24h, STOCK_MIN_TURNOVER_24H);

  return tickers
    .filter((t) => t.symbol.endsWith("USDT"))
    .filter((t) => !isExcludedBase(t.baseAsset))
    .filter((t) => t.lastPrice > 0)
    .filter((t) => {
      const kind = t.assetKind ?? "crypto";
      if (assetKind === "crypto" && kind !== "crypto") return false;
      if (assetKind === "stock" && kind !== "stock") return false;
      const floor = kind === "stock" ? stockFloor : minTurnover24h;
      return t.turnover24h >= floor;
    })
    .sort((a, b) => b.turnover24h - a.turnover24h);
}

/**
 * 코인 topN + 토큰화주식(한도 내)을 합쳐 분석 대상 구성.
 * 코인만 거래대금으로 상위가 가득 차 주식이 밀리지 않게 함.
 */
export function takeScanUniverse(
  tickers: UniverseTicker[],
  topN: number,
  assetKind: AssetKind | "all" = "all"
): UniverseTicker[] {
  const crypto = tickers.filter((t) => (t.assetKind ?? "crypto") === "crypto");
  const stocks = tickers.filter((t) => t.assetKind === "stock");

  if (assetKind === "stock") {
    return stocks.slice(0, Math.max(1, Math.min(topN, 120)));
  }
  if (assetKind === "crypto") {
    return crypto.slice(0, Math.max(1, Math.min(topN, 200)));
  }

  const cryptoN = Math.max(1, Math.min(topN, 200));
  const stockN = Math.min(80, stocks.length);
  const pickedCrypto = crypto.slice(0, cryptoN);
  const pickedStocks = stocks.slice(0, stockN);
  const seen = new Set(pickedCrypto.map((t) => `${t.exchange}:${t.symbol}`));
  const merged = [...pickedCrypto];
  for (const s of pickedStocks) {
    const key = `${s.exchange}:${s.symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(s);
  }
  return merged;
}

/** @deprecated use takeScanUniverse */
export function takeTop(
  tickers: UniverseTicker[],
  n: number
): UniverseTicker[] {
  return tickers.slice(0, Math.max(1, Math.min(n, 200)));
}

export function exchangeLabel(ex: ScreenerExchange): string {
  if (ex === "binance") return "바이낸스";
  if (ex === "bybit") return "바이비트";
  if (ex === "yahoo") return "주식/ETF";
  return ex;
}

export function assetKindLabel(kind: AssetKind | "all"): string {
  if (kind === "stock") return "주식·TradFi";
  if (kind === "crypto") return "코인";
  return "전체";
}
