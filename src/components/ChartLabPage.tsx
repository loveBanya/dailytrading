"use client";

import Link from "next/link";
import { IndicatorBacktestPanel } from "./IndicatorBacktestPanel";

export function ChartLabPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-zinc-800 pb-4">
        <div>
          <p className="text-[11px] tracking-wide text-zinc-500">CHART LAB</p>
          <h1 className="mt-0.5 text-xl font-semibold text-zinc-50">차트 · 전략 백테스트</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-400">
            지표·익절·이름 있는 전략을 같은 봉으로 돌려 보는 작업실입니다. 일지 복기용 규칙(1R,
            손익비)을 검증할 때 씁니다.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
        >
          ← 매매일지
        </Link>
      </header>
      <IndicatorBacktestPanel />
    </div>
  );
}
