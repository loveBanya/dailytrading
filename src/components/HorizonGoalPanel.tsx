"use client";

import { useMemo, useState } from "react";
import type { WalletOverview } from "@/lib/exchanges/wallet";
import type { GoalChallengePrefs } from "@/lib/prefs";
import type { DailyPnl } from "@/lib/stats/compute";
import { followedEquity, walletFollowLabel } from "@/lib/wallet-follow";

interface HorizonGoalPanelProps {
  wallet: WalletOverview | null;
  walletLoading?: boolean;
  daily: DailyPnl[];
  prefs: GoalChallengePrefs;
  onPrefsChange: (
    prefs: GoalChallengePrefs | ((p: GoalChallengePrefs) => GoalChallengePrefs)
  ) => void;
}

type Currency = "usdt" | "krw";
type PaceTab = "day" | "week" | "month";
export type PaceMode = "flat" | "rate";

export interface Milestone {
  date: string;
  label: string;
  expectedUsdt: number;
  deltaUsdt: number;
  /** 직전 대비 구간 수익률 */
  deltaPct: number;
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

function pct(rate: number, digits = 2): string {
  return `${(rate * 100).toFixed(digits)}%`;
}

function kstToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

/** from·to 포함 남은 일수 (오늘 포함) */
export function daysLeftInclusive(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00+09:00`).getTime();
  const b = new Date(`${to}T00:00:00+09:00`).getTime();
  return Math.max(0, Math.floor((b - a) / 86_400_000) + 1);
}

export function addDaysKst(yyyyMmDd: string, delta: number): string {
  const d = new Date(`${yyyyMmDd}T12:00:00+09:00`);
  d.setDate(d.getDate() + delta);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

export function cmpDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 복리: current * (1+r)^days = target
 * r = (target/current)^(1/days) - 1
 */
export function compoundDailyRate(
  current: number,
  target: number,
  days: number
): number {
  if (days <= 0 || current <= 0 || target <= current) return 0;
  return Math.pow(target / current, 1 / days) - 1;
}

function expectedAtDay(
  mode: PaceMode,
  current: number,
  daysFromStart: number,
  dailyRate: number,
  flatDaily: number
): number {
  if (daysFromStart <= 0) return current;
  if (mode === "rate") {
    return current * Math.pow(1 + dailyRate, daysFromStart);
  }
  return current + flatDaily * daysFromStart;
}

/** 해당 주의 일요일 (KST, 이미 일요일이면 그대로) */
function weekEndSunday(yyyyMmDd: string): string {
  const d = new Date(`${yyyyMmDd}T12:00:00+09:00`);
  const dow = d.getDay(); // 0=Sun
  const add = dow === 0 ? 0 : 7 - dow;
  return addDaysKst(yyyyMmDd, add);
}

export function monthEnd(yyyyMmDd: string): string {
  const [y, m] = yyyyMmDd.split("-").map(Number);
  const dim = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(dim).padStart(2, "0")}`;
}

function nextMonthStart(yyyyMmDd: string): string {
  const [y, m] = yyyyMmDd.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

export function shortDate(yyyyMmDd: string): string {
  const [, m, d] = yyyyMmDd.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function monthLabel(yyyyMmDd: string): string {
  const [y, m] = yyyyMmDd.split("-");
  return `${y}.${Number(m)}`;
}

function pushMilestone(
  out: Milestone[],
  date: string,
  label: string,
  expected: number,
  prev: number
): number {
  const deltaUsdt = expected - prev;
  out.push({
    date,
    label,
    expectedUsdt: expected,
    deltaUsdt,
    deltaPct: prev > 0 ? expected / prev - 1 : 0,
  });
  return expected;
}

export function buildDayMilestones(
  start: string,
  deadline: string,
  today: string,
  current: number,
  mode: PaceMode,
  dailyRate: number,
  flatDaily: number
): Milestone[] {
  const out: Milestone[] = [];
  let cursor = start;
  let prev = current;
  let guard = 0;
  while (cmpDate(cursor, deadline) <= 0 && guard < 400) {
    const days = daysLeftInclusive(start, cursor);
    const expected = expectedAtDay(
      mode,
      current,
      days,
      dailyRate,
      flatDaily
    );
    prev = pushMilestone(
      out,
      cursor,
      milestoneLabel(cursor, start, deadline, today),
      expected,
      prev
    );
    if (cursor === deadline) break;
    cursor = addDaysKst(cursor, 1);
    guard += 1;
  }
  return out;
}

function milestoneLabel(
  cursor: string,
  start: string,
  deadline: string,
  today: string
): string {
  const mark =
    cursor === today
      ? "오늘"
      : cursor === deadline
        ? "기한"
        : cursor === start
          ? "시작"
          : "";
  return mark ? `${shortDate(cursor)} ${mark}` : shortDate(cursor);
}

export function buildWeekMilestones(
  start: string,
  deadline: string,
  today: string,
  current: number,
  mode: PaceMode,
  dailyRate: number,
  flatDaily: number
): Milestone[] {
  const out: Milestone[] = [];
  let cursor = weekEndSunday(start);
  if (cmpDate(cursor, start) < 0) cursor = addDaysKst(cursor, 7);
  let prev = current;
  let guard = 0;
  while (cmpDate(cursor, deadline) <= 0 && guard < 80) {
    const days = daysLeftInclusive(start, cursor);
    prev = pushMilestone(
      out,
      cursor,
      cursor === deadline
        ? milestoneLabel(cursor, start, deadline, today)
        : `${shortDate(cursor)} 주말`,
      expectedAtDay(mode, current, days, dailyRate, flatDaily),
      prev
    );
    cursor = addDaysKst(cursor, 7);
    guard += 1;
  }
  if (!out.length || out[out.length - 1].date !== deadline) {
    const days = daysLeftInclusive(start, deadline);
    const lastPrev = out.length ? out[out.length - 1].expectedUsdt : current;
    pushMilestone(
      out,
      deadline,
      milestoneLabel(deadline, start, deadline, today),
      expectedAtDay(mode, current, days, dailyRate, flatDaily),
      lastPrev
    );
  }
  return out;
}

export function buildMonthMilestones(
  start: string,
  deadline: string,
  today: string,
  current: number,
  mode: PaceMode,
  dailyRate: number,
  flatDaily: number
): Milestone[] {
  const out: Milestone[] = [];
  let cursor = monthEnd(start);
  if (cmpDate(cursor, start) < 0) {
    cursor = monthEnd(nextMonthStart(start));
  }
  let prev = current;
  let guard = 0;
  while (cmpDate(cursor, deadline) < 0 && guard < 36) {
    const days = daysLeftInclusive(start, cursor);
    prev = pushMilestone(
      out,
      cursor,
      `${monthLabel(cursor)} 말`,
      expectedAtDay(mode, current, days, dailyRate, flatDaily),
      prev
    );
    cursor = monthEnd(nextMonthStart(addDaysKst(cursor, 1)));
    guard += 1;
  }
  const days = daysLeftInclusive(start, deadline);
  pushMilestone(
    out,
    deadline,
    milestoneLabel(deadline, start, deadline, today),
    expectedAtDay(mode, current, days, dailyRate, flatDaily),
    prev
  );
  return out;
}

export function measurePace(
  daily: DailyPnl[],
  from: string,
  to: string,
  current: number
): { rate: number; days: number } | null {
  if (!(current > 0) || cmpDate(from, to) > 0) return null;
  const pnl = daily
    .filter((row) => row.date >= from && row.date <= to)
    .reduce((sum, row) => sum + row.pnl, 0);
  const days = daysLeftInclusive(from, to);
  if (days <= 0) return null;
  const seed = current - pnl;
  if (!(seed > 0)) return null;
  const rate = Math.pow(current / seed, 1 / days) - 1;
  return Number.isFinite(rate) ? { rate, days } : null;
}

export function HorizonGoalPanel({
  wallet,
  walletLoading,
  daily,
  prefs,
  onPrefsChange,
}: HorizonGoalPanelProps) {
  const [paceTab, setPaceTab] = useState<PaceTab>("day");
  const [paceInput, setPaceInput] = useState("");
  const fx = prefs.fxRate > 0 ? prefs.fxRate : 1350;
  const currency: Currency =
    prefs.horizonCurrency === "usdt" ? "usdt" : "krw";
  const paceMode: PaceMode =
    prefs.horizonPaceMode === "flat" ? "flat" : "rate";
  const today = kstToday();
  const start =
    /^\d{4}-\d{2}-\d{2}$/.test(prefs.horizonStart) && prefs.horizonStart
      ? prefs.horizonStart
      : today;
  const liveUsdt = followedEquity(wallet, prefs.walletFollow);
  const followLabel = walletFollowLabel(prefs.walletFollow);
  const usingWallet = prefs.horizonCurrentUsdt == null;
  const current = usingWallet ? liveUsdt : Number(prefs.horizonCurrentUsdt) || 0;
  const target = Math.max(0, prefs.horizonTargetUsdt);
  const deadline = prefs.horizonDeadline || "2026-12-31";
  const spanOk = cmpDate(start, deadline) <= 0;
  const spanDays = spanOk ? daysLeftInclusive(start, deadline) : 0;
  const daysLeft = daysLeftInclusive(today, deadline);
  const gap = Math.max(0, target - current);
  const done = gap <= 0;
  const canRate = current > 0 && target > current && spanDays > 0;
  const flatDaily = spanDays > 0 ? gap / spanDays : gap;
  const dailyRate = canRate
    ? compoundDailyRate(current, target, spanDays)
    : 0;
  const dailyNeedAmt =
    paceMode === "rate" ? current * dailyRate : flatDaily;
  const weeklyNeedAmt =
    paceMode === "rate"
      ? current * (Math.pow(1 + dailyRate, 7) - 1)
      : flatDaily * 7;
  const weeklyRate = Math.pow(1 + dailyRate, 7) - 1;
  const monthlyRateApprox = Math.pow(1 + dailyRate, 30) - 1;
  const monthlyNeedAmtApprox =
    paceMode === "rate" ? current * monthlyRateApprox : flatDaily * 30;
  const progress =
    target > 0 ? Math.min(100, (current / target) * 100) : current > 0 ? 100 : 0;
  const showMilestones =
    spanOk && !done && (paceMode === "flat" ? spanDays > 0 : canRate);

  const dayMs = useMemo(
    () =>
      showMilestones
        ? buildDayMilestones(
            start,
            deadline,
            today,
            current,
            paceMode,
            dailyRate,
            flatDaily
          )
        : [],
    [showMilestones, start, deadline, today, current, paceMode, dailyRate, flatDaily]
  );
  const weekMs = useMemo(
    () =>
      showMilestones
        ? buildWeekMilestones(
            start,
            deadline,
            today,
            current,
            paceMode,
            dailyRate,
            flatDaily
          )
        : [],
    [showMilestones, start, deadline, today, current, paceMode, dailyRate, flatDaily]
  );
  const monthMs = useMemo(
    () =>
      showMilestones
        ? buildMonthMilestones(
            start,
            deadline,
            today,
            current,
            paceMode,
            dailyRate,
            flatDaily
          )
        : [],
    [showMilestones, start, deadline, today, current, paceMode, dailyRate, flatDaily]
  );

  const measuredFrom = cmpDate(start, today) < 0 ? start : addDaysKst(today, -13);
  const measured = useMemo(
    () => measurePace(daily, measuredFrom, today, current),
    [daily, measuredFrom, today, current]
  );
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
  const paceSource = typedOk
    ? "직접 입력"
    : cmpDate(start, today) < 0
      ? "시작 이후 매매"
      : "최근 14일 매매";

  function update(patch: Partial<GoalChallengePrefs>) {
    onPrefsChange((p) => ({ ...p, ...patch }));
  }

  function fmt(usdtAmt: number, digits = 2): string {
    return currency === "krw" ? won(usdtAmt * fx) : usdt(usdtAmt, digits);
  }

  function fmtDelta(usdtAmt: number): string {
    const sign = usdtAmt >= 0 ? "+" : "";
    return currency === "krw"
      ? `${sign}${won(usdtAmt * fx)}`
      : `${sign}${usdt(usdtAmt)}`;
  }

  function inputValueUsdt(usdtAmt: number): number {
    if (currency === "krw") return Math.round(usdtAmt * fx);
    return Number(usdtAmt.toFixed(2));
  }

  function parseInputToUsdt(raw: string): number {
    const n = Math.max(0, Number(raw) || 0);
    return currency === "krw" ? n / fx : n;
  }

  const milestones =
    paceTab === "day" ? dayMs : paceTab === "week" ? weekMs : monthMs;

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        시작·지금·목표·기한으로 하루 필요량을 계산합니다.{" "}
        <span className="text-zinc-300">균등 금액</span> 또는{" "}
        <span className="text-zinc-300">복리 수익률</span>을 고를 수 있습니다.
        환율은 업비트 USDT 시세({fx.toLocaleString("ko-KR")}원)를 씁니다.
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
            onClick={() => update({ horizonPaceMode: id })}
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
        <span className="text-xs text-zinc-500">통화</span>
        {(
          [
            ["krw", "한화(원)"],
            ["usdt", "USDT"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => update({ horizonCurrency: id })}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
              currency === id
                ? "border-sky-500/50 bg-sky-500/15 text-sky-200"
                : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-zinc-500">
          목표 금액 ({currency === "krw" ? "원" : "USDT"})
          <input
            type="number"
            step={currency === "krw" ? 100_000 : 100}
            min={0}
            value={inputValueUsdt(prefs.horizonTargetUsdt)}
            onChange={(e) =>
              update({ horizonTargetUsdt: parseInputToUsdt(e.target.value) })
            }
            className="mt-1 block w-44 rounded-md border border-sky-500/30 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100"
          />
          <span className="mt-0.5 block text-[11px] text-zinc-600">
            ≈ {currency === "krw" ? usdt(target) : won(target * fx)}
          </span>
        </label>

        <label className="text-xs text-zinc-500">
          지금 금액 ({currency === "krw" ? "원" : "USDT"})
          <input
            type="number"
            step={currency === "krw" ? 10_000 : 10}
            min={0}
            value={inputValueUsdt(
              usingWallet ? liveUsdt : (prefs.horizonCurrentUsdt ?? 0)
            )}
            onChange={(e) =>
              update({
                horizonCurrentUsdt: parseInputToUsdt(e.target.value),
              })
            }
            className="mt-1 block w-44 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-200"
          />
          <span className="mt-0.5 block text-[11px] text-zinc-600">
            {usingWallet
              ? walletLoading
                ? "지갑 불러오는 중…"
                : `${followLabel} 사용 중`
              : "수동 입력"}{" "}
            · ≈ {currency === "krw" ? usdt(current) : won(current * fx)}
          </span>
        </label>

        <label className="text-xs text-zinc-500">
          시작
          <input
            type="date"
            value={start}
            max={deadline}
            onChange={(e) => update({ horizonStart: e.target.value })}
            className="mt-1 block rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-200"
          />
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

        {prefs.horizonStart ? (
          <button
            type="button"
            onClick={() => update({ horizonStart: "" })}
            className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200"
          >
            오늘부터
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => {
            if (!wallet) return;
            update({ horizonCurrentUsdt: followedEquity(wallet, prefs.walletFollow) });
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

      {!spanOk && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-100/90">
          시작일이 기한보다 늦습니다. 시작을 기한과 같거나 이르게 맞추세요.
        </div>
      )}
      {!done && paceMode === "rate" && current <= 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-100/90">
          수익률 모드는 지금 금액이 0이면 계산할 수 없습니다. 현재 자산을
          입력하세요.
        </div>
      )}

      <div
        className={`rounded-xl border p-4 ${
          done
            ? "border-emerald-500/40 bg-emerald-500/5"
            : "border-sky-500/30 bg-sky-500/5"
        }`}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          {paceMode === "rate" ? "필요 일일 수익률" : "하루 필요 금액"}
        </p>
        <p className="mt-1 text-3xl font-semibold tabular-nums text-zinc-50">
          {done
            ? paceMode === "rate"
              ? "—"
              : fmt(0)
            : paceMode === "rate"
              ? canRate
                ? pct(dailyRate)
                : "—"
              : fmt(dailyNeedAmt)}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {done
            ? "목표 달성"
            : paceMode === "rate"
              ? !canRate
                ? "시작·현재·목표·기한을 확인하세요"
                : `${shortDate(start)}→${shortDate(deadline)} ${spanDays}일 · 오늘 필요 ≈ ${fmt(dailyNeedAmt)} · 주 ${pct(weeklyRate)} (${fmt(weeklyNeedAmt)}) · 월≈ ${pct(monthlyRateApprox)} (${fmt(monthlyNeedAmtApprox)})`
              : `남은 ${fmt(gap)} ÷ ${spanDays}일 (${shortDate(start)}→${shortDate(deadline)}) · 주 ${fmt(weeklyNeedAmt)} · 월≈ ${fmt(monthlyNeedAmtApprox)}`}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="지금" value={fmt(current)} sub={currency === "krw" ? usdt(current) : won(current * fx)} />
        <Stat label="목표" value={fmt(target)} sub={currency === "krw" ? usdt(target) : won(target * fx)} />
        <Stat
          label={paceMode === "rate" ? "오늘 필요 금액" : "일일 균등"}
          value={
            done
              ? fmt(0)
              : paceMode === "rate" && !canRate
                ? "—"
                : fmt(dailyNeedAmt)
          }
          sub={
            paceMode === "rate" && canRate
              ? `자산 × ${pct(dailyRate)}`
              : paceMode === "flat"
                ? "균등 분할"
                : undefined
          }
        />
        <Stat
          label="기간"
          value={spanOk ? `${spanDays}일` : "—"}
          sub={
            spanOk
              ? `${shortDate(start)} → ${shortDate(deadline)}${
                  cmpDate(today, start) >= 0 && cmpDate(today, deadline) <= 0
                    ? ` · 남은 ${daysLeft}일`
                    : cmpDate(today, start) < 0
                      ? " · 시작 전"
                      : ""
                }`
              : "시작이 기한보다 늦습니다"
          }
          accent={!spanOk || daysLeft <= 30 ? "amber" : undefined}
        />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-zinc-400">
              지금 페이스로 쌓으면
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">
              {projected == null ? "—" : fmt(projected)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {projected == null
                ? "매매가 쌓인 날이 부족합니다. 하루 수익률을 직접 넣을 수 있습니다."
                : `${paceSource} 하루 ${pct(paceRate ?? 0)}를 ${ahead}일 쌓으면 ${shortDate(deadline)}에 이 금액입니다.`}
            </p>
          </div>
          <label className="text-xs text-zinc-500">
            하루 수익률 %
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={paceInput}
              placeholder={
                measured ? (measured.rate * 100).toFixed(2) : "직접"
              }
              onChange={(e) => setPaceInput(e.target.value)}
              className="mt-1 block w-28 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm tabular-nums text-zinc-200 outline-none focus:border-zinc-500"
            />
          </label>
        </div>
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

      {showMilestones && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-zinc-300">중간 목표</p>
            {(
              [
                ["day", "일 단위"],
                ["week", "주 단위"],
                ["month", "월 단위"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPaceTab(id)}
                className={`rounded-md border px-2.5 py-1 text-xs transition ${
                  paceTab === id
                    ? "border-sky-500/40 bg-sky-500/10 text-sky-200"
                    : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {label}
              </button>
            ))}
            <p className="w-full text-[11px] text-zinc-600 sm:ml-auto sm:w-auto">
              {paceMode === "rate" ? "복리" : "균등"} 경로 · Δ는 직전 대비
              증가(금액/%)
            </p>
          </div>

          <div className="max-h-[28rem] overflow-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="sticky top-0 border-b border-zinc-800 bg-zinc-950/95 text-[11px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">시점</th>
                  <th className="px-3 py-2 font-medium">도달 목표</th>
                  <th className="px-3 py-2 font-medium">구간 증가</th>
                  <th className="px-3 py-2 font-medium">구간 수익률</th>
                  <th className="px-3 py-2 font-medium">누적 %</th>
                </tr>
              </thead>
              <tbody>
                {milestones.map((m) => {
                  const p =
                    target > 0
                      ? Math.min(100, (m.expectedUsdt / target) * 100)
                      : 0;
                  return (
                    <tr
                      key={`${paceTab}-${m.date}-${m.label}`}
                      className="border-b border-zinc-800/80 hover:bg-zinc-900/50"
                    >
                      <td className="px-3 py-2 text-zinc-300">{m.label}</td>
                      <td className="px-3 py-2 font-mono tabular-nums text-zinc-100">
                        {fmt(m.expectedUsdt)}
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums text-sky-300/90">
                        {fmtDelta(m.deltaUsdt)}
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums text-amber-200/90">
                        {pct(m.deltaPct)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-zinc-500">
                        {p.toFixed(0)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
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
