import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/screener/stats */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const exchange = sp.get("exchange");
    const direction = sp.get("direction");

    const supabase = createSupabaseAdmin();
    let q = supabase
      .from("screener_signals")
      .select("*, screener_signal_outcomes(*)")
      .order("signal_at", { ascending: false })
      .limit(500);

    if (exchange && exchange !== "all") q = q.eq("exchange", exchange);
    if (direction && direction !== "ALL") q = q.eq("direction", direction);

    const { data, error } = await q;
    if (error) throw error;

    const signals = data ?? [];
    const withOut = signals.filter(
      (s) =>
        s.screener_signal_outcomes &&
        (Array.isArray(s.screener_signal_outcomes)
          ? s.screener_signal_outcomes[0]
          : s.screener_signal_outcomes)
    );

    const outcomeOf = (s: (typeof signals)[0]) => {
      const o = s.screener_signal_outcomes;
      return Array.isArray(o) ? o[0] : o;
    };

    const longN = signals.filter((s) =>
      String(s.direction).startsWith("LONG")
    ).length;
    const shortN = signals.filter((s) =>
      String(s.direction).startsWith("SHORT")
    ).length;

    const byStrategy: Record<string, number> = {};
    for (const s of signals) {
      const k = String(s.strongest_strategy ?? "unknown");
      byStrategy[k] = (byStrategy[k] ?? 0) + 1;
    }

    const avg = (nums: number[]) =>
      nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;

    const rets1h = withOut
      .map((s) => Number(outcomeOf(s)?.ret_1h))
      .filter((n) => Number.isFinite(n));
    const rets4h = withOut
      .map((s) => Number(outcomeOf(s)?.ret_4h))
      .filter((n) => Number.isFinite(n));
    const rets24h = withOut
      .map((s) => Number(outcomeOf(s)?.ret_24h))
      .filter((n) => Number.isFinite(n));

    const winRate = (rets: number[]) => {
      if (!rets.length) return null;
      return (rets.filter((r) => r > 0).length / rets.length) * 100;
    };

    const hitTp1 = withOut.filter((s) => outcomeOf(s)?.hit_tp1 === true).length;
    const hitTp2 = withOut.filter((s) => outcomeOf(s)?.hit_tp2 === true).length;
    const hitStop = withOut.filter((s) => outcomeOf(s)?.hit_stop === true)
      .length;

    const byStars: Record<string, number[]> = {};
    for (const s of withOut) {
      const key = String(s.stars);
      const r = Number(outcomeOf(s)?.ret_1h);
      if (!Number.isFinite(r)) continue;
      (byStars[key] ??= []).push(r);
    }

    const byStrategyRet: Record<string, number[]> = {};
    for (const s of withOut) {
      const key = String(s.strongest_strategy ?? "unknown");
      const r = Number(outcomeOf(s)?.ret_1h);
      if (!Number.isFinite(r)) continue;
      (byStrategyRet[key] ??= []).push(r);
    }

    return NextResponse.json({
      total: signals.length,
      long: longN,
      short: shortN,
      byStrategy,
      avgRet1h: avg(rets1h),
      avgRet4h: avg(rets4h),
      avgRet24h: avg(rets24h),
      winRate1h: winRate(rets1h),
      winRateLong: winRate(
        withOut
          .filter((s) => String(s.direction).startsWith("LONG"))
          .map((s) => Number(outcomeOf(s)?.ret_1h))
          .filter((n) => Number.isFinite(n))
      ),
      winRateShort: winRate(
        withOut
          .filter((s) => String(s.direction).startsWith("SHORT"))
          .map((s) => Number(outcomeOf(s)?.ret_1h))
          .filter((n) => Number.isFinite(n))
      ),
      tp1Rate: withOut.length ? (hitTp1 / withOut.length) * 100 : null,
      tp2Rate: withOut.length ? (hitTp2 / withOut.length) * 100 : null,
      stopRate: withOut.length ? (hitStop / withOut.length) * 100 : null,
      avgRr: avg(
        signals.map((s) => Number(s.rr1)).filter((n) => Number.isFinite(n))
      ),
      avgMfe: avg(
        withOut
          .map((s) => Number(outcomeOf(s)?.mfe))
          .filter((n) => Number.isFinite(n))
      ),
      avgMae: avg(
        withOut
          .map((s) => Number(outcomeOf(s)?.mae))
          .filter((n) => Number.isFinite(n))
      ),
      byStars: Object.fromEntries(
        Object.entries(byStars).map(([k, v]) => [k, avg(v)])
      ),
      strategyWinRate: Object.fromEntries(
        Object.entries(byStrategyRet).map(([k, v]) => [k, winRate(v)])
      ),
      tracked: withOut.length,
    });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
