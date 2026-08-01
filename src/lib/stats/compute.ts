import type { Trade } from "@/lib/exchanges/types";

export interface MonthlyStat {
  month: string; // YYYY-MM
  label: string; // 2026년 7월
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  pnl: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number | null;
  rrRatio: number | null; // 평균익 / |평균손| = 손익비
}

export interface DailyPnl {
  date: string; // YYYY-MM-DD (KST)
  pnl: number;
  trades: number;
}

export interface OverallStats {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  /** 익절 합 (양수) */
  totalProfit: number;
  /** 손절 합 절대값 (양수) */
  totalLoss: number;
  /** 대략 거래대금 Σ(qty × exit) */
  tradingVolume: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number | null;
  rrRatio: number | null;
  expectancy: number;
  bestTrade: number;
  worstTrade: number;
  avgHoldMinutes: number;
  winningDays: number;
  losingDays: number;
  breakevenDays: number;
}

function monthKey(iso: string): string {
  return dayKeyKst(iso).slice(0, 7);
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${y}년 ${Number(m)}월`;
}

/** 한국 시간 기준 YYYY-MM-DD */
export function dayKeyKst(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    timeZone: "Asia/Seoul",
  });
}

function computeFromList(trades: Trade[]) {
  const wins = trades.filter((t) => Number(t.pnl) > 0);
  const losses = trades.filter((t) => Number(t.pnl) < 0);
  const totalPnl = trades.reduce((s, t) => s + Number(t.pnl), 0);
  const winSum = wins.reduce((s, t) => s + Number(t.pnl), 0);
  const lossSum = losses.reduce((s, t) => s + Number(t.pnl), 0);
  const avgWin = wins.length ? winSum / wins.length : 0;
  const avgLoss = losses.length ? lossSum / losses.length : 0;
  const absAvgLoss = Math.abs(avgLoss);
  const rrRatio = absAvgLoss > 0 ? avgWin / absAvgLoss : null;
  const tradingVolume = trades.reduce(
    (s, t) => s + Math.abs(Number(t.qty)) * Number(t.exit_price),
    0
  );

  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    totalPnl,
    totalProfit: winSum,
    totalLoss: Math.abs(lossSum),
    tradingVolume,
    avgWin,
    avgLoss,
    profitFactor:
      Math.abs(lossSum) > 0
        ? winSum / Math.abs(lossSum)
        : wins.length > 0
          ? Infinity
          : null,
    rrRatio,
    expectancy: trades.length ? totalPnl / trades.length : 0,
    bestTrade: trades.length
      ? Math.max(...trades.map((t) => Number(t.pnl)))
      : 0,
    worstTrade: trades.length
      ? Math.min(...trades.map((t) => Number(t.pnl)))
      : 0,
    avgHoldMinutes: (() => {
      const withDur = trades.filter((t) => t.duration_minutes != null);
      if (!withDur.length) return 0;
      return (
        withDur.reduce((s, t) => s + Number(t.duration_minutes), 0) /
        withDur.length
      );
    })(),
  };
}

function dayBreakdown(trades: Trade[]) {
  const byDay = new Map<string, number>();
  for (const t of trades) {
    const key = dayKeyKst(t.exit_time);
    byDay.set(key, (byDay.get(key) ?? 0) + Number(t.pnl));
  }
  let winningDays = 0;
  let losingDays = 0;
  let breakevenDays = 0;
  for (const pnl of byDay.values()) {
    if (pnl > 0.005) winningDays += 1;
    else if (pnl < -0.005) losingDays += 1;
    else breakevenDays += 1;
  }
  return { winningDays, losingDays, breakevenDays };
}

export function computeOverallStats(trades: Trade[]): OverallStats {
  const base = computeFromList(trades);
  const days = dayBreakdown(trades);
  return {
    ...base,
    profitFactor: base.profitFactor === Infinity ? null : base.profitFactor,
    ...days,
  };
}

export function computeMonthlyStats(trades: Trade[]): MonthlyStat[] {
  const groups = new Map<string, Trade[]>();
  for (const t of trades) {
    const key = monthKey(t.exit_time);
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, list]) => {
      const s = computeFromList(list);
      return {
        month,
        label: monthLabel(month),
        trades: s.trades,
        wins: s.wins,
        losses: s.losses,
        winRate: s.winRate,
        pnl: s.totalPnl,
        avgWin: s.avgWin,
        avgLoss: s.avgLoss,
        profitFactor: s.profitFactor === Infinity ? null : s.profitFactor,
        rrRatio: s.rrRatio,
      };
    });
}

/** 일별 손익 (KST 청산일 기준) */
export function computeDailyPnl(trades: Trade[]): DailyPnl[] {
  const groups = new Map<string, { pnl: number; trades: number }>();
  for (const t of trades) {
    const key = dayKeyKst(t.exit_time);
    const cur = groups.get(key) ?? { pnl: 0, trades: 0 };
    cur.pnl += Number(t.pnl);
    cur.trades += 1;
    groups.set(key, cur);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, pnl: v.pnl, trades: v.trades }));
}
