import { createSupabaseAdmin } from "@/lib/supabase/client";
import type { ScreenerCandidate } from "./types";

export async function persistSignals(
  candidates: ScreenerCandidate[],
  minScore = 65
): Promise<number> {
  const rows = candidates
    .filter((c) => c.scoreTotal >= minScore && c.direction !== "WAIT")
    .map((c) => ({
      exchange: c.exchange,
      symbol: c.symbol,
      direction: c.direction,
      timeframe: c.timeframe,
      candle_close_time: c.candleCloseTime,
      strongest_strategy: c.strongestStrategy,
      strategy_scores: Object.fromEntries(
        c.strategyScores.map((s) => [s.id, s.score])
      ),
      score_total: c.scoreTotal,
      score_long: c.scoreLong,
      score_short: c.scoreShort,
      stars: c.stars,
      price: c.price,
      vol_mult: c.volMult,
      turnover_mult: c.turnoverMult,
      turnover_24h: c.turnover24h,
      rsi: c.rsi,
      macd_state: c.macdState,
      ema_state: c.emaState,
      bb_state: c.bbState,
      atr: c.atr,
      oi_change_pct: c.oiChangePct,
      funding_rate: c.fundingRate,
      entry_price: c.entryPrice,
      stop_price: c.stopPrice,
      tp1: c.tp1,
      tp2: c.tp2,
      rr1: c.rr1,
      rr2: c.rr2,
      reasons: c.reasons,
      risks: c.risks,
      signal_at: c.signalAt,
    }));

  if (rows.length === 0) return 0;

  try {
    const supabase = createSupabaseAdmin();
    const { error, count } = await supabase.from("screener_signals").upsert(rows, {
      onConflict:
        "exchange,symbol,strongest_strategy,candle_close_time,direction",
      ignoreDuplicates: true,
      count: "exact",
    });
    if (error) {
      // table may not exist yet
      console.warn("screener persist:", error.message);
      return 0;
    }
    return count ?? rows.length;
  } catch (err) {
    console.warn("screener persist failed", err);
    return 0;
  }
}
