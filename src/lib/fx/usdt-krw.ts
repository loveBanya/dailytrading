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

/** 한국시간 날짜 → 그날 업비트 KRW-USDT 종가. since 날짜까지 일봉을 거슬러 받는다. */
export async function fetchUsdtKrwDaily(
  since: string
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  let to: string | null = null;
  for (let page = 0; page < 12; page += 1) {
    const params = new URLSearchParams({ market: "KRW-USDT", count: "200" });
    if (to) params.set("to", to);
    const res = await fetch(
      `https://api.upbit.com/v1/candles/days?${params.toString()}`,
      { cache: "no-store", headers: { accept: "application/json" } }
    );
    if (!res.ok) break;
    const rows = (await res.json()) as Array<{
      candle_date_time_utc?: string;
      candle_date_time_kst?: string;
      trade_price?: number;
    }>;
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const row of rows) {
      const day = row.candle_date_time_kst?.slice(0, 10);
      const rate = asRate(row.trade_price);
      if (day && rate) out[day] = rate;
    }
    const oldest = rows[rows.length - 1];
    const oldestDay = oldest?.candle_date_time_kst?.slice(0, 10);
    if (!oldestDay || oldestDay <= since || rows.length < 200) break;
    if (!oldest.candle_date_time_utc) break;
    to = `${oldest.candle_date_time_utc}Z`;
  }

  const upbitStart = Object.keys(out).sort()[0];
  if (!upbitStart || since < upbitStart) {
    try {
      const until = upbitStart ?? new Date().toISOString().slice(0, 10);
      Object.assign(out, await fetchUsdKrwRange(since, until), {
        ...out,
      });
    } catch {
      /* 업비트 상장 전 날짜는 가장 이른 업비트 시세로 넘긴다 */
    }
  }
  return out;
}

/** 업비트 KRW-USDT 가 없던 날짜용 달러/원 일별 환율 (영업일만 있음) */
async function fetchUsdKrwRange(
  from: string,
  to: string
): Promise<Record<string, number>> {
  const res = await fetch(
    `https://api.frankfurter.app/${from}..${to}?from=USD&to=KRW`,
    { cache: "no-store", headers: { accept: "application/json" } }
  );
  if (!res.ok) return {};
  const data = (await res.json()) as {
    rates?: Record<string, { KRW?: number }>;
  };
  const out: Record<string, number> = {};
  for (const [day, row] of Object.entries(data.rates ?? {})) {
    const rate = asRate(row?.KRW);
    if (rate) out[day] = rate;
  }
  return out;
}

/** 그날 시세가 없으면 가장 가까운 앞날, 그것도 없으면 가장 가까운 뒷날을 쓴다. */
export function rateOnDay(
  daily: Record<string, number>,
  day: string,
  fallback: number
): number {
  if (daily[day]) return daily[day];
  const days = Object.keys(daily).sort();
  let before: string | null = null;
  let after: string | null = null;
  for (const d of days) {
    if (d < day) before = d;
    else if (d > day && after == null) after = d;
  }
  if (before) return daily[before];
  if (after) return daily[after];
  return fallback;
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
