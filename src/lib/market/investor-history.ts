import { withCache } from "@/lib/screener/cache";

const DAUM_DAYS = "https://finance.daum.net/api/market_index/days";

const HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "application/json",
  Referer: "https://finance.daum.net/domestic/kospi",
};

export type FlowMarket = "KOSPI" | "KOSDAQ";

/** 날짜별 지수 종가와 투자자별 순매수(억원) */
export interface InvestorDay {
  date: string;
  close: number;
  changePct: number;
  personal: number;
  foreign: number;
  institution: number;
}

interface DaumDay {
  date?: string;
  tradePrice?: number;
  changePrice?: number;
  individualStraightPurchasePrice?: number;
  foreignStraightPurchasePrice?: number;
  institutionStraightPurchasePrice?: number;
}

async function fetchPage(market: FlowMarket, page: number): Promise<DaumDay[]> {
  const qs = new URLSearchParams({
    page: String(page),
    perPage: "100",
    market,
    pagination: "true",
  });
  const res = await fetch(`${DAUM_DAYS}?${qs.toString()}`, {
    headers: HEADERS,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`투자자 기록 HTTP ${res.status}`);
  const data = (await res.json()) as { data?: DaumDay[] };
  return data.data ?? [];
}

export async function fetchInvestorHistory(
  market: FlowMarket,
  days: number
): Promise<InvestorDay[]> {
  const want = Math.max(20, Math.min(500, Math.round(days)));
  return withCache(`market:investor-history:${market}:${want}`, 10 * 60 * 1000, async () => {
    const rows: DaumDay[] = [];
    for (let page = 1; rows.length < want && page <= 5; page += 1) {
      const chunk = await fetchPage(market, page);
      if (chunk.length === 0) break;
      rows.push(...chunk);
    }
    return rows
      .slice(0, want)
      .filter((r) => r.date && Number.isFinite(r.tradePrice))
      .map((r) => {
        const close = Number(r.tradePrice);
        const change = Number(r.changePrice) || 0;
        const prev = close - change;
        return {
          date: r.date!.slice(0, 10),
          close,
          changePct: prev > 0 ? (change / prev) * 100 : 0,
          personal: (Number(r.individualStraightPurchasePrice) || 0) / 1e8,
          foreign: (Number(r.foreignStraightPurchasePrice) || 0) / 1e8,
          institution: (Number(r.institutionStraightPurchasePrice) || 0) / 1e8,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  });
}
