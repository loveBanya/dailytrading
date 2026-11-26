"use client";

import { useCallback, useEffect, useState } from "react";
import { formatKst } from "@/lib/utils/format";
import type { MarketMover, MarketMoversPayload } from "@/lib/market/movers";

function fmtUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPx(n: number): string {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString(undefined, { maximumSignificantDigits: 6 });
  return n.toPrecision(4);
}

function pctClass(n: number): string {
  if (n > 0) return "text-emerald-400";
  if (n < 0) return "text-rose-400";
  return "text-zinc-400";
}

function MoverTable({
  title,
  subtitle,
  rows,
  mode,
  onPick,
}: {
  title: string;
  subtitle: string;
  rows: MarketMover[];
  mode: "surge" | "oi";
  onPick?: (symbol: string) => void;
}) {
  return (
    <div className="flex min-h-[260px] flex-col rounded-md border border-zinc-800 bg-zinc-950/80">
      <div className="border-b border-zinc-800 px-3 py-2">
        <p className="text-[12px] font-medium text-zinc-200">{title}</p>
        <p className="text-[10px] text-zinc-600">{subtitle}</p>
      </div>
      <div className="pretty-scroll flex-1 overflow-auto">
        {rows.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-zinc-600">
            조건에 맞는 종목 없음
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-zinc-950 text-[10px] uppercase tracking-wide text-zinc-500">
              <tr className="border-b border-zinc-800">
                <th className="px-3 py-1.5 font-medium">#</th>
                <th className="px-3 py-1.5 font-medium">심볼</th>
                <th className="px-3 py-1.5 font-medium">가격</th>
                <th className="px-3 py-1.5 font-medium">
                  {mode === "surge" ? "24h" : "OI 1h"}
                </th>
                <th className="px-3 py-1.5 font-medium">
                  {mode === "surge" ? "거래대금" : "OI$ · 24h"}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const highlight =
                  mode === "surge" ? r.change24hPct : r.oiChangePct ?? 0;
                return (
                  <tr
                    key={r.symbol}
                    onClick={() => onPick?.(r.symbol)}
                    className={`border-b border-zinc-900/80 text-zinc-300 ${
                      onPick
                        ? "cursor-pointer hover:bg-zinc-900/60"
                        : ""
                    }`}
                  >
                    <td className="px-3 py-1.5 text-[11px] text-zinc-600">
                      {i + 1}
                    </td>
                    <td className="px-3 py-1.5 font-medium text-zinc-100">
                      {r.base}
                    </td>
                    <td className="px-3 py-1.5 tabular-nums text-zinc-400">
                      {fmtPx(r.lastPrice)}
                    </td>
                    <td
                      className={`px-3 py-1.5 tabular-nums ${pctClass(highlight)}`}
                    >
                      {highlight >= 0 ? "+" : ""}
                      {highlight.toFixed(2)}%
                    </td>
                    <td className="px-3 py-1.5 text-[11px] tabular-nums text-zinc-500">
                      {mode === "surge" ? (
                        fmtUsd(r.turnover24h)
                      ) : (
                        <>
                          {r.oiValueUsd != null
                            ? fmtUsd(r.oiValueUsd)
                            : "—"}
                          <span className={`ml-1.5 ${pctClass(r.change24hPct)}`}>
                            {r.change24hPct >= 0 ? "+" : ""}
                            {r.change24hPct.toFixed(1)}%
                          </span>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function MarketMoversPanel({
  onPickSymbol,
}: {
  onPickSymbol?: (symbol: string) => void;
}) {
  const [data, setData] = useState<MarketMoversPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/market/movers");
      const json = (await res.json()) as MarketMoversPayload & {
        error?: string;
      };
      if (!res.ok || json.error) throw new Error(json.error || "불러오기 실패");
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 120_000);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 px-0.5">
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
          Watch
        </span>
        <span className="text-sm font-medium text-zinc-100">
          급상승 · OI 상승
        </span>
        <span className="text-[11px] text-zinc-600">
          Coinglass 스타일 · 바이낸스 선물
        </span>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void load();
          }}
          className="ml-auto rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-500 hover:text-zinc-300"
        >
          {loading ? "…" : "새로고침"}
        </button>
        {data?.updatedAt && (
          <span className="text-[10px] text-zinc-600">
            {formatKst(data.updatedAt)}
          </span>
        )}
      </div>
      {error && (
        <p className="rounded-md border border-amber-800/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
          {error}
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <MoverTable
          title="24h 급상승"
          subtitle="등락 ≥ +5% · 거래대금 ≥ $2M"
          rows={data?.surges ?? []}
          mode="surge"
          onPick={onPickSymbol}
        />
        <MoverTable
          title="OI 상승 (1h)"
          subtitle="OI ≥ +3% · OI$ ≥ $1M · 거래대금 상위 샘플"
          rows={data?.oiRises ?? []}
          mode="oi"
          onPick={onPickSymbol}
        />
      </div>
    </div>
  );
}
