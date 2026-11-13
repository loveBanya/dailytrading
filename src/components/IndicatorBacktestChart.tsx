"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  LineStyle,
  TickMarkType,
  createChart,
  createSeriesMarkers,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { BacktestTrade, Bar } from "@/lib/backtest/types";
import type { IndicatorSeries } from "@/lib/backtest/indicator-strategy";

function points(bars: Bar[], values: (number | null)[]) {
  const out: { time: UTCTimestamp; value: number }[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) continue;
    out.push({ time: bars[i].time as UTCTimestamp, value: v });
  }
  return out;
}

function kstTick(time: Time, type: TickMarkType): string {
  const sec = typeof time === "number" ? time : 0;
  const d = new Date((sec + 9 * 3600) * 1000);
  if (type === TickMarkType.Year) return String(d.getUTCFullYear());
  if (type === TickMarkType.Month || type === TickMarkType.DayOfMonth) {
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  }
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function IndicatorBacktestChart({
  bars,
  series,
  trades,
  rsiLevels,
  adxMin,
  wtLevels,
  htfLabel,
}: {
  bars: Bar[];
  series: IndicatorSeries;
  trades: BacktestTrade[];
  rsiLevels: number[];
  adxMin: number;
  /** [과매수, 과매도] */
  wtLevels: [number, number];
  /** 상위 봉 WT를 겹쳐 그릴 때 그 봉 이름 */
  htfLabel: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [wtOb, wtOs] = wtLevels;

  useEffect(() => {
    const el = ref.current;
    if (!el || bars.length === 0) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#09090b" },
        textColor: "#a1a1aa",
        fontSize: 11,
        panes: { separatorColor: "#27272a", enableResize: true },
      },
      grid: {
        vertLines: { color: "#18181b" },
        horzLines: { color: "#18181b" },
      },
      rightPriceScale: { borderColor: "#27272a" },
      timeScale: {
        borderColor: "#27272a",
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: kstTick,
      },
      localization: {
        timeFormatter: (time: Time) => {
          const sec = typeof time === "number" ? time : 0;
          return new Date(sec * 1000).toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul",
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
        },
      },
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#ef4444",
      downColor: "#3b82f6",
      borderUpColor: "#ef4444",
      borderDownColor: "#3b82f6",
      wickUpColor: "#ef4444",
      wickDownColor: "#3b82f6",
      priceLineVisible: false,
    });
    candles.setData(
      bars.map((b) => ({
        time: b.time as UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      }))
    );

    const markers: SeriesMarker<Time>[] = [];
    for (const t of trades) {
      markers.push({
        time: t.entryTime as UTCTimestamp,
        position: t.side === 1 ? "belowBar" : "aboveBar",
        color: t.side === 1 ? "#f87171" : "#60a5fa",
        shape: t.side === 1 ? "arrowUp" : "arrowDown",
        text: t.side === 1 ? "롱" : "숏",
      });
      if (t.exitTime != null) {
        markers.push({
          time: t.exitTime as UTCTimestamp,
          position: t.side === 1 ? "aboveBar" : "belowBar",
          color: t.win ? "#34d399" : t.win === false ? "#fbbf24" : "#a1a1aa",
          shape: "circle",
          size: 0.6,
        });
      }
    }
    markers.sort((a, b) => Number(a.time) - Number(b.time));
    if (markers.length) createSeriesMarkers(candles, markers);

    const line = (
      pane: number,
      values: (number | null)[],
      color: string,
      width: 1 | 2 = 1
    ): ISeriesApi<"Line"> => {
      const s = chart.addSeries(
        LineSeries,
        {
          color,
          lineWidth: width,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
        pane
      );
      s.setData(points(bars, values));
      return s;
    };

    const hist = chart.addSeries(
      HistogramSeries,
      { priceLineVisible: false, lastValueVisible: false },
      1
    );
    hist.setData(
      bars.flatMap((b, i) => {
        const v = series.hist[i];
        if (v == null || !Number.isFinite(v)) return [];
        return [
          {
            time: b.time as UTCTimestamp,
            value: v,
            color: v >= 0 ? "rgba(239,68,68,0.5)" : "rgba(59,130,246,0.5)",
          },
        ];
      })
    );
    line(1, series.macd, "#fafafa", 2);
    line(1, series.signal, "#f59e0b");

    const rsiLine = line(2, series.rsi, "#a78bfa", 2);
    line(2, series.rsiSignal, "#71717a");
    for (const level of rsiLevels) {
      rsiLine.createPriceLine({
        price: level,
        color: "#3f3f46",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
        title: "",
      });
    }

    const adxLine = line(3, series.adx, "#fafafa", 2);
    line(3, series.plus, "#ef4444");
    line(3, series.minus, "#3b82f6");
    adxLine.createPriceLine({
      price: adxMin,
      color: "#52525b",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "",
    });

    const wtGap = chart.addSeries(
      HistogramSeries,
      { priceLineVisible: false, lastValueVisible: false, color: "rgba(59,130,246,0.25)" },
      4
    );
    wtGap.setData(
      bars.flatMap((b, i) => {
        const a = series.wt1[i];
        const c = series.wt2[i];
        if (a == null || c == null || !Number.isFinite(a - c)) return [];
        return [{ time: b.time as UTCTimestamp, value: a - c }];
      })
    );
    if (htfLabel) {
      for (const [values, color] of [
        [series.htfWt1, "rgba(52,211,153,0.55)"],
        [series.htfWt2, "rgba(248,113,113,0.55)"],
      ] as const) {
        const s = chart.addSeries(
          LineSeries,
          {
            color,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          },
          4
        );
        s.setData(points(bars, values));
      }
    }
    const wt1Line = line(4, series.wt1, "#22c55e", 2);
    const wt2Line = line(4, series.wt2, "#ef4444");
    for (const level of [0, wtOb, wtOs]) {
      wt1Line.createPriceLine({
        price: level,
        color: level === 0 ? "#3f3f46" : level > 0 ? "rgba(239,68,68,0.5)" : "rgba(34,197,94,0.5)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
        title: "",
      });
    }
    const dots: SeriesMarker<Time>[] = [];
    for (let i = 1; i < bars.length; i += 1) {
      const a = series.wt1[i];
      const b = series.wt2[i];
      const pa = series.wt1[i - 1];
      const pb = series.wt2[i - 1];
      if (a == null || b == null || pa == null || pb == null) continue;
      const up = a > b && pa <= pb;
      const dn = a < b && pa >= pb;
      if (!up && !dn) continue;
      dots.push({
        time: bars[i].time as UTCTimestamp,
        position: "atPriceMiddle",
        price: b,
        color: up ? "#a3e635" : "#ef4444",
        shape: "circle",
        size: 0.5,
      });
    }
    if (dots.length) createSeriesMarkers(wt2Line, dots);

    const panes = chart.panes();
    panes[0]?.setStretchFactor(3);
    panes[1]?.setStretchFactor(1);
    panes[2]?.setStretchFactor(1);
    panes[3]?.setStretchFactor(1);
    panes[4]?.setStretchFactor(1);
    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [bars, series, trades, rsiLevels, adxMin, wtOb, wtOs, htfLabel]);

  return (
    <div className="space-y-1">
      <div ref={ref} className="h-[840px] w-full overflow-hidden rounded-lg border border-zinc-800" />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
        <span>위부터 가격 · MACD(흰=MACD, 주황=시그널) · RSI(보라, 회색=시그널) · ADX(흰) +DI(빨강) −DI(파랑)</span>
        <span>
          WT(초록=wt1, 빨강=wt2, 점=크로스{htfLabel ? `, 점선=${htfLabel} WT` : ""})
        </span>
        <span>▲▼ 진입 · ● 청산 (초록=수익, 노랑=손실) · 청산 이유는 아래 매매 목록에</span>
      </div>
    </div>
  );
}
