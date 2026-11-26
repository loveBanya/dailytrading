"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  createChart,
  type UTCTimestamp,
} from "lightweight-charts";
import { formatKst } from "@/lib/utils/format";
import {
  PaperTrackChart,
  type PaperChartTarget,
} from "./screener/PaperTrackChart";
import { BinanceKindBadge } from "./BinanceKindBadge";
import { ZoomSafeChartBox } from "./ZoomSafeChartBox";
import { kindOf, useBinanceKinds } from "@/hooks/useBinanceKinds";
import type {
  CopyStrategyConfig,
  IndicatorRule,
  IndicatorStrategyConfig,
  MoversPeriod,
  MoversStrategyConfig,
  PaperAccount,
  PaperFill,
  PaperPosition,
  PaperStrategy,
  PaperStrategyMode,
} from "@/lib/paper/types";

type ClosedPaperRow = {
  id: string;
  account_id: string;
  strategy_id: string | null;
  exchange: string;
  symbol: string;
  side: string;
  entry_price: number;
  opened_at: string;
  closed_at: string | null;
  close_price: number | null;
  realised_pnl: number | null;
};

type Snapshot = {
  id: string;
  account_id: string;
  equity: number;
  cash: number;
  open_pnl: number;
  taken_at: string;
};

type TickLog = {
  id: string;
  started_at: string;
  finished_at: string | null;
  ok: boolean;
  strategies_run: number;
  fills_created: number;
  message: string | null;
};

type HlTraderOpt = { id: string; label: string | null; address: string };
type MainTab = "home" | "history" | "strategies";

type StratStat = {
  id: string;
  name: string;
  mode: string | null;
  enabled: boolean | null;
  openCount: number;
  unrealized: number;
  realized: number;
  closes: number;
  wins: number;
  losses: number;
  opens: number;
};

function fmtUsd(n: number, digits = 2): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(digits)}`;
}

function fmtPx(n: number): string {
  if (!(n > 0)) return "—";
  if (n >= 1000)
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1)
    return n.toLocaleString(undefined, { maximumSignificantDigits: 6 });
  return n.toPrecision(4);
}

function shortAddr(a: string): string {
  if (a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function pnlClass(n: number): string {
  if (n > 0) return "text-emerald-400";
  if (n < 0) return "text-rose-400";
  return "text-zinc-400";
}

function signedUsd(n: number): string {
  const s = fmtUsd(n);
  if (n > 0) return `+${s.replace(/^-/, "")}`;
  return s;
}

function actionKo(a: string): string {
  if (a === "OPEN") return "진입";
  if (a === "CLOSE") return "청산";
  if (a === "INCREASE") return "추가";
  if (a === "DECREASE") return "축소";
  return a;
}

function modeKo(m: string): string {
  if (m === "movers") return "CG 신호";
  if (m === "copy") return "HL 카피";
  if (m === "indicator") return "지표";
  return m;
}

function PaperEquityChart({ points }: { points: Snapshot[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || points.length === 0) return;
    const up =
      Number(points[points.length - 1]?.equity) >= Number(points[0]?.equity);
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#71717a",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(63,63,70,0.2)" },
        horzLines: { color: "rgba(63,63,70,0.28)" },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.12, bottom: 0.08 },
      },
      timeScale: { borderVisible: false, timeVisible: true },
      crosshair: { mode: CrosshairMode.Normal },
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: up ? "#34d399" : "#f87171",
      topColor: up ? "rgba(52,211,153,0.28)" : "rgba(248,113,113,0.22)",
      bottomColor: "rgba(0,0,0,0)",
      lineWidth: 2,
      priceLineVisible: false,
    });
    const data = points.map((p) => ({
      time: Math.floor(new Date(p.taken_at).getTime() / 1000) as UTCTimestamp,
      value: Number(p.equity),
    }));
    const dedup: typeof data = [];
    for (const d of data) {
      const last = dedup[dedup.length - 1];
      if (last && last.time === d.time) last.value = d.value;
      else dedup.push(d);
    }
    series.setData(dedup);
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [points]);

  if (points.length < 2) {
    return (
      <div className="flex h-[160px] items-center justify-center text-sm text-zinc-600">
        틱이 쌓이면 곡선이 표시됩니다
      </div>
    );
  }
  return <ZoomSafeChartBox ref={ref} className="w-full" height={160} />;
}

export function PaperTradingPanel() {
  const [accounts, setAccounts] = useState<PaperAccount[]>([]);
  const [strategies, setStrategies] = useState<PaperStrategy[]>([]);
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [fills, setFills] = useState<PaperFill[]>([]);
  const [closedPositions, setClosedPositions] = useState<ClosedPaperRow[]>([]);
  const [chartTarget, setChartTarget] = useState<PaperChartTarget | null>(null);
  const [equity, setEquity] = useState<Snapshot[]>([]);
  const [ticks, setTicks] = useState<TickLog[]>([]);
  const [realizedByAccount, setRealizedByAccount] = useState<
    Record<string, number>
  >({});
  const [hlTraders, setHlTraders] = useState<HlTraderOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrationHint, setMigrationHint] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<MainTab>("home");
  const [showAdd, setShowAdd] = useState(false);
  const [showChart, setShowChart] = useState(false);

  const [mode, setMode] = useState<PaperStrategyMode>("movers");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setIntervalTf] = useState<"5m" | "15m" | "1h" | "4h">(
    "15m"
  );
  const [rule, setRule] = useState<IndicatorRule>("ema_cross");
  const [riskPct, setRiskPct] = useState(10);
  const [tp, setTp] = useState(4);
  const [sl, setSl] = useState(2);
  const [copyTraderId, setCopyTraderId] = useState("");
  const [copyScale, setCopyScale] = useState(10);
  const [moversPeriod, setMoversPeriod] = useState<MoversPeriod>("4h");
  const [moversTopN, setMoversTopN] = useState(5);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setError(null);
      setMigrationHint(null);
    }
    try {
      const [paperRes, hlRes] = await Promise.all([
        fetch("/api/paper"),
        fetch("/api/hl-traders"),
      ]);
      const paper = await paperRes.json();
      if (!paperRes.ok) {
        setMigrationHint(paper.migrationHint ?? null);
        throw new Error(paper.error || "불러오기 실패");
      }
      setAccounts(paper.accounts ?? []);
      setStrategies(paper.strategies ?? []);
      setPositions(paper.positions ?? []);
      setFills(paper.fills ?? []);
      setClosedPositions(paper.closedPositions ?? []);
      setEquity(paper.equity ?? []);
      setTicks(paper.ticks ?? []);
      setRealizedByAccount(paper.realizedByAccount ?? {});
      setAccountId((prev) => prev ?? paper.accounts?.[0]?.id ?? null);

      if (hlRes.ok) {
        const hl = await hlRes.json();
        const list = (hl.traders ?? []) as HlTraderOpt[];
        setHlTraders(list);
        setCopyTraderId((prev) => prev || list[0]?.id || "");
      }
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => void load(true), 45_000);
    return () => window.clearInterval(id);
  }, [load]);

  const account = useMemo(
    () => accounts.find((a) => a.id === accountId) ?? accounts[0] ?? null,
    [accounts, accountId]
  );

  const accountStrategies = useMemo(
    () =>
      strategies.filter((s) => s.account_id === (account?.id ?? accountId)),
    [strategies, account, accountId]
  );

  const accountPositions = useMemo(
    () =>
      positions.filter((p) => p.account_id === (account?.id ?? accountId)),
    [positions, account, accountId]
  );

  const accountFills = useMemo(
    () => fills.filter((f) => f.account_id === (account?.id ?? accountId)),
    [fills, account, accountId]
  );

  const accountEquity = useMemo(() => {
    const id = account?.id ?? accountId;
    return equity
      .filter((e) => e.account_id === id)
      .slice()
      .sort(
        (a, b) =>
          new Date(a.taken_at).getTime() - new Date(b.taken_at).getTime()
      );
  }, [equity, account, accountId]);

  const strategyNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of accountStrategies) m.set(s.id, s.name);
    return m;
  }, [accountStrategies]);

  const positionsByStrategy = useMemo(() => {
    const order = new Map<string, number>();
    accountStrategies.forEach((s, i) => order.set(s.id, i));
    const groups = new Map<string, PaperPosition[]>();
    for (const p of accountPositions) {
      const key = p.strategy_id ?? "__none__";
      const list = groups.get(key);
      if (list) list.push(p);
      else groups.set(key, [p]);
    }
    return [...groups.entries()].sort(([a], [b]) => {
      const ia = order.get(a) ?? 9999;
      const ib = order.get(b) ?? 9999;
      if (ia !== ib) return ia - ib;
      return a.localeCompare(b);
    });
  }, [accountPositions, accountStrategies]);

  const accountClosed = useMemo(
    () =>
      closedPositions.filter(
        (p) => p.account_id === (account?.id ?? accountId)
      ),
    [closedPositions, account, accountId]
  );

  const recentClosedPositions = useMemo(
    () => accountClosed.slice(0, 8),
    [accountClosed]
  );

  function chartFromOpen(p: PaperPosition): PaperChartTarget {
    const entry = Number(p.entry_price);
    const mark = Number(p.mark_price ?? entry);
    const ret =
      entry > 0
        ? p.side === "LONG"
          ? ((mark - entry) / entry) * 100
          : ((entry - mark) / entry) * 100
        : 0;
    return {
      id: p.id,
      exchange: p.exchange || "binance",
      symbol: p.symbol,
      direction: p.side,
      entry_price: entry,
      entry_at: p.opened_at,
      last_price: mark,
      ret_pct: ret,
      track_type: strategyNameById.get(p.strategy_id ?? "") ?? undefined,
      live: true,
    };
  }

  function chartFromClosed(p: ClosedPaperRow): PaperChartTarget {
    const entry = Number(p.entry_price);
    const exit = Number(p.close_price ?? entry);
    const ret =
      entry > 0
        ? p.side === "LONG"
          ? ((exit - entry) / entry) * 100
          : ((entry - exit) / entry) * 100
        : 0;
    return {
      id: p.id,
      exchange: p.exchange || "binance",
      symbol: p.symbol,
      direction: p.side,
      entry_price: entry,
      entry_at: p.opened_at,
      last_price: exit,
      ret_pct: ret,
      track_type: strategyNameById.get(p.strategy_id ?? "") ?? undefined,
      exit_at: p.closed_at,
      live: false,
    };
  }

  function toggleChart(next: PaperChartTarget) {
    setChartTarget((prev) => (prev?.id === next.id ? null : next));
  }

  const strategyStats = useMemo(() => {
    const byId = new Map<string, StratStat>();
    const ensure = (id: string): StratStat => {
      let s = byId.get(id);
      if (!s) {
        const strat = accountStrategies.find((x) => x.id === id);
        s = {
          id,
          name:
            id === "__none__"
              ? "전략 미지정"
              : (strat?.name ?? strategyNameById.get(id) ?? "삭제된 전략"),
          mode: strat?.mode ?? null,
          enabled: strat?.enabled ?? null,
          openCount: 0,
          unrealized: 0,
          realized: 0,
          closes: 0,
          wins: 0,
          losses: 0,
          opens: 0,
        };
        byId.set(id, s);
      }
      return s;
    };

    for (const s of accountStrategies) ensure(s.id);
    for (const p of accountPositions) {
      const st = ensure(p.strategy_id ?? "__none__");
      st.openCount += 1;
      st.unrealized += Number(p.unrealised_pnl ?? 0);
    }
    for (const p of accountClosed) {
      const st = ensure(p.strategy_id ?? "__none__");
      const pnl = Number(p.realised_pnl ?? 0);
      st.closes += 1;
      st.realized += pnl;
      if (pnl > 0) st.wins += 1;
      else if (pnl < 0) st.losses += 1;
    }
    for (const f of accountFills) {
      if (f.action === "OPEN") {
        ensure(f.strategy_id ?? "__none__").opens += 1;
      }
    }

    const order = new Map<string, number>();
    accountStrategies.forEach((s, i) => order.set(s.id, i));
    return [...byId.values()].sort((a, b) => {
      const ia = order.get(a.id) ?? 9999;
      const ib = order.get(b.id) ?? 9999;
      if (ia !== ib) return ia - ib;
      return a.name.localeCompare(b.name);
    });
  }, [
    accountStrategies,
    accountPositions,
    accountClosed,
    accountFills,
    strategyNameById,
  ]);

  const statsById = useMemo(() => {
    const m = new Map<string, StratStat>();
    for (const s of strategyStats) m.set(s.id, s);
    return m;
  }, [strategyStats]);

  const openPnl = useMemo(
    () =>
      accountPositions.reduce((s, p) => s + Number(p.unrealised_pnl ?? 0), 0),
    [accountPositions]
  );

  const realizedPnl = account
    ? Number(realizedByAccount[account.id] ?? 0)
    : 0;

  const totalRetPct = useMemo(() => {
    if (!account) return 0;
    const start = Number(account.starting_equity) || 1;
    return ((Number(account.equity) - start) / start) * 100;
  }, [account]);

  const kindMap = useBinanceKinds(accountPositions.map((p) => p.symbol));
  const lastTick = ticks[0] ?? null;
  const enabledCount = accountStrategies.filter((s) => s.enabled).length;

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/paper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setMigrationHint(data.migrationHint ?? null);
        throw new Error(data.error || "요청 실패");
      }
      if (data.message) setMsg(data.message);
      await load(true);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function ensureAccount(): Promise<string | null> {
    if (account?.id) return account.id;
    const data = await post({
      action: "create_account",
      name: "기본 계좌",
      startingEquity: 10_000,
    });
    const id = data?.account?.id as string | undefined;
    if (id) setAccountId(id);
    return id ?? null;
  }

  async function createStrategy() {
    const id = await ensureAccount();
    if (!id) return;

    if (mode === "indicator") {
      const config: IndicatorStrategyConfig = {
        exchange: "binance",
        symbol: symbol.trim().toUpperCase(),
        interval,
        rule,
        riskPct: riskPct / 100,
        takeProfitPct: tp,
        stopLossPct: sl,
        emaFast: 9,
        emaSlow: 21,
      };
      await post({
        action: "create_strategy",
        accountId: id,
        name: name.trim() || `${rule} ${symbol}`,
        mode: "indicator",
        config,
      });
    } else if (mode === "movers") {
      const config: MoversStrategyConfig = {
        period: moversPeriod,
        followSurge: true,
        followOi: true,
        topN: moversTopN,
        riskPct: riskPct / 100,
        takeProfitPct: tp || 4,
        stopLossPct: sl || 2,
        maxPositions: Math.max(moversTopN, 5),
      };
      await post({
        action: "create_strategy",
        accountId: id,
        name: name.trim() || `CG 신호 ${moversPeriod}`,
        mode: "movers",
        config,
      });
    } else {
      if (!copyTraderId) {
        setError("카피할 HL 트레이더를 선택하세요");
        return;
      }
      const config: CopyStrategyConfig = {
        traderId: copyTraderId,
        scale: copyScale / 100,
        maxNotional: 2000,
      };
      const tr = hlTraders.find((t) => t.id === copyTraderId);
      await post({
        action: "create_strategy",
        accountId: id,
        name:
          name.trim() ||
          `카피 ${tr?.label || shortAddr(tr?.address ?? copyTraderId)}`,
        mode: "copy",
        config,
      });
    }
    setShowAdd(false);
    setTab("strategies");
  }

  if (loading) {
    return (
      <p className="py-16 text-center text-sm text-zinc-500">불러오는 중…</p>
    );
  }

  return (
    <div className="space-y-3">
      {migrationHint && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          <p className="font-medium">모의투자 테이블이 필요합니다</p>
          <p className="mt-1 text-xs text-amber-200/80">{migrationHint}</p>
        </div>
      )}
      {error && (
        <p className="rounded-lg border border-rose-800/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}
      {msg && (
        <p className="rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          {msg}
        </p>
      )}

      {/* 요약 헤더 */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {accounts.length === 0 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void ensureAccount()}
              className="rounded-lg border border-emerald-700/60 bg-emerald-950/40 px-3 py-1.5 text-sm text-emerald-200"
            >
              계좌 만들기 ($10,000)
            </button>
          ) : (
            <select
              value={account?.id ?? ""}
              onChange={(e) => setAccountId(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          {account && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] ${
                account.status === "active"
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-zinc-800 text-zinc-500"
              }`}
            >
              {account.status === "active" ? "운영 중" : "일시정지"}
            </span>
          )}
          <span className="text-[11px] text-zinc-600">
            전략 {enabledCount}개 켜짐
            {account?.last_tick_at
              ? ` · 틱 ${formatKst(account.last_tick_at)}`
              : ""}
          </span>
          <div className="ml-auto flex gap-1.5">
            <button
              type="button"
              disabled={busy || !account}
              onClick={() =>
                void post({
                  action: "set_account_status",
                  accountId: account!.id,
                  status: account!.status === "active" ? "paused" : "active",
                })
              }
              className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-[12px] text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
            >
              {account?.status === "active" ? "정지" : "재개"}
            </button>
            <button
              type="button"
              disabled={busy || !account}
              onClick={() =>
                void post({ action: "tick", accountId: account?.id })
              }
              className="rounded-lg border border-sky-700/60 bg-sky-950/50 px-3 py-1.5 text-[12px] text-sky-200 disabled:opacity-40"
            >
              지금 갱신
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-[11px] text-zinc-500">총 자산</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums text-zinc-50">
              {account ? fmtUsd(Number(account.equity)) : "—"}
            </p>
            <p className={`text-sm tabular-nums ${pnlClass(totalRetPct)}`}>
              {totalRetPct >= 0 ? "+" : ""}
              {totalRetPct.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-[11px] text-zinc-500">실현 손익</p>
            <p
              className={`mt-0.5 text-2xl font-semibold tabular-nums ${pnlClass(realizedPnl)}`}
            >
              {signedUsd(realizedPnl)}
            </p>
            <p className="text-[11px] text-zinc-600">청산 누적</p>
          </div>
          <div>
            <p className="text-[11px] text-zinc-500">미실현</p>
            <p
              className={`mt-0.5 text-2xl font-semibold tabular-nums ${pnlClass(openPnl)}`}
            >
              {signedUsd(openPnl)}
            </p>
            <p className="text-[11px] text-zinc-600">
              포지션 {accountPositions.length}개
            </p>
          </div>
          <div>
            <p className="text-[11px] text-zinc-500">가용 현금</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums text-zinc-200">
              {account ? fmtUsd(Number(account.cash)) : "—"}
            </p>
            <p className="text-[11px] text-zinc-600">
              {lastTick
                ? lastTick.ok
                  ? "최근 틱 OK"
                  : "최근 틱 실패"
                : "틱 대기"}
            </p>
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-zinc-800 pb-px">
        {(
          [
            ["home", "현황"],
            ["history", "기록"],
            ["strategies", "전략"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              tab === id
                ? "border-emerald-500 text-emerald-300"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "home" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-200">
              보유 포지션
              <span className="ml-1.5 text-zinc-500">
                {accountPositions.length}
              </span>
            </p>
            <button
              type="button"
              onClick={() => setShowChart((v) => !v)}
              className="text-[12px] text-zinc-500 hover:text-zinc-300"
            >
              {showChart ? "차트 숨기기" : "에쿼티 차트"}
            </button>
          </div>

          {showChart && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-2">
              <PaperEquityChart points={accountEquity} />
            </div>
          )}

          {strategyStats.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-zinc-200">
                전략별 통계
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {strategyStats.map((st) => {
                  const winRate =
                    st.closes > 0 ? (st.wins / st.closes) * 100 : null;
                  const total = st.realized + st.unrealized;
                  return (
                    <div
                      key={st.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-100">
                            {st.name}
                          </p>
                          <p className="text-[11px] text-zinc-600">
                            {st.mode ? modeKo(st.mode) : "—"}
                            {st.enabled === false ? " · 꺼짐" : ""}
                            {st.enabled === true ? " · 켜짐" : ""}
                          </p>
                        </div>
                        <p
                          className={`shrink-0 text-sm font-semibold tabular-nums ${pnlClass(total)}`}
                        >
                          {signedUsd(total)}
                        </p>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                        <div className="rounded-lg bg-zinc-900/80 px-1.5 py-1.5">
                          <p className="text-[10px] text-zinc-600">실현</p>
                          <p
                            className={`text-[12px] font-medium tabular-nums ${pnlClass(st.realized)}`}
                          >
                            {signedUsd(st.realized)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-zinc-900/80 px-1.5 py-1.5">
                          <p className="text-[10px] text-zinc-600">미실현</p>
                          <p
                            className={`text-[12px] font-medium tabular-nums ${pnlClass(st.unrealized)}`}
                          >
                            {signedUsd(st.unrealized)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-zinc-900/80 px-1.5 py-1.5">
                          <p className="text-[10px] text-zinc-600">승률</p>
                          <p className="text-[12px] font-medium tabular-nums text-zinc-200">
                            {winRate == null ? "—" : `${winRate.toFixed(0)}%`}
                          </p>
                        </div>
                      </div>
                      <p className="mt-1.5 text-[11px] text-zinc-600">
                        보유 {st.openCount} · 청산 {st.closes}
                        {st.closes > 0
                          ? ` (${st.wins}승 ${st.losses}패)`
                          : ""}
                        {" · "}진입 {st.opens}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {accountPositions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-12 text-center">
              <p className="text-sm text-zinc-400">열린 포지션이 없습니다</p>
              <p className="mt-1 text-[12px] text-zinc-600">
                전략 탭에서 CG 신호·카피를 켜 두면 Cron이 진입합니다
              </p>
              <button
                type="button"
                onClick={() => setTab("strategies")}
                className="mt-3 text-sm text-emerald-400 hover:underline"
              >
                전략 보기
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {positionsByStrategy.map(([sid, list]) => {
                const name =
                  sid === "__none__"
                    ? "전략 미지정"
                    : (strategyNameById.get(sid) ?? "삭제된 전략");
                const strat = accountStrategies.find((s) => s.id === sid);
                const st = statsById.get(sid);
                const groupPnl = list.reduce(
                  (s, p) => s + Number(p.unrealised_pnl ?? 0),
                  0
                );
                const winRate =
                  st && st.closes > 0 ? (st.wins / st.closes) * 100 : null;
                return (
                  <section key={sid} className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-100">
                          {name}
                          <span className="ml-1.5 text-zinc-500">
                            {list.length}
                          </span>
                        </p>
                        <p className="text-[11px] text-zinc-600">
                          {strat ? `${modeKo(strat.mode)}${strat.enabled ? "" : " · 꺼짐"}` : null}
                          {st ? (
                            <>
                              {strat ? " · " : null}
                              실현{" "}
                              <span className={pnlClass(st.realized)}>
                                {signedUsd(st.realized)}
                              </span>
                              {winRate != null
                                ? ` · 승률 ${winRate.toFixed(0)}%`
                                : ""}
                            </>
                          ) : null}
                        </p>
                      </div>
                      <p
                        className={`shrink-0 text-sm font-medium tabular-nums ${pnlClass(groupPnl)}`}
                      >
                        {signedUsd(groupPnl)}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      {list.map((p) => {
                        const entry = Number(p.entry_price);
                        const mark = Number(p.mark_price ?? entry);
                        const u = Number(p.unrealised_pnl ?? 0);
                        const ret =
                          entry > 0
                            ? p.side === "LONG"
                              ? ((mark - entry) / entry) * 100
                              : ((entry - mark) / entry) * 100
                            : 0;
                        const selected = chartTarget?.id === p.id;
                        return (
                          <button
                            type="button"
                            key={p.id}
                            onClick={() => toggleChart(chartFromOpen(p))}
                            className={`rounded-xl border px-3 py-2.5 text-left transition ${
                              selected
                                ? "border-emerald-700/70 bg-emerald-950/30"
                                : "border-zinc-800 bg-zinc-950/50 hover:border-zinc-600"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-zinc-50">
                                  {p.symbol.replace(/USDT$/i, "")}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                  <BinanceKindBadge
                                    kind={kindOf(kindMap, p.symbol)}
                                  />
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                      p.side === "LONG"
                                        ? "bg-emerald-500/15 text-emerald-300"
                                        : "bg-rose-500/15 text-rose-300"
                                    }`}
                                  >
                                    {p.side === "LONG" ? "롱" : "숏"}
                                  </span>
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <p
                                  className={`text-sm font-semibold tabular-nums ${pnlClass(u)}`}
                                >
                                  {signedUsd(u)}
                                </p>
                                <p
                                  className={`text-[11px] tabular-nums ${pnlClass(ret)}`}
                                >
                                  {ret >= 0 ? "+" : ""}
                                  {ret.toFixed(2)}%
                                </p>
                              </div>
                            </div>
                            <p className="mt-2 truncate text-[11px] text-zinc-600">
                              {fmtPx(entry)} → {fmtPx(mark)}
                            </p>
                            <p className="truncate text-[10px] text-zinc-600">
                              진입 {formatKst(p.opened_at)}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {chartTarget && (
            <PaperTrackChart
              paper={chartTarget}
              onClose={() => setChartTarget(null)}
            />
          )}

          {recentClosedPositions.length > 0 && (
            <div className="pt-1">
              <p className="mb-2 text-sm font-medium text-zinc-200">
                최근 청산
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {recentClosedPositions.map((p) => {
                  const selected = chartTarget?.id === p.id;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => toggleChart(chartFromClosed(p))}
                      className={`rounded-xl border px-3 py-2.5 text-left transition ${
                        selected
                          ? "border-emerald-700/70 bg-emerald-950/30"
                          : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-600"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p className="truncate text-sm text-zinc-200">
                          {p.symbol.replace(/USDT$/i, "")}{" "}
                          <span
                            className={
                              p.side === "LONG"
                                ? "text-emerald-400"
                                : "text-rose-400"
                            }
                          >
                            {p.side === "LONG" ? "롱" : "숏"}
                          </span>
                        </p>
                        <p
                          className={`shrink-0 text-sm font-medium tabular-nums ${pnlClass(Number(p.realised_pnl ?? 0))}`}
                        >
                          {signedUsd(Number(p.realised_pnl ?? 0))}
                        </p>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-zinc-600">
                        {fmtPx(Number(p.entry_price))} →{" "}
                        {fmtPx(Number(p.close_price ?? p.entry_price))}
                      </p>
                      <p className="truncate text-[10px] text-zinc-600">
                        {formatKst(p.opened_at)}
                        {p.closed_at ? ` → ${formatKst(p.closed_at)}` : ""}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          {accountFills.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-500">
              체결 기록이 없습니다
            </p>
          ) : (
            <div className="pretty-scroll max-h-[480px] overflow-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="sticky top-0 bg-zinc-950 text-[11px] text-zinc-500">
                  <tr className="border-b border-zinc-800">
                    <th className="px-3 py-2 font-medium">시각</th>
                    <th className="px-3 py-2 font-medium">구분</th>
                    <th className="px-3 py-2 font-medium">종목</th>
                    <th className="px-3 py-2 font-medium">방향</th>
                    <th className="px-3 py-2 font-medium">가격</th>
                    <th className="px-3 py-2 font-medium">실현</th>
                  </tr>
                </thead>
                <tbody>
                  {accountFills.map((f) => (
                    <tr
                      key={f.id}
                      className="border-b border-zinc-900/80 text-zinc-300"
                    >
                      <td className="px-3 py-2 text-[11px] text-zinc-500">
                        {formatKst(f.observed_at)}
                      </td>
                      <td className="px-3 py-2 text-[12px]">
                        {actionKo(f.action)}
                      </td>
                      <td className="px-3 py-2">
                        {f.symbol.replace(/USDT$/i, "")}
                      </td>
                      <td
                        className={`px-3 py-2 ${
                          f.side === "LONG"
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {f.side === "LONG" ? "롱" : "숏"}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-zinc-400">
                        {fmtPx(Number(f.price))}
                      </td>
                      <td
                        className={`px-3 py-2 tabular-nums ${
                          f.realised_pnl == null
                            ? "text-zinc-600"
                            : pnlClass(Number(f.realised_pnl))
                        }`}
                      >
                        {f.realised_pnl == null
                          ? "—"
                          : signedUsd(Number(f.realised_pnl))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "strategies" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">
              켜 둔 전략만 Cron·갱신 때 실행됩니다
            </p>
            <button
              type="button"
              onClick={() => setShowAdd((v) => !v)}
              className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 px-3 py-1.5 text-[12px] text-emerald-200"
            >
              {showAdd ? "닫기" : "+ 전략 추가"}
            </button>
          </div>

          {showAdd && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="mb-3 flex flex-wrap gap-1">
                {(
                  [
                    ["movers", "CG 신호"],
                    ["copy", "HL 카피"],
                    ["indicator", "지표"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setMode(k)}
                    className={`rounded-full px-3 py-1 text-[12px] ${
                      mode === k
                        ? "bg-emerald-500/20 text-emerald-200"
                        : "bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-[11px] text-zinc-500">
                  이름 (선택)
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-200"
                  />
                </label>
                {mode === "movers" && (
                  <>
                    <label className="text-[11px] text-zinc-500">
                      기간
                      <select
                        value={moversPeriod}
                        onChange={(e) =>
                          setMoversPeriod(e.target.value as MoversPeriod)
                        }
                        className="mt-0.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-200"
                      >
                        <option value="5m">5분</option>
                        <option value="30m">30분</option>
                        <option value="4h">4시간</option>
                      </select>
                    </label>
                    <label className="text-[11px] text-zinc-500">
                      상위 몇 개
                      <input
                        type="number"
                        value={moversTopN}
                        onChange={(e) =>
                          setMoversTopN(Number(e.target.value))
                        }
                        className="mt-0.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-200"
                      />
                    </label>
                  </>
                )}
                {mode === "copy" && (
                  <label className="text-[11px] text-zinc-500 sm:col-span-2">
                    HL 트레이더
                    <select
                      value={copyTraderId}
                      onChange={(e) => setCopyTraderId(e.target.value)}
                      className="mt-0.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-200"
                    >
                      {hlTraders.length === 0 ? (
                        <option value="">없음</option>
                      ) : (
                        hlTraders.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label || shortAddr(t.address)}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                )}
                {mode === "indicator" && (
                  <>
                    <label className="text-[11px] text-zinc-500">
                      심볼
                      <input
                        value={symbol}
                        onChange={(e) => setSymbol(e.target.value)}
                        className="mt-0.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-200"
                      />
                    </label>
                    <label className="text-[11px] text-zinc-500">
                      규칙
                      <select
                        value={rule}
                        onChange={(e) =>
                          setRule(e.target.value as IndicatorRule)
                        }
                        className="mt-0.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-200"
                      >
                        <option value="ema_cross">EMA 크로스</option>
                        <option value="rsi_reclaim">RSI</option>
                        <option value="macd_cross">MACD</option>
                      </select>
                    </label>
                  </>
                )}
                <label className="text-[11px] text-zinc-500 sm:col-span-2">
                  비중% / 익절% / 손절%
                  <div className="mt-0.5 flex gap-2">
                    <input
                      type="number"
                      value={riskPct}
                      onChange={(e) => setRiskPct(Number(e.target.value))}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-200"
                    />
                    <input
                      type="number"
                      value={tp}
                      onChange={(e) => setTp(Number(e.target.value))}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-200"
                    />
                    <input
                      type="number"
                      value={sl}
                      onChange={(e) => setSl(Number(e.target.value))}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-200"
                    />
                  </div>
                </label>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void createStrategy()}
                className="mt-3 w-full rounded-lg border border-emerald-700/60 bg-emerald-950/50 py-2.5 text-sm text-emerald-200 disabled:opacity-50"
              >
                저장
              </button>
            </div>
          )}

          {accountStrategies.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-800 py-10 text-center text-sm text-zinc-500">
              전략이 없습니다. 위에서 추가하세요.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {accountStrategies.map((s) => {
                const st = statsById.get(s.id);
                const winRate =
                  st && st.closes > 0 ? (st.wins / st.closes) * 100 : null;
                return (
                <li
                  key={s.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-3"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${
                        s.enabled ? "bg-emerald-400" : "bg-zinc-600"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-zinc-100">{s.name}</p>
                      <p className="mt-0.5 text-[11px] text-zinc-500">
                        {modeKo(s.mode)}
                        {s.last_run_at
                          ? ` · ${formatKst(s.last_run_at)}`
                          : " · 미실행"}
                      </p>
                      {s.last_error ? (
                        <p className="mt-0.5 truncate text-[10px] text-rose-400">
                          {s.last_error.slice(0, 48)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {st ? (
                    <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                      <div className="rounded-md bg-zinc-900/70 px-1 py-1">
                        <p className="text-[9px] text-zinc-600">실현</p>
                        <p
                          className={`text-[11px] tabular-nums ${pnlClass(st.realized)}`}
                        >
                          {signedUsd(st.realized)}
                        </p>
                      </div>
                      <div className="rounded-md bg-zinc-900/70 px-1 py-1">
                        <p className="text-[9px] text-zinc-600">미실현</p>
                        <p
                          className={`text-[11px] tabular-nums ${pnlClass(st.unrealized)}`}
                        >
                          {signedUsd(st.unrealized)}
                        </p>
                      </div>
                      <div className="rounded-md bg-zinc-900/70 px-1 py-1">
                        <p className="text-[9px] text-zinc-600">승률</p>
                        <p className="text-[11px] tabular-nums text-zinc-300">
                          {winRate == null ? "—" : `${winRate.toFixed(0)}%`}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  <p className="mt-1.5 text-[10px] text-zinc-600">
                    보유 {st?.openCount ?? 0} · 청산 {st?.closes ?? 0}
                    {st && st.closes > 0
                      ? ` (${st.wins}승 ${st.losses}패)`
                      : ""}
                  </p>
                  <div className="mt-2 flex gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void post({
                          action: "update_strategy",
                          strategyId: s.id,
                          enabled: !s.enabled,
                        })
                      }
                      className="flex-1 rounded-lg border border-zinc-700 py-1 text-[12px] text-zinc-400"
                    >
                      {s.enabled ? "끄기" : "켜기"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void post({
                          action: "delete_strategy",
                          strategyId: s.id,
                        })
                      }
                      className="rounded-lg px-2.5 py-1 text-[12px] text-rose-400/80"
                    >
                      삭제
                    </button>
                  </div>
                </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
