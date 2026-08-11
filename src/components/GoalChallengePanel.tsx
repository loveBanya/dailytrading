"use client";

import { useEffect, useMemo, useState } from "react";
import type { DailyPnl } from "@/lib/stats/compute";
import type { WalletOverview } from "@/lib/exchanges/wallet";
import {
  loadGoalChallenge,
  saveGoalChallenge,
  type GoalChallengePrefs,
} from "@/lib/prefs";

interface GoalChallengePanelProps {
  wallet: WalletOverview | null;
  walletLoading?: boolean;
  daily: DailyPnl[];
  onGoalUsdtChange?: (goalUsdt: number | null) => void;
}

function won(n: number): string {
  return `₩${Math.round(n).toLocaleString("ko-KR")}`;
}

function kstToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00+09:00`).getTime();
  const b = new Date(`${to}T00:00:00+09:00`).getTime();
  return Math.max(0, Math.ceil((b - a) / 86_400_000));
}

export function GoalChallengePanel({
  wallet,
  walletLoading,
  daily,
  onGoalUsdtChange,
}: GoalChallengePanelProps) {
  const [prefs, setPrefs] = useState<GoalChallengePrefs>(() =>
    loadGoalChallenge()
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const loaded = loadGoalChallenge();
    setPrefs(loaded);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveGoalChallenge(prefs);
  }, [prefs, ready]);

  const liveUsdt = wallet?.totalEquity ?? 0;
  const currentKrw = liveUsdt * prefs.fxRate;
  const goalUsdt =
    prefs.fxRate > 0 ? prefs.targetKrw / prefs.fxRate : null;

  useEffect(() => {
    onGoalUsdtChange?.(goalUsdt);
  }, [goalUsdt, onGoalUsdtChange]);

  const today = kstToday();
  const remainingDays = Math.max(1, daysBetween(today, prefs.deadline));
  const gapKrw = Math.max(0, prefs.targetKrw - currentKrw);
  const dailyNeedKrw = gapKrw / remainingDays;
  const dailyNeedPct =
    currentKrw > 0 ? (dailyNeedKrw / currentKrw) * 100 : 0;

  const todayPnlUsdt = useMemo(() => {
    const row = daily.find((d) => d.date === today);
    return row?.pnl ?? 0;
  }, [daily, today]);
  const todayPnlKrw = todayPnlUsdt * prefs.fxRate;
  const todayProgress =
    dailyNeedKrw > 0
      ? Math.min(150, (todayPnlKrw / dailyNeedKrw) * 100)
      : todayPnlKrw > 0
        ? 100
        : 0;

  const totalProgress = Math.min(
    100,
    prefs.targetKrw > 0 ? (currentKrw / prefs.targetKrw) * 100 : 0
  );

  function update(patch: Partial<GoalChallengePrefs>) {
    setPrefs((p) => ({ ...p, ...patch }));
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        2026-12-31까지 ₩1억을 목표로 매일 필요 수익금·수익률을 계산합니다.
        (가상자산 과세 2027-01-01 대비) 환율은 직접 맞춰 주세요.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-zinc-500">
          목표 (원)
          <input
            type="number"
            step={1_000_000}
            value={prefs.targetKrw}
            onChange={(e) =>
              update({ targetKrw: Math.max(0, Number(e.target.value) || 0) })
            }
            className="mt-1 block w-36 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-200"
          />
        </label>
        <label className="text-xs text-zinc-500">
          마감
          <input
            type="date"
            value={prefs.deadline}
            onChange={(e) => update({ deadline: e.target.value })}
            className="mt-1 block rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-200"
          />
        </label>
        <label className="text-xs text-zinc-500">
          환율 (원/USDT)
          <input
            type="number"
            step={10}
            value={prefs.fxRate}
            onChange={(e) =>
              update({ fxRate: Math.max(1, Number(e.target.value) || 1350) })
            }
            className="mt-1 block w-28 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-200"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="현재 자산"
          value={
            walletLoading
              ? "…"
              : `${won(currentKrw)} · $${liveUsdt.toFixed(0)}`
          }
        />
        <Stat label="목표까지" value={won(gapKrw)} />
        <Stat label="남은 일수" value={`${remainingDays}일`} />
        <Stat
          label="목표 USDT"
          value={goalUsdt != null ? `$${goalUsdt.toFixed(0)}` : "—"}
          accent="amber"
        />
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-amber-300/80">
          오늘 도전 목표
        </p>
        <div className="mt-2 flex flex-wrap gap-6">
          <div>
            <p className="text-[11px] text-zinc-500">필요 수익금</p>
            <p className="text-xl font-semibold tabular-nums text-amber-100">
              {won(dailyNeedKrw)}
            </p>
            <p className="text-xs text-zinc-600">
              ≈ ${(dailyNeedKrw / prefs.fxRate).toFixed(2)} USDT
            </p>
          </div>
          <div>
            <p className="text-[11px] text-zinc-500">필요 수익률</p>
            <p className="text-xl font-semibold tabular-nums text-amber-100">
              {dailyNeedPct.toFixed(2)}%
            </p>
            <p className="text-xs text-zinc-600">현재 자산 대비 일일</p>
          </div>
          <div>
            <p className="text-[11px] text-zinc-500">오늘 실현손익</p>
            <p
              className={`text-xl font-semibold tabular-nums ${
                todayPnlKrw >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {won(todayPnlKrw)}
            </p>
            <p className="text-xs text-zinc-600">
              ${todayPnlUsdt.toFixed(2)} · 일일 목표 대비{" "}
              {todayProgress.toFixed(0)}%
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-[11px] text-zinc-500">
            <span>오늘 일일 목표</span>
            <span>{Math.min(100, todayProgress).toFixed(0)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={`h-2 rounded-full transition-all ${
                todayProgress >= 100 ? "bg-emerald-500" : "bg-amber-400"
              }`}
              style={{ width: `${Math.min(100, Math.max(0, todayProgress))}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-zinc-500">
            <span>전체 1억 진행</span>
            <span>{totalProgress.toFixed(1)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-2 rounded-full bg-sky-400/80"
              style={{ width: `${totalProgress}%` }}
            />
          </div>
        </div>
      </div>

      {gapKrw <= 0 && (
        <p className="text-sm text-emerald-400">
          목표 금액을 달성했습니다. 과세·인출·리스크 관리를 점검하세요.
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "amber";
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p
        className={`mt-0.5 text-sm font-semibold tabular-nums ${
          accent === "amber" ? "text-amber-200" : "text-zinc-100"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
