import { NextResponse } from "next/server";
import { loadAltHeat } from "@/lib/market/alt-heat";
import { withCache } from "@/lib/screener/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_KEY = "market:alt-heat:v2";
const CACHE_MS = 15 * 60 * 1000;

/** GET /api/market/alt-heat — 알트/BTC 150일 괴리율 */
export async function GET() {
  try {
    const heat = await withCache(CACHE_KEY, CACHE_MS, loadAltHeat);
    return NextResponse.json(heat);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
