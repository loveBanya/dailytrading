"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { WalletOverview } from "@/lib/exchanges/wallet";
import type { ExtraTrack, GoalChallengePrefs } from "@/lib/prefs";
import type { DailyPnl } from "@/lib/stats/compute";
import {
  followedEquity,
  normalizeWalletFollow,
  walletFollowLabel,
  walletFollowOptions,
} from "@/lib/wallet-follow";
import { CurrencyToggle } from "./CurrencyToggle";
import { formatDisplayMoney, type DisplayCurrency } from "@/lib/display-money";

interface CompoundTrackerPanelProps {
  wallet: WalletOverview | null;
  walletLoading?: boolean;
  daily: DailyPnl[];
  prefs: GoalChallengePrefs;
  onPrefsChange: (
    prefs: GoalChallengePrefs | ((p: GoalChallengePrefs) => GoalChallengePrefs)
  ) => void;
  onGoalUsdtChange?: (goalUsdt: number | null) => void;
  /** 있으면 prefs.extraTracks 의 그 챌린지를 그린다 */
  extraId?: string;
}

const TRACK_KEYS = [
  "trackSeedUsdt",
  "trackStart",
  "trackDailyRatePct",
  "trackActual",
  "walletFollow",
] as const;

function kstToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function addDays(yyyyMmDd: string, delta: number): string {
  const date = new Date(`${yyyyMmDd}T12:00:00+09:00`);
  date.setDate(date.getDate() + delta);
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function daysApart(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00+09:00`).getTime();
  const b = new Date(`${to}T00:00:00+09:00`).getTime();
  return Math.floor((b - a) / 86_400_000);
}

function monthKey(yyyyMmDd: string): string {
  return yyyyMmDd.slice(0, 7);
}

function monthTitle(key: string): string {
  const [year, month] = key.split("-");
  return `${year}년 ${Number(month)}월`;
}

function monthStart(key: string): string {
  return `${key}-01`;
}

function monthEnd(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const dim = new Date(y, m, 0).getDate();
  return `${key}-${String(dim).padStart(2, "0")}`;
}

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function later(a: string, b: string): string {
  return a > b ? a : b;
}

export function CompoundTrackerPanel({
  wallet,
  walletLoading,
  daily,
  prefs: rootPrefs,
  onPrefsChange,
  onGoalUsdtChange,
  extraId,
}: CompoundTrackerPanelProps) {
  const extra = extraId
    ? rootPrefs.extraTracks.find((track) => track.id === extraId)
    : undefined;
  const prefs: GoalChallengePrefs = extra ? { ...rootPrefs, ...extra } : rootPrefs;
  const today = kstToday();
  const [viewMonth, setViewMonth] = useState(() => monthKey(today));
  const [editingBase, setEditingBase] = useState(false);
  const [draftStart, setDraftStart] = useState(today);
  const [draftSeed, setDraftSeed] = useState("200");
  const [draftRate, setDraftRate] = useState("2");
  const [freshStart, setFreshStart] = useState(false);
  const [draftActual, setDraftActual] = useState<Record<string, string>>({});

  useEffect(() => {
    if (extraId) return;
    if (/^\d{4}-\d{2}-\d{2}$/.test(rootPrefs.trackStart)) return;
    onPrefsChange((p) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(p.trackStart)) return p;
      return {
        ...p,
        trackStart: kstToday(),
        trackSeedUsdt: p.trackSeedUsdt > 0 ? p.trackSeedUsdt : 200,
        trackDailyRatePct: p.trackDailyRatePct > 0 ? p.trackDailyRatePct : 2,
      };
    });
  }, [extraId, rootPrefs.trackStart, onPrefsChange]);

  const start = /^\d{4}-\d{2}-\d{2}$/.test(prefs.trackStart)
    ? prefs.trackStart
    : today;
  const seed = prefs.trackSeedUsdt > 0 ? prefs.trackSeedUsdt : 200;
  const ratePct = prefs.trackDailyRatePct > 0 ? prefs.trackDailyRatePct : 2;
  const rate = ratePct / 100;
  const fx = prefs.fxRate > 0 ? prefs.fxRate : 1350;
  const currency: DisplayCurrency = prefs.horizonCurrency === "usdt" ? "usdt" : "krw";
  const followId = normalizeWalletFollow(prefs.walletFollow);
  const live = wallet ? followedEquity(wallet, followId) : 0;

  function money(n: number, signed = false): string {
    return formatDisplayMoney(n, currency, fx, signed);
  }

  function altMoney(n: number): string {
    return formatDisplayMoney(n, currency === "krw" ? "usdt" : "krw", fx);
  }

  function targetStart(date: string): number {
    const index = daysApart(start, date);
    return seed * Math.pow(1 + rate, index);
  }

  function targetEnd(date: string): number {
    return targetStart(date) * (1 + rate);
  }

  function update(patch: Partial<GoalChallengePrefs>) {
    onPrefsChange((p) => {
      if (!extraId) return { ...p, ...patch };
      const own: Partial<ExtraTrack> = {};
      const shared: Partial<GoalChallengePrefs> = {};
      for (const [key, value] of Object.entries(patch)) {
        if ((TRACK_KEYS as readonly string[]).includes(key)) {
          (own as Record<string, unknown>)[key] = value;
        } else {
          (shared as Record<string, unknown>)[key] = value;
        }
      }
      return {
        ...p,
        ...shared,
        extraTracks: p.extraTracks.map((track) =>
          track.id === extraId ? { ...track, ...own } : track
        ),
      };
    });
  }

  function shownActual(date: string): string {
    if (date in draftActual) return draftActual[date];
    if (prefs.trackActual[date] != null) return String(prefs.trackActual[date]);
    if (date === today && live > 0) return live.toFixed(2);
    return "";
  }

  function actualNumber(date: string): number | null {
    const raw = shownActual(date).trim();
    if (raw === "") return null;
    const amount = Number(raw);
    return Number.isFinite(amount) ? amount : null;
  }

  function actualDirty(date: string): boolean {
    if (!(date in draftActual)) return false;
    const raw = draftActual[date].trim();
    const saved = prefs.trackActual[date];
    if (raw === "") return saved != null;
    const amount = Number(raw);
    if (!Number.isFinite(amount)) return false;
    return saved == null || Math.abs(amount - saved) > 0.0001;
  }

  function writeActual(dates: string[], source: Record<string, string>) {
    const next = { ...prefs.trackActual };
    for (const date of dates) {
      const raw = (source[date] ?? "").trim();
      if (raw === "") {
        delete next[date];
        continue;
      }
      const amount = Number(raw);
      if (!Number.isFinite(amount)) continue;
      next[date] = amount;
    }
    update({ trackActual: next });
    setDraftActual((prev) => {
      const cleared = { ...prev };
      for (const date of dates) delete cleared[date];
      return cleared;
    });
  }

  function saveActuals() {
    const dirty = Object.keys(draftActual).filter(actualDirty);
    if (dirty.length === 0) return;
    writeActual(dirty, draftActual);
  }

  function closeToday() {
    const raw = shownActual(today).trim();
    if (raw === "" || !Number.isFinite(Number(raw))) return;
    writeActual([today], { ...draftActual, [today]: raw });
  }

  const rows = useMemo(() => {
    const from = later(start, monthStart(viewMonth));
    const to = monthEnd(viewMonth);
    if (from > to) return [];
    const out: string[] = [];
    let cursor = from;
    let guard = 0;
    while (cursor <= to && guard < 40) {
      out.push(cursor);
      cursor = addDays(cursor, 1);
      guard += 1;
    }
    return out;
  }, [start, viewMonth]);

  const monthLast = monthEnd(monthKey(today));
  const monthGoal = useMemo(() => {
    const from = later(start, monthStart(monthKey(today)));
    if (from > monthLast) return null;
    return targetEnd(monthLast) - targetStart(from);
  }, [monthLast, rate, seed, start, today]);

  useEffect(() => {
    onGoalUsdtChange?.(monthGoal != null ? targetEnd(monthLast) : null);
  }, [monthGoal, monthLast, onGoalUsdtChange, rate, seed, start]);

  const todayPnl = daily.find((row) => row.date === today)?.pnl ?? 0;
  const todayOnPath = today >= start;
  const todayActual = actualNumber(today);
  const todaySaved = prefs.trackActual[today] != null && !(today in draftActual);
  const todayTargetEnd = todayOnPath ? targetEnd(today) : null;
  const todayGap =
    todayActual != null && todayTargetEnd != null
      ? todayActual - todayTargetEnd
      : null;
  const earned =
    todayActual != null && seed > 0 ? todayActual - seed : null;
  const earnedPct =
    earned != null && seed > 0 ? (earned / seed) * 100 : null;
  const prevSavedDate = Object.keys(prefs.trackActual)
    .filter((date) => date >= start && date < today)
    .sort()
    .pop();
  const dayBase: { amount: number; label: string } | null = !todayOnPath
    ? null
    : prevSavedDate != null
      ? {
          amount: prefs.trackActual[prevSavedDate]!,
          label: `${prevSavedDate.slice(5).replace("-", "/")} 보유 기준`,
        }
      : today === start
        ? { amount: seed, label: "시드 기준" }
        : null;
  const todayEarned =
    !todayOnPath
      ? null
      : dayBase != null
        ? todayActual != null
          ? todayActual - dayBase.amount
          : null
        : todayPnl;
  const todayEarnedBase = dayBase?.amount ?? targetStart(today);
  const todayEarnedPct =
    todayEarned != null && todayEarnedBase > 0
      ? (todayEarned / todayEarnedBase) * 100
      : null;
  const todayVsTarget =
    todayEarnedPct != null && ratePct > 0
      ? (todayEarnedPct / ratePct) * 100
      : null;
  const achieved = todayOnPath && todayGap != null && todayGap >= 0;
  const progress =
    todayOnPath && todayActual != null && todayTargetEnd != null && todayTargetEnd > 0
      ? Math.max(0, Math.min(100, (todayActual / todayTargetEnd) * 100))
      : null;
  const [cheer, setCheer] = useState(false);
  const cheeredDay = useRef<string | null>(null);

  useEffect(() => {
    if (!achieved) return;
    if (cheeredDay.current === today) return;
    const key = extraId
      ? `dailytrading.goal.cheer.v1.${extraId}`
      : "dailytrading.goal.cheer.v1";
    if (window.localStorage.getItem(key) === today) {
      cheeredDay.current = today;
      return;
    }
    cheeredDay.current = today;
    window.localStorage.setItem(key, today);
    setCheer(true);
    const timer = window.setTimeout(() => setCheer(false), 3200);
    return () => window.clearTimeout(timer);
  }, [achieved, today]);
  const listed = walletFollowOptions(wallet);
  const choices = listed.some((choice) => choice.id === followId)
    ? listed
    : [
        { id: followId, label: walletFollowLabel(followId), amount: live },
        ...listed,
      ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-zinc-500">
          시드에 하루 수익률을 복리로 쌓은 목표와, 그날 실제 보유액을 나란히
          봅니다. 실제 보유는 적은 뒤 저장하거나, 오늘 마무리로 그날 금액을
          남깁니다. 저장 전에는 {walletFollowLabel(followId)} 지갑을 오늘 칸에
          보여 주기만 합니다. 실제 보유 입력은 USDT입니다. 환율은 업비트 USDT
          시세({fx.toLocaleString("ko-KR")}원)입니다.
        </p>
        <CurrencyToggle
          value={currency}
          onChange={(next) => update({ horizonCurrency: next })}
        />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2">
          <p className="text-[11px] text-zinc-500">시작 기준</p>
          <p className="mt-0.5 text-sm tabular-nums text-zinc-100">
            {start} · 시드 {money(seed)} · 하루 {ratePct}%
          </p>
          <p className="text-[11px] tabular-nums text-zinc-600">
            {altMoney(seed)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDraftStart(start);
            setDraftSeed(String(seed));
            setDraftRate(String(ratePct));
            setFreshStart(false);
            setEditingBase(true);
          }}
          className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:text-zinc-100"
        >
          기준 수정
        </button>
        <label className="text-xs text-zinc-500">
          따라갈 지갑
          <select
            value={followId}
            onChange={(e) => update({ walletFollow: e.target.value })}
            className="mt-1 block rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100"
          >
            {choices.length === 0 ? (
              <option value={followId}>{walletFollowLabel(followId)}</option>
            ) : (
              choices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))
            )}
          </select>
        </label>
      </div>

      {editingBase && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-700 bg-zinc-900/70 p-3">
          <label className="text-xs text-zinc-400">
            시작일
            <input
              type="date"
              value={draftStart}
              onChange={(e) => {
                setDraftStart(e.target.value);
                setFreshStart(false);
              }}
              className="mt-1 block rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-sm text-zinc-100"
            />
          </label>
          <label className="text-xs text-zinc-400">
            초기 시드 (USDT)
            <input
              type="number"
              min={0}
              step={10}
              value={draftSeed}
              onChange={(e) => {
                setDraftSeed(e.target.value);
                setFreshStart(false);
              }}
              className="mt-1 block w-32 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-sm tabular-nums text-zinc-100"
            />
          </label>
          <label className="text-xs text-zinc-400">
            하루 목표 %
            <input
              type="number"
              min={0}
              step={0.1}
              value={draftRate}
              onChange={(e) => setDraftRate(e.target.value)}
              className="mt-1 block w-24 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-sm tabular-nums text-zinc-100"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              const nextSeed = Math.max(0, Number(draftSeed) || 0);
              const nextRate = Math.max(0, Number(draftRate) || 0);
              if (
                !/^\d{4}-\d{2}-\d{2}$/.test(draftStart) ||
                !(nextSeed > 0) ||
                !(nextRate > 0)
              ) {
                return;
              }
              update({
                trackStart: draftStart,
                trackSeedUsdt: nextSeed,
                trackDailyRatePct: nextRate,
                ...(freshStart ? { trackActual: {} } : {}),
              });
              if (freshStart) setDraftActual({});
              setEditingBase(false);
              setFreshStart(false);
            }}
            className="rounded-md border border-sky-500/50 bg-sky-500/15 px-3 py-2 text-xs text-sky-100"
          >
            저장
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingBase(false);
              setFreshStart(false);
            }}
            className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-400"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => {
              setDraftStart(today);
              setDraftSeed("200");
              setDraftRate("2");
              setFreshStart(true);
            }}
            className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200"
          >
            200불로 오늘부터
          </button>
          {freshStart && (
            <p className="pb-2 text-[11px] text-amber-200/80">
              저장하면 위 기준으로 맞추고, 적어 둔 실제 보유액은 비웁니다.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        <Stat
          label="오늘"
          value={todayOnPath ? `${daysApart(start, today) + 1}일차` : "시작 전"}
          sub={today}
        />
        <Stat
          label="오늘 번 금액"
          value={
            walletLoading && todayEarned == null
              ? "…"
              : todayEarned != null
                ? money(todayEarned, true)
                : "—"
          }
          sub={
            todayEarned != null
              ? `${altMoney(todayEarned)} · ${
                  todayEarnedPct != null && todayEarnedPct >= 0 ? "+" : ""
                }${todayEarnedPct?.toFixed(2) ?? "—"}% (목표 ${ratePct}%) · ${
                  dayBase?.label ?? "실현 손익 기준"
                }`
              : todayOnPath
                ? "실제 보유를 적으면 계산합니다"
                : undefined
          }
          tone={
            todayEarned == null ? "neutral" : todayEarned >= 0 ? "up" : "down"
          }
        />
        <Stat
          label="누적 번 금액"
          value={
            walletLoading && earned == null
              ? "…"
              : earned != null
                ? money(earned, true)
                : "—"
          }
          sub={
            earned != null
              ? `${altMoney(earned)} · 시드 대비 ${
                  earnedPct != null && earnedPct >= 0 ? "+" : ""
                }${earnedPct?.toFixed(1) ?? "—"}%`
              : "실제 보유 − 시드"
          }
          tone={
            earned == null ? "neutral" : earned >= 0 ? "up" : "down"
          }
        />
        <Stat
          label="오늘 목표 수익"
          value={todayOnPath ? money(targetStart(today) * rate) : "—"}
          sub={
            todayOnPath
              ? `${altMoney(targetStart(today) * rate)} · 실현 ${money(todayPnl, true)}`
              : undefined
          }
        />
        <Stat
          label="오늘 목표 최종"
          value={todayTargetEnd != null ? money(todayTargetEnd) : "—"}
          sub={todayTargetEnd != null ? altMoney(todayTargetEnd) : undefined}
        />
        <Stat
          label="실제 보유"
          value={
            walletLoading && todayActual == null
              ? "…"
              : todayActual != null
                ? money(todayActual)
                : "—"
          }
          sub={
            todayActual != null
              ? `${altMoney(todayActual)} · ${
                  todaySaved
                    ? "저장됨"
                    : today in draftActual
                      ? "저장 전"
                      : live > 0
                        ? `${walletFollowLabel(followId)} 지갑 · 저장 전`
                        : "직접 입력"
                }`
              : todaySaved
                ? "저장됨"
                : today in draftActual
                  ? "저장 전"
                  : live > 0
                    ? `${walletFollowLabel(followId)} 지갑 · 저장 전`
                    : "직접 입력"
          }
          tone="actual"
        />
        <Stat
          label="목표 대비"
          value={todayGap != null ? money(todayGap, true) : "—"}
          sub={todayGap != null ? altMoney(todayGap) : undefined}
          tone={todayGap == null ? "neutral" : todayGap >= 0 ? "up" : "down"}
        />
        <Stat
          label="이번 달 목표 수익"
          value={monthGoal != null ? money(monthGoal) : "—"}
          sub={monthGoal != null ? altMoney(monthGoal) : undefined}
        />
      </div>

      {progress != null && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>{achieved ? "오늘 목표를 넘겼습니다" : "오늘 목표까지"}</span>
            <span className="tabular-nums text-zinc-300">{progress.toFixed(1)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={`h-2 rounded-full transition-all ${
                achieved ? "bg-amber-300" : "bg-emerald-400"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {todayEarnedPct != null && todayVsTarget != null && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>
              오늘 수익률{" "}
              <span
                className={`tabular-nums ${
                  todayEarnedPct >= 0 ? "text-emerald-300" : "text-rose-300"
                }`}
              >
                {todayEarnedPct >= 0 ? "+" : ""}
                {todayEarnedPct.toFixed(2)}%
              </span>{" "}
              / 목표 {ratePct}%
            </span>
            <span className="tabular-nums text-zinc-300">
              목표의 {todayVsTarget.toFixed(0)}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={`h-2 rounded-full transition-all ${
                todayVsTarget >= 100
                  ? "bg-amber-300"
                  : todayVsTarget >= 0
                    ? "bg-sky-400"
                    : "bg-rose-400"
              }`}
              style={{
                width: `${Math.max(0, Math.min(100, Math.abs(todayVsTarget)))}%`,
              }}
            />
          </div>
        </div>
      )}

      {achieved && todayGap != null && (
        <div className="rounded-lg border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          오늘 목표를 넘겼습니다. {money(todayGap, true)}.
        </div>
      )}
      {cheer && <CheerBurst />}

      <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-zinc-200">
              {monthTitle(viewMonth)}
            </p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setViewMonth((m) => shiftMonth(m, -1))}
            className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200"
          >
            이전달
          </button>
          <button
            type="button"
            onClick={() => setViewMonth(monthKey(today))}
            className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200"
          >
            이번달
          </button>
          <button
            type="button"
            onClick={() => setViewMonth((m) => shiftMonth(m, 1))}
            className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200"
          >
            다음달
          </button>
          <button
            type="button"
            disabled={!Object.keys(draftActual).some(actualDirty)}
            onClick={saveActuals}
            className="rounded border border-emerald-500/50 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200 disabled:opacity-40"
          >
            실제 보유 저장
          </button>
          <button
            type="button"
            disabled={!todayOnPath || actualNumber(today) == null}
            onClick={closeToday}
            className="rounded border border-sky-500/40 px-2 py-1 text-xs text-sky-200 disabled:opacity-40"
          >
            오늘 마무리
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">이 달에는 추적 기간이 없습니다.</p>
      ) : (
        <div className="max-h-[32rem] overflow-auto rounded-lg border border-zinc-800">
          <table className="min-w-[760px] w-full text-left text-xs">
            <thead className="sticky top-0 bg-zinc-900 text-zinc-400">
              <tr>
                <th className="px-2 py-2 font-medium">일차</th>
                <th className="px-2 py-2 font-medium">날짜</th>
                <th className="px-2 py-2 font-medium">목표 시작</th>
                <th className="px-2 py-2 font-medium">목표 수익</th>
                <th className="px-2 py-2 font-medium">목표 최종</th>
                <th className="px-2 py-2 font-medium">목표 수익률</th>
                <th className="px-2 py-2 font-medium text-emerald-300">
                  실제 보유 USDT
                </th>
                <th className="px-2 py-2 font-medium">목표 대비</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((date) => {
                const open = targetStart(date);
                const profit = open * rate;
                const close = open * (1 + rate);
                const dayRate = open > 0 ? (profit / open) * 100 : 0;
                const actual = actualNumber(date);
                const gap = actual != null ? actual - close : null;
                const isToday = date === today;
                const dirty = actualDirty(date);
                return (
                  <tr
                    key={date}
                    className={
                      isToday
                        ? "bg-sky-500/10"
                        : "border-t border-zinc-800/80"
                    }
                  >
                    <td className="px-2 py-1.5 tabular-nums text-zinc-300">
                      {daysApart(start, date) + 1}일차
                    </td>
                    <td className="px-2 py-1.5 tabular-nums text-zinc-400">
                      {date}
                      {isToday ? " 오늘" : ""}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">
                      <div>{money(open)}</div>
                      <div className="text-[10px] text-zinc-600">{altMoney(open)}</div>
                    </td>
                    <td className="px-2 py-1.5 tabular-nums text-zinc-300">
                      <div>{money(profit)}</div>
                      <div className="text-[10px] text-zinc-600">{altMoney(profit)}</div>
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">
                      <div>{money(close)}</div>
                      <div className="text-[10px] text-zinc-600">{altMoney(close)}</div>
                    </td>
                    <td className="px-2 py-1.5 tabular-nums text-zinc-300">
                      {dayRate.toFixed(1)}%
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        aria-label={`${date} 실제 보유`}
                        value={shownActual(date)}
                        placeholder="—"
                        onChange={(e) =>
                          setDraftActual((prev) => ({
                            ...prev,
                            [date]: e.target.value,
                          }))
                        }
                        className={`w-24 rounded border bg-emerald-950/40 px-2 py-1 text-right tabular-nums text-emerald-200 outline-none ${
                          dirty
                            ? "border-amber-400/80"
                            : "border-emerald-700/50 focus:border-emerald-400"
                        }`}
                      />
                    </td>
                    <td
                      className={`px-2 py-1.5 tabular-nums ${
                        gap == null
                          ? "text-zinc-600"
                          : gap >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                      }`}
                    >
                      {gap == null ? (
                        "—"
                      ) : (
                        <>
                          <div>{money(gap, true)}</div>
                          <div className="text-[10px] text-zinc-600">
                            {altMoney(gap)}
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CheerBurst() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const paint = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    paint();
    const colors = ["#fbbf24", "#34d399", "#38bdf8", "#f4f4f5", "#fb7185"];
    const bits = Array.from({ length: 70 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.4,
      w: 4 + Math.random() * 5,
      h: 8 + Math.random() * 8,
      vy: 2.2 + Math.random() * 3.4,
      vx: -1.6 + Math.random() * 3.2,
      rot: Math.random() * Math.PI,
      spin: -0.12 + Math.random() * 0.24,
      color: colors[Math.floor(Math.random() * colors.length)] ?? "#fbbf24",
    }));
    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame += 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const bit of bits) {
        bit.x += bit.vx;
        bit.y += bit.vy;
        bit.vy += 0.04;
        bit.rot += bit.spin;
        ctx.save();
        ctx.translate(bit.x, bit.y);
        ctx.rotate(bit.rot);
        ctx.fillStyle = bit.color;
        ctx.globalAlpha = Math.max(0, 1 - frame / 170);
        ctx.fillRect(-bit.w / 2, -bit.h / 2, bit.w, bit.h);
        ctx.restore();
      }
      if (frame < 180) raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      className="pointer-events-none fixed inset-0 z-50"
      aria-hidden
    />
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "up" | "down" | "actual";
}) {
  const color =
    tone === "up"
      ? "text-emerald-300"
      : tone === "down"
        ? "text-rose-300"
        : tone === "actual"
          ? "text-emerald-200"
          : "text-zinc-50";
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className={`mt-1 text-sm font-semibold tabular-nums ${color}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-zinc-500">{sub}</p>}
    </div>
  );
}
