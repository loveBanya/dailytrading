import { NextRequest, NextResponse } from "next/server";
import { binancePublicAdapter } from "@/lib/screener/adapters/binance-public";
import { errorMessage } from "@/lib/utils/labels";
import {
  DEFAULT_WATCH_ASSETS,
  WATCH_ALIASES,
  makeWatchAsset,
  normalizeWatchSymbol,
} from "@/lib/screener/watchlist";
import type { WatchAsset } from "@/lib/screener/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["sin1", "hnd1", "icn1"];

const YAHOO_SEARCH = "https://query1.finance.yahoo.com/v1/finance/search";

interface YahooSearchHit {
  symbol: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchDisp?: string;
}

/** GET /api/screener/search?q= */
export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length < 1) {
      return NextResponse.json({ results: DEFAULT_WATCH_ASSETS });
    }

    const lower = q.toLowerCase();
    const results: WatchAsset[] = [];
    const seen = new Set<string>();

    function push(asset: WatchAsset) {
      if (seen.has(asset.id)) return;
      seen.add(asset.id);
      results.push(asset);
    }

    for (const alias of WATCH_ALIASES) {
      if (alias.keys.some((k) => k.includes(lower) || lower.includes(k))) {
        push(alias.asset);
      }
    }

    // Binance USDT perps
    try {
      const universe = await binancePublicAdapter.listUniverse();
      const needle = q.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const hits = universe
        .filter((t) => {
          const base = t.baseAsset.toUpperCase();
          const sym = t.symbol.toUpperCase();
          return (
            base.includes(needle) ||
            sym.includes(needle) ||
            sym.startsWith(needle)
          );
        })
        .sort((a, b) => b.turnover24h - a.turnover24h)
        .slice(0, 12);

      for (const t of hits) {
        push(
          makeWatchAsset(
            "binance",
            t.symbol,
            t.baseAsset
          )
        );
      }

      // Exact crypto add: "PEPE" → PEPEUSDT
      if (needle && results.length < 15) {
        const sym = normalizeWatchSymbol("binance", needle);
        if (universe.some((t) => t.symbol === sym)) {
          push(makeWatchAsset("binance", sym, sym.replace(/USDT$/i, "")));
        }
      }
    } catch {
      /* ignore crypto search failure */
    }

    // Yahoo search for stocks/ETFs/indices
    try {
      const url = `${YAHOO_SEARCH}?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`;
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
        },
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { quotes?: YahooSearchHit[] };
        for (const hit of data.quotes ?? []) {
          if (!hit.symbol) continue;
          const qt = (hit.quoteType ?? "").toUpperCase();
          if (
            qt &&
            !["EQUITY", "ETF", "INDEX", "MUTUALFUND"].includes(qt)
          ) {
            continue;
          }
          push({
            id: `yahoo:${hit.symbol}`,
            exchange: "yahoo",
            symbol: hit.symbol,
            label:
              hit.shortname ||
              hit.longname ||
              hit.symbol,
          });
        }
      }
    } catch {
      /* ignore */
    }

    // Direct ticker fallback as yahoo if nothing else
    if (results.length === 0) {
      const yahooSym = normalizeWatchSymbol("yahoo", q);
      if (yahooSym) {
        push(makeWatchAsset("yahoo", yahooSym, yahooSym));
      }
    }

    return NextResponse.json({ results: results.slice(0, 20) });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
