import { NextResponse } from "next/server";
import { binanceAssetKindMap } from "@/lib/market/binance-kind";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["sin1", "hnd1", "icn1"];

/** GET /api/market/binance-kinds?symbols=BTCUSDT,TSLAUSDT */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("symbols") ?? "";
    const symbols = raw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 200);
    if (!symbols.length) {
      return NextResponse.json({ kinds: {} });
    }
    const map = await binanceAssetKindMap(symbols);
    const kinds: Record<string, string> = {};
    for (const [k, v] of map) kinds[k] = v;
    return NextResponse.json({ kinds });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
