import { NextResponse } from "next/server";
import { fetchWalletOverview } from "@/lib/exchanges/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["sin1", "hnd1", "icn1"];

/** GET /api/wallet — 거래소별 잔고 + 오픈 포지션 */
export async function GET() {
  try {
    const overview = await fetchWalletOverview();
    return NextResponse.json(overview);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
