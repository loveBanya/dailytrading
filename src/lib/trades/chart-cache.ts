import { createSupabaseAdmin } from "@/lib/supabase/client";
import {
  fetchKlinesWithSource,
  type Candle,
} from "@/lib/exchanges/klines";
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

function preferForExchange(
  exchange: Exchange
): "bybit" | "binance" | "okx" | "auto" {
  if (exchange === "bybit") return "bybit";
  if (exchange === "binance") return "binance";
  if (exchange === "okx") return "okx";
  return "auto";
}

/** 캐시가 매매 시각·가격과 맞는지 검사 — 안 맞으면 재조회 */
function isCacheUsable(
  candles: Candle[],
  exitMs: number,
  entryPrice: number | null,
  exitPrice: number | null
): boolean {
  if (candles.length < 5) return false;

  const exitSec = Math.floor(exitMs / 1000);
  let minT = candles[0].time;
  let maxT = candles[0].time;
  let minL = candles[0].low;
  let maxH = candles[0].high;
  for (const c of candles) {
    if (c.time < minT) minT = c.time;
    if (c.time > maxT) maxT = c.time;
    if (c.low < minL) minL = c.low;
    if (c.high > maxH) maxH = c.high;
  }

  // 청산 시각이 캔들 구간에서 너무 벗어나면 무효
  const slack = 6 * 3600;
  if (exitSec < minT - slack || exitSec > maxT + slack) return false;

  const prices = [entryPrice, exitPrice].filter(
    (p): p is number => p != null && Number.isFinite(p) && p > 0
  );
  if (prices.length === 0) return true;

  const mid =
    prices.reduce((a, b) => a + b, 0) / prices.length;
  const span = Math.max(maxH - minL, Math.abs(mid) * 0.01);
  // 매매 가격이 캔들 밴드에서 크게 벗어나면 (다른 구간/심볼) 무효
  if (mid < minL - span * 1.5 || mid > maxH + span * 1.5) return false;

  return true;
}

/** 매매 차트: DB 캐시 우선, 없으면(또는 force/무효 캐시) 거래소 조회 후 저장 */
export async function getOrFetchTradeChart(
  tradeId: string,
  options?: { force?: boolean }
): Promise<TradeChartPayload> {
  const supabase = createSupabaseAdmin();
  const force = options?.force === true;

  const { data: trade, error: tradeErr } = await supabase
    .from("trades")
    .select(
      "id, symbol, exchange, exit_time, duration_minutes, entry_price, exit_price"
    )
    .eq("id", tradeId)
    .single();

  if (tradeErr || !trade) {
    throw new Error(tradeErr?.message ?? "매매 기록을 찾을 수 없습니다");
  }

  const exitMs = new Date(trade.exit_time as string).getTime();
  const entryPrice = trade.entry_price != null ? Number(trade.entry_price) : null;
  const exitPrice = trade.exit_price != null ? Number(trade.exit_price) : null;

  if (!force) {
    const { data: cached, error: cacheErr } = await supabase
      .from("trade_chart_candles")
      .select("*")
      .eq("trade_id", tradeId)
      .maybeSingle();

    if (
      !cacheErr &&
      cached?.candles &&
      Array.isArray(cached.candles) &&
      isCacheUsable(
        cached.candles as Candle[],
        exitMs,
        entryPrice,
        exitPrice
      )
    ) {
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
  }

  const lookbackMs = 48 * 60 * 60 * 1000;
  const start = exitMs - lookbackMs;
  const end = Math.min(Date.now(), exitMs + 3 * 60 * 60 * 1000);
  const interval = pickInterval(trade.duration_minutes as number | null);
  const exchange = trade.exchange as Exchange;

  const { candles, source } = await fetchKlinesWithSource({
    symbol: trade.symbol as string,
    interval,
    start,
    end,
    limit: 1000,
    prefer: preferForExchange(exchange),
  });

  if (candles.length === 0) {
    throw new Error("캔들 데이터가 비어 있습니다");
  }

  // 조회 결과도 가격/시각이 너무 어긋나면 저장은 하되 경고만
  if (!isCacheUsable(candles, exitMs, entryPrice, exitPrice)) {
    console.warn(
      `trade chart mismatch tradeId=${tradeId} source=${source} candles=${candles.length}`
    );
  }

  const row = {
    trade_id: tradeId,
    symbol: trade.symbol,
    interval,
    start_ms: start,
    end_ms: end,
    candles,
    source,
    fetched_at: new Date().toISOString(),
  };

  const { error: upErr } = await supabase
    .from("trade_chart_candles")
    .upsert(row, { onConflict: "trade_id" });

  if (upErr) {
    console.warn("trade_chart_candles upsert:", upErr.message);
  }

  return {
    tradeId,
    symbol: trade.symbol as string,
    interval,
    candles,
    cached: false,
    source,
    fetchedAt: row.fetched_at,
  };
}
