import { NextRequest, NextResponse } from "next/server";
import { fetchInvestorHistory, type FlowMarket } from "@/lib/market/investor-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/market/investor-history?market=KOSPI&days=120 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const market: FlowMarket = sp.get("market") === "KOSDAQ" ? "KOSDAQ" : "KOSPI";
    const days = Number(sp.get("days")) || 120;
    const rows = await fetchInvestorHistory(market, days);
    return NextResponse.json({ market, rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
