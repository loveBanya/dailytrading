"use client";

import { useEffect, useMemo, useState } from "react";
import type { BinanceAssetKind } from "@/lib/market/binance-kind";

/** 심볼 목록 → 바이낸스 Crypto/TradFi 맵 */
export function useBinanceKinds(symbols: string[]): Map<string, BinanceAssetKind> {
  const key = useMemo(() => {
    const norm = [
      ...new Set(
        symbols
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean)
          .map((s) => (s.endsWith("USDT") ? s : `${s}USDT`))
      ),
    ].sort();
    return norm.join(",");
  }, [symbols]);

  const [map, setMap] = useState<Map<string, BinanceAssetKind>>(() => new Map());

  useEffect(() => {
    if (!key) {
      setMap(new Map());
      return;
    }
    let cancel = false;
    void fetch(`/api/market/binance-kinds?symbols=${encodeURIComponent(key)}`)
      .then(async (res) => {
        const data = (await res.json()) as {
          kinds?: Record<string, BinanceAssetKind>;
        };
        if (!res.ok || cancel) return;
        const next = new Map<string, BinanceAssetKind>();
        for (const [k, v] of Object.entries(data.kinds ?? {})) {
          next.set(k, v);
          if (k.endsWith("USDT")) next.set(k.slice(0, -4), v);
        }
        setMap(next);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancel = true;
    };
  }, [key]);

  return map;
}

export function kindOf(
  map: Map<string, BinanceAssetKind>,
  symbol: string
): BinanceAssetKind | null {
  const s = symbol.trim().toUpperCase();
  return map.get(s) ?? map.get(s.endsWith("USDT") ? s : `${s}USDT`) ?? null;
}
