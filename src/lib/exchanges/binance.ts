import type { ClosedPosition } from "./types";
import {
  baseAssetFromSymbol,
  hmacSha256,
  inferStatus,
} from "@/lib/utils/format";

const BINANCE_BASE =
  process.env.BINANCE_BASE_URL ?? "https://fapi.binance.com";

interface BinanceIncome {
  symbol: string;
  incomeType: string;
  income: string;
  asset: string;
  info: string;
  time: number;
  tranId: number;
  tradeId: string;
}

interface BinanceUserTrade {
  symbol: string;
  id: number;
  orderId: number;
  side: "BUY" | "SELL";
  positionSide: "BOTH" | "LONG" | "SHORT";
  price: string;
  qty: string;
  realizedPnl: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  time: number;
  buyer: boolean;
  maker: boolean;
}

function signBinance(apiSecret: string, query: string): string {
  return hmacSha256(apiSecret, query);
}

export async function binanceGet<T>(
  path: string,
  params: Record<string, string | number> = {}
): Promise<T> {
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error(
      "BINANCE_API_KEY / BINANCE_API_SECRET 환경변수가 필요합니다."
    );
  }

  const timestamp = Date.now();
  const search = new URLSearchParams({
    ...Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, String(v)])
    ),
    timestamp: String(timestamp),
    recvWindow: "5000",
  });

  const query = search.toString();
  const signature = signBinance(apiSecret, query);

  const res = await fetch(`${BINANCE_BASE}${path}?${query}&signature=${signature}`, {
    headers: { "X-MBX-APIKEY": apiKey },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Binance API HTTP ${res.status}: ${await res.text()}`);
  }

  return (await res.json()) as T;
}

/** 같은 주문의 체결을 한 줄로 묶을 때 쓰는 저장 키 */
export function binanceOrderExternalId(
  symbol: string,
  orderId: number | string
): string {
  return `${symbol}-order-${orderId}`;
}

/**
 * Binance Futures 청산 주문. 한 주문이 여러 체결로 나뉘어도 한 포지션으로 합친다.
 * 주문이 다르면, 같은 초에 청산했어도 따로 둔다.
 */
export async function fetchBinanceClosedPositions(options?: {
  symbol?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
}): Promise<ClosedPosition[]> {
  const limit = options?.limit ?? 100;
  const params: Record<string, string | number> = { limit };

  if (options?.symbol) params.symbol = options.symbol;
  if (options?.startTime) params.startTime = options.startTime;
  if (options?.endTime) params.endTime = options.endTime;

  // symbol이 없으면 최근 REALIZED_PNL income으로 심볼 목록을 추정
  if (!options?.symbol) {
    return fetchFromIncomeAndTrades(options);
  }

  const trades = await binanceGet<BinanceUserTrade[]>(
    "/fapi/v1/userTrades",
    params
  );

  return groupClosingOrders(trades);
}

async function fetchFromIncomeAndTrades(options?: {
  startTime?: number;
  endTime?: number;
  limit?: number;
}): Promise<ClosedPosition[]> {
  const params: Record<string, string | number> = {
    incomeType: "REALIZED_PNL",
    limit: options?.limit ?? 100,
  };
  if (options?.startTime) params.startTime = options.startTime;
  if (options?.endTime) params.endTime = options.endTime;

  const incomes = await binanceGet<BinanceIncome[]>(
    "/fapi/v1/income",
    params
  );

  const bySymbol = new Map<string, number[]>();
  for (const inc of incomes) {
    if (!inc.symbol) continue;
    const times = bySymbol.get(inc.symbol) ?? [];
    times.push(inc.time);
    bySymbol.set(inc.symbol, times);
  }

  const results: ClosedPosition[] = [];

  for (const [symbol, times] of bySymbol) {
    const start = Math.min(...times) - 60_000;
    const end = Math.max(...times) + 60_000;
    const trades = await binanceGet<BinanceUserTrade[]>(
      "/fapi/v1/userTrades",
      {
        symbol,
        startTime: start,
        endTime: end,
        limit: 100,
      }
    );

    results.push(...groupClosingOrders(trades));
  }

  // 동일 trade id 중복 제거
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.externalId)) return false;
    seen.add(r.externalId);
    return true;
  });
}

function groupClosingOrders(trades: BinanceUserTrade[]): ClosedPosition[] {
  const groups = new Map<string, BinanceUserTrade[]>();
  for (const trade of trades) {
    if (Number(trade.realizedPnl) === 0) continue;
    const key = binanceOrderExternalId(trade.symbol, trade.orderId);
    const list = groups.get(key) ?? [];
    list.push(trade);
    groups.set(key, list);
  }
  return [...groups.values()].map(mapOrder);
}

function closingSide(trade: BinanceUserTrade): "LONG" | "SHORT" {
  if (trade.positionSide === "LONG" || trade.positionSide === "SHORT") {
    return trade.positionSide;
  }
  // one-way: 실현손익 있는 체결의 반대가 원래 포지션
  // BUY로 청산 → 숏, SELL로 청산 → 롱
  return trade.side === "SELL" ? "LONG" : "SHORT";
}

function mapOrder(fills: BinanceUserTrade[]): ClosedPosition {
  const first = fills[0]!;
  const side = closingSide(first);
  const qty = fills.reduce((sum, fill) => sum + Number(fill.qty), 0);
  const pnl = fills.reduce((sum, fill) => sum + Number(fill.realizedPnl), 0);
  const fee = fills.reduce((sum, fill) => sum + Number(fill.commission), 0);
  const exitNotional = fills.reduce(
    (sum, fill) => sum + Number(fill.price) * Number(fill.qty),
    0
  );
  const exitPrice = qty > 0 ? exitNotional / qty : Number(first.price);
  // 진입가는 체결가에 없음. 합산 손익으로 평균 진입을 되돌린다.
  // LONG: pnl = (exit - entry) * qty
  const entryPrice =
    qty > 0
      ? side === "LONG"
        ? exitPrice - pnl / qty
        : exitPrice + pnl / qty
      : exitPrice;
  const exitTime = new Date(Math.max(...fills.map((fill) => fill.time)));
  const notional = Math.abs(entryPrice * qty);
  const pnlPercent = notional > 0 ? (pnl / notional) * 100 : undefined;

  return {
    externalId: binanceOrderExternalId(first.symbol, first.orderId),
    exchange: "binance",
    symbol: first.symbol,
    baseAsset: baseAssetFromSymbol(first.symbol),
    side,
    qty,
    entryPrice,
    exitPrice,
    pnl,
    pnlPercent,
    fee,
    status: inferStatus(side, entryPrice, exitPrice, pnl),
    entryTime: exitTime,
    exitTime,
    raw: {
      orderId: first.orderId,
      fillCount: fills.length,
      tradeIds: fills.map((fill) => fill.id),
    },
  };
}
