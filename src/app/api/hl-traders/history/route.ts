import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import {
  fetchPortfolio,
  fetchUserFills,
  normalizeHlAddress,
} from "@/lib/hyperliquid/client";
import { errorMessage } from "@/lib/utils/labels";
import type {
  HlFill,
  HlPortfolioSlice,
  HlPositionEvent,
  HlTrader,
} from "@/lib/hyperliquid/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REMOTE_CACHE_MS = 60_000;
const MAX_FILLS = 300;
const remoteCache = new Map<
  string,
  { at: number; fills?: HlFill[]; portfolio?: HlPortfolioSlice[] }
>();

async function cachedRemote(address: string, fills: boolean, portfolio: boolean) {
  const hit = remoteCache.get(address);
  const fresh = hit && Date.now() - hit.at < REMOTE_CACHE_MS;
  const entry = fresh ? { ...hit } : { at: Date.now() };
  if (fills && !entry.fills) {
    entry.fills = (await fetchUserFills(address)).slice(0, MAX_FILLS);
  }
  if (portfolio && !entry.portfolio) {
    entry.portfolio = await fetchPortfolio(address);
  }
  remoteCache.set(address, entry);
  return entry;
}

/**
 * GET /api/hl-traders/history?traderId=&limit=&fills=1&portfolio=1
 * traderId 없으면 관심 트레이더 전체 이벤트
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const traderId = sp.get("traderId");
    const limit = Math.min(
      500,
      Math.max(1, Number(sp.get("limit") ?? 100) || 100)
    );
    const wantFills = ["1", "true"].includes(sp.get("fills") ?? "");
    const wantPortfolio = ["1", "true"].includes(sp.get("portfolio") ?? "");

    const supabase = createSupabaseAdmin();

    if (!traderId) {
      const { data: events, error } = await supabase
        .from("hl_position_events")
        .select("*")
        .order("observed_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return NextResponse.json({
        trader: null,
        events: (events ?? []) as HlPositionEvent[],
        fills: null,
        portfolio: null,
      });
    }

    const { data: traderRow, error: traderErr } = await supabase
      .from("hl_traders")
      .select("*")
      .eq("id", traderId)
      .maybeSingle();

    if (traderErr) throw traderErr;
    if (!traderRow) {
      return NextResponse.json(
        { error: "트레이더를 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    const trader = traderRow as HlTrader;

    const { data: events, error: evErr } = await supabase
      .from("hl_position_events")
      .select("*")
      .eq("trader_id", traderId)
      .order("observed_at", { ascending: false })
      .limit(limit);

    if (evErr) throw evErr;

    const address = normalizeHlAddress(trader.address) ?? trader.address;
    const remote =
      wantFills || wantPortfolio
        ? await cachedRemote(address, wantFills, wantPortfolio)
        : null;

    return NextResponse.json({
      trader,
      events: (events ?? []) as HlPositionEvent[],
      fills: wantFills ? remote?.fills ?? [] : null,
      portfolio: wantPortfolio ? remote?.portfolio ?? [] : null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err) },
      { status: 500 }
    );
  }
}
