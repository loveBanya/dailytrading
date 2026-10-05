import type { Trade } from "@/lib/exchanges/types";
import { dayKeyKst } from "@/lib/stats/compute";

/** 시나리오대로 매매를 시작한 날 (한국시간, 진입일) */
export const SCENARIO_ENTRY_FROM = "2026-10-01";

export function seoulToday(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

/** YYYY-MM-DD(한국 달력)에 일수를 더한다. */
export function shiftIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

/** 해당 날짜 00:00 KST를 UTC ISO로 바꾼다. */
export function kstDayStartIso(day: string): string {
  return new Date(`${day}T00:00:00+09:00`).toISOString();
}

/** 진입일(KST)이 from~to(포함)인 거래만. 둘 다 없으면 그대로. */
export function filterByEntryDay(
  trades: Trade[],
  from?: string | null,
  to?: string | null
): Trade[] {
  if (!from && !to) return trades;
  return trades.filter((trade) => {
    const day = dayKeyKst(trade.entry_time);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });
}
