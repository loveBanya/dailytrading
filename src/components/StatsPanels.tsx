"use client";

import { useEffect, useMemo, useState } from "react";
import type { AssetFlow } from "@/app/api/asset-flows/route";
import type { Trade } from "@/lib/exchanges/types";
import type { WalletOverview } from "@/lib/exchanges/wallet";
import { buildDayAccounts, type DayAccount } from "@/lib/stats/equity";
import { followedEquity } from "@/lib/wallet-follow";
import type {
  DailyPnl,
  HourStat,
  MonthlyStat,
  OverallStats,
} from "@/lib/stats/compute";
import { dayKeyKst } from "@/lib/stats/compute";
import {
  filterByEntryDay,
  SCENARIO_ENTRY_FROM,
  seoulToday,
  shiftIsoDate,
} from "@/lib/stats/range";
import {
  formatDuration,
  formatKst,
  formatPnl,
  formatPrice,
} from "@/lib/utils/format";
import { exchangeLabel } from "@/lib/utils/labels";

function ratioText(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "-";
  return v.toFixed(2);
}

function pfText(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "-";
  return v.toFixed(2);
}

function formatVolume(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDayPnl(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}`;
}

interface StatsPanelsProps {
  overall: OverallStats | null;
  monthly: MonthlyStat[];
  daily?: DailyPnl[];
  hourly?: HourStat[];
  trades?: Trade[];
  loading?: boolean;
  error?: string | null;
  /** 전체 통계가 다시 불러와질 때마다 올라간다. 기간 보기도 같이 갱신한다. */
  statsRevision?: number;
  /** 기간을 좁혀도 시드 되돌림은 전체 일별 손익으로 한다. */
  equityDaily?: DailyPnl[];
  equityTotalPnl?: number;
  wallet?: WalletOverview | null;
  walletFollow?: string;
}

type StatsPeriod = "all" | "since" | "before" | "d7" | "d30" | "custom";

const PERIODS: { id: StatsPeriod; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "since", label: "10/1 이후" },
  { id: "before", label: "10/1 이전" },
  { id: "d7", label: "최근 7일" },
  { id: "d30", label: "최근 30일" },
  { id: "custom", label: "직접" },
];

interface StatsPayload {
  overall: OverallStats | null;
  monthly: MonthlyStat[];
  daily: DailyPnl[];
  hourly: HourStat[];
}

function resolveStatsRange(
  period: StatsPeriod,
  customFrom: string,
  customTo: string,
  today: string
): { from?: string; to?: string; label: string; ready: boolean } {
  if (period === "all") return { label: "전체", ready: true };
  if (period === "since") {
    return {
      from: SCENARIO_ENTRY_FROM,
      to: today,
      label: `${SCENARIO_ENTRY_FROM} ~ ${today}`,
      ready: true,
    };
  }
  if (period === "before") {
    const to = shiftIsoDate(SCENARIO_ENTRY_FROM, -1);
    return { to, label: `~ ${to}`, ready: true };
  }
  if (period === "d7") {
    const from = shiftIsoDate(today, -6);
    return { from, to: today, label: `${from} ~ ${today}`, ready: true };
  }
  if (period === "d30") {
    const from = shiftIsoDate(today, -29);
    return { from, to: today, label: `${from} ~ ${today}`, ready: true };
  }
  if (!customFrom || !customTo) return { label: "직접", ready: false };
  const [from, to] =
    customFrom <= customTo ? [customFrom, customTo] : [customTo, customFrom];
  return { from, to, label: `${from} ~ ${to}`, ready: true };
}

export function StatsPanels({
  overall,
  monthly,
  daily = [],
  hourly = [],
  trades = [],
  loading,
  error,
  statsRevision = 0,
  equityDaily,
  equityTotalPnl,
  wallet,
  walletFollow,
}: StatsPanelsProps) {
  const [period, setPeriod] = useState<StatsPeriod>("all");
  const [customFrom, setCustomFrom] = useState(SCENARIO_ENTRY_FROM);
  const [customTo, setCustomTo] = useState("");
  const [remote, setRemote] = useState<StatsPayload | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const today = seoulToday();
  const range = resolveStatsRange(period, customFrom, customTo, today);
  const ranged = period !== "all";

  useEffect(() => {
    if (!ranged || !range.ready) {
      setRemote(null);
      setRemoteLoading(false);
      setRemoteError(null);
      return;
    }
    const ctrl = new AbortController();
    const q = new URLSearchParams();
    if (range.from) q.set("from", range.from);
    if (range.to) q.set("to", range.to);
    setRemote(null);
    setRemoteLoading(true);
    setRemoteError(null);
    fetch(`/api/stats?${q}`, { signal: ctrl.signal })
      .then(async (res) => {
        const data = (await res.json()) as StatsPayload & { error?: string };
        if (ctrl.signal.aborted) return;
        if (!res.ok || data.error) throw new Error(data.error || "통계 불러오기 실패");
        setRemote({
          overall: data.overall ?? null,
          monthly: data.monthly ?? [],
          daily: data.daily ?? [],
          hourly: data.hourly ?? [],
        });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setRemote(null);
        setRemoteError(err instanceof Error ? err.message : "통계 불러오기 실패");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setRemoteLoading(false);
      });
    return () => ctrl.abort();
  }, [ranged, range.ready, range.from, range.to, statsRevision]);

  const calendarTrades = useMemo(
    () => filterByEntryDay(trades, range.from, range.to),
    [trades, range.from, range.to]
  );

  const view: StatsPayload & { loading?: boolean; error?: string | null } = ranged
    ? {
        overall: remote?.overall ?? null,
        monthly: remote?.monthly ?? [],
        daily: remote?.daily ?? [],
        hourly: remote?.hourly ?? [],
        loading: remoteLoading,
        error: remoteError,
      }
    : { overall, monthly, daily, hourly, loading, error };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setPeriod(item.id);
                if (item.id === "custom" && !customTo) setCustomTo(today);
              }}
              className={`rounded-full border px-3 py-1 text-xs ${
                period === item.id
                  ? "border-zinc-100 bg-zinc-100 text-zinc-900"
                  : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-200 outline-none focus:border-emerald-500/50"
            />
            <span className="text-xs text-zinc-600">~</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-200 outline-none focus:border-emerald-500/50"
            />
          </div>
        )}
        <p className="mt-2 text-[11px] text-zinc-600">
          {ranged && range.ready ? `${range.label} · ` : ""}
          기간은 포지션을 연 날(한국시간)입니다. 10/1 이후가 시나리오 매매입니다.
        </p>
      </div>
      {period === "custom" && !range.ready ? (
        <p className="text-sm text-zinc-500">시작일과 종료일을 고르세요.</p>
      ) : (
        <StatsBody
          overall={view.overall}
          monthly={view.monthly}
          daily={view.daily}
          hourly={view.hourly}
          trades={calendarTrades}
          loading={view.loading}
          error={view.error}
          emptyHint={
            ranged ? "이 기간에 연 포지션이 없습니다." : undefined
          }
          equityDaily={equityDaily ?? daily}
          equityTotalPnl={equityTotalPnl}
          wallet={wallet}
          walletFollow={walletFollow}
        />
      )}
    </div>
  );
}

function StatsBody({
  overall,
  monthly,
  daily = [],
  hourly = [],
  trades = [],
  loading,
  error,
  emptyHint,
  equityDaily,
  equityTotalPnl,
  wallet,
  walletFollow,
}: StatsPanelsProps & { emptyHint?: string }) {
  if (loading) {
    return <p className="text-sm text-zinc-500">통계를 불러오는 중…</p>;
  }
  if (error) {
    return <p className="text-sm text-amber-300/80">{error}</p>;
  }
  if (!overall || overall.trades === 0) {
    return (
      <p className="text-sm text-zinc-500">
        {emptyHint ?? "거래소 동기화 후 All-time PNL이 여기에 표시됩니다."}
      </p>
    );
  }

  const leftRows: StatRow[] = [
    {
      label: "총 수익",
      value: `${overall.totalProfit.toFixed(2)} USD`,
      tone: "pos",
    },
    {
      label: "총 손실",
      value: `${overall.totalLoss.toFixed(2)} USD`,
      tone: "neg",
    },
    {
      label: "순손익",
      value: `${overall.totalPnl.toFixed(2)} USD`,
      tone: overall.totalPnl >= 0 ? "pos" : "neg",
      emphasize: true,
    },
    {
      label: "거래대금",
      value: formatVolume(overall.tradingVolume),
    },
    {
      label: "승률",
      value: `${overall.winRate.toFixed(2)} %`,
    },
    {
      label: "수익일",
      value: `${overall.winningDays}일`,
      tone: "pos",
    },
  ];

  const rightRows: StatRow[] = [
    {
      label: "손실일",
      value: `${overall.losingDays}일`,
      tone: "neg",
    },
    {
      label: "본전일",
      value: `${overall.breakevenDays}일`,
    },
    {
      label: "평균 수익",
      value: `${overall.avgWin.toFixed(2)} USD`,
      tone: "pos",
    },
    {
      label: "평균 손실",
      value: `${Math.abs(overall.avgLoss).toFixed(2)} USD`,
      tone: "neg",
    },
    {
      label: "손익비",
      value: ratioText(overall.rrRatio),
    },
    {
      label: "손익배수",
      value: pfText(overall.profitFactor),
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <div className="grid gap-x-10 gap-y-1 sm:grid-cols-2">
          <StatColumn rows={leftRows} />
          <StatColumn rows={rightRows} />
        </div>
        <p className="mt-3 text-[11px] text-zinc-600">
          거래 {overall.trades}회 · 기대값 {formatPnl(overall.expectancy)} · 평균
          보유 {formatDuration(Math.round(overall.avgHoldMinutes))}
        </p>
        <SideSplit long={overall.long} short={overall.short} />
      </div>

      <HourlyWinRate hours={hourly} overallRate={overall.winRate} />

      <DailyPnlCalendar
        daily={daily}
        trades={trades}
        equityDaily={equityDaily ?? daily}
        equityTotalPnl={equityTotalPnl}
        wallet={wallet}
        walletFollow={walletFollow}
      />

      <div>
        <h3 className="mb-3 text-sm font-medium text-zinc-300">월별 매매</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500">
                <th className="pb-2 font-medium">월</th>
                <th className="pb-2 font-medium">거래 수</th>
                <th className="pb-2 font-medium">승/패</th>
                <th className="pb-2 font-medium">승률</th>
                <th className="pb-2 font-medium">손익</th>
                <th className="pb-2 font-medium">손익비</th>
                <th className="pb-2 font-medium">손익배수</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.month} className="border-b border-zinc-800/60">
                  <td className="py-2.5 text-zinc-200">{m.label}</td>
                  <td className="py-2.5 tabular-nums text-zinc-400">
                    {m.trades}
                  </td>
                  <td className="py-2.5 tabular-nums text-zinc-400">
                    {m.wins}/{m.losses}
                  </td>
                  <td className="py-2.5 tabular-nums text-zinc-400">
                    {m.winRate.toFixed(0)}%
                  </td>
                  <td
                    className={`py-2.5 tabular-nums font-medium ${
                      m.pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {formatPnl(m.pnl)}
                  </td>
                  <td className="py-2.5 tabular-nums text-zinc-300">
                    {ratioText(m.rrRatio)}
                  </td>
                  <td className="py-2.5 tabular-nums text-zinc-300">
                    {pfText(m.profitFactor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type StatRow = {
  label: string;
  value: string;
  tone?: "pos" | "neg";
  emphasize?: boolean;
};

const HOUR_MIN_SAMPLE = 8;

function HourlyWinRate({
  hours,
  overallRate,
}: {
  hours: HourStat[];
  overallRate: number;
}) {
  const ranked = hours.filter((hour) => hour.trades >= HOUR_MIN_SAMPLE);
  const worst = ranked.reduce<HourStat | null>(
    (best, hour) => (best == null || hour.winRate < best.winRate ? hour : best),
    null
  );
  const best = ranked.reduce<HourStat | null>(
    (top, hour) => (top == null || hour.winRate > top.winRate ? hour : top),
    null
  );

  if (hours.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-medium text-zinc-300">시간대별 승률</h3>
      <p className="mt-1 text-[11px] text-zinc-600">
        포지션을 연 시각(한국시간)입니다. 점선은 이 기간 승률 {overallRate.toFixed(0)}%이고,
        5회 미만은 옅게 표시합니다.
      </p>
      <div className="relative mt-3 flex h-28 items-end gap-0.5">
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-zinc-500"
          style={{ bottom: `${Math.min(100, Math.max(0, overallRate))}%` }}
        />
        {hours.map((hour) => {
          const thin = hour.trades < 5;
          const below = hour.winRate + 0.05 < overallRate;
          const height = hour.trades === 0 ? 2 : Math.max(6, hour.winRate);
          return (
            <div
              key={hour.hour}
              className="flex h-full min-w-0 flex-1 items-end"
              title={`${hour.hour}시 · ${hour.trades}회 · 승률 ${hour.winRate.toFixed(0)}% · ${formatPnl(hour.pnl)}`}
            >
              <div
                className={`w-full rounded-sm ${
                  hour.trades === 0
                    ? "bg-zinc-800"
                    : thin
                      ? "bg-zinc-600"
                      : below
                        ? "bg-rose-500"
                        : "bg-emerald-500"
                }`}
                style={{ height: `${height}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-0.5 text-[10px] tabular-nums text-zinc-500">
        {hours.map((hour) => (
          <span key={hour.hour} className="min-w-0 flex-1">
            {hour.hour % 3 === 0 ? hour.hour : ""}
          </span>
        ))}
      </div>
      {worst && best && worst.hour !== best.hour ? (
        <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">
          8회 이상인 시간 중 {worst.hour}시 승률이 {worst.winRate.toFixed(0)}%
          ({worst.trades}회)로 가장 낮고, {best.hour}시는 {best.winRate.toFixed(0)}%
          ({best.trades}회)로 가장 높습니다.
          {worst.winRate + 5 < overallRate
            ? ` ${worst.hour}시는 이 기간 승률보다 ${(overallRate - worst.winRate).toFixed(0)}%p 낮습니다.`
            : ""}
        </p>
      ) : worst ? (
        <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">
          8회 이상 들어간 시간은 {worst.hour}시뿐입니다. 승률 {worst.winRate.toFixed(0)}%
          ({worst.trades}회)입니다.
        </p>
      ) : (
        <p className="mt-2 text-[12px] text-zinc-500">
          한 시간에 8회 이상 들어간 기록이 아직 없어서, 시간대 비교는 이 차트로만 보세요.
        </p>
      )}
    </div>
  );
}

function SideSplit({
  long,
  short,
}: {
  long: OverallStats["long"];
  short: OverallStats["short"];
}) {
  return (
    <div className="mt-4">
      <p className="text-sm text-zinc-300">롱·숏</p>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className="bg-emerald-500" style={{ width: `${long.share}%` }} />
        <div className="bg-rose-500" style={{ width: `${short.share}%` }} />
      </div>
      <div className="mt-2 space-y-1">
        <SideLine name="롱" stats={long} tone="pos" />
        <SideLine name="숏" stats={short} tone="neg" />
      </div>
      <p className="mt-1 text-[11px] text-zinc-600">비율은 거래 수 기준입니다.</p>
    </div>
  );
}

function SideLine({
  name,
  stats,
  tone,
}: {
  name: string;
  stats: OverallStats["long"];
  tone: "pos" | "neg";
}) {
  return (
    <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
      <span className={tone === "pos" ? "text-emerald-400" : "text-rose-400"}>
        {name} {stats.share.toFixed(0)}%
      </span>
      <span className="tabular-nums text-zinc-400">
        {stats.trades}회 · 승률 {stats.trades ? `${stats.winRate.toFixed(1)}%` : "—"}
      </span>
    </p>
  );
}

function StatColumn({ rows }: { rows: StatRow[] }) {
  return (
    <div className="divide-y divide-zinc-800/80">
      {rows.map((r) => (
        <div
          key={r.label}
          className="flex items-baseline justify-between gap-4 py-2.5"
        >
          <span className="text-sm text-zinc-500">{r.label}</span>
          <span
            className={`text-sm tabular-nums ${
              r.emphasize ? "text-base font-semibold" : "font-medium"
            } ${
              r.tone === "pos"
                ? "text-emerald-400"
                : r.tone === "neg"
                  ? "text-rose-400"
                  : "text-zinc-100"
            }`}
          >
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formatPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function seedPct(pnl: number, equityStart: number): number | null {
  if (!(equityStart > 1)) return null;
  return (pnl / equityStart) * 100;
}

function DailyPnlCalendar({
  daily,
  trades,
  equityDaily,
  equityTotalPnl = 0,
  wallet,
  walletFollow,
}: {
  daily: DailyPnl[];
  trades: Trade[];
  equityDaily: DailyPnl[];
  equityTotalPnl?: number;
  wallet?: WalletOverview | null;
  walletFollow?: string;
}) {
  const months = useMemo(() => {
    const set = new Set(daily.map((d) => d.date.slice(0, 7)));
    const list = [...set].sort((a, b) => b.localeCompare(a));
    if (list.length === 0) {
      const now = new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Seoul",
      });
      return [now.slice(0, 7)];
    }
    return list;
  }, [daily]);

  const [month, setMonth] = useState(months[0] ?? "");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [flows, setFlows] = useState<AssetFlow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/asset-flows");
        const data = (await res.json()) as { flows?: AssetFlow[]; error?: string };
        if (cancelled || data.error) return;
        setFlows(data.flows ?? []);
      } catch {
        if (!cancelled) setFlows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!months.includes(month) && months[0]) setMonth(months[0]);
  }, [months, month]);

  useEffect(() => {
    setSelectedDate(null);
  }, [month]);

  const byDate = useMemo(() => {
    const map = new Map<string, DailyPnl>();
    for (const d of daily) map.set(d.date, d);
    return map;
  }, [daily]);

  const tradesByDate = useMemo(() => {
    const map = new Map<string, Trade[]>();
    for (const t of trades) {
      const key = dayKeyKst(t.exit_time);
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          new Date(b.exit_time).getTime() - new Date(a.exit_time).getTime()
      );
    }
    return map;
  }, [trades]);

  const accounts = useMemo(() => {
    const flowByDay = new Map<string, number>();
    for (const flow of flows) {
      const day = flow.entry_date.slice(0, 10);
      const amt = Number(flow.amount_usdt) || 0;
      const net = flow.direction === "out" ? -amt : amt;
      flowByDay.set(day, (flowByDay.get(day) ?? 0) + net);
    }
    const liveEquity = wallet ? followedEquity(wallet, walletFollow) : null;
    const { rows, anchored } = buildDayAccounts({
      daily: equityDaily,
      flowByDay,
      liveEquity,
      liveUpl: wallet?.totalPerpUPL ?? 0,
      totalPnl: equityTotalPnl,
    });
    const map = new Map<string, DayAccount>();
    for (const row of rows) map.set(row.date, row);
    return { map, anchored };
  }, [equityDaily, equityTotalPnl, flows, wallet, walletFollow]);

  const monthSummary = useMemo(() => {
    let total = 0;
    let profit = 0;
    let loss = 0;
    let tradeCount = 0;
    for (const d of daily) {
      if (!d.date.startsWith(month)) continue;
      total += d.pnl;
      tradeCount += d.trades;
      if (d.pnl > 0) profit += d.pnl;
      else if (d.pnl < 0) loss += d.pnl;
    }
    return { total, profit, loss, tradeCount };
  }, [daily, month]);

  const cells = useMemo(() => buildMonthCells(month), [month]);
  const selectedTrades = selectedDate
    ? (tradesByDate.get(selectedDate) ?? [])
    : [];
  const selectedRow = selectedDate ? byDate.get(selectedDate) : null;

  if (!month) return null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-zinc-300">일별 손익</h3>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-zinc-500"
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 sm:max-w-md">
        <SummaryChip
          label="총합"
          value={formatDayPnl(monthSummary.total)}
          tone={
            monthSummary.total > 0
              ? "pos"
              : monthSummary.total < 0
                ? "neg"
                : "neutral"
          }
        />
        <SummaryChip
          label="수익"
          value={`+${monthSummary.profit.toFixed(2)}`}
          tone="pos"
        />
        <SummaryChip
          label="손실"
          value={monthSummary.loss.toFixed(2)}
          tone="neg"
        />
      </div>
      <p className="mb-3 text-[11px] text-zinc-600">
        선택 월 거래 {monthSummary.tradeCount}회 · 금액과 %는 청산된 매매
        손익입니다. 입출금은 수익에 넣지 않습니다. 날짜를{" "}
        <span className="text-zinc-400">클릭</span>하면 계좌 잔고와 최고
        수익·손실이 나옵니다.
      </p>

      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          <div className="mb-1 grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="py-1 text-center text-[11px] font-medium text-zinc-500"
              >
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((cell, i) => {
              if (!cell) {
                return (
                  <div
                    key={`empty-${i}`}
                    className="min-h-[64px] rounded-md bg-zinc-950/30"
                  />
                );
              }
              const row = byDate.get(cell);
              const dayNum = Number(cell.slice(8, 10));
              if (!row) {
                return (
                  <div
                    key={cell}
                    className="flex min-h-[64px] flex-col rounded-md border border-zinc-800/40 bg-zinc-950/40 p-1.5"
                  >
                    <span className="text-[11px] text-zinc-600">{dayNum}</span>
                  </div>
                );
              }
              const win = row.pnl >= 0;
              const isSelected = selectedDate === cell;
              const account = accounts.map.get(cell);
              const pct =
                accounts.anchored && account
                  ? seedPct(row.pnl, account.equityStart)
                  : null;
              return (
                <button
                  key={cell}
                  type="button"
                  onClick={() =>
                    setSelectedDate((prev) => (prev === cell ? null : cell))
                  }
                  className={`flex min-h-[76px] flex-col rounded-md border p-1.5 text-left outline-none transition ${
                    win
                      ? "border-emerald-500/20 bg-emerald-950/50"
                      : "border-rose-500/20 bg-rose-950/50"
                  } ${
                    isSelected
                      ? "ring-2 ring-sky-400/70"
                      : "hover:ring-1 hover:ring-zinc-500/50"
                  }`}
                >
                  <span
                    className={`text-[11px] ${
                      win ? "text-emerald-500/70" : "text-rose-500/70"
                    }`}
                  >
                    {dayNum}
                    <span className="ml-1 text-[10px] opacity-70">
                      {row.trades}회
                    </span>
                  </span>
                  <span
                    className={`mt-auto text-xs font-medium tabular-nums ${
                      win ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {formatDayPnl(row.pnl)}
                  </span>
                  {pct != null && (
                    <span
                      className={`text-[10px] tabular-nums ${
                        pct >= 0 ? "text-emerald-500/80" : "text-rose-500/80"
                      }`}
                    >
                      {formatPct(pct)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {selectedDate && selectedRow && (
        <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs text-zinc-400">
              {selectedDate} ·{" "}
              <span
                className={
                  selectedRow.pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                }
              >
                {formatDayPnl(selectedRow.pnl)}
              </span>{" "}
              · {selectedRow.trades}회
            </p>
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="text-[11px] text-zinc-500 hover:text-zinc-300"
            >
              닫기
            </button>
          </div>
          <DayAccountSummary
            row={selectedRow}
            account={accounts.map.get(selectedDate) ?? null}
            anchored={accounts.anchored}
          />
          <DayTradeList
            trades={selectedTrades}
            bestPnl={selectedRow.bestPnl}
            worstPnl={selectedRow.worstPnl}
          />
        </div>
      )}

      <p className="mt-2 text-[11px] text-zinc-600">
        청산일 기준 · 한국시간(KST). 수익은 그날 청산 손익의 합이고, 시작
        시드 대비 %도 그 금액으로 계산합니다. 마감 계좌는 시작 시드에 매매
        손익과 입출금을 더한 잔고입니다.
      </p>
    </div>
  );
}

function SummaryChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "pos" | "neg" | "neutral";
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 px-2.5 py-2">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p
        className={`mt-0.5 text-sm font-semibold tabular-nums ${
          tone === "pos"
            ? "text-emerald-400"
            : tone === "neg"
              ? "text-rose-400"
              : "text-zinc-100"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function DayAccountSummary({
  row,
  account,
  anchored,
}: {
  row: DailyPnl;
  account: DayAccount | null;
  anchored: boolean;
}) {
  const best = row.bestPnl ?? null;
  const worst = row.worstPnl ?? null;
  const trading = row.pnl;
  const flow = account?.flow ?? 0;
  const end =
    anchored && account ? account.equityStart + trading + flow : null;
  const pct =
    anchored && account ? seedPct(trading, account.equityStart) : null;
  const partial =
    account != null && Math.abs(trading - account.pnl) > 0.009;

  return (
    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      <SummaryChip
        label="매매 손익"
        value={formatPnl(trading)}
        tone={trading >= 0 ? "pos" : "neg"}
      />
      <SummaryChip
        label="매매 수익률"
        value={pct != null ? formatPct(pct) : "—"}
        tone={pct == null ? "neutral" : pct >= 0 ? "pos" : "neg"}
      />
      <SummaryChip
        label="시작 시드"
        value={anchored && account ? formatUsd(account.equityStart) : "지갑 확인 중"}
        tone="neutral"
      />
      <SummaryChip
        label="마감 계좌"
        value={end != null ? formatUsd(end) : "—"}
        tone="neutral"
      />
      <SummaryChip
        label="최고 수익"
        value={best != null ? formatPnl(best) : "없음"}
        tone={best != null ? "pos" : "neutral"}
      />
      <SummaryChip
        label="최고 손실"
        value={worst != null ? formatPnl(worst) : "없음"}
        tone={worst != null ? "neg" : "neutral"}
      />
      {account && Math.abs(flow) > 0.009 && (
        <SummaryChip
          label="입출금"
          value={formatPnl(flow)}
          tone={flow >= 0 ? "pos" : "neg"}
        />
      )}
      <p className="col-span-2 text-[11px] leading-relaxed text-zinc-500 sm:col-span-3">
        매매 수익률은 청산 손익 ÷ 시작 시드입니다. 마감 계좌는 시작 시드 +
        매매 손익{Math.abs(flow) > 0.009 ? " + 입출금" : ""}입니다.
        {partial
          ? " 이 칸의 손익은 고른 기간의 거래만 더한 값입니다."
          : ""}
      </p>
    </div>
  );
}

function samePnl(a: number, b: number | null | undefined): boolean {
  return b != null && Math.abs(a - b) < 0.0005;
}

function DayTradeList({
  trades,
  compact,
  bestPnl,
  worstPnl,
}: {
  trades: Trade[];
  compact?: boolean;
  bestPnl?: number | null;
  worstPnl?: number | null;
}) {
  if (trades.length === 0) {
    return <p className="text-xs text-zinc-600">매매 기록 없음</p>;
  }
  return (
    <ul className={`space-y-1.5 ${compact ? "max-h-40 overflow-y-auto" : ""}`}>
      {trades.map((t) => {
        const asset = t.base_asset ?? t.symbol.replace(/USDT$/i, "");
        const pnl = Number(t.pnl);
        const win = pnl >= 0;
        const tag = samePnl(pnl, bestPnl)
          ? "최고 수익"
          : samePnl(pnl, worstPnl)
            ? "최고 손실"
            : null;
        return (
          <li
            key={t.id}
            className="flex items-start justify-between gap-2 text-xs"
          >
            <div className="min-w-0">
              <p className="truncate text-zinc-200">
                {asset}{" "}
                <span
                  className={
                    t.side === "LONG" ? "text-emerald-400" : "text-rose-400"
                  }
                >
                  {t.side === "LONG" ? "롱" : "숏"}
                </span>
                <span className="ml-1 text-zinc-600">
                  {exchangeLabel(t.exchange)}
                </span>
                {tag && (
                  <span className="ml-1 text-[10px] text-zinc-400">{tag}</span>
                )}
              </p>
              {!compact && (
                <p className="text-[10px] text-zinc-600">
                  {formatPrice(Number(t.entry_price))} →{" "}
                  {formatPrice(Number(t.exit_price))} ·{" "}
                  {formatKst(t.exit_time)}
                </p>
              )}
            </div>
            <span
              className={`shrink-0 tabular-nums font-medium ${
                win ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {formatPnl(Number(t.pnl))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** 해당 월(YYYY-MM)의 달력 셀 — 일요일 시작, null은 빈칸 */
function buildMonthCells(month: string): (string | null)[] {
  const [ys, ms] = month.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!y || !m) return [];

  const weekdayName = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
  }).format(new Date(`${month}-01T12:00:00+09:00`));
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const startDow = map[weekdayName] ?? 0;
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${month}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
