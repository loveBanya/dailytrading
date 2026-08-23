"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DemandSupplyRow,
  DemandSupplyScope,
} from "@/lib/screener/demand-supply";
import type { ScreenerExchange } from "@/lib/screener/types";
import { exchangeLabel } from "@/lib/screener/filters";
import { formatKst } from "@/lib/utils/format";

const CHECK_META = [
  {
    key: "up10" as const,
    short: "+10%",
    title: "당일 이미 10% 이상 상승",
    demand: true,
  },
  {
    key: "rvol5" as const,
    short: "5×Vol",
    title: "상대거래량 5배 이상 (오늘 vs 평균)",
    demand: true,
  },
  {
    key: "priceBand" as const,
    short: "$2–20",
    title: "데이 트레이더 선호가 $2–$20",
    demand: true,
  },
  {
    key: "thinSupply" as const,
    short: "<20M",
    title: "거래가능 공급 근사 2,000만 주 미만",
    demand: false,
  },
];

type SortMode = "hits" | "score" | "change" | "rvol";

function CheckDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      title={label}
      className={`inline-flex h-6 min-w-6 items-center justify-center rounded px-1 font-mono text-[10px] ${
        ok
          ? "bg-emerald-500/20 text-emerald-300"
          : "bg-zinc-800 text-zinc-600"
      }`}
    >
      {ok ? "●" : "○"}
    </span>
  );
}

export function DemandSupplyPanel() {
  const [scope, setScope] = useState<DemandSupplyScope>("stock");
  const [exchange, setExchange] = useState<ScreenerExchange | "all">("binance");
  const [minHits, setMinHits] = useState(2);
  const [sortMode, setSortMode] = useState<SortMode>("hits");
  const [rows, setRows] = useState<DemandSupplyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{
    scannedAt: string;
    universeSize: number;
    analyzed: number;
    errors: string[];
  } | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        exchange,
        scope,
        maxSymbols: scope === "stock" ? "120" : "180",
      });
      const res = await fetch(`/api/screener/demand-supply?${qs}`);
      const data = (await res.json()) as {
        rows?: DemandSupplyRow[];
        meta?: {
          scannedAt: string;
          universeSize: number;
          analyzed: number;
          errors: string[];
        };
        error?: string;
      };
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "랭킹 실패");
      }
      setRows(data.rows ?? []);
      setMeta(data.meta ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "랭킹 실패");
    } finally {
      setLoading(false);
    }
  }, [exchange, scope]);

  useEffect(() => {
    void run();
  }, [run]);

  const sorted = useMemo(() => {
    const list = rows.filter((r) => r.hitCount >= minHits);
    const copy = [...list];
    copy.sort((a, b) => {
      if (sortMode === "hits") {
        if (b.hitCount !== a.hitCount) return b.hitCount - a.hitCount;
        return b.score - a.score;
      }
      if (sortMode === "score") return b.score - a.score;
      if (sortMode === "change") return b.change24h - a.change24h;
      return b.rvol - a.rvol;
    });
    return copy;
  }, [rows, minHits, sortMode]);

  const topHit = sorted[0]?.hitCount ?? 0;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-500/[0.07] via-zinc-900/80 to-zinc-950 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400/90">
          Demand · Supply Checklist
        </p>
        <h3 className="mt-1 text-xl font-semibold tracking-tight text-zinc-50">
          고수요 · 저공급 랭킹
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
          선물 유니버스를 불러와 데이 트레이딩 체크리스트로 줄 세웁니다. 코인
          스크리너 전략 필터가 아니라, 여기서만 쓰는 전용 랭킹입니다.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {CHECK_META.map((c) => (
            <div
              key={c.key}
              className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2.5"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    c.demand
                      ? "bg-sky-500/15 text-sky-300"
                      : "bg-violet-500/15 text-violet-300"
                  }`}
                >
                  {c.demand ? "Demand" : "Supply"}
                </span>
                <span className="font-mono text-xs text-zinc-200">
                  {c.short}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">
                {c.title}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-zinc-500">
          <span className="block">유니버스</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as DemandSupplyScope)}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500/50"
          >
            <option value="stock">TradFi / 주식 선물</option>
            <option value="crypto">코인 선물</option>
            <option value="all">주식 + 코인</option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-zinc-500">
          <span className="block">거래소</span>
          <select
            value={exchange}
            onChange={(e) =>
              setExchange(e.target.value as ScreenerExchange | "all")
            }
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500/50"
          >
            <option value="binance">Binance</option>
            <option value="bybit">Bybit</option>
            <option value="all">둘 다</option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-zinc-500">
          <span className="block">최소 충족</span>
          <select
            value={minHits}
            onChange={(e) => setMinHits(Number(e.target.value))}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500/50"
          >
            {[0, 1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}개 이상
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-zinc-500">
          <span className="block">정렬</span>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500/50"
          >
            <option value="hits">충족 수</option>
            <option value="score">점수</option>
            <option value="change">당일 %</option>
            <option value="rvol">상대Vol</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading}
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50"
        >
          {loading ? "스캔 중…" : "다시 스캔"}
        </button>
        {meta && (
          <p className="ml-auto self-center text-xs text-zinc-500">
            {formatKst(meta.scannedAt)} · 유니버스 {meta.universeSize} · 분석{" "}
            {meta.analyzed} · 표시 {sorted.length}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {meta && meta.errors.length > 0 && (
        <div className="text-xs text-zinc-500">
          <button
            type="button"
            className="underline decoration-zinc-700 underline-offset-2 hover:text-zinc-300"
            onClick={() => setShowErrors((v) => !v)}
          >
            일부 심볼 오류 {meta.errors.length}건
            {showErrors ? " 숨기기" : " 보기"}
          </button>
          {showErrors && (
            <ul className="mt-2 max-h-28 overflow-y-auto rounded border border-zinc-800 bg-zinc-950/60 p-2 font-mono text-[10px] text-zinc-600">
              {meta.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-950/80 text-[11px] uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2.5 font-medium">#</th>
              <th className="px-3 py-2.5 font-medium">종목</th>
              <th className="px-3 py-2.5 font-medium">가격</th>
              <th className="px-3 py-2.5 font-medium">당일%</th>
              <th className="px-3 py-2.5 font-medium">상대Vol</th>
              <th className="px-3 py-2.5 font-medium">체크리스트</th>
              <th className="px-3 py-2.5 font-medium">충족</th>
              <th className="px-3 py-2.5 font-medium">점수</th>
              <th className="px-3 py-2.5 font-medium">메모</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-10 text-center text-zinc-500"
                >
                  선물 유니버스 불러오는 중…
                </td>
              </tr>
            )}
            {!loading && sorted.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-10 text-center text-zinc-500"
                >
                  조건에 맞는 종목이 없습니다. 최소 충족을 낮추거나 유니버스를
                  바꿔 보세요.
                </td>
              </tr>
            )}
            {sorted.map((r, i) => {
              const highlight = r.hitCount >= 3 || r.hitCount === topHit;
              return (
                <tr
                  key={`${r.exchange}:${r.symbol}`}
                  className={`border-b border-zinc-800/80 ${
                    highlight
                      ? "bg-amber-500/[0.06]"
                      : "hover:bg-zinc-900/60"
                  }`}
                >
                  <td className="px-3 py-2.5 font-mono text-xs text-zinc-500">
                    {i + 1}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-zinc-100">
                      {r.displayName}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-zinc-500">
                      {exchangeLabel(r.exchange)} · {r.symbol}
                      {r.assetKind === "stock" ? " · 주식" : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-zinc-200">
                    ${r.price.toPrecision(4)}
                  </td>
                  <td
                    className={`px-3 py-2.5 font-mono ${
                      r.change24h >= 10
                        ? "text-emerald-400"
                        : r.change24h >= 0
                          ? "text-emerald-400/70"
                          : "text-rose-400"
                    }`}
                  >
                    {r.change24h >= 0 ? "+" : ""}
                    {r.change24h.toFixed(1)}%
                  </td>
                  <td
                    className={`px-3 py-2.5 font-mono ${
                      r.rvol >= 5 ? "text-amber-300" : "text-zinc-300"
                    }`}
                  >
                    {r.rvol > 0 ? `${r.rvol.toFixed(1)}×` : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {CHECK_META.map((c) => (
                        <CheckDot
                          key={c.key}
                          ok={r.checks[c.key]}
                          label={c.title}
                        />
                      ))}
                    </div>
                    <div className="mt-1 flex gap-1 text-[9px] text-zinc-600">
                      {CHECK_META.map((c) => (
                        <span key={c.key} className="w-6 text-center">
                          {c.short.replace("Vol", "V").slice(0, 4)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-md px-2 py-0.5 font-mono text-xs ${
                        r.hitCount >= 3
                          ? "bg-amber-500/20 text-amber-200"
                          : r.hitCount >= 2
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {r.hitCount}/4
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-zinc-300">
                    {r.score}
                  </td>
                  <td className="max-w-[220px] px-3 py-2.5 text-[11px] leading-snug text-zinc-500">
                    {r.notes.slice(0, 3).join(" · ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-600">
        공급(&lt;20M)은 현물 float이 아니라 24h 베이스 거래량 근사입니다.
      </p>
    </div>
  );
}
