import { NextRequest, NextResponse } from "next/server";
import { syncAllExchanges, syncExchangeTrades } from "@/lib/exchanges";
import type { Exchange } from "@/lib/exchanges/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["sin1", "hnd1", "icn1"];

/**
 * POST /api/sync
 * body: { exchange?: "bybit" | "binance", symbol?: string, days?: number }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      exchange?: Exchange;
      symbol?: string;
      days?: number;
      limit?: number;
    };

    const days = body.days ?? 7;
    const startTime = Date.now() - days * 24 * 60 * 60 * 1000;
    const options = {
      symbol: body.symbol,
      startTime,
      endTime: Date.now(),
      limit: body.limit ?? 100,
    };

    const results = body.exchange
      ? [await syncExchangeTrades(body.exchange, options)]
      : await syncAllExchanges(options);

    const hasError = results.some((r) => r.error);
    return NextResponse.json(
      { ok: !hasError, results },
      { status: hasError ? 207 : 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
