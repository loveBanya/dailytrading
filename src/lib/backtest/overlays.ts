import { atr, ema, hma, sessionVwap, sma, supertrend } from "./indicators";
import type { Bar, Overlay } from "./types";

export interface ChartIndicatorMeta {
  id: string;
  name: string;
  blurb: string;
}

/** 차트에 바로 그릴 수 있는 지표. 백테스트 시그널과 따로 켜고 끌 수 있습니다. */
export const CHART_INDICATORS: ChartIndicatorMeta[] = [
  { id: "ema9", name: "EMA 9", blurb: "빠른 이평" },
  { id: "ema21", name: "EMA 21", blurb: "중간 이평" },
  { id: "ema50", name: "EMA 50", blurb: "중장기 이평" },
  { id: "ema200", name: "EMA 200", blurb: "큰 추세" },
  { id: "sma50", name: "SMA 50", blurb: "단순 이평" },
  { id: "sma150", name: "SMA 150", blurb: "장기 단순이평" },
  { id: "vwap", name: "VWAP", blurb: "한국시간 자정 리셋" },
  { id: "hma55", name: "HMA 55", blurb: "헐 이동평균" },
  { id: "st", name: "슈퍼트렌드", blurb: "ATR 10 · 배수 3" },
  { id: "atr_band", name: "ATR 밴드", blurb: "종가 ± ATR 1.5" },
  { id: "bb", name: "볼린저", blurb: "20 · 2σ" },
];

const COLORS: Record<string, string> = {
  ema9: "#f472b6",
  ema21: "#38bdf8",
  ema50: "#c8cdd8",
  ema200: "#fbbf24",
  sma50: "#a78bfa",
  sma150: "#818cf8",
  vwap: "#34d399",
  hma55: "#fb923c",
  st: "#e879f9",
  atrUp: "#94a3b8",
  atrDn: "#94a3b8",
  bbMid: "#94a3b8",
  bbUp: "#64748b",
  bbDn: "#64748b",
};

function stdev(values: number[], length: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = length - 1; i < values.length; i += 1) {
    let sum = 0;
    for (let k = i - length + 1; k <= i; k += 1) sum += values[k];
    const mean = sum / length;
    let varSum = 0;
    for (let k = i - length + 1; k <= i; k += 1) {
      const d = values[k] - mean;
      varSum += d * d;
    }
    out[i] = Math.sqrt(varSum / length);
  }
  return out;
}

export function buildIndicatorOverlays(
  bars: Bar[],
  ids: string[]
): Overlay[] {
  if (bars.length === 0 || ids.length === 0) return [];
  const close = bars.map((bar) => bar.close);
  const high = bars.map((bar) => bar.high);
  const low = bars.map((bar) => bar.low);
  const volume = bars.map((bar) => bar.volume);
  const times = bars.map((bar) => bar.time);
  const out: Overlay[] = [];
  const selected = new Set(ids);

  if (selected.has("ema9")) {
    out.push({ name: "EMA 9", color: COLORS.ema9, values: ema(close, 9) });
  }
  if (selected.has("ema21")) {
    out.push({ name: "EMA 21", color: COLORS.ema21, values: ema(close, 21) });
  }
  if (selected.has("ema50")) {
    out.push({ name: "EMA 50", color: COLORS.ema50, values: ema(close, 50) });
  }
  if (selected.has("ema200")) {
    out.push({
      name: "EMA 200",
      color: COLORS.ema200,
      values: ema(close, 200),
    });
  }
  if (selected.has("sma50")) {
    out.push({ name: "SMA 50", color: COLORS.sma50, values: sma(close, 50) });
  }
  if (selected.has("sma150")) {
    out.push({
      name: "SMA 150",
      color: COLORS.sma150,
      values: sma(close, 150),
    });
  }
  if (selected.has("vwap")) {
    out.push({
      name: "VWAP",
      color: COLORS.vwap,
      values: sessionVwap(high, low, close, volume, times),
    });
  }
  if (selected.has("hma55")) {
    out.push({ name: "HMA 55", color: COLORS.hma55, values: hma(close, 55) });
  }
  if (selected.has("st")) {
    const st = supertrend(high, low, close, 3, 10);
    out.push({ name: "슈퍼트렌드", color: COLORS.st, values: st.line });
  }
  if (selected.has("atr_band")) {
    const a = atr(high, low, close, 14);
    out.push({
      name: "ATR 상",
      color: COLORS.atrUp,
      values: close.map((c, i) => (a[i] != null ? c + 1.5 * a[i]! : null)),
    });
    out.push({
      name: "ATR 하",
      color: COLORS.atrDn,
      values: close.map((c, i) => (a[i] != null ? c - 1.5 * a[i]! : null)),
    });
  }
  if (selected.has("bb")) {
    const mid = sma(close, 20);
    const sd = stdev(close, 20);
    const up: (number | null)[] = mid.map((m, i) =>
      m == null || sd[i] == null ? null : m + 2 * sd[i]!
    );
    const dn: (number | null)[] = mid.map((m, i) =>
      m == null || sd[i] == null ? null : m - 2 * sd[i]!
    );
    out.push({ name: "BB 중간", color: COLORS.bbMid, values: mid });
    out.push({ name: "BB 상단", color: COLORS.bbUp, values: up });
    out.push({ name: "BB 하단", color: COLORS.bbDn, values: dn });
  }

  return out;
}

export const STRATEGY_COLORS = [
  "#34d399",
  "#38bdf8",
  "#fbbf24",
  "#f472b6",
  "#a78bfa",
  "#fb923c",
  "#e879f9",
];
