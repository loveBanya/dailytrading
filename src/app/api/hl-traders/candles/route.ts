import { NextRequest, NextResponse } from "next/server";
import { fetchCandles, type HlCandle } from "@/lib/hyperliquid/client";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERVALS = new Set(["5m", "15m", "1h", "4h"]);
const CACHE_MS = 30_000;
const cache = new Map<string, { at: number; candles: HlCandle[] }>();

/** GET /api/hl-traders/candles?coin=&interval=15m&start=ms&end=ms */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const coin = sp.get("coin")?.trim();
    if (!coin) {
      return NextResponse.json({ error: "coin 필요" }, { status: 400 });
    }
    const interval = INTERVALS.has(sp.get("interval") ?? "")
      ? sp.get("interval")!
      : "15m";
    const end = Number(sp.get("end")) || Date.now();
    const start = Number(sp.get("start")) || end - 24 * 3600_000;

    const key = `${coin}:${interval}:${Math.floor(start / 60_000)}:${Math.floor(end / 60_000)}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      return NextResponse.json({ candles: hit.candles });
    }

    const candles = await fetchCandles(coin, interval, start, end);
    cache.set(key, { at: Date.now(), candles });
    if (cache.size > 200) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) cache.delete(oldest[0]);
    }
    return NextResponse.json({ candles });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err) },
      { status: 500 }
    );
  }
}
