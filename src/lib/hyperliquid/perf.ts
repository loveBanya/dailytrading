import { fetchLeaderboard, fetchPortfolio } from "./client";
import type { HlTrader, HlTrustSummary, HlTrustTone } from "./types";

export interface HlTraderPerf {
  pnlDay: number | null;
  roiDay: number | null;
  pnlWeek: number | null;
  roiWeek: number | null;
  pnlMonth: number | null;
  roiMonth: number | null;
  pnlAllTime: number | null;
  roiAllTime: number | null;
  volumeMonth: number | null;
}

export function emptyPerf(): HlTraderPerf {
  return {
    pnlDay: null,
    roiDay: null,
    pnlWeek: null,
    roiWeek: null,
    pnlMonth: null,
    roiMonth: null,
    pnlAllTime: null,
    roiAllTime: null,
    volumeMonth: null,
  };
}

export function perfFromLeaderboardRow(row: {
  pnlDay: number | null;
  roiDay: number | null;
  pnlWeek: number | null;
  roiWeek: number | null;
  pnlMonth: number | null;
  roiMonth: number | null;
  pnlAllTime: number | null;
  roiAllTime: number | null;
  volumeMonth?: number | null;
}): HlTraderPerf {
  return {
    pnlDay: row.pnlDay,
    roiDay: row.roiDay,
    pnlWeek: row.pnlWeek,
    roiWeek: row.roiWeek,
    pnlMonth: row.pnlMonth,
    roiMonth: row.roiMonth,
    pnlAllTime: row.pnlAllTime,
    roiAllTime: row.roiAllTime,
    volumeMonth: row.volumeMonth ?? null,
  };
}

/** portfolio 히스토리 마지막 값으로 PnL (ROI는 리더보드에만 있음) */
export async function perfFromPortfolio(address: string): Promise<HlTraderPerf> {
  const slices = await fetchPortfolio(address);
  const lastPnl = (...windows: string[]) => {
    for (const w of windows) {
      const s = slices.find((x) => x.window === w);
      const hist = s?.pnlHistory ?? [];
      if (hist.length) return hist[hist.length - 1]!.value;
    }
    return null;
  };
  const volume = (...windows: string[]) => {
    for (const w of windows) {
      const s = slices.find((x) => x.window === w);
      if (s?.volume != null) return s.volume;
    }
    return null;
  };

  return {
    pnlDay: lastPnl("perpDay", "day"),
    roiDay: null,
    pnlWeek: lastPnl("perpWeek", "week"),
    roiWeek: null,
    pnlMonth: lastPnl("perpMonth", "month"),
    roiMonth: null,
    pnlAllTime: lastPnl("perpAllTime", "allTime"),
    roiAllTime: null,
    volumeMonth: volume("perpMonth", "month"),
  };
}

export function mergePerf(
  primary: HlTraderPerf,
  fallback: HlTraderPerf
): HlTraderPerf {
  return {
    pnlDay: primary.pnlDay ?? fallback.pnlDay,
    roiDay: primary.roiDay ?? fallback.roiDay,
    pnlWeek: primary.pnlWeek ?? fallback.pnlWeek,
    roiWeek: primary.roiWeek ?? fallback.roiWeek,
    pnlMonth: primary.pnlMonth ?? fallback.pnlMonth,
    roiMonth: primary.roiMonth ?? fallback.roiMonth,
    pnlAllTime: primary.pnlAllTime ?? fallback.pnlAllTime,
    roiAllTime: primary.roiAllTime ?? fallback.roiAllTime,
    volumeMonth: primary.volumeMonth ?? fallback.volumeMonth,
  };
}

export function traderPerfPatch(perf: HlTraderPerf): Record<string, unknown> {
  return {
    pnl_day: perf.pnlDay,
    roi_day: perf.roiDay,
    pnl_week: perf.pnlWeek,
    roi_week: perf.roiWeek,
    pnl_month: perf.pnlMonth,
    roi_month: perf.roiMonth,
    pnl_all_time: perf.pnlAllTime,
    roi_all_time: perf.roiAllTime,
    volume_month: perf.volumeMonth,
    perf_synced_at: new Date().toISOString(),
  };
}

/** 포지션 신뢰도 한줄 요약 */
export function trustSummary(
  t: Pick<
    HlTrader,
    | "pnl_month"
    | "roi_month"
    | "pnl_week"
    | "roi_week"
    | "pnl_all_time"
    | "roi_all_time"
    | "pnl_day"
  >
): HlTrustSummary {
  const monthPnl = num(t.pnl_month);
  const monthRoi = num(t.roi_month);
  const weekPnl = num(t.pnl_week);
  const allPnl = num(t.pnl_all_time);
  const allRoi = num(t.roi_all_time);
  const dayPnl = num(t.pnl_day);

  if (
    monthPnl == null &&
    weekPnl == null &&
    allPnl == null &&
    monthRoi == null
  ) {
    return {
      tone: "unknown",
      label: "실적 없음",
      detail: "아직 성과 동기화가 없습니다.",
    };
  }

  let tone: HlTrustTone = "mixed";
  let label = "혼재";
  let detail = "";

  const monthOk =
    (monthPnl != null && monthPnl > 0) || (monthRoi != null && monthRoi > 0);
  const monthBad =
    (monthPnl != null && monthPnl < 0) || (monthRoi != null && monthRoi < 0);
  const allOk = allPnl != null && allPnl > 0;
  const allBad = allPnl != null && allPnl < 0;

  if (allOk && monthOk) {
    tone = "good";
    label = "실적 양호";
    detail = "올타임·월간 모두 플러스. 포지션 참고 가치 있음.";
  } else if (allBad && monthOk) {
    tone = "mixed";
    label = "단기만 강함";
    detail = "최근 달은 좋지만 누적은 손실. 과신 주의.";
  } else if (allOk && monthBad) {
    tone = "mixed";
    label = "최근 약세";
    detail = "누적은 흑자지만 최근 달이 부진.";
  } else if (allBad && monthBad) {
    tone = "weak";
    label = "누적 약세";
    detail = "올타임·월간 모두 부진. 관점용으로만.";
  } else if (monthOk) {
    tone = "good";
    label = "월간 강세";
    detail = "최근 한 달 수익 구간.";
  } else if (monthBad) {
    tone = "weak";
    label = "월간 약세";
    detail = "최근 한 달 손실 구간.";
  }

  const bits: string[] = [];
  if (allPnl != null) bits.push(`올타임 ${fmtPnl(allPnl)}${allRoi != null ? ` (${fmtRoi(allRoi)})` : ""}`);
  if (monthPnl != null) bits.push(`월 ${fmtPnl(monthPnl)}${monthRoi != null ? ` (${fmtRoi(monthRoi)})` : ""}`);
  else if (monthRoi != null) bits.push(`월 ROI ${fmtRoi(monthRoi)}`);
  if (weekPnl != null) bits.push(`주 ${fmtPnl(weekPnl)}`);
  if (dayPnl != null) bits.push(`일 ${fmtPnl(dayPnl)}`);
  if (bits.length) detail = `${detail} ${bits.join(" · ")}`.trim();

  return { tone, label, detail };
}

function num(v: number | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function fmtPnl(n: number): string {
  const abs = Math.abs(n);
  const sign = n >= 0 ? "+" : "-";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function fmtRoi(n: number): string {
  const pct = n * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}

/** 동기화: 리더보드 맵 + 없는 주소만 portfolio */
export async function fetchPerfForAddresses(
  addresses: string[]
): Promise<Map<string, HlTraderPerf>> {
  const out = new Map<string, HlTraderPerf>();
  const want = new Set(addresses.map((a) => a.toLowerCase()));
  const rows = await fetchLeaderboard(2000);
  for (const r of rows) {
    if (!want.has(r.address)) continue;
    out.set(r.address, perfFromLeaderboardRow(r));
  }
  const missing = [...want].filter((a) => !out.has(a));
  const settled = await Promise.allSettled(
    missing.map(async (a) => [a, await perfFromPortfolio(a)] as const)
  );
  for (const s of settled) {
    if (s.status === "fulfilled") {
      const [a, perf] = s.value;
      out.set(a, perf);
    }
  }
  return out;
}
