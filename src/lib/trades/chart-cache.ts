import { createSupabaseAdmin } from "@/lib/supabase/client";
import { fetchKlines, type Candle } from "@/lib/exchanges/klines";
import type { Exchange } from "@/lib/exchanges/types";

export interface TradeChartPayload {
  tradeId: string;
  symbol: string;
  interval: string;
  candles: Candle[];
  cached: boolean;
  source?: string | null;
  fetchedAt?: string;
}

function pickInterval(durationMinutes: number | null | undefined): string {
  if (durationMinutes == null || durationMinutes <= 0) return "5";
  if (durationMinutes <= 60) return "1";
  if (durationMinutes <= 240) return "5";
  if (durationMinutes <= 720) return "15";
  return "60";
}

/** 매매 차트: DB 캐시 우선, 없으면 거래소 조회 후 저장 */
export async function getOrFetchTradeChart(tradeId: string): Promise<TradeChartPayload> {
  const supabase = createSupabaseAdmin();

  const { data: cached, error: cacheErr } = await supabase
    .from("trade_chart_candles")
    .select("*")
    .eq("trade_id", tradeId)
    .maybeSingle();

  if (!cacheErr && cached?.candles && Array.isArray(cached.candles) && cached.candles.length > 0) {
    return {
      tradeId,
      symbol: String(cached.symbol),
      interval: String(cached.interval),
      candles: cached.candles as Candle[],
      cached: true,
      source: cached.source as string | null,
      fetchedAt: cached.fetched_at as string,
    };
  }

  const { data: trade, error: tradeErr } = await supabase
    .from("trades")
    .select("id, symbol, exchange, exit_time, duration_minutes")
    .eq("id", tradeId)
    .single();

  if (tradeErr || !trade) {
    throw new Error(tradeErr?.message ?? "매매 기록을 찾을 수 없습니다");
  }

  const exitMs = new Date(trade.exit_time as string).getTime();
  const lookbackMs = 48 * 60 * 60 * 1000;
  const start = exitMs - lookbackMs;
  const end = Math.min(Date.now(), exitMs + 3 * 60 * 60 * 1000);
  const interval = pickInterval(trade.duration_minutes as number | null);
  const exchange = trade.exchange as Exchange;

  const candles = await fetchKlines({
    symbol: trade.symbol as string,
    interval,
    start,
    end,
    limit: 300,
    prefer: exchange === "binance" ? "binance" : "auto",
  });

  if (candles.length === 0) {
    throw new Error("캔들 데이터가 비어 있습니다");
  }

  const row = {
    trade_id: tradeId,
    symbol: trade.symbol,
    interval,
    start_ms: start,
    end_ms: end,
    candles,
    source: "exchange",
    fetched_at: new Date().toISOString(),
  };

  const { error: upErr } = await supabase
    .from("trade_chart_candles")
    .upsert(row, { onConflict: "trade_id" });

  if (upErr) {
    // 테이블 미생성 등이면 그래도 차트는 반환
    console.warn("trade_chart_candles upsert:", upErr.message);
  }

  return {
    tradeId,
    symbol: trade.symbol as string,
    interval,
    candles,
    cached: false,
    source: "exchange",
    fetchedAt: row.fetched_at,
  };
}
