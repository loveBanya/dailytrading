"use client";

import { useEffect, useRef } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/exchanges/klines";

export const BUY_COLOR = "#f87171";
export const SELL_COLOR = "#60a5fa";

function uniqueCandles(candles: Candle[]): Candle[] {
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const out: Candle[] = [];
  for (const candle of sorted) {
    const prev = out[out.length - 1];
    if (prev && prev.time === candle.time) {
      prev.high = Math.max(prev.high, candle.high);
      prev.low = Math.min(prev.low, candle.low);
      prev.close = candle.close;
      continue;
    }
    out.push({ ...candle });
  }
  return out;
}

function snap(candles: Candle[], t: number): number {
  let best = candles[0]!.time;
  for (const c of candles) {
    if (Math.abs(c.time - t) < Math.abs(best - t)) best = c.time;
  }
  return best;
}

function kstClock(sec: number): string {
  return new Date(sec * 1000).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function ReviewChart({
  candles,
  entry,
  exit,
  entrySec,
  exitSec,
  side,
  height = 300,
}: {
  candles: Candle[];
  entry: number;
  exit: number;
  entrySec: number;
  exitSec: number;
  side: "LONG" | "SHORT";
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || candles.length === 0) return;
    const bars = uniqueCandles(candles);

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#71717a",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "rgba(63,63,70,0.45)" },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: number) => kstClock(time),
      },
      localization: { timeFormatter: (time: number) => kstClock(time) },
      crosshair: { mode: CrosshairMode.Hidden },
      handleScroll: false,
      handleScale: false,
    });

    const entryT = snap(bars, entrySec);
    const exitT = Math.max(snap(bars, exitSec), entryT);

    const band = chart.addSeries(AreaSeries, {
      priceScaleId: "band",
      lineVisible: false,
      topColor: "rgba(255,255,255,0.07)",
      bottomColor: "rgba(255,255,255,0.07)",
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    chart.priceScale("band").applyOptions({
      visible: false,
      scaleMargins: { top: 0, bottom: 0 },
    });
    band.applyOptions({
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 1 } }),
    });
    band.setData(
      bars
        .filter((c) => c.time >= entryT && c.time <= exitT)
        .map((c) => ({ time: c.time as UTCTimestamp, value: 1 }))
    );

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#f4f4f5",
      downColor: "#52525b",
      borderUpColor: "#f4f4f5",
      borderDownColor: "#52525b",
      wickUpColor: "#a1a1aa",
      wickDownColor: "#52525b",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    series.setData(
      bars.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    series.createPriceLine({
      price: entry,
      color: "rgba(244,244,245,0.45)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
      title: "평균 진입",
    });
    series.createPriceLine({
      price: exit,
      color: "rgba(244,244,245,0.3)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
      title: "평균 청산",
    });

    const entryColor = side === "LONG" ? BUY_COLOR : SELL_COLOR;
    const exitColor = side === "LONG" ? SELL_COLOR : BUY_COLOR;
    const markers = [
      {
        time: entryT as UTCTimestamp,
        position: "atPriceMiddle" as const,
        price: entry,
        color: entryColor,
        shape: "circle" as const,
        text: "1 진입",
      },
      {
        time: exitT as UTCTimestamp,
        position: "atPriceMiddle" as const,
        price: exit,
        color: exitColor,
        shape: "circle" as const,
        text: "2 청산",
      },
    ];
    createSeriesMarkers(series, entryT === exitT ? [markers[0]!] : markers);

    const entryIdx = bars.findIndex((c) => c.time === entryT);
    const exitIdx = bars.findIndex((c) => c.time === exitT);
    const span = Math.max(exitIdx - entryIdx, 4);
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, entryIdx - span * 4) - 0.5,
      to: Math.min(bars.length - 1, exitIdx + span * 2) + 0.5,
    });

    return () => chart.remove();
  }, [candles, entry, exit, entrySec, exitSec, side]);

  return <div ref={ref} className="w-full" style={{ height }} />;
}
