import { createHmac } from "crypto";
import type { ClosedPosition } from "./types";
import { baseAssetFromSymbol, inferStatus } from "@/lib/utils/format";

const OKX_BASE = process.env.OKX_BASE_URL ?? "https://www.okx.com";

interface OkxPositionHistoryItem {
  posId?: string;
  tradeId?: string;
  instId: string;
  instType?: string;
  mgnMode?: string;
  direction?: string; // long / short (net mode)
  posSide?: string; // long / short / net
  openAvgPx?: string;
  closeAvgPx?: string;
  openMaxPos?: string;
  closeTotalPos?: string;
  realizedPnl?: string;
  pnlRatio?: string;
  fee?: string;
  fundingFee?: string;
  lever?: string;
  type?: string;
  cTime?: string;
  uTime?: string;
  createdTime?: string;
  updatedTime?: string;
}

interface OkxResponse<T> {
  code: string;
  msg: string;
  data?: T;
}

function credentials() {
  const apiKey = process.env.OKX_API_KEY?.trim();
  const apiSecret = process.env.OKX_API_SECRET?.trim();
  // Vercel/로컬에서 따옴표가 붙는 경우 제거
  const passphrase = (
    process.env.OKX_PASSPHRASE ??
    process.env.OKX_API_PASSPHRASE ??
    ""
  )
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!apiKey || !apiSecret) {
    throw new Error("OKX_API_KEY / OKX_API_SECRET 환경변수가 필요합니다.");
  }
  if (!passphrase) {
    throw new Error(
      "OKX_PASSPHRASE 가 비어 있습니다. Vercel Environment Variables와 .env.local에 OKX_PASSPHRASE를 넣고 재배포하세요."
    );
  }
  return { apiKey, apiSecret, passphrase };
}

function signOkx(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body = ""
): string {
  const prehash = `${timestamp}${method.toUpperCase()}${path}${body}`;
  return createHmac("sha256", secret).update(prehash).digest("base64");
}

export async function okxPrivateGet<T>(
  pathWithQuery: string
): Promise<T> {
  const { apiKey, apiSecret, passphrase } = credentials();
  const timestamp = new Date().toISOString();
  const sign = signOkx(apiSecret, timestamp, "GET", pathWithQuery);

  const res = await fetch(`${OKX_BASE}${pathWithQuery}`, {
    headers: {
      "OK-ACCESS-KEY": apiKey,
      "OK-ACCESS-SIGN": sign,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": passphrase,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`OKX API HTTP ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as OkxResponse<T>;
  if (data.code !== "0") {
    throw new Error(`OKX API 오류: ${data.msg} (${data.code})`);
  }
  return data.data as T;
}

/** BTC-USDT-SWAP → BTCUSDT (차트용 Bybit 심볼과 맞춤) */
export function okxInstToSymbol(instId: string): string {
  return instId
    .replace(/-SWAP$/i, "")
    .replace(/-FUTURES$/i, "")
    .replace(/-/g, "")
    .toUpperCase();
}

/**
 * OKX 포지션 히스토리 (청산된 선물)
 * https://www.okx.com/docs-v5/en/#trading-account-rest-api-get-positions-history
 */
export async function fetchOkxClosedPositions(options?: {
  symbol?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
}): Promise<ClosedPosition[]> {
  const pageLimit = Math.min(options?.limit ?? 100, 100);
  const maxPages = 5;
  const all: OkxPositionHistoryItem[] = [];
  let after: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      instType: "SWAP",
      limit: String(pageLimit),
    });
    if (options?.symbol) {
      const base = options.symbol.replace(/USDT$/i, "");
      params.set("instId", `${base}-USDT-SWAP`);
    }
    if (options?.startTime) params.set("begin", String(options.startTime));
    if (options?.endTime) params.set("end", String(options.endTime));
    // OKX: after = 이 시점보다 오래된 기록 (페이지네이션)
    if (after) params.set("after", after);

    const path = `/api/v5/account/positions-history?${params.toString()}`;
    const list = (await okxPrivateGet<OkxPositionHistoryItem[]>(path)) ?? [];
    if (list.length === 0) break;
    all.push(...list);
    const oldest = list[list.length - 1];
    const nextAfter = oldest?.uTime || oldest?.cTime;
    if (!nextAfter || list.length < pageLimit) break;
    after = String(nextAfter);
  }

  return all.map((item): ClosedPosition => {
    const posSide = (item.posSide || item.direction || "").toLowerCase();
    let side: "LONG" | "SHORT" = "LONG";
    if (posSide === "short") side = "SHORT";
    else if (posSide === "long") side = "LONG";
    else if (posSide === "net") {
      side = (item.direction || "").toLowerCase() === "short" ? "SHORT" : "LONG";
    }

    const entryPrice = Number(item.openAvgPx || 0);
    const exitPrice = Number(item.closeAvgPx || 0);
    const pnl = Number(item.realizedPnl || 0);
    const qty = Number(item.closeTotalPos || item.openMaxPos || 0);
    const entryMs = Number(item.cTime || item.createdTime || 0);
    const exitMs = Number(item.uTime || item.updatedTime || entryMs);
    const symbol = okxInstToSymbol(item.instId);
    // posId만 쓰면 부분청산이 같은 id로 중복 스킵됨 → 시각·체결 포함
    const externalId = [
      item.posId,
      item.tradeId,
      item.uTime || item.updatedTime || item.cTime,
      item.closeAvgPx,
      item.closeTotalPos,
    ]
      .filter((x) => x != null && String(x) !== "")
      .join("-");

    const notional = entryPrice * qty;
    const pnlPercent =
      item.pnlRatio != null && item.pnlRatio !== ""
        ? Number(item.pnlRatio) * 100
        : notional > 0
          ? (pnl / notional) * 100
          : undefined;

    return {
      externalId: externalId || `${item.instId}-${exitMs}`,
      exchange: "okx",
      symbol,
      baseAsset: baseAssetFromSymbol(symbol),
      side,
      qty,
      entryPrice,
      exitPrice: exitPrice || entryPrice,
      leverage: item.lever ? Number(item.lever) : undefined,
      pnl,
      pnlPercent,
      fee: item.fee ? Number(item.fee) : 0,
      status: inferStatus(side, entryPrice, exitPrice || entryPrice, pnl),
      entryTime: new Date(entryMs || Date.now()),
      exitTime: new Date(exitMs || entryMs || Date.now()),
      raw: item,
    };
  });
}
