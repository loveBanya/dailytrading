"use client";

import { useEffect, useMemo, useState } from "react";
import {
  HEAT_ZONES,
  type AltHeat,
  type HeatPoint,
  type HeatZoneId,
} from "@/lib/market/alt-heat";

const RANGES = [
  { id: "1d", label: "오늘", ms: 0 },
  { id: "7d", label: "7일", ms: 7 * 86_400_000 },
  { id: "30d", label: "30일", ms: 30 * 86_400_000 },
  { id: "90d", label: "3개월", ms: 90 * 86_400_000 },
  { id: "180d", label: "6개월", ms: 180 * 86_400_000 },
  { id: "1y", label: "1년", ms: 365 * 86_400_000 },
  { id: "3y", label: "3년", ms: 3 * 365 * 86_400_000 },
  { id: "5y", label: "5년", ms: 5 * 365 * 86_400_000 },
  { id: "all", label: "전체", ms: Infinity },
] as const;

type RangeId = (typeof RANGES)[number]["id"];

const ZONE_CHIP: Record<HeatZoneId, string> = {
  "very-weak": "bg-indigo-500 text-white",
  weak: "bg-sky-300 text-sky-950",
  normal: "bg-zinc-300 text-zinc-800",
  hot: "bg-rose-500 text-white",
  "very-hot": "bg-rose-800 text-rose-50",
};

const ZONE_TEXT: Record<HeatZoneId, string> = {
  "very-weak": "text-indigo-300",
  weak: "text-sky-300",
  normal: "text-zinc-200",
  hot: "text-rose-400",
  "very-hot": "text-rose-300",
};

const BANDS: Array<{ id: HeatZoneId; from: number; to: number; fill: string }> = [
  { id: "very-weak", from: -200, to: -26.5, fill: "rgba(99, 102, 241, 0.28)" },
  { id: "weak", from: -26.5, to: -17, fill: "rgba(125, 211, 252, 0.22)" },
  { id: "normal", from: -17, to: 4, fill: "rgba(161, 161, 170, 0.12)" },
  { id: "hot", from: 4, to: 15, fill: "rgba(251, 113, 133, 0.22)" },
  { id: "very-hot", from: 15, to: 400, fill: "rgba(190, 18, 60, 0.28)" },
];

export function AltHeatPanel({
  btcPrice,
  btcChange,
}: {
  btcPrice?: number;
  btcChange?: number;
}) {
  const [heat, setHeat] = useState<AltHeat | null>(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState<RangeId>("1d");

  useEffect(() => {
    let cancel = false;
    void fetch("/api/market/alt-heat")
      .then(async (res) => {
        const data = (await res.json()) as AltHeat & { error?: string };
        if (!res.ok || data.error) throw new Error(data.error || "실패");
        return data;
      })
      .then((data) => {
        if (!cancel) setHeat(data);
      })
      .catch((err: unknown) => {
        if (!cancel) setError(err instanceof Error ? err.message : "알트 지표를 불러오지 못했습니다");
      });
    return () => {
      cancel = true;
    };
  }, []);

  if (error) {
    return <p className="text-sm text-amber-300/80">알트 과열 지표를 불러오지 못했습니다.</p>;
  }
  if (!heat) {
    return <p className="text-sm text-zinc-500">알트 과열 지표를 불러오는 중…</p>;
  }

  const zone = HEAT_ZONES.find((item) => item.id === heat.zone) ?? HEAT_ZONES[2];
  const btcDay = btcChange ?? heat.btcChange24h;

  return (
    <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-200">알트/BTC 150일선 괴리율</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">전체 알트 시총 ÷ 비트코인 시총</p>
          <p className={`mt-2 text-3xl font-semibold tabular-nums ${ZONE_TEXT[heat.zone]}`}>
            {zone.label}{" "}
            <span className="tabular-nums">{signed(heat.divergence, 2)}</span>
          </p>
        </div>
        <p className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] tabular-nums text-emerald-200">
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {clock(heat.updatedAt)}
        </p>
      </div>

      <Gauge value={heat.divergence} active={heat.zone} median={heat.median} />

      <div className="space-y-1.5 rounded-lg bg-zinc-900/60 px-3 py-2.5 text-[12px] leading-relaxed text-zinc-400">
        <p className="text-[11px] font-medium text-zinc-300">읽는 법</p>
        <p>{readingNow(heat, zone.label)}</p>
        <p>
          왼쪽은 알트/비트 비율이 1년 전보다 얼마나 변했는지, 오른쪽은 150일 평균선이 1년 동안
          어디로 움직였는지입니다.
        </p>
        <p>
          차트는 그날의 괴리율이고, 점선은 지금까지의 중간값입니다. BTC 오늘은 비트코인 가격, 알트
          오늘은 알트 시총의 하루 변화입니다.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat
          label="실제 알트/BTC 1년"
          value={signed(heat.actual1y, 1)}
          tone={toneOf(heat.actual1y)}
        />
        <Stat
          label="기준선(150일 평균) 1년"
          value={signed(heat.baseline1y, 1)}
          tone={toneOf(heat.baseline1y)}
        />
      </div>

      <div>
        <p className="text-sm font-medium text-zinc-200">괴리율 추이</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {RANGES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setRange(item.id)}
              className={`rounded-full border px-3 py-1 text-xs ${
                range === item.id
                  ? "border-zinc-100 bg-zinc-100 text-zinc-900"
                  : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <HeatChart heat={heat} range={range} />
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-400">
          {HEAT_ZONES.map((item) => (
            <span key={item.id} className="inline-flex items-center gap-1">
              <span className={`h-2.5 w-2.5 rounded-sm ${ZONE_CHIP[item.id]}`} />
              {item.label}
            </span>
          ))}
          <span>··· 중간값 {signed(heat.median, 0)}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="BTC 현재가" value={btcPrice != null ? Math.round(btcPrice).toLocaleString("ko-KR") : "—"} />
        <Stat label="BTC 오늘" value={signed(btcDay, 2)} tone={toneOf(btcDay)} />
        <Stat label="알트 오늘" value={signed(heat.altChange24h, 2)} tone={toneOf(heat.altChange24h)} />
      </div>
    </div>
  );
}

function Gauge({
  value,
  active,
  median,
}: {
  value: number;
  active: HeatZoneId;
  median: number;
}) {
  const left = markerLeft(value);
  return (
    <div>
      <div className="relative pt-4">
        <span
          className="absolute top-0 -translate-x-1/2 text-zinc-200"
          style={{ left: `${left}%` }}
          aria-hidden
        >
          ▼
        </span>
        <div className="grid grid-cols-5 gap-1">
          {HEAT_ZONES.map((zone) => (
            <div
              key={zone.id}
              className={`rounded-md px-1 py-1.5 text-center text-[11px] font-medium ${
                zone.id === active ? ZONE_CHIP[zone.id] : "bg-zinc-800/80 text-zinc-500"
              }`}
            >
              {zone.label}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 grid grid-cols-5 text-center text-[10px] tabular-nums text-zinc-500">
        <span>-26.5%</span>
        <span>-17%</span>
        <span>중간값 {signed(median, 0)}</span>
        <span>+4%</span>
        <span>+15%</span>
      </div>
    </div>
  );
}

function HeatChart({ heat, range }: { heat: AltHeat; range: RangeId }) {
  const points = useMemo(() => pointsFor(heat, range), [heat, range]);
  if (points.length < 2) {
    return <p className="mt-3 text-sm text-zinc-500">이 기간의 기록이 부족합니다.</p>;
  }
  const width = 640;
  const height = 220;
  const pad = { l: 36, r: 10, t: 18, b: 24 };
  const values = points.map((point) => point.v);
  let min = Math.min(...values, heat.median);
  let max = Math.max(...values, heat.median);
  const padY = Math.max(1, (max - min) * 0.12);
  min -= padY;
  max += padY;
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const xOf = (t: number) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * innerW;
  const labelX = (t: number) => Math.min(width - pad.r - 8, Math.max(pad.l + 8, xOf(t)));
  const labelAnchor = (t: number) => {
    const x = xOf(t);
    if (x < pad.l + 56) return "start";
    if (x > width - pad.r - 56) return "end";
    return "middle";
  };
  const yOf = (v: number) => pad.t + ((max - v) / Math.max(0.001, max - min)) * innerH;
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${xOf(point.t).toFixed(1)},${yOf(point.v).toFixed(1)}`)
    .join(" ");
  const last = points[points.length - 1];
  const extreme = range !== "1d" && range !== "7d" && range !== "30d";
  const hi = points.reduce((a, b) => (a.v > b.v ? a : b));
  const lo = points.reduce((a, b) => (a.v < b.v ? a : b));
  const yTicks = [max, (max + min) / 2, min];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 h-56 w-full">
      {BANDS.map((band) => {
        const top = yOf(Math.min(max, band.to));
        const bottom = yOf(Math.max(min, band.from));
        if (bottom - top < 0.5) return null;
        return (
          <rect
            key={band.id}
            x={pad.l}
            y={top}
            width={innerW}
            height={bottom - top}
            fill={band.fill}
          />
        );
      })}
      {yTicks.map((tick) => (
        <g key={tick}>
          <line
            x1={pad.l}
            x2={width - pad.r}
            y1={yOf(tick)}
            y2={yOf(tick)}
            stroke="rgba(255,255,255,0.06)"
          />
          <text x={2} y={yOf(tick) + 3} fill="#a1a1aa" fontSize="10">
            {Math.round(tick)}
          </text>
        </g>
      ))}
      <line
        x1={pad.l}
        x2={width - pad.r}
        y1={yOf(heat.median)}
        y2={yOf(heat.median)}
        stroke="#a1a1aa"
        strokeDasharray="3 4"
      />
      <path d={path} fill="none" stroke="#f4f4f5" strokeWidth="1.6" />
      <circle cx={xOf(last.t)} cy={yOf(last.v)} r="4" fill="#fb7185" stroke="#fff" strokeWidth="1" />
      {extreme && (
        <>
          <text
            x={labelX(hi.t)}
            y={Math.max(pad.t + 2, yOf(hi.v) - 8)}
            fill="#fecdd3"
            fontSize="11"
            textAnchor={labelAnchor(hi.t)}
          >
            최고 {signed(hi.v, 1)}
          </text>
          <text
            x={labelX(lo.t)}
            y={yOf(lo.v) > height * 0.72 ? yOf(lo.v) - 8 : Math.min(height - pad.b - 2, yOf(lo.v) + 14)}
            fill="#bae6fd"
            fontSize="11"
            textAnchor={labelAnchor(lo.t)}
          >
            최저 {signed(lo.v, 1)}
          </text>
        </>
      )}
      {xTicks(points, range).map((tick) => (
        <text key={tick.t} x={xOf(tick.t)} y={height - 6} fill="#a1a1aa" fontSize="10" textAnchor="middle">
          {tick.label}
        </text>
      ))}
    </svg>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "up" | "down" | "neutral";
}) {
  const color =
    tone === "up" ? "text-emerald-400" : tone === "down" ? "text-rose-400" : "text-zinc-50";
  return (
    <div className="rounded-lg bg-zinc-900/80 px-3 py-2">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function pointsFor(heat: AltHeat, range: RangeId): HeatPoint[] {
  if (range === "1d") {
    const today = seoulDay(Date.now());
    const sliced = heat.hourly.filter((point) => seoulDay(point.t) === today);
    if (sliced.length >= 2) return sliced;
    return heat.hourly.length >= 2 ? heat.hourly.slice(-12) : heat.daily.slice(-2);
  }
  const spec = RANGES.find((item) => item.id === range);
  if (!spec || spec.ms === Infinity) return heat.daily;
  const cutoff = Date.now() - spec.ms;
  const sliced = heat.daily.filter((point) => point.t >= cutoff);
  return sliced.length >= 2 ? sliced : heat.daily.slice(-2);
}

function markerLeft(value: number): number {
  const edges = [-50, -26.5, -17, 4, 15, 40];
  const clamped = Math.min(40, Math.max(-50, value));
  for (let i = 0; i < 5; i++) {
    const from = edges[i];
    const to = edges[i + 1];
    if (clamped <= to || i === 4) {
      const frac = Math.min(1, Math.max(0, (clamped - from) / (to - from)));
      return ((i + frac) / 5) * 100;
    }
  }
  return 100;
}

function xTicks(points: HeatPoint[], range: RangeId): Array<{ t: number; label: string }> {
  const count = 4;
  const out: Array<{ t: number; label: string }> = [];
  for (let i = 0; i < count; i++) {
    const point = points[Math.round(((points.length - 1) * i) / (count - 1))];
    if (!point || out.some((item) => item.t === point.t)) continue;
    out.push({ t: point.t, label: range === "1d" ? hourLabel(point.t) : dateLabel(point.t, range) });
  }
  return out;
}

function seoulDay(t: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(t);
}

function hourLabel(t: number): string {
  const hour = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    hourCycle: "h23",
  }).format(t);
  return `${hour.replace(/\D/g, "")}시`;
}

function dateLabel(t: number, range: RangeId): string {
  const date = new Date(t);
  if (range === "all" || range === "5y" || range === "3y" || range === "1y") {
    return `${date.getFullYear()}년`;
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function clock(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

function readingNow(heat: AltHeat, zoneLabel: string): string {
  const abs = Math.abs(heat.divergence).toFixed(2);
  const place =
    heat.divergence > 0.05
      ? `150일 평균보다 ${abs}% 위`
      : heat.divergence < -0.05
        ? `150일 평균보다 ${abs}% 아래`
        : "150일 평균과 거의 같은 자리";
  return `알트 시총을 비트코인 시총으로 나눈 값이 ${place}라 지금은 ${zoneLabel}입니다. 플러스가 커질수록 알트가 평소보다 달아오른 것이고, 마이너스가 깊을수록 알트 비중이 평소보다 줄어든 것입니다.`;
}

function signed(value: number | null, digits: number): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function toneOf(value: number | null): "up" | "down" | "neutral" {
  if (value == null || !Number.isFinite(value) || Math.abs(value) < 0.005) return "neutral";
  return value > 0 ? "up" : "down";
}
