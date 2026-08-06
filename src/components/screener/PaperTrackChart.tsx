"use client";

import { useEffect, useState } from "react";
import type { Candle } from "@/lib/exchanges/klines";
import { TradeChart } from "@/components/TradeChart";
import { formatKst } from "@/lib/utils/format";

export interface PaperChartTarget {
  id: string;
  exchange: string;
  symbol: string;
  direction: string;
  entry_price: number;
  entry_at: string;
  last_price: number | null;
  ret_pct: number | null;
  track_type?: string;
}

interface PaperTrackChartProps {
  paper: PaperChartTarget;
  onClose?: () => void;
}

export function PaperTrackChart({ paper, onClose }: PaperTrackChartProps) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const side = paper.direction.startsWith("SHORT") ? "SHORT" : "LONG";
  const asset = paper.symbol.replace(/USDT$/i, "");
  const entryMs = new Date(paper.entry_at).getTime();
  const now = Date.now();
  const exitPrice = paper.last_price ?? paper.entry_price;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const holdMin = Math.max(30, (now - entryMs) / 60_000);
        const interval =
          holdMin <= 90 ? "1" : holdMin <= 360 ? "5" : holdMin <= 1440 ? "15" : "60";
        const start = entryMs - 2 * 60 * 60 * 1000;
        const end = now + 30 * 60 * 1000;
        const qs = new URLSearchParams({
          symbol: paper.symbol,
          start: String(start),
          end: String(end),
          interval,
          limit: "500",
          exchange:
            paper.exchange === "binance"
              ? "binance"
              : paper.exchange === "bybit"
                ? "bybit"
                : "auto",
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
          const list = await fetchKlinesBrowser({
            symbol: paper.symbol,
            start,
            end,
            interval,
            limit: 500,
          });
          if (!cancelled) setCandles(list);
          return;
        }
        if (!cancelled) setCandles(data.candles ?? []);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "차트 로드 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when paper id changes
  }, [paper.id, paper.symbol, paper.exchange, paper.entry_at]);

  const ret = paper.ret_pct != null ? Number(paper.ret_pct) : null;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
        <div className="text-sm">
          <span className="font-semibold text-zinc-50">{asset}</span>
          <span
            className={`ml-2 font-semibold ${
              side === "LONG" ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {side === "LONG" ? "롱" : "숏"}
          </span>
          <span className="ml-2 text-zinc-500">가상투자 차트</span>
          {paper.track_type && (
            <span className="ml-2 text-xs text-zinc-600">{paper.track_type}</span>
          )}
          <p className="mt-0.5 text-xs text-zinc-500">
            진입 {formatKst(paper.entry_at)} · {Number(paper.entry_price)} →{" "}
            {exitPrice}
            {ret != null && (
              <span
                className={`ml-2 font-medium ${
                  ret >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {ret >= 0 ? "+" : ""}
                {ret.toFixed(2)}%
              </span>
            )}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200"
          >
            닫기
          </button>
        )}
      </div>
      <div className="p-3">
        {loading && (
          <p className="py-16 text-center text-sm text-zinc-500">차트 불러오는 중…</p>
        )}
        {error && (
          <p className="py-8 text-center text-sm text-amber-300/80">{error}</p>
        )}
        {!loading && !error && candles.length > 0 && (
          <TradeChart
            candles={candles}
            height={360}
            levels={{
              entry: Number(paper.entry_price),
              exit: Number(exitPrice),
              entryTime: Math.floor(entryMs / 1000),
              exitTime: Math.floor(now / 1000),
              side,
              live: true,
            }}
          />
        )}
        {!loading && !error && candles.length === 0 && (
          <p className="py-12 text-center text-sm text-zinc-500">캔들 없음</p>
        )}
      </div>
    </div>
  );
}
