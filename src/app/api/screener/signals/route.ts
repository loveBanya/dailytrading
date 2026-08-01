import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/screener/signals */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const limit = Math.min(Number(sp.get("limit") ?? 100), 300);
    const exchange = sp.get("exchange");
    const direction = sp.get("direction");
    const strategy = sp.get("strategy");

    const supabase = createSupabaseAdmin();
    let q = supabase
      .from("screener_signals")
      .select("*, screener_signal_outcomes(*)")
      .order("signal_at", { ascending: false })
      .limit(limit);

    if (exchange && exchange !== "all") q = q.eq("exchange", exchange);
    if (direction && direction !== "ALL") q = q.eq("direction", direction);
    if (strategy) q = q.eq("strongest_strategy", strategy);

    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ signals: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
