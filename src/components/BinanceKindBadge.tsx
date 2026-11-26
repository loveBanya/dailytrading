"use client";

import type { BinanceAssetKind } from "@/lib/market/binance-kind";

/** 바이낸스 기준 Crypto / TradFi 구분 뱃지 — 항상 둘 중 하나 표시 */
export function BinanceKindBadge({
  kind,
  className = "",
}: {
  kind?: BinanceAssetKind | "stock" | "crypto" | null;
  className?: string;
}) {
  const tradifi = kind === "tradifi" || kind === "stock";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-1 py-px text-[9px] font-medium uppercase tracking-wide ${
        tradifi
          ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30"
          : "bg-sky-500/10 text-sky-300/90 ring-1 ring-sky-500/25"
      } ${className}`}
      title={
        tradifi
          ? "바이낸스 TradFi 영구선물 (토큰화 주식·상품 등)"
          : "바이낸스 일반 코인 영구선물"
      }
    >
      {tradifi ? "TradFi" : "Crypto"}
    </span>
  );
}
