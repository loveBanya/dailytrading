export type PaperAccountStatus = "active" | "paused" | "archived";
export type PaperStrategyMode = "indicator" | "copy";
export type PaperSide = "LONG" | "SHORT";
export type PaperFillAction = "OPEN" | "CLOSE" | "INCREASE" | "DECREASE";

export type IndicatorRule = "ema_cross" | "rsi_reclaim" | "macd_cross";

export interface IndicatorStrategyConfig {
  exchange?: "binance" | "bybit";
  symbol: string;
  interval?: "5m" | "15m" | "1h" | "4h";
  rule?: IndicatorRule;
  /** 계좌 현금 대비 진입 비중 (0~1) */
  riskPct?: number;
  /** 레버리지 (표시·노셔널용, 기본 1) */
  leverage?: number;
  emaFast?: number;
  emaSlow?: number;
  rsiLength?: number;
  rsiBuyBelow?: number;
  rsiSellAbove?: number;
  takeProfitPct?: number;
  stopLossPct?: number;
}

export interface CopyStrategyConfig {
  traderId: string;
  /** 원본 노셔널 대비 비율 (0~1+) */
  scale?: number;
  maxNotional?: number;
  /** 비우면 전체 코인 */
  coins?: string[];
}

export interface PaperAccount {
  id: string;
  name: string;
  starting_equity: number;
  cash: number;
  equity: number;
  currency: string;
  status: PaperAccountStatus;
  last_tick_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaperStrategy {
  id: string;
  account_id: string;
  name: string;
  mode: PaperStrategyMode;
  enabled: boolean;
  config: IndicatorStrategyConfig | CopyStrategyConfig | Record<string, unknown>;
  note: string | null;
  last_run_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaperPosition {
  id: string;
  account_id: string;
  strategy_id: string | null;
  exchange: string;
  symbol: string;
  side: PaperSide;
  qty: number;
  entry_price: number;
  mark_price: number | null;
  unrealised_pnl: number | null;
  notional: number | null;
  leverage: number;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  close_price: number | null;
  realised_pnl: number | null;
  meta: Record<string, unknown>;
  updated_at: string;
}

export interface PaperFill {
  id: string;
  account_id: string;
  strategy_id: string | null;
  position_id: string | null;
  exchange: string;
  symbol: string;
  side: PaperSide;
  action: PaperFillAction;
  qty: number;
  price: number;
  notional: number | null;
  fee: number;
  realised_pnl: number | null;
  reason: string | null;
  observed_at: string;
  meta: Record<string, unknown>;
}

export interface PaperEquitySnapshot {
  id: string;
  account_id: string;
  equity: number;
  cash: number;
  open_pnl: number;
  taken_at: string;
}

export interface PaperTickResult {
  strategiesRun: number;
  fillsCreated: number;
  accountsTouched: string[];
  errors: { strategyId: string; error: string }[];
  message: string;
}
