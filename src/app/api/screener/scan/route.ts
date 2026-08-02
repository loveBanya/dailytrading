import { NextRequest, NextResponse } from "next/server";
import { EXCHANGE_API_REGIONS } from "@/lib/exchanges/regions";
import { persistSignals } from "@/lib/screener/persist";
import { runScreenerScan } from "@/lib/screener/scan";
import type { ScanFilters, StrategyId } from "@/lib/screener/types";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const preferredRegion = [...EXCHANGE_API_REGIONS];

function parseFilters(req: NextRequest): Partial<ScanFilters> {
  const sp = req.nextUrl.searchParams;
  const num = (k: string) => {
    const v = sp.get(k);
    return v != null && v !== "" ? Number(v) : undefined;
  };
  const strategies = sp.get("strategies");
  return {
    exchange: (sp.get("exchange") as ScanFilters["exchange"]) || undefined,
    timeframe: (sp.get("timeframe") as ScanFilters["timeframe"]) || undefined,
    direction: (sp.get("direction") as ScanFilters["direction"]) || undefined,
    strategies: strategies
      ? (strategies.split(",").filter(Boolean) as StrategyId[])
      : undefined,
    minTurnover24h: num("minTurnover24h"),
    minVolMult: num("minVolMult"),
    minScore: num("minScore"),
    minStars: num("minStars"),
    maxChange15m: num("maxChange15m"),
    maxDrop15m: num("maxDrop15m"),
    rsiMin: num("rsiMin"),
    rsiMax: num("rsiMax"),
    fundingMin: num("fundingMin"),
    fundingMax: num("fundingMax"),
    minOiChange: num("minOiChange"),
    minRr: num("minRr"),
    topN: num("topN"),
    saveSignals: sp.get("saveSignals") === "0" ? false : undefined,
  };
}

/** GET /api/screener/scan */
export async function GET(req: NextRequest) {
  try {
    const filters = parseFilters(req);
    // MVP speed: cap topN at 40 for scan latency unless explicitly higher
    if (filters.topN == null) filters.topN = 40;
    filters.topN = Math.min(filters.topN, 80);

    const result = await runScreenerScan(filters);
    let saved = 0;
    if (result.filters.saveSignals !== false) {
      saved = await persistSignals(result.candidates, result.filters.minScore);
    }

    return NextResponse.json({ ...result, saved });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
