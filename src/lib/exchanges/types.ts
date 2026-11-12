export type Exchange = "bybit" | "binance" | "okx";

/** 당분간 안 쓰는 거래소. 지갑·포지션·동기화에서 뺀다. 지난 매매 기록은 그대로 남는다. */
export const PAUSED_EXCHANGES: readonly Exchange[] = ["bybit", "okx"];

export function isExchangePaused(exchange: Exchange): boolean {
  return PAUSED_EXCHANGES.includes(exchange);
}

export type TradeSide = "LONG" | "SHORT";
export type TradeStatus = "TP" | "SL" | "CLOSED" | "LIQUIDATED";

/** 거래소에서 가져온 청산 포지션 (통일 포맷) */
export interface ClosedPosition {
  externalId: string;
  exchange: Exchange;
  symbol: string;
  baseAsset: string;
  side: TradeSide;
  qty: number;
  entryPrice: number;
  exitPrice: number;
  leverage?: number;
  pnl: number;
  pnlPercent?: number;
  fee?: number;
  status: TradeStatus;
  entryTime: Date;
  exitTime: Date;
  raw?: unknown;
}

/** DB trades 테이블 행 */
export interface Trade {
  id: string;
  exchange: Exchange;
  external_id: string;
  symbol: string;
  base_asset: string | null;
  side: TradeSide;
  qty: number;
  entry_price: number;
  exit_price: number;
  leverage: number | null;
  pnl: number;
  pnl_percent: number | null;
  fee: number | null;
  status: TradeStatus;
  entry_time: string;
  exit_time: string;
  duration_minutes: number | null;
  notes: string | null;
  screenshot_url: string | null;
  tags: string[] | null;
  is_review?: boolean;
  /** 원칙매매 | 뇌동 */
  trade_style?: "원칙" | "뇌동" | null;
  /** 댓글+답글 수 (목록 API에서 부착) */
  comment_count?: number;
  /** 거래소 원본. 바이낸스는 fillCount(청산 체결 수)가 들어 있다 */
  raw?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface SyncResult {
  exchange: Exchange;
  fetched: number;
  inserted: number;
  skipped: number;
  error?: string;
}
