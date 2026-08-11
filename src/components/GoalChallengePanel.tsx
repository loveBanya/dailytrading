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

function usdt(n: number, digits = 2): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
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
    setPrefs(loadGoalChallenge());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveGoalChallenge(prefs);
  }, [prefs, ready]);

  const fx = prefs.fxRate > 0 ? prefs.fxRate : 1350;
  const liveUsdt = wallet?.totalEquity ?? 0;
  const currentKrw = liveUsdt * fx;
  const goalUsdt = prefs.targetKrw / fx;
  const goalKrw = prefs.targetKrw;

  useEffect(() => {
    onGoalUsdtChange?.(Number.isFinite(goalUsdt) ? goalUsdt : null);
  }, [goalUsdt, onGoalUsdtChange]);

  const today = kstToday();
  const remainingDays = Math.max(1, daysBetween(today, prefs.deadline));
  const gapUsdt = Math.max(0, goalUsdt - liveUsdt);
  const gapKrw = gapUsdt * fx;
  const dailyNeedUsdt = gapUsdt / remainingDays;
  const dailyNeedKrw = dailyNeedUsdt * fx;
  const dailyNeedPct = liveUsdt > 0 ? (dailyNeedUsdt / liveUsdt) * 100 : 0;

  const todayPnlUsdt = useMemo(() => {
    const row = daily.find((d) => d.date === today);
    return row?.pnl ?? 0;
  }, [daily, today]);
  const todayPnlKrw = todayPnlUsdt * fx;
  const todayProgress =
    dailyNeedUsdt > 0
      ? Math.min(150, (todayPnlUsdt / dailyNeedUsdt) * 100)
      : todayPnlUsdt > 0
        ? 100
        : 0;

  const totalProgress = Math.min(
    100,
    goalUsdt > 0 ? (liveUsdt / goalUsdt) * 100 : 0
  );

  function update(patch: Partial<GoalChallengePrefs>) {
    setPrefs((p) => ({ ...p, ...patch }));
  }

  /** 목표를 USDT로 입력하면 KRW 목표도 같이 맞춤 */
  function setTargetUsdt(usdtAmt: number) {
    const v = Math.max(0, usdtAmt);
    update({ targetKrw: Math.round(v * fx) });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        기본 단위는 <span className="text-zinc-300">USDT</span>입니다. 한화(₩)는
        환율로 환산한 참고값입니다. 목표 기본은 ₩1억 ≈ {usdt(goalUsdt, 0)}{" "}
        (마감 {prefs.deadline}).
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-zinc-500">
          목표 (USDT)
          <input
            type="number"
            step={100}
            value={Number(goalUsdt.toFixed(2))}
            onChange={(e) => setTargetUsdt(Number(e.target.value) || 0)}
            className="mt-1 block w-36 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-200"
          />
          <span className="mt-0.5 block text-[11px] text-zinc-600">
            ≈ {won(goalKrw)}
          </span>
        </label>
        <label className="text-xs text-zinc-500">
          목표 (원) · 참고
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
          label="현재 자산 (USDT)"
          value={walletLoading ? "…" : usdt(liveUsdt)}
          sub={walletLoading ? undefined : won(currentKrw)}
        />
        <Stat
          label="목표까지 (USDT)"
          value={usdt(gapUsdt)}
          sub={won(gapKrw)}
        />
        <Stat label="남은 일수" value={`${remainingDays}일`} />
        <Stat
          label="목표 (USDT)"
          value={usdt(goalUsdt, 0)}
          sub={won(goalKrw)}
          accent="amber"
        />
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-amber-300/80">
          오늘 도전 목표 (USDT)
        </p>
        <div className="mt-2 flex flex-wrap gap-6">
          <div>
            <p className="text-[11px] text-zinc-500">필요 수익금</p>
            <p className="text-xl font-semibold tabular-nums text-amber-100">
              {usdt(dailyNeedUsdt)}
            </p>
            <p className="text-xs text-zinc-600">≈ {won(dailyNeedKrw)}</p>
          </div>
          <div>
            <p className="text-[11px] text-zinc-500">필요 수익률</p>
            <p className="text-xl font-semibold tabular-nums text-amber-100">
              {dailyNeedPct.toFixed(2)}%
            </p>
            <p className="text-xs text-zinc-600">현재 USDT 대비 일일</p>
          </div>
          <div>
            <p className="text-[11px] text-zinc-500">오늘 실현손익</p>
            <p
              className={`text-xl font-semibold tabular-nums ${
                todayPnlUsdt >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {usdt(todayPnlUsdt)}
            </p>
            <p className="text-xs text-zinc-600">
              ≈ {won(todayPnlKrw)} · 일일 목표 대비 {todayProgress.toFixed(0)}%
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
            <span>전체 목표 진행 (USDT)</span>
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

      {gapUsdt <= 0 && (
        <p className="text-sm text-emerald-400">
          목표 USDT를 달성했습니다. 과세·인출·리스크 관리를 점검하세요.
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
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
      {sub && (
        <p className="mt-0.5 text-[11px] tabular-nums text-zinc-600">{sub}</p>
      )}
    </div>
  );
}
