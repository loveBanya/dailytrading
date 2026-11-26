import { withCache, TTL } from "@/lib/screener/cache";
import { mapPool } from "@/lib/hyperliquid/rateLimit";
import { rsi } from "@/lib/backtest/indicators";
import { loadAltSeason } from "@/lib/market/alt-season";
import { fetchFearGreed } from "@/lib/exchanges/market";
import type { BinanceAssetKind } from "@/lib/market/binance-kind";

const FAPI = "https://fapi.binance.com";

export type MoverPeriod = "5m" | "30m" | "4h";

export interface MarketMover {
  symbol: string;
  base: string;
  lastPrice: number;
  changePct: number;
  change24hPct: number;
  turnover24h: number;
  oiChangePct: number | null;
  oiValueUsd: number | null;
  /** 바이낸스 기준 */
  assetKind: BinanceAssetKind;
}

export interface LongShortRow {
  label: string;
  ratio: number;
  changePct: number | null;
}

export interface IndexRow {
  label: string;
  value: string;
  changePct: number | null;
  note?: string;
}

export interface MarketOverviewMetrics {
  openInterestUsd: number | null;
  openInterestChangePct: number | null;
  avgRsi: number | null;
  altSeason: number | null;
  fearGreed: number | null;
  fearGreedLabel: string | null;
  btcDominance: number | null;
}

export interface MarketMoversPayload {
  period: MoverPeriod;
  surges: MarketMover[];
  oiRises: MarketMover[];
  longShort: LongShortRow[];
  indices: IndexRow[];
  metrics: MarketOverviewMetrics;
  updatedAt: string;
}

interface Ticker24h {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
}

interface ExchangeInfo {
  symbols: Array<{
    symbol: string;
    status: string;
    contractType: string;
    quoteAsset: string;
  }>;
}

function kindFromContract(contractType: string): BinanceAssetKind {
  return contractType === "TRADIFI_PERPETUAL" ||
    contractType === "TRADITIONAL_PERPETUAL"
    ? "tradifi"
    : "crypto";
}

interface OiHistRow {
  sumOpenInterest: string;
  sumOpenInterestValue: string;
  timestamp: number;
}

const SKIP = new Set([
  "USDCUSDT",
  "BUSDUSDT",
  "TUSDUSDT",
  "FDUSDUSDT",
  "EURUSDT",
]);

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

function baseOf(symbol: string): string {
  return symbol.replace(/USDT$/i, "");
}

function periodBars(period: MoverPeriod): {
  interval: string;
  bars: number;
  oiPeriod: string;
} {
  if (period === "5m") return { interval: "5m", bars: 2, oiPeriod: "5m" };
  if (period === "30m") return { interval: "5m", bars: 7, oiPeriod: "30m" };
  return { interval: "15m", bars: 17, oiPeriod: "4h" };
}

async function loadTickers(): Promise<
  Array<{
    symbol: string;
    lastPrice: number;
    change24hPct: number;
    turnover24h: number;
    assetKind: BinanceAssetKind;
  }>
> {
  const [info, tickers] = await Promise.all([
    withCache("cg:exchangeInfo", TTL.instruments, () =>
      getJson<ExchangeInfo>(`${FAPI}/fapi/v1/exchangeInfo`)
    ),
    getJson<Ticker24h[]>(`${FAPI}/fapi/v1/ticker/24hr`),
  ]);
  const meta = new Map(
    info.symbols
      .filter(
        (s) =>
          s.status === "TRADING" &&
          s.quoteAsset === "USDT" &&
          (s.contractType === "PERPETUAL" ||
            s.contractType === "TRADIFI_PERPETUAL")
      )
      .map((s) => [s.symbol, kindFromContract(s.contractType)] as const)
  );
  return tickers
    .filter((t) => meta.has(t.symbol) && !SKIP.has(t.symbol))
    .map((t) => ({
      symbol: t.symbol,
      lastPrice: Number(t.lastPrice),
      change24hPct: Number(t.priceChangePercent),
      turnover24h: Number(t.quoteVolume),
      assetKind: meta.get(t.symbol) ?? "crypto",
    }))
    .filter((t) => t.turnover24h > 0 && t.lastPrice > 0);
}

async function periodChangePct(
  symbol: string,
  interval: string,
  bars: number
): Promise<number | null> {
  try {
    const rows = await withCache(
      `cg:kl:${symbol}:${interval}:${bars}`,
      60_000,
      async () => {
        const qs = new URLSearchParams({
          symbol,
          interval,
          limit: String(Math.max(bars + 1, 3)),
        });
        return getJson<unknown[][]>(`${FAPI}/fapi/v1/klines?${qs}`);
      }
    );
    if (!rows || rows.length < bars) return null;
    const first = Number(rows[rows.length - bars]![1]); // open
    const last = Number(rows[rows.length - 1]![4]); // close
    if (!(first > 0)) return null;
    return ((last - first) / first) * 100;
  } catch {
    return null;
  }
}

async function oiStats(
  symbol: string,
  oiPeriod: string
): Promise<{ pct: number; valueUsd: number } | null> {
  try {
    const rows = await withCache(
      `cg:oi:${symbol}:${oiPeriod}`,
      TTL.oi,
      async () => {
        const qs = new URLSearchParams({
          symbol,
          period: oiPeriod,
          limit: "3",
        });
        return getJson<OiHistRow[]>(
          `${FAPI}/futures/data/openInterestHist?${qs}`
        );
      }
    );
    if (!rows || rows.length < 2) return null;
    const sorted = [...rows].sort((a, b) => a.timestamp - b.timestamp);
    const prev = Number(sorted[sorted.length - 2]!.sumOpenInterest);
    const last = Number(sorted[sorted.length - 1]!.sumOpenInterest);
    const valueUsd = Number(
      sorted[sorted.length - 1]!.sumOpenInterestValue || 0
    );
    if (!(prev > 0)) return null;
    return { pct: ((last - prev) / prev) * 100, valueUsd };
  } catch {
    return null;
  }
}

async function closesForRsi(symbol: string): Promise<number[]> {
  const rows = await withCache(`cg:rsi:${symbol}`, 120_000, async () => {
    const qs = new URLSearchParams({
      symbol,
      interval: "1h",
      limit: "80",
    });
    return getJson<unknown[][]>(`${FAPI}/fapi/v1/klines?${qs}`);
  });
  return (rows ?? []).map((r) => Number(r[4])).filter((n) => n > 0);
}

async function fetchLongShort(): Promise<LongShortRow[]> {
  const out: LongShortRow[] = [];
  async function one(
    path: string,
    label: string
  ): Promise<void> {
    try {
      const qs = new URLSearchParams({
        symbol: "BTCUSDT",
        period: "1h",
        limit: "2",
      });
      const rows = await getJson<
        Array<{ longShortRatio: string; timestamp: number }>
      >(`${FAPI}${path}?${qs}`);
      if (!rows?.length) return;
      const sorted = [...rows].sort((a, b) => a.timestamp - b.timestamp);
      const last = Number(sorted[sorted.length - 1]!.longShortRatio);
      const prev =
        sorted.length > 1
          ? Number(sorted[sorted.length - 2]!.longShortRatio)
          : null;
      const changePct =
        prev && prev > 0 ? ((last - prev) / prev) * 100 : null;
      out.push({ label, ratio: last, changePct });
    } catch {
      /* ignore */
    }
  }
  await Promise.all([
    one("/futures/data/topLongShortPositionRatio", "바이낸스 탑트레이더 포지션"),
    one("/futures/data/topLongShortAccountRatio", "바이낸스 탑트레이더 계정"),
    one("/futures/data/globalLongShortAccountRatio", "바이낸스 전체 계정"),
  ]);
  return out;
}

async function btcDominance(): Promise<number | null> {
  try {
    return await withCache("cg:btc.dom", 300_000, async () => {
      const json = await getJson<{
        data?: { market_cap_percentage?: { btc?: number } };
      }>("https://api.coingecko.com/api/v3/global");
      const v = json.data?.market_cap_percentage?.btc;
      return v != null && Number.isFinite(v) ? Number(v) : null;
    });
  } catch {
    return null;
  }
}

/**
 * Coinglass 스타일 보드 데이터 (바이낸스 공개 API 기반).
 */
export async function fetchMarketMovers(
  period: MoverPeriod = "4h"
): Promise<MarketMoversPayload> {
  return withCache(`cg:board:${period}:v2`, 90_000, async () => {
    const { interval, bars, oiPeriod } = periodBars(period);
    const all = await loadTickers();
    const candidates = [...all]
      .sort((a, b) => b.turnover24h - a.turnover24h)
      .slice(0, 50);

    const enriched = await mapPool(candidates, 4, async (t) => {
      const [chg, oi] = await Promise.all([
        periodChangePct(t.symbol, interval, bars),
        oiStats(t.symbol, oiPeriod),
      ]);
      return {
        symbol: t.symbol,
        base: baseOf(t.symbol),
        lastPrice: t.lastPrice,
        changePct: chg ?? t.change24hPct,
        change24hPct: t.change24hPct,
        turnover24h: t.turnover24h,
        oiChangePct: oi?.pct ?? null,
        oiValueUsd: oi?.valueUsd ?? null,
        assetKind: t.assetKind,
      } satisfies MarketMover;
    });

    const movers: MarketMover[] = [];
    for (const r of enriched) {
      if (r.status === "fulfilled") movers.push(r.value);
    }

    const surges = [...movers]
      .filter((m) => m.changePct >= 3 && m.turnover24h >= 1_500_000)
      .sort((a, b) => b.changePct - a.changePct)
      .slice(0, 15);

    const oiRises = [...movers]
      .filter(
        (m) =>
          m.oiChangePct != null &&
          m.oiChangePct >= 2 &&
          (m.oiValueUsd ?? 0) >= 500_000
      )
      .sort((a, b) => (b.oiChangePct ?? 0) - (a.oiChangePct ?? 0))
      .slice(0, 15);

    // 메트릭: OI 합(상위), RSI 평균, 알트시즌, F&G, 도미넌스
    let openInterestUsd: number | null = null;
    let openInterestChangePct: number | null = null;
    const oiVals = movers.filter((m) => m.oiValueUsd != null);
    if (oiVals.length) {
      openInterestUsd = oiVals.reduce((s, m) => s + (m.oiValueUsd ?? 0), 0);
      const w = oiVals.reduce(
        (s, m) => s + (m.oiValueUsd ?? 0) * (m.oiChangePct ?? 0),
        0
      );
      openInterestChangePct = w / openInterestUsd;
    }

    let avgRsi: number | null = null;
    try {
      const top10 = candidates.slice(0, 10);
      const rsiList: number[] = [];
      const rsiSettled = await mapPool(top10, 3, async (t) => {
        const closes = await closesForRsi(t.symbol);
        const series = rsi(closes, 14);
        const last = series[series.length - 1];
        return last;
      });
      for (const r of rsiSettled) {
        if (r.status === "fulfilled" && r.value != null) rsiList.push(r.value);
      }
      if (rsiList.length) {
        avgRsi = rsiList.reduce((a, b) => a + b, 0) / rsiList.length;
      }
    } catch {
      /* ignore */
    }

    let altSeason: number | null = null;
    try {
      altSeason = (await loadAltSeason()).score;
    } catch {
      /* ignore */
    }

    let fearGreed: number | null = null;
    let fearGreedLabel: string | null = null;
    try {
      const fg = await fetchFearGreed();
      if (fg) {
        fearGreed = fg.value;
        fearGreedLabel = fg.classification;
      }
    } catch {
      /* ignore */
    }

    const dominance = await btcDominance();
    const longShort = await fetchLongShort();

    const indices: IndexRow[] = [
      {
        label: "비트코인 도미넌스",
        value: dominance != null ? `${dominance.toFixed(2)}%` : "—",
        changePct: null,
      },
      {
        label: "공포·탐욕",
        value:
          fearGreed != null
            ? `${fearGreed}${fearGreedLabel ? ` (${fearGreedLabel})` : ""}`
            : "—",
        changePct: null,
      },
      {
        label: "알트 시즌",
        value: altSeason != null ? String(Math.round(altSeason)) : "—",
        changePct: null,
      },
      {
        label: `샘플 OI (${period})`,
        value:
          openInterestUsd != null ? `$${(openInterestUsd / 1e9).toFixed(2)}B` : "—",
        changePct: openInterestChangePct,
        note: "거래대금 상위 샘플 합",
      },
    ];

    return {
      period,
      surges,
      oiRises,
      longShort,
      indices,
      metrics: {
        openInterestUsd,
        openInterestChangePct,
        avgRsi,
        altSeason,
        fearGreed,
        fearGreedLabel,
        btcDominance: dominance,
      },
      updatedAt: new Date().toISOString(),
    };
  });
}
