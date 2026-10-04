/** 주요 알트를 같은 비중으로 모아 비트코인 대비 150일 평균에서 얼마나 벗어났는지. */

const BINANCE = "https://api.binance.com/api/v3/klines";
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const SMA = 150;
const YEAR_MS = 365 * DAY_MS;

/** 시총 상위권에서 스테이블·래핑을 뺀 주요 알트 */
const ALTS = [
  "ETH",
  "SOL",
  "XRP",
  "BNB",
  "DOGE",
  "ADA",
  "AVAX",
  "LINK",
  "TRX",
  "LTC",
  "BCH",
  "DOT",
  "UNI",
  "XLM",
] as const;

export interface HeatPoint {
  t: number;
  v: number;
}

export interface AltHeat {
  updatedAt: string;
  divergence: number;
  yesterday: number | null;
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

export function heatZone(value: number): HeatZoneId {
  for (const zone of HEAT_ZONES) {
    if (value <= zone.max) return zone.id;
  }
  return "very-hot";
}

export async function loadAltHeat(): Promise<AltHeat> {
  const dailyStart = Date.UTC(2019, 0, 1);
  const hourStart = Date.now() - 40 * HOUR_MS;
  const [btcDaily, altDaily, btcHourly, altHourly] = await Promise.all([
    fetchCloses("BTCUSDT", "1d", dailyStart),
    mapPool(ALTS, 6, (coin) => fetchCloses(`${coin}USDT`, "1d", dailyStart)),
    fetchCloses("BTCUSDT", "1h", hourStart),
    mapPool(ALTS, 6, (coin) => fetchCloses(`${coin}USDT`, "1h", hourStart)),
  ]);

  const daily = buildIndex(btcDaily, altDaily);
  if (daily.levels.length < SMA + 5) {
    throw new Error("알트 가격 기록이 부족합니다");
  }
  const averages = rollingMean(daily.levels, SMA);
  const points: HeatPoint[] = [];
  for (let i = 0; i < daily.levels.length; i++) {
    const avg = averages[i];
    if (avg == null || !(avg > 0)) continue;
    points.push({
      t: daily.times[i],
      v: (daily.levels[i] / avg - 1) * 100,
    });
  }
  const last = daily.levels.length - 1;
  const lastAvg = averages[last];
  if (lastAvg == null || !(lastAvg > 0) || points.length === 0) {
    throw new Error("150일 평균을 계산하지 못했습니다");
  }

  const divergence = (daily.levels[last] / lastAvg - 1) * 100;
  const prevAvg = averages[last - 1];
  const yesterday =
    prevAvg != null && prevAvg > 0
      ? (daily.levels[last - 1] / prevAvg - 1) * 100
      : null;

  const yearAt = daily.times[last] - YEAR_MS;
  const year = nearestIndex(daily.times, yearAt);
  const actual1y =
    year != null && daily.levels[year] > 0
      ? (daily.levels[last] / daily.levels[year] - 1) * 100
      : null;
  const yearAvg = year != null ? averages[year] : null;
  const baseline1y =
    yearAvg != null && yearAvg > 0 ? (lastAvg / yearAvg - 1) * 100 : null;

  const hourly = hourlyDivergence(
    btcHourly,
    altHourly,
    daily.levels[last - 1] ?? daily.levels[last],
    daily.times[last - 1] ?? daily.times[last],
    lastAvg
  );

  return {
    updatedAt: new Date(daily.times[last]).toISOString(),
    divergence,
    yesterday,
    zone: heatZone(divergence),
    median: median(points.map((point) => point.v)),
    actual1y,
    baseline1y,
    altChange24h: basketChange(altHourly),
    btcChange24h: seriesChange(btcHourly),
    hourly,
    daily: points,
  };
}

function hourlyDivergence(
  btc: Array<[number, number]>,
  alts: Array<Array<[number, number]>>,
  yesterdayLevel: number,
  yesterdayTime: number,
  sma: number
): HeatPoint[] {
  const btcMap = new Map(btc);
  const altMaps = alts.map((rows) => new Map(rows));
  const times = [...btcMap.keys()].filter((t) => t >= yesterdayTime).sort((a, b) => a - b);
  const basePrices = pricesAt(btcMap, altMaps, yesterdayTime);
  if (!basePrices) return [];
  const out: HeatPoint[] = [];
  for (const t of times) {
    const nowPrices = pricesAt(btcMap, altMaps, t);
    if (!nowPrices) continue;
    const ret = equalReturn(basePrices, nowPrices);
    if (ret == null) continue;
    out.push({ t, v: ((yesterdayLevel * (1 + ret)) / sma - 1) * 100 });
  }
  return out;
}

function buildIndex(btc: Array<[number, number]>, alts: Array<Array<[number, number]>>) {
  const btcMap = new Map(btc);
  const altMaps = alts.map((rows) => new Map(rows));
  const times = [...btcMap.keys()].sort((a, b) => a - b);
  const levels: number[] = [];
  const kept: number[] = [];
  let index = 1;
  let prev: number | null = null;
  for (const t of times) {
    if (prev != null) {
      const before = pricesAt(btcMap, altMaps, prev);
      const now = pricesAt(btcMap, altMaps, t);
      const ret = before && now ? equalReturn(before, now) : null;
      if (ret != null) index *= 1 + ret;
    }
    levels.push(index);
    kept.push(t);
    prev = t;
  }
  return { times: kept, levels };
}

function pricesAt(
  btc: Map<number, number>,
  alts: Array<Map<number, number>>,
  t: number
): number[] | null {
  const btcPx = btc.get(t);
  if (!(btcPx && btcPx > 0)) return null;
  const row = [btcPx];
  for (const map of alts) row.push(map.get(t) ?? 0);
  return row;
}

/** ratios[0]은 BTC USDT, 나머지는 알트 USDT. 알트/BTC 수익률의 평균. */
function equalReturn(before: number[], after: number[]): number | null {
  const btcRet = after[0] / before[0];
  if (!(btcRet > 0)) return null;
  let sum = 0;
  let n = 0;
  const count = Math.min(before.length, after.length);
  for (let i = 1; i < count; i++) {
    if (!(before[i] > 0) || !(after[i] > 0)) continue;
    sum += after[i] / before[i] / btcRet - 1;
    n += 1;
  }
  if (n < 4) return null;
  return sum / n;
}

function basketChange(alts: Array<Array<[number, number]>>): number | null {
  const changes = alts
    .map((rows) => seriesChange(rows))
    .filter((value): value is number => value != null);
  if (changes.length < 4) return null;
  return changes.reduce((sum, value) => sum + value, 0) / changes.length;
}

function seriesChange(rows: Array<[number, number]>): number | null {
  if (rows.length < 2) return null;
  const last = rows[rows.length - 1];
  const target = last[0] - 24 * HOUR_MS;
  let prev: [number, number] | null = null;
  for (const row of rows) {
    if (row[0] <= target) prev = row;
  }
  if (!prev || !(prev[1] > 0)) return null;
  return (last[1] / prev[1] - 1) * 100;
}

async function fetchCloses(
  symbol: string,
  interval: "1d" | "1h",
  startMs: number
): Promise<Array<[number, number]>> {
  const out: Array<[number, number]> = [];
  let from = startMs;
  const step = interval === "1d" ? DAY_MS : HOUR_MS;
  while (from < Date.now()) {
    const url = new URL(BINANCE);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", interval);
    url.searchParams.set("limit", "1000");
    url.searchParams.set("startTime", String(from));
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return out;
    const batch = (await res.json()) as number[][];
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const row of batch) out.push([Number(row[0]), Number(row[4])]);
    const next = Number(batch[batch.length - 1][0]) + step;
    if (next <= from) break;
    from = next;
    if (batch.length < 1000) break;
  }
  return out;
}

async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return out;
}

function nearestIndex(times: number[], target: number): number | null {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < times.length; i++) {
    const dist = Math.abs(times[i] - target);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  if (best < 0 || bestDist > 5 * DAY_MS) return null;
  return best;
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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}
