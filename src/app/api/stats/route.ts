import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import {
  computeDailyPnl,
  computeHourlyStats,
  computeMonthlyStats,
  computeOverallStats,
} from "@/lib/stats/compute";
import {
  filterByEntryDay,
  kstDayStartIso,
  shiftIsoDate,
} from "@/lib/stats/range";
import type { Trade } from "@/lib/exchanges/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readDay(value: string | null): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("날짜는 YYYY-MM-DD 형식이어야 합니다.");
  }
  return value;
}

/** GET /api/stats?from=YYYY-MM-DD&to=YYYY-MM-DD — 진입일(KST) 구간 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const from = readDay(searchParams.get("from"));
    const to = readDay(searchParams.get("to"));

    const supabase = createSupabaseAdmin();
    let query = supabase
      .from("trades")
      .select("*")
      .order("exit_time", { ascending: false });

    if (from) query = query.gte("entry_time", kstDayStartIso(from));
    if (to) query = query.lt("entry_time", kstDayStartIso(shiftIsoDate(to, 1)));

    const { data, error } = await query.limit(1000);

    if (error) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 }
      );
    }

    const trades = filterByEntryDay((data ?? []) as Trade[], from, to);
    return NextResponse.json({
      overall: computeOverallStats(trades),
      monthly: computeMonthlyStats(trades),
      daily: computeDailyPnl(trades),
      hourly: computeHourlyStats(trades),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
