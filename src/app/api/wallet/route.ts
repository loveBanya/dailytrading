import { NextResponse } from "next/server";
import { EXCHANGE_API_REGIONS } from "@/lib/exchanges/regions";
import { fetchWalletOverview } from "@/lib/exchanges/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = [...EXCHANGE_API_REGIONS];

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
