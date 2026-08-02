import { NextRequest, NextResponse } from "next/server";
import { EXCHANGE_API_REGIONS } from "@/lib/exchanges/regions";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { getAdapter } from "@/lib/screener/scan";
import { retPct } from "@/lib/screener/snapshot";
import type { ScreenerCandidate, ScreenerExchange } from "@/lib/screener/types";
import { candidateSnapshot } from "@/lib/screener/snapshot";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const preferredRegion = [...EXCHANGE_API_REGIONS];

/** GET ?status=open|closed|all&track_type= */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const status = sp.get("status") ?? "open";
    const trackType = sp.get("track_type");
    const supabase = createSupabaseAdmin();
    let q = supabase
      .from("screener_paper_tracks")
      .select("*")
      .order("entry_at", { ascending: false })
      .limit(200);
    if (status !== "all") q = q.eq("status", status);
    if (trackType) q = q.eq("track_type", trackType);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ items: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

/**
 * POST
 * - action: "start" — candidates[] 로 가상투자 시작
 * - action: "refresh" — open 포지션 현재가 갱신 + 수익률
 * - action: "close" — id 청산
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action?: string;
      trackType?: "manual" | "scan" | "macd" | "favorite";
      candidates?: ScreenerCandidate[];
      id?: string;
      macdOnly?: boolean;
    };
    const action = body.action ?? "start";
    const supabase = createSupabaseAdmin();

    if (action === "close" && body.id) {
      const { error } = await supabase
        .from("screener_paper_tracks")
        .update({
          status: "closed",
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "refresh") {
      const { data: opens, error } = await supabase
        .from("screener_paper_tracks")
        .select("*")
        .eq("status", "open")
        .limit(120);
      if (error) throw error;

      let updated = 0;
      const results: Array<{
        id: string;
        symbol: string;
        ret_pct: number;
        last_price: number;
      }> = [];

      for (const row of opens ?? []) {
        try {
          const adapter = getAdapter(row.exchange as ScreenerExchange);
          const kl = await adapter.fetchKlines(row.symbol as string, "5m", 5);
          const priceNow = kl[kl.length - 1]?.close;
          if (!priceNow) continue;
          const ret = Number(
            retPct(String(row.direction), Number(row.entry_price), priceNow).toFixed(3)
          );
          const prevMfe = row.mfe_pct != null ? Number(row.mfe_pct) : ret;
          const prevMae = row.mae_pct != null ? Number(row.mae_pct) : ret;
          const mfe = Math.max(prevMfe, ret);
          const mae = Math.min(prevMae, ret);
          const { error: upErr } = await supabase
            .from("screener_paper_tracks")
            .update({
              last_price: priceNow,
              last_at: new Date().toISOString(),
              ret_pct: ret,
              mfe_pct: Number(mfe.toFixed(3)),
              mae_pct: Number(mae.toFixed(3)),
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);
          if (!upErr) {
            updated += 1;
            results.push({
              id: row.id as string,
              symbol: row.symbol as string,
              ret_pct: ret,
              last_price: priceNow,
            });
          }
        } catch {
          // partial fail ok
        }
      }

      const avg =
        results.length > 0
          ? results.reduce((a, b) => a + b.ret_pct, 0) / results.length
          : null;

      return NextResponse.json({
        ok: true,
        updated,
        avgRetPct: avg != null ? Number(avg.toFixed(3)) : null,
        items: results,
      });
    }

    // start
    let candidates = body.candidates ?? [];
    if (body.macdOnly || body.trackType === "macd") {
      candidates = candidates.filter((c) => {
        const macdHit = c.strategyScores.some(
          (s) =>
            (s.id === "golden_cross" ||
              s.id === "dead_cross" ||
              s.id === "macd_momentum") &&
            s.score >= 55 &&
            s.side !== "NEUTRAL"
        );
        return (
          macdHit ||
          c.macdState.includes("크로스") ||
          c.strongestStrategy === "golden_cross" ||
          c.strongestStrategy === "dead_cross" ||
          c.strongestStrategy === "macd_momentum"
        );
      });
    }

    if (candidates.length === 0) {
      return NextResponse.json(
        { error: "추적할 후보가 없습니다", started: 0 },
        { status: 400 }
      );
    }

    const trackType = body.trackType ?? "manual";
    const rows = candidates
      .filter((c) => c.direction !== "WAIT")
      .map((c) => ({
        exchange: c.exchange,
        symbol: c.symbol,
        direction: c.direction,
        track_type: trackType,
        entry_price: c.entryPrice ?? c.price,
        entry_at: new Date().toISOString(),
        entry_snapshot: candidateSnapshot(c),
        last_price: c.price,
        last_at: new Date().toISOString(),
        ret_pct: 0,
        mfe_pct: 0,
        mae_pct: 0,
        status: "open",
        updated_at: new Date().toISOString(),
      }));

    const { data, error } = await supabase
      .from("screener_paper_tracks")
      .insert(rows)
      .select();
    if (error) throw error;

    return NextResponse.json({ started: data?.length ?? rows.length, items: data });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
