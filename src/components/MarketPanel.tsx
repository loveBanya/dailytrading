"use client";

import type { FearGreed, MarketTicker } from "@/lib/exchanges/market";
import { formatPrice } from "@/lib/utils/format";
import { fearGreedKo } from "@/lib/utils/labels";

interface MarketPanelProps {
  tickers: MarketTicker[];
  fearGreed: FearGreed | null;
  loading?: boolean;
  error?: string | null;
}

export function MarketPanel({
  tickers,
  fearGreed,
  loading,
  error,
}: MarketPanelProps) {
  if (loading) {
    return <p className="text-sm text-zinc-500">시장을 불러오는 중…</p>;
  }
  if (error) {
    return <p className="text-sm text-amber-300/80">{error}</p>;
  }

  return (
    <div className="space-y-5">
      {fearGreed && (
        <div className="flex flex-wrap items-end gap-4 rounded-md border border-zinc-800/80 bg-zinc-950/40 px-4 py-3">
          <div>
            <p className="text-[11px] text-zinc-500">공포·탐욕 지수</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-zinc-50">
              {fearGreed.value}
            </p>
          </div>
          <div className="pb-1">
            <p className={`text-sm font-medium ${fearColor(fearGreed.value)}`}>
              {fearGreedKo(fearGreed.classification)}
            </p>
            <p className="text-[11px] text-zinc-600">
              {new Date(fearGreed.updatedAt).toLocaleString("ko-KR")}
            </p>
          </div>
          <div className="ml-auto h-2 w-40 max-w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400"
              style={{ width: `${fearGreed.value}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tickers.map((t) => {
          const up = t.change24h >= 0;
          const name = t.symbol.replace(/USDT$/i, "");
          return (
            <div
              key={t.symbol}
              className="rounded-md border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-200">{name}</span>
                <span
                  className={`text-xs tabular-nums ${
                    up ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {up ? "+" : ""}
                  {t.change24h.toFixed(2)}%
                </span>
              </div>
              <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-50">
                {formatPrice(t.lastPrice)}
              </p>
              <p className="mt-0.5 text-[10px] text-zinc-600">
                고가 {formatPrice(t.high24h)} · 저가 {formatPrice(t.low24h)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fearColor(v: number): string {
  if (v <= 25) return "text-rose-400";
  if (v <= 45) return "text-orange-400";
  if (v <= 55) return "text-zinc-300";
  if (v <= 75) return "text-lime-400";
  return "text-emerald-400";
}
