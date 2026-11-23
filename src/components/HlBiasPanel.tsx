"use client";

import { useCallback, useEffect, useState } from "react";
import {
  HL_SYNCED_EVENT,
  readHlCache,
  writeHlCache,
} from "@/lib/hyperliquid/cache";

type Stance = "with" | "against" | "mixed" | "unknown";

interface SideSplit {
  longUsd: number;
  shortUsd: number;
  longAccounts: number;
  shortAccounts: number;
  bothAccounts: number;
  accountsWithPos: number;
}

interface BiasPayload {
  marketNote?: string;
  overall: {
    watchLongPct: number | null;
    crowdLongPct: number | null;
    watchAccountLongPct: number | null;
    crowdAccountLongPct: number | null;
    stanceNotional: Stance;
    stanceAccounts: Stance;
  };
  watch: { label: string; sampleSize: number; overall: SideSplit };
  crowd: { label: string; sampleSize: number; overall: SideSplit };
  coins: Array<{
    coin: string;
    watchLongPct: number | null;
    crowdLongPct: number | null;
    stance: Stance;
    watch: SideSplit | null;
    crowd: SideSplit | null;
    market: {
      openInterestUsd: number;
      funding: number;
      fundingAprPct: number;
      markPx: number;
    } | null;
  }>;
  cachedAt?: string;
  error?: string;
}

const CACHE_KEY = "bias";

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function pct(n: number | null): string {
  if (n == null) return "-";
  return `${n.toFixed(0)}%`;
}

function stanceLabel(s: Stance): { text: string; className: string } {
  switch (s) {
    case "against":
      return {
        text: "반대로 감",
        className: "border-amber-600/50 bg-amber-500/10 text-amber-200",
      };
    case "with":
      return {
        text: "같은 방향",
        className: "border-sky-600/50 bg-sky-500/10 text-sky-200",
      };
    case "mixed":
      return {
        text: "뚜렷하지 않음",
        className: "border-zinc-700 bg-zinc-800/40 text-zinc-400",
      };
    default:
      return {
        text: "비교 불가",
        className: "border-zinc-800 text-zinc-600",
      };
  }
}

function BiasBar({
  label,
  longPct,
  longUsd,
  shortUsd,
  accountsHint,
}: {
  label: string;
  longPct: number | null;
  longUsd: number;
  shortUsd: number;
  accountsHint?: string;
}) {
  const lp = longPct ?? 50;
  return (
    <div className="space-y-1.5 rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-zinc-200">{label}</span>
        <span className="text-xs tabular-nums text-zinc-500">
          {fmtUsd(longUsd + shortUsd)}
        </span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-rose-500/60">
        <div className="bg-emerald-500/80" style={{ width: `${lp}%` }} />
      </div>
      <div className="flex justify-between text-[11px] tabular-nums">
        <span className="text-emerald-400">
          롱 {pct(longPct)} · {fmtUsd(longUsd)}
        </span>
        <span className="text-rose-400">
          숏 {pct(longPct == null ? null : 100 - longPct)} · {fmtUsd(shortUsd)}
        </span>
      </div>
      {accountsHint ? (
        <p className="text-[11px] text-zinc-600">{accountsHint}</p>
      ) : null}
    </div>
  );
}

export function HlBiasPanel() {
  const [data, setData] = useState<BiasPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hl-traders/bias");
      const json = (await res.json()) as BiasPayload;
      if (json.error) throw new Error(json.error);
      setData(json);
      writeHlCache(CACHE_KEY, json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "관점 비교 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = readHlCache<BiasPayload>(CACHE_KEY);
    if (cached) {
      setData(cached.data);
      setLoading(false);
    }
    void load();
    const onSync = () => void load();
    window.addEventListener(HL_SYNCED_EVENT, onSync);
    return () => window.removeEventListener(HL_SYNCED_EVENT, onSync);
  }, [load]);

  if (!data && loading) {
    return (
      <p className="py-4 text-center text-sm text-zinc-500">
        탑트레이더 vs 대중 관점 비교 불러오는 중…
      </p>
    );
  }

  if (!data) {
    return (
      <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-200">
        {error ?? "데이터 없음"}
      </div>
    );
  }

  const st = stanceLabel(data.overall.stanceNotional);
  const stAcc = stanceLabel(data.overall.stanceAccounts);

  return (
    <div className="space-y-3 rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-zinc-100">
            관점 비교 · 탑트레이더 vs 대중
          </h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
            {data.marketNote}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] ${st.className}`}
          >
            규모 기준 {st.text}
          </span>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] ${stAcc.className}`}
          >
            계좌 수 {stAcc.text}
          </span>
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
          >
            {loading ? "갱신 중…" : "새로고침"}
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <BiasBar
          label={`${data.watch.label} (${data.watch.sampleSize}명)`}
          longPct={data.overall.watchLongPct}
          longUsd={data.watch.overall.longUsd}
          shortUsd={data.watch.overall.shortUsd}
          accountsHint={`계좌: 롱 ${data.watch.overall.longAccounts} · 숏 ${data.watch.overall.shortAccounts} · 양방향 ${data.watch.overall.bothAccounts}`}
        />
        <BiasBar
          label={`${data.crowd.label} (${data.crowd.sampleSize}명)`}
          longPct={data.overall.crowdLongPct}
          longUsd={data.crowd.overall.longUsd}
          shortUsd={data.crowd.overall.shortUsd}
          accountsHint={`계좌: 롱 ${data.crowd.overall.longAccounts} · 숏 ${data.crowd.overall.shortAccounts} · 양방향 ${data.crowd.overall.bothAccounts}`}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-zinc-800 text-[11px] uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-2 py-1.5 font-medium">코인</th>
              <th className="px-2 py-1.5 font-medium">관심 롱%</th>
              <th className="px-2 py-1.5 font-medium">대중 롱%</th>
              <th className="px-2 py-1.5 font-medium">관점</th>
              <th className="px-2 py-1.5 font-medium">시장 OI</th>
              <th className="px-2 py-1.5 font-medium">펀딩(연환산)</th>
            </tr>
          </thead>
          <tbody>
            {data.coins.slice(0, 14).map((row) => {
              const s = stanceLabel(row.stance);
              const fund = row.market?.fundingAprPct;
              return (
                <tr
                  key={row.coin}
                  className="border-b border-zinc-900/80 text-zinc-300"
                >
                  <td className="px-2 py-1.5 font-medium text-zinc-100">
                    {row.coin}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">
                    <span
                      className={
                        (row.watchLongPct ?? 50) >= 50
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }
                    >
                      {pct(row.watchLongPct)}
                    </span>
                    {row.watch ? (
                      <span className="ml-1 text-[10px] text-zinc-600">
                        {fmtUsd(row.watch.longUsd + row.watch.shortUsd)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">
                    <span
                      className={
                        (row.crowdLongPct ?? 50) >= 50
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }
                    >
                      {pct(row.crowdLongPct)}
                    </span>
                    {row.crowd ? (
                      <span className="ml-1 text-[10px] text-zinc-600">
                        {fmtUsd(row.crowd.longUsd + row.crowd.shortUsd)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] ${s.className}`}
                    >
                      {s.text}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-zinc-400">
                    {row.market ? fmtUsd(row.market.openInterestUsd) : "-"}
                  </td>
                  <td
                    className={`px-2 py-1.5 tabular-nums ${
                      fund == null
                        ? "text-zinc-600"
                        : fund > 0
                          ? "text-rose-400/90"
                          : "text-emerald-400/90"
                    }`}
                    title={
                      fund == null
                        ? undefined
                        : fund > 0
                          ? "롱이 숏에게 지불 → 롱 과열 쪽"
                          : "숏이 롱에게 지불 → 숏 과열 쪽"
                    }
                  >
                    {fund == null
                      ? "-"
                      : `${fund >= 0 ? "+" : ""}${fund.toFixed(0)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-zinc-600">
        펀딩 + = 롱 과열(롱이 비용 지불) · − = 숏 과열. 시장 OI는 한쪽 규모(롱=숏
        달러는 같음). 캐시 약 5분.
      </p>
    </div>
  );
}
