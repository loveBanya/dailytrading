"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Trade } from "@/lib/exchanges/types";
import { dayKeyKst } from "@/lib/stats/compute";
import { FAVORITE_TAG, isFavorite, isReviewed, ReviewTradeCard } from "./ReviewTradeCard";

type Mode = "day" | "review" | "favorite";

function styleOf(trade: Trade): "원칙" | "뇌동" | null {
  if (trade.trade_style === "원칙" || trade.trade_style === "뇌동") return trade.trade_style;
  const tags = trade.tags ?? [];
  if (tags.includes("원칙")) return "원칙";
  if (tags.includes("뇌동")) return "뇌동";
  return null;
}

function dayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00+09:00`);
  const week = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))} (${week})`;
}

function won(usdt: number, fx: number): string {
  const v = Math.round(usdt * fx);
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toLocaleString("ko-KR")}원`;
}

function newestFirst(a: Trade, b: Trade): number {
  return new Date(b.exit_time).getTime() - new Date(a.exit_time).getTime();
}

export function DailyReviewPanel({
  trades,
  fx,
  lossLimitUsdt,
  focus,
  onUpdated,
}: {
  trades: Trade[];
  fx: number;
  /** 트레이딩 게임 하루 손실 한도. 한 번에 이만큼 잃으면 과한 손실로 본다 */
  lossLimitUsdt: number;
  /** 댓글·알림에서 이 매매로 바로 간다 */
  focus?: { id: string; nonce: number } | null;
  onUpdated?: (trade: Trade) => void;
}) {
  const [mode, setMode] = useState<Mode>("day");
  const [selected, setSelected] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [showAllCandidates, setShowAllCandidates] = useState(false);

  const days = useMemo(() => {
    const map = new Map<string, Trade[]>();
    for (const t of trades) {
      const day = dayKeyKst(t.exit_time);
      const list = map.get(day) ?? [];
      list.push(t);
      map.set(day, list);
    }
    return [...map.entries()]
      .map(([day, list]) => ({
        day,
        trades: [...list].sort((a, b) => -newestFirst(a, b)),
        pnl: list.reduce((s, t) => s + (Number(t.pnl) || 0), 0),
      }))
      .sort((a, b) => b.day.localeCompare(a.day));
  }, [trades]);

  const avgLoss = useMemo(() => {
    const losses = trades.map((t) => Number(t.pnl) || 0).filter((p) => p < 0);
    return losses.length ? -losses.reduce((s, p) => s + p, 0) / losses.length : 0;
  }, [trades]);
  const bigLossLine = Math.min(
    avgLoss > 0 ? avgLoss * 2 : Number.POSITIVE_INFINITY,
    lossLimitUsdt > 0 ? lossLimitUsdt : Number.POSITIVE_INFINITY
  );
  const isBigLoss = useCallback(
    (t: Trade) => Number.isFinite(bigLossLine) && -(Number(t.pnl) || 0) >= bigLossLine,
    [bigLossLine]
  );

  const reviewed = useMemo(() => trades.filter(isReviewed).sort(newestFirst), [trades]);
  const favorites = useMemo(() => trades.filter(isFavorite).sort(newestFirst), [trades]);
  const candidates = useMemo(
    () => trades.filter((t) => isBigLoss(t) && !isReviewed(t)).sort(newestFirst),
    [trades, isBigLoss]
  );

  // 댓글·알림에서 넘어온 매매는 그 날짜로 바꿔 둔다
  const [seenFocus, setSeenFocus] = useState<number | null>(null);
  if (focus && focus.nonce !== seenFocus) {
    const target = trades.find((t) => t.id === focus.id);
    if (target) {
      setSeenFocus(focus.nonce);
      setMode("day");
      setSelected(dayKeyKst(target.exit_time));
      setHighlight(focus.id);
    }
  }

  useEffect(() => {
    if (!focus || focus.nonce !== seenFocus) return;
    const scroll = window.setTimeout(() => {
      document
        .getElementById(`review-${focus.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 250);
    const clear = window.setTimeout(() => setHighlight(null), 4000);
    return () => {
      window.clearTimeout(scroll);
      window.clearTimeout(clear);
    };
  }, [focus, seenFocus]);

  const day =
    selected && days.some((d) => d.day === selected) ? selected : (days[0]?.day ?? null);
  const current = days.find((d) => d.day === day) ?? null;
  const idx = current ? days.indexOf(current) : -1;
  const activeMonth = day?.slice(0, 7) ?? null;

  const months = useMemo(() => {
    const list: { month: string; newestDay: string; pnl: number; count: number }[] = [];
    for (const d of days) {
      const month = d.day.slice(0, 7);
      const last = list[list.length - 1];
      if (last?.month === month) {
        last.pnl += d.pnl;
        last.count += d.trades.length;
      } else {
        list.push({ month, newestDay: d.day, pnl: d.pnl, count: d.trades.length });
      }
    }
    return list;
  }, [days]);

  const summary = useMemo(() => {
    if (!current) return null;
    const wins = current.trades.filter((t) => Number(t.pnl) > 0).length;
    const losses = current.trades.filter((t) => Number(t.pnl) < 0).length;
    const fee = current.trades.reduce((s, t) => s + Math.abs(Number(t.fee) || 0), 0);
    const principle = current.trades.filter((t) => styleOf(t) === "원칙").length;
    const impulse = current.trades.filter((t) => styleOf(t) === "뇌동").length;
    const unmarked = current.trades.length - principle - impulse;
    const big = current.trades.filter(isBigLoss).length;
    return { wins, losses, fee, principle, impulse, unmarked, big };
  }, [current, isBigLoss]);

  const card = (trade: Trade) => (
    <ReviewTradeCard
      key={trade.id}
      trade={trade}
      fx={fx}
      bigLoss={isBigLoss(trade)}
      highlighted={highlight === trade.id}
      onUpdated={onUpdated}
    />
  );

  if (trades.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-700 p-10 text-center text-sm text-zinc-500">
        복기할 매매가 없습니다. 「거래소 동기화」로 기록을 가져오세요.
      </div>
    );
  }

  const shownCandidates = showAllCandidates ? candidates : candidates.slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["day", "날짜별"],
            ["review", `오답노트 ${reviewed.length}${candidates.length ? ` · 후보 ${candidates.length}` : ""}`],
            ["favorite", `즐겨찾기 ${favorites.length}`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
              mode === id
                ? id === "review"
                  ? "border-amber-500/60 bg-amber-500/15 text-amber-200"
                  : id === "favorite"
                    ? "border-yellow-300/60 bg-yellow-300/15 text-yellow-100"
                    : "border-zinc-300 bg-zinc-100 text-zinc-900"
                : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "day" && (
        <>
          <div className="pretty-scroll flex gap-1.5 overflow-x-auto pb-1">
            {months.map((m) => (
              <button
                key={m.month}
                type="button"
                onClick={() => setSelected(m.newestDay)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs transition ${
                  m.month === activeMonth
                    ? "border-zinc-300 bg-zinc-100 text-zinc-900"
                    : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                }`}
              >
                {m.month.slice(2, 4)}년 {Number(m.month.slice(5, 7))}월
                <span
                  className={`ml-1.5 tabular-nums ${
                    m.month === activeMonth
                      ? "text-zinc-600"
                      : m.pnl >= 0
                        ? "text-red-400"
                        : "text-blue-400"
                  }`}
                >
                  {m.count}건 · {won(m.pnl, fx)}
                </span>
              </button>
            ))}
          </div>
          <div className="pretty-scroll flex gap-1.5 overflow-x-auto pb-1">
            {days.filter((d) => d.day.startsWith(activeMonth ?? "")).map((d) => (
              <button
                key={d.day}
                type="button"
                onClick={() => setSelected(d.day)}
                className={`shrink-0 rounded-lg border px-3 py-2 text-left transition ${
                  d.day === day
                    ? "border-zinc-300 bg-zinc-100 text-zinc-900"
                    : "border-zinc-800 bg-zinc-950/40 text-zinc-300 hover:border-zinc-600"
                }`}
              >
                <p className="text-xs font-medium">{dayLabel(d.day)}</p>
                <p
                  className={`text-[11px] tabular-nums ${
                    d.day === day
                      ? "text-zinc-600"
                      : d.pnl >= 0
                        ? "text-red-400"
                        : "text-blue-400"
                  }`}
                >
                  {d.trades.length}건 · {won(d.pnl, fx)}
                </p>
              </button>
            ))}
          </div>

          {current && summary && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={idx >= days.length - 1}
                  onClick={() => setSelected(days[idx + 1]!.day)}
                  className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 disabled:opacity-30"
                >
                  ◀
                </button>
                <p className="text-base font-semibold text-zinc-100">{dayLabel(current.day)} 복기</p>
                <button
                  type="button"
                  disabled={idx <= 0}
                  onClick={() => setSelected(days[idx - 1]!.day)}
                  className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 disabled:opacity-30"
                >
                  ▶
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                <span className={current.pnl >= 0 ? "text-red-400" : "text-blue-400"}>
                  순손익 {won(current.pnl, fx)}
                </span>
                <span>
                  {summary.wins}승 {summary.losses}패
                </span>
                <span>수수료 {won(summary.fee, fx).replace("+", "")}</span>
                <span>
                  원칙 {summary.principle} · 뇌동 {summary.impulse}
                  {summary.unmarked > 0 && (
                    <span className="text-amber-300/80"> · 미분류 {summary.unmarked}</span>
                  )}
                </span>
                {summary.big > 0 && (
                  <span className="text-rose-300">과한 손실 {summary.big}건</span>
                )}
              </div>
            </div>
          )}

          {current?.trades.map(card)}
        </>
      )}

      {mode === "review" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
            <p className="text-sm font-medium text-rose-100">
              과한 손실 후보 {candidates.length}건
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              한 번에 {won(-bigLossLine, fx).replace("-", "")} (${bigLossLine.toFixed(2)}) 이상
              잃은 매매입니다. 평균 손실의 2배와 하루 손실 한도 중 작은 쪽을 기준으로
              잡았습니다. 카드의 「오답노트에 넣기」를 누르면 아래 목록으로 옮겨집니다.
            </p>
          </div>
          {shownCandidates.map(card)}
          {candidates.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAllCandidates((v) => !v)}
              className="w-full rounded-lg border border-dashed border-zinc-700 py-2 text-sm text-zinc-400 hover:text-zinc-200"
            >
              {showAllCandidates ? "후보 접기" : `후보 ${candidates.length - 5}건 더 보기`}
            </button>
          )}

          <p className="pt-2 text-sm font-medium text-amber-200">오답노트 {reviewed.length}건</p>
          {reviewed.length === 0 ? (
            <p className="text-sm text-zinc-500">아직 오답노트에 넣은 매매가 없습니다.</p>
          ) : (
            reviewed.map(card)
          )}
        </div>
      )}

      {mode === "favorite" && (
        <div className="space-y-4">
          {favorites.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">
              즐겨찾기한 매매가 없습니다. 카드의 ☆를 누르면 여기 모입니다. 태그
              「{FAVORITE_TAG}」로 저장됩니다.
            </p>
          ) : (
            favorites.map(card)
          )}
        </div>
      )}
    </div>
  );
}
