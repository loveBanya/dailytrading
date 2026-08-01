import type { ClosedPosition, Exchange, SyncResult } from "./types";
import { fetchBybitClosedPositions } from "./bybit";
import { fetchBinanceClosedPositions } from "./binance";
import { fetchOkxClosedPositions } from "./okx";
import { durationMinutes } from "@/lib/utils/format";
import { errorMessage } from "@/lib/utils/labels";
import { createSupabaseAdmin } from "@/lib/supabase/client";

export async function fetchClosedPositions(
  exchange: Exchange,
  options?: {
    symbol?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }
): Promise<ClosedPosition[]> {
  if (exchange === "bybit") return fetchBybitClosedPositions(options);
  if (exchange === "okx") return fetchOkxClosedPositions(options);
  return fetchBinanceClosedPositions(options);
}

/** 청산 포지션을 Supabase trades에 upsert (중복 스킵) */
export async function syncExchangeTrades(
  exchange: Exchange,
  options?: {
    symbol?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }
): Promise<SyncResult> {
  const supabase = createSupabaseAdmin();

  try {
    const positions = await fetchClosedPositions(exchange, options);

    if (positions.length === 0) {
      await supabase.from("sync_logs").insert({
        exchange,
        status: "success",
        fetched_count: 0,
        inserted_count: 0,
        message: "새 청산 포지션 없음",
      });
      return { exchange, fetched: 0, inserted: 0, skipped: 0 };
    }

    const rows = positions.map((p) => ({
      exchange: p.exchange,
      external_id: p.externalId,
      symbol: p.symbol,
      base_asset: p.baseAsset,
      side: p.side,
      qty: p.qty,
      entry_price: p.entryPrice,
      exit_price: p.exitPrice,
      leverage: p.leverage ?? null,
      pnl: p.pnl,
      pnl_percent: p.pnlPercent ?? null,
      fee: p.fee ?? 0,
      status: p.status,
      entry_time: p.entryTime.toISOString(),
      exit_time: p.exitTime.toISOString(),
      duration_minutes: durationMinutes(p.entryTime, p.exitTime),
      raw: p.raw ?? null,
    }));

    const { data, error } = await supabase
      .from("trades")
      .upsert(rows, {
        onConflict: "exchange,external_id",
        ignoreDuplicates: true,
      })
      .select("id");

    if (error) {
      return {
        exchange,
        fetched: positions.length,
        inserted: 0,
        skipped: 0,
        error: errorMessage(error),
      };
    }

    const inserted = data?.length ?? 0;
    const skipped = positions.length - inserted;

    await supabase.from("sync_logs").insert({
      exchange,
      status: "success",
      fetched_count: positions.length,
      inserted_count: inserted,
      message: `${inserted}건 저장, ${skipped}건 건너뜀`,
    });

    return { exchange, fetched: positions.length, inserted, skipped };
  } catch (err) {
    const message = errorMessage(err);
    try {
      await supabase.from("sync_logs").insert({
        exchange,
        status: "error",
        fetched_count: 0,
        inserted_count: 0,
        message,
      });
    } catch {
      // sync_logs 테이블이 없어도 동기화 에러는 반환
    }
    return { exchange, fetched: 0, inserted: 0, skipped: 0, error: message };
  }
}

export async function syncAllExchanges(options?: {
  startTime?: number;
  endTime?: number;
  limit?: number;
}): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  const exchanges: Exchange[] = [];

  if (process.env.BYBIT_API_KEY && process.env.BYBIT_API_SECRET) {
    exchanges.push("bybit");
  }
  if (process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET) {
    exchanges.push("binance");
  }
  if (process.env.OKX_API_KEY && process.env.OKX_API_SECRET) {
    exchanges.push("okx");
  }

  if (exchanges.length === 0) {
    return [
      {
        exchange: "bybit",
        fetched: 0,
        inserted: 0,
        skipped: 0,
        error:
          "설정된 거래소 API 키가 없습니다. BYBIT_* / OKX_* / BINANCE_* 환경변수를 확인하세요.",
      },
    ];
  }

  for (const exchange of exchanges) {
    results.push(await syncExchangeTrades(exchange, options));
  }

  return results;
}
