import type { ClosedPosition } from "./types";
import {
  baseAssetFromSymbol,
  hmacSha256,
  inferStatus,
} from "@/lib/utils/format";

const BYBIT_BASE =
  process.env.BYBIT_BASE_URL ?? "https://api.bybit.com";

interface BybitClosedPnlItem {
  orderId: string;
  symbol: string;
  side: "Buy" | "Sell";
  qty: string;
  orderPrice: string;
  avgEntryPrice: string;
  avgExitPrice: string;
  closedPnl: string;
  fillCount: string;
  leverage: string;
  createdTime: string;
  updatedTime: string;
  orderType?: string;
  execType?: string;
}

interface BybitResponse {
  retCode: number;
  retMsg: string;
  result?: {
    list?: BybitClosedPnlItem[];
    nextPageCursor?: string;
  };
}

function signBybit(
  apiKey: string,
  apiSecret: string,
  timestamp: string,
  query: string
): string {
  const recvWindow = "5000";
  const payload = `${timestamp}${apiKey}${recvWindow}${query}`;
  return hmacSha256(apiSecret, payload);
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
  const apiKey = process.env.BYBIT_API_KEY;
  const apiSecret = process.env.BYBIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("BYBIT_API_KEY / BYBIT_API_SECRET 환경변수가 필요합니다.");
  }

  const limit = options?.limit ?? 50;
  const params = new URLSearchParams({
    category: "linear",
    limit: String(limit),
  });

  if (options?.symbol) params.set("symbol", options.symbol);
  if (options?.startTime) params.set("startTime", String(options.startTime));
  if (options?.endTime) params.set("endTime", String(options.endTime));

  const query = params.toString();
  const timestamp = Date.now().toString();
  const signature = signBybit(apiKey, apiSecret, timestamp, query);

  const res = await fetch(`${BYBIT_BASE}/v5/position/closed-pnl?${query}`, {
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-SIGN": signature,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": "5000",
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Bybit API HTTP ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as BybitResponse;
  if (data.retCode !== 0) {
    throw new Error(`Bybit API 오류: ${data.retMsg} (${data.retCode})`);
  }

  const list = data.result?.list ?? [];

  return list.map((item): ClosedPosition => {
    // Bybit closed-pnl: side는 청산 주문 방향
    // Buy 청산 = 숏 포지션 종료, Sell 청산 = 롱 포지션 종료
    const side = item.side === "Sell" ? "LONG" : "SHORT";
    const entryPrice = Number(item.avgEntryPrice);
    const exitPrice = Number(item.avgExitPrice);
    const pnl = Number(item.closedPnl);
    const qty = Number(item.qty);
    const entryTime = new Date(Number(item.createdTime));
    const exitTime = new Date(Number(item.updatedTime));
    const notional = entryPrice * qty;
    const pnlPercent =
      notional > 0 ? (pnl / notional) * 100 * Number(item.leverage || 1) : undefined;

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
