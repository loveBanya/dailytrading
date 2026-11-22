import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import {
  fetchPortfolio,
  fetchUserFills,
  normalizeHlAddress,
} from "@/lib/hyperliquid/client";
import { errorMessage } from "@/lib/utils/labels";
import type { HlPositionEvent, HlTrader } from "@/lib/hyperliquid/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/hl-traders/history?traderId=&limit=&fills=1&portfolio=1 */
export async function GET(req: NextRequest) {
  try {
    const traderId = req.nextUrl.searchParams.get("traderId");
    if (!traderId) {
      return NextResponse.json({ error: "traderId 필요" }, { status: 400 });
    }

    const limit = Math.min(
      500,
      Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 100) || 100)
    );
    const wantFills = ["1", "true"].includes(
      req.nextUrl.searchParams.get("fills") ?? ""
    );
    const wantPortfolio = ["1", "true"].includes(
      req.nextUrl.searchParams.get("portfolio") ?? ""
    );

    const supabase = createSupabaseAdmin();
    const { data: traderRow, error: traderErr } = await supabase
      .from("hl_traders")
      .select("*")
      .eq("id", traderId)
      .maybeSingle();

    if (traderErr) throw traderErr;
    if (!traderRow) {
      return NextResponse.json(
        { error: "트레이더를 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    const trader = traderRow as HlTrader;

    const { data: events, error: evErr } = await supabase
      .from("hl_position_events")
      .select("*")
      .eq("trader_id", traderId)
      .order("observed_at", { ascending: false })
      .limit(limit);

    if (evErr) throw evErr;

    let fills = null;
    let portfolio = null;
    const address = normalizeHlAddress(trader.address) ?? trader.address;

    if (wantFills) {
      fills = await fetchUserFills(address);
    }
    if (wantPortfolio) {
      portfolio = await fetchPortfolio(address);
    }

    return NextResponse.json({
      trader,
      events: (events ?? []) as HlPositionEvent[],
      fills,
      portfolio,
    });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err) },
      { status: 500 }
    );
  }
}
