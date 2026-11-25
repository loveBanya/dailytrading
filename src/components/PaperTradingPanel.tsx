"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatKst } from "@/lib/utils/format";
import type {
  CopyStrategyConfig,
  IndicatorRule,
  IndicatorStrategyConfig,
  PaperAccount,
  PaperFill,
  PaperPosition,
  PaperStrategy,
  PaperStrategyMode,
} from "@/lib/paper/types";

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

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function shortAddr(a: string): string {
  if (a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function PaperTradingPanel() {
  const [accounts, setAccounts] = useState<PaperAccount[]>([]);
  const [strategies, setStrategies] = useState<PaperStrategy[]>([]);
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [fills, setFills] = useState<PaperFill[]>([]);
  const [equity, setEquity] = useState<Snapshot[]>([]);
  const [ticks, setTicks] = useState<TickLog[]>([]);
  const [hlTraders, setHlTraders] = useState<HlTraderOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrationHint, setMigrationHint] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // 새 전략 폼
  const [mode, setMode] = useState<PaperStrategyMode>("indicator");
  const [name, setName] = useState("EMA 크로스 BTC");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setInterval] = useState<"5m" | "15m" | "1h" | "4h">("15m");
  const [rule, setRule] = useState<IndicatorRule>("ema_cross");
  const [riskPct, setRiskPct] = useState(10);
  const [tp, setTp] = useState(3);
  const [sl, setSl] = useState(1.5);
  const [copyTraderId, setCopyTraderId] = useState("");
  const [copyScale, setCopyScale] = useState(10);

  const load = useCallback(async () => {
    setError(null);
    setMigrationHint(null);
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
      setEquity(paper.equity ?? []);
      setTicks(paper.ticks ?? []);
      setAccountId((prev) => prev ?? paper.accounts?.[0]?.id ?? null);

      if (hlRes.ok) {
        const hl = await hlRes.json();
        const list = (hl.traders ?? []) as HlTraderOpt[];
        setHlTraders(list);
        setCopyTraderId((prev) => prev || list[0]?.id || "");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
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
      .reverse();
  }, [equity, account, accountId]);

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
      await load();
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
  }

  if (loading) {
    return (
      <p className="py-12 text-center text-sm text-zinc-500">불러오는 중…</p>
    );
  }

  return (
    <div className="space-y-4">
      {migrationHint && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          <p className="font-medium">모의투자 테이블이 필요합니다</p>
          <p className="mt-1 text-xs text-amber-200/80">{migrationHint}</p>
        </div>
      )}
      {error && (
        <p className="rounded border border-rose-800/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}
      {msg && (
        <p className="rounded border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          {msg}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
        <div>
          <p className="text-[11px] text-zinc-500">계좌</p>
          {accounts.length === 0 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void ensureAccount()}
              className="mt-1 rounded border border-emerald-700/60 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-950/40 disabled:opacity-50"
            >
              계좌 만들기 ($10,000)
            </button>
          ) : (
            <select
              value={account?.id ?? ""}
              onChange={(e) => setAccountId(e.target.value)}
              className="mt-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.status}
                </option>
              ))}
            </select>
          )}
        </div>
        {account && (
          <div className="text-sm text-zinc-300">
            <span className="text-zinc-500">에쿼티 </span>
            <span className="tabular-nums text-emerald-300">
              {fmtUsd(Number(account.equity))}
            </span>
            <span className="mx-2 text-zinc-700">·</span>
            <span className="text-zinc-500">현금 </span>
            <span className="tabular-nums">{fmtUsd(Number(account.cash))}</span>
            {account.last_tick_at ? (
              <span className="ml-2 text-[11px] text-zinc-600">
                틱 {formatKst(account.last_tick_at)}
              </span>
            ) : null}
          </div>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
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
            className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:text-white disabled:opacity-50"
          >
            {account?.status === "active" ? "일시정지" : "재개"}
          </button>
          <button
            type="button"
            disabled={busy || !account}
            onClick={() =>
              void post({ action: "tick", accountId: account?.id })
            }
            className="rounded border border-sky-700/60 bg-sky-950/40 px-3 py-1.5 text-sm text-sky-200 hover:bg-sky-950/70 disabled:opacity-50"
          >
            지금 틱 실행
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
          <p className="mb-2 text-sm font-medium text-zinc-200">전략 추가</p>
          <div className="mb-2 flex gap-1">
            {(
              [
                ["indicator", "지표 전략"],
                ["copy", "HL 카피"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setMode(k)}
                className={`rounded border px-2.5 py-1 text-[12px] ${
                  mode === k
                    ? "border-emerald-600/60 text-emerald-300"
                    : "border-zinc-700 text-zinc-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="mb-2 block text-[11px] text-zinc-500">
            이름
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
            />
          </label>
          {mode === "indicator" ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-zinc-500">
                심볼
                <input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
                />
              </label>
              <label className="text-[11px] text-zinc-500">
                봉
                <select
                  value={interval}
                  onChange={(e) =>
                    setInterval(e.target.value as typeof interval)
                  }
                  className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
                >
                  <option value="5m">5m</option>
                  <option value="15m">15m</option>
                  <option value="1h">1h</option>
                  <option value="4h">4h</option>
                </select>
              </label>
              <label className="col-span-2 text-[11px] text-zinc-500">
                규칙
                <select
                  value={rule}
                  onChange={(e) => setRule(e.target.value as IndicatorRule)}
                  className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
                >
                  <option value="ema_cross">EMA 크로스 (9/21)</option>
                  <option value="rsi_reclaim">RSI 회복/이탈</option>
                  <option value="macd_cross">MACD 히스토그램</option>
                </select>
              </label>
              <label className="text-[11px] text-zinc-500">
                비중 %
                <input
                  type="number"
                  value={riskPct}
                  onChange={(e) => setRiskPct(Number(e.target.value))}
                  className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
                />
              </label>
              <label className="text-[11px] text-zinc-500">
                TP % / SL %
                <div className="mt-0.5 flex gap-1">
                  <input
                    type="number"
                    value={tp}
                    onChange={(e) => setTp(Number(e.target.value))}
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
                  />
                  <input
                    type="number"
                    value={sl}
                    onChange={(e) => setSl(Number(e.target.value))}
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
                  />
                </div>
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="col-span-2 text-[11px] text-zinc-500">
                HL 트레이더
                <select
                  value={copyTraderId}
                  onChange={(e) => setCopyTraderId(e.target.value)}
                  className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
                >
                  {hlTraders.length === 0 ? (
                    <option value="">관심 트레이더 없음</option>
                  ) : (
                    hlTraders.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label || shortAddr(t.address)}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="text-[11px] text-zinc-500">
                규모 비율 %
                <input
                  type="number"
                  value={copyScale}
                  onChange={(e) => setCopyScale(Number(e.target.value))}
                  className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
                />
              </label>
              <p className="self-end text-[11px] text-zinc-600">
                원본 노셔널 × 비율 (상한 $2k)
              </p>
            </div>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void createStrategy()}
            className="mt-3 w-full rounded border border-emerald-700/60 bg-emerald-950/40 py-2 text-sm text-emerald-200 hover:bg-emerald-950/70 disabled:opacity-50"
          >
            전략 저장
          </button>
        </div>

        <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
          <p className="mb-2 text-sm font-medium text-zinc-200">
            활성 전략 ({accountStrategies.length})
          </p>
          {accountStrategies.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">
              전략을 추가하세요.
            </p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-auto pretty-scroll">
              {accountStrategies.map((s) => (
                <li
                  key={s.id}
                  className="rounded border border-zinc-800 bg-zinc-900/40 px-2.5 py-2 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-zinc-200">
                        {s.enabled ? "" : (
                          <span className="mr-1 text-zinc-600">[끔]</span>
                        )}
                        {s.name}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {s.mode === "indicator" ? "지표" : "카피"}
                        {s.last_run_at
                          ? ` · ${formatKst(s.last_run_at)}`
                          : " · 미실행"}
                        {s.last_error ? (
                          <span className="text-rose-400">
                            {" "}
                            · {s.last_error.slice(0, 60)}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
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
                        className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400"
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
                        className="rounded border border-rose-900/50 px-2 py-0.5 text-[11px] text-rose-400"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-zinc-800 overflow-hidden">
          <p className="border-b border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">
            오픈 포지션
          </p>
          <div className="max-h-48 overflow-auto pretty-scroll">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase text-zinc-500">
                <tr>
                  <th className="px-2 py-1">심볼</th>
                  <th className="px-2 py-1">방향</th>
                  <th className="px-2 py-1">진입</th>
                  <th className="px-2 py-1">uPnL</th>
                </tr>
              </thead>
              <tbody>
                {accountPositions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-2 py-6 text-center text-zinc-500"
                    >
                      없음
                    </td>
                  </tr>
                ) : (
                  accountPositions.map((p) => (
                    <tr
                      key={p.id}
                      className="border-t border-zinc-900 text-zinc-300"
                    >
                      <td className="px-2 py-1.5">{p.symbol}</td>
                      <td
                        className={`px-2 py-1.5 ${
                          p.side === "LONG"
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {p.side}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-zinc-400">
                        {Number(p.entry_price).toLocaleString()}
                      </td>
                      <td
                        className={`px-2 py-1.5 tabular-nums ${
                          Number(p.unrealised_pnl) >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {fmtUsd(Number(p.unrealised_pnl ?? 0))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-md border border-zinc-800 overflow-hidden">
          <p className="border-b border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">
            최근 체결
          </p>
          <div className="max-h-48 overflow-auto pretty-scroll">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase text-zinc-500">
                <tr>
                  <th className="px-2 py-1">시각</th>
                  <th className="px-2 py-1">심볼</th>
                  <th className="px-2 py-1">액션</th>
                  <th className="px-2 py-1">사유</th>
                </tr>
              </thead>
              <tbody>
                {accountFills.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-2 py-6 text-center text-zinc-500"
                    >
                      없음
                    </td>
                  </tr>
                ) : (
                  accountFills.slice(0, 30).map((f) => (
                    <tr
                      key={f.id}
                      className="border-t border-zinc-900 text-zinc-300"
                    >
                      <td className="px-2 py-1.5 text-[11px] text-zinc-500">
                        {formatKst(f.observed_at)}
                      </td>
                      <td className="px-2 py-1.5">{f.symbol}</td>
                      <td className="px-2 py-1.5">
                        {f.action}{" "}
                        <span
                          className={
                            f.side === "LONG"
                              ? "text-emerald-400"
                              : "text-rose-400"
                          }
                        >
                          {f.side}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-[11px] text-zinc-500">
                        {f.reason}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {accountEquity.length > 1 && (
        <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
          <p className="mb-2 text-sm text-zinc-300">에쿼티 추이 (최근)</p>
          <div className="flex h-16 items-end gap-0.5">
            {accountEquity.slice(-40).map((e) => {
              const vals = accountEquity.map((x) => Number(x.equity));
              const min = Math.min(...vals);
              const max = Math.max(...vals);
              const h =
                max === min
                  ? 50
                  : ((Number(e.equity) - min) / (max - min)) * 100;
              return (
                <div
                  key={e.id}
                  title={`${formatKst(e.taken_at)} ${fmtUsd(Number(e.equity))}`}
                  className="flex-1 rounded-t bg-emerald-600/50"
                  style={{ height: `${Math.max(8, h)}%` }}
                />
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-md border border-zinc-800 bg-zinc-950/30 p-3 text-[12px] text-zinc-500">
        <p className="font-medium text-zinc-400">무료 Cron 연결</p>
        <p className="mt-1">
          cron-job.org 등에서 5분마다{" "}
          <code className="text-zinc-400">POST /api/paper/tick</code> 호출.
          헤더{" "}
          <code className="text-zinc-400">
            x-cron-secret: (로컬 PAPER_CRON_SECRET)
          </code>
          . Vercel에도 같은 환경변수를 넣으세요.
        </p>
        {ticks[0] && (
          <p className="mt-1 text-zinc-600">
            마지막 틱 로그: {ticks[0].ok ? "OK" : "FAIL"} ·{" "}
            {ticks[0].message} · {formatKst(ticks[0].started_at)}
          </p>
        )}
      </div>
    </div>
  );
}
