"use client";

import { useEffect, useState } from "react";
import type { FearGreed, MarketTicker } from "@/lib/exchanges/market";
import type { Candle } from "@/lib/exchanges/klines";
import { formatPrice } from "@/lib/utils/format";
import { fearGreedKo } from "@/lib/utils/labels";
import { TradeChart } from "./TradeChart";

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
  const [selected, setSelected] = useState<MarketTicker | null>(null);

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

      <p className="text-[11px] text-zinc-600">
        코인을 클릭하면 TradingView lightweight-charts로 최근 차트가 열립니다
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tickers.map((t) => {
          const up = t.change24h >= 0;
          const name = t.symbol.replace(/USDT$/i, "");
          const active = selected?.symbol === t.symbol;
          return (
            <button
              key={t.symbol}
              type="button"
              onClick={() =>
                setSelected((prev) =>
                  prev?.symbol === t.symbol ? null : t
                )
              }
              className={`rounded-md border bg-zinc-950/40 px-3 py-2.5 text-left transition ${
                active
                  ? "border-sky-500/50 ring-1 ring-sky-400/40"
                  : "border-zinc-800/80 hover:border-zinc-600"
              }`}
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
            </button>
          );
        })}
      </div>

      {selected && (
        <SymbolChartPanel
          ticker={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function SymbolChartPanel({
  ticker,
  onClose,
}: {
  ticker: MarketTicker;
  onClose: () => void;
}) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [interval, setIntervalTf] = useState("15");
  const name = ticker.symbol.replace(/USDT$/i, "");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const end = Date.now();
        const start = end - 48 * 60 * 60 * 1000;
        const qs = new URLSearchParams({
          symbol: ticker.symbol,
          start: String(start),
          end: String(end),
          interval,
          limit: "200",
          exchange: "auto",
        });
        const res = await fetch(`/api/klines?${qs}`);
        const data = (await res.json()) as {
          candles?: Candle[];
          error?: string;
        };
        if (data.error) throw new Error(data.error);
        if (!cancelled) setCandles(data.candles ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "차트 로드 실패");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ticker.symbol, interval]);

  const last = candles[candles.length - 1];

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-medium text-zinc-100">
            {name}
            <span className="ml-2 text-xs font-normal text-zinc-500">
              {ticker.symbol}
            </span>
          </h4>
          <p className="text-xs text-zinc-500">
            최근 가격 {formatPrice(ticker.lastPrice)} · 24h{" "}
            <span
              className={
                ticker.change24h >= 0 ? "text-emerald-400" : "text-rose-400"
              }
            >
              {ticker.change24h >= 0 ? "+" : ""}
              {ticker.change24h.toFixed(2)}%
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={interval}
            onChange={(e) => setIntervalTf(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
          >
            <option value="5">5분</option>
            <option value="15">15분</option>
            <option value="60">1시간</option>
            <option value="240">4시간</option>
          </select>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400"
          >
            닫기
          </button>
        </div>
      </div>

      {loading && <p className="text-sm text-zinc-500">차트 로딩…</p>}
      {error && <p className="text-sm text-amber-300/80">{error}</p>}
      {!loading && !error && candles.length === 0 && (
        <p className="text-sm text-zinc-500">캔들 데이터 없음</p>
      )}
      {candles.length > 0 && (
        <div className="overflow-hidden rounded-md border border-zinc-800 bg-white">
          <TradeChart
            candles={candles}
            height={360}
            levels={{
              entry: last?.close ?? ticker.lastPrice,
              live: true,
              entryTime: last?.time,
            }}
          />
        </div>
      )}
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
