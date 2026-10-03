import { NextResponse } from "next/server";
import {
  fetchMarketOverview,
  fetchMarketTickers,
  searchMarketTickers,
} from "@/lib/exchanges/market";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["sin1", "hnd1", "icn1"];

/** GET /api/market — 주요 심볼 시세 + Fear & Greed. ?symbols=SOLUSDT,DOGEUSDT 면 그 심볼만 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q");
    if (q != null && q.trim()) {
      const tickers = await searchMarketTickers(q.slice(0, 20), 8);
      return NextResponse.json({ tickers });
    }
    const raw = url.searchParams.get("symbols");
    if (raw) {
      const symbols = [
        ...new Set(
          raw
            .split(",")
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean)
        ),
      ].slice(0, 24);
      const tickers = await fetchMarketTickers(symbols);
      return NextResponse.json({ tickers });
    }
    const market = await fetchMarketOverview();
    return NextResponse.json(market);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
