import { NextRequest, NextResponse } from "next/server";
import { getOrFetchTradeChart } from "@/lib/trades/chart-cache";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["sin1", "hnd1", "icn1"];

/** GET /api/trades/chart?tradeId= ??DB ìºì‹œ ?°ì„ , ?†ìœ¼ë©?ì¡°íšŒ ???€??*/
export async function GET(req: NextRequest) {
  try {
    const tradeId = req.nextUrl.searchParams.get("tradeId");
    const force = req.nextUrl.searchParams.get("refresh") === "1";
    if (!tradeId) {
      return NextResponse.json({ error: "tradeId ?„ìš”" }, { status: 400 });
    }
    const data = await getOrFetchTradeChart(tradeId, { force });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
