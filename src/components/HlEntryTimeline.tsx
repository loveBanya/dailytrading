"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/** ko-KR hour 포맷은 이미 "20시"라서 뒤에 시를 또 붙이면 "20시시"가 됨 → en-GB 숫자만 사용 */
function kstParts(ms: number): {
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
  };
}

function kstTickLabel(ms: number, spanMs: number): string {
  const { month, day, hour, minute } = kstParts(ms);
  if (spanMs > 36 * 3600_000) {
    return `${month}/${day} ${hour}시`;
  }
  if (spanMs <= 3 * 3600_000) {
    return `${hour}:${String(minute).padStart(2, "0")}`;
  }
  return `${hour}시`;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 12;

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
  const [zoom, setZoom] = useState(1);
  /** 보이는 구간 중심 (전체 구간의 0~1) */
  const [pan, setPan] = useState(0.5);
  const dragRef = useRef<{
    startX: number;
    startPan: number;
    width: number;
  } | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () =>
      coinFilter === "ALL"
        ? entries
        : entries.filter((e) => e.coin === coinFilter),
    [entries, coinFilter]
  );

  const fullRange = useMemo(() => {
    if (filtered.length === 0) {
      const now = Date.now();
      return { fullMin: now - 3600_000, fullMax: now, fullSpan: 3600_000 };
    }
    const times = filtered.map((e) => e.lastTime);
    let fullMin = Math.min(...times);
    let fullMax = Math.max(...times);
    if (fullMax <= fullMin) {
      fullMin -= 30 * 60_000;
      fullMax += 30 * 60_000;
    } else {
      const pad = (fullMax - fullMin) * 0.06;
      fullMin -= pad;
      fullMax += pad;
    }
    return { fullMin, fullMax, fullSpan: fullMax - fullMin };
  }, [filtered]);

  const { minT, span, ticks, maxNotional, visible } = useMemo(() => {
    const { fullMin, fullMax, fullSpan } = fullRange;
    const viewSpan = fullSpan / zoom;
    let center = fullMin + fullSpan * pan;
    let minT = center - viewSpan / 2;
    let maxT = center + viewSpan / 2;
    if (minT < fullMin) {
      maxT += fullMin - minT;
      minT = fullMin;
    }
    if (maxT > fullMax) {
      minT -= maxT - fullMax;
      maxT = fullMax;
    }
    minT = Math.max(fullMin, minT);
    maxT = Math.min(fullMax, maxT);
    const span = Math.max(maxT - minT, 1);

    const tickCount =
      span > 48 * 3600_000 ? 6 : span > 12 * 3600_000 ? 8 : span > 3 * 3600_000 ? 7 : 6;
    const ticks: number[] = [];
    for (let i = 0; i < tickCount; i++) {
      ticks.push(minT + (span * i) / (tickCount - 1));
    }

    const visible = filtered.filter(
      (e) => e.lastTime >= minT - span * 0.02 && e.lastTime <= maxT + span * 0.02
    );
    const maxNotional = Math.max(...visible.map((e) => e.notional), 1);
    return { minT, maxT, span, ticks, maxNotional, visible };
  }, [filtered, fullRange, zoom, pan]);

  const zoomBy = useCallback(
    (factor: number, anchor = 0.5) => {
      setZoom((z) => {
        const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * factor));
        if (next === z) return z;
        setPan((p) => {
          const { fullMin, fullSpan } = fullRange;
          const viewSpan = fullSpan / z;
          const viewMin = fullMin + fullSpan * p - viewSpan / 2;
          const anchorTime = viewMin + viewSpan * anchor;
          const newView = fullSpan / next;
          const newMin = anchorTime - newView * anchor;
          const newCenter = newMin + newView / 2;
          return Math.min(1, Math.max(0, (newCenter - fullMin) / fullSpan));
        });
        return next;
      });
    },
    [fullRange]
  );

  const resetView = useCallback(() => {
    setZoom(1);
    setPan(0.5);
  }, []);

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const anchor = (e.clientX - rect.left) / Math.max(rect.width, 1);
      if (e.deltaY < 0) zoomBy(1.25, anchor);
      else zoomBy(1 / 1.25, anchor);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  if (entries.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setCoinFilter("ALL");
            resetView();
          }}
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
            onClick={() => {
              setCoinFilter(c);
              resetView();
            }}
            className={`rounded border px-2 py-0.5 text-[11px] ${
              coinFilter === c
                ? "border-emerald-600/60 text-emerald-300"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {c}
          </button>
        ))}
        <span className="mx-1 h-3 w-px bg-zinc-800" />
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.4, 0.5)}
          disabled={zoom <= ZOOM_MIN}
          className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
          title="축소"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1.4, 0.5)}
          disabled={zoom >= ZOOM_MAX}
          className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
          title="확대"
        >
          +
        </button>
        <button
          type="button"
          onClick={resetView}
          disabled={zoom === 1}
          className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-500 hover:text-zinc-300 disabled:opacity-30"
        >
          전체
        </button>
        <span className="text-[10px] tabular-nums text-zinc-600">
          {zoom.toFixed(1)}×
        </span>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2 pb-1 pt-2">
        <div className="mb-1 flex justify-between text-[10px] text-zinc-600">
          <span>롱 ↑</span>
          <span>휠=확대 · 드래그=이동</span>
          <span>숏 ↓</span>
        </div>

        <div
          ref={surfaceRef}
          className="relative h-40 w-full touch-none select-none"
          onPointerDown={(e) => {
            if (zoom <= 1) return;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            dragRef.current = {
              startX: e.clientX,
              startPan: pan,
              width: e.currentTarget.getBoundingClientRect().width,
            };
          }}
          onPointerMove={(e) => {
            const d = dragRef.current;
            if (!d) return;
            const dx = e.clientX - d.startX;
            // 오른쪽으로 드래그 → 과거로 (pan 감소)
            const delta = (-dx / d.width) * (1 / zoom);
            setPan(Math.min(1, Math.max(0, d.startPan + delta)));
          }}
          onPointerUp={() => {
            dragRef.current = null;
          }}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
        >
          <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-zinc-600" />

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

          {visible.map((e) => {
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
        점 클릭=차트 · +/−·휠=확대 · 확대 후 드래그=이동 · 초록=롱 · 빨강=숏
        {coinFilter !== "ALL" ? ` · 필터 ${coinFilter}` : ""} · 표시{" "}
        {visible.length}/{filtered.length}건
      </p>
    </div>
  );
}
