export type ScreenerExchange = "binance" | "bybit" | "yahoo";

/** 지정 종목 평가용 관심 목록 항목 */
export interface WatchAsset {
  /** exchange:symbol */
  id: string;
  exchange: ScreenerExchange;
  symbol: string;
  label: string;
}
export type Timeframe = "5m" | "15m" | "1h" | "4h";
export type Direction =
  | "LONG"
  | "SHORT"
  | "WAIT"
  | "LONG_CAUTION"
  | "SHORT_CAUTION";

export type StrategyId =
  | "volume_spike"
  | "trend_align"
  | "golden_cross"
  | "dead_cross"
  | "macd_momentum"
  | "ema200_macd_zero"
  | "breakout_high"
  | "breakdown_low"
  | "turtle_donchian"
  | "demand_supply"
  | "retest"
  | "pullback"
  | "overheat_revert"
  | "bb_expand"
  | "oi_increase"
  | "short_squeeze"
  | "long_squeeze"
  | "post_liq_bounce"
  | "volatility_expand";

export const STRATEGY_LABELS: Record<StrategyId, string> = {
  volume_spike: "거래량 폭증",
  trend_align: "추세 정렬",
  golden_cross: "골든크로스",
  dead_cross: "데드크로스",
  macd_momentum: "MACD 모멘텀",
  ema200_macd_zero: "EMA200·MACD0선",
  breakout_high: "고점 돌파",
  breakdown_low: "저점 이탈",
  turtle_donchian: "터틀·돈치안",
  demand_supply: "수요↑·공급↓",
  retest: "돌파 후 재테스트",
  pullback: "눌림목 반등",
  overheat_revert: "과열 후 되돌림",
  bb_expand: "볼린저밴드 확장",
  oi_increase: "OI 증가",
  short_squeeze: "숏 스퀴즈",
  long_squeeze: "롱 스퀴즈",
  post_liq_bounce: "청산 후 반등",
  volatility_expand: "변동성 증가",
};

export interface ScanFilters {
  exchange: ScreenerExchange | "all";
  timeframe: "5m" | "15m" | "1h";
  direction: "LONG" | "SHORT" | "ALL";
  strategies: StrategyId[];
  minTurnover24h: number;
  minVolMult: number;
  minScore: number;
  minStars: number;
  maxChange15m: number;
  maxDrop15m: number;
  rsiMin: number;
  rsiMax: number;
  fundingMin: number;
  fundingMax: number;
  minOiChange: number;
  minRr: number;
  topN: number;
  saveSignals: boolean;
}

export const DEFAULT_FILTERS: ScanFilters = {
  exchange: "binance",
  timeframe: "15m",
  direction: "ALL",
  strategies: [],
  minTurnover24h: 50_000_000,
  minVolMult: 2,
  minScore: 55,
  minStars: 1,
  maxChange15m: 8,
  maxDrop15m: 8,
  rsiMin: 0,
  rsiMax: 100,
  fundingMin: -0.001,
  fundingMax: 0.001,
  minOiChange: -100,
  minRr: 1.5,
  topN: 100,
  saveSignals: true,
};

export interface OhlcvCandle {
  time: number; // unix ms open time
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
  takerBuyVolume?: number;
}

export interface UniverseTicker {
  exchange: ScreenerExchange;
  symbol: string;
  baseAsset: string;
  lastPrice: number;
  change24hPct: number;
  turnover24h: number;
  high24h: number;
  low24h: number;
}

export interface StrategyScore {
  id: StrategyId;
  score: number;
  side: "LONG" | "SHORT" | "NEUTRAL";
  notes: string[];
}

export interface ScreenerCandidate {
  exchange: ScreenerExchange;
  symbol: string;
  baseAsset: string;
  price: number;
  direction: Direction;
  label: string;
  stars: number;
  scoreTotal: number;
  scoreLong: number;
  scoreShort: number;
  strongestStrategy: StrategyId | null;
  strategyScores: StrategyScore[];
  change5m: number;
  change15m: number;
  change1h: number;
  change24h: number;
  volMult: number;
  turnoverMult: number;
  turnover24h: number;
  oiChangePct: number | null;
  fundingRate: number | null;
  rsi: number;
  macdState: string;
  emaState: string;
  bbState: string;
  atr: number;
  atrChange: number;
  breakoutState: string;
  entryPrice: number | null;
  stopPrice: number | null;
  tp1: number | null;
  tp2: number | null;
  rr1: number | null;
  rr2: number | null;
  reasons: string[];
  risks: string[];
  candleCloseTime: number;
  timeframe: string;
  signalAt: string;
  takerBuyRatio: number | null;
  support: number | null;
  resistance: number | null;
}

export interface ScanMeta {
  scannedAt: string;
  exchanges: ScreenerExchange[];
  universeSize: number;
  analyzed: number;
  cache: {
    tickersAgeSec: number | null;
    klinesAgeSec: number | null;
    oiAgeSec: number | null;
    fundingAgeSec: number | null;
  };
  errors: string[];
}

export interface ScanResult {
  candidates: ScreenerCandidate[];
  meta: ScanMeta;
  filters: ScanFilters;
}
