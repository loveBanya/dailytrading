"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { formatKst } from "@/lib/utils/format";
import type {
  IndexRow,
  LongShortRow,
  MarketMover,
  MarketMoversPayload,
  MarketOverviewMetrics,
  MoverPeriod,
} from "@/lib/market/movers";
import { BinanceKindBadge } from "./BinanceKindBadge";

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function pct(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

function pctClass(n: number | null | undefined): string {
  if (n == null) return "text-zinc-500";
  if (n > 0) return "text-emerald-400";
  if (n < 0) return "text-rose-400";
  return "text-zinc-400";
}

function MetricCard({
  label,
  value,
  sub,
  subClass,
  bar,
}: {
  label: string;
  value: string;
  sub?: string;
  subClass?: string;
  bar?: { pct: number; from: string; to: string };
}) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2.5">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-50">
        {value}
      </p>
      {sub ? (
        <p className={`mt-0.5 text-xs tabular-nums ${subClass ?? "text-zinc-500"}`}>
          {sub}
        </p>
      ) : null}
      {bar ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(4, Math.min(100, bar.pct))}%`,
              background: `linear-gradient(90deg, ${bar.from}, ${bar.to})`,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function ListCard({
  title,
  periods,
  period,
  onPeriod,
  children,
}: {
  title: string;
  periods?: boolean;
  period?: MoverPeriod;
  onPeriod?: (p: MoverPeriod) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[280px] flex-col rounded-lg border border-zinc-800/80 bg-zinc-950/40">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 px-3 py-2">
        <p className="text-sm font-medium text-zinc-200">{title}</p>
        {periods && period && onPeriod ? (
          <div className="flex gap-0.5">
            {(["5m", "30m", "4h"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onPeriod(p)}
                className={`rounded px-1.5 py-0.5 text-[10px] ${
                  period === p
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="pretty-scroll flex-1 overflow-auto">{children}</div>
    </div>
  );
}

function MoverRows({
  rows,
  mode,
  onPick,
}: {
  rows: MarketMover[];
  mode: "surge" | "oi";
  onPick?: (symbol: string) => void;
}) {
  if (!rows.length) {
    return (
      <p className="px-3 py-8 text-center text-sm text-zinc-600">데이터 없음</p>
    );
  }
  return (
    <ul className="divide-y divide-zinc-900/70">
      {rows.map((r, i) => {
        const v = mode === "surge" ? r.changePct : r.oiChangePct ?? 0;
        return (
          <li key={r.symbol}>
            <button
              type="button"
              onClick={() => onPick?.(r.symbol)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-900/50"
            >
              <span className="w-4 text-[11px] text-zinc-600">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">
                {r.base}
                <span className="ml-1.5 inline-block align-middle">
                  <BinanceKindBadge kind={r.assetKind} />
                </span>
              </span>
              <span className={`tabular-nums text-sm ${pctClass(v)}`}>
                {pct(v)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function IndexRows({ rows }: { rows: IndexRow[] }) {
  return (
    <ul className="divide-y divide-zinc-900/70">
      {rows.map((r) => (
        <li
          key={r.label}
          className="flex items-center justify-between gap-2 px-3 py-2.5"
        >
          <span className="text-[12px] text-zinc-400">{r.label}</span>
          <span className="text-right">
            <span className="block text-sm tabular-nums text-zinc-100">
              {r.value}
            </span>
            {r.changePct != null ? (
              <span className={`text-[11px] ${pctClass(r.changePct)}`}>
                {pct(r.changePct)}
              </span>
            ) : r.note ? (
              <span className="text-[10px] text-zinc-600">{r.note}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function LsRows({ rows }: { rows: LongShortRow[] }) {
  if (!rows.length) {
    return (
      <p className="px-3 py-8 text-center text-sm text-zinc-600">데이터 없음</p>
    );
  }
  return (
    <ul className="divide-y divide-zinc-900/70">
      {rows.map((r) => (
        <li
          key={r.label}
          className="flex items-center justify-between gap-2 px-3 py-2.5"
        >
          <span className="min-w-0 flex-1 text-[12px] text-zinc-400">
            {r.label}
          </span>
          <span className="text-right">
            <span className="block text-sm tabular-nums text-zinc-100">
              {r.ratio.toFixed(2)}
            </span>
            <span className={`text-[11px] ${pctClass(r.changePct)}`}>
              {pct(r.changePct)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function metricsView(m: MarketOverviewMetrics | undefined) {
  return {
    oi: fmtUsd(m?.openInterestUsd),
    oiChg: pct(m?.openInterestChangePct),
    rsi: m?.avgRsi != null ? m.avgRsi.toFixed(2) : "—",
    alt: m?.altSeason != null ? String(Math.round(m.altSeason)) : "—",
    fg:
      m?.fearGreed != null
        ? `${m.fearGreed}`
        : "—",
  };
}

export function CoinGlassBoard({
  onPickSymbol,
}: {
  onPickSymbol?: (symbol: string) => void;
}) {
  const [period, setPeriod] = useState<MoverPeriod>("4h");
  const [data, setData] = useState<MarketMoversPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: MoverPeriod) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/market/movers?period=${p}`);
      const json = (await res.json()) as MarketMoversPayload & {
        error?: string;
      };
      if (!res.ok || json.error) throw new Error(json.error || "실패");
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(period);
    const id = window.setInterval(() => void load(period), 120_000);
    return () => window.clearInterval(id);
  }, [load, period]);

  const mv = metricsView(data?.metrics);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-zinc-200">시장 보드</p>
        <span className="text-[11px] text-zinc-600">
          Coinglass 스타일 · 바이낸스 공개데이터
        </span>
        {data?.updatedAt ? (
          <span className="text-[10px] text-zinc-600">
            {formatKst(data.updatedAt)}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => void load(period)}
          className="ml-auto rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-500 hover:text-zinc-300"
        >
          {loading ? "…" : "새로고침"}
        </button>
      </div>

      {error && (
        <p className="text-sm text-amber-300/80">{error}</p>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="미결제약정 (샘플)"
          value={mv.oi}
          sub={mv.oiChg}
          subClass={pctClass(data?.metrics.openInterestChangePct)}
        />
        <MetricCard
          label="평균 RSI (상위10)"
          value={mv.rsi}
          sub={
            data?.metrics.avgRsi == null
              ? undefined
              : data.metrics.avgRsi < 30
                ? "과매도"
                : data.metrics.avgRsi > 70
                  ? "과매수"
                  : "중립"
          }
          bar={
            data?.metrics.avgRsi != null
              ? {
                  pct: data.metrics.avgRsi,
                  from: "#34d399",
                  to: "#f87171",
                }
              : undefined
          }
        />
        <MetricCard
          label="알트코인 시즌"
          value={mv.alt}
          bar={
            data?.metrics.altSeason != null
              ? {
                  pct: data.metrics.altSeason,
                  from: "#f59e0b",
                  to: "#a78bfa",
                }
              : undefined
          }
        />
        <MetricCard
          label="공포·탐욕"
          value={mv.fg}
          sub={data?.metrics.fearGreedLabel ?? undefined}
          bar={
            data?.metrics.fearGreed != null
              ? {
                  pct: data.metrics.fearGreed,
                  from: "#f87171",
                  to: "#34d399",
                }
              : undefined
          }
        />
      </div>

      <div className="grid gap-2 lg:grid-cols-4">
        <ListCard title="지수 · 지표">
          <IndexRows rows={data?.indices ?? []} />
        </ListCard>
        <ListCard
          title="가장 크게 상승한"
          periods
          period={period}
          onPeriod={setPeriod}
        >
          <MoverRows
            rows={data?.surges ?? []}
            mode="surge"
            onPick={onPickSymbol}
          />
        </ListCard>
        <ListCard
          title="OI 변화%"
          periods
          period={period}
          onPeriod={setPeriod}
        >
          <MoverRows
            rows={data?.oiRises ?? []}
            mode="oi"
            onPick={onPickSymbol}
          />
        </ListCard>
        <ListCard title="롱/숏 비율">
          <LsRows rows={data?.longShort ?? []} />
        </ListCard>
      </div>
    </div>
  );
}
