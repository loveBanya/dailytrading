import { NextRequest, NextResponse } from "next/server";
import { chartWindow, fetchKlines } from "@/lib/exchanges/klines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["sin1", "hnd1", "icn1"];

/** GET /api/klines?symbol=ORDIUSDT&entry=&exit= ?ëŠ” start=&end=&interval= */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const symbol = sp.get("symbol");
    if (!symbol) {
      return NextResponse.json({ error: "symbol ?„ìš”" }, { status: 400 });
    }

    const entry = sp.get("entry") ? Number(sp.get("entry")) : undefined;
    const exit = sp.get("exit") ? Number(sp.get("exit")) : undefined;
    let interval = sp.get("interval") ?? undefined;
    let start = sp.get("start") ? Number(sp.get("start")) : undefined;
    let end = sp.get("end") ? Number(sp.get("end")) : undefined;
    const limit = sp.get("limit") ? Number(sp.get("limit")) : 200;

    if (entry && exit) {
      const win = chartWindow(entry, Math.max(exit, entry + 60_000));
      interval = interval ?? win.interval;
      start = start ?? win.start;
      end = end ?? win.end;
    }

    const candles = await fetchKlines({
      symbol,
      interval: interval ?? "5",
      start,
      end,
      limit,
      prefer:
        sp.get("exchange") === "binance"
          ? "binance"
          : sp.get("exchange") === "bybit"
            ? "bybit"
            : "auto",
    });

    return NextResponse.json({
      symbol,
      interval: interval ?? "5",
      candles,
      entry,
      exit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
