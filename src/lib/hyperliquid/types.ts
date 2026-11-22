export type HlSide = "LONG" | "SHORT";

export type HlEventType =
  | "OPEN"
  | "INCREASE"
  | "DECREASE"
  | "CLOSE"
  | "FLIP";

export interface HlTrader {
  id: string;
  address: string;
  label: string | null;
  note: string | null;
  is_active: boolean;
  account_value: number | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HlOpenPosition {
  id: string;
  trader_id: string;
  coin: string;
  side: HlSide;
  size: number;
  entry_price: number | null;
  mark_price: number | null;
  unrealised_pnl: number | null;
  leverage: number | null;
  liquidation_px: number | null;
  position_value: number | null;
  raw: unknown;
  opened_at: string | null;
  updated_at: string;
}

export interface HlPositionEvent {
  id: string;
  trader_id: string;
  coin: string;
  side: HlSide;
  event_type: HlEventType;
  size_before: number | null;
  size_after: number | null;
  entry_price: number | null;
  mark_price: number | null;
  unrealised_pnl: number | null;
  note: string | null;
  observed_at: string;
  raw: unknown;
}

export interface HlLivePosition {
  coin: string;
  side: HlSide;
  size: number;
  entryPrice: number | null;
  markPrice: number | null;
  unrealisedPnl: number | null;
  leverage: number | null;
  liquidationPx: number | null;
  positionValue: number | null;
  raw: unknown;
}

export interface HlClearinghouseSnapshot {
  accountValue: number | null;
  positions: HlLivePosition[];
  raw: unknown;
}

export interface HlLeaderboardRow {
  address: string;
  displayName: string | null;
  accountValue: number | null;
  pnlDay: number | null;
  pnlWeek: number | null;
  pnlMonth: number | null;
  pnlAllTime: number | null;
  volumeDay: number | null;
  roiDay: number | null;
  roiWeek: number | null;
  roiMonth: number | null;
  roiAllTime: number | null;
}

export interface HlFill {
  coin: string;
  px: number;
  sz: number;
  side: "A" | "B" | string;
  time: number;
  dir: string;
  closedPnl: number;
  fee: number;
  hash: string;
}

export interface HlPortfolioPoint {
  time: number;
  value: number;
}

export interface HlPortfolioSlice {
  window: string;
  accountValueHistory: HlPortfolioPoint[];
  pnlHistory: HlPortfolioPoint[];
  volume: number | null;
}
