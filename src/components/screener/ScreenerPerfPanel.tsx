"use client";

import { useCallback, useEffect, useState } from "react";
import { STRATEGY_LABELS, type StrategyId } from "@/lib/screener/types";
import { formatKst } from "@/lib/utils/format";
import { PaperTrackChart } from "./PaperTrackChart";

interface StatsPayload {
  total: number;
  long: number;
  short: number;
  byStrategy: Record<string, number>;
  avgRet1h: number | null;
  avgRet4h: number | null;
  avgRet24h: number | null;
  winRate1h: number | null;
  winRateLong: number | null;
  winRateShort: number | null;
  tp1Rate: number | null;
  tp2Rate: number | null;
  stopRate: number | null;
  avgRr: number | null;
  avgMfe: number | null;
  avgMae: number | null;
  byStars: Record<string, number | null>;
  strategyWinRate: Record<string, number | null>;
  tracked: number;
  error?: string;
}

interface PaperRow {
  id: string;
  exchange: string;
  symbol: string;
  direction: string;
  track_type: string;
  entry_price: number;
  entry_at: string;
  entry_snapshot: Record<string, unknown>;
  last_price: number | null;
  last_at: string | null;
  ret_pct: number | null;
  mfe_pct: number | null;
  mae_pct: number | null;
  status: string;
}

function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(2)}%`;
}

function retCls(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "text-zinc-400";
  return n >= 0 ? "text-emerald-400" : "text-rose-400";
}

export function ScreenerPerfPanel() {
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [papers, setPapers] = useState<PaperRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exchange, setExchange] = useState("all");
  const [direction, setDirection] = useState("ALL");
  const [paperFilter, setPaperFilter] = useState("all");
  const [paperMsg, setPaperMsg] = useState<string | null>(null);
  const [chartPaper, setChartPaper] = useState<PaperRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ exchange, direction });
      const paperQs = new URLSearchParams({ status: "open" });
      if (paperFilter !== "all") paperQs.set("track_type", paperFilter);

      const [statsRes, paperRes] = await Promise.all([
        fetch(`/api/screener/stats?${qs}`),
        fetch(`/api/screener/paper?${paperQs}`),
      ]);
      const data = (await statsRes.json()) as StatsPayload;
      const paperData = (await paperRes.json()) as {
        items?: PaperRow[];
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setStats(data);
      if (!paperData.error) setPapers(paperData.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "통계 로드 실패");
    } finally {
      setLoading(false);
    }
  }, [exchange, direction, paperFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runTrack() {
    setTracking(true);
    setPaperMsg(null);
    try {
      await fetch("/api/screener/track", { method: "POST" });
      const res = await fetch("/api/screener/paper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      const data = (await res.json()) as {
        updated?: number;
        avgRetPct?: number | null;
        error?: string;
      };
      if (data.error) setPaperMsg(data.error);
      else
        setPaperMsg(
          `가상투자 ${data.updated ?? 0}건 갱신 · 평균 수익률 ${pct(data.avgRetPct)}`
        );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "추적 실패");
    } finally {
      setTracking(false);
    }
  }

  async function closePaper(id: string) {
    await fetch("/api/screener/paper", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "close", id }),
    });
    await load();
  }

  const macdPapers = papers.filter((p) => p.track_type === "macd");
  const macdAvg =
    macdPapers.length > 0
      ? macdPapers.reduce((a, p) => a + (Number(p.ret_pct) || 0), 0) /
        macdPapers.length
      : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={exchange}
          onChange={(e) => setExchange(e.target.value)}
          className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
        >
          <option value="all">전체 거래소</option>
          <option value="binance">바이낸스</option>
          <option value="bybit">바이비트</option>
        </select>
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
        >
          <option value="ALL">전체 방향</option>
          <option value="LONG">롱</option>
          <option value="SHORT">숏</option>
        </select>
        <button
          type="button"
          disabled={tracking}
          onClick={() => void runTrack()}
          className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:text-zinc-100 disabled:opacity-50"
        >
          {tracking ? "성과 갱신 중…" : "성과·가상투자 추적 실행"}
        </button>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded bg-emerald-600 px-3 py-1 text-xs text-white"
        >
          새로고침
        </button>
      </div>

      <p className="text-sm text-zinc-500">
        스크리너에서 「가상투자」로 기록한 뒤, 여기서 추적하면 그때 진입했다면
        지금 수익률이 얼마인지 보여줍니다. `009_screener_user.sql` 실행 필요.
      </p>

      {paperMsg && <p className="text-xs text-sky-300/90">{paperMsg}</p>}

      {loading && <p className="text-sm text-zinc-500">불러오는 중…</p>}
      {error && (
        <p className="text-sm text-amber-300/80">
          {error}
          {(error.includes("does not exist") ||
            error.includes("schema cache")) &&
            " — 008/009 SQL을 실행하세요."}
        </p>
      )}

      <div className="rounded-lg border border-zinc-800 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-zinc-300">
            가상투자 추적 (진입 가정 → 현재 수익)
          </h3>
          <select
            value={paperFilter}
            onChange={(e) => setPaperFilter(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
          >
            <option value="all">전체 유형</option>
            <option value="manual">수동</option>
            <option value="scan">스캔</option>
            <option value="macd">MACD</option>
            <option value="favorite">즐겨찾기</option>
          </select>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="오픈 포지션" value={String(papers.length)} />
          <Metric
            label="평균 수익률"
            value={pct(
              papers.length
                ? papers.reduce((a, p) => a + (Number(p.ret_pct) || 0), 0) /
                    papers.length
                : null
            )}
          />
          <Metric label="MACD 추적 수" value={String(macdPapers.length)} />
          <Metric label="MACD 평균수익" value={pct(macdAvg)} />
        </div>
        <div className="pretty-scroll overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="text-zinc-500">
              <tr>
                <th className="px-2 py-1.5">심볼</th>
                <th className="px-2 py-1.5">유형</th>
                <th className="px-2 py-1.5">방향</th>
                <th className="px-2 py-1.5">진입가</th>
                <th className="px-2 py-1.5">진입시각</th>
                <th className="px-2 py-1.5">당시상태</th>
                <th className="px-2 py-1.5">현재가</th>
                <th className="px-2 py-1.5">수익률</th>
                <th className="px-2 py-1.5">MFE/MAE</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {papers.map((p) => {
                const selected = chartPaper?.id === p.id;
                return (
                  <tr
                    key={p.id}
                    className={`border-t border-zinc-800/80 transition ${
                      selected ? "bg-sky-500/10" : "hover:bg-zinc-900/60"
                    }`}
                  >
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setChartPaper((cur) => (cur?.id === p.id ? null : p))
                        }
                        className="text-left font-medium text-sky-300 underline-offset-2 hover:text-sky-200 hover:underline"
                        title="차트 보기"
                      >
                        {p.symbol.replace(/USDT$/i, "")}
                        <span className="ml-1 font-normal text-zinc-600">
                          {p.exchange}
                        </span>
                        <span className="ml-1 text-[10px] text-zinc-500">
                          {selected ? "▲" : "차트"}
                        </span>
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-zinc-400">{p.track_type}</td>
                    <td
                      className={`px-2 py-1.5 ${
                        p.direction.startsWith("LONG")
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }`}
                    >
                      {p.direction}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums text-zinc-300">
                      {Number(p.entry_price)}
                    </td>
                    <td className="px-2 py-1.5 text-zinc-500">
                      {formatKst(p.entry_at)}
                    </td>
                    <td className="px-2 py-1.5 text-[10px] text-zinc-500">
                      {p.entry_snapshot?.macdState != null &&
                        `MACD ${String(p.entry_snapshot.macdState)} · `}
                      {p.entry_snapshot?.rsi != null &&
                        `RSI ${String(p.entry_snapshot.rsi)} · `}
                      {p.entry_snapshot?.scoreTotal != null &&
                        `${String(p.entry_snapshot.scoreTotal)}점`}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums text-zinc-300">
                      {p.last_price ?? "—"}
                    </td>
                    <td
                      className={`px-2 py-1.5 tabular-nums font-medium ${retCls(
                        p.ret_pct != null ? Number(p.ret_pct) : null
                      )}`}
                    >
                      {pct(p.ret_pct != null ? Number(p.ret_pct) : null)}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums text-zinc-500">
                      {pct(p.mfe_pct != null ? Number(p.mfe_pct) : null)} /{" "}
                      {pct(p.mae_pct != null ? Number(p.mae_pct) : null)}
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => void closePaper(p.id)}
                        className="text-zinc-500 hover:text-zinc-300"
                      >
                        종료
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {papers.length === 0 && (
            <p className="p-4 text-center text-xs text-zinc-600">
              열린 가상투자 없음. 스크리너에서 「후보 가상투자」또는 「MACD
              가상투자」를 실행하세요.
            </p>
          )}
        </div>

        {chartPaper && (
          <div className="mt-3">
            <PaperTrackChart
              paper={chartPaper}
              onClose={() => setChartPaper(null)}
            />
          </div>
        )}
      </div>

      {stats && !error && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="전체 신호" value={String(stats.total)} />
            <Metric label="롱 신호" value={String(stats.long)} />
            <Metric label="숏 신호" value={String(stats.short)} />
            <Metric label="추적됨" value={String(stats.tracked)} />
            <Metric label="1h 평균수익" value={pct(stats.avgRet1h)} />
            <Metric label="4h 평균수익" value={pct(stats.avgRet4h)} />
            <Metric label="24h 평균수익" value={pct(stats.avgRet24h)} />
            <Metric label="1h 승률" value={pct(stats.winRate1h)} />
            <Metric label="롱 승률" value={pct(stats.winRateLong)} />
            <Metric label="숏 승률" value={pct(stats.winRateShort)} />
            <Metric label="TP1 도달" value={pct(stats.tp1Rate)} />
            <Metric label="TP2 도달" value={pct(stats.tp2Rate)} />
            <Metric label="손절 도달" value={pct(stats.stopRate)} />
            <Metric
              label="평균 RR"
              value={stats.avgRr != null ? stats.avgRr.toFixed(2) : "—"}
            />
            <Metric
              label="평균 MFE"
              value={stats.avgMfe != null ? stats.avgMfe.toFixed(2) : "—"}
            />
            <Metric
              label="평균 MAE"
              value={stats.avgMae != null ? stats.avgMae.toFixed(2) : "—"}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-zinc-800 p-3">
              <h3 className="mb-2 text-sm font-medium text-zinc-300">
                전략별 신호 수
              </h3>
              <ul className="space-y-1 text-xs text-zinc-400">
                {Object.entries(stats.byStrategy).map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span>{STRATEGY_LABELS[k as StrategyId] ?? k}</span>
                    <span className="tabular-nums text-zinc-200">{v}</span>
                  </li>
                ))}
                {Object.keys(stats.byStrategy).length === 0 && (
                  <li>데이터 없음</li>
                )}
              </ul>
            </div>
            <div className="rounded-lg border border-zinc-800 p-3">
              <h3 className="mb-2 text-sm font-medium text-zinc-300">
                전략별 1h 승률
              </h3>
              <ul className="space-y-1 text-xs text-zinc-400">
                {Object.entries(stats.strategyWinRate).map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span>{STRATEGY_LABELS[k as StrategyId] ?? k}</span>
                    <span className="tabular-nums text-zinc-200">{pct(v)}</span>
                  </li>
                ))}
                {Object.keys(stats.strategyWinRate).length === 0 && (
                  <li>추적 데이터 없음</li>
                )}
              </ul>
            </div>
            <div className="rounded-lg border border-zinc-800 p-3">
              <h3 className="mb-2 text-sm font-medium text-zinc-300">
                별점별 1h 평균수익
              </h3>
              <ul className="space-y-1 text-xs text-zinc-400">
                {Object.entries(stats.byStars)
                  .sort(([a], [b]) => Number(b) - Number(a))
                  .map(([k, v]) => (
                    <li key={k} className="flex justify-between">
                      <span>{"★".repeat(Number(k))}</span>
                      <span className="tabular-nums text-zinc-200">
                        {pct(v)}
                      </span>
                    </li>
                  ))}
                {Object.keys(stats.byStars).length === 0 && (
                  <li>추적 데이터 없음</li>
                )}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/40 px-3 py-2">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-zinc-100">
        {value}
      </p>
    </div>
  );
}
