import { NextRequest, NextResponse } from "next/server";
import { evaluateWatchAssets } from "@/lib/screener/scan";
import type { ScreenerExchange, WatchAsset } from "@/lib/screener/types";
import { errorMessage } from "@/lib/utils/labels";
import {
  makeWatchAsset,
  normalizeWatchSymbol,
} from "@/lib/screener/watchlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const preferredRegion = ["sin1", "hnd1", "icn1"];

interface Body {
  assets?: Array<{
    exchange: ScreenerExchange;
    symbol: string;
    label?: string;
  }>;
  timeframe?: "5m" | "15m" | "1h";
}

/** POST /api/screener/evaluate — 지정 종목을 스크리너와 동일 점수로 평가 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const raw = body.assets ?? [];
    if (raw.length === 0) {
      return NextResponse.json({ error: "assets 필요" }, { status: 400 });
    }
    if (raw.length > 20) {
      return NextResponse.json(
        { error: "한 번에 최대 20개까지 평가할 수 있습니다" },
        { status: 400 }
      );
    }

    const assets: WatchAsset[] = raw.map((a) => {
      const exchange = a.exchange;
      if (exchange !== "binance" && exchange !== "bybit" && exchange !== "yahoo") {
        throw new Error(`지원하지 않는 거래소: ${String(a.exchange)}`);
      }
      const symbol = normalizeWatchSymbol(exchange, a.symbol);
      if (!symbol) throw new Error("symbol 필요");
      return makeWatchAsset(exchange, symbol, a.label || symbol);
    });

    // KOSPI caret
    for (let i = 0; i < assets.length; i++) {
      const a = assets[i]!;
      if (a.exchange === "yahoo" && a.symbol.replace("^", "") === "KS11") {
        assets[i] = {
          id: "yahoo:^KS11",
          exchange: "yahoo",
          symbol: "^KS11",
          label: a.label || "코스피",
        };
      }
    }

    const result = await evaluateWatchAssets(
      assets,
      body.timeframe ?? "15m"
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
