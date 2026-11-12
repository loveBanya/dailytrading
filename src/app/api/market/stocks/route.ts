import { NextResponse } from "next/server";
import { fetchInvestorFlows } from "@/lib/market/investor-flows";
import { fetchMarketStocks, kospiOutlook } from "@/lib/market/stocks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/market/stocks — 코스피·SOXX 등 시세, 코스피 방향 참고, 투자자별 순매수 */
export async function GET() {
  try {
    const [quotes, flows] = await Promise.all([
      fetchMarketStocks(),
      fetchInvestorFlows().catch(() => null),
    ]);
    return NextResponse.json({ quotes, outlook: kospiOutlook(quotes), flows });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
