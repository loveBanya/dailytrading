import { hmacSha256 } from "@/lib/utils/format";

const BYBIT_BASE = process.env.BYBIT_BASE_URL ?? "https://api.bybit.com";

interface BybitEnvelope<T> {
  retCode: number;
  retMsg: string;
  result?: T;
}

function credentials() {
  const apiKey = process.env.BYBIT_API_KEY;
  const apiSecret = process.env.BYBIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("BYBIT_API_KEY / BYBIT_API_SECRET 환경변수가 필요합니다.");
  }
  return { apiKey, apiSecret };
}

export async function bybitPrivateGet<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const { apiKey, apiSecret } = credentials();
  const search = new URLSearchParams(params);
  const query = search.toString();
  const timestamp = Date.now().toString();
  const recvWindow = "5000";
  const signature = hmacSha256(
    apiSecret,
    `${timestamp}${apiKey}${recvWindow}${query}`
  );

  const url = query
    ? `${BYBIT_BASE}${path}?${query}`
    : `${BYBIT_BASE}${path}`;

  const res = await fetch(url, {
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-SIGN": signature,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": recvWindow,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Bybit API HTTP ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as BybitEnvelope<T>;
  if (data.retCode !== 0) {
    throw new Error(`Bybit API 오류: ${data.retMsg} (${data.retCode})`);
  }

  return data.result as T;
}

export async function bybitPublicGet<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const search = new URLSearchParams(params);
  const query = search.toString();
  const url = query
    ? `${BYBIT_BASE}${path}?${query}`
    : `${BYBIT_BASE}${path}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Bybit public API HTTP ${res.status}`);
  }

  const data = (await res.json()) as BybitEnvelope<T>;
  if (data.retCode !== 0) {
    throw new Error(`Bybit API 오류: ${data.retMsg} (${data.retCode})`);
  }

  return data.result as T;
}
