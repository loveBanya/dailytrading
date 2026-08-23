import type { ExchangePublicAdapter } from "./adapters/types";
import {
  binanceCacheAges,
  binancePublicAdapter,
} from "./adapters/binance-public";
import {
  bybitCacheAges,
  bybitPublicAdapter,
} from "./adapters/bybit-public";
import {
  resolveYahooTicker,
  yahooPublicAdapter,
} from "./adapters/yahoo-public";
import { withConcurrency } from "./cache";
import { filterUniverse, takeTop } from "./filters";
import {
  completedCandles,
  INTERVAL_MS,
  pctChange,
} from "./indicators";
import { computeLevels, computeTurtleLevels } from "./levels";
import {
  aggregateScores,
  buildTfMetrics,
  scoreStrategies,
} from "./strategies";
import type {
  ScanFilters,
  ScanResult,
  ScreenerCandidate,
  ScreenerExchange,
  Timeframe,
  UniverseTicker,
  WatchAsset,
} from "./types";
import { DEFAULT_FILTERS } from "./types";
import { normalizeWatchSymbol } from "./watchlist";

function adaptersFor(
  exchange: ScanFilters["exchange"]
): ExchangePublicAdapter[] {
  if (exchange === "binance") return [binancePublicAdapter];
  if (exchange === "bybit") return [bybitPublicAdapter];
  return [binancePublicAdapter, bybitPublicAdapter];
}

function emaState(m: { ema20: number; ema50: number; ema200: number }): string {
  if (m.ema20 > m.ema50 && m.ema50 > m.ema200) return "상승정렬";
  if (m.ema20 < m.ema50 && m.ema50 < m.ema200) return "하락정렬";
  return "혼조";
}

function macdState(cross: "golden" | "dead" | null, rising: boolean): string {
  if (cross === "golden") return "골든크로스";
  if (cross === "dead") return "데드크로스";
  return rising ? "히스토그램↑" : "히스토그램↓";
}

function bbState(m: {
  last: { close: number };
  bbUpper: number;
  bbLower: number;
  bbWidthExpanding: boolean;
}): string {
  if (m.last.close > m.bbUpper) return "상단돌파";
  if (m.last.close < m.bbLower) return "하단이탈";
  return m.bbWidthExpanding ? "밴드확대" : "밴드보통";
}

export type AnalyzeMode = "scan" | "evaluate";

async function analyzeSymbol(
  adapter: ExchangePublicAdapter,
  ticker: UniverseTicker,
  filters: ScanFilters,
  mode: AnalyzeMode = "scan"
): Promise<ScreenerCandidate | null> {
  const tf = filters.timeframe;
  const evaluate = mode === "evaluate";
  const [c5, c15, c1h, c4h] = await Promise.all([
    adapter.fetchKlines(ticker.symbol, "5m", 100),
    adapter.fetchKlines(ticker.symbol, "15m", 250),
    adapter.fetchKlines(ticker.symbol, "1h", 250),
    adapter.fetchKlines(ticker.symbol, "4h", 120),
  ]);

  const m5c = completedCandles(c5, INTERVAL_MS["5m"]);
  const m15c = completedCandles(c15, INTERVAL_MS["15m"]);
  const m1hc = completedCandles(c1h, INTERVAL_MS["1h"]);
  const m4hc = completedCandles(c4h, INTERVAL_MS["4h"]);

  const m5 = buildTfMetrics(m5c);
  const m15 = buildTfMetrics(m15c);
  const m1h = buildTfMetrics(m1hc);
  const m4h = buildTfMetrics(m4hc);
  if (!m15 || !m1h) return null;

  // volume gate A/B — 지정 평가 모드는 스킵
  if (!evaluate) {
    const condA = m1h.volMult >= filters.minVolMult;
    const prev15Vol =
      m15c.length >= 2 ? m15c[m15c.length - 2].volume : m15.last.volume;
    const condB =
      prev15Vol > 0 && m15.last.volume >= prev15Vol * 1.5;
    if (!condA && !condB && m15.volMult < filters.minVolMult) {
      if (m15.volMult < 1.2) return null;
    }
  }

  const [fundingRate, oiChangePct] = await Promise.all([
    adapter.fetchFundingRate(ticker.symbol),
    adapter.fetchOpenInterestChangePct(ticker.symbol),
  ]);

  const change5m = m5
    ? pctChange(m5c[m5c.length - 2]?.close ?? m5.last.close, m5.last.close)
    : 0;
  const change15m = m15.changePct;
  const change1h =
    m1hc.length >= 2
      ? pctChange(m1hc[m1hc.length - 2].close, m1h.last.close)
      : ticker.change24hPct;

  const strategies = scoreStrategies({
    m15,
    m1h,
    m5,
    m4h,
    oiChangePct,
    fundingRate,
    change15m,
    change1h,
    change24h: ticker.change24hPct,
    price: ticker.lastPrice,
    turnover24h: ticker.turnover24h,
    minVolMult: filters.minVolMult,
  });

  // preliminary side for levels
  const prelimLong =
    strategies.filter((s) => s.side === "LONG").reduce((a, s) => a + s.score, 0) >=
    strategies.filter((s) => s.side === "SHORT").reduce((a, s) => a + s.score, 0);
  const levels = computeLevels(prelimLong ? "LONG" : "SHORT", m15, m15.atr);

  const agg = aggregateScores(strategies, {
    m15,
    m1h,
    change15m,
    change1h,
    change24h: ticker.change24hPct,
    fundingRate,
    oiChangePct,
    filters: {
      maxChange15m: filters.maxChange15m,
      maxDrop15m: filters.maxDrop15m,
      minRr: filters.minRr,
    },
    rr1: levels.rr1,
  });

  // recompute levels for final direction
  const finalSide =
    agg.direction.startsWith("SHORT") ? "SHORT" : "LONG";
  let finalLevels =
    finalSide === (prelimLong ? "LONG" : "SHORT")
      ? levels
      : computeLevels(finalSide, m15, m15.atr);

  const turtle = strategies.find((s) => s.id === "turtle_donchian");
  if (
    turtle &&
    turtle.score >= 55 &&
    (turtle.side === "LONG" || turtle.side === "SHORT")
  ) {
    finalLevels = computeTurtleLevels(turtle.side, m15);
  }

  if (!evaluate) {
    if (filters.strategies.length > 0) {
      const hit = strategies.some(
        (s) =>
          filters.strategies.includes(s.id) &&
          s.score >= 55 &&
          s.side !== "NEUTRAL"
      );
      if (!hit) return null;
    }

    if (filters.direction === "LONG" && !agg.direction.startsWith("LONG"))
      return null;
    if (filters.direction === "SHORT" && !agg.direction.startsWith("SHORT"))
      return null;

    if (agg.scoreTotal < filters.minScore) return null;
    if (agg.stars < filters.minStars) return null;
    if (m15.rsi < filters.rsiMin || m15.rsi > filters.rsiMax) return null;
  }

  const breakoutState =
    m15.last.close > m15.high20
      ? "고점돌파"
      : m15.last.close < m15.low20
        ? "저점이탈"
        : "구간내";

  return {
    exchange: ticker.exchange,
    symbol: ticker.symbol,
    baseAsset: ticker.baseAsset,
    price: m15.last.close,
    direction: agg.direction,
    label: agg.label,
    stars: agg.stars,
    scoreTotal: agg.scoreTotal,
    scoreLong: agg.scoreLong,
    scoreShort: agg.scoreShort,
    strongestStrategy: agg.strongest,
    strategyScores: strategies.sort((a, b) => b.score - a.score),
    change5m: Number(change5m.toFixed(2)),
    change15m: Number(change15m.toFixed(2)),
    change1h: Number(change1h.toFixed(2)),
    change24h: Number(ticker.change24hPct.toFixed(2)),
    volMult: Number(m15.volMult.toFixed(2)),
    turnoverMult: Number(m15.turnoverMult.toFixed(2)),
    turnover24h: ticker.turnover24h,
    oiChangePct:
      oiChangePct != null ? Number(oiChangePct.toFixed(2)) : null,
    fundingRate,
    rsi: Number(m15.rsi.toFixed(1)),
    macdState: macdState(m15.macdCross, m15.macdHistRising),
    emaState: emaState(m15),
    bbState: bbState(m15),
    atr: Number(m15.atr.toFixed(6)),
    atrChange: Number(
      (((m15.atr - m15.atrPrev) / (m15.atrPrev || m15.atr)) * 100).toFixed(1)
    ),
    breakoutState,
    entryPrice: finalLevels.entry,
    stopPrice: finalLevels.stop,
    tp1: finalLevels.tp1,
    tp2: finalLevels.tp2,
    rr1: finalLevels.rr1,
    rr2: finalLevels.rr2,
    reasons: agg.reasons,
    risks: agg.risks,
    candleCloseTime: m15.last.time,
    timeframe: tf,
    signalAt: new Date().toISOString(),
    takerBuyRatio: m15.takerBuyRatio,
    support: finalLevels.support,
    resistance: finalLevels.resistance,
  };
}

async function loadExclusionKeys(): Promise<Set<string>> {
  try {
    const { createSupabaseAdmin } = await import("@/lib/supabase/client");
    const supabase = createSupabaseAdmin();
    const { data } = await supabase
      .from("screener_exclusions")
      .select("exchange,symbol");
    return new Set(
      (data ?? []).map((r) => `${r.exchange}:${String(r.symbol).toUpperCase()}`)
    );
  } catch {
    return new Set();
  }
}

export async function runScreenerScan(
  partial?: Partial<ScanFilters>
): Promise<ScanResult> {
  const filters: ScanFilters = { ...DEFAULT_FILTERS, ...partial };
  const adapters = adaptersFor(filters.exchange);
  const errors: string[] = [];
  const exchanges = adapters.map((a) => a.exchange);
  const excluded = await loadExclusionKeys();

  const universes: UniverseTicker[] = [];
  for (const adapter of adapters) {
    try {
      const list = await adapter.listUniverse();
      universes.push(...list);
    } catch (err) {
      errors.push(
        `${adapter.exchange} universe: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const filtered = filterUniverse(universes, filters.minTurnover24h).filter(
    (t) => !excluded.has(`${t.exchange}:${t.symbol.toUpperCase()}`)
  );
  const top = takeTop(filtered, filters.topN);

  // Prefer analyzing by adapter match
  const tasks = top.map((ticker) => {
    const adapter =
      adapters.find((a) => a.exchange === ticker.exchange) ?? adapters[0];
    return async () => {
      try {
        return await analyzeSymbol(adapter, ticker, filters);
      } catch (err) {
        errors.push(
          `${ticker.exchange}:${ticker.symbol} ${err instanceof Error ? err.message : String(err)}`
        );
        return null;
      }
    };
  });

  const results = await withConcurrency(4, tasks);
  const candidates = results
    .filter((r): r is ScreenerCandidate => !!r && !(r instanceof Error))
    .sort((a, b) => b.scoreTotal - a.scoreTotal);

  const primary =
    filters.exchange === "bybit" ? bybitCacheAges() : binanceCacheAges();

  return {
    candidates,
    filters,
    meta: {
      scannedAt: new Date().toISOString(),
      exchanges,
      universeSize: filtered.length,
      analyzed: top.length,
      cache: primary,
      errors: errors.slice(0, 30),
    },
  };
}

export function getAdapter(exchange: ScreenerExchange): ExchangePublicAdapter {
  if (exchange === "bybit") return bybitPublicAdapter;
  if (exchange === "yahoo") return yahooPublicAdapter;
  return binancePublicAdapter;
}

export async function evaluateWatchAssets(
  assets: WatchAsset[],
  timeframe: ScanFilters["timeframe"] = "15m"
): Promise<{
  candidates: ScreenerCandidate[];
  errors: string[];
  scannedAt: string;
}> {
  const filters: ScanFilters = {
    ...DEFAULT_FILTERS,
    timeframe,
    strategies: [],
    minScore: 0,
    minStars: 0,
    minVolMult: 0,
    direction: "ALL",
  };
  const errors: string[] = [];

  const tasks = assets.map((asset) => {
    return async (): Promise<ScreenerCandidate | null> => {
      try {
        const adapter = getAdapter(asset.exchange);
        let ticker: UniverseTicker | null = null;

        if (asset.exchange === "yahoo") {
          ticker = await resolveYahooTicker(asset.symbol);
        } else {
          const universe = await adapter.listUniverse();
          const sym = normalizeWatchSymbol(asset.exchange, asset.symbol);
          ticker =
            universe.find((t) => t.symbol.toUpperCase() === sym) ?? null;
          if (!ticker) {
            ticker = {
              exchange: asset.exchange,
              symbol: sym,
              baseAsset: asset.label || sym.replace(/USDT$/i, ""),
              lastPrice: 0,
              change24hPct: 0,
              turnover24h: 0,
              high24h: 0,
              low24h: 0,
            };
          }
        }

        if (!ticker) {
          errors.push(`${asset.label}: 시세를 찾지 못했습니다`);
          return null;
        }

        // 표시용 라벨을 baseAsset에 반영
        ticker = { ...ticker, baseAsset: asset.label || ticker.baseAsset };

        const cand = await analyzeSymbol(adapter, ticker, filters, "evaluate");
        if (!cand) {
          errors.push(`${asset.label}: 캔들/지표 부족`);
          return null;
        }
        return { ...cand, baseAsset: asset.label || cand.baseAsset };
      } catch (err) {
        errors.push(
          `${asset.label}: ${err instanceof Error ? err.message : String(err)}`
        );
        return null;
      }
    };
  });

  const results = await withConcurrency(3, tasks);
  const candidates = results
    .filter((r): r is ScreenerCandidate => !!r && !(r instanceof Error))
    .sort((a, b) => b.scoreTotal - a.scoreTotal);

  return {
    candidates,
    errors: errors.slice(0, 30),
    scannedAt: new Date().toISOString(),
  };
}

export async function fetchSymbolDetail(
  exchange: ScreenerExchange,
  symbol: string,
  timeframe: Timeframe = "15m"
) {
  const adapter = getAdapter(exchange);
  const [c5, c15, c1h, c4h, funding, oi] = await Promise.all([
    adapter.fetchKlines(symbol, "5m", 100),
    adapter.fetchKlines(symbol, "15m", 250),
    adapter.fetchKlines(symbol, "1h", 250),
    adapter.fetchKlines(symbol, "4h", 120),
    adapter.fetchFundingRate(symbol),
    adapter.fetchOpenInterestChangePct(symbol),
  ]);
  return {
    candles: {
      "5m": completedCandles(c5, INTERVAL_MS["5m"]),
      "15m": completedCandles(c15, INTERVAL_MS["15m"]),
      "1h": completedCandles(c1h, INTERVAL_MS["1h"]),
      "4h": completedCandles(c4h, INTERVAL_MS["4h"]),
    },
    metrics: {
      "5m": buildTfMetrics(completedCandles(c5, INTERVAL_MS["5m"])),
      "15m": buildTfMetrics(completedCandles(c15, INTERVAL_MS["15m"])),
      "1h": buildTfMetrics(completedCandles(c1h, INTERVAL_MS["1h"])),
      "4h": buildTfMetrics(completedCandles(c4h, INTERVAL_MS["4h"])),
    },
    fundingRate: funding,
    oiChangePct: oi,
    timeframe,
  };
}
