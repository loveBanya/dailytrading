"use client";

import { useEffect, useState } from "react";
import type { MarketTicker } from "@/lib/exchanges/market";
import { priceFmt } from "./risk-calc";

export function SymbolSearch({
  onPick,
  className = "",
  flow = false,
  placeholder = "검색",
}: {
  onPick: (ticker: MarketTicker) => void;
  className?: string;
  /** 스크롤되는 팝업 안에서는 목록을 아래로 밀어 잘리지 않게 한다 */
  flow?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MarketTicker[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    const id = window.setTimeout(() => {
      setLoading(true);
      void fetch(`/api/market?q=${encodeURIComponent(q)}`, { signal: ac.signal })
        .then(async (res) => {
          const data = (await res.json()) as {
            tickers?: MarketTicker[];
            error?: string;
          };
          if (data.error) throw new Error(data.error);
          setHits(data.tickers ?? []);
          setOpen(true);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setHits([]);
          setOpen(true);
        })
        .finally(() => {
          if (!ac.signal.aborted) setLoading(false);
        });
    }, 180);
    return () => {
      ac.abort();
      window.clearTimeout(id);
    };
  }, [query]);

  async function choose(row: MarketTicker) {
    onPick(row);
    setQuery("");
    setHits([]);
    setOpen(false);
    try {
      const res = await fetch(`/api/market?symbols=${encodeURIComponent(row.symbol)}`);
      const data = (await res.json()) as { tickers?: MarketTicker[] };
      const full = data.tickers?.find((t) => t.symbol === row.symbol);
      if (full && full.lastPrice > 0) onPick(full);
    } catch {
      /* 현재가는 이미 넣었다 */
    }
  }

  return (
    <div className={`relative min-w-28 ${className}`}>
      <input
        value={query}
        placeholder={placeholder}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (hits.length > 0) setOpen(true);
        }}
        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-sky-500/50"
      />
      {open && query.trim() && (
        <ul
          className={`z-40 max-h-44 overflow-auto rounded-md border border-zinc-700 bg-zinc-950 py-1 shadow-lg ${
            flow ? "mt-1 w-full" : "absolute left-0 top-full mt-1 w-44"
          }`}
        >
          {loading && hits.length === 0 && (
            <li className="px-2 py-1 text-[11px] text-zinc-500">찾는 중…</li>
          )}
          {!loading && hits.length === 0 && (
            <li className="px-2 py-1 text-[11px] text-zinc-500">없음</li>
          )}
          {hits.map((ticker) => (
            <li key={ticker.symbol}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void choose(ticker)}
                className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-[11px] tabular-nums text-zinc-200 hover:bg-zinc-800"
              >
                <span>{ticker.symbol.replace(/USDT$/, "")}</span>
                <span className="text-zinc-400">
                  {ticker.lastPrice > 0 ? priceFmt(ticker.lastPrice) : "—"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
