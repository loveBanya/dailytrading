import { hmacSha256 } from "@/lib/utils/format";

const BYBIT_BASE = process.env.BYBIT_BASE_URL ?? "https://api.bybit.com";
/** Vercel 등 클라우드 IP에서 api.bybit.com 이 403일 때 시도 */
const BYBIT_PUBLIC_HOSTS = [
  BYBIT_BASE,
  "https://api.bytick.com",
  "https://api.bybit.com",
].filter((v, i, a) => a.indexOf(v) === i);

interface BybitEnvelope<T> {
  retCode: number;
  retMsg: string;
  result?: T;
}

const PUBLIC_HEADERS: HeadersInit = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (compatible; DailyTradingJournal/1.0; +https://vercel.app)",
};

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
      ...PUBLIC_HEADERS,
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
  let lastStatus = 0;
  let lastBody = "";

  for (const base of BYBIT_PUBLIC_HOSTS) {
    const url = query ? `${base}${path}?${query}` : `${base}${path}`;
    try {
      const res = await fetch(url, {
        headers: PUBLIC_HEADERS,
        cache: "no-store",
      });
      if (!res.ok) {
        lastStatus = res.status;
        lastBody = await res.text();
        // 403/451 등은 다른 호스트 시도
        if (res.status === 403 || res.status === 451 || res.status === 503) {
          continue;
        }
        throw new Error(`Bybit public API HTTP ${res.status}`);
      }

      const data = (await res.json()) as BybitEnvelope<T>;
      if (data.retCode !== 0) {
        throw new Error(`Bybit API 오류: ${data.retMsg} (${data.retCode})`);
      }
      return data.result as T;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Bybit API 오류")) {
        throw err;
      }
      // network / parse → try next host
      lastBody = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(
    lastStatus
      ? `Bybit public API HTTP ${lastStatus}`
      : `Bybit public API 실패: ${lastBody || "unknown"}`
  );
}
