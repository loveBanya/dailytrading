"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/exchanges/klines";

export interface ChartLevels {
  entry: number;
  exit?: number | null;
  tp?: number | null;
  sl?: number | null;
  entryTime?: number; // unix sec
  exitTime?: number; // unix sec
  side?: "LONG" | "SHORT";
  live?: boolean;
}

interface TradeChartProps {
  candles: Candle[];
  levels: ChartLevels;
  height?: number;
}

function snapTime(candles: Candle[], t: number): number {
  let best = candles[0].time;
  let bestDiff = Math.abs(best - t);
  for (const c of candles) {
    const d = Math.abs(c.time - t);
    if (d < bestDiff) {
      best = c.time;
      bestDiff = d;
    }
  }
  return best;
}

function findIndex(candles: Candle[], t: number): number {
  const snapped = snapTime(candles, t);
  return Math.max(
    0,
    candles.findIndex((c) => c.time === snapped)
  );
}

export function TradeChart({ candles, levels, height = 440 }: TradeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || candles.length === 0) return;

    const exitIsWin =
      levels.exit != null &&
      ((levels.side === "LONG" && levels.exit >= levels.entry) ||
        (levels.side === "SHORT" && levels.exit <= levels.entry));

    const pathColor = exitIsWin ? "#ef4444" : "#3b82f6";

    const chart = createChart(el, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#71717a",
        fontFamily: "var(--font-sans), sans-serif",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: "#f4f4f5" },
        horzLines: { color: "#f4f4f5" },
      },
      rightPriceScale: {
        borderColor: "#e4e4e7",
        scaleMargins: { top: 0.12, bottom: 0.12 },
        autoScale: true,
      },
      timeScale: {
        borderColor: "#e4e4e7",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 10,
        minBarSpacing: 4,
      },
      crosshair: {
        vertLine: { color: "#a1a1aa", labelBackgroundColor: "#52525b" },
        horzLine: { color: "#a1a1aa", labelBackgroundColor: "#52525b" },
      },
    });

    // 상승=빨강, 하락=파랑 (사진 스타일)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#ef4444",
      downColor: "#3b82f6",
      borderUpColor: "#ef4444",
      borderDownColor: "#3b82f6",
      wickUpColor: "#ef4444",
      wickDownColor: "#3b82f6",
    });

    candleSeries.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    const tp = levels.tp ?? null;
    const sl = levels.sl ?? null;

    // 가격축: 진입/TP/SL/청산 + 캔들 high/low (캔들만 화면 밖으로 잘리지 않게)
    const pricePoints = [levels.entry];
    if (levels.exit != null) pricePoints.push(levels.exit);
    if (tp != null) pricePoints.push(tp);
    if (sl != null) pricePoints.push(sl);
    for (const c of candles) {
      if (Number.isFinite(c.low)) pricePoints.push(c.low);
      if (Number.isFinite(c.high)) pricePoints.push(c.high);
    }

    const minP = Math.min(...pricePoints);
    const maxP = Math.max(...pricePoints);
    const pad = Math.max((maxP - minP) * 0.12, Math.abs(minP) * 0.002, 1e-8);

    candleSeries.applyOptions({
      autoscaleInfoProvider: () => ({
        priceRange: {
          minValue: minP - pad,
          maxValue: maxP + pad,
        },
      }),
    });

    candleSeries.createPriceLine({
      price: levels.entry,
      color: "#18181b",
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: "진입",
    });

    if (tp != null && Number.isFinite(tp)) {
      candleSeries.createPriceLine({
        price: tp,
        color: "#ef4444",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "TP",
      });
    }

    if (sl != null && Number.isFinite(sl)) {
      candleSeries.createPriceLine({
        price: sl,
        color: "#3b82f6",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: "SL",
      });
    }

    let entryIdx = 0;
    let exitIdx = candles.length - 1;

    const snapOk =
      levels.entryTime != null &&
      levels.exitTime != null &&
      Math.abs(snapTime(candles, levels.entryTime) - levels.entryTime) <=
        3 * 3600 &&
      Math.abs(snapTime(candles, levels.exitTime) - levels.exitTime) <=
        3 * 3600;

    if (
      snapOk &&
      levels.entryTime &&
      levels.exitTime &&
      levels.exit != null &&
      levels.exit > 0
    ) {
      const entryT = snapTime(candles, levels.entryTime);
      const exitT = snapTime(candles, levels.exitTime);
      entryIdx = findIndex(candles, entryT);
      exitIdx = findIndex(candles, exitT);
      if (exitIdx <= entryIdx) exitIdx = Math.min(entryIdx + 1, candles.length - 1);

      const lineSeries = chart.addSeries(LineSeries, {
        color: pathColor,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      lineSeries.setData([
        { time: entryT as UTCTimestamp, value: levels.entry },
        { time: exitT as UTCTimestamp, value: levels.exit },
      ]);

      createSeriesMarkers(candleSeries, [
        {
          time: entryT as UTCTimestamp,
          position: "inBar",
          color: pathColor,
          shape: "circle",
          text: "진입",
        },
        {
          time: exitT as UTCTimestamp,
          position: "inBar",
          color: pathColor,
          shape: "circle",
          text: exitIsWin ? "TP" : "SL",
        },
      ]);
    }

    if (snapOk) {
      const span = Math.max(exitIdx - entryIdx, 8);
      const leftPad = Math.max(Math.ceil(span * 1.8), 12);
      const rightPad = Math.max(Math.ceil(span * 1.0), 8);
      const from = Math.max(0, entryIdx - leftPad);
      const to = Math.min(candles.length - 1, exitIdx + rightPad);
      chart.timeScale().setVisibleLogicalRange({
        from: from - 0.5,
        to: to + 0.5,
      });
    } else {
      chart.timeScale().fitContent();
    }

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
  }, [candles, levels, height]);

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded-md border border-zinc-200 bg-white"
      style={{ height }}
    />
  );
}
