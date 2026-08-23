import { NextRequest, NextResponse } from "next/server";
import {
  runDemandSupplyRank,
  type DemandSupplyScope,
} from "@/lib/screener/demand-supply";
import type { ScreenerExchange } from "@/lib/screener/types";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const preferredRegion = ["sin1", "hnd1", "icn1"];

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const exchange = (sp.get("exchange") as ScreenerExchange | "all") || "binance";
    const scope = (sp.get("scope") as DemandSupplyScope) || "stock";
    const minTurnover24h = Number(sp.get("minTurnover24h") || 50000);
    const maxSymbols = Number(sp.get("maxSymbols") || 180);

    const result = await runDemandSupplyRank({
      exchange: exchange === "all" || exchange === "binance" || exchange === "bybit"
        ? exchange
        : "binance",
      scope:
        scope === "crypto" || scope === "all" || scope === "stock"
          ? scope
          : "stock",
      minTurnover24h: Number.isFinite(minTurnover24h) ? minTurnover24h : 50_000,
      maxSymbols: Number.isFinite(maxSymbols)
        ? Math.min(250, Math.max(20, maxSymbols))
        : 180,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err) },
      { status: 500 }
    );
  }
}
