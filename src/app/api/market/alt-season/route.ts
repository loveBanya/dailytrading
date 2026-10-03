import { NextResponse } from "next/server";
import { loadAltSeason } from "@/lib/market/alt-season";
import { withCache } from "@/lib/screener/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_KEY = "market:alt-season:v1";
const CACHE_MS = 15 * 60 * 1000;

/** GET /api/market/alt-season — 알트코인 시즌 지수 */
export async function GET() {
  try {
    const season = await withCache(CACHE_KEY, CACHE_MS, loadAltSeason);
    return NextResponse.json(season);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
