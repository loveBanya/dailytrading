import { NextResponse } from "next/server";
import { fetchMarketOverview } from "@/lib/exchanges/market";
import { EXCHANGE_API_REGIONS } from "@/lib/exchanges/regions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = [...EXCHANGE_API_REGIONS];

/** GET /api/market — 주요 심볼 시세 + Fear & Greed */
export async function GET() {
  try {
    const market = await fetchMarketOverview();
    return NextResponse.json(market);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
