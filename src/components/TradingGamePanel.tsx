"use client";

import { useMemo, type ReactNode } from "react";
import type { Trade } from "@/lib/exchanges/types";
import type { GoalChallengePrefs } from "@/lib/prefs";
import {
  PLACEMENT_GAMES,
  TIERS,
  XP,
  XP_PER_LEVEL,
  buildGame,
  type TierDef,
  type TierId,
} from "@/lib/game/trading-game";

function kstToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function daysInMonth(yyyyMm: string): number {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

const TONE: Record<
  TierDef["tone"] | "stone",
  { border: string; bg: string; text: string; bar: string; glow: string }
> = {
  stone: {
    border: "border-stone-500/40",
    bg: "bg-stone-500/10",
    text: "text-stone-200",
    bar: "bg-stone-400",
    glow: "from-stone-500/20",
  },
  amber: {
    border: "border-amber-700/50",
    bg: "bg-amber-900/20",
    text: "text-amber-200",
    bar: "bg-amber-600",
    glow: "from-amber-700/25",
  },
  zinc: {
    border: "border-zinc-300/40",
    bg: "bg-zinc-100/5",
    text: "text-zinc-100",
    bar: "bg-zinc-300",
    glow: "from-zinc-400/20",
  },
  yellow: {
    border: "border-yellow-400/50",
    bg: "bg-yellow-400/10",
    text: "text-yellow-200",
    bar: "bg-yellow-400",
    glow: "from-yellow-400/25",
  },
  teal: {
    border: "border-teal-400/45",
    bg: "bg-teal-400/10",
    text: "text-teal-200",
    bar: "bg-teal-400",
    glow: "from-teal-400/20",
  },
  emerald: {
    border: "border-emerald-400/45",
    bg: "bg-emerald-400/10",
    text: "text-emerald-200",
    bar: "bg-emerald-400",
    glow: "from-emerald-400/20",
  },
  sky: {
    border: "border-sky-400/50",
    bg: "bg-sky-400/10",
    text: "text-sky-200",
    bar: "bg-sky-400",
    glow: "from-sky-400/25",
  },
  violet: {
    border: "border-violet-400/50",
    bg: "bg-violet-400/10",
    text: "text-violet-200",
    bar: "bg-violet-400",
    glow: "from-violet-400/25",
  },
  rose: {
    border: "border-rose-400/50",
    bg: "bg-rose-400/10",
    text: "text-rose-200",
    bar: "bg-rose-400",
    glow: "from-rose-400/25",
  },
};

function TierEmblem({
  tier,
  division,
  placing,
}: {
  tier: TierId;
  division: string | null;
  placing: boolean;
}) {
  const tone = placing ? TONE.stone : TONE[TIERS.find((t) => t.id === tier)?.tone ?? "stone"];
  return (
    <div
      className={`relative flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl border ${tone.border} ${tone.bg}`}
    >
      <div
        className={`pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b ${tone.glow} to-transparent`}
      />
      {placing ? (
        <div className="relative text-center">
          <p className="text-[10px] tracking-[0.2em] text-zinc-500">PLACEMENT</p>
          <p className={`mt-1 text-2xl font-bold ${tone.text}`}>배치</p>
        </div>
      ) : (
        <div className="relative text-center">
          <p className={`text-[10px] font-medium tracking-wider uppercase ${tone.text} opacity-70`}>
            {tier}
          </p>
          <p className={`mt-0.5 text-xl font-bold leading-tight ${tone.text}`}>
            {TIERS.find((t) => t.id === tier)?.name}
          </p>
          {division && (
            <p className={`mt-0.5 text-lg font-semibold tabular-nums ${tone.text}`}>{division}</p>
          )}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

export function TradingGamePanel({
  trades,
  prefs,
  onPrefsChange,
}: {
  trades: Trade[];
  prefs: GoalChallengePrefs;
  onPrefsChange: (
    prefs: GoalChallengePrefs | ((p: GoalChallengePrefs) => GoalChallengePrefs)
  ) => void;
}) {
  const today = kstToday();
  const dailyTarget =
    prefs.monthlyTargetUsdt > 0
      ? prefs.monthlyTargetUsdt / daysInMonth(today.slice(0, 7))
      : 0;
  const game = useMemo(
    () =>
      buildGame({
        trades,
        today,
        lossLimit: prefs.gameLossLimitUsdt,
        dailyTarget,
      }),
    [trades, today, prefs.gameLossLimitUsdt, dailyTarget]
  );
  const ko = game.today.hp <= 0;
  const hpColor =
    game.today.hp > 60 ? "bg-emerald-400" : game.today.hp > 25 ? "bg-amber-400" : "bg-rose-500";
  const questsDone = game.quests.filter((q) => q.done).length;
  const rankTone = game.rank.placing
    ? TONE.stone
    : TONE[TIERS.find((t) => t.id === game.rank.tier)?.tone ?? "stone"];
  const todayLp = game.today.lpDelta;

  return (
    <div className="space-y-4">
      {/* 랭크 히어로 */}
      <div
        className={`overflow-hidden rounded-2xl border ${rankTone.border} bg-zinc-950/80`}
      >
        <div className={`bg-gradient-to-br ${rankTone.glow} via-transparent to-transparent p-4 sm:p-5`}>
          <div className="flex flex-wrap items-center gap-4">
            <TierEmblem
              tier={game.rank.tier}
              division={game.rank.division}
              placing={game.rank.placing}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-xs text-zinc-500">{Number(game.season.slice(5))}월 시즌 랭크</p>
                <p className="text-[11px] text-zinc-600">
                  Lv.{game.level} · XP {game.xp.toLocaleString()}
                </p>
              </div>
              <p className={`mt-1 text-3xl font-bold tracking-tight ${rankTone.text}`}>
                {game.rank.label}
              </p>
              {game.rank.placing ? (
                <>
                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={`h-2.5 rounded-full ${rankTone.bar} transition-all`}
                      style={{ width: `${game.rank.lpProgress}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-400">
                    배치 {game.rank.placementDone}/{game.rank.placementTotal} · 매매 있는 날{" "}
                    {PLACEMENT_GAMES}일이 끝나면 티어가 배정됩니다
                  </p>
                </>
              ) : (
                <>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className={`h-2.5 rounded-full ${rankTone.bar} transition-all`}
                        style={{ width: `${Math.min(100, game.rank.lpProgress)}%` }}
                      />
                    </div>
                    <p className={`shrink-0 text-sm font-semibold tabular-nums ${rankTone.text}`}>
                      {game.rank.division ? `${game.rank.lp} LP` : `${game.rank.lp} LP`}
                    </p>
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-400">
                    {game.rank.nextLabel} · 시즌 LP {Math.round(game.rank.seasonLp)}
                    {todayLp !== 0 && (
                      <span className={todayLp > 0 ? " text-emerald-400" : " text-rose-400"}>
                        {" "}
                        · 오늘 {todayLp > 0 ? "+" : ""}
                        {todayLp}
                      </span>
                    )}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* 티어 로드맵 */}
          <div className="mt-4 flex gap-1 overflow-x-auto pb-1">
            {TIERS.map((t) => {
              const active = !game.rank.placing && game.rank.tier === t.id;
              const passed =
                !game.rank.placing &&
                game.rank.seasonLp >= t.minLp &&
                t.id !== game.rank.tier;
              const c = TONE[t.tone];
              return (
                <div
                  key={t.id}
                  className={`shrink-0 rounded-md border px-2 py-1 text-[10px] ${
                    active
                      ? `${c.border} ${c.bg} ${c.text} font-semibold`
                      : passed
                        ? "border-zinc-700 text-zinc-400"
                        : "border-zinc-800/80 text-zinc-600"
                  }`}
                >
                  {t.name}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div
          className={`rounded-xl border p-4 ${
            ko ? "border-rose-500/60 bg-rose-500/10" : "border-zinc-800 bg-zinc-950/40"
          }`}
        >
          <div className="flex items-baseline justify-between">
            <p className="text-xs text-zinc-400">오늘 HP</p>
            <label className="text-[11px] text-zinc-500">
              손실 한도 $
              <input
                type="number"
                min={1}
                step={1}
                value={prefs.gameLossLimitUsdt}
                onChange={(e) =>
                  onPrefsChange((p) => ({
                    ...p,
                    gameLossLimitUsdt: Math.max(1, Number(e.target.value) || 1),
                  }))
                }
                className="ml-1 w-14 rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-right text-[11px] text-zinc-200"
              />
            </label>
          </div>
          <p className={`mt-1 text-3xl font-bold ${ko ? "text-rose-300" : "text-zinc-50"}`}>
            {ko ? "K.O." : game.today.hp}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={`h-2 rounded-full transition-all ${hpColor}`}
              style={{ width: `${game.today.hp}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            {ko
              ? `오늘은 끝. 이후 매매는 XP·LP가 크게 깎입니다${
                  game.today.afterKo > 0 ? ` (이미 ${game.today.afterKo}번)` : ""
                }.`
              : "수익은 HP를 안 채웁니다. 잃은 만큼만 깎입니다."}
          </p>
        </div>

        <MiniStat label="연승">
          <p className="text-2xl font-bold text-zinc-50">
            {game.streak}
            <span className="ml-1 text-sm font-medium text-zinc-500">연승</span>
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            최고 {game.bestStreak} · 수익일 {game.greenStreak}일 연속
          </p>
        </MiniStat>

        <MiniStat label="오늘 랭크 변동">
          <p
            className={`text-2xl font-bold tabular-nums ${
              todayLp > 0 ? "text-emerald-300" : todayLp < 0 ? "text-rose-300" : "text-zinc-400"
            }`}
          >
            {todayLp > 0 ? "+" : ""}
            {todayLp}
            <span className="ml-1 text-sm font-medium text-zinc-500">LP</span>
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            한도 준수·저뇌동·적정 횟수가 LP에 더 크게 붙습니다
          </p>
        </MiniStat>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["오늘", game.winRateToday],
            ["7일", game.winRate7],
            ["시즌", game.winRateSeason],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5">
            <p className="text-[11px] text-zinc-500">{label} 승률</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-50">
              {value == null ? "—" : `${value.toFixed(1)}%`}
            </p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className={`h-1.5 rounded-full ${
                  (value ?? 0) >= 60
                    ? "bg-yellow-400"
                    : (value ?? 0) >= 50
                      ? "bg-emerald-400"
                      : "bg-rose-400"
                }`}
                style={{ width: `${Math.min(100, value ?? 0)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-200">오늘 퀘스트</p>
            <span className="text-[11px] text-zinc-500">
              {questsDone}/{game.quests.length} 완료
            </span>
          </div>
          <ul className="space-y-1.5">
            {game.quests.map((q) => (
              <li
                key={q.id}
                className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs ${
                  q.done ? "bg-emerald-500/10 text-emerald-200" : "bg-zinc-900/60 text-zinc-300"
                }`}
              >
                <span>
                  {q.done ? "✓ " : "○ "}
                  {q.label}
                  <span className="ml-1.5 text-zinc-500">{q.progress}</span>
                </span>
                <span className={`shrink-0 tabular-nums ${q.done ? "text-emerald-300" : "text-zinc-600"}`}>
                  +{q.xp}XP · +{q.lp}LP
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
          <p className="mb-2 text-sm font-medium text-zinc-200">배지</p>
          <div className="flex flex-wrap gap-1.5">
            {game.badges.map((b) => (
              <span
                key={b.id}
                title={b.hint}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  b.earned
                    ? "border-yellow-400/50 bg-yellow-400/10 text-yellow-100"
                    : "border-zinc-800 text-zinc-600"
                }`}
              >
                {b.earned ? "★ " : ""}
                {b.label}
              </span>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
            랭크는 매달 시즌으로 리셋됩니다. 배치 {PLACEMENT_GAMES}일 후 티어 배정 · LP는 수익뿐
            아니라 HP·뇌동·과매매에 더 민감합니다. XP: 수익 +{XP.win} / 손실 {XP.loss} / 원칙 +
            {XP.principle} / 뇌동 {XP.impulse}. 레벨 단위 {XP_PER_LEVEL} XP.
          </p>
        </div>
      </div>
    </div>
  );
}
