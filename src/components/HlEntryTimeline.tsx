"use client";

import { useMemo, useState } from "react";
import type { HlRecentEntry } from "@/lib/hyperliquid/types";
import { formatKst } from "@/lib/utils/format";

function shortAddr(a: string): string {
  if (a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function kstHourLabel(ms: number): string {
  return new Date(ms).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    hour12: false,
  }).replace(/\s/g, "") + "시";
}

function kstTickLabel(ms: number, spanMs: number): string {
  const d = new Date(ms);
  if (spanMs > 36 * 3600_000) {
    return d.toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      hour12: false,
    });
  }
  return kstHourLabel(ms);
}

export function HlEntryTimeline({
  entries,
  focusKey,
  entryKey,
  onSelect,
}: {
  entries: HlRecentEntry[];
  focusKey: string | null;
  entryKey: (e: HlRecentEntry) => string;
  onSelect: (e: HlRecentEntry) => void;
}) {
  const coins = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) m.set(e.coin, (m.get(e.coin) ?? 0) + 1);
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([coin]) => coin);
  }, [entries]);

  const [coinFilter, setCoinFilter] = useState<string>("ALL");

  const filtered = useMemo(
    () =>
      coinFilter === "ALL"
        ? entries
        : entries.filter((e) => e.coin === coinFilter),
    [entries, coinFilter]
  );

  const { minT, span, ticks, maxNotional } = useMemo(() => {
    if (filtered.length === 0) {
      const now = Date.now();
      return {
        minT: now - 3600_000,
        maxT: now,
        span: 3600_000,
        ticks: [] as number[],
        maxNotional: 1,
      };
    }
    const times = filtered.map((e) => e.lastTime);
    let minT = Math.min(...times);
    let maxT = Math.max(...times);
    if (maxT <= minT) {
      minT -= 30 * 60_000;
      maxT += 30 * 60_000;
    } else {
      const pad = (maxT - minT) * 0.06;
      minT -= pad;
      maxT += pad;
    }
    const span = maxT - minT;
    const tickCount = span > 48 * 3600_000 ? 6 : span > 12 * 3600_000 ? 8 : 7;
    const ticks: number[] = [];
    for (let i = 0; i < tickCount; i++) {
      ticks.push(minT + (span * i) / (tickCount - 1));
    }
    const maxNotional = Math.max(...filtered.map((e) => e.notional), 1);
    return { minT, maxT, span, ticks, maxNotional };
  }, [filtered]);

  if (entries.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setCoinFilter("ALL")}
          className={`rounded border px-2 py-0.5 text-[11px] ${
            coinFilter === "ALL"
              ? "border-zinc-500 text-zinc-100"
              : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
          }`}
        >
          전체 코인
        </button>
        {coins.slice(0, 12).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCoinFilter(c)}
            className={`rounded border px-2 py-0.5 text-[11px] ${
              coinFilter === c
                ? "border-emerald-600/60 text-emerald-300"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2 pb-1 pt-2">
        <div className="mb-1 flex justify-between text-[10px] text-zinc-600">
          <span>롱 ↑</span>
          <span>시간 →</span>
          <span>숏 ↓</span>
        </div>

        <div className="relative h-40 w-full">
          {/* center axis */}
          <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-zinc-600" />

          {/* hour ticks */}
          {ticks.map((t) => {
            const x = ((t - minT) / span) * 100;
            return (
              <div
                key={t}
                className="absolute top-0 bottom-5 w-px bg-zinc-800/80"
                style={{ left: `${x}%` }}
              />
            );
          })}

          {filtered.map((e) => {
            const key = entryKey(e);
            const x = ((e.lastTime - minT) / span) * 100;
            const isLong = e.side === "LONG";
            const size = 8 + Math.min(14, (e.notional / maxNotional) * 14);
            const stemH = 14 + size * 0.35;
            const focused = focusKey === key;
            const color = isLong ? "#34d399" : "#f87171";

            return (
              <button
                key={key}
                type="button"
                title={`${formatKst(e.lastTime)} · ${e.label || shortAddr(e.address)} · ${e.coin} ${e.side} ${fmtUsd(e.notional)}`}
                onClick={() => onSelect(e)}
                className="absolute z-[1] flex -translate-x-1/2 flex-col items-center"
                style={{
                  left: `${x}%`,
                  top: isLong ? `calc(50% - ${stemH + size}px)` : "50%",
                  height: stemH + size,
                }}
              >
                {isLong ? (
                  <>
                    <span
                      className={`rounded-full ${focused ? "ring-2 ring-white/50" : ""}`}
                      style={{
                        width: size,
                        height: size,
                        background: color,
                        boxShadow: focused
                          ? `0 0 0 2px ${color}55`
                          : undefined,
                      }}
                    />
                    <span
                      className="w-px flex-1"
                      style={{ background: color, opacity: 0.85 }}
                    />
                  </>
                ) : (
                  <>
                    <span
                      className="w-px flex-1"
                      style={{ background: color, opacity: 0.85 }}
                    />
                    <span
                      className={`rounded-full ${focused ? "ring-2 ring-white/50" : ""}`}
                      style={{
                        width: size,
                        height: size,
                        background: color,
                        boxShadow: focused
                          ? `0 0 0 2px ${color}55`
                          : undefined,
                      }}
                    />
                  </>
                )}
              </button>
            );
          })}

          {/* time labels */}
          <div className="absolute bottom-0 left-0 right-0 h-5">
            {ticks.map((t) => {
              const x = ((t - minT) / span) * 100;
              return (
                <span
                  key={`lbl-${t}`}
                  className="absolute -translate-x-1/2 text-[10px] tabular-nums text-zinc-500"
                  style={{ left: `${x}%` }}
                >
                  {kstTickLabel(t, span)}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-zinc-600">
        점을 누르면 해당 진입 차트·타점이 열립니다. 초록=롱 · 빨강=숏 · 점
        크기=규모
        {coinFilter !== "ALL" ? ` · 필터 ${coinFilter}` : ""} · {filtered.length}
        건
      </p>
    </div>
  );
}
