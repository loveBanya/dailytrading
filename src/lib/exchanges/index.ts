import type { ClosedPosition, Exchange, SyncResult } from "./types";
import { fetchBybitClosedPositions } from "./bybit";
import { fetchBinanceClosedPositions } from "./binance";
import { fetchOkxClosedPositions } from "./okx";
import { durationMinutes } from "@/lib/utils/format";
import { errorMessage } from "@/lib/utils/labels";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { collapseBinanceFillTrades } from "./binance-merge";

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
    let mergedFills = 0;
    if (exchange === "binance") {
      mergedFills = (await collapseBinanceFillTrades()).removed;
    }
    const positions = await fetchClosedPositions(exchange, options);

    if (positions.length === 0) {
      await supabase.from("sync_logs").insert({
        exchange,
        status: "success",
        fetched_count: 0,
        inserted_count: 0,
        message:
          mergedFills > 0
            ? `새 청산 포지션 없음, 갈라진 체결 ${mergedFills}건 합침`
            : "새 청산 포지션 없음",
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
        // 바이낸스는 같은 주문의 체결이 더 모이면 수량·손익을 갱신한다.
        // 메모·리뷰·스크린샷 컬럼은 페이로드에 없어서 유지된다.
        ignoreDuplicates: exchange !== "binance",
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
      message:
        mergedFills > 0
          ? `${inserted}건 저장, ${skipped}건 건너뜀, 갈라진 체결 ${mergedFills}건 합침`
          : `${inserted}건 저장, ${skipped}건 건너뜀`,
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
  const okxPass = (
    process.env.OKX_PASSPHRASE ??
    process.env.OKX_API_PASSPHRASE ??
    ""
  ).trim();
  if (
    process.env.OKX_API_KEY &&
    process.env.OKX_API_SECRET &&
    okxPass
  ) {
    exchanges.push("okx");
  } else if (process.env.OKX_API_KEY && process.env.OKX_API_SECRET && !okxPass) {
    results.push({
      exchange: "okx",
      fetched: 0,
      inserted: 0,
      skipped: 0,
      error:
        "OKX_PASSPHRASE 가 비어 있습니다. Vercel에 OKX_PASSPHRASE를 넣고 Redeploy 하세요.",
    });
  }

  if (exchanges.length === 0 && results.length === 0) {
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
