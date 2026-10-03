"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DailyPnl } from "@/lib/stats/compute";
import type { WalletOverview } from "@/lib/exchanges/wallet";
import type { GoalChallengePrefs } from "@/lib/prefs";
import { fetchFxRate } from "@/lib/fx/client";
import {
  followedEquity,
  normalizeWalletFollow,
  walletFollowLabel,
  walletFollowOptions,
} from "@/lib/wallet-follow";

interface GoalChallengePanelProps {
  wallet: WalletOverview | null;
  walletLoading?: boolean;
  daily: DailyPnl[];
  prefs: GoalChallengePrefs;
  onPrefsChange: (
    prefs: GoalChallengePrefs | ((p: GoalChallengePrefs) => GoalChallengePrefs)
  ) => void;
  /** monthly: 실전 월간 목표 / ultimate: 최종 1억 (하단) */
  variant?: "monthly" | "ultimate";
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

function kstMonthKey(d = kstToday()): string {
  return d.slice(0, 7);
}

function daysInMonth(yyyyMm: string): number {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function dayOfMonth(yyyyMmDd: string): number {
  return Number(yyyyMmDd.slice(8, 10));
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00+09:00`).getTime();
  const b = new Date(`${to}T00:00:00+09:00`).getTime();
  return Math.max(0, Math.ceil((b - a) / 86_400_000));
}

function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-");
  return `${y}년 ${Number(m)}월`;
}

function compoundDailyRate(
  current: number,
  target: number,
  days: number
): number {
  if (days <= 0 || current <= 0 || target <= current) return 0;
  return Math.pow(target / current, 1 / days) - 1;
}

function pct(rate: number, digits = 2): string {
  return `${(rate * 100).toFixed(digits)}%`;
}

export function GoalChallengePanel({
  wallet,
  walletLoading,
  daily,
  prefs,
  onPrefsChange,
  variant = "monthly",
  onGoalUsdtChange,
}: GoalChallengePanelProps) {
  const [ultimateOpen, setUltimateOpen] = useState(false);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxHint, setFxHint] = useState("업비트 USDT 시세");

  const fx = prefs.fxRate > 0 ? prefs.fxRate : 1350;
  const followId = normalizeWalletFollow(prefs.walletFollow);
  const liveUsdt = followedEquity(wallet, followId);
  const followChoices = walletFollowOptions(wallet);
  const today = kstToday();
  const monthKey = kstMonthKey(today);

  function update(patch: Partial<GoalChallengePrefs>) {
    onPrefsChange((p) => ({ ...p, ...patch }));
  }

  const pullFx = useCallback(async () => {
    setFxLoading(true);
    const quote = await fetchFxRate();
    setFxLoading(false);
    if (!quote) {
      setFxHint("불러오지 못해 직전 환율을 유지합니다");
      return;
    }
    setFxHint(quote.source === "upbit" ? "업비트 USDT 시세" : "달러/원으로 대체");
    onPrefsChange((p) => (p.fxRate === quote.rate ? p : { ...p, fxRate: quote.rate }));
  }, [onPrefsChange]);

  useEffect(() => {
    if (variant !== "monthly") return;
    void pullFx();
  }, [variant, pullFx]);

  // 월이 바뀌면 월초 자산 스냅샷
  useEffect(() => {
    if (variant !== "monthly") return;
    if (!wallet || walletLoading) return;
    onPrefsChange((p) => {
      const follow = normalizeWalletFollow(p.walletFollow);
      const amount = followedEquity(wallet, follow);
      if (!(amount > 0)) return p;
      const sameMonth = p.monthKey === monthKey && p.monthStartEquity != null;
      if (sameMonth && p.monthStartFollow === follow) return p;
      return {
        ...p,
        monthKey,
        walletFollow: follow,
        monthStartEquity: amount,
        monthStartFollow: follow,
      };
    });
  }, [variant, wallet, walletLoading, monthKey, onPrefsChange]);

  const monthPnl = useMemo(() => {
    return daily
      .filter((d) => d.date.startsWith(monthKey))
      .reduce((s, d) => s + d.pnl, 0);
  }, [daily, monthKey]);

  const todayPnlUsdt = useMemo(() => {
    return daily.find((d) => d.date === today)?.pnl ?? 0;
  }, [daily, today]);

  const dim = daysInMonth(monthKey);
  const dayNum = dayOfMonth(today);
  const daysLeft = Math.max(1, dim - dayNum + 1);
  const monthlyTarget = Math.max(0, prefs.monthlyTargetUsdt);
  const paceMode = prefs.monthlyPaceMode === "rate" ? "rate" : "flat";
  const dailyQuotaFlat = monthlyTarget > 0 ? monthlyTarget / dim : 0;
  const monthRemaining = Math.max(0, monthlyTarget - monthPnl);
  const dailyNeedAdaptiveFlat = monthRemaining / daysLeft;

  const monthStart =
    prefs.monthKey === monthKey && prefs.monthStartEquity != null
      ? prefs.monthStartEquity
      : liveUsdt;
  const monthEndTargetUsdt = monthStart + monthlyTarget;
  const currentEquity = liveUsdt > 0 ? liveUsdt : monthStart + monthPnl;
  const canRate =
    paceMode === "rate" &&
    currentEquity > 0 &&
    monthEndTargetUsdt > currentEquity &&
    daysLeft > 0;
  const dailyRate = canRate
    ? compoundDailyRate(currentEquity, monthEndTargetUsdt, daysLeft)
    : 0;
  const dailyNeedRateAmt = currentEquity * dailyRate;

  const dailyQuota =
    paceMode === "rate" ? dailyNeedRateAmt : dailyQuotaFlat;
  const dailyNeedAdaptive =
    paceMode === "rate" ? dailyNeedRateAmt : dailyNeedAdaptiveFlat;

  const todayHit =
    dailyQuota <= 0
      ? todayPnlUsdt > 0
      : todayPnlUsdt >= dailyQuota;
  const monthProgress =
    monthlyTarget > 0
      ? Math.min(150, (monthPnl / monthlyTarget) * 100)
      : monthPnl > 0
        ? 100
        : 0;
  const todayProgress =
    dailyQuota > 0
      ? Math.min(150, (todayPnlUsdt / dailyQuota) * 100)
      : todayPnlUsdt > 0
        ? 100
        : 0;

  useEffect(() => {
    if (variant !== "monthly") return;
    onPrefsChange((p) => {
      if (p.dailyHits[today] === todayHit) return p;
      return {
        ...p,
        dailyHits: { ...p.dailyHits, [today]: todayHit },
      };
    });
  }, [variant, today, todayHit, onPrefsChange]);

  const ultimateGoalUsdt = prefs.targetKrw / fx;
  const ultimateGap = Math.max(0, ultimateGoalUsdt - liveUsdt);
  const ultimateDays = Math.max(1, daysBetween(today, prefs.deadline));
  const ultimateDailyNeed = ultimateGap / ultimateDays;
  const ultimateProgress = Math.min(
    100,
    ultimateGoalUsdt > 0 ? (liveUsdt / ultimateGoalUsdt) * 100 : 0
  );

  useEffect(() => {
    if (variant !== "monthly") return;
    onGoalUsdtChange?.(
      Number.isFinite(monthEndTargetUsdt) && monthlyTarget > 0
        ? monthEndTargetUsdt
        : null
    );
  }, [variant, monthEndTargetUsdt, monthlyTarget, onGoalUsdtChange]);

  const hitsThisMonth = useMemo(() => {
    const entries = Object.entries(prefs.dailyHits).filter(([d]) =>
      d.startsWith(monthKey)
    );
    const ok = entries.filter(([, v]) => v).length;
    return { ok, total: entries.length };
  }, [prefs.dailyHits, monthKey]);

  if (variant === "ultimate") {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setUltimateOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5 text-left"
        >
          <div>
            <p className="text-sm font-medium text-zinc-300">
              최종 목표 · ₩1억 챌린지
            </p>
            <p className="text-[11px] text-zinc-600">
              진행 {ultimateProgress.toFixed(1)}% · 남은 {ultimateDays}일 ·
              참고용 (현실 목표는 월간이)
            </p>
          </div>
          <span className="text-[11px] text-zinc-500">
            {ultimateOpen ? "접기 ▲" : "펼치기 ▼"}
          </span>
        </button>

        {ultimateOpen && (
          <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/30 p-4">
            <p className="text-sm text-zinc-500">
              장기 북극성입니다. 무리한 일일 수익률이 나오면 월간 목표를
              우선하세요.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-zinc-500">
                최종 목표 (원)
                <input
                  type="number"
                  step={1_000_000}
                  value={prefs.targetKrw}
                  onChange={(e) =>
                    update({
                      targetKrw: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="mt-1 block w-40 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-200"
                />
                <span className="mt-0.5 block text-[11px] text-zinc-600">
                  ≈ {usdt(ultimateGoalUsdt, 0)}
                </span>
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
              <p className="self-end pb-2 text-[11px] text-zinc-600">
                환율 {fx.toLocaleString("ko-KR")}원/USDT ({fxHint})
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Stat
                label="현재 (USDT)"
                value={walletLoading ? "…" : usdt(liveUsdt)}
                sub={won(liveUsdt * fx)}
              />
              <Stat label="목표까지" value={usdt(ultimateGap)} sub={won(ultimateGap * fx)} />
              <Stat
                label="필요 일일 (참고)"
                value={usdt(ultimateDailyNeed)}
                sub={`${((ultimateDailyNeed / (liveUsdt || 1)) * 100).toFixed(2)}%`}
                accent="amber"
              />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-zinc-500">
                <span>최종 목표 진행</span>
                <span>{ultimateProgress.toFixed(1)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-2 rounded-full bg-zinc-500"
                  style={{ width: `${ultimateProgress}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // —— monthly (primary) ——
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        <span className="text-zinc-300">{monthLabel(monthKey)}</span> 수익
        목표를 정하면, 일일 할당량과 오늘 달성 여부를 자동으로 체크합니다.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-500">배분</span>
        {(
          [
            ["flat", "균등 금액"],
            ["rate", "수익률(복리)"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => update({ monthlyPaceMode: id })}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
              paceMode === id
                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-zinc-500">
          따라갈 지갑
          <select
            value={followId}
            onChange={(e) => {
              const next = normalizeWalletFollow(e.target.value);
              const amount = followedEquity(wallet, next);
              update({
                walletFollow: next,
                ...(amount > 0
                  ? { monthKey, monthStartEquity: amount, monthStartFollow: next }
                  : {}),
              });
            }}
            className="mt-1 block rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100"
          >
            {followChoices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
                {choice.amount > 0 ? ` · $${choice.amount.toFixed(2)}` : ""}
              </option>
            ))}
            {!followChoices.some((choice) => choice.id === followId) && (
              <option value={followId}>{walletFollowLabel(followId)}</option>
            )}
          </select>
          <span className="mt-0.5 block text-[11px] text-zinc-600">
            일일 목표·현재 자산은 {walletFollowLabel(followId)}만 봅니다
          </span>
        </label>
        <label className="text-xs text-zinc-500">
          이번 달 목표 수익 (USDT)
          <input
            type="number"
            step={50}
            min={0}
            value={prefs.monthlyTargetUsdt}
            onChange={(e) =>
              update({
                monthlyTargetUsdt: Math.max(0, Number(e.target.value) || 0),
              })
            }
            className="mt-1 block w-40 rounded-md border border-emerald-500/30 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100"
          />
          <span className="mt-0.5 block text-[11px] text-zinc-600">
            ≈ {won(monthlyTarget * fx)} · 일 {dim}일
          </span>
        </label>
        <div className="text-xs text-zinc-500">
          환율 (원/USDT)
          <div className="mt-1 flex items-center gap-2">
            <span className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm tabular-nums text-zinc-100">
              {fx.toLocaleString("ko-KR")}원
            </span>
            <button
              type="button"
              onClick={() => void pullFx()}
              disabled={fxLoading}
              className="rounded-md border border-zinc-700 px-2.5 py-2 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
            >
              {fxLoading ? "…" : "새로고침"}
            </button>
          </div>
          <span className="mt-0.5 block text-[11px] text-zinc-600">{fxHint}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!wallet) return;
            update({
              monthKey,
              monthStartEquity: followedEquity(wallet, followId),
              monthStartFollow: followId,
            });
          }}
          className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200"
          title="현재 자산을 이번 달 시작 자산으로 다시 잡기"
        >
          월초 자산 다시 잡기
        </button>
      </div>

      {paceMode === "rate" && currentEquity <= 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-100/90">
          수익률 모드는 현재 자산이 필요합니다. 지갑 연동 또는 월초 자산을
          확인하세요.
        </div>
      )}

      <div
        className={`rounded-xl border p-4 ${
          todayHit
            ? "border-emerald-500/40 bg-emerald-500/5"
            : "border-amber-500/30 bg-amber-500/5"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              {paceMode === "rate" ? "필요 일일 수익률" : "오늘 일일 목표"}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">
              {paceMode === "rate"
                ? canRate
                  ? pct(dailyRate)
                  : "—"
                : usdt(dailyQuota)}
            </p>
            <p className="text-xs text-zinc-600">
              {paceMode === "rate"
                ? canRate
                  ? `오늘 필요 ≈ ${usdt(dailyNeedRateAmt)} · 월말 자산 목표 ${usdt(monthEndTargetUsdt)}`
                  : "자산·목표를 확인하세요"
                : `월 목표 ÷ ${dim}일 · 남은 기간 기준 필요 ${usdt(dailyNeedAdaptiveFlat)}`}
            </p>
          </div>
          <div
            className={`rounded-lg border px-3 py-2 text-center ${
              todayHit
                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                : "border-rose-500/40 bg-rose-500/10 text-rose-300"
            }`}
          >
            <p className="text-[10px] uppercase tracking-wide opacity-80">
              자동 체크
            </p>
            <p className="text-lg font-bold">{todayHit ? "달성 ✓" : "미달 ✗"}</p>
            <p className="text-[11px] tabular-nums opacity-90">
              오늘 {usdt(todayPnlUsdt)}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-[11px] text-zinc-500">
            <span>오늘 진행</span>
            <span>{Math.min(100, todayProgress).toFixed(0)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={`h-2 rounded-full transition-all ${
                todayHit ? "bg-emerald-500" : "bg-amber-400"
              }`}
              style={{
                width: `${Math.min(100, Math.max(0, todayProgress))}%`,
              }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Stat
          label="이번 달 실현 손익"
          value={usdt(monthPnl)}
          sub={won(monthPnl * fx)}
          accent={monthPnl >= 0 ? "emerald" : "rose"}
        />
        <Stat
          label="월 목표까지"
          value={usdt(monthRemaining)}
          sub={`${daysLeft}일 남음`}
        />
        <Stat
          label="월말 목표 자산"
          value={usdt(monthEndTargetUsdt, 0)}
          sub={`월초 ${usdt(monthStart, 0)}`}
        />
        <Stat
          label="이번 달 달성일"
          value={`${hitsThisMonth.ok}일`}
          sub={`기록 ${hitsThisMonth.total}일 · ${dayNum}/${dim}`}
        />
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-[11px] text-zinc-500">
          <span>월간 목표 진행</span>
          <span>
            {Math.min(100, monthProgress).toFixed(0)}% · {usdt(monthPnl)} /{" "}
            {usdt(monthlyTarget)}
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`h-2.5 rounded-full transition-all ${
              monthProgress >= 100 ? "bg-emerald-500" : "bg-sky-400/90"
            }`}
            style={{ width: `${Math.min(100, Math.max(0, monthProgress))}%` }}
          />
        </div>
      </div>

      {monthRemaining <= 0 && monthlyTarget > 0 && (
        <p className="text-sm text-emerald-400">
          이번 달 목표를 달성했습니다. 과매매 없이 수비를 우선하세요.
        </p>
      )}

      <MonthHitCalendar
        monthKey={monthKey}
        hits={prefs.dailyHits}
        today={today}
        daily={daily}
        dailyQuota={dailyQuota}
      />
    </div>
  );
}

function MonthHitCalendar({
  monthKey,
  hits,
  today,
  daily,
  dailyQuota,
}: {
  monthKey: string;
  hits: Record<string, boolean>;
  today: string;
  daily: DailyPnl[];
  dailyQuota: number;
}) {
  const dim = daysInMonth(monthKey);
  const pnlByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of daily) {
      if (d.date.startsWith(monthKey)) m.set(d.date, d.pnl);
    }
    return m;
  }, [daily, monthKey]);

  const cells = [];
  for (let d = 1; d <= dim; d++) {
    const date = `${monthKey}-${String(d).padStart(2, "0")}`;
    if (date > today) {
      cells.push(
        <div
          key={date}
          className="flex h-8 items-center justify-center rounded bg-zinc-900/50 text-[10px] text-zinc-700"
          title={date}
        >
          {d}
        </div>
      );
      continue;
    }
    const pnl = pnlByDate.get(date);
    const hit =
      hits[date] ??
      (pnl != null ? (dailyQuota <= 0 ? pnl > 0 : pnl >= dailyQuota) : null);
    const cls =
      hit === true
        ? "bg-emerald-500/25 text-emerald-300 border-emerald-500/30"
        : hit === false
          ? "bg-rose-500/20 text-rose-300 border-rose-500/25"
          : "bg-zinc-900 text-zinc-600 border-zinc-800";
    cells.push(
      <div
        key={date}
        className={`flex h-8 items-center justify-center rounded border text-[10px] tabular-nums ${cls} ${
          date === today ? "ring-1 ring-sky-400/60" : ""
        }`}
        title={
          pnl != null
            ? `${date}: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT`
            : date
        }
      >
        {d}
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-[11px] text-zinc-500">
        이번 달 일별 달성 · 초록=달성 / 빨강=미달 / 오늘 테두리
      </p>
      <div className="grid grid-cols-11 gap-1">
        {cells}
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
  accent?: "amber" | "emerald" | "rose";
}) {
  const color =
    accent === "amber"
      ? "text-amber-200"
      : accent === "emerald"
        ? "text-emerald-400"
        : accent === "rose"
          ? "text-rose-400"
          : "text-zinc-100";
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${color}`}>
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 text-[11px] tabular-nums text-zinc-600">{sub}</p>
      )}
    </div>
  );
}
