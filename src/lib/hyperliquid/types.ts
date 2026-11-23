export type HlSide = "LONG" | "SHORT";

/** 첫 동기화 때 이미 열려 있던 포지션 이벤트 표시 */
export const INITIAL_SNAPSHOT_NOTE = "초기 스냅샷";

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
  /** 리더보드/포트폴리오 기준 성과 */
  pnl_day?: number | null;
  roi_day?: number | null;
  pnl_week?: number | null;
  roi_week?: number | null;
  pnl_month?: number | null;
  roi_month?: number | null;
  pnl_all_time?: number | null;
  roi_all_time?: number | null;
  volume_month?: number | null;
  perf_synced_at?: string | null;
}

export type HlTrustTone = "good" | "mixed" | "weak" | "unknown";

export interface HlTrustSummary {
  tone: HlTrustTone;
  label: string;
  detail: string;
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
  volumeMonth: number | null;
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

/** 같은 트레이더·코인·방향의 연속 진입 체결을 하나로 묶은 것 */
export interface HlRecentEntry {
  traderId: string;
  label: string | null;
  address: string;
  coin: string;
  side: HlSide;
  kind: "OPEN" | "FLIP";
  size: number;
  avgPx: number;
  notional: number;
  fills: number;
  firstTime: number;
  lastTime: number;
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
