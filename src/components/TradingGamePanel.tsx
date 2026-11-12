"use client";

import { useMemo } from "react";
import type { Trade } from "@/lib/exchanges/types";
import type { GoalChallengePrefs } from "@/lib/prefs";
import { buildGame, XP, XP_PER_LEVEL } from "@/lib/game/trading-game";

function kstToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function daysInMonth(yyyyMm: string): number {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function rateTier(rate: number | null): { label: string; cls: string } {
  if (rate == null) return { label: "—", cls: "text-zinc-500" };
  if (rate >= 60) return { label: "골드", cls: "text-amber-300" };
  if (rate >= 55) return { label: "실버", cls: "text-zinc-200" };
  if (rate >= 50) return { label: "브론즈", cls: "text-orange-300" };
  return { label: "언랭", cls: "text-rose-300" };
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

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-xs text-zinc-400">{Number(game.season.slice(5))}월 시즌</p>
            <p className="text-[11px] text-zinc-500">XP {game.xp.toLocaleString()}</p>
          </div>
          <p className="mt-1 text-3xl font-bold text-sky-200">Lv.{game.level}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-2 rounded-full bg-sky-400 transition-all"
              style={{ width: `${game.levelProgress}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            다음 레벨까지 {Math.round(XP_PER_LEVEL - (game.xp % XP_PER_LEVEL))} XP
          </p>
        </div>

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
              ? `오늘은 끝. 지금부터 치는 매매는 XP ${XP.afterKoMultiplier}배로 깎입니다${
                  game.today.afterKo > 0 ? ` (이미 ${game.today.afterKo}번)` : ""
                }.`
              : "수익은 HP를 채우지 않습니다. 잃은 만큼만 깎입니다."}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
          <p className="text-xs text-zinc-400">연승</p>
          <p className="mt-1 text-3xl font-bold text-zinc-50">
            {game.streak}
            <span className="ml-1 text-base font-medium text-zinc-500">연승</span>
          </p>
          <p className="mt-2 text-[11px] text-zinc-500">
            시즌 최고 {game.bestStreak}연승 · 수익일 {game.greenStreak}일 연속
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["오늘", game.winRateToday],
            ["7일", game.winRate7],
            ["시즌", game.winRateSeason],
          ] as const
        ).map(([label, value]) => {
          const tier = rateTier(value);
          return (
            <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5">
              <div className="flex items-center justify-between text-[11px] text-zinc-500">
                <span>{label} 승률</span>
                <span className={tier.cls}>{tier.label}</span>
              </div>
              <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-50">
                {value == null ? "—" : `${value.toFixed(1)}%`}
              </p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-1.5 rounded-full ${
                    (value ?? 0) >= 60
                      ? "bg-amber-300"
                      : (value ?? 0) >= 50
                        ? "bg-emerald-400"
                        : "bg-rose-400"
                  }`}
                  style={{ width: `${Math.min(100, value ?? 0)}%` }}
                />
              </div>
            </div>
          );
        })}
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
                <span className={q.done ? "text-emerald-300" : "text-zinc-600"}>
                  +{q.xp}
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
                    ? "border-amber-300/60 bg-amber-300/15 text-amber-100"
                    : "border-zinc-800 text-zinc-600"
                }`}
              >
                {b.earned ? "★ " : ""}
                {b.label}
              </span>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
            XP 규칙: 수익 매매 +{XP.win}, 손실 매매 {XP.loss}, 원칙 +{XP.principle}, 뇌동{" "}
            {XP.impulse}, 수익일 +{XP.greenDay}, 손실일 {XP.redDay}, 한도 넘긴 날{" "}
            {XP.overLimitDay}. 이기는 것보다 지는 게 더 아프게 짰습니다. 레벨은 매달
            새 시즌으로 다시 시작합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
