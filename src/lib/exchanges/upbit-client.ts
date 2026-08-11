import crypto from "crypto";

const UPBIT_BASE = process.env.UPBIT_BASE_URL ?? "https://api.upbit.com";

function getKeys() {
  const accessKey =
    process.env.UPBIT_ACCESS_KEY?.trim() ||
    process.env.UPBIT_API_KEY?.trim();
  const secretKey =
    process.env.UPBIT_SECRET_KEY?.trim() ||
    process.env.UPBIT_API_SECRET?.trim();
  if (!accessKey || !secretKey) {
    throw new Error(
      "UPBIT_ACCESS_KEY / UPBIT_SECRET_KEY 가 필요합니다. .env.local에 넣고 로컬에서 동기화하세요 (업비트 허용 IP)."
    );
  }
  return { accessKey, secretKey };
}

function base64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signJwt(
  accessKey: string,
  secretKey: string,
  query?: string
): string {
  const payload: Record<string, string> = {
    access_key: accessKey,
    nonce: crypto.randomUUID(),
  };
  if (query) {
    payload.query_hash = crypto.createHash("sha512").update(query).digest("hex");
    payload.query_hash_alg = "SHA512";
  }
  const header = base64url(JSON.stringify({ alg: "HS512", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = crypto
    .createHmac("sha512", secretKey)
    .update(data)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${data}.${sig}`;
}

async function upbitGet<T>(
  path: string,
  params: Record<string, string | number | undefined> = {}
): Promise<T> {
  const { accessKey, secretKey } = getKeys();
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    qs.set(k, String(v));
  }
  const query = qs.toString();
  const token = signJwt(accessKey, secretKey, query || undefined);
  const url = query ? `${UPBIT_BASE}${path}?${query}` : `${UPBIT_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Upbit ${path} HTTP ${res.status}: ${text.slice(0, 240)}`);
  }
  return JSON.parse(text) as T;
}

export interface UpbitAccount {
  currency: string;
  balance: string;
  locked: string;
  avg_buy_price: string;
  avg_buy_price_modified: boolean;
  unit_currency: string;
}

export interface UpbitOrder {
  uuid: string;
  side: string;
  ord_type: string;
  price: string;
  state: string;
  market: string;
  created_at: string;
  volume: string;
  remaining_volume: string;
  reserved_fee: string;
  remaining_fee: string;
  paid_fee: string;
  locked: string;
  executed_volume: string;
  trades_count?: number;
  // closed endpoint may include
  done_at?: string | null;
}

export interface UpbitTransfer {
  type?: string;
  uuid: string;
  currency: string;
  net_type?: string | null;
  txid?: string | null;
  state: string;
  created_at: string;
  done_at?: string | null;
  amount: string;
  fee: string;
  transaction_type?: string;
}

export async function fetchUpbitAccounts(): Promise<UpbitAccount[]> {
  return upbitGet<UpbitAccount[]>("/v1/accounts");
}

/** 종료 주문 — 페이지 단위 (이미 DB에 있으면 호출 측에서 스킵) */
export async function fetchUpbitClosedOrders(args: {
  page?: number;
  limit?: number;
  market?: string;
  state?: "done" | "cancel";
}): Promise<UpbitOrder[]> {
  return upbitGet<UpbitOrder[]>("/v1/orders/closed", {
    page: args.page ?? 1,
    limit: Math.min(100, args.limit ?? 100),
    market: args.market,
    state: args.state ?? "done",
    order_by: "desc",
  });
}

export async function fetchUpbitDeposits(args: {
  page?: number;
  limit?: number;
  currency?: string;
}): Promise<UpbitTransfer[]> {
  return upbitGet<UpbitTransfer[]>("/v1/deposits", {
    page: args.page ?? 1,
    limit: Math.min(100, args.limit ?? 100),
    currency: args.currency,
    order_by: "desc",
  });
}

export async function fetchUpbitWithdraws(args: {
  page?: number;
  limit?: number;
  currency?: string;
}): Promise<UpbitTransfer[]> {
  return upbitGet<UpbitTransfer[]>("/v1/withdraws", {
    page: args.page ?? 1,
    limit: Math.min(100, args.limit ?? 100),
    currency: args.currency,
    order_by: "desc",
  });
}

export function hasUpbitCredentials(): boolean {
  try {
    getKeys();
    return true;
  } catch {
    return false;
  }
}
