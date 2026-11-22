import { NextRequest, NextResponse } from "next/server";
import { fetchLeaderboard } from "@/lib/hyperliquid/client";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/hl-traders/leaderboard?limit=30 */
export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(
      100,
      Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 30) || 30)
    );
    const rows = await fetchLeaderboard(limit);
    return NextResponse.json({ rows });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err) },
      { status: 500 }
    );
  }
}
