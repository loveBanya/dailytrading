/** 시총 상위 100개 중 90일 수익률이 비트코인을 이긴 비율. 코인마켓캡 알트 시즌 지수. */

const CMC = "https://api.coinmarketcap.com/data-api/v3/altcoin-season/chart";

export type AltSeasonKind = "bitcoin" | "neutral" | "altcoin";

export interface AltSeason {
  score: number;
  season: AltSeasonKind;
  updatedAt: string;
  yesterday: number | null;
  lastWeek: number | null;
  lastMonth: number | null;
  yearHigh: number | null;
  yearLow: number | null;
}

interface IndexPoint {
  altcoinIndex?: string | number;
  timestamp?: string | number;
}

interface ChartPayload {
  data?: {
    historicalValues?: {
      now?: IndexPoint;
      yesterday?: IndexPoint;
      lastWeek?: IndexPoint;
      lastMonth?: IndexPoint;
      yearlyHigh?: IndexPoint;
      yearlyLow?: IndexPoint;
    };
  };
  status?: { error_code?: string; error_message?: string };
}

export function altSeasonKind(score: number): AltSeasonKind {
  if (score <= 25) return "bitcoin";
  if (score >= 75) return "altcoin";
  return "neutral";
}

export async function loadAltSeason(): Promise<AltSeason> {
  const end = Math.floor(Date.now() / 1000);
  const url = new URL(CMC);
  url.searchParams.set("start", String(end - 2 * 86_400));
  url.searchParams.set("end", String(end));
  const res = await fetch(url, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`알트 시즌 지수 요청 실패 (${res.status})`);
  const json = (await res.json()) as ChartPayload;
  if (json.status?.error_code && json.status.error_code !== "0") {
    throw new Error(json.status.error_message || "알트 시즌 지수를 가져오지 못했습니다");
  }
  const history = json.data?.historicalValues;
  const now = history?.now;
  const score = pointScore(now);
  if (score == null) throw new Error("알트 시즌 지수가 비어 있습니다");
  return {
    score,
    season: altSeasonKind(score),
    updatedAt: pointTime(now),
    yesterday: pointScore(history?.yesterday),
    lastWeek: pointScore(history?.lastWeek),
    lastMonth: pointScore(history?.lastMonth),
    yearHigh: pointScore(history?.yearlyHigh),
    yearLow: pointScore(history?.yearlyLow),
  };
}

function pointScore(point: IndexPoint | undefined): number | null {
  const score = Number(point?.altcoinIndex);
  if (!Number.isFinite(score)) return null;
  return Math.round(Math.min(100, Math.max(0, score)));
}

function pointTime(point: IndexPoint | undefined): string {
  const sec = Number(point?.timestamp);
  if (!Number.isFinite(sec) || sec <= 0) return new Date().toISOString();
  return new Date(sec * 1000).toISOString();
}
