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

/** 배치 경기 수 (매매 있는 날 기준) */
export const PLACEMENT_GAMES = 5;

export type TierId =
  | "placement"
  | "iron"
  | "bronze"
  | "silver"
  | "gold"
  | "platinum"
  | "emerald"
  | "diamond"
  | "master"
  | "grandmaster"
  | "challenger";

export interface TierDef {
  id: TierId;
  name: string;
  /** 배지/강조 색 (tailwind 계열 힌트) */
  tone: "stone" | "amber" | "zinc" | "yellow" | "teal" | "emerald" | "sky" | "violet" | "rose";
  /** 해당 티어 진입에 필요한 누적 LP 하한 (배치 제외) */
  minLp: number;
  /** 디비전 사용 여부 (마스터 이상은 단일) */
  hasDivision: boolean;
}

/** 롤 시즌식 티어. LP는 시즌 누적(강등/승급 경계용). */
export const TIERS: TierDef[] = [
  { id: "iron", name: "아이언", tone: "stone", minLp: 0, hasDivision: true },
  { id: "bronze", name: "브론즈", tone: "amber", minLp: 400, hasDivision: true },
  { id: "silver", name: "실버", tone: "zinc", minLp: 800, hasDivision: true },
  { id: "gold", name: "골드", tone: "yellow", minLp: 1200, hasDivision: true },
  { id: "platinum", name: "플래티넘", tone: "teal", minLp: 1600, hasDivision: true },
  { id: "emerald", name: "에메랄드", tone: "emerald", minLp: 2000, hasDivision: true },
  { id: "diamond", name: "다이아몬드", tone: "sky", minLp: 2400, hasDivision: true },
  { id: "master", name: "마스터", tone: "violet", minLp: 2800, hasDivision: false },
  { id: "grandmaster", name: "그랜드마스터", tone: "rose", minLp: 3200, hasDivision: false },
  { id: "challenger", name: "챌린저", tone: "yellow", minLp: 3600, hasDivision: false },
];

const DIVISIONS = ["IV", "III", "II", "I"] as const;
export type Division = (typeof DIVISIONS)[number] | null;

export interface RankState {
  /** 배치 중이면 true */
  placing: boolean;
  placementDone: number;
  placementTotal: number;
  tier: TierId;
  tierName: string;
  division: Division;
  /** 현재 디비전/티어 안에서의 LP 0~99 (마스터+는 표시용 잔여) */
  lp: number;
  /** 다음 디비전/티어까지 진행도 0~100 */
  lpProgress: number;
  /** 시즌 누적 LP (랭크 산정용) */
  seasonLp: number;
  tone: TierDef["tone"] | "stone";
  label: string;
  nextLabel: string;
}

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
  /** 그날 랭크 LP 변동 */
  lpDelta: number;
}

export interface Quest {
  id: string;
  label: string;
  done: boolean;
  /** 아직 판정할 수 없으면 null */
  progress: string;
  xp: number;
  lp: number;
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
  rank: RankState;
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
    lpDelta: 0,
  };
}

/** 하루 결과 → LP. 승률보다 한도·뇌동·손익 구조에 가중. */
export function dayLpDelta(day: GameDay, lossLimit: number): number {
  if (day.trades === 0) return 0;
  let lp = 0;
  lp += day.wins * 4;
  lp += day.losses * -6;
  lp += day.principle * 3;
  lp += day.impulse * -8;
  if (day.pnl > 0) lp += 18;
  else if (day.pnl < 0) lp -= 12;
  if (day.hp <= 0) lp -= 25;
  else if (day.hp >= 70 && day.trades > 0) lp += 8;
  if (day.pnl <= -lossLimit) lp -= 20;
  if (day.afterKo > 0) lp -= 15 * day.afterKo;
  // 과매매 패널티: 하루 6건 초과분
  if (day.trades > 6) lp -= (day.trades - 6) * 3;
  return lp;
}

function rankFromSeasonLp(seasonLp: number, placementDone: number): RankState {
  if (placementDone < PLACEMENT_GAMES) {
    return {
      placing: true,
      placementDone,
      placementTotal: PLACEMENT_GAMES,
      tier: "placement",
      tierName: "배치",
      division: null,
      lp: 0,
      lpProgress: (placementDone / PLACEMENT_GAMES) * 100,
      seasonLp: Math.max(0, seasonLp),
      tone: "stone",
      label: `배치 ${placementDone}/${PLACEMENT_GAMES}`,
      nextLabel: `배치 ${PLACEMENT_GAMES}경기 후 티어 배정`,
    };
  }

  const clamped = Math.max(0, seasonLp);
  let tierIdx = 0;
  for (let i = 0; i < TIERS.length; i += 1) {
    if (clamped >= TIERS[i]!.minLp) tierIdx = i;
  }
  const tier = TIERS[tierIdx]!;
  const next = TIERS[tierIdx + 1];
  const spanStart = tier.minLp;
  const spanEnd = next ? next.minLp : tier.minLp + 400;
  const into = clamped - spanStart;
  const span = Math.max(1, spanEnd - spanStart);

  let division: Division = null;
  let lp = 0;
  let lpProgress = 0;
  let label = tier.name;
  let nextLabel = next ? `${next.name}까지` : "챌린저 유지";

  if (tier.hasDivision) {
    const divSize = span / 4;
    const divIdx = Math.min(3, Math.floor(into / divSize));
    division = DIVISIONS[divIdx]!;
    const intoDiv = into - divIdx * divSize;
    lp = Math.min(99, Math.floor((intoDiv / divSize) * 100));
    lpProgress = (intoDiv / divSize) * 100;
    label = `${tier.name} ${division}`;
    if (divIdx < 3) {
      nextLabel = `${tier.name} ${DIVISIONS[divIdx + 1]}까지`;
    } else if (next) {
      nextLabel = `${next.name} IV까지`;
    }
  } else {
    lp = Math.min(999, Math.floor(into));
    lpProgress = next ? Math.min(100, (into / span) * 100) : 100;
    label = `${tier.name} ${lp} LP`;
    nextLabel = next ? `${next.name}까지` : "최고 티어";
  }

  return {
    placing: false,
    placementDone,
    placementTotal: PLACEMENT_GAMES,
    tier: tier.id,
    tierName: tier.name,
    division,
    lp,
    lpProgress,
    seasonLp: clamped,
    tone: tier.tone,
    label,
    nextLabel,
  };
}

/** 배치 종료 시 시작 LP — 배치 기간 성적 반영 */
function placementBonus(days: GameDay[], lossLimit: number): number {
  const played = days.filter((d) => d.trades > 0).slice(0, PLACEMENT_GAMES);
  if (played.length < PLACEMENT_GAMES) return 0;
  let score = 0;
  for (const d of played) {
    score += dayLpDelta(d, lossLimit);
  }
  // 배치 점수를 아이언~골드 구간에 매핑
  return Math.max(0, Math.min(1400, 200 + score * 3));
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
    day.lpDelta = dayLpDelta(day, limit);
  }

  const today = byDay.get(input.today) ?? emptyDay(input.today);
  today.lpDelta = dayLpDelta(today, limit);

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
      label: "오늘 승률 60% 이상 (3번 이상)",
      done: today.trades >= 3 && (todayRate ?? 0) >= 60,
      progress:
        today.trades === 0
          ? "아직 매매 없음"
          : `${today.wins}승 ${today.losses}패 · ${(todayRate ?? 0).toFixed(0)}%`,
      xp: 20,
      lp: 8,
    },
    {
      id: "losses",
      label: "손실 매매 2번 이하",
      done: today.trades > 0 && today.losses <= 2,
      progress: `손실 ${today.losses}번`,
      xp: 15,
      lp: 6,
    },
    {
      id: "hp",
      label: "HP 지키기 (손실 한도 안)",
      done: today.trades > 0 && today.hp > 0,
      progress: `HP ${today.hp}`,
      xp: 20,
      lp: 10,
    },
    {
      id: "impulse",
      label: "뇌동 매매 0번",
      done: today.trades > 0 && today.impulse === 0,
      progress: `뇌동 ${today.impulse}번`,
      xp: 15,
      lp: 8,
    },
    {
      id: "target",
      label: "하루 목표 수익 달성",
      done: input.dailyTarget > 0 ? today.pnl >= input.dailyTarget : today.pnl > 0,
      progress: `${today.pnl >= 0 ? "+" : ""}$${today.pnl.toFixed(2)} / $${input.dailyTarget.toFixed(2)}`,
      xp: 30,
      lp: 12,
    },
  ];

  const questXp = quests.reduce((s, q) => s + (q.done ? q.xp : 0), 0);
  const questLp = quests.reduce((s, q) => s + (q.done ? q.lp : 0), 0);
  const xp = Math.max(0, days.reduce((s, d) => s + d.xp, 0) + questXp);
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const levelProgress = ((xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100;

  const playedDays = days.filter((d) => d.trades > 0);
  const placementDone = Math.min(PLACEMENT_GAMES, playedDays.length);
  let seasonLp = 0;
  if (placementDone >= PLACEMENT_GAMES) {
    seasonLp = placementBonus(days, limit);
    for (const d of playedDays.slice(PLACEMENT_GAMES)) {
      if (d.date === input.today) continue;
      seasonLp += d.lpDelta;
    }
    // 오늘 진행분은 미리보기용으로 포함
    if (today.trades > 0) seasonLp += today.lpDelta;
    seasonLp += questLp;
  }

  const rank = rankFromSeasonLp(seasonLp, placementDone);

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
    {
      id: "gold",
      label: "골드 이상",
      hint: "시즌 티어 골드 IV 이상",
      earned: !rank.placing && ["gold", "platinum", "emerald", "diamond", "master", "grandmaster", "challenger"].includes(rank.tier),
    },
  ];

  return {
    season,
    xp,
    level,
    levelProgress,
    rank,
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
