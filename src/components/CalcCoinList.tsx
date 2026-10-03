"use client";

import type { MarketTicker } from "@/lib/exchanges/market";
import { priceFmt } from "./risk-calc";
import { SymbolSearch } from "./SymbolSearch";
import {
  isPinnedCalcCoin,
  getCalcCoinSnapshot,
  loadCalcCoinPrices,
  removeCalcCoin,
  upsertCalcCoin,
  useCalcCoins,
  type CalcCoin,
} from "./useCalcCoins";
import { useRiskCalc } from "./useRiskCalc";

export function CalcCoinList({
  folded = false,
  flow = false,
}: {
  folded?: boolean;
  flow?: boolean;
}) {
  const book = useCalcCoins();
  const { coin, applyListedCoin, refreshEntry } = useRiskCalc();

  function onPick(ticker: MarketTicker) {
    const saved = upsertCalcCoin(ticker);
    if (!saved || !(ticker.lastPrice > 0)) return;
    applyListedCoin(saved.unit, ticker.lastPrice, saved.qtyUnit);
  }

  async function onRefresh() {
    await loadCalcCoinPrices();
    const latest = getCalcCoinSnapshot();
    const active = latest.coins.find((row) => row.unit === coin);
    const px = active ? latest.prices[active.symbol] : 0;
    if (px && px > 0) refreshEntry(px);
  }

  function select(row: CalcCoin) {
    const px = book.prices[row.symbol];
    if (!(px > 0)) return;
    applyListedCoin(row.unit, px, row.qtyUnit);
  }

  return (
    <div className={folded ? "flex flex-col gap-1.5" : "space-y-1.5"}>
      <button
        type="button"
        title="고른 코인의 현재가를 다시 불러옵니다"
        onClick={() => void onRefresh()}
        disabled={book.refreshing || book.coins.length === 0}
        className={`rounded-md border border-zinc-700 text-zinc-300 hover:text-zinc-100 disabled:opacity-40 ${
          folded ? "px-2 py-1 text-[11px]" : "px-2.5 py-1 text-[11px]"
        }`}
      >
        {book.refreshing ? "불러오는 중" : "새로고침"}
      </button>
      {book.error && (
        <p className="text-[10px] leading-snug text-rose-300">{book.error}</p>
      )}
      <div className={folded ? "flex flex-col gap-1" : "flex flex-wrap gap-1.5"}>
        {book.coins.map((row) => {
          const px = book.prices[row.symbol];
          const on = coin === row.unit;
          return (
            <div
              key={row.symbol}
              className={`min-w-0 items-center overflow-hidden rounded-md border ${
                folded ? "flex w-full" : "inline-flex max-w-full"
              } ${
                on
                  ? "border-sky-500/50 bg-sky-500/15"
                  : "border-zinc-700"
              }`}
            >
              <button
                type="button"
                disabled={!(px > 0)}
                onClick={() => select(row)}
                className={`flex min-w-0 items-center justify-between gap-1 px-2 py-1 text-left text-[11px] tabular-nums transition disabled:opacity-40 ${
                  folded ? "flex-1" : ""
                } ${on ? "text-sky-100" : "text-zinc-300 hover:text-zinc-100"}`}
              >
                <span className="truncate">{row.label}</span>
                <span className={on ? "shrink-0 text-sky-200" : "shrink-0 text-zinc-400"}>
                  {px > 0 ? priceFmt(px) : "…"}
                </span>
              </button>
              {!isPinnedCalcCoin(row.symbol) && (
                <button
                  type="button"
                  aria-label={`${row.label} 지우기`}
                  onClick={() => removeCalcCoin(row.symbol)}
                  className={`shrink-0 px-1.5 py-1 text-[11px] ${
                    on ? "text-sky-200 hover:text-white" : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
      <SymbolSearch
        onPick={onPick}
        flow={flow || folded}
        placeholder="코인 검색"
        className={folded ? "w-full" : "max-w-full"}
      />
    </div>
  );
}
