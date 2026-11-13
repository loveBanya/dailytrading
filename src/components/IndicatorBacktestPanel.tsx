"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { IndicatorBacktestChart } from "./IndicatorBacktestChart";
import {
  CONDITION_LABELS,
  DEFAULT_INDICATOR_CONFIG,
  compareCombos,
  computeSeries,
  enabledConditions,
  runIndicatorBacktest,
  summarize,
  type ConditionId,
  type IndicatorConfig,
  type BacktestStats,
  type HigherTf,
} from "@/lib/backtest/indicator-strategy";
import { intervalMinutes } from "@/lib/backtest/run";
import { toBars, type Bar } from "@/lib/backtest/types";

type Candle = { time: number; open: number; high: number; low: number; close: number; volume?: number };

async function loadBars(symbol: string, interval: string, bars: number, signal: AbortSignal): Promise<Bar[]> {
  const params = new URLSearchParams({ symbol, interval, bars: String(bars), exchange: "binance" });
  const res = await fetch(`/api/klines?${params.toString()}`, { signal });
  const data = (await res.json()) as { candles?: Candle[]; error?: string };
  if (!res.ok || !data.candles) throw new Error(data.error || "캔들을 가져오지 못했습니다.");
  return toBars(data.candles);
}

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "NEARUSDT", "KORUUSDT", "SOXLUSDT"];
const INTERVALS = [
  { id: "5", label: "5분" },
  { id: "15", label: "15분" },
  { id: "60", label: "1시간" },
  { id: "240", label: "4시간" },
  { id: "D", label: "일봉" },
];
const BAR_CHOICES = [1000, 2000, 4000, 8000];
const HTF_CHOICES = [
  { id: "60", label: "1시간" },
  { id: "240", label: "4시간" },
  { id: "D", label: "일봉" },
];

const allOff = (c: IndicatorConfig): IndicatorConfig => ({
  ...c,
  macd: { ...c.macd, on: false },
  rsi: { ...c.rsi, on: false },
  adx: { ...c.adx, on: false },
  di: { ...c.di, on: false },
  wt: { ...c.wt, on: false },
  wth: { ...c.wth, on: false },
});

const PRESETS: { label: string; apply: (c: IndicatorConfig) => IndicatorConfig }[] = [
  {
    label: "MACD·RSI 골든크로스 + ADX·DI",
    apply: (c) => {
      const o = allOff(c);
      return {
        ...o,
        macd: { ...o.macd, on: true },
        rsi: { ...o.rsi, on: true, mode: "signal_cross" },
        adx: { ...o.adx, on: true, min: 20 },
        di: { ...o.di, on: true, mode: "above" },
      };
    },
  },
  {
    label: "MACD·RSI 골든크로스",
    apply: (c) => {
      const o = allOff(c);
      return { ...o, macd: { ...o.macd, on: true }, rsi: { ...o.rsi, on: true, mode: "signal_cross" } };
    },
  },
  {
    label: "WT 과매도·과매수 크로스",
    apply: (c) => {
      const o = allOff(c);
      return { ...o, wt: { ...o.wt, on: true, mode: "extreme" }, exitOn: "wt" };
    },
  },
  {
    label: "WT + 상위 봉 WT (Petit 방식)",
    apply: (c) => {
      const o = allOff(c);
      return {
        ...o,
        wt: { ...o.wt, on: true, mode: "extreme" },
        wth: { ...o.wth, on: true, mode: "state" },
        exitOn: "wt",
      };
    },
  },
  {
    label: "WT + MACD",
    apply: (c) => {
      const o = allOff(c);
      return { ...o, wt: { ...o.wt, on: true }, macd: { ...o.macd, on: true } };
    },
  },
  {
    label: "MACD + ADX·DI 추세",
    apply: (c) => {
      const o = allOff(c);
      return {
        ...o,
        macd: { ...o.macd, on: true },
        adx: { ...o.adx, on: true, min: 20 },
        di: { ...o.di, on: true, mode: "above" },
      };
    },
  },
  {
    label: "DI 골든크로스 + ADX",
    apply: (c) => {
      const o = allOff(c);
      return { ...o, adx: { ...o.adx, on: true, min: 20 }, di: { ...o.di, on: true, mode: "cross" } };
    },
  },
];

function fmtTime(sec: number): string {
  return new Date(sec * 1000).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtPx(v: number): string {
  if (!Number.isFinite(v) || v === 0) return "—";
  if (v >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (v >= 1) return v.toFixed(4).replace(/\.?0+$/, "");
  return v.toPrecision(4);
}

function fmtUsd(v: number): string {
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
}

function fmtR(v: number | null): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}R`;
}

function fmtPf(v: number | null): string {
  if (v == null) return "—";
  return Number.isFinite(v) ? v.toFixed(2) : "∞";
}

function tone(v: number): string {
  return v > 0 ? "text-red-400" : v < 0 ? "text-blue-400" : "text-zinc-300";
}

export function IndicatorBacktestPanel() {
  const [config, setConfig] = useState<IndicatorConfig>(DEFAULT_INDICATOR_CONFIG);
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [symbolInput, setSymbolInput] = useState("BTCUSDT");
  const [interval, setInterval] = useState("15");
  const [barCount, setBarCount] = useState(4000);
  const [bet, setBet] = useState(100);
  const [lev, setLev] = useState(1);
  const [feePct, setFeePct] = useState(0.04);
  const [bars, setBars] = useState<Bar[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [htf, setHtf] = useState<{ key: string; bars: Bar[] } | null>(null);
  const [htfError, setHtfError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      loadBars(symbol, interval, barCount, ac.signal)
        .then(setBars)
        .catch((err: unknown) => {
          if (ac.signal.aborted) return;
          setBars([]);
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (!ac.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [symbol, interval, barCount]);

  const chartMin = intervalMinutes(interval);
  const htfMin = intervalMinutes(config.wth.tf);
  const htfValid = htfMin > chartMin;
  const htfKey = config.wth.on && htfValid ? `${symbol}|${config.wth.tf}|${barCount}|${interval}` : "";

  useEffect(() => {
    if (!htfKey) return;
    const ac = new AbortController();
    const [sym, tf] = htfKey.split("|");
    const count = Math.min(8000, Math.ceil((barCount * chartMin) / htfMin) + 200);
    const timer = window.setTimeout(() => {
      setHtfError(null);
      loadBars(sym, tf, count, ac.signal)
        .then((b) => setHtf({ key: htfKey, bars: b }))
        .catch((err: unknown) => {
          if (ac.signal.aborted) return;
          setHtfError(err instanceof Error ? err.message : String(err));
        });
    }, 200);
    return () => {
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [htfKey, barCount, chartMin, htfMin]);

  const higher: HigherTf | null = useMemo(
    () =>
      htfKey && htf?.key === htfKey
        ? { bars: htf.bars, sec: htfMin * 60, chartSec: chartMin * 60 }
        : null,
    [htfKey, htf, htfMin, chartMin]
  );

  const money = useMemo(
    () => ({
      bet: bet > 0 ? bet : 100,
      lev: lev > 0 ? lev : 1,
      feePct: feePct >= 0 ? feePct : 0,
    }),
    [bet, lev, feePct]
  );
  const series = useMemo(() => computeSeries(bars, config, higher), [bars, config, higher]);
  const conditions = enabledConditions(config);
  const conditionKey = conditions.join("+");
  const trades = useMemo(
    () => runIndicatorBacktest(bars, series, config, enabledConditions(config), money),
    [bars, series, config, money]
  );
  const stats = summarize(trades);
  const combos = useMemo(
    () =>
      compareCombos(bars, series, config, money, higher != null).sort(
        (a, b) =>
          Number(b.stats.closed > 0) - Number(a.stats.closed > 0) || b.stats.sumR - a.stats.sumR
      ),
    [bars, series, config, money, higher]
  );
  const rsiLevels = useMemo(() => {
    if (config.rsi.mode === "level_cross") {
      return [...new Set([config.rsi.level, 100 - config.rsi.level])];
    }
    if (config.rsi.mode === "zone") return [config.rsi.zoneMin, config.rsi.zoneMax];
    return [30, 70];
  }, [config.rsi.mode, config.rsi.level, config.rsi.zoneMin, config.rsi.zoneMax]);

  const holdPct =
    bars.length > 1 ? ((bars[bars.length - 1].close - bars[0].close) / bars[0].close) * 100 : null;

  const patch = <K extends "macd" | "rsi" | "adx" | "di" | "wt" | "wth">(
    key: K,
    value: Partial<IndicatorConfig[K]>
  ) => setConfig((c) => ({ ...c, [key]: { ...c[key], ...value } }));

  const applyCombo = (ids: ConditionId[]) =>
    setConfig((c) => ({
      ...c,
      macd: { ...c.macd, on: ids.includes("macd") },
      rsi: { ...c.rsi, on: ids.includes("rsi") },
      adx: { ...c.adx, on: ids.includes("adx") },
      di: { ...c.di, on: ids.includes("di") },
      wt: { ...c.wt, on: ids.includes("wt") },
      wth: { ...c.wth, on: ids.includes("wth") },
    }));

  const commitSymbol = () => {
    const clean = symbolInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!clean) return;
    const next = clean.endsWith("USDT") || clean.endsWith("USDC") ? clean : `${clean}USDT`;
    setSymbolInput(next);
    setSymbol(next);
  };

  const onlyAdx = conditions.length === 1 && conditions[0] === "adx";

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-zinc-400">
        켠 조건을 <b className="text-zinc-200">모두</b> 만족한 봉의 종가에서 신호를 보고 다음 봉
        시가에 들어갑니다. 크로스는 최근 {config.window}봉 안에 났으면 인정합니다. 숏은 모든
        조건을 거꾸로(데드크로스, RSI 하향, −DI 우위, WT 과매수 데드크로스) 봅니다. 같은 봉에서
        손절과 익절이 둘 다 닿으면 손절로 계산합니다.
      </p>

      {/* 종목·봉 */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-zinc-500">
          심볼
          <div className="mt-1 flex gap-1">
            <input
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && commitSymbol()}
              className="w-32 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
            />
            <button
              type="button"
              onClick={commitSymbol}
              className="rounded-md border border-zinc-700 px-2.5 text-xs text-zinc-300 hover:text-zinc-100"
            >
              불러오기
            </button>
          </div>
        </label>
        {SYMBOLS.map((s) => (
          <Chip
            key={s}
            on={symbol === s}
            onClick={() => {
              setSymbol(s);
              setSymbolInput(s);
            }}
          >
            {s.replace("USDT", "")}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {INTERVALS.map((it) => (
          <Chip key={it.id} on={interval === it.id} onClick={() => setInterval(it.id)}>
            {it.label}
          </Chip>
        ))}
        <span className="mx-1 h-4 w-px bg-zinc-800" />
        {BAR_CHOICES.map((n) => (
          <Chip key={n} on={barCount === n} onClick={() => setBarCount(n)}>
            {n.toLocaleString()}봉
          </Chip>
        ))}
      </div>

      {/* 프리셋 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-zinc-500">빠른 설정</span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setConfig((c) => p.apply(c))}
            className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-zinc-500"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 조건 */}
      <div className="grid gap-3 md:grid-cols-2">
        <ConditionCard
          title="MACD 골든크로스"
          on={config.macd.on}
          onToggle={() => patch("macd", { on: !config.macd.on })}
          hint="MACD선이 시그널선을 위로 뚫을 때 (숏은 아래로)"
        >
          <NumField label="빠른" value={config.macd.fast} onChange={(v) => patch("macd", { fast: v })} />
          <NumField label="느린" value={config.macd.slow} onChange={(v) => patch("macd", { slow: v })} />
          <NumField label="시그널" value={config.macd.signal} onChange={(v) => patch("macd", { signal: v })} />
          <Toggle
            on={config.macd.zeroFilter}
            onClick={() => patch("macd", { zeroFilter: !config.macd.zeroFilter })}
          >
            0선 아래 크로스만
          </Toggle>
        </ConditionCard>

        <ConditionCard
          title="RSI"
          on={config.rsi.on}
          onToggle={() => patch("rsi", { on: !config.rsi.on })}
          hint={
            config.rsi.mode === "signal_cross"
              ? "RSI가 자기 이평(시그널)을 위로 뚫을 때"
              : config.rsi.mode === "level_cross"
                ? `RSI가 ${config.rsi.level}을 위로 뚫을 때 (숏은 ${100 - config.rsi.level} 아래로)`
                : `RSI가 ${config.rsi.zoneMin}~${config.rsi.zoneMax} 안에 있을 때`
          }
        >
          <NumField label="기간" value={config.rsi.length} onChange={(v) => patch("rsi", { length: v })} />
          <div className="flex gap-1">
            {(
              [
                ["level_cross", "레벨 돌파"],
                ["signal_cross", "시그널 골든크로스"],
                ["zone", "구간"],
              ] as const
            ).map(([id, label]) => (
              <Chip key={id} on={config.rsi.mode === id} onClick={() => patch("rsi", { mode: id })}>
                {label}
              </Chip>
            ))}
          </div>
          {config.rsi.mode === "level_cross" && (
            <NumField label="레벨" value={config.rsi.level} onChange={(v) => patch("rsi", { level: v })} />
          )}
          {config.rsi.mode === "signal_cross" && (
            <NumField
              label="시그널 기간"
              value={config.rsi.signalLength}
              onChange={(v) => patch("rsi", { signalLength: v })}
            />
          )}
          {config.rsi.mode === "zone" && (
            <>
              <NumField label="최소" value={config.rsi.zoneMin} onChange={(v) => patch("rsi", { zoneMin: v })} />
              <NumField label="최대" value={config.rsi.zoneMax} onChange={(v) => patch("rsi", { zoneMax: v })} />
            </>
          )}
        </ConditionCard>

        <ConditionCard
          title="ADX (추세 세기)"
          on={config.adx.on}
          onToggle={() => patch("adx", { on: !config.adx.on })}
          hint={`ADX가 ${config.adx.min} 이상이면 추세가 있다고 봄. 방향은 없어서 다른 조건과 같이 씀`}
        >
          <NumField label="기간" value={config.adx.length} onChange={(v) => patch("adx", { length: v })} />
          <NumField label="최소" value={config.adx.min} onChange={(v) => patch("adx", { min: v })} />
          <Toggle on={config.adx.rising} onClick={() => patch("adx", { rising: !config.adx.rising })}>
            ADX 올라가는 중일 때만
          </Toggle>
        </ConditionCard>

        <ConditionCard
          title="DI (+DI / −DI)"
          on={config.di.on}
          onToggle={() => patch("di", { on: !config.di.on })}
          hint={
            config.di.mode === "above"
              ? "+DI가 −DI 위에 있을 때 (숏은 반대)"
              : "+DI가 −DI를 위로 뚫을 때 (DI 골든크로스)"
          }
        >
          <div className="flex gap-1">
            <Chip on={config.di.mode === "above"} onClick={() => patch("di", { mode: "above" })}>
              +DI 우위
            </Chip>
            <Chip on={config.di.mode === "cross"} onClick={() => patch("di", { mode: "cross" })}>
              DI 골든크로스
            </Chip>
          </div>
          <span className="text-[11px] text-zinc-500">기간은 ADX와 같이 씁니다</span>
        </ConditionCard>

        <ConditionCard
          title="WaveTrend 크로스 (WT_CROSS_LB)"
          on={config.wt.on}
          onToggle={() => patch("wt", { on: !config.wt.on })}
          hint={
            config.wt.mode === "extreme"
              ? `과매도(${config.wt.os} 이하)에서 난 골든크로스만 롱, 과매수(+${config.wt.ob} 이상)에서 난 데드크로스만 숏. 역추세용`
              : "wt1이 wt2를 위로 뚫으면 롱, 아래로 뚫으면 숏 (위치 상관없이)"
          }
        >
          <div className="flex gap-1">
            <Chip on={config.wt.mode === "extreme"} onClick={() => patch("wt", { mode: "extreme" })}>
              과매도·과매수 크로스
            </Chip>
            <Chip on={config.wt.mode === "any"} onClick={() => patch("wt", { mode: "any" })}>
              모든 크로스
            </Chip>
          </div>
          <NumField label="Channel" value={config.wt.n1} onChange={(v) => patch("wt", { n1: v })} />
          <NumField label="Average" value={config.wt.n2} onChange={(v) => patch("wt", { n2: v })} />
          <NumField label="과매도" value={config.wt.os} onChange={(v) => patch("wt", { os: v })} />
          <NumField label="과매수" value={config.wt.ob} onChange={(v) => patch("wt", { ob: v })} />
        </ConditionCard>

        <ConditionCard
          title="상위 봉 WaveTrend"
          on={config.wth.on}
          onToggle={() => patch("wth", { on: !config.wth.on })}
          hint={
            config.wth.mode === "state"
              ? "상위 봉에서 wt1이 wt2 위(롱)·아래(숏)일 때만. 15분 신호를 1시간이 막지 않는지 확인"
              : "상위 봉에서도 같은 방향 크로스가 났을 때만 (WT 크로스 설정을 같이 씀)"
          }
        >
          <div className="flex gap-1">
            {HTF_CHOICES.map((it) => (
              <Chip key={it.id} on={config.wth.tf === it.id} onClick={() => patch("wth", { tf: it.id })}>
                {it.label}
              </Chip>
            ))}
          </div>
          <div className="flex gap-1">
            <Chip on={config.wth.mode === "state"} onClick={() => patch("wth", { mode: "state" })}>
              같은 방향
            </Chip>
            <Chip on={config.wth.mode === "cross"} onClick={() => patch("wth", { mode: "cross" })}>
              크로스
            </Chip>
          </div>
          <span className="text-[11px] text-zinc-500">
            닫힌 상위 봉 값만 씁니다. 길이·레벨은 위 WT와 같습니다
          </span>
        </ConditionCard>
      </div>

      {/* 진입·청산·자금 */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
        <div>
          <p className="mb-1 text-xs text-zinc-500">방향</p>
          <div className="flex gap-1">
            {(
              [
                ["long", "롱"],
                ["short", "숏"],
                ["both", "양방향"],
              ] as const
            ).map(([id, label]) => (
              <Chip key={id} on={config.side === id} onClick={() => setConfig((c) => ({ ...c, side: id }))}>
                {label}
              </Chip>
            ))}
          </div>
        </div>
        <NumField
          label="크로스 인정 봉"
          value={config.window}
          onChange={(v) => setConfig((c) => ({ ...c, window: Math.max(1, Math.round(v)) }))}
        />
        <div>
          <p className="mb-1 text-xs text-zinc-500">손절</p>
          <div className="flex items-center gap-1">
            <Chip
              on={config.stop.mode === "atr"}
              onClick={() => setConfig((c) => ({ ...c, stop: { ...c.stop, mode: "atr" } }))}
            >
              ATR ×
            </Chip>
            <Chip
              on={config.stop.mode === "pct"}
              onClick={() => setConfig((c) => ({ ...c, stop: { ...c.stop, mode: "pct" } }))}
            >
              %
            </Chip>
            <input
              type="number"
              step={0.1}
              value={config.stop.mode === "atr" ? config.stop.atrMult : config.stop.pct}
              onChange={(e) => {
                const v = Number(e.target.value);
                setConfig((c) => ({
                  ...c,
                  stop: c.stop.mode === "atr" ? { ...c.stop, atrMult: v } : { ...c.stop, pct: v },
                }));
              }}
              className="w-16 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
            />
          </div>
        </div>
        <NumField
          label="익절 R (0=없음)"
          step={0.5}
          value={config.targetR}
          onChange={(v) => setConfig((c) => ({ ...c, targetR: Math.max(0, v) }))}
        />
        <NumField
          label="최대 보유 봉 (0=무제한)"
          value={config.maxBars}
          onChange={(v) => setConfig((c) => ({ ...c, maxBars: Math.max(0, Math.round(v)) }))}
        />
        <div>
          <p className="mb-1 text-xs text-zinc-500">반대 크로스에 청산</p>
          <div className="flex gap-1">
            {(
              [
                ["macd", "MACD"],
                ["wt", "WT"],
                ["none", "안 함"],
              ] as const
            ).map(([id, label]) => (
              <Chip key={id} on={config.exitOn === id} onClick={() => setConfig((c) => ({ ...c, exitOn: id }))}>
                {label}
              </Chip>
            ))}
          </div>
        </div>
        <span className="mx-1 h-8 w-px bg-zinc-800" />
        <NumField label="진입 금액 $" value={bet} onChange={setBet} />
        <NumField label="배율" step={0.5} value={lev} onChange={setLev} />
        <NumField label="수수료 % 편도" step={0.01} value={feePct} onChange={setFeePct} />
      </div>

      {loading && <p className="text-sm text-zinc-400">봉을 불러오는 중…</p>}
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {conditions.length === 0 && (
        <p className="text-sm text-amber-300">조건을 하나 이상 켜 주세요.</p>
      )}
      {config.wth.on && !htfValid && (
        <p className="text-sm text-amber-300">
          상위 봉 WT는 차트 봉보다 긴 봉을 골라야 합니다. 지금은 조건을 채울 수 없습니다.
        </p>
      )}
      {config.wth.on && htfValid && !higher && !htfError && (
        <p className="text-sm text-zinc-400">상위 봉을 불러오는 중…</p>
      )}
      {config.wth.on && htfError && <p className="text-sm text-rose-300">상위 봉: {htfError}</p>}
      {onlyAdx && (
        <p className="text-sm text-amber-300">
          ADX만으로는 방향이 없어서 늘 롱으로만 들어갑니다. MACD나 DI를 같이 켜 주세요.
        </p>
      )}

      {bars.length > 0 && !error && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <Stat label="매매" value={`${stats.closed}건`} sub={`롱 ${stats.longs} · 숏 ${stats.shorts}${stats.open ? ` · 진행 ${stats.open}` : ""}`} />
            <Stat
              label="승률"
              value={stats.winRate == null ? "—" : `${stats.winRate.toFixed(1)}%`}
              sub={`${stats.wins}승 ${stats.losses}패`}
            />
            <Stat label="매매당 평균" value={fmtR(stats.avgR)} sub={`합계 ${fmtR(stats.sumR)}`} tone={tone(stats.avgR ?? 0)} />
            <Stat label="손익" value={fmtUsd(stats.sumUsd)} sub={`$${money.bet} × ${money.lev}배`} tone={tone(stats.sumUsd)} />
            <Stat label="손익비 (PF)" value={fmtPf(stats.profitFactor)} sub="총수익 ÷ 총손실" />
            <Stat
              label="평균 수익 / 손실"
              value={`${stats.avgWinUsd == null ? "—" : `$${stats.avgWinUsd.toFixed(2)}`} / ${stats.avgLossUsd == null ? "—" : `$${stats.avgLossUsd.toFixed(2)}`}`}
              sub={`최장 연패 ${stats.worstStreak}`}
            />
            <Stat label="최대 낙폭" value={fmtUsd(stats.maxDrawdown)} sub="손익 곡선 고점 대비" />
            <Stat
              label="그냥 들고 있었으면"
              value={holdPct == null ? "—" : `${holdPct >= 0 ? "+" : ""}${holdPct.toFixed(1)}%`}
              sub={`${fmtTime(bars[0].time)} ~`}
              tone={tone(holdPct ?? 0)}
            />
          </div>

          <IndicatorBacktestChart
            bars={bars}
            series={series}
            trades={trades}
            rsiLevels={rsiLevels}
            adxMin={config.adx.min}
            wtLevels={[config.wt.ob, config.wt.os]}
            htfLabel={higher ? HTF_CHOICES.find((h) => h.id === config.wth.tf)?.label ?? null : null}
          />

          <ComboTable combos={combos} current={conditionKey} onApply={applyCombo} />

          <div className="pretty-scroll overflow-x-auto">
            <p className="mb-1 text-xs text-zinc-500">
              최근 매매 {Math.min(trades.length, 50)}건 (전체 {trades.length}건)
            </p>
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="text-zinc-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">진입</th>
                  <th className="py-2 pr-3 font-medium">방향</th>
                  <th className="py-2 pr-3 font-medium">진입가</th>
                  <th className="py-2 pr-3 font-medium">손절</th>
                  <th className="py-2 pr-3 font-medium">익절</th>
                  <th className="py-2 pr-3 font-medium">청산</th>
                  <th className="py-2 pr-3 font-medium">결과</th>
                  <th className="py-2 pr-3 font-medium">R</th>
                  <th className="py-2 font-medium">손익</th>
                </tr>
              </thead>
              <tbody>
                {trades.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-4 text-zinc-500">
                      이 구간에는 조건을 모두 채운 진입이 없습니다.
                    </td>
                  </tr>
                )}
                {[...trades]
                  .reverse()
                  .slice(0, 50)
                  .map((t) => (
                    <tr key={`${t.entryTime}-${t.side}`} className="border-t border-zinc-800 text-zinc-200">
                      <td className="py-2 pr-3 tabular-nums">{fmtTime(t.entryTime)}</td>
                      <td className={`py-2 pr-3 ${t.side === 1 ? "text-red-400" : "text-blue-400"}`}>
                        {t.side === 1 ? "롱" : "숏"}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{fmtPx(t.entry)}</td>
                      <td className="py-2 pr-3 tabular-nums">{fmtPx(t.sl)}</td>
                      <td className="py-2 pr-3 tabular-nums">{fmtPx(t.tp)}</td>
                      <td className="py-2 pr-3 tabular-nums">{t.exitTime ? fmtTime(t.exitTime) : "진행"}</td>
                      <td className="py-2 pr-3">{t.exitReason}</td>
                      <td className={`py-2 pr-3 tabular-nums ${tone(t.r ?? 0)}`}>{fmtR(t.r)}</td>
                      <td className={`py-2 tabular-nums ${tone(t.usd ?? 0)}`}>
                        {t.usd == null ? "—" : fmtUsd(t.usd)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function ComboTable({
  combos,
  current,
  onApply,
}: {
  combos: { conditions: ConditionId[]; stats: BacktestStats }[];
  current: string;
  onApply: (ids: ConditionId[]) => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
      <p className="text-sm font-medium text-zinc-100">조건 조합 비교</p>
      <p className="mt-0.5 text-xs text-zinc-500">
        위 설정(기간·레벨·손절·익절)을 그대로 두고 조건 조합만 바꿔 같은 구간에 돌린 결과입니다.
        합계 R 순으로 정렬했고(매매가 없는 조합은 맨 아래), 줄을 누르면 그 조합으로 바뀝니다.
      </p>
      <div className="pretty-scroll mt-2 overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-xs">
          <thead className="text-zinc-500">
            <tr>
              <th className="py-1.5 pr-3 font-medium">조건</th>
              <th className="py-1.5 pr-3 font-medium">매매</th>
              <th className="py-1.5 pr-3 font-medium">승률</th>
              <th className="py-1.5 pr-3 font-medium">매매당</th>
              <th className="py-1.5 pr-3 font-medium">합계</th>
              <th className="py-1.5 pr-3 font-medium">PF</th>
              <th className="py-1.5 font-medium">최대 낙폭</th>
            </tr>
          </thead>
          <tbody>
            {combos.map(({ conditions, stats }) => {
              const key = conditions.join("+");
              const active = key === current;
              return (
                <tr
                  key={key}
                  onClick={() => onApply(conditions)}
                  className={`cursor-pointer border-t border-zinc-800 ${
                    active ? "bg-zinc-100/10 text-zinc-50" : "text-zinc-300 hover:bg-zinc-900"
                  }`}
                >
                  <td className="py-1.5 pr-3">
                    {conditions.map((c) => CONDITION_LABELS[c]).join(" + ")}
                    {active && <span className="ml-1.5 text-[10px] text-emerald-300">지금</span>}
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">{stats.closed}</td>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {stats.winRate == null ? "—" : `${stats.winRate.toFixed(0)}%`}
                  </td>
                  <td className={`py-1.5 pr-3 tabular-nums ${tone(stats.avgR ?? 0)}`}>{fmtR(stats.avgR)}</td>
                  <td className={`py-1.5 pr-3 tabular-nums ${tone(stats.sumR)}`}>{fmtR(stats.sumR)}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{fmtPf(stats.profitFactor)}</td>
                  <td className="py-1.5 tabular-nums">{fmtUsd(stats.maxDrawdown)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConditionCard({
  title,
  on,
  onToggle,
  hint,
  children,
}: {
  title: string;
  on: boolean;
  onToggle: () => void;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border p-3 transition ${
        on ? "border-emerald-500/40 bg-emerald-500/5" : "border-zinc-800 bg-zinc-950/40 opacity-70"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-zinc-100">{title}</p>
        <button
          type="button"
          onClick={onToggle}
          className={`rounded-full px-3 py-1 text-xs ${
            on ? "bg-emerald-500/20 text-emerald-200" : "bg-zinc-800 text-zinc-400"
          }`}
        >
          {on ? "켜짐" : "꺼짐"}
        </button>
      </div>
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">{children}</div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="text-xs text-zinc-500">
      {label}
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 block w-20 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
      />
    </label>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-xs transition ${
        on
          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
          : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-xs ${
        on ? "border-amber-500/50 bg-amber-500/10 text-amber-200" : "border-zinc-700 text-zinc-500"
      }`}
    >
      {on ? "✓ " : ""}
      {children}
    </button>
  );
}

function Stat({
  label,
  value,
  sub,
  tone: toneClass = "text-zinc-100",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className={`mt-1 text-sm font-medium tabular-nums ${toneClass}`}>{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-zinc-500">{sub}</p>
    </div>
  );
}
