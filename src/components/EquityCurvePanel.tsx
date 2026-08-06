"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  type UTCTimestamp,
} from "lightweight-charts";
import type { DailyPnl } from "@/lib/stats/compute";
import type { WalletOverview } from "@/lib/exchanges/wallet";
import { formatPnl } from "@/lib/utils/format";

interface CashRow {
  entry_date: string;
  deposit: number;
  withdrawal: number;
}

interface EquityCurvePanelProps {
  daily: DailyPnl[];
  totalPnl: number;
  wallet: WalletOverview | null;
  walletLoading?: boolean;
}

function dayToUtcSec(day: string): number {
  // KST 날짜 → 그날 00:00 KST = 전날 15:00 UTC
  return Math.floor(new Date(`${day}T00:00:00+09:00`).getTime() / 1000);
}

export function EquityCurvePanel({
  daily,
  totalPnl,
  wallet,
  walletLoading,
}: EquityCurvePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cash, setCash] = useState<CashRow[]>([]);
  const [cashError, setCashError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/cash");
        const data = (await res.json()) as {
          entries?: CashRow[];
          error?: string;
        };
        if (cancelled) return;
        if (data.error) {
          setCashError(data.error);
          setCash([]);
          return;
        }
        setCash(data.entries ?? []);
        setCashError(null);
      } catch {
        if (!cancelled) setCashError("입출금 기록을 불러오지 못했습니다");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const series = useMemo(() => {
    const cashByDay = new Map<string, number>();
    for (const e of cash) {
      const d = e.entry_date.slice(0, 10);
      const net = Number(e.deposit || 0) - Number(e.withdrawal || 0);
      cashByDay.set(d, (cashByDay.get(d) ?? 0) + net);
    }

    const pnlByDay = new Map(daily.map((d) => [d.date, d.pnl]));
    const days = Array.from(
      new Set([...cashByDay.keys(), ...pnlByDay.keys()])
    ).sort();

    if (days.length === 0) return [] as { time: number; value: number }[];

    let equity = 0;
    const points: { time: number; value: number }[] = [];
    for (const day of days) {
      equity += cashByDay.get(day) ?? 0;
      equity += pnlByDay.get(day) ?? 0;
      points.push({ time: dayToUtcSec(day), value: Number(equity.toFixed(2)) });
    }
    return points;
  }, [cash, daily]);

  const liveEquity = wallet?.totalEquity ?? null;
  const cashNet = cash.reduce(
    (s, e) => s + Number(e.deposit || 0) - Number(e.withdrawal || 0),
    0
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || series.length === 0) return;

    const chart = createChart(el, {
      height: 280,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#a1a1aa",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(63,63,70,0.35)" },
        horzLines: { color: "rgba(63,63,70,0.35)" },
      },
      rightPriceScale: { borderColor: "#3f3f46" },
      timeScale: {
        borderColor: "#3f3f46",
        timeVisible: false,
      },
      crosshair: {
        vertLine: { color: "#71717a" },
        horzLine: { color: "#71717a" },
      },
    });

    const area = chart.addSeries(AreaSeries, {
      lineColor: "#34d399",
      topColor: "rgba(52, 211, 153, 0.35)",
      bottomColor: "rgba(52, 211, 153, 0.02)",
      lineWidth: 2,
      priceLineVisible: false,
    });

    area.setData(
      series.map((p) => ({
        time: p.time as UTCTimestamp,
        value: p.value,
      }))
    );

    if (liveEquity != null && Number.isFinite(liveEquity)) {
      area.createPriceLine({
        price: liveEquity,
        color: "#38bdf8",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "현재",
      });
    }

    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(el);
    chart.applyOptions({ width: el.clientWidth });

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [series, liveEquity]);

  const last = series[series.length - 1]?.value;

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-500">
        입출금(현금 장부) + 일별 실현손익을 누적한 자산 곡선입니다. 파란 점선은
        거래소 실시간 자산입니다.
      </p>

      <div className="flex flex-wrap gap-4 text-sm">
        <div>
          <p className="text-[11px] text-zinc-500">곡선 최신</p>
          <p className="font-semibold tabular-nums text-zinc-100">
            {last != null ? `$${last.toFixed(2)}` : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">입출금 순액</p>
          <p className="font-semibold tabular-nums text-zinc-100">
            ${cashNet.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">누적 실현손익</p>
          <p
            className={`font-semibold tabular-nums ${
              totalPnl >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {formatPnl(totalPnl)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">실시간 자산</p>
          <p className="font-semibold tabular-nums text-sky-300">
            {walletLoading
              ? "…"
              : liveEquity != null
                ? `$${liveEquity.toFixed(2)}`
                : "—"}
          </p>
        </div>
      </div>

      {series.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">
          매매 동기화 또는 「입출금」 기록이 있으면 자산 그래프가 그려집니다.
          {cashError ? (
            <span className="mt-1 block text-xs text-amber-300/80">
              {cashError}
            </span>
          ) : null}
        </div>
      ) : (
        <div
          ref={containerRef}
          className="w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/40"
        />
      )}
    </div>
  );
}
