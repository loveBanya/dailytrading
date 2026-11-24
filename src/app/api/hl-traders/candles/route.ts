import { NextRequest, NextResponse } from "next/server";
import { fetchCandles } from "@/lib/hyperliquid/client";
import {
  candleCacheKey,
  getCachedCandles,
  getStaleCandles,
  loadCandlesCached,
  type HlCandleInterval,
} from "@/lib/hyperliquid/candleCache";
import { enqueueCandleFetch } from "@/lib/hyperliquid/rateLimit";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERVALS = new Set<HlCandleInterval>(["5m", "15m", "1h", "4h"]);

/** GET /api/hl-traders/candles?coin=&interval=15m&start=ms&end=ms */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const coin = sp.get("coin")?.trim();
    if (!coin) {
      return NextResponse.json({ error: "coin 필요" }, { status: 400 });
    }
    const rawIv = sp.get("interval") ?? "15m";
    const interval: HlCandleInterval = INTERVALS.has(rawIv as HlCandleInterval)
      ? (rawIv as HlCandleInterval)
      : "15m";
    const end = Number(sp.get("end")) || Date.now();
    const start = Number(sp.get("start")) || end - 24 * 3600_000;
    const key = candleCacheKey(coin, interval, start, end);

    const fresh = getCachedCandles(key, interval);
    if (fresh) {
      return NextResponse.json({
        candles: fresh,
        cached: true,
        stale: false,
      });
    }

    try {
      const { candles, fromCache } = await enqueueCandleFetch(() =>
        loadCandlesCached(key, interval, () =>
          fetchCandles(coin, interval, start, end)
        )
      );
      return NextResponse.json({
        candles,
        cached: fromCache,
        stale: false,
      });
    } catch (err) {
      const stale = getStaleCandles(key);
      if (stale && stale.length > 0) {
        return NextResponse.json({
          candles: stale,
          cached: true,
          stale: true,
          warning: errorMessage(err),
        });
      }
      throw err;
    }
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err) },
      { status: 500 }
    );
  }
}
