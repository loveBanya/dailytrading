"use client";

import {
  fmtPnl,
  fmtRoi,
  importanceScore,
  type HlImportance,
  trustSummary,
} from "@/lib/hyperliquid/perf";
import type { HlTrader } from "@/lib/hyperliquid/types";

function toneClass(tone: string): string {
  switch (tone) {
    case "good":
      return "border-emerald-700/50 bg-emerald-500/10 text-emerald-300";
    case "weak":
      return "border-rose-700/50 bg-rose-500/10 text-rose-300";
    case "mixed":
      return "border-amber-700/50 bg-amber-500/10 text-amber-200";
    default:
      return "border-zinc-700 text-zinc-500";
  }
}

function scoreClass(tier: HlImportance["tier"]): string {
  switch (tier) {
    case "focus":
      return "border-sky-600/60 bg-sky-500/15 text-sky-200";
    case "watch":
      return "border-zinc-600 text-zinc-300";
    default:
      return "border-zinc-800 text-zinc-500";
  }
}

function pnlClass(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n)) || Number(n) === 0) {
    return "text-zinc-500";
  }
  return Number(n) > 0 ? "text-emerald-400" : "text-rose-400";
}

export function HlTraderPerfBadge({
  trader,
  compact = false,
  importance,
}: {
  trader: HlTrader;
  compact?: boolean;
  /** 미리 계산한 점수. 없으면 기본(핀·노출 없이) 계산 */
  importance?: HlImportance;
}) {
  const trust = trustSummary(trader);
  const imp = importance ?? importanceScore(trader);
  const monthPnl =
    trader.pnl_month != null ? Number(trader.pnl_month) : null;
  const monthRoi =
    trader.roi_month != null ? Number(trader.roi_month) : null;
  const allPnl =
    trader.pnl_all_time != null ? Number(trader.pnl_all_time) : null;
  const weekPnl =
    trader.pnl_week != null ? Number(trader.pnl_week) : null;

  const hasAny =
    monthPnl != null || allPnl != null || weekPnl != null || monthRoi != null;

  if (!hasAny && trust.tone === "unknown") {
    return (
      <span className="text-[11px] text-zinc-600">성과 동기화 전</span>
    );
  }

  if (compact) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1 text-[11px]">
        <span
          className={`rounded border px-1.5 py-0.5 tabular-nums ${scoreClass(imp.tier)}`}
          title={imp.reasons.join(" · ") || imp.label}
        >
          {imp.score}점 · {imp.label}
        </span>
        <span
          className={`rounded border px-1.5 py-0.5 ${toneClass(trust.tone)}`}
          title={trust.detail}
        >
          {trust.label}
        </span>
        {monthRoi != null || monthPnl != null ? (
          <span className={`tabular-nums ${pnlClass(monthPnl ?? monthRoi)}`}>
            월 {monthRoi != null ? fmtRoi(monthRoi) : fmtPnl(monthPnl!)}
          </span>
        ) : null}
        {allPnl != null ? (
          <span className={`tabular-nums ${pnlClass(allPnl)}`}>
            누적 {fmtPnl(allPnl)}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded border px-2 py-0.5 text-[11px] tabular-nums ${scoreClass(imp.tier)}`}
          title={imp.reasons.join(" · ")}
        >
          {imp.score}점 · {imp.label}
        </span>
        <span
          className={`rounded border px-2 py-0.5 text-[11px] ${toneClass(trust.tone)}`}
        >
          {trust.label}
        </span>
        {allPnl != null && (
          <span className={`text-xs tabular-nums ${pnlClass(allPnl)}`}>
            올타임 {fmtPnl(allPnl)}
            {trader.roi_all_time != null
              ? ` (${fmtRoi(Number(trader.roi_all_time))})`
              : ""}
          </span>
        )}
        {(monthPnl != null || monthRoi != null) && (
          <span
            className={`text-xs tabular-nums ${pnlClass(monthPnl ?? monthRoi)}`}
          >
            월 {monthPnl != null ? fmtPnl(monthPnl) : ""}
            {monthRoi != null
              ? `${monthPnl != null ? " · " : ""}${fmtRoi(monthRoi)}`
              : ""}
          </span>
        )}
        {weekPnl != null && (
          <span className={`text-xs tabular-nums ${pnlClass(weekPnl)}`}>
            주 {fmtPnl(weekPnl)}
          </span>
        )}
        {trader.pnl_day != null && (
          <span
            className={`text-xs tabular-nums ${pnlClass(Number(trader.pnl_day))}`}
          >
            일 {fmtPnl(Number(trader.pnl_day))}
          </span>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500">
        {trust.detail}
        {imp.reasons.length > 0
          ? ` · 점수 근거: ${imp.reasons.join(", ")}`
          : ""}
      </p>
    </div>
  );
}
