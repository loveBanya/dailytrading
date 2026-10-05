"use client";

import { useEffect, useMemo, useState } from "react";
import type { Trade } from "@/lib/exchanges/types";
import type {
  DailyPnl,
  HourStat,
  MonthlyStat,
  OverallStats,
} from "@/lib/stats/compute";
import { dayKeyKst } from "@/lib/stats/compute";
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
}

export function StatsPanels({
  overall,
  monthly,
  daily = [],
  hourly = [],
  trades = [],
  loading,
  error,
}: StatsPanelsProps) {
  if (loading) {
    return <p className="text-sm text-zinc-500">통계를 불러오는 중…</p>;
  }
  if (error) {
    return <p className="text-sm text-amber-300/80">{error}</p>;
  }
  if (!overall || overall.trades === 0) {
    return (
      <p className="text-sm text-zinc-500">
        거래소 동기화 후 All-time PNL이 여기에 표시됩니다.
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

      <DailyPnlCalendar daily={daily} trades={trades} />

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
        포지션을 연 시각(한국시간)입니다. 점선은 전체 승률 {overallRate.toFixed(0)}%이고,
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
            ? ` ${worst.hour}시는 전체보다 ${(overallRate - worst.winRate).toFixed(0)}%p 낮습니다.`
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

function DailyPnlCalendar({
  daily,
  trades,
}: {
  daily: DailyPnl[];
  trades: Trade[];
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
        선택 월 거래 {monthSummary.tradeCount}회 · 날짜를{" "}
        <span className="text-zinc-400">클릭</span>하면 그날 매매 기록이
        아래에 고정됩니다
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
              return (
                <button
                  key={cell}
                  type="button"
                  onClick={() =>
                    setSelectedDate((prev) => (prev === cell ? null : cell))
                  }
                  className={`flex min-h-[64px] flex-col rounded-md border p-1.5 text-left outline-none transition ${
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
          <DayTradeList trades={selectedTrades} />
        </div>
      )}

      <p className="mt-2 text-[11px] text-zinc-600">
        청산일 기준 · 한국시간(KST)
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

function DayTradeList({
  trades,
  compact,
}: {
  trades: Trade[];
  compact?: boolean;
}) {
  if (trades.length === 0) {
    return <p className="text-xs text-zinc-600">매매 기록 없음</p>;
  }
  return (
    <ul className={`space-y-1.5 ${compact ? "max-h-40 overflow-y-auto" : ""}`}>
      {trades.map((t) => {
        const asset = t.base_asset ?? t.symbol.replace(/USDT$/i, "");
        const win = Number(t.pnl) >= 0;
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
