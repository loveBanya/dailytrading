export interface UsdtKrwQuote {
  rate: number;
  source: "upbit" | "usd";
}

function asRate(value: unknown): number | null {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 500 || rate > 5000) return null;
  return Math.round(rate);
}

async function fromUpbit(): Promise<number | null> {
  const res = await fetch("https://api.upbit.com/v1/ticker?markets=KRW-USDT", {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ trade_price?: number }>;
  return asRate(data?.[0]?.trade_price);
}

async function fromUsdKrw(): Promise<number | null> {
  const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=KRW", {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { rates?: { KRW?: number } };
  return asRate(data.rates?.KRW);
}

/** 1 USDT당 원화. 업비트 KRW-USDT, 실패 시 달러/원. */
export async function fetchUsdtKrw(): Promise<UsdtKrwQuote> {
  try {
    const upbit = await fromUpbit();
    if (upbit) return { rate: upbit, source: "upbit" };
  } catch {
    /* 업비트가 막히면 달러 환율로 넘긴다 */
  }
  const usd = await fromUsdKrw();
  if (usd) return { rate: usd, source: "usd" };
  throw new Error("환율을 가져오지 못했습니다");
}
