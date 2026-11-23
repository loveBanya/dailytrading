import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import {
  aggregatePositions,
  compareBias,
  fetchMarketCoinCtx,
  longPct,
  accountLongPct,
  sampleCrowdBias,
  type CohortBias,
  type MarketCoinCtx,
} from "@/lib/hyperliquid/marketBias";
import { errorMessage } from "@/lib/utils/labels";
import type { HlOpenPosition, HlTrader } from "@/lib/hyperliquid/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_MS = 5 * 60_000;
let cache: {
  at: number;
  payload: unknown;
} | null = null;

export async function GET() {
  try {
    if (cache && Date.now() - cache.at < CACHE_MS) {
      return NextResponse.json(cache.payload);
    }

    const supabase = createSupabaseAdmin();
    const { data: traders, error: tErr } = await supabase
      .from("hl_traders")
      .select("id, address, label")
      .eq("is_active", true);
    if (tErr) throw tErr;

    const list = (traders ?? []) as Array<
      Pick<HlTrader, "id" | "address" | "label">
    >;
    const ids = list.map((t) => t.id);
    let positions: HlOpenPosition[] = [];
    if (ids.length > 0) {
      const { data: pos, error: pErr } = await supabase
        .from("hl_open_positions")
        .select("*")
        .in("trader_id", ids);
      if (pErr) throw pErr;
      positions = (pos ?? []) as HlOpenPosition[];
    }

    const watchAgg = aggregatePositions(
      positions.map((p) => ({
        coin: p.coin,
        side: p.side,
        position_value: p.position_value != null ? Number(p.position_value) : null,
        trader_id: p.trader_id,
      }))
    );

    const exclude = new Set(list.map((t) => t.address.toLowerCase()));
    const crowd = await sampleCrowdBias(40, exclude);

    const focusCoins = [
      ...new Set([
        ...watchAgg.byCoin.slice(0, 12).map((c) => c.coin),
        ...crowd.byCoin.slice(0, 8).map((c) => c.coin),
        "BTC",
        "ETH",
        "SOL",
        "HYPE",
      ]),
    ];
    const market = await fetchMarketCoinCtx(focusCoins);
    const marketByCoin = new Map(market.map((m) => [m.coin, m]));

    const watchPct = longPct(watchAgg.overall);
    const crowdPct = longPct(crowd.overall);
    const watchAccPct = accountLongPct(watchAgg.overall);
    const crowdAccPct = accountLongPct(crowd.overall);

    const coins = focusCoins
      .map((coin) => {
        const w = watchAgg.byCoin.find((c) => c.coin === coin);
        const c = crowd.byCoin.find((x) => x.coin === coin);
        const m = marketByCoin.get(coin) as MarketCoinCtx | undefined;
        const wPct = w ? longPct(w) : null;
        const cPct = c ? longPct(c) : null;
        return {
          coin,
          watch: w ?? null,
          crowd: c ?? null,
          market: m ?? null,
          watchLongPct: wPct,
          crowdLongPct: cPct,
          stance: compareBias(wPct, cPct),
        };
      })
      .filter(
        (r) =>
          (r.watch && r.watch.longUsd + r.watch.shortUsd > 0) ||
          (r.crowd && r.crowd.longUsd + r.crowd.shortUsd > 0) ||
          (r.market && r.market.openInterestUsd > 50_000_000)
      )
      .sort((a, b) => {
        const aw = (a.watch?.longUsd ?? 0) + (a.watch?.shortUsd ?? 0);
        const bw = (b.watch?.longUsd ?? 0) + (b.watch?.shortUsd ?? 0);
        return bw - aw;
      });

    const watch: CohortBias = {
      label: "관심 탑트레이더",
      sampleSize: list.length,
      overall: watchAgg.overall,
      byCoin: watchAgg.byCoin,
    };

    const payload = {
      watch,
      crowd,
      marketNote:
        "HL 전체 시장은 달러 롱=숏이 항상 같습니다(계약 구조). 대중 비율은 중형 계좌 샘플의 규모·계좌 수로 추정합니다.",
      overall: {
        watchLongPct: watchPct,
        crowdLongPct: crowdPct,
        watchAccountLongPct: watchAccPct,
        crowdAccountLongPct: crowdAccPct,
        stanceNotional: compareBias(watchPct, crowdPct),
        stanceAccounts: compareBias(watchAccPct, crowdAccPct),
      },
      coins,
      cachedAt: new Date().toISOString(),
    };

    cache = { at: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err) },
      { status: 500 }
    );
  }
}
