import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import {
  computeDailyPnl,
  computeMonthlyStats,
  computeOverallStats,
} from "@/lib/stats/compute";
import type { Trade } from "@/lib/exchanges/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/stats — 전체·월별·일별 손익 */
export async function GET() {
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("trades")
      .select("*")
      .order("exit_time", { ascending: false })
      .limit(1000);

    if (error) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 }
      );
    }

    const trades = (data ?? []) as Trade[];
    return NextResponse.json({
      overall: computeOverallStats(trades),
      monthly: computeMonthlyStats(trades),
      daily: computeDailyPnl(trades),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
