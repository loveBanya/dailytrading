"use client";

import type { WalletOverview } from "@/lib/exchanges/wallet";
import type { GoalChallengePrefs } from "@/lib/prefs";

interface HorizonGoalPanelProps {
  wallet: WalletOverview | null;
  walletLoading?: boolean;
  prefs: GoalChallengePrefs;
  onPrefsChange: (
    prefs: GoalChallengePrefs | ((p: GoalChallengePrefs) => GoalChallengePrefs)
  ) => void;
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

/** from·to 포함 남은 일수 (오늘 포함) */
function daysLeftInclusive(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00+09:00`).getTime();
  const b = new Date(`${to}T00:00:00+09:00`).getTime();
  return Math.max(0, Math.floor((b - a) / 86_400_000) + 1);
}

export function HorizonGoalPanel({
  wallet,
  walletLoading,
  prefs,
  onPrefsChange,
}: HorizonGoalPanelProps) {
  const fx = prefs.fxRate > 0 ? prefs.fxRate : 1350;
  const today = kstToday();
  const liveUsdt = wallet?.totalEquity ?? 0;
  const usingWallet = prefs.horizonCurrentUsdt == null;
  const current = usingWallet ? liveUsdt : Number(prefs.horizonCurrentUsdt) || 0;
  const target = Math.max(0, prefs.horizonTargetUsdt);
  const deadline = prefs.horizonDeadline || "2026-12-31";
  const daysLeft = daysLeftInclusive(today, deadline);
  const gap = Math.max(0, target - current);
  const dailyNeed = daysLeft > 0 ? gap / daysLeft : gap;
  const progress =
    target > 0 ? Math.min(100, (current / target) * 100) : current > 0 ? 100 : 0;
  const done = gap <= 0;

  function update(patch: Partial<GoalChallengePrefs>) {
    onPrefsChange((p) => ({ ...p, ...patch }));
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        기한까지 목표 금액과 지금 금액을 넣으면,{" "}
        <span className="text-zinc-300">오늘 벌어야 할 금액</span>이
        자동으로 나옵니다. (남은 금액 ÷ 남은 일수, 오늘 포함)
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-zinc-500">
          목표 금액 (USDT)
          <input
            type="number"
            step={100}
            min={0}
            value={prefs.horizonTargetUsdt}
            onChange={(e) =>
              update({
                horizonTargetUsdt: Math.max(0, Number(e.target.value) || 0),
              })
            }
            className="mt-1 block w-40 rounded-md border border-sky-500/30 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100"
          />
          <span className="mt-0.5 block text-[11px] text-zinc-600">
            ≈ {won(target * fx)}
          </span>
        </label>

        <label className="text-xs text-zinc-500">
          지금 금액 (USDT)
          <input
            type="number"
            step={10}
            min={0}
            value={usingWallet ? liveUsdt : (prefs.horizonCurrentUsdt ?? 0)}
            onChange={(e) =>
              update({
                horizonCurrentUsdt: Math.max(0, Number(e.target.value) || 0),
              })
            }
            className="mt-1 block w-40 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-200"
          />
          <span className="mt-0.5 block text-[11px] text-zinc-600">
            {usingWallet
              ? walletLoading
                ? "지갑 불러오는 중…"
                : "지갑 자산 사용 중"
              : "수동 입력"}{" "}
            · ≈ {won(current * fx)}
          </span>
        </label>

        <label className="text-xs text-zinc-500">
          기한
          <input
            type="date"
            value={deadline}
            onChange={(e) => update({ horizonDeadline: e.target.value })}
            className="mt-1 block rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-200"
          />
        </label>

        <button
          type="button"
          onClick={() => {
            if (!wallet) return;
            update({ horizonCurrentUsdt: wallet.totalEquity });
          }}
          disabled={!wallet || walletLoading}
          className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
        >
          지갑으로 맞추기
        </button>
        {!usingWallet && (
          <button
            type="button"
            onClick={() => update({ horizonCurrentUsdt: null })}
            className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200"
          >
            항상 지갑 따르기
          </button>
        )}
      </div>

      <div
        className={`rounded-xl border p-4 ${
          done
            ? "border-emerald-500/40 bg-emerald-500/5"
            : "border-sky-500/30 bg-sky-500/5"
        }`}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          오늘 벌어야 할 금액
        </p>
        <p className="mt-1 text-3xl font-semibold tabular-nums text-zinc-50">
          {done ? usdt(0) : usdt(dailyNeed)}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {done
            ? "목표 달성"
            : `남은 ${usdt(gap)} ÷ ${daysLeft}일 · ≈ ${won(dailyNeed * fx)}`}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="지금" value={usdt(current)} sub={won(current * fx)} />
        <Stat label="목표" value={usdt(target)} sub={won(target * fx)} />
        <Stat
          label="남은 일수"
          value={`${daysLeft}일`}
          sub={deadline}
          accent={daysLeft <= 30 ? "amber" : undefined}
        />
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-[11px] text-zinc-500">
          <span>기한 목표 진행</span>
          <span>{progress.toFixed(1)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`h-2 rounded-full ${done ? "bg-emerald-500" : "bg-sky-500"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
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
        className={`mt-0.5 text-lg font-semibold tabular-nums ${
          accent === "amber" ? "text-amber-300" : "text-zinc-100"
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-[11px] text-zinc-600">{sub}</p>}
    </div>
  );
}
