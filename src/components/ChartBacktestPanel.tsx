"use client";

import { useEffect, useMemo, useState } from "react";
import { BacktestChart } from "./BacktestChart";
import {
  extraIntervals,
  htfBars,
  runBacktest,
  STRATEGIES,
} from "@/lib/backtest/run";
import { toBars, type BacktestOutput, type Bar } from "@/lib/backtest/types";

const INTERVALS = [
  { id: "5", label: "5분" },
  { id: "15", label: "15분" },
  { id: "60", label: "1시간" },
  { id: "240", label: "4시간" },
];

const BAR_CHOICES = [1000, 2000, 4000];
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

const RUNNABLE: Record<string, string> = {
  "hwr/combo/high_wr_apex_signal.pine": "apex",
  "hwr/setup/high_wr_vwap_ema_signal.pine": "vwap",
  "hwr/setup/high_wr_ha_stoch_signal.pine": "ha",
  "hwr/setup/high_wr_af_signal.pine": "af",
  "hwr/setup/high_wr_macd_signal.pine": "macd",
  "hwr/setup/high_wr_hma_adx_signal.pine": "hma",
  "hwr/setup/high_wr_ursi_div_signal.pine": "ursi",
};

interface NotepadFile {
  path: string;
  name: string;
  group: string;
}

interface CandleJson {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

async function loadBars(symbol: string, interval: string, bars: number): Promise<Bar[]> {
  const params = new URLSearchParams({
    symbol,
    interval,
    bars: String(bars),
    exchange: "bybit",
  });
  const res = await fetch(`/api/klines?${params.toString()}`);
  const data = (await res.json()) as { candles?: CandleJson[]; error?: string };
  if (!res.ok || !data.candles) {
    throw new Error(data.error || "캔들을 가져오지 못했습니다.");
  }
  return toBars(data.candles);
}

function fmtTime(sec: number): string {
  return new Date(sec * 1000).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtPx(value: number): string {
  if (value >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (value >= 1) return value.toFixed(4).replace(/\.?0+$/, "");
  return value.toPrecision(4);
}

function fmtUsd(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}$${value.toFixed(2)}`;
}

export function ChartBacktestPanel() {
  const [strategyId, setStrategyId] = useState("apex");
  const [interval, setInterval] = useState("15");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [bars, setBars] = useState(2000);
  const [scalp, setScalp] = useState(false);
  const [bet, setBet] = useState(100);
  const [lev, setLev] = useState(1);
  const [feePct, setFeePct] = useState(0.04);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartBars, setChartBars] = useState<Bar[]>([]);
  const [output, setOutput] = useState<BacktestOutput | null>(null);
  const [files, setFiles] = useState<NotepadFile[]>([]);
  const [scriptPath, setScriptPath] = useState("");
  const [scriptQuery, setScriptQuery] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const strategy = STRATEGIES.find((item) => item.id === strategyId) ?? STRATEGIES[0];
  const runnableId = scriptPath ? RUNNABLE[scriptPath] : strategyId;
  const readingSource = Boolean(scriptPath) && !RUNNABLE[scriptPath];

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/notepad")
      .then(async (res) => {
        const data = (await res.json()) as { files?: NotepadFile[]; error?: string };
        if (cancelled) return;
        if (!res.ok || data.error) return;
        setFiles(data.files ?? []);
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!readingSource) {
      setSource(null);
      setSourceError(null);
      return;
    }
    const ac = new AbortController();
    setSource(null);
    setSourceError(null);
    const params = new URLSearchParams({ path: scriptPath });
    void fetch(`/api/notepad?${params.toString()}`, { signal: ac.signal })
      .then(async (res) => {
        const data = (await res.json()) as { source?: string; error?: string };
        if (ac.signal.aborted) return;
        if (!res.ok || data.error || data.source == null) {
          throw new Error(data.error || "스크립트를 읽지 못했습니다.");
        }
        setSource(data.source);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setSourceError(err instanceof Error ? err.message : "스크립트를 읽지 못했습니다.");
      });
    return () => ac.abort();
  }, [readingSource, scriptPath]);

  useEffect(() => {
    if (readingSource) {
      setOutput(null);
      setChartBars([]);
      setLoading(false);
      setError(null);
      return;
    }
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      const clean = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!clean.endsWith("USDT")) {
        setError("심볼은 BTCUSDT 처럼 USDT 무기한으로 적습니다.");
        return;
      }
      setLoading(true);
      setError(null);
      const extras = extraIntervals(runnableId, interval);
      Promise.all([
        loadBars(clean, interval, bars),
        ...extras.map((htf) => loadBars(clean, htf, htfBars(interval, bars, htf))),
      ])
        .then((packs) => {
          if (ac.signal.aborted) return;
          const chart = packs[0];
          const extra: Record<string, Bar[]> = {};
          extras.forEach((htf, index) => {
            extra[htf] = packs[index + 1];
          });
          const result = runBacktest({
            id: runnableId,
            interval,
            chart,
            extra,
            scalp,
            money: {
              bet: Number.isFinite(bet) && bet > 0 ? bet : 100,
              lev: Number.isFinite(lev) && lev > 0 ? lev : 1,
              feePct: Number.isFinite(feePct) && feePct >= 0 ? feePct : 0,
            },
          });
          setChartBars(chart);
          setOutput(result);
        })
        .catch((err: unknown) => {
          if (ac.signal.aborted) return;
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (!ac.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [readingSource, runnableId, interval, symbol, bars, scalp, bet, lev, feePct]);

  const summary = useMemo(() => {
    const trades = output?.trades ?? [];
    const closed = trades.filter((trade) => trade.exitTime != null);
    const wins = closed.filter((trade) => trade.win === true).length;
    const losses = closed.filter((trade) => trade.win === false).length;
    const be = closed.filter((trade) => trade.win == null).length;
    const decided = wins + losses;
    let equity = 0;
    let peak = 0;
    let dd = 0;
    let sumR = 0;
    let sumUsd = 0;
    for (const trade of closed) {
      sumR += trade.r ?? 0;
      sumUsd += trade.usd ?? 0;
      equity += trade.usd ?? 0;
      peak = Math.max(peak, equity);
      dd = Math.min(dd, equity - peak);
    }
    return {
      closed: closed.length,
      open: trades.length - closed.length,
      wins,
      losses,
      be,
      wr: decided > 0 ? (wins / decided) * 100 : null,
      sumR,
      sumUsd,
      dd,
    };
  }, [output]);

  const groups = useMemo(() => {
    const names = new Set(files.map((file) => file.group));
    return [...names].sort((a, b) => a.localeCompare(b, "ko"));
  }, [files]);

  const rows = [...(output?.trades ?? [])].reverse().slice(0, 40);

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-zinc-400">
        메모장의 스크립트를 모두 불러 둡니다. 체결 규칙을 이 화면에 옮겨 둔
        시그널은 과거 봉으로 손익을 계산하고, 나머지는 원문을 보여 줍니다. 수수료는
        편도 기준으로 진입과 청산에 각각 한 번 빼며, 0으로 두면 수수료 전
        금액입니다. 과거 결과이고 앞으로의 수익이 아닙니다.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-64 flex-1 text-xs text-zinc-500">
          메모장 스크립트 {files.length > 0 ? `(${files.length})` : ""}
          <input
            value={scriptQuery}
            onChange={(event) => setScriptQuery(event.target.value)}
            placeholder="이름 검색"
            className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
          />
          <select
            value={scriptPath}
            onChange={(event) => {
              const next = event.target.value;
              setScriptPath(next);
              const mapped = RUNNABLE[next];
              if (mapped) {
                setStrategyId(mapped);
                const found = STRATEGIES.find((item) => item.id === mapped);
                if (found) setInterval(found.interval);
              }
            }}
            size={8}
            className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
          >
            <option value="">백테스트 시그널만 보기</option>
            {groups.map((group) => (
              <optgroup key={group} label={group}>
                {files
                  .filter((file) => file.group === group)
                  .filter((file) => {
                    const q = scriptQuery.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      file.name.toLowerCase().includes(q) ||
                      file.path.toLowerCase().includes(q)
                    );
                  })
                  .map((file) => (
                    <option key={file.path} value={file.path}>
                      {file.name}
                      {RUNNABLE[file.path] ? " · 백테스트" : ""}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-zinc-500">
          시그널
          <select
            value={strategyId}
            onChange={(event) => {
              const next = event.target.value;
              setScriptPath("");
              setStrategyId(next);
              const found = STRATEGIES.find((item) => item.id === next);
              if (found) setInterval(found.interval);
            }}
            className="mt-1 block rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
          >
            {STRATEGIES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-500">
          심볼
          <input
            value={symbol}
            onChange={(event) => setSymbol(event.target.value.toUpperCase())}
            className="mt-1 block w-32 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
          />
        </label>
        {SYMBOLS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setSymbol(item)}
            className={`rounded-md border px-2.5 py-1.5 text-xs ${
              symbol === item
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                : "border-zinc-700 text-zinc-400"
            }`}
          >
            {item.replace("USDT", "")}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {INTERVALS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setInterval(item.id)}
            className={`rounded-md border px-3 py-1.5 text-xs ${
              interval === item.id
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                : "border-zinc-700 text-zinc-400"
            }`}
          >
            {item.label}
          </button>
        ))}
        {BAR_CHOICES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setBars(item)}
            className={`rounded-md border px-3 py-1.5 text-xs ${
              bars === item
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                : "border-zinc-700 text-zinc-400"
            }`}
          >
            {item.toLocaleString()}봉
          </button>
        ))}
        {strategyId === "apex" && (
          <button
            type="button"
            onClick={() => setScalp((value) => !value)}
            className={`rounded-md border px-3 py-1.5 text-xs ${
              scalp
                ? "border-amber-500/50 bg-amber-500/10 text-amber-200"
                : "border-zinc-700 text-zinc-400"
            }`}
          >
            알트 단타 {scalp ? "켜짐" : "꺼짐"}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-zinc-500">
          진입 금액 $
          <input
            type="number"
            min={1}
            value={bet}
            onChange={(event) => setBet(Number(event.target.value))}
            className="mt-1 block w-24 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
          />
        </label>
        <label className="text-xs text-zinc-500">
          배율
          <input
            type="number"
            min={1}
            step={0.5}
            value={lev}
            onChange={(event) => setLev(Number(event.target.value))}
            className="mt-1 block w-20 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
          />
        </label>
        <label className="text-xs text-zinc-500">
          수수료 % 편도
          <input
            type="number"
            min={0}
            step={0.01}
            value={feePct}
            onChange={(event) => setFeePct(Number(event.target.value))}
            className="mt-1 block w-24 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
          />
        </label>
      </div>

      <p className="text-sm text-zinc-300">
        {readingSource
          ? "이 스크립트는 원문으로 불러 왔습니다. 체결 규칙을 이 화면에 옮기지 않아 손익은 계산하지 않습니다."
          : strategy.blurb}
      </p>
      {readingSource && sourceError && (
        <p className="text-sm text-rose-300">{sourceError}</p>
      )}
      {readingSource && source && (
        <pre className="max-h-[32rem] overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-300">
          {source}
        </pre>
      )}
      {readingSource && !source && !sourceError && (
        <p className="text-sm text-zinc-400">스크립트를 읽는 중…</p>
      )}
      {!readingSource && output?.note && (
        <p className="text-xs text-zinc-500">{output.note}</p>
      )}
      {!readingSource && loading && (
        <p className="text-sm text-zinc-400">봉을 가져와 계산하는 중…</p>
      )}
      {!readingSource && error && <p className="text-sm text-rose-300">{error}</p>}

      {!readingSource && output && !error && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Stat label="청산" value={`${summary.closed}건`} sub={summary.open > 0 ? `진행 ${summary.open}` : "진행 없음"} />
            <Stat
              label="승률"
              value={summary.wr == null ? "—" : `${summary.wr.toFixed(1)}%`}
              sub={`${summary.wins}승 ${summary.losses}패${summary.be > 0 ? ` ${summary.be}본절` : ""}`}
            />
            <Stat
              label="합계 R"
              value={`${summary.sumR >= 0 ? "+" : ""}${summary.sumR.toFixed(2)}R`}
              sub="수수료 전 가격 기준"
            />
            <Stat
              label="손익"
              value={fmtUsd(summary.sumUsd)}
              sub={`$${bet} × ${lev}배`}
            />
            <Stat label="최대 낙폭" value={fmtUsd(summary.dd)} sub="청산 손익을 쌓은 곡선" />
            <Stat
              label="봉"
              value={chartBars.length.toLocaleString()}
              sub={
                chartBars.length > 1
                  ? `${fmtTime(chartBars[0].time)} – ${fmtTime(chartBars[chartBars.length - 1].time)}`
                  : "—"
              }
            />
            <Stat label="시그널" value={strategy.name} sub={INTERVALS.find((item) => item.id === interval)?.label ?? interval} />
          </div>

          {chartBars.length > 0 && (
            <BacktestChart bars={chartBars} overlays={output.overlays} trades={output.trades} />
          )}

          <div className="pretty-scroll overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="text-zinc-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">진입</th>
                  <th className="py-2 pr-3 font-medium">방향</th>
                  <th className="py-2 pr-3 font-medium">가격</th>
                  <th className="py-2 pr-3 font-medium">손절</th>
                  <th className="py-2 pr-3 font-medium">익절</th>
                  <th className="py-2 pr-3 font-medium">청산</th>
                  <th className="py-2 pr-3 font-medium">결과</th>
                  <th className="py-2 pr-3 font-medium">R</th>
                  <th className="py-2 font-medium">손익</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-4 text-zinc-500">
                      이 구간에는 진입이 없습니다.
                    </td>
                  </tr>
                )}
                {rows.map((trade, index) => (
                  <tr key={`${trade.entryTime}-${index}`} className="border-t border-zinc-800 text-zinc-200">
                    <td className="py-2 pr-3 tabular-nums">{fmtTime(trade.entryTime)}</td>
                    <td className={`py-2 pr-3 ${trade.side === 1 ? "text-rose-300" : "text-sky-300"}`}>
                      {trade.side === 1 ? "롱" : "숏"}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{fmtPx(trade.entry)}</td>
                    <td className="py-2 pr-3 tabular-nums">{fmtPx(trade.sl)}</td>
                    <td className="py-2 pr-3 tabular-nums">{fmtPx(trade.tp)}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {trade.exitTime ? fmtTime(trade.exitTime) : "진행"}
                    </td>
                    <td className="py-2 pr-3">{trade.exitReason}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {trade.r == null ? "—" : `${trade.r >= 0 ? "+" : ""}${trade.r.toFixed(2)}`}
                    </td>
                    <td
                      className={`py-2 tabular-nums ${
                        trade.usd == null ? "text-zinc-500" : trade.usd >= 0 ? "text-rose-300" : "text-sky-300"
                      }`}
                    >
                      {trade.usd == null ? "—" : fmtUsd(trade.usd)}
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

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/40 px-3 py-2">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-medium tabular-nums text-zinc-100">{value}</p>
      <p className="mt-0.5 text-[11px] text-zinc-500">{sub}</p>
    </div>
  );
}
