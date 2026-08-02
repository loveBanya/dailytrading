import { NextResponse } from "next/server";
import { EXCHANGE_API_REGIONS } from "@/lib/exchanges/regions";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { getAdapter } from "@/lib/screener/scan";
import type { ScreenerExchange } from "@/lib/screener/types";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const preferredRegion = [...EXCHANGE_API_REGIONS];

const HORIZONS: Array<{ key: string; ms: number }> = [
  { key: "5m", ms: 5 * 60_000 },
  { key: "15m", ms: 15 * 60_000 },
  { key: "30m", ms: 30 * 60_000 },
  { key: "1h", ms: 60 * 60_000 },
  { key: "4h", ms: 4 * 60 * 60_000 },
  { key: "24h", ms: 24 * 60 * 60_000 },
];

function retFor(
  direction: string,
  entry: number,
  future: number
): number {
  if (!entry) return 0;
  const raw = ((future - entry) / entry) * 100;
  return direction.startsWith("SHORT") ? -raw : raw;
}

/** POST /api/screener/track — 미완성 outcome 갱신 */
export async function POST() {
  try {
    const supabase = createSupabaseAdmin();
    const { data: signals, error } = await supabase
      .from("screener_signals")
      .select("*")
      .order("signal_at", { ascending: false })
      .limit(80);

    if (error) throw error;
    let updated = 0;
    const now = Date.now();

    for (const s of signals ?? []) {
      const signalAt = new Date(s.signal_at as string).getTime();
      const age = now - signalAt;
      if (age < 5 * 60_000) continue;

      const adapter = getAdapter(s.exchange as ScreenerExchange);
      let priceNow: number;
      try {
        const kl = await adapter.fetchKlines(s.symbol as string, "5m", 5);
        priceNow = kl[kl.length - 1]?.close;
        if (!priceNow) continue;
      } catch {
        continue;
      }

      const entry = Number(s.price);
      const direction = String(s.direction);
      const outcome: Record<string, unknown> = {
        signal_id: s.id,
        updated_at: new Date().toISOString(),
      };

      for (const h of HORIZONS) {
        if (age >= h.ms * 0.9) {
          outcome[`price_${h.key}`] = priceNow;
          outcome[`ret_${h.key}`] = Number(
            retFor(direction, entry, priceNow).toFixed(3)
          );
        }
      }

      // approximate MFE/MAE with current move only if not set richly
      const move = retFor(direction, entry, priceNow);
      outcome.mfe = Math.max(0, move);
      outcome.mae = Math.min(0, move);

      const stop = s.stop_price != null ? Number(s.stop_price) : null;
      const tp1 = s.tp1 != null ? Number(s.tp1) : null;
      const tp2 = s.tp2 != null ? Number(s.tp2) : null;
      if (direction.startsWith("LONG")) {
        outcome.hit_stop = stop != null ? priceNow <= stop : null;
        outcome.hit_tp1 = tp1 != null ? priceNow >= tp1 : null;
        outcome.hit_tp2 = tp2 != null ? priceNow >= tp2 : null;
      } else if (direction.startsWith("SHORT")) {
        outcome.hit_stop = stop != null ? priceNow >= stop : null;
        outcome.hit_tp1 = tp1 != null ? priceNow <= tp1 : null;
        outcome.hit_tp2 = tp2 != null ? priceNow <= tp2 : null;
      }
      outcome.stopped_before_tp =
        outcome.hit_stop === true &&
        outcome.hit_tp1 !== true &&
        outcome.hit_tp2 !== true;

      const { error: upErr } = await supabase
        .from("screener_signal_outcomes")
        .upsert(outcome, { onConflict: "signal_id" });
      if (!upErr) updated += 1;
    }

    return NextResponse.json({ ok: true, updated });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
