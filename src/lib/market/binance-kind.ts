import { withCache, TTL } from "@/lib/screener/cache";

const FAPI = "https://fapi.binance.com";

export type BinanceAssetKind = "crypto" | "tradifi";

interface ExchangeInfo {
  symbols: Array<{
    symbol: string;
    status: string;
    contractType: string;
    quoteAsset: string;
  }>;
}

let memoryMap: Map<string, BinanceAssetKind> | null = null;

async function loadKindMap(): Promise<Map<string, BinanceAssetKind>> {
  if (memoryMap) return memoryMap;
  const info = await withCache("binance:kindMap:v1", TTL.instruments, async () => {
    const res = await fetch(`${FAPI}/fapi/v1/exchangeInfo`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`exchangeInfo ${res.status}`);
    return (await res.json()) as ExchangeInfo;
  });

  const map = new Map<string, BinanceAssetKind>();
  for (const s of info.symbols) {
    if (s.quoteAsset !== "USDT") continue;
    if (
      s.contractType === "TRADIFI_PERPETUAL" ||
      s.contractType === "TRADITIONAL_PERPETUAL"
    ) {
      map.set(s.symbol, "tradifi");
    } else if (
      s.contractType === "PERPETUAL" ||
      s.status === "TRADING"
    ) {
      // PERPETUAL crypto; also mark known trading symbols as crypto default
      if (!map.has(s.symbol)) map.set(s.symbol, "crypto");
    }
  }
  // TradFi override already set; ensure TRADIFI wins
  for (const s of info.symbols) {
    if (s.contractType === "TRADIFI_PERPETUAL") {
      map.set(s.symbol, "tradifi");
    }
  }
  memoryMap = map;
  return map;
}

export async function binanceAssetKind(
  symbol: string
): Promise<BinanceAssetKind | null> {
  const sym = symbol.trim().toUpperCase();
  const map = await loadKindMap();
  return map.get(sym) ?? map.get(`${sym}USDT`) ?? null;
}

export async function binanceAssetKindMap(
  symbols: string[]
): Promise<Map<string, BinanceAssetKind>> {
  const map = await loadKindMap();
  const out = new Map<string, BinanceAssetKind>();
  for (const raw of symbols) {
    const sym = raw.trim().toUpperCase();
    const kind = map.get(sym) ?? map.get(sym.endsWith("USDT") ? sym : `${sym}USDT`);
    if (kind) out.set(sym, kind);
  }
  return out;
}

export function binanceKindLabel(kind: BinanceAssetKind | null | undefined): string {
  if (kind === "tradifi") return "TradFi";
  if (kind === "crypto") return "Crypto";
  return "—";
}
