"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { DailyPnl } from "@/lib/stats/compute";
import { buildDayAccounts } from "@/lib/stats/equity";
import type { WalletOverview } from "@/lib/exchanges/wallet";
import type { AssetFlow } from "@/app/api/asset-flows/route";
import { followedEquity, walletFollowLabel } from "@/lib/wallet-follow";
import { CurrencyToggle } from "./CurrencyToggle";
import {
  formatDisplayMoney,
  type DisplayCurrency,
} from "@/lib/display-money";

interface EquityCurvePanelProps {
  daily: DailyPnl[];
  totalPnl: number;
  wallet: WalletOverview | null;
  walletLoading?: boolean;
  /** 목표 자산 (USDT). 설정되면 곡선에 목표선 표시 */
  goalUsdt?: number | null;
  /** 외부에서 flows 갱신 트리거 */
  flowsRefreshKey?: number;
  /** 원/USDT. 월간 목표와 같은 값 */
  fxRate?: number;
  /** 월간 목표와 같은 지갑 */
  walletFollow?: string;
  currency?: DisplayCurrency;
  onCurrencyChange?: (next: DisplayCurrency) => void;
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
  const [year, month, date] = day.split("-").map(Number);
  return Math.floor(Date.UTC(year, (month ?? 1) - 1, date ?? 1) / 1000);
}

function formatUtcDay(sec: number): string {
  const date = new Date(sec * 1000);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function flowNet(f: AssetFlow): number {
  const amt = Number(f.amount_usdt) || 0;
  return f.direction === "out" ? -amt : amt;
}

export function EquityCurvePanel({
  daily,
  totalPnl,
  wallet,
  walletLoading,
  goalUsdt,
  flowsRefreshKey = 0,
  fxRate: fxRateProp,
  walletFollow,
  currency = "krw",
  onCurrencyChange,
}: EquityCurvePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const [flows, setFlows] = useState<AssetFlow[]>([]);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    paneLeft: number;
    paneTop: number;
    paneW: number;
    paneH: number;
    label: string;
  } | null>(null);
  const fxRate = fxRateProp && fxRateProp > 0 ? fxRateProp : 1350;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/asset-flows");
        const data = (await res.json()) as {
          flows?: AssetFlow[];
          error?: string;
        };
        if (cancelled) return;
        if (data.error) {
          setFlows([]);
          return;
        }
        setFlows(data.flows ?? []);
      } catch {
        if (!cancelled) setFlows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [flowsRefreshKey]);

  const liveEquity = wallet ? followedEquity(wallet, walletFollow) : null;
  const liveUpl = wallet?.totalPerpUPL ?? 0;

  const netExternalAll = useMemo(
    () => flows.reduce((s, f) => s + flowNet(f), 0),
    [flows]
  );

  const flowByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of flows) {
      const d = f.entry_date.slice(0, 10);
      map.set(d, (map.get(d) ?? 0) + flowNet(f));
    }
    return map;
  }, [flows]);

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
    const { rows } = buildDayAccounts({
      daily,
      flowByDay,
      liveEquity,
      liveUpl,
      totalPnl,
    });

    if (rows.length === 0 && liveEquity == null) {
      return [] as { time: number; value: number }[];
    }

    if (rows.length === 0 && liveEquity != null) {
      const today = new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Seoul",
      });
      return [
        {
          time: dayToUtcSec(today),
          value: Number(liveEquity.toFixed(2)),
        },
      ];
    }

    const points = rows.map((row) => ({
      time: dayToUtcSec(row.date),
      value: Number(row.equityEnd.toFixed(2)),
    }));

    if (liveEquity != null && points.length > 0) {
      points[points.length - 1] = {
        ...points[points.length - 1]!,
        value: Number(liveEquity.toFixed(2)),
      };
    }

    return points;
  }, [daily, flowByDay, liveEquity, liveUpl, totalPnl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || series.length === 0) return;

    const chart = createChart(el, {
      autoSize: true,
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
        vertLine: { visible: false, labelVisible: false },
        horzLine: { visible: false, labelVisible: false },
      },
      localization: {
        priceFormatter: (price: number) =>
          formatDisplayMoney(price, currency, fxRate),
      },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;

    const area = chart.addSeries(AreaSeries, {
      lineColor: "#34d399",
      topColor: "rgba(52, 211, 153, 0.35)",
      bottomColor: "rgba(52, 211, 153, 0.02)",
      lineWidth: 2,
      priceLineVisible: false,
    });
    seriesRef.current = area;

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

    if (goalUsdt != null && Number.isFinite(goalUsdt) && goalUsdt > 0) {
      area.createPriceLine({
        price: goalUsdt,
        color: "#fbbf24",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "목표",
      });
    }

    chart.timeScale().fitContent();

    return () => {
      chartRef.current = null;
      seriesRef.current = null;
      chart.remove();
    };
  }, [series, liveEquity, goalUsdt, currency, fxRate]);

  function onChartMove(event: MouseEvent<HTMLDivElement>) {
    const root = containerRef.current;
    const chart = chartRef.current;
    const area = seriesRef.current;
    if (!root || !chart || !area) return;
    const pane = root.querySelector("canvas");
    if (!pane) return;
    const host = root.getBoundingClientRect();
    const rect = pane.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) {
      setHover(null);
      return;
    }
    const price = area.coordinateToPrice(localY);
    const time = chart.timeScale().coordinateToTime(localX);
    const day = typeof time === "number" ? formatUtcDay(time) : "—";
    const priceText =
      price == null ? "—" : formatDisplayMoney(price, currency, fxRate);
    const paneLeft = rect.left - host.left;
    const paneTop = rect.top - host.top;
    setHover({
      x: paneLeft + localX,
      y: paneTop + localY,
      paneLeft,
      paneTop,
      paneW: rect.width,
      paneH: rect.height,
      label: `${day}  ${priceText}`,
    });
  }

  const last = series[series.length - 1]?.value;
  const maxCoin = nonStableCoins[0]?.usdValue ?? 0;
  const altCurrency: DisplayCurrency = currency === "krw" ? "usdt" : "krw";
  const show = (n: number, signed = false) =>
    formatDisplayMoney(n, currency, fxRate, signed);
  const showAlt = (n: number) => formatDisplayMoney(n, altCurrency, fxRate);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-500">
          파란 점선=현재
          {goalUsdt != null ? " · 노란 점선=이번 달 월말 목표 자산" : ""}. 환율은
          업비트 USDT 시세({fxRate.toLocaleString("ko-KR")}원)입니다. 십자선은
          마우스 위치에 맞춥니다.
        </p>
        {onCurrencyChange && (
          <CurrencyToggle value={currency} onChange={onCurrencyChange} />
        )}
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <div>
          <p className="text-[11px] text-zinc-500">곡선 최신</p>
          <p className="font-semibold tabular-nums text-zinc-100">
            {last != null ? show(last) : "—"}
          </p>
          {last != null && (
            <p className="text-[11px] tabular-nums text-zinc-600">{showAlt(last)}</p>
          )}
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">누적 실현손익</p>
          <p
            className={`font-semibold tabular-nums ${
              totalPnl >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {show(totalPnl, true)}
          </p>
          <p className="text-[11px] tabular-nums text-zinc-600">{showAlt(totalPnl)}</p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">순유입</p>
          <p
            className={`font-semibold tabular-nums ${
              netExternalAll >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {show(netExternalAll, true)}
          </p>
          <p className="text-[11px] tabular-nums text-zinc-600">
            {showAlt(netExternalAll)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">
            실시간 자산 · {walletFollowLabel(walletFollow)}
          </p>
          <p className="font-semibold tabular-nums text-sky-300">
            {walletLoading ? "…" : liveEquity != null ? show(liveEquity) : "—"}
          </p>
          {!walletLoading && liveEquity != null && (
            <p className="text-[11px] tabular-nums text-zinc-600">
              {showAlt(liveEquity)}
            </p>
          )}
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">비안정 코인</p>
          <p className="font-semibold tabular-nums text-zinc-100">
            {walletLoading ? "…" : coinAssetUsd > 0 ? show(coinAssetUsd) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">미실현</p>
          <p
            className={`font-semibold tabular-nums ${
              liveUpl >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {walletLoading ? "…" : show(liveUpl, true)}
          </p>
        </div>
      </div>

      {series.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">
          매매 동기화·USDT 유입 기록·거래소 자산이 있으면 그래프가 그려집니다.
        </div>
      ) : (
        <div
          ref={containerRef}
          onMouseMove={onChartMove}
          onMouseLeave={() => setHover(null)}
          className="relative h-[280px] w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/40"
        >
          {hover && (
            <>
              <div
                className="pointer-events-none absolute z-10 w-px bg-zinc-300/80"
                style={{ left: hover.x, top: hover.paneTop, height: hover.paneH }}
              />
              <div
                className="pointer-events-none absolute z-10 h-px bg-zinc-300/80"
                style={{ top: hover.y, left: hover.paneLeft, width: hover.paneW }}
              />
              <div
                className="pointer-events-none absolute z-10 rounded bg-zinc-950/95 px-1.5 py-0.5 text-[11px] tabular-nums text-zinc-100"
                style={{
                  left: Math.min(hover.x + 8, hover.paneLeft + hover.paneW - 120),
                  top: Math.max(hover.paneTop + 4, hover.y - 26),
                }}
              >
                {hover.label}
              </div>
            </>
          )}
        </div>
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
