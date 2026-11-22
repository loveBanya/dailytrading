import type {
  HlClearinghouseSnapshot,
  HlFill,
  HlLeaderboardRow,
  HlLivePosition,
  HlPortfolioPoint,
  HlPortfolioSlice,
  HlSide,
} from "./types";

const INFO_URL = "https://api.hyperliquid.xyz/info";
const LEADERBOARD_URL =
  "https://stats-data.hyperliquid.xyz/Mainnet/leaderboard";

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export function normalizeHlAddress(address: string): string | null {
  const trimmed = address.trim();
  if (!ADDR_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function postInfo<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Hyperliquid info ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

interface HlAssetPosition {
  type?: string;
  position?: {
    coin?: string;
    szi?: string | number;
    entryPx?: string | number;
    positionValue?: string | number;
    unrealizedPnl?: string | number;
    liquidationPx?: string | number | null;
    leverage?: { type?: string; value?: number };
    markPx?: string | number;
  };
}

interface HlClearinghouseRaw {
  marginSummary?: {
    accountValue?: string | number;
  };
  assetPositions?: HlAssetPosition[];
  time?: number;
}

function parsePosition(raw: HlAssetPosition): HlLivePosition | null {
  const p = raw.position;
  if (!p?.coin) return null;
  const szi = num(p.szi);
  if (szi == null || szi === 0) return null;
  const side: HlSide = szi > 0 ? "LONG" : "SHORT";
  const size = Math.abs(szi);
  const positionValue = num(p.positionValue);
  const markFromValue =
    positionValue != null && size > 0 ? positionValue / size : null;
  return {
    coin: p.coin,
    side,
    size,
    entryPrice: num(p.entryPx),
    markPrice: num(p.markPx) ?? markFromValue,
    unrealisedPnl: num(p.unrealizedPnl),
    leverage: num(p.leverage?.value),
    liquidationPx: num(p.liquidationPx),
    positionValue,
    raw,
  };
}

export async function fetchClearinghouseState(
  address: string
): Promise<HlClearinghouseSnapshot> {
  const raw = await postInfo<HlClearinghouseRaw>({
    type: "clearinghouseState",
    user: address,
  });
  const positions = (raw.assetPositions ?? [])
    .map(parsePosition)
    .filter((p): p is HlLivePosition => p != null);
  return {
    accountValue: num(raw.marginSummary?.accountValue),
    positions,
    raw,
  };
}

export async function fetchUserFills(
  address: string,
  aggregateByTime = true
): Promise<HlFill[]> {
  const raw = await postInfo<
    Array<{
      coin?: string;
      px?: string | number;
      sz?: string | number;
      side?: string;
      time?: number;
      dir?: string;
      closedPnl?: string | number;
      fee?: string | number;
      hash?: string;
    }>
  >({
    type: "userFills",
    user: address,
    aggregateByTime,
  });
  if (!Array.isArray(raw)) return [];
  return raw.map((f) => ({
    coin: f.coin ?? "",
    px: num(f.px) ?? 0,
    sz: num(f.sz) ?? 0,
    side: f.side ?? "",
    time: f.time ?? 0,
    dir: f.dir ?? "",
    closedPnl: num(f.closedPnl) ?? 0,
    fee: num(f.fee) ?? 0,
    hash: f.hash ?? "",
  }));
}

function parseHistory(
  pairs: Array<[number, string | number]> | undefined
): HlPortfolioPoint[] {
  if (!Array.isArray(pairs)) return [];
  return pairs
    .map(([time, value]) => ({
      time: Number(time),
      value: num(value) ?? 0,
    }))
    .filter((p) => Number.isFinite(p.time));
}

export async function fetchPortfolio(
  address: string
): Promise<HlPortfolioSlice[]> {
  const raw = await postInfo<
    Array<
      [
        string,
        {
          accountValueHistory?: Array<[number, string | number]>;
          pnlHistory?: Array<[number, string | number]>;
          vlm?: string | number;
        },
      ]
    >
  >({ type: "portfolio", user: address });

  if (!Array.isArray(raw)) return [];
  return raw.map(([window, data]) => ({
    window,
    accountValueHistory: parseHistory(data?.accountValueHistory),
    pnlHistory: parseHistory(data?.pnlHistory),
    volume: num(data?.vlm),
  }));
}

export interface HlCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export async function fetchCandles(
  coin: string,
  interval: string,
  startTime: number,
  endTime: number
): Promise<HlCandle[]> {
  const raw = await postInfo<
    Array<{ t?: number; o?: string; h?: string; l?: string; c?: string }>
  >({
    type: "candleSnapshot",
    req: { coin, interval, startTime, endTime },
  });
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => ({
      time: Math.floor((c.t ?? 0) / 1000),
      open: num(c.o) ?? 0,
      high: num(c.h) ?? 0,
      low: num(c.l) ?? 0,
      close: num(c.c) ?? 0,
    }))
    .filter((c) => c.time > 0 && c.close > 0);
}

interface LeaderboardWindow {
  pnl?: string | number;
  roi?: string | number;
  vlm?: string | number;
}

interface LeaderboardRowRaw {
  ethAddress?: string;
  displayName?: string | null;
  accountValue?: string | number;
  windowPerformances?: Array<[string, LeaderboardWindow]>;
}

function windowMap(
  rows: Array<[string, LeaderboardWindow]> | undefined
): Record<string, LeaderboardWindow> {
  const out: Record<string, LeaderboardWindow> = {};
  for (const [k, v] of rows ?? []) out[k] = v;
  return out;
}

export async function fetchLeaderboard(
  limit = 30
): Promise<HlLeaderboardRow[]> {
  const res = await fetch(LEADERBOARD_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Hyperliquid leaderboard ${res.status}`);
  }
  const json = (await res.json()) as {
    leaderboardRows?: LeaderboardRowRaw[];
  };
  const rows = json.leaderboardRows ?? [];
  return rows.slice(0, Math.max(1, Math.min(limit, 100))).map((r) => {
    const w = windowMap(r.windowPerformances);
    return {
      address: (r.ethAddress ?? "").toLowerCase(),
      displayName: r.displayName ?? null,
      accountValue: num(r.accountValue),
      pnlDay: num(w.day?.pnl),
      pnlWeek: num(w.week?.pnl),
      pnlMonth: num(w.month?.pnl),
      pnlAllTime: num(w.allTime?.pnl),
      volumeDay: num(w.day?.vlm),
      roiDay: num(w.day?.roi),
      roiWeek: num(w.week?.roi),
      roiMonth: num(w.month?.roi),
      roiAllTime: num(w.allTime?.roi),
    };
  });
}
