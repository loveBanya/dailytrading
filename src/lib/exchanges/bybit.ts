import type { ClosedPosition } from "./types";
import {
  baseAssetFromSymbol,
  inferStatus,
} from "@/lib/utils/format";
import { bybitPrivateGet } from "./bybit-client";

interface BybitClosedPnlItem {
  orderId: string;
  symbol: string;
  side: "Buy" | "Sell";
  qty: string;
  avgEntryPrice: string;
  avgExitPrice: string;
  closedPnl: string;
  leverage: string;
  createdTime: string;
  updatedTime: string;
}

interface ClosedPnlResult {
  list?: BybitClosedPnlItem[];
  nextPageCursor?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Bybit closed-pnl 은 start~end 간격 최대 7일 */
const BYBIT_MAX_SPAN_MS = 7 * DAY_MS;

function mapBybitItem(item: BybitClosedPnlItem): ClosedPosition {
  const side = item.side === "Sell" ? "LONG" : "SHORT";
  const entryPrice = Number(item.avgEntryPrice);
  const exitPrice = Number(item.avgExitPrice);
  const pnl = Number(item.closedPnl);
  const qty = Number(item.qty);
  const entryTime = new Date(Number(item.createdTime));
  const exitTime = new Date(Number(item.updatedTime));
  const notional = entryPrice * qty;
  const pnlPercent =
    notional > 0
      ? (pnl / notional) * 100 * Number(item.leverage || 1)
      : undefined;

  return {
    externalId: item.orderId,
    exchange: "bybit",
    symbol: item.symbol,
    baseAsset: baseAssetFromSymbol(item.symbol),
    side,
    qty,
    entryPrice,
    exitPrice,
    leverage: item.leverage ? Number(item.leverage) : undefined,
    pnl,
    pnlPercent,
    status: inferStatus(side, entryPrice, exitPrice, pnl),
    entryTime,
    exitTime,
    raw: item,
  };
}

async function fetchBybitClosedPnlWindow(options: {
  symbol?: string;
  startTime: number;
  endTime: number;
  limit: number;
}): Promise<ClosedPosition[]> {
  const out: ClosedPosition[] = [];
  let cursor: string | undefined;
  const seen = new Set<string>();

  for (let page = 0; page < 10; page++) {
    const params: Record<string, string> = {
      category: "linear",
      limit: String(Math.min(options.limit, 100)),
      startTime: String(options.startTime),
      endTime: String(options.endTime),
    };
    if (options.symbol) params.symbol = options.symbol;
    if (cursor) params.cursor = cursor;

    const result = await bybitPrivateGet<ClosedPnlResult>(
      "/v5/position/closed-pnl",
      params
    );

    const list = result.list ?? [];
    for (const item of list) {
      const mapped = mapBybitItem(item);
      if (seen.has(mapped.externalId)) continue;
      seen.add(mapped.externalId);
      out.push(mapped);
    }

    cursor = result.nextPageCursor;
    if (!cursor || list.length === 0) break;
  }

  return out;
}

/**
 * Bybit V5 청산 PnL 조회
 * https://bybit-exchange.github.io/docs/v5/position/close-pnl
 * — 조회 구간은 7일 단위로 나눠서 요청
 */
export async function fetchBybitClosedPositions(options?: {
  symbol?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
}): Promise<ClosedPosition[]> {
  const end = options?.endTime ?? Date.now();
  const start = options?.startTime ?? end - BYBIT_MAX_SPAN_MS;
  const limit = options?.limit ?? 100;
  const all: ClosedPosition[] = [];
  const seen = new Set<string>();

  // 최근 구간부터 과거로
  let windowEnd = end;
  while (windowEnd > start) {
    const windowStart = Math.max(start, windowEnd - BYBIT_MAX_SPAN_MS);
    const chunk = await fetchBybitClosedPnlWindow({
      symbol: options?.symbol,
      startTime: windowStart,
      endTime: windowEnd,
      limit,
    });
    for (const p of chunk) {
      if (seen.has(p.externalId)) continue;
      seen.add(p.externalId);
      all.push(p);
    }
    windowEnd = windowStart - 1;
  }

  return all.sort((a, b) => b.exitTime.getTime() - a.exitTime.getTime());
}
