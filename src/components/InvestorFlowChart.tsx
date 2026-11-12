"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type Time,
} from "lightweight-charts";
import type { FlowMarket, InvestorDay } from "@/lib/market/investor-history";

type Who = "personal" | "foreign" | "institution";
type View = "daily" | "cumulative";

const WHO: { id: Who; label: string; color: string }[] = [
  { id: "foreign", label: "외국인", color: "#38bdf8" },
  { id: "institution", label: "기관", color: "#a78bfa" },
  { id: "personal", label: "개인", color: "#fbbf24" },
];

const PERIODS = [
  { days: 22, label: "1개월" },
  { days: 66, label: "3개월" },
  { days: 130, label: "6개월" },
  { days: 250, label: "1년" },
];

function eok(n: number): string {
  const v = Math.round(n);
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toLocaleString("ko-KR")}억`;
}

function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function correlation(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 5) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

export function InvestorFlowChart() {
  const [market, setMarket] = useState<FlowMarket>("KOSPI");
  const [days, setDays] = useState(66);
  const [view, setView] = useState<View>("daily");
  const [who, setWho] = useState<Who>("foreign");
  const [rows, setRows] = useState<InvestorDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ x: number; row: InvestorDay } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ market, days: String(days) });
    void fetch(`/api/market/investor-history?${qs.toString()}`)
      .then(async (res) => {
        const data = (await res.json()) as { rows?: InvestorDay[]; error?: string };
        if (cancelled) return;
        if (!res.ok || data.error) throw new Error(data.error || "기록을 못 불러왔습니다");
        setRows(data.rows ?? []);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "기록을 못 불러왔습니다");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [market, days]);

  const stats = useMemo(
    () =>
      WHO.map((w) => {
        const buyDays = rows.filter((r) => r[w.id] > 0);
        const sellDays = rows.filter((r) => r[w.id] < 0);
        const upWhenBuy = buyDays.filter((r) => r.changePct > 0).length;
        const downWhenSell = sellDays.filter((r) => r.changePct < 0).length;
        return {
          ...w,
          total: rows.reduce((s, r) => s + r[w.id], 0),
          buyDays: buyDays.length,
          upWhenBuy,
          sellDays: sellDays.length,
          downWhenSell,
          corr: correlation(
            rows.map((r) => r[w.id]),
            rows.map((r) => r.changePct)
          ),
        };
      }),
    [rows]
  );

  useEffect(() => {
    const el = boxRef.current;
    if (!el || rows.length === 0) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#a1a1aa",
        fontSize: 11,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "rgba(63,63,70,0.35)" },
      },
      leftPriceScale: { visible: true, borderColor: "#3f3f46" },
      rightPriceScale: { borderColor: "#3f3f46" },
      timeScale: { borderColor: "#3f3f46" },
      crosshair: { mode: CrosshairMode.Hidden },
      localization: {
        priceFormatter: (p: number) =>
          Math.abs(p) >= 1000 ? Math.round(p).toLocaleString("ko-KR") : p.toFixed(0),
      },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;

    if (view === "daily") {
      const meta = WHO.find((w) => w.id === who)!;
      const bars = chart.addSeries(HistogramSeries, {
        priceScaleId: "left",
        priceLineVisible: false,
        lastValueVisible: false,
      });
      bars.setData(
        rows.map((r) => ({
          time: r.date as Time,
          value: r[who],
          color: r[who] >= 0 ? `${meta.color}cc` : "rgba(244,63,94,0.75)",
        }))
      );
    } else {
      for (const w of WHO) {
        let sum = 0;
        const line = chart.addSeries(LineSeries, {
          priceScaleId: "left",
          color: w.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        line.setData(
          rows.map((r) => {
            sum += r[w.id];
            return { time: r.date as Time, value: sum };
          })
        );
      }
    }

    const index = chart.addSeries(LineSeries, {
      priceScaleId: "right",
      color: "#f4f4f5",
      lineWidth: 2,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    index.setData(rows.map((r) => ({ time: r.date as Time, value: r.close })));
    chart.timeScale().fitContent();

    const refit = new ResizeObserver(() => chart.timeScale().fitContent());
    refit.observe(el);
    return () => {
      refit.disconnect();
      chartRef.current = null;
      chart.remove();
    };
  }, [rows, view, who]);

  function onMove(event: MouseEvent<HTMLDivElement>) {
    const box = boxRef.current;
    const chart = chartRef.current;
    if (!box || !chart || rows.length === 0) return;
    const root = box.querySelector<HTMLElement>(".tv-lightweight-charts");
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const host = box.getBoundingClientRect();
    let zoom = 1;
    for (let el: HTMLElement | null = root; el; el = el.parentElement) {
      const z = Number.parseFloat(getComputedStyle(el).zoom);
      if (Number.isFinite(z) && z > 0) zoom *= z;
    }
    const scale = root.offsetWidth > 0 ? rect.width / root.offsetWidth : 1;
    const toScreen = zoom / scale;
    // 시간 좌표는 왼쪽 가격축 오른쪽(본문)부터 센다
    const leftAxis = chart.priceScale("left").width();
    const localX = (event.clientX - rect.left * toScreen) / zoom - leftAxis;
    let best: { x: number; row: InvestorDay } | null = null;
    for (const row of rows) {
      const x = chart.timeScale().timeToCoordinate(row.date as Time);
      if (x == null) continue;
      if (!best || Math.abs(x - localX) < Math.abs(best.x - localX)) best = { x, row };
    }
    if (!best) return;
    const rootLeft = (rect.left - host.left) / scale - box.clientLeft;
    setHover({ x: rootLeft + leftAxis + best.x, row: best.row });
  }

  const chip = (on: boolean) =>
    `rounded-md border px-2.5 py-1 text-xs transition ${
      on
        ? "border-sky-500/50 bg-sky-500/15 text-sky-200"
        : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
    }`;

  return (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-zinc-200">
          투자자별 순매수와 {market === "KOSPI" ? "코스피" : "코스닥"}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {(["KOSPI", "KOSDAQ"] as const).map((m) => (
            <button key={m} type="button" className={chip(market === m)} onClick={() => setMarket(m)}>
              {m === "KOSPI" ? "코스피" : "코스닥"}
            </button>
          ))}
          <span className="mx-1 text-zinc-700">|</span>
          {PERIODS.map((p) => (
            <button key={p.days} type="button" className={chip(days === p.days)} onClick={() => setDays(p.days)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={chip(view === "daily")} onClick={() => setView("daily")}>
          일별 순매수
        </button>
        <button type="button" className={chip(view === "cumulative")} onClick={() => setView("cumulative")}>
          누적 순매수
        </button>
        {view === "daily" && (
          <>
            <span className="mx-1 text-zinc-700">|</span>
            {WHO.map((w) => (
              <button key={w.id} type="button" className={chip(who === w.id)} onClick={() => setWho(w.id)}>
                {w.label}
              </button>
            ))}
          </>
        )}
        <span className="ml-auto flex items-center gap-3 text-[11px] text-zinc-500">
          <span>
            <span className="mr-1 inline-block h-0.5 w-3 bg-zinc-100 align-middle" />
            지수(오른쪽)
          </span>
          {(view === "daily" ? WHO.filter((w) => w.id === who) : WHO).map((w) => (
            <span key={w.id}>
              <span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: w.color }} />
              {w.label}(왼쪽, 억)
            </span>
          ))}
        </span>
      </div>

      {error && <p className="text-sm text-amber-300/80">{error}</p>}
      {loading && rows.length === 0 && <p className="text-sm text-zinc-500">기록을 불러오는 중…</p>}

      <div
        ref={boxRef}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        className="relative h-[300px] w-full"
      >
        {hover && (
          <>
            <div
              className="pointer-events-none absolute top-0 z-10 h-full w-px bg-zinc-300/60"
              style={{ left: hover.x - 0.5 }}
            />
            <div
              className="pointer-events-none absolute top-1 z-20 whitespace-nowrap rounded bg-zinc-950/95 px-2 py-1 text-[11px] tabular-nums text-zinc-200"
              style={{
                left: hover.x + 8,
                transform: hover.x > 500 ? "translateX(calc(-100% - 16px))" : undefined,
              }}
            >
              <p>
                {hover.row.date} · 지수 {hover.row.close.toLocaleString("ko-KR")}{" "}
                <span className={hover.row.changePct >= 0 ? "text-emerald-300" : "text-rose-300"}>
                  {pct(hover.row.changePct)}
                </span>
              </p>
              <p>
                {WHO.map((w) => (
                  <span key={w.id} className="mr-2">
                    {w.label}{" "}
                    <span className={hover.row[w.id] >= 0 ? "text-emerald-300" : "text-rose-300"}>
                      {eok(hover.row[w.id])}
                    </span>
                  </span>
                ))}
              </p>
            </div>
          </>
        )}
      </div>

      {rows.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.id} className="rounded-lg border border-zinc-800 px-3 py-2 text-xs">
              <p className="flex items-center justify-between">
                <span className="font-medium" style={{ color: s.color }}>
                  {s.label}
                </span>
                <span className={s.total >= 0 ? "text-emerald-300" : "text-rose-300"}>
                  기간 합 {eok(s.total)}
                </span>
              </p>
              <p className="mt-1 text-zinc-400">
                순매수한 날 {s.buyDays}일 중 지수 상승{" "}
                <span className="text-zinc-100">
                  {s.buyDays ? Math.round((s.upWhenBuy / s.buyDays) * 100) : 0}%
                </span>
              </p>
              <p className="text-zinc-400">
                순매도한 날 {s.sellDays}일 중 지수 하락{" "}
                <span className="text-zinc-100">
                  {s.sellDays ? Math.round((s.downWhenSell / s.sellDays) * 100) : 0}%
                </span>
              </p>
              <p className="text-zinc-500">
                상관계수 {s.corr == null ? "—" : s.corr.toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-zinc-600">
        다음 금융 일별 자료 · 같은 날 순매수와 지수 등락을 비교합니다. 상관계수는
        1에 가까울수록 그 주체가 사는 날 지수가 오르는 편이라는 뜻이고, 인과는 아닙니다.
      </p>
    </div>
  );
}
