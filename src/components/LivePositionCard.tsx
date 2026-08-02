"use client";

import { useEffect, useState } from "react";
import type { OpenPosition } from "@/lib/exchanges/wallet";
import type { Candle } from "@/lib/exchanges/klines";
import { formatPnl } from "@/lib/utils/format";
import { TradeChart } from "./TradeChart";

interface LivePositionCardProps {
  position: OpenPosition;
}

export function LivePositionCard({ position }: LivePositionCardProps) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);

  const asset = position.symbol.replace(/USDT$/i, "");
  const sideLabel = position.side === "LONG" ? "롱" : "숏";
  const isWin = position.unrealisedPnl >= 0;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const end = Date.now();
        const start = end - 12 * 60 * 60 * 1000;
        const qs = new URLSearchParams({
          symbol: position.symbol,
          start: String(start),
          end: String(end),
          interval: "15",
          limit: "100",
          exchange: position.exchange === "binance" ? "binance" : "auto",
        });
        const res = await fetch(`/api/klines?${qs}`);
        const data = (await res.json()) as {
          candles?: Candle[];
          error?: string;
        };
        if (data.error || !res.ok) {
          const { fetchKlinesBrowser } = await import(
            "@/lib/exchanges/klines-browser"
          );
          const candles = await fetchKlinesBrowser({
            symbol: position.symbol,
            start,
            end,
            interval: "15",
            limit: 100,
          });
          if (!cancelled) setCandles(candles);
          return;
        }
        if (!cancelled) setCandles(data.candles ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [position.symbol]);

  return (
    <article className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-800 px-5 py-4">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">
          {asset}{" "}
          <span
            className={
              position.side === "LONG" ? "text-emerald-400" : "text-rose-400"
            }
          >
            {sideLabel}
          </span>
          <span className="mx-2 text-zinc-600">·</span>
          <span className="text-amber-400">진행중</span>
          <span className="mx-2 text-zinc-600">·</span>
          <span className={isWin ? "text-emerald-400" : "text-rose-400"}>
            미실현 {formatPnl(position.unrealisedPnl)}
          </span>
          <span className="mx-2 text-zinc-600">·</span>
          <span className="text-zinc-400">{position.leverage}배</span>
        </h2>
      </div>
      <div className="bg-white p-3 sm:p-4">
        {loading && candles.length === 0 ? (
          <div className="flex h-[420px] items-center justify-center text-sm text-zinc-400">
            차트 불러오는 중…
          </div>
        ) : candles.length > 0 ? (
          <TradeChart
            candles={candles}
            height={360}
            levels={{
              entry: position.avgPrice,
              exit: position.markPrice,
              tp: position.takeProfit,
              sl: position.stopLoss,
              side: position.side,
              live: true,
            }}
          />
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-zinc-400">
            캔들 데이터 없음
          </div>
        )}
      </div>
    </article>
  );
}
