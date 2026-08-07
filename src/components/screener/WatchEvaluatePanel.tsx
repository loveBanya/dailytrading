"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ScreenerCandidate, WatchAsset } from "@/lib/screener/types";
import { STRATEGY_LABELS } from "@/lib/screener/types";
import { exchangeLabel } from "@/lib/screener/filters";
import { formatKst } from "@/lib/utils/format";
import { loadWatchAssets, saveWatchAssets } from "@/lib/prefs";
import { DEFAULT_WATCH_ASSETS } from "@/lib/screener/watchlist";
import { ScreenerDetail } from "./ScreenerDetail";

function stars(n: number): string {
  return "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n));
}

function dirCls(d: string): string {
  if (d.startsWith("LONG")) return "text-emerald-400";
  if (d.startsWith("SHORT")) return "text-rose-400";
  return "text-zinc-400";
}

export function WatchEvaluatePanel() {
  const [assets, setAssets] = useState<WatchAsset[]>(DEFAULT_WATCH_ASSETS);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<WatchAsset[]>([]);
  const [searching, setSearching] = useState(false);
  const [timeframe, setTimeframe] = useState<"5m" | "15m" | "1h">("15m");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ScreenerCandidate[]>([]);
  const [selected, setSelected] = useState<ScreenerCandidate | null>(null);
  const searchTimer = useRef<number | null>(null);

  useEffect(() => {
    setAssets(loadWatchAssets());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveWatchAssets(assets);
  }, [assets, ready]);

  const runSearch = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const res = await fetch(
        `/api/screener/search?q=${encodeURIComponent(q)}`
      );
      const data = (await res.json()) as {
        results?: WatchAsset[];
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setHits(data.results ?? []);
    } catch {
      setHits([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    if (!query.trim()) {
      setHits([]);
      return;
    }
    searchTimer.current = window.setTimeout(() => {
      void runSearch(query.trim());
    }, 280);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [query, runSearch]);

  function addAsset(asset: WatchAsset) {
    setAssets((prev) => {
      if (prev.some((a) => a.id === asset.id)) return prev;
      return [...prev, asset];
    });
    setQuery("");
    setHits([]);
  }

  function removeAsset(id: string) {
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }

  function resetDefaults() {
    setAssets([...DEFAULT_WATCH_ASSETS]);
  }

  async function evaluate() {
    if (assets.length === 0) {
      setError("평가할 종목을 추가하세요");
      return;
    }
    setLoading(true);
    setError(null);
    setErrors([]);
    try {
      const res = await fetch("/api/screener/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeframe,
          assets: assets.map((a) => ({
            exchange: a.exchange,
            symbol: a.symbol,
            label: a.label,
          })),
        }),
      });
      const data = (await res.json()) as {
        candidates?: ScreenerCandidate[];
        errors?: string[];
        scannedAt?: string;
        error?: string;
      };
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "평가 실패");
      }
      setCandidates(data.candidates ?? []);
      setErrors(data.errors ?? []);
      setScannedAt(data.scannedAt ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "평가 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!ready) return;
    void evaluate();
    // 최초 1회만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        코인 스크리너와 같은 전략·점수 방식으로 지정 종목을 평가합니다. 기본:
        비트·이더·솔·코스피·코루·EWY. 검색으로 코인·주식·ETF를 더 넣을 수
        있습니다.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[14rem] flex-1 text-xs text-zinc-500">
          종목 검색 · 추가
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="예: BTC, 코스피, NVDA, PEPE"
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/50"
          />
        </label>
        <label className="text-xs text-zinc-500">
          타임프레임
          <select
            value={timeframe}
            onChange={(e) =>
              setTimeframe(e.target.value as "5m" | "15m" | "1h")
            }
            className="mt-1 block rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-200"
          >
            <option value="5m">5m</option>
            <option value="15m">15m</option>
            <option value="1h">1h</option>
          </select>
        </label>
        <button
          type="button"
          disabled={loading || assets.length === 0}
          onClick={() => void evaluate()}
          className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200 transition hover:border-emerald-400/60 disabled:opacity-40"
        >
          {loading ? "평가 중…" : "다시 평가"}
        </button>
        <button
          type="button"
          onClick={resetDefaults}
          className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200"
        >
          기본 종목 복원
        </button>
      </div>

      {query.trim() && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/80">
          {searching && (
            <p className="px-3 py-2 text-xs text-zinc-500">검색 중…</p>
          )}
          {!searching && hits.length === 0 && (
            <p className="px-3 py-2 text-xs text-zinc-500">결과 없음</p>
          )}
          <ul className="divide-y divide-zinc-800/80">
            {hits.map((h) => {
              const already = assets.some((a) => a.id === h.id);
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    disabled={already}
                    onClick={() => addAsset(h)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-zinc-900/70 disabled:opacity-40"
                  >
                    <span>
                      <span className="font-medium text-zinc-100">
                        {h.label}
                      </span>
                      <span className="ml-2 text-xs text-zinc-500">
                        {h.symbol} · {exchangeLabel(h.exchange)}
                      </span>
                    </span>
                    <span className="text-xs text-emerald-400">
                      {already ? "추가됨" : "+ 추가"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {assets.map((a) => (
          <span
            key={a.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/60 px-2.5 py-1 text-xs text-zinc-200"
          >
            <span className="font-medium">{a.label}</span>
            <span className="text-zinc-600">{exchangeLabel(a.exchange)}</span>
            <button
              type="button"
              onClick={() => removeAsset(a.id)}
              className="ml-0.5 text-zinc-500 hover:text-rose-300"
              aria-label={`${a.label} 제거`}
            >
              ×
            </button>
          </span>
        ))}
        {assets.length === 0 && (
          <span className="text-xs text-zinc-500">관심 종목이 비어 있습니다</span>
        )}
      </div>

      {error && <p className="text-sm text-amber-300/90">{error}</p>}
      {errors.length > 0 && (
        <p className="text-xs text-amber-200/70">
          일부 실패: {errors.slice(0, 3).join(" · ")}
          {errors.length > 3 ? ` 외 ${errors.length - 3}건` : ""}
        </p>
      )}
      {scannedAt && (
        <p className="text-xs text-zinc-600">
          평가 {formatKst(scannedAt)} KST · {candidates.length}종목
        </p>
      )}

      <div className="pretty-scroll overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full min-w-[960px] text-left text-xs">
          <thead className="bg-zinc-950 text-zinc-500">
            <tr>
              {[
                "#",
                "종목",
                "방향",
                "별",
                "종합",
                "롱",
                "숏",
                "전략",
                "15m%",
                "1h%",
                "24h%",
                "RSI",
                "RR",
                "가격",
              ].map((h) => (
                <th key={h} className="px-2 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {candidates.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={14}
                  className="px-3 py-8 text-center text-zinc-500"
                >
                  평가 결과가 없습니다. 종목을 추가한 뒤 다시 평가하세요.
                </td>
              </tr>
            )}
            {candidates.map((c, i) => (
              <tr
                key={`${c.exchange}-${c.symbol}`}
                className="cursor-pointer border-t border-zinc-800/80 hover:bg-zinc-900/60"
                onClick={() => setSelected(c)}
              >
                <td className="px-2 py-2 text-zinc-500">{i + 1}</td>
                <td className="px-2 py-2">
                  <span className="font-medium text-zinc-100">
                    {c.baseAsset}
                  </span>
                  <span className="ml-1 text-zinc-600">
                    {c.symbol} · {exchangeLabel(c.exchange)}
                  </span>
                </td>
                <td className={`px-2 py-2 font-medium ${dirCls(c.direction)}`}>
                  {c.direction}
                </td>
                <td className="px-2 py-2 text-amber-300/90">{stars(c.stars)}</td>
                <td className="px-2 py-2 tabular-nums text-zinc-100">
                  {c.scoreTotal}
                </td>
                <td className="px-2 py-2 tabular-nums text-emerald-400/80">
                  {c.scoreLong}
                </td>
                <td className="px-2 py-2 tabular-nums text-rose-400/80">
                  {c.scoreShort}
                </td>
                <td className="px-2 py-2 text-zinc-400">
                  {c.strongestStrategy
                    ? STRATEGY_LABELS[c.strongestStrategy]
                    : "—"}
                </td>
                <td className="px-2 py-2 tabular-nums">{c.change15m}</td>
                <td className="px-2 py-2 tabular-nums">{c.change1h}</td>
                <td className="px-2 py-2 tabular-nums">{c.change24h}</td>
                <td className="px-2 py-2 tabular-nums">{c.rsi}</td>
                <td className="px-2 py-2 tabular-nums">{c.rr1 ?? "—"}</td>
                <td className="px-2 py-2 tabular-nums text-zinc-300">
                  {c.price}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <ScreenerDetail
          candidate={selected}
          onClose={() => setSelected(null)}
          persistActions={selected.exchange !== "yahoo"}
        />
      )}
    </div>
  );
}
