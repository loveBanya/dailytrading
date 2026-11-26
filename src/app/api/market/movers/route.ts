import { NextRequest, NextResponse } from "next/server";
import {
  fetchMarketMovers,
  type MoverPeriod,
} from "@/lib/market/movers";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const preferredRegion = ["sin1", "hnd1", "icn1"];

const PERIODS: MoverPeriod[] = ["5m", "30m", "4h"];

/** GET /api/market/movers?period=5m|30m|4h */
export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get("period") ?? "4h";
    const period = (PERIODS.includes(raw as MoverPeriod)
      ? raw
      : "4h") as MoverPeriod;
    const data = await fetchMarketMovers(period);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
