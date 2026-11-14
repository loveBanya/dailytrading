import { withCache } from "@/lib/screener/cache";

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";

const HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "application/json",
};

export interface DailyBar {
  /** 그 거래소 현지 날짜 YYYY-MM-DD */
  date: string;
  close: number;
}

export interface StockQuote {
  symbol: string;
  label: string;
  price: number;
  prevClose: number;
  changePct: number;
  /** 마지막 시세 시각 (ms) */
  time: number;
  currency: string;
  bars: DailyBar[];
}

export const MARKET_STOCKS: { symbol: string; label: string }[] = [
  { symbol: "^KS11", label: "코스피" },
  { symbol: "SOXL", label: "SOXL 반도체 3배" },
  { symbol: "SOXX", label: "SOXX 반도체" },
  { symbol: "SOXS", label: "SOXS 반도체 3배 숏" },
  { symbol: "EWY", label: "EWY 한국" },
  { symbol: "^IXIC", label: "나스닥" },
  { symbol: "NQ=F", label: "나스닥 선물" },
  { symbol: "KRW=X", label: "달러/원" },
];

interface YahooChart {
  chart: {
    result?: Array<{
      meta: {
        symbol: string;
        regularMarketPrice?: number;
        regularMarketTime?: number;
        currency?: string;
        exchangeTimezoneName?: string;
      };
      timestamp?: number[];
      indicators: { quote: Array<{ close: Array<number | null> }> };
    }>;
    error?: { description?: string } | null;
  };
}

export async function fetchQuote(symbol: string, label: string): Promise<StockQuote | null> {
  return withCache(`market:stock:v2:${symbol}`, 60_000, async () => {
    try {
      const url = `${YAHOO_CHART}/${encodeURIComponent(symbol)}?interval=1d&range=10d`;
      const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
      if (!res.ok) return null;
      const data = (await res.json()) as YahooChart;
      const result = data.chart.result?.[0];
      if (!result) return null;
      const zone = result.meta.exchangeTimezoneName || "UTC";
      const stamps = result.timestamp ?? [];
      const raw = result.indicators.quote[0]?.close ?? [];
      const bars: DailyBar[] = [];
      stamps.forEach((sec, i) => {
        const close = raw[i];
        if (close == null || !Number.isFinite(close)) return;
        const date = new Date(sec * 1000).toLocaleDateString("en-CA", { timeZone: zone });
        const last = bars[bars.length - 1];
        if (last && last.date === date) last.close = close;
        else bars.push({ date, close });
      });
      const price = result.meta.regularMarketPrice ?? bars[bars.length - 1]?.close ?? 0;
      // chartPreviousClose 는 조회 구간 앞의 값이라 전일 종가가 아니다
      const prevClose = bars.length >= 2 ? bars[bars.length - 2]!.close : price;
      if (!(price > 0) || !(prevClose > 0)) return null;
      return {
        symbol,
        label,
        price,
        prevClose,
        changePct: (price / prevClose - 1) * 100,
        time: (result.meta.regularMarketTime ?? 0) * 1000,
        currency: result.meta.currency ?? "",
        bars,
      };
    } catch {
      return null;
    }
  });
}

export async function fetchMarketStocks(): Promise<StockQuote[]> {
  const rows = await Promise.all(
    MARKET_STOCKS.map((s) => fetchQuote(s.symbol, s.label))
  );
  return rows.filter((q): q is StockQuote => q != null);
}

export interface OutlookFactor {
  label: string;
  changePct: number;
  /** 코스피에 주는 방향. +는 상승 쪽 */
  push: number;
  note: string;
  /** 보여 주기만 하고 점수에는 넣지 않는 줄 */
  reference?: boolean;
}

export type OutlookVerdict = "상승 우위" | "약한 상승" | "보합" | "약한 하락" | "하락 우위";

export interface KospiOutlook {
  score: number;
  verdict: OutlookVerdict;
  factors: OutlookFactor[];
  /** 미국장(EWY) 기준 날짜. 이 밤 뒤에 열리는 코스피 장을 본다 */
  usDate: string | null;
  /** 판단 대상 코스피 장이 이미 열렸으면 그 날짜와 등락 */
  target: { date: string; changePct: number; live: boolean } | null;
}

function changeOn(bars: DailyBar[], date: string): number | null {
  const i = bars.findIndex((b) => b.date === date);
  if (i <= 0) return null;
  return (bars[i]!.close / bars[i - 1]!.close - 1) * 100;
}

function verdictOf(score: number): OutlookVerdict {
  if (score >= 0.8) return "상승 우위";
  if (score >= 0.25) return "약한 상승";
  if (score > -0.25) return "보합";
  if (score > -0.8) return "약한 하락";
  return "하락 우위";
}

/**
 * 밤사이 미국장과 환율로 본 코스피 다음 장 방향 참고값.
 * EWY 등락에는 같은 날 코스피 등락이 이미 들어 있어서 그 몫을 빼고 밤사이 몫만 쓴다.
 */
export function kospiOutlook(quotes: StockQuote[], now = Date.now()): KospiOutlook {
  const by = new Map(quotes.map((q) => [q.symbol, q]));
  const kospi = by.get("^KS11");
  const ewy = by.get("EWY");
  const usDate = ewy?.bars[ewy.bars.length - 1]?.date ?? null;
  const factors: OutlookFactor[] = [];

  if (ewy && kospi && usDate) {
    const ewyDay = changeOn(ewy.bars, usDate) ?? ewy.changePct;
    const kospiSameDay = changeOn(kospi.bars, usDate) ?? 0;
    const gap = ewyDay - kospiSameDay;
    factors.push({
      label: "EWY 밤사이 몫",
      changePct: gap,
      push: gap * 0.5,
      note: `EWY ${ewyDay >= 0 ? "+" : ""}${ewyDay.toFixed(2)}%에서 같은 날 코스피 ${
        kospiSameDay >= 0 ? "+" : ""
      }${kospiSameDay.toFixed(2)}%를 뺀 값`,
    });
  }
  const add = (symbol: string, weight: number, label: string, note: string) => {
    const q = by.get(symbol);
    if (!q) return;
    const change = usDate ? (changeOn(q.bars, usDate) ?? q.changePct) : q.changePct;
    factors.push({ label, changePct: change, push: change * weight, note });
  };
  const reference = (symbol: string, label: string, note: string) => {
    const q = by.get(symbol);
    if (!q) return;
    const change = usDate ? (changeOn(q.bars, usDate) ?? q.changePct) : q.changePct;
    factors.push({ label, changePct: change, push: 0, note, reference: true });
  };
  add("SOXX", 0.25, "SOXX 반도체", "삼성전자·SK하이닉스와 같이 움직이는 편");
  reference("SOXL", "SOXL 반도체 3배", "SOXX 3배라 점수엔 SOXX만 넣음");
  reference("SOXS", "SOXS 반도체 3배 숏", "SOXX 반대 3배. 오르면 반도체 약세");
  add("^IXIC", 0.1, "나스닥", "위험자산 분위기");
  const nq = by.get("NQ=F");
  if (nq) {
    factors.push({
      label: "나스닥 선물 (지금)",
      changePct: nq.changePct,
      push: nq.changePct * 0.15,
      note: "미국장 마감 뒤 움직임",
    });
  }
  const fx = by.get("KRW=X");
  if (fx) {
    factors.push({
      label: "달러/원",
      changePct: fx.changePct,
      push: fx.changePct * -0.4,
      note: "원화 약세면 외국인 매도 쪽",
    });
  }

  const score = factors.reduce((s, f) => s + f.push, 0);

  let target: KospiOutlook["target"] = null;
  if (kospi && usDate) {
    const after = kospi.bars.find((b) => b.date > usDate);
    if (after) {
      const change = changeOn(kospi.bars, after.date);
      if (change != null) {
        target = {
          date: after.date,
          changePct: change,
          live: now - kospi.time < 30 * 60 * 1000,
        };
      }
    }
  }

  return { score, verdict: verdictOf(score), factors, usDate, target };
}
