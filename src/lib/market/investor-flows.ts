import { withCache } from "@/lib/screener/cache";
import { fetchQuote } from "./stocks";

const NAVER = "https://m.stock.naver.com/api";

const HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "application/json",
};

/** 순매수. 시장 전체는 억원, 종목은 주식 수와 종가로 바꾼 억원 */
export interface FlowRow {
  date: string;
  personal: number;
  foreign: number;
  institution: number;
}

export interface MarketFlow extends FlowRow {
  market: "코스피" | "코스닥";
}

export interface StockFlow {
  code: string;
  name: string;
  rows: (FlowRow & { close: number; foreignHold: string })[];
}

/** 정규장 가격과 넥스트레이드 프리·애프터마켓 가격 */
export interface KrStockQuote {
  code: string;
  name: string;
  price: number;
  changePct: number;
  open: boolean;
  over: {
    session: "프리마켓" | "애프터마켓";
    price: number;
    changePct: number;
    open: boolean;
    time: string;
  } | null;
}

const STOCKS = [
  { code: "005930", name: "삼성전자" },
  { code: "000660", name: "SK하이닉스" },
];

function num(value: unknown): number {
  const n = Number(String(value ?? "").replace(/[,+%]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function day(bizdate: string): string {
  return `${bizdate.slice(0, 4)}-${bizdate.slice(4, 6)}-${bizdate.slice(6, 8)}`;
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${NAVER}${path}`, { headers: HEADERS, cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function marketFlow(market: "KOSPI" | "KOSDAQ"): Promise<MarketFlow | null> {
  const data = await getJson<{
    bizdate?: string;
    personalValue?: string;
    foreignValue?: string;
    institutionalValue?: string;
  }>(`/index/${market}/trend`);
  if (!data?.bizdate) return null;
  return {
    market: market === "KOSPI" ? "코스피" : "코스닥",
    date: day(data.bizdate),
    personal: num(data.personalValue),
    foreign: num(data.foreignValue),
    institution: num(data.institutionalValue),
  };
}

async function stockFlow(code: string, name: string): Promise<StockFlow | null> {
  const data = await getJson<
    Array<{
      bizdate?: string;
      foreignerPureBuyQuant?: string;
      organPureBuyQuant?: string;
      individualPureBuyQuant?: string;
      foreignerHoldRatio?: string;
      closePrice?: string;
    }>
  >(`/stock/${code}/trend`);
  if (!Array.isArray(data)) return null;
  const rows = data
    .filter((row) => row.bizdate)
    .slice(0, 5)
    .map((row) => {
      const close = num(row.closePrice);
      const toEok = (qty: unknown) => (num(qty) * close) / 1e8;
      return {
        date: day(row.bizdate!),
        personal: toEok(row.individualPureBuyQuant),
        foreign: toEok(row.foreignerPureBuyQuant),
        institution: toEok(row.organPureBuyQuant),
        close,
        foreignHold: row.foreignerHoldRatio ?? "",
      };
    });
  return { code, name, rows };
}

/**
 * 정규장은 KRX 종가(야후 .KS), 프리·애프터는 네이버 넥스트레이드 값.
 * 장 밖에서는 네이버 closePrice 가 넥스트레이드 최신가라 정규장 값으로 쓰면 안 된다.
 */
async function krQuote(code: string, name: string): Promise<KrStockQuote | null> {
  const [krx, data] = await Promise.all([
    fetchQuote(`${code}.KS`, name),
    getJson<{
      marketSessionType?: string;
      overMarketPriceInfo?: {
      tradingSessionType?: string;
      overMarketStatus?: string;
        overPrice?: string;
        fluctuationsRatio?: string;
        localTradedAt?: string;
      } | null;
    }>(`/stock/${code}/basic`),
  ]);
  if (!krx) return null;
  const o = data?.overMarketPriceInfo;
  const session =
    o?.tradingSessionType === "PRE_MARKET"
      ? "프리마켓"
      : o?.tradingSessionType === "AFTER_MARKET"
        ? "애프터마켓"
        : null;
  return {
    code,
    name,
    price: Math.round(krx.price),
    changePct: krx.changePct,
    open: data?.marketSessionType === "regularMarket",
    over:
      o && session && o.overPrice
        ? {
            session,
            price: num(o.overPrice),
            changePct: num(o.fluctuationsRatio),
            open: o.overMarketStatus === "OPEN",
            time: o.localTradedAt ?? "",
          }
        : null,
  };
}

export async function fetchInvestorFlows(): Promise<{
  markets: MarketFlow[];
  stocks: StockFlow[];
  quotes: KrStockQuote[];
}> {
  return withCache("market:investor-flows:v3", 60_000, async () => {
    const [kospi, kosdaq, ...rest] = await Promise.all([
      marketFlow("KOSPI"),
      marketFlow("KOSDAQ"),
      ...STOCKS.map((s) => stockFlow(s.code, s.name)),
      ...STOCKS.map((s) => krQuote(s.code, s.name)),
    ]);
    const stocks = rest.slice(0, STOCKS.length) as (StockFlow | null)[];
    const quotes = rest.slice(STOCKS.length) as (KrStockQuote | null)[];
    return {
      markets: [kospi, kosdaq].filter((m): m is MarketFlow => m != null),
      stocks: stocks.filter((s): s is StockFlow => s != null),
      quotes: quotes.filter((q): q is KrStockQuote => q != null),
    };
  });
}
