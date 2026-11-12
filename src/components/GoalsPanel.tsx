"use client";

import { useEffect, useState } from "react";
import type { WalletOverview } from "@/lib/exchanges/wallet";
import type { GoalChallengePrefs } from "@/lib/prefs";
import type { DailyPnl } from "@/lib/stats/compute";
import { formatDisplayMoney, type DisplayCurrency } from "@/lib/display-money";
import {
  followedEquity,
  normalizeWalletFollow,
  walletFollowLabel,
  walletFollowOptions,
} from "@/lib/wallet-follow";
import { CurrencyToggle } from "./CurrencyToggle";
import { MonthHitCalendar } from "./GoalChallengePanel";
import {
  addDaysKst,
  buildDayMilestones,
  buildMonthMilestones,
  buildWeekMilestones,
  cmpDate,
  compoundDailyRate,
  daysLeftInclusive,
  measurePace,
  monthEnd,
  shortDate,
  type Milestone,
  type PaceMode,
} from "./HorizonGoalPanel";

interface GoalsPanelProps {
  wallet: WalletOverview | null;
  walletLoading?: boolean;
  daily: DailyPnl[];
  prefs: GoalChallengePrefs;
  onPrefsChange: (
    prefs: GoalChallengePrefs | ((p: GoalChallengePrefs) => GoalChallengePrefs)
  ) => void;
  /** 자산 그래프의 노란 선. 이번 달 월말 목표 자산 */
  onGoalUsdtChange?: (goalUsdt: number | null) => void;
}

function kstToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function daysInMonth(yyyyMm: string): number {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function pct(rate: number, digits = 2): string {
  return `${(rate * 100).toFixed(digits)}%`;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

export function GoalsPanel({
  wallet,
  walletLoading,
  daily,
  prefs,
  onPrefsChange,
  onGoalUsdtChange,
}: GoalsPanelProps) {
  const [paceTab, setPaceTab] = useState<"day" | "week" | "month">("month");
  const [showPath, setShowPath] = useState(false);
  const [paceInput, setPaceInput] = useState("");

  const today = kstToday();
  const monthKey = today.slice(0, 7);
  const fx = prefs.fxRate > 0 ? prefs.fxRate : 1350;
  const currency: DisplayCurrency =
    prefs.horizonCurrency === "usdt" ? "usdt" : "krw";
  const altCurrency: DisplayCurrency = currency === "krw" ? "usdt" : "krw";
  const paceMode: PaceMode = prefs.horizonPaceMode === "flat" ? "flat" : "rate";
  const followId = normalizeWalletFollow(prefs.walletFollow);
  const liveUsdt = followedEquity(wallet, followId);
  const followChoices = walletFollowOptions(wallet);

  const money = (n: number, signed = false) =>
    formatDisplayMoney(n, currency, fx, signed);
  const alt = (n: number) => formatDisplayMoney(n, altCurrency, fx);

  function update(patch: Partial<GoalChallengePrefs>) {
    onPrefsChange((p) => ({ ...p, ...patch }));
  }

  function inputValue(usdtAmt: number): number {
    if (currency === "krw") return Math.round(usdtAmt * fx);
    return Number(usdtAmt.toFixed(2));
  }

  function parseInput(raw: string): number {
    const n = Math.max(0, Number(raw) || 0);
    return currency === "krw" ? n / fx : n;
  }

  // 달이 바뀌거나 지갑을 바꾸면 월초 자산을 다시 잡는다
  useEffect(() => {
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
  }, [wallet, walletLoading, monthKey, onPrefsChange]);

  // —— 이번 달 ——
  const monthPnl = daily
    .filter((d) => d.date.startsWith(monthKey))
    .reduce((s, d) => s + d.pnl, 0);
  const todayPnl = daily.find((d) => d.date === today)?.pnl ?? 0;
  const dim = daysInMonth(monthKey);
  const dayNum = Number(today.slice(8, 10));
  const monthDaysLeft = Math.max(1, dim - dayNum + 1);
  const monthlyTarget = Math.max(0, prefs.monthlyTargetUsdt);
  const monthStart =
    prefs.monthKey === monthKey && prefs.monthStartEquity != null
      ? prefs.monthStartEquity
      : liveUsdt;
  const monthEndTarget = monthStart + monthlyTarget;
  const equityNow = liveUsdt > 0 ? liveUsdt : monthStart + monthPnl;
  const monthRate =
    paceMode === "rate" && equityNow > 0 && monthEndTarget > equityNow
      ? compoundDailyRate(equityNow, monthEndTarget, monthDaysLeft)
      : 0;
  const monthLeft = Math.max(0, monthlyTarget - monthPnl);
  const dailyQuota =
    paceMode === "rate"
      ? equityNow * monthRate
      : monthlyTarget > 0
        ? monthlyTarget / dim
        : 0;
  const todayHit =
    dailyQuota <= 0 ? todayPnl > 0 : todayPnl >= dailyQuota;
  const todayProgress =
    dailyQuota > 0 ? (todayPnl / dailyQuota) * 100 : todayPnl > 0 ? 100 : 0;
  const monthProgress =
    monthlyTarget > 0 ? (monthPnl / monthlyTarget) * 100 : monthPnl > 0 ? 100 : 0;

  useEffect(() => {
    onPrefsChange((p) => {
      if (p.dailyHits[today] === todayHit) return p;
      return { ...p, dailyHits: { ...p.dailyHits, [today]: todayHit } };
    });
  }, [today, todayHit, onPrefsChange]);

  useEffect(() => {
    onGoalUsdtChange?.(
      Number.isFinite(monthEndTarget) && monthlyTarget > 0
        ? monthEndTarget
        : null
    );
  }, [monthEndTarget, monthlyTarget, onGoalUsdtChange]);

  const hitRows = Object.entries(prefs.dailyHits).filter(([d]) =>
    d.startsWith(monthKey)
  );
  const hitsThisMonth = {
    ok: hitRows.filter(([, v]) => v).length,
    total: hitRows.length,
  };

  // —— 기한 ——
  const start =
    /^\d{4}-\d{2}-\d{2}$/.test(prefs.horizonStart) && prefs.horizonStart
      ? prefs.horizonStart
      : today;
  const usingWallet = prefs.horizonCurrentUsdt == null;
  const current = usingWallet
    ? liveUsdt
    : Number(prefs.horizonCurrentUsdt) || 0;
  const target = Math.max(0, prefs.horizonTargetUsdt);
  const deadline = prefs.horizonDeadline || "2026-12-31";
  const spanOk = cmpDate(start, deadline) <= 0;
  const spanDays = spanOk ? daysLeftInclusive(start, deadline) : 0;
  const daysLeft = daysLeftInclusive(today, deadline);
  const gap = Math.max(0, target - current);
  const done = target > 0 && gap <= 0;
  const canRate = current > 0 && target > current && spanDays > 0;
  const flatDaily = spanDays > 0 ? gap / spanDays : gap;
  const pathRate = canRate ? compoundDailyRate(current, target, spanDays) : 0;
  const horizonDailyNeed = paceMode === "rate" ? current * pathRate : flatDaily;
  const horizonProgress =
    target > 0 ? (current / target) * 100 : current > 0 ? 100 : 0;

  // 기한 목표에서 거꾸로 본 이번 달 몫: 오늘부터 월말(또는 기한)까지 필요한 증가 + 이번 달 이미 번 것
  const monthCut = cmpDate(monthEnd(today), deadline) <= 0 ? monthEnd(today) : deadline;
  const daysToCut =
    cmpDate(today, monthCut) <= 0 ? daysLeftInclusive(today, monthCut) : 0;
  const rateFromToday =
    current > 0 && target > current && daysLeft > 0
      ? compoundDailyRate(current, target, daysLeft)
      : 0;
  const needToCut =
    done || daysToCut <= 0
      ? 0
      : paceMode === "rate"
        ? current * (Math.pow(1 + rateFromToday, daysToCut) - 1)
        : (gap / Math.max(1, daysLeft)) * daysToCut;
  const suggestedMonthly = Math.max(0, monthPnl + needToCut);
  const monthlyMatches =
    Math.abs(suggestedMonthly - monthlyTarget) < Math.max(1, suggestedMonthly * 0.005);

  const showMilestones =
    spanOk && !done && (paceMode === "flat" ? spanDays > 0 : canRate);
  const pathArgs = [start, deadline, today, current, paceMode, pathRate, flatDaily] as const;
  const milestones: Milestone[] = !showMilestones || !showPath
    ? []
    : paceTab === "day"
      ? buildDayMilestones(...pathArgs)
      : paceTab === "week"
        ? buildWeekMilestones(...pathArgs)
        : buildMonthMilestones(...pathArgs);

  const measuredFrom =
    cmpDate(start, today) < 0 ? start : addDaysKst(today, -13);
  const measured = measurePace(daily, measuredFrom, today, current);
  const typedPace = paceInput.trim() === "" ? null : Number(paceInput);
  const typedOk = typedPace != null && Number.isFinite(typedPace);
  const paceRate = typedOk ? typedPace / 100 : (measured?.rate ?? null);
  const ahead =
    cmpDate(today, deadline) >= 0
      ? 0
      : daysLeftInclusive(addDaysKst(today, 1), deadline);
  const projected =
    paceRate != null && current > 0
      ? current * Math.pow(1 + paceRate, ahead)
      : null;

  const inputCls =
    "mt-1 block rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100";

  return (
    <div className="space-y-5">
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
            onClick={() =>
              update({ horizonPaceMode: id, monthlyPaceMode: id })
            }
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
              paceMode === id
                ? "border-sky-500/50 bg-sky-500/15 text-sky-200"
                : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="mx-1 hidden text-zinc-700 sm:inline">|</span>
        <CurrencyToggle
          value={currency}
          onChange={(next) => update({ horizonCurrency: next })}
        />
        <span className="ml-auto text-[11px] text-zinc-600">
          환율 {fx.toLocaleString("ko-KR")}원 · 업비트 USDT
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Tier
          title="오늘"
          tone={todayHit ? "good" : "warn"}
          badge={todayHit ? "달성 ✓" : "미달"}
          headline={money(todayPnl, true)}
          headlineTone={todayPnl >= 0 ? "up" : "down"}
          line={`목표 ${dailyQuota > 0 ? money(dailyQuota) : "—"}${
            paceMode === "rate" && monthRate > 0 ? ` (${pct(monthRate)})` : ""
          }`}
          sub={alt(todayPnl)}
          progress={todayProgress}
        />
        <Tier
          title={`${Number(monthKey.slice(5))}월`}
          tone={monthProgress >= 100 ? "good" : "neutral"}
          badge={`${hitsThisMonth.ok}일 달성`}
          headline={money(monthPnl, true)}
          headlineTone={monthPnl >= 0 ? "up" : "down"}
          line={`목표 ${money(monthlyTarget)} · 남은 ${money(monthLeft)} · ${monthDaysLeft}일`}
          sub={`월초 ${money(monthStart)} → 월말 목표 ${money(monthEndTarget)}`}
          progress={monthProgress}
        />
        <Tier
          title={`기한 ${shortDate(deadline)}`}
          tone={done ? "good" : "neutral"}
          badge={spanOk ? `남은 ${daysLeft}일` : "날짜 확인"}
          headline={money(current)}
          headlineTone="flat"
          line={`목표 ${money(target)} · 남은 ${money(gap)}`}
          sub={
            done
              ? "목표 달성"
              : paceMode === "rate"
                ? canRate
                  ? `하루 ${pct(pathRate)} · 오늘 ≈ ${money(horizonDailyNeed)}`
                  : "지금 금액이 있어야 수익률을 계산합니다"
                : `하루 ${money(horizonDailyNeed)}`
          }
          progress={horizonProgress}
        />
      </div>

      {!done && target > 0 && spanOk && (
        paceMode === "flat" || rateFromToday > 0
      ) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-500/25 bg-sky-500/5 px-4 py-3">
          <p className="text-sm text-zinc-300">
            기한 목표대로 가려면 이번 달 목표 수익은{" "}
            <span className="font-semibold tabular-nums text-sky-200">
              {money(suggestedMonthly)}
            </span>
            <span className="text-zinc-500">
              {" "}
              (이번 달 실현 {money(monthPnl, true)} + {shortDate(monthCut)}까지{" "}
              {money(needToCut)})
            </span>
          </p>
          <button
            type="button"
            disabled={monthlyMatches || !(suggestedMonthly > 0)}
            onClick={() =>
              update({ monthlyTargetUsdt: Number(suggestedMonthly.toFixed(2)) })
            }
            className="rounded-md border border-sky-500/50 bg-sky-500/15 px-3 py-1.5 text-xs text-sky-100 disabled:opacity-40"
          >
            {monthlyMatches ? "월 목표와 같음" : "월 목표로 맞추기"}
          </button>
        </div>
      )}

      <div className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-zinc-500">
          최종 목표 금액 ({currency === "krw" ? "원" : "USDT"})
          <input
            type="number"
            step={currency === "krw" ? 100_000 : 100}
            min={0}
            value={inputValue(prefs.horizonTargetUsdt)}
            onChange={(e) =>
              update({ horizonTargetUsdt: parseInput(e.target.value) })
            }
            className={`${inputCls} w-full border-sky-500/30`}
          />
          <span className="mt-0.5 block text-[11px] text-zinc-600">
            ≈ {alt(target)}
          </span>
        </label>

        <label className="text-xs text-zinc-500">
          이번 달 목표 수익 ({currency === "krw" ? "원" : "USDT"})
          <input
            type="number"
            step={currency === "krw" ? 10_000 : 10}
            min={0}
            value={inputValue(prefs.monthlyTargetUsdt)}
            onChange={(e) =>
              update({ monthlyTargetUsdt: parseInput(e.target.value) })
            }
            className={`${inputCls} w-full border-emerald-500/30`}
          />
          <span className="mt-0.5 block text-[11px] text-zinc-600">
            ≈ {alt(monthlyTarget)} · {dim}일
          </span>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-zinc-500">
            시작
            <input
              type="date"
              value={start}
              max={deadline}
              onChange={(e) => update({ horizonStart: e.target.value })}
              className={`${inputCls} w-full`}
            />
          </label>
          <label className="text-xs text-zinc-500">
            기한
            <input
              type="date"
              value={deadline}
              onChange={(e) => update({ horizonDeadline: e.target.value })}
              className={`${inputCls} w-full`}
            />
          </label>
        </div>

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
            className={`${inputCls} w-full`}
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
            {walletLoading
              ? "지갑 불러오는 중…"
              : usingWallet
                ? `지금 금액 = ${walletFollowLabel(followId)} ${money(liveUsdt)}`
                : `지금 금액은 직접 입력 ${money(current)}`}
          </span>
        </label>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
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
          disabled={!wallet || walletLoading}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
        >
          월초 자산 다시 잡기
        </button>
        {prefs.horizonStart ? (
          <button
            type="button"
            onClick={() => update({ horizonStart: "" })}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-400 hover:text-zinc-200"
          >
            시작을 오늘로
          </button>
        ) : null}
        {usingWallet ? (
          <label className="flex items-center gap-1.5 text-zinc-500">
            지금 금액 직접
            <input
              type="number"
              min={0}
              placeholder={inputValue(liveUsdt).toString()}
              onBlur={(e) => {
                if (e.target.value.trim() === "") return;
                update({ horizonCurrentUsdt: parseInput(e.target.value) });
                e.target.value = "";
              }}
              className="w-28 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-200"
            />
          </label>
        ) : (
          <button
            type="button"
            onClick={() => update({ horizonCurrentUsdt: null })}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-400 hover:text-zinc-200"
          >
            지금 금액을 지갑으로
          </button>
        )}
      </div>

      {!spanOk && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-100/90">
          시작일이 기한보다 늦습니다. 시작을 기한과 같거나 이르게 맞추세요.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <MonthHitCalendar
          monthKey={monthKey}
          hits={prefs.dailyHits}
          today={today}
          daily={daily}
          dailyQuota={dailyQuota}
        />
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-zinc-400">
                지금 페이스로 {shortDate(deadline)}까지 쌓으면
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">
                {projected == null ? "—" : money(projected)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {projected == null
                  ? "매매가 쌓인 날이 부족합니다. 하루 수익률을 넣어 보세요."
                  : `하루 ${pct(paceRate ?? 0)}를 ${ahead}일 · 목표의 ${
                      target > 0 ? ((projected / target) * 100).toFixed(0) : "—"
                    }%`}
              </p>
            </div>
            <label className="text-xs text-zinc-500">
              하루 수익률 %
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={paceInput}
                placeholder={measured ? (measured.rate * 100).toFixed(2) : "직접"}
                onChange={(e) => setPaceInput(e.target.value)}
                className="mt-1 block w-24 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm tabular-nums text-zinc-200"
              />
            </label>
          </div>
        </div>
      </div>

      {showMilestones && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPath((v) => !v)}
              className="text-sm font-medium text-zinc-300 hover:text-zinc-100"
            >
              기한까지 중간 목표 {showPath ? "▲" : "▼"}
            </button>
            {showPath &&
              (
                [
                  ["day", "일"],
                  ["week", "주"],
                  ["month", "월"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPaceTab(id)}
                  className={`rounded-md border px-2.5 py-1 text-xs ${
                    paceTab === id
                      ? "border-sky-500/40 bg-sky-500/10 text-sky-200"
                      : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {label}
                </button>
              ))}
          </div>
          {showPath && (
            <div className="max-h-[24rem] overflow-auto rounded-xl border border-zinc-800">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="sticky top-0 border-b border-zinc-800 bg-zinc-950/95 text-[11px] text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">시점</th>
                    <th className="px-3 py-2 font-medium">도달 목표</th>
                    <th className="px-3 py-2 font-medium">구간 증가</th>
                    <th className="px-3 py-2 font-medium">구간 수익률</th>
                    <th className="px-3 py-2 font-medium">누적 %</th>
                  </tr>
                </thead>
                <tbody>
                  {milestones.map((m) => (
                    <tr
                      key={`${paceTab}-${m.date}-${m.label}`}
                      className={`border-b border-zinc-800/80 ${
                        m.date === today ? "bg-sky-500/10" : ""
                      }`}
                    >
                      <td className="px-3 py-2 text-zinc-300">{m.label}</td>
                      <td className="px-3 py-2 tabular-nums text-zinc-100">
                        {money(m.expectedUsdt)}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-sky-300/90">
                        {money(m.deltaUsdt, true)}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-amber-200/90">
                        {pct(m.deltaPct)}
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-500">
                        {target > 0
                          ? Math.min(100, (m.expectedUsdt / target) * 100).toFixed(0)
                          : 0}
                        %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Tier({
  title,
  tone,
  badge,
  headline,
  headlineTone,
  line,
  sub,
  progress,
}: {
  title: string;
  tone: "good" | "warn" | "neutral";
  badge: string;
  headline: string;
  headlineTone: "up" | "down" | "flat";
  line: string;
  sub: string;
  progress: number;
}) {
  const box =
    tone === "good"
      ? "border-emerald-500/40 bg-emerald-500/5"
      : tone === "warn"
        ? "border-amber-500/30 bg-amber-500/5"
        : "border-zinc-800 bg-zinc-950/40";
  const bar =
    tone === "good"
      ? "bg-emerald-500"
      : tone === "warn"
        ? "bg-amber-400"
        : "bg-sky-400/90";
  const color =
    headlineTone === "up"
      ? "text-emerald-300"
      : headlineTone === "down"
        ? "text-rose-300"
        : "text-zinc-50";
  return (
    <div className={`rounded-xl border p-4 ${box}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-zinc-400">{title}</p>
        <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300">
          {badge}
        </span>
      </div>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>
        {headline}
      </p>
      <p className="mt-0.5 text-xs tabular-nums text-zinc-400">{line}</p>
      <p className="text-[11px] tabular-nums text-zinc-600">{sub}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-2 rounded-full transition-all ${bar}`}
          style={{ width: `${clamp(progress)}%` }}
        />
      </div>
      <p className="mt-1 text-right text-[10px] tabular-nums text-zinc-500">
        {Number.isFinite(progress) ? `${Math.round(progress)}%` : "—"}
      </p>
    </div>
  );
}
