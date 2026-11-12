import type { Trade } from "@/lib/exchanges/types";
import { dayKeyKst } from "@/lib/stats/compute";

/** 이기면 조금, 지면 더 많이. 잃는 게 아프게 짠다. */
export const XP = {
  win: 10,
  loss: -15,
  principle: 5,
  impulse: -10,
  greenDay: 25,
  redDay: -25,
  /** 손실 한도를 넘긴 날 추가로 깎는다 */
  overLimitDay: -40,
  /** HP 0 뒤에 친 매매는 손익과 상관없이 두 배로 깎는다 */
  afterKoMultiplier: 2,
} as const;

export const XP_PER_LEVEL = 150;

export interface GameDay {
  date: string;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
  impulse: number;
  principle: number;
  /** 0~100. 손실만 깎는다 */
  hp: number;
  /** HP 0 이후에 친 매매 수 */
  afterKo: number;
  xp: number;
}

export interface Quest {
  id: string;
  label: string;
  done: boolean;
  /** 아직 판정할 수 없으면 null */
  progress: string;
  xp: number;
}

export interface Badge {
  id: string;
  label: string;
  hint: string;
  earned: boolean;
}

export interface GameState {
  season: string;
  xp: number;
  level: number;
  levelProgress: number;
  today: GameDay;
  days: GameDay[];
  winRateToday: number | null;
  winRate7: number | null;
  winRateSeason: number | null;
  streak: number;
  bestStreak: number;
  greenStreak: number;
  quests: Quest[];
  badges: Badge[];
}

function styleOf(trade: Trade): "원칙" | "뇌동" | null {
  if (trade.trade_style === "원칙" || trade.trade_style === "뇌동") {
    return trade.trade_style;
  }
  const tags = trade.tags ?? [];
  if (tags.includes("원칙")) return "원칙";
  if (tags.includes("뇌동")) return "뇌동";
  return null;
}

function rate(wins: number, losses: number): number | null {
  const n = wins + losses;
  return n > 0 ? (wins / n) * 100 : null;
}

function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00+09:00`);
  d.setDate(d.getDate() + delta);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function emptyDay(date: string): GameDay {
  return {
    date,
    pnl: 0,
    trades: 0,
    wins: 0,
    losses: 0,
    impulse: 0,
    principle: 0,
    hp: 100,
    afterKo: 0,
    xp: 0,
  };
}

export function buildGame(input: {
  trades: Trade[];
  today: string;
  lossLimit: number;
  dailyTarget: number;
}): GameState {
  const season = input.today.slice(0, 7);
  const limit = input.lossLimit > 0 ? input.lossLimit : 15;
  const seasonTrades = input.trades
    .filter((t) => dayKeyKst(t.exit_time).startsWith(season))
    .sort(
      (a, b) => new Date(a.exit_time).getTime() - new Date(b.exit_time).getTime()
    );

  const byDay = new Map<string, GameDay>();
  let streak = 0;
  let bestStreak = 0;
  for (const trade of seasonTrades) {
    const date = dayKeyKst(trade.exit_time);
    const day = byDay.get(date) ?? emptyDay(date);
    byDay.set(date, day);
    const pnl = Number(trade.pnl) || 0;
    const knockedOut = day.hp <= 0;
    const win = pnl > 0;
    let xp = win ? XP.win : pnl < 0 ? XP.loss : 0;
    const style = styleOf(trade);
    if (style === "원칙") {
      xp += XP.principle;
      day.principle += 1;
    }
    if (style === "뇌동") {
      xp += XP.impulse;
      day.impulse += 1;
    }
    if (knockedOut) {
      xp = -Math.abs(xp) * XP.afterKoMultiplier;
      day.afterKo += 1;
    }
    day.xp += xp;
    day.trades += 1;
    day.pnl += pnl;
    if (win) day.wins += 1;
    else if (pnl < 0) day.losses += 1;
    const lossSoFar = Math.max(0, -Math.min(0, day.pnl));
    day.hp = Math.max(0, Math.round(100 - (lossSoFar / limit) * 100));

    if (win) {
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
    } else if (pnl < 0) {
      streak = 0;
    }
  }

  const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const day of days) {
    if (day.date === input.today) continue;
    if (day.pnl > 0) day.xp += XP.greenDay;
    else if (day.pnl < 0) day.xp += XP.redDay;
    if (day.pnl <= -limit) day.xp += XP.overLimitDay;
  }

  const today = byDay.get(input.today) ?? emptyDay(input.today);

  let greenStreak = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const day = days[i]!;
    if (day.date === input.today && day.trades === 0) continue;
    if (day.pnl > 0) greenStreak += 1;
    else break;
  }

  const weekFrom = addDays(input.today, -6);
  const week = days.filter((d) => d.date >= weekFrom);
  const sum = (rows: GameDay[], key: "wins" | "losses") =>
    rows.reduce((s, d) => s + d[key], 0);

  const todayRate = rate(today.wins, today.losses);
  const quests: Quest[] = [
    {
      id: "rate",
      label: "오늘 승률 60% 이상 (3번 이상 쳐서)",
      done: today.trades >= 3 && (todayRate ?? 0) >= 60,
      progress:
        today.trades === 0
          ? "아직 매매 없음"
          : `${today.wins}승 ${today.losses}패 · ${(todayRate ?? 0).toFixed(0)}%`,
      xp: 20,
    },
    {
      id: "losses",
      label: "손실 매매 2번 이하",
      done: today.trades > 0 && today.losses <= 2,
      progress: `손실 ${today.losses}번`,
      xp: 15,
    },
    {
      id: "hp",
      label: "HP 지키기 (손실 한도 안에서 끝내기)",
      done: today.trades > 0 && today.hp > 0,
      progress: `HP ${today.hp}`,
      xp: 20,
    },
    {
      id: "impulse",
      label: "뇌동 매매 0번",
      done: today.trades > 0 && today.impulse === 0,
      progress: `뇌동 ${today.impulse}번`,
      xp: 15,
    },
    {
      id: "target",
      label: "하루 목표 수익 달성",
      done: input.dailyTarget > 0 ? today.pnl >= input.dailyTarget : today.pnl > 0,
      progress: `${today.pnl >= 0 ? "+" : ""}$${today.pnl.toFixed(2)} / $${input.dailyTarget.toFixed(2)}`,
      xp: 30,
    },
  ];

  const questXp = quests.reduce((s, q) => s + (q.done ? q.xp : 0), 0);
  const xp = Math.max(0, days.reduce((s, d) => s + d.xp, 0) + questXp);
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const levelProgress = ((xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100;

  const principleTotal = days.reduce((s, d) => s + d.principle, 0);
  const keptLimitDays = days.filter((d) => d.trades > 0 && d.hp > 0).length;
  const seasonRate = rate(sum(days, "wins"), sum(days, "losses"));
  const weekRate = rate(sum(week, "wins"), sum(week, "losses"));
  const badges: Badge[] = [
    { id: "s5", label: "5연승", hint: "손실 없이 5번 연속 수익", earned: bestStreak >= 5 },
    { id: "s10", label: "10연승", hint: "손실 없이 10번 연속 수익", earned: bestStreak >= 10 },
    { id: "g3", label: "3일 연속 수익", hint: "수익으로 끝난 날 3일 연속", earned: greenStreak >= 3 },
    {
      id: "w60",
      label: "주간 승률 60%",
      hint: "최근 7일 10번 이상, 승률 60% 이상",
      earned: sum(week, "wins") + sum(week, "losses") >= 10 && (weekRate ?? 0) >= 60,
    },
    { id: "p20", label: "원칙 20회", hint: "이번 시즌 원칙매매 20번", earned: principleTotal >= 20 },
    { id: "k7", label: "한도 지킴 7일", hint: "손실 한도 안에서 끝낸 날 7일", earned: keptLimitDays >= 7 },
    {
      id: "clean",
      label: "노 뇌동 주간",
      hint: "최근 7일 매매가 있고 뇌동 0번",
      earned: week.length > 0 && week.every((d) => d.impulse === 0),
    },
  ];

  return {
    season,
    xp,
    level,
    levelProgress,
    today,
    days,
    winRateToday: todayRate,
    winRate7: weekRate,
    winRateSeason: seasonRate,
    streak,
    bestStreak,
    greenStreak,
    quests,
    badges,
  };
}
