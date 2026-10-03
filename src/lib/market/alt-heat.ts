/** 알트 시총 / 비트 시총이 150일 평균에서 얼마나 벗어났는지. */

const CMC =
  "https://api.coinmarketcap.com/data-api/v3/global-metrics/quotes/historical";
const DAY = 86_400;
const SMA = 150;
const YEAR = 365;

export interface HeatPoint {
  t: number;
  v: number;
}

export interface AltHeat {
  updatedAt: string;
  divergence: number;
  zone: HeatZoneId;
  median: number;
  actual1y: number | null;
  baseline1y: number | null;
  altChange24h: number | null;
  btcChange24h: number | null;
  hourly: HeatPoint[];
  daily: HeatPoint[];
}

export type HeatZoneId = "very-weak" | "weak" | "normal" | "hot" | "very-hot";

export const HEAT_ZONES: Array<{
  id: HeatZoneId;
  label: string;
  /** 이 값 이하이면 이 구간. 마지막은 그 위 전부 */
  max: number;
}> = [
  { id: "very-weak", label: "매우 약세", max: -26.5 },
  { id: "weak", label: "약세", max: -17 },
  { id: "normal", label: "보통", max: 4 },
  { id: "hot", label: "과열", max: 15 },
  { id: "very-hot", label: "매우 과열", max: Number.POSITIVE_INFINITY },
];

interface CapPoint {
  t: number;
  alt: number;
  btc: number;
}

interface CmcQuote {
  timestamp?: string;
  btcDominance?: number;
  quote?: Array<{
    totalMarketCap?: number;
    altcoinMarketCap?: number;
  }>;
}

export function heatZone(value: number): HeatZoneId {
  for (const zone of HEAT_ZONES) {
    if (value <= zone.max) return zone.id;
  }
  return "very-hot";
}

export async function loadAltHeat(): Promise<AltHeat> {
  const end = Math.floor(Date.now() / 1000);
  const start = Math.floor(Date.UTC(2018, 0, 1) / 1000);
  const [dailyRaw, hourlyRaw] = await Promise.all([
    fetchDaily(start, end),
    fetchQuotes(end - 36 * 3600, end, "1h"),
  ]);
  const dailyCaps = dedupe(dailyRaw.map(parseQuote).filter(isCap));
  const hourlyCaps = dedupe(hourlyRaw.map(parseQuote).filter(isCap));
  if (dailyCaps.length < SMA + 5) {
    throw new Error("알트 시총 기록이 부족합니다");
  }

  const ratios = dailyCaps.map((row) => row.alt / row.btc);
  const averages = rollingMean(ratios, SMA);
  const daily: HeatPoint[] = [];
  for (let i = 0; i < dailyCaps.length; i++) {
    const avg = averages[i];
    if (avg == null || !(avg > 0)) continue;
    daily.push({
      t: dailyCaps[i].t,
      v: (ratios[i] / avg - 1) * 100,
    });
  }
  const lastAvg = averages[averages.length - 1];
  if (lastAvg == null || !(lastAvg > 0) || daily.length === 0) {
    throw new Error("150일 평균을 계산하지 못했습니다");
  }

  const latestCap = hourlyCaps[hourlyCaps.length - 1] ?? dailyCaps[dailyCaps.length - 1];
  const divergence = (latestCap.alt / latestCap.btc / lastAvg - 1) * 100;
  const hourly = hourlyCaps.map((row) => ({
    t: row.t,
    v: (row.alt / row.btc / lastAvg - 1) * 100,
  }));

  const yearAgo = latestCap.t - YEAR * DAY * 1000;
  const nowRatio = latestCap.alt / latestCap.btc;
  const past = nearest(dailyCaps, yearAgo);
  const pastAvg = past ? averages[dailyCaps.indexOf(past)] : null;
  const actual1y =
    past && past.btc > 0 ? (nowRatio / (past.alt / past.btc) - 1) * 100 : null;
  const baseline1y =
    pastAvg != null && pastAvg > 0 ? (lastAvg / pastAvg - 1) * 100 : null;

  const dayAgo = latestCap.t - DAY * 1000;
  const altThen = nearest(hourlyCaps.length > 2 ? hourlyCaps : dailyCaps, dayAgo);
  const altChange24h =
    altThen && altThen.alt > 0 ? (latestCap.alt / altThen.alt - 1) * 100 : null;
  const btcChange24h =
    altThen && altThen.btc > 0 ? (latestCap.btc / altThen.btc - 1) * 100 : null;

  return {
    updatedAt: new Date(latestCap.t).toISOString(),
    divergence,
    zone: heatZone(divergence),
    median: median(daily.map((point) => point.v)),
    actual1y,
    baseline1y,
    altChange24h,
    btcChange24h,
    hourly,
    daily,
  };
}

async function fetchDaily(start: number, end: number): Promise<CmcQuote[]> {
  const span = 1900 * DAY;
  const rows: CmcQuote[] = [];
  for (let from = start; from < end; from += span) {
    const to = Math.min(end, from + span);
    const part = await fetchQuotes(from, to, "1d");
    rows.push(...part);
  }
  return rows;
}

async function fetchQuotes(
  start: number,
  end: number,
  interval: "1d" | "1h"
): Promise<CmcQuote[]> {
  const url = new URL(CMC);
  url.searchParams.set("convertId", "2781");
  url.searchParams.set("format", "chart");
  url.searchParams.set("interval", interval);
  url.searchParams.set("timeStart", String(start));
  url.searchParams.set("timeEnd", String(end));
  const res = await fetch(url, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`시총 기록 요청 실패 (${res.status})`);
  const json = (await res.json()) as {
    data?: { quotes?: CmcQuote[] };
    status?: { error_code?: string; error_message?: string };
  };
  if (json.status?.error_code && json.status.error_code !== "0") {
    throw new Error(json.status.error_message || "시총 기록을 가져오지 못했습니다");
  }
  return json.data?.quotes ?? [];
}

function parseQuote(row: CmcQuote): CapPoint | null {
  const quote = row.quote?.[0];
  const total = Number(quote?.totalMarketCap);
  const alt = Number(quote?.altcoinMarketCap);
  const btc = total - alt;
  const t = Date.parse(row.timestamp ?? "");
  if (!Number.isFinite(t) || !(alt > 0) || !(btc > 0)) return null;
  return { t, alt, btc };
}

function isCap(row: CapPoint | null): row is CapPoint {
  return row != null;
}

function dedupe(rows: CapPoint[]): CapPoint[] {
  const map = new Map<number, CapPoint>();
  for (const row of rows) map.set(row.t, row);
  return [...map.values()].sort((a, b) => a.t - b.t);
}

function rollingMean(values: number[], window: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    if (i >= window - 1) out[i] = sum / window;
  }
  return out;
}

function nearest(rows: CapPoint[], target: number): CapPoint | null {
  let best: CapPoint | null = null;
  let bestDist = Infinity;
  for (const row of rows) {
    const dist = Math.abs(row.t - target);
    if (dist < bestDist) {
      best = row;
      bestDist = dist;
    }
  }
  if (!best || bestDist > 5 * DAY * 1000) return null;
  return best;
}

function median(values: number[]): number {
  if (values.length === 0) return -7;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}
