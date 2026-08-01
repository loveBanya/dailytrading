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

/**
 * Binance Futures 체결 내역에서 실현손익이 있는 청산 체결을 포지션으로 변환
 * (부분 청산은 체결 단위로 기록)
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

  return trades
    .filter((t) => Number(t.realizedPnl) !== 0)
    .map((t) => mapTrade(t));
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

    for (const t of trades) {
      if (Number(t.realizedPnl) === 0) continue;
      results.push(mapTrade(t));
    }
  }

  // 동일 trade id 중복 제거
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.externalId)) return false;
    seen.add(r.externalId);
    return true;
  });
}

function mapTrade(t: BinanceUserTrade): ClosedPosition {
  let side: "LONG" | "SHORT";
  if (t.positionSide === "LONG" || t.positionSide === "SHORT") {
    side = t.positionSide;
  } else {
    // one-way: 실현손익 있는 체결의 반대가 원래 포지션
    // BUY로 청산 → 숏, SELL로 청산 → 롱
    side = t.side === "SELL" ? "LONG" : "SHORT";
  }

  const exitPrice = Number(t.price);
  const qty = Number(t.qty);
  const pnl = Number(t.realizedPnl);
  const fee = Number(t.commission);
  const exitTime = new Date(t.time);

  // 진입가는 체결가에 포함되지 않음 → 대략 추정 (PnL 역산)
  // PnL ≈ (exit - entry) * qty * direction
  // LONG: pnl = (exit - entry) * qty → entry = exit - pnl/qty
  // SHORT: pnl = (entry - exit) * qty → entry = exit + pnl/qty
  const entryPrice =
    side === "LONG"
      ? exitPrice - pnl / qty
      : exitPrice + pnl / qty;

  const notional = Math.abs(entryPrice * qty);
  const pnlPercent = notional > 0 ? (pnl / notional) * 100 : undefined;

  return {
    externalId: `${t.symbol}-${t.id}`,
    exchange: "binance",
    symbol: t.symbol,
    baseAsset: baseAssetFromSymbol(t.symbol),
    side,
    qty,
    entryPrice,
    exitPrice,
    pnl,
    pnlPercent,
    fee,
    status: inferStatus(side, entryPrice, exitPrice, pnl),
    entryTime: exitTime, // 정확한 진입시각은 userTrades만으로 알기 어려움
    exitTime,
    raw: t,
  };
}
