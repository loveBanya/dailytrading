import { NextResponse } from "next/server";
import { fetchUsdtKrw } from "@/lib/fx/usdt-krw";
import { withCache } from "@/lib/screener/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_KEY = "fx:usdt-krw";
const CACHE_MS = 10 * 60 * 1000;

/** GET /api/fx — 1 USDT당 원화. 업비트 KRW-USDT, 10분 캐시 */
export async function GET() {
  try {
    const quote = await withCache(CACHE_KEY, CACHE_MS, fetchUsdtKrw);
    return NextResponse.json(quote);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
