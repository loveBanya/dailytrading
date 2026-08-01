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

/**
 * Bybit V5 청산 PnL 조회
 * https://bybit-exchange.github.io/docs/v5/position/close-pnl
 */
export async function fetchBybitClosedPositions(options?: {
  symbol?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
}): Promise<ClosedPosition[]> {
  const params: Record<string, string> = {
    category: "linear",
    limit: String(options?.limit ?? 50),
  };

  if (options?.symbol) params.symbol = options.symbol;
  if (options?.startTime) params.startTime = String(options.startTime);
  if (options?.endTime) params.endTime = String(options.endTime);

  const result = await bybitPrivateGet<ClosedPnlResult>(
    "/v5/position/closed-pnl",
    params
  );

  return (result.list ?? []).map((item): ClosedPosition => {
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
  });
}
