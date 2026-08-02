import { NextRequest, NextResponse } from "next/server";
import { EXCHANGE_API_REGIONS } from "@/lib/exchanges/regions";
import { getOrFetchTradeChart } from "@/lib/trades/chart-cache";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = [...EXCHANGE_API_REGIONS];

/** GET /api/trades/chart?tradeId= — DB 캐시 우선, 없으면 조회 후 저장 */
export async function GET(req: NextRequest) {
  try {
    const tradeId = req.nextUrl.searchParams.get("tradeId");
    if (!tradeId) {
      return NextResponse.json({ error: "tradeId 필요" }, { status: 400 });
    }
    const data = await getOrFetchTradeChart(tradeId);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
