"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Overlay } from "@/lib/backtest/types";
import type { Bar } from "@/lib/backtest/types";
import type { BacktestTrade } from "@/lib/backtest/types";

interface Marker {
  time: UTCTimestamp;
  position: "belowBar" | "aboveBar" | "inBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle";
  text: string;
}

export function BacktestChart({
  bars,
  overlays,
  trades,
}: {
  bars: Bar[];
  overlays: Overlay[];
  trades: BacktestTrade[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || bars.length === 0) return;

    const chart = createChart(el, {
      height: 460,
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
      rightPriceScale: { borderColor: "#e4e4e7" },
      timeScale: {
        borderColor: "#e4e4e7",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: "#a1a1aa", labelBackgroundColor: "#52525b" },
        horzLine: { color: "#a1a1aa", labelBackgroundColor: "#52525b" },
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#ef4444",
      downColor: "#3b82f6",
      borderUpColor: "#ef4444",
      borderDownColor: "#3b82f6",
      wickUpColor: "#ef4444",
      wickDownColor: "#3b82f6",
    });

    const unique: Bar[] = [];
    for (const bar of bars) {
      const prev = unique[unique.length - 1];
      if (prev && prev.time === bar.time) {
        prev.high = Math.max(prev.high, bar.high);
        prev.low = Math.min(prev.low, bar.low);
        prev.close = bar.close;
        continue;
      }
      unique.push({ ...bar });
    }

    candleSeries.setData(
      unique.map((bar) => ({
        time: bar.time as UTCTimestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      }))
    );

    for (const overlay of overlays) {
      const data: { time: UTCTimestamp; value: number }[] = [];
      for (let i = 0; i < unique.length; i += 1) {
        const value = overlay.values[i];
        if (value == null || !Number.isFinite(value)) continue;
        data.push({ time: unique[i].time as UTCTimestamp, value });
      }
      if (data.length < 2) continue;
      const line = chart.addSeries(LineSeries, {
        color: overlay.color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      line.setData(data);
    }

    const markers: Marker[] = [];
    for (const trade of trades) {
      markers.push({
        time: trade.entryTime as UTCTimestamp,
        position: trade.side === 1 ? "belowBar" : "aboveBar",
        color: trade.side === 1 ? "#ef4444" : "#3b82f6",
        shape: trade.side === 1 ? "arrowUp" : "arrowDown",
        text: trade.side === 1 ? "롱" : "숏",
      });
      if (trade.exitTime != null) {
        markers.push({
          time: trade.exitTime as UTCTimestamp,
          position: "inBar",
          color:
            trade.win === true ? "#16a34a" : trade.win === false ? "#2563eb" : "#ca8a04",
          shape: "circle",
          text: trade.exitReason,
        });
      }
    }
    markers.sort((a, b) => a.time - b.time);
    const merged: Marker[] = [];
    for (const marker of markers) {
      const prev = merged[merged.length - 1];
      if (prev && prev.time === marker.time && prev.position === marker.position) {
        prev.text = `${prev.text} · ${marker.text}`;
        continue;
      }
      merged.push({ ...marker });
    }
    if (merged.length > 0) createSeriesMarkers(candleSeries, merged);

    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [bars, overlays, trades]);

  return <div ref={containerRef} className="w-full overflow-hidden rounded-md border border-zinc-200 bg-white" />;
}
