"use client";

import { useEffect, useMemo, useState } from "react";
import type { OverallStats } from "@/lib/stats/compute";

interface KellyPanelProps {
  overall: OverallStats | null;
  loading?: boolean;
}

/**
 * Kelly fraction f* = (b·p − q) / b
 * b = avgWin / |avgLoss|, p = winRate, q = 1−p
 */
export function KellyPanel({ overall, loading }: KellyPanelProps) {
  const [bankroll, setBankroll] = useState("1000");
  const [winRatePct, setWinRatePct] = useState("");
  const [avgWin, setAvgWin] = useState("");
  const [avgLoss, setAvgLoss] = useState("");
  const [fraction, setFraction] = useState(0.5); // half kelly default

  useEffect(() => {
    if (!overall || overall.trades === 0) return;
    setWinRatePct(overall.winRate.toFixed(2));
    setAvgWin(Math.abs(overall.avgWin).toFixed(2));
    setAvgLoss(Math.abs(overall.avgLoss).toFixed(2));
  }, [overall]);

  const result = useMemo(() => {
    const p = Number(winRatePct) / 100;
    const aw = Number(avgWin);
    const al = Math.abs(Number(avgLoss));
    const br = Number(bankroll);

    if (!(p > 0 && p < 1) || !(aw > 0) || !(al > 0) || !(br > 0)) {
      return null;
    }

    const b = aw / al;
    const q = 1 - p;
    const full = (b * p - q) / b;
    const sized = full * fraction;
    const edge = b * p - q;

    return {
      b,
      full,
      sized,
      edge,
      stake: Math.max(0, sized) * br,
      stakePct: Math.max(0, sized) * 100,
      fullPct: full * 100,
      positive: full > 0,
    };
  }, [winRatePct, avgWin, avgLoss, bankroll, fraction]);

  if (loading) {
    return <p className="text-sm text-zinc-500">통계 불러오는 중…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-zinc-500">
          켈리 공식으로 한 번에 걸 비중을 계산합니다. 매매 기록 승률·평균
          익/손으로 자동 채우고, 직접 수정할 수도 있습니다.
        </p>
        <p className="mt-1 text-xs text-zinc-600">
          f* = (b·p − q) / b · b = 평균익÷평균손 · p = 승률 · q = 1−p
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <NumField
          label="계좌 (USDT)"
          value={bankroll}
          onChange={setBankroll}
        />
        <NumField
          label="승률 (%)"
          value={winRatePct}
          onChange={setWinRatePct}
        />
        <NumField label="평균 익절 ($)" value={avgWin} onChange={setAvgWin} />
        <NumField
          label="평균 손절 ($)"
          value={avgLoss}
          onChange={setAvgLoss}
        />
        <label className="block text-xs text-zinc-500 sm:col-span-2">
          <span className="mb-1 block">
            적용 비율 ({Math.round(fraction * 100)}% Kelly)
          </span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={fraction}
            onChange={(e) => setFraction(Number(e.target.value))}
            className="w-full accent-emerald-500"
          />
          <span className="mt-1 flex justify-between text-[11px] text-zinc-600">
            <span>1/10</span>
            <span>Half</span>
            <span>Full</span>
          </span>
        </label>
      </div>

      {result ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="손익비 b"
            value={result.b.toFixed(2)}
          />
          <Metric
            label="Full Kelly"
            value={`${result.fullPct.toFixed(1)}%`}
            positive={result.positive}
          />
          <Metric
            label="적용 Kelly"
            value={`${result.stakePct.toFixed(1)}%`}
            positive={result.positive}
          />
          <Metric
            label="권장 베팅"
            value={`$${result.stake.toFixed(2)}`}
            positive={result.positive}
          />
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          승률·평균 익/손·계좌를 입력하면 결과가 표시됩니다.
        </p>
      )}

      {result && !result.positive && (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm text-rose-300">
          기대값이 음수입니다 (엣지 {result.edge.toFixed(3)}). 이 조건에서는
          켈리가 베팅하지 말라고 합니다.
        </p>
      )}

      {result && result.positive && (
        <p className="rounded-md border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-400">
          실전에서는 Full Kelly보다{" "}
          <span className="text-zinc-200">Half Kelly</span> 를 쓰는 편이
          안전합니다. 변동성·연속 손절을 감안해 더 줄여도 됩니다.
        </p>
      )}

      {overall && overall.trades > 0 && (
        <p className="text-xs text-zinc-600">
          현재 매매 기록 기준 · 거래 {overall.trades}회 · 승률{" "}
          {overall.winRate.toFixed(1)}% · 손익비{" "}
          {overall.rrRatio != null ? overall.rrRatio.toFixed(2) : "-"}
        </p>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs text-zinc-500">
      <span className="mb-1 block">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500/50"
      />
    </label>
  );
}

function Metric({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-md border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold tabular-nums ${
          positive === undefined
            ? "text-zinc-100"
            : positive
              ? "text-emerald-400"
              : "text-rose-400"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
