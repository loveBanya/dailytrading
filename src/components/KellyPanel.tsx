"use client";

import { useEffect, useMemo, useState } from "react";
import type { OverallStats } from "@/lib/stats/compute";

interface KellyPanelProps {
  overall: OverallStats | null;
  loading?: boolean;
  /** 실시간 자산이 있으면 계좌 기본값으로 사용 */
  defaultBankroll?: number | null;
}

/**
 * Kelly fraction f* = (b·p − q) / b
 * b = avgWin / |avgLoss|, p = winRate, q = 1−p
 */
export function KellyPanel({
  overall,
  loading,
  defaultBankroll,
}: KellyPanelProps) {
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

  useEffect(() => {
    if (defaultBankroll != null && defaultBankroll > 0) {
      setBankroll(defaultBankroll.toFixed(2));
    }
  }, [defaultBankroll]);

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
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4 text-sm text-zinc-400">
        <p className="font-medium text-zinc-200">어떻게 쓰나요?</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-4">
          <li>
            위 숫자는 매매 기록 승률·평균 익/손으로{" "}
            <span className="text-zinc-200">자동 채워집니다</span>.
          </li>
          <li>
            <span className="text-zinc-200">계좌(USDT)</span>에 지금 굴리는
            자금을 넣습니다. (실시간 자산이 있으면 자동 반영)
          </li>
          <li>
            슬라이더는 기본 <span className="text-zinc-200">Half Kelly(50%)</span>
            — 풀 켈리보다 안전하게 절반만 베팅하라는 뜻입니다.
          </li>
          <li>
            아래 <span className="text-emerald-400">권장 베팅 $</span> 만큼만
            다음 포지션에 넣는 기준으로 쓰면 됩니다.
          </li>
        </ol>
        <p className="mt-3 text-xs text-zinc-600">
          예: 권장 베팅 $120이면, 증거금·명목 합이 대략 그 근처가 되게
          사이즈를 잡습니다. Full Kelly는 이론상 최적이지만 변동이 커서 실전은
          Half~1/4을 권장합니다.
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
            <span>보수적</span>
            <span>Half</span>
            <span>Full</span>
          </span>
        </label>
      </div>

      {result ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="손익비 b" value={result.b.toFixed(2)} />
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
            emphasize
          />
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          거래소 동기화로 매매 기록이 쌓이면 승률·평균 익/손이 채워집니다.
        </p>
      )}

      {result && !result.positive && (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm text-rose-300">
          지금 승률·손익비로는 기대값이 마이너스입니다. 사이즈를 키우기보다
          전략을 먼저 손보는 편이 맞습니다.
        </p>
      )}

      {result && result.positive && (
        <p className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-200/90">
          → 다음 매매는 대략{" "}
          <span className="font-semibold text-emerald-300">
            ${result.stake.toFixed(2)}
          </span>{" "}
          (계좌의 {result.stakePct.toFixed(1)}%) 안쪽으로 잡으세요.
        </p>
      )}

      {overall && overall.trades > 0 && (
        <p className="text-xs text-zinc-600">
          매매 기록 기준 · {overall.trades}회 · 승률{" "}
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
  emphasize,
}: {
  label: string;
  value: string;
  positive?: boolean;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-3 py-2.5 ${
        emphasize
          ? "border-emerald-500/40 bg-emerald-500/10"
          : "border-zinc-800/80 bg-zinc-950/40"
      }`}
    >
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
