import { NextRequest, NextResponse } from "next/server";
import { fetchSymbolDetail } from "@/lib/screener/scan";
import type { ScreenerExchange, Timeframe } from "@/lib/screener/types";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/screener/detail?exchange=&symbol=&timeframe= */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const exchange = (sp.get("exchange") ?? "binance") as ScreenerExchange;
    const symbol = sp.get("symbol");
    const timeframe = (sp.get("timeframe") ?? "15m") as Timeframe;
    if (!symbol) {
      return NextResponse.json({ error: "symbol 필요" }, { status: 400 });
    }
    const detail = await fetchSymbolDetail(exchange, symbol, timeframe);
    return NextResponse.json(detail);
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
