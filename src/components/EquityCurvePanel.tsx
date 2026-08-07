"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  type UTCTimestamp,
} from "lightweight-charts";
import type { DailyPnl } from "@/lib/stats/compute";
import type { WalletOverview } from "@/lib/exchanges/wallet";
import { formatPnl } from "@/lib/utils/format";

interface EquityCurvePanelProps {
  daily: DailyPnl[];
  totalPnl: number;
  wallet: WalletOverview | null;
  walletLoading?: boolean;
}

const STABLES = new Set([
  "USDT",
  "USDC",
  "USD",
  "FDUSD",
  "BUSD",
  "DAI",
  "TUSD",
  "USDE",
  "USDP",
]);

function dayToUtcSec(day: string): number {
  return Math.floor(new Date(`${day}T00:00:00+09:00`).getTime() / 1000);
}

export function EquityCurvePanel({
  daily,
  totalPnl,
  wallet,
  walletLoading,
}: EquityCurvePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const liveEquity = wallet?.totalEquity ?? null;
  const liveUpl = wallet?.totalPerpUPL ?? 0;

  const coinHoldings = useMemo(() => {
    const map = new Map<string, number>();
    for (const acc of wallet?.accounts ?? []) {
      for (const c of acc.wallet?.coins ?? []) {
        const usd = Number(c.usdValue) || 0;
        if (usd <= 0.5) continue;
        map.set(c.coin, (map.get(c.coin) ?? 0) + usd);
      }
    }
    return [...map.entries()]
      .map(([coin, usdValue]) => ({ coin, usdValue }))
      .sort((a, b) => b.usdValue - a.usdValue);
  }, [wallet]);

  const nonStableCoins = useMemo(
    () => coinHoldings.filter((c) => !STABLES.has(c.coin.toUpperCase())),
    [coinHoldings]
  );

  const coinAssetUsd = useMemo(
    () => nonStableCoins.reduce((s, c) => s + c.usdValue, 0),
    [nonStableCoins]
  );

  const series = useMemo(() => {
    const days = [...daily].sort((a, b) => a.date.localeCompare(b.date));
    if (days.length === 0 && liveEquity == null) {
      return [] as { time: number; value: number }[];
    }

    // 거래소 실시간 자산에서 누적 실현손익·미실현을 빼 시작 자산 추정
    // (입출금 장부와 섞지 않고 코인 계좌 기준으로 맞춤)
    const start =
      liveEquity != null && Number.isFinite(liveEquity)
        ? liveEquity - totalPnl - liveUpl
        : 0;

    let equity = start;
    const points: { time: number; value: number }[] = [];

    if (days.length === 0 && liveEquity != null) {
      const today = new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Seoul",
      });
      points.push({
        time: dayToUtcSec(today),
        value: Number(liveEquity.toFixed(2)),
      });
      return points;
    }

    for (const d of days) {
      equity += d.pnl;
      points.push({
        time: dayToUtcSec(d.date),
        value: Number(equity.toFixed(2)),
      });
    }

    // 마지막 점을 실시간 자산(미실현 포함)에 맞춰 표시
    if (liveEquity != null && points.length > 0) {
      points[points.length - 1] = {
        ...points[points.length - 1]!,
        value: Number(liveEquity.toFixed(2)),
      };
    }

    return points;
  }, [daily, liveEquity, liveUpl, totalPnl]);

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
  const maxCoin = nonStableCoins[0]?.usdValue ?? 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        코인 계좌 자산 곡선입니다. 거래소 실시간 자산에서 누적 실현손익을 역산해
        시작점을 맞추고, 일별 매매 손익을 누적합니다. 파란 점선은 현재 자산입니다.
      </p>

      <div className="flex flex-wrap gap-4 text-sm">
        <div>
          <p className="text-[11px] text-zinc-500">곡선 최신</p>
          <p className="font-semibold tabular-nums text-zinc-100">
            {last != null ? `$${last.toFixed(2)}` : "—"}
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
        <div>
          <p className="text-[11px] text-zinc-500">비안정 코인</p>
          <p className="font-semibold tabular-nums text-zinc-100">
            {walletLoading
              ? "…"
              : coinAssetUsd > 0
                ? `$${coinAssetUsd.toFixed(2)}`
                : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">미실현</p>
          <p
            className={`font-semibold tabular-nums ${
              liveUpl >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {walletLoading ? "…" : formatPnl(liveUpl)}
          </p>
        </div>
      </div>

      {series.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">
          매매를 동기화하거나 거래소 자산을 불러오면 코인 자산 그래프가
          그려집니다.
        </div>
      ) : (
        <div
          ref={containerRef}
          className="w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/40"
        />
      )}

      {nonStableCoins.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-400">보유 코인 (USD)</p>
          <ul className="space-y-1.5">
            {nonStableCoins.slice(0, 12).map((c) => {
              const pct =
                coinAssetUsd > 0 ? (c.usdValue / coinAssetUsd) * 100 : 0;
              const bar =
                maxCoin > 0 ? Math.max(4, (c.usdValue / maxCoin) * 100) : 0;
              return (
                <li key={c.coin} className="flex items-center gap-3 text-xs">
                  <span className="w-14 shrink-0 font-medium text-zinc-200">
                    {c.coin}
                  </span>
                  <div className="h-1.5 min-w-0 flex-1 rounded-full bg-zinc-800">
                    <div
                      className="h-1.5 rounded-full bg-emerald-500/70"
                      style={{ width: `${bar}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right tabular-nums text-zinc-300">
                    ${c.usdValue.toFixed(2)}
                  </span>
                  <span className="w-12 shrink-0 text-right tabular-nums text-zinc-600">
                    {pct.toFixed(0)}%
                  </span>
                </li>
              );
            })}
          </ul>
          {coinHoldings.some((c) => STABLES.has(c.coin.toUpperCase())) && (
            <p className="text-[11px] text-zinc-600">
              USDT 등 스테이블은 위 목록에서 제외했습니다. 총자산에는 포함됩니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
