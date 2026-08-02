"use client";

import { useEffect, useMemo, useState } from "react";
import type { Trade } from "@/lib/exchanges/types";
import type { Candle } from "@/lib/exchanges/klines";
import {
  estimateDurationMinutes,
  estimateEntryTimeSec,
} from "@/lib/exchanges/estimate-entry";
import {
  formatDuration,
  formatKst,
  formatPnl,
  formatPrice,
} from "@/lib/utils/format";
import { exchangeLabel, statusLabel } from "@/lib/utils/labels";
import { TradeChart } from "./TradeChart";
import { TradeComments } from "./TradeComments";

type TradeStyle = "원칙" | "뇌동" | null;

interface TradeChartCardProps {
  trade: Trade;
  onUpdated?: (trade: Trade) => void;
  defaultOpen?: boolean;
}

function resolveStyle(trade: Trade): TradeStyle {
  if (trade.trade_style === "원칙" || trade.trade_style === "뇌동") {
    return trade.trade_style;
  }
  const tags = trade.tags ?? [];
  if (tags.includes("원칙")) return "원칙";
  if (tags.includes("뇌동")) return "뇌동";
  return null;
}

export function TradeChartCard({
  trade,
  onUpdated,
  defaultOpen = false,
}: TradeChartCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isReview, setIsReview] = useState(Boolean(trade.is_review));
  const [tradeStyle, setTradeStyle] = useState<TradeStyle>(resolveStyle(trade));
  const [commentCount, setCommentCount] = useState(trade.comment_count ?? 0);

  const asset = trade.base_asset ?? trade.symbol.replace(/USDT$/i, "");
  const sideLabel = trade.side === "LONG" ? "롱" : "숏";
  const isWin = Number(trade.pnl) >= 0;

  useEffect(() => {
    setIsReview(
      Boolean(trade.is_review) || (trade.tags ?? []).includes("오답노트")
    );
    setTradeStyle(resolveStyle(trade));
    if (trade.comment_count != null) setCommentCount(trade.comment_count);
  }, [trade.id, trade.is_review, trade.tags, trade.trade_style, trade.comment_count]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const exitMs = new Date(trade.exit_time).getTime();
        // Bybit이 진입=청산 시각을 같게 주므로, 일단 넓은 창으로 캔들을 가져온 뒤 진입시각 추정
        const lookbackMs = 48 * 60 * 60 * 1000;
        const qs = new URLSearchParams({
          symbol: trade.symbol,
          start: String(exitMs - lookbackMs),
          end: String(Math.min(Date.now(), exitMs + 3 * 60 * 60 * 1000)),
          interval: pickFetchInterval(trade.duration_minutes),
          limit: "300",
          exchange: trade.exchange === "binance" ? "binance" : "auto",
        });
        const res = await fetch(`/api/klines?${qs}`);
        const data = (await res.json()) as {
          candles?: Candle[];
          error?: string;
        };
        if (data.error || !res.ok) {
          const { fetchKlinesBrowser } = await import(
            "@/lib/exchanges/klines-browser"
          );
          const candles = await fetchKlinesBrowser({
            symbol: trade.symbol,
            start: exitMs - lookbackMs,
            end: Math.min(Date.now(), exitMs + 3 * 60 * 60 * 1000),
            interval: pickFetchInterval(trade.duration_minutes),
            limit: 300,
          });
          if (!cancelled) setCandles(candles);
          return;
        }
        if (!cancelled) setCandles(data.candles ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "차트 로드 실패");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, trade.symbol, trade.exit_time, trade.duration_minutes]);

  const exit = Number(trade.exit_price);
  const entry = Number(trade.entry_price);
  const exitSec = Math.floor(new Date(trade.exit_time).getTime() / 1000);
  const dbEntrySec = Math.floor(new Date(trade.entry_time).getTime() / 1000);
  const timesBroken = Math.abs(exitSec - dbEntrySec) < 60;

  const chartTiming = useMemo(() => {
    let entrySec = dbEntrySec;
    if (timesBroken && candles.length > 0) {
      const estimated = estimateEntryTimeSec(
        candles,
        entry,
        exitSec,
        trade.side
      );
      if (estimated != null && estimated < exitSec) {
        entrySec = estimated;
      } else {
        // 추정 실패 시 청산 4시간 전
        entrySec = exitSec - 4 * 3600;
      }
    } else if (!timesBroken && trade.duration_minutes === 0) {
      const estimated = estimateEntryTimeSec(
        candles,
        entry,
        exitSec,
        trade.side
      );
      if (estimated != null && estimated < exitSec) entrySec = estimated;
    }

    const dur =
      trade.duration_minutes && trade.duration_minutes > 0 && !timesBroken
        ? trade.duration_minutes
        : estimateDurationMinutes(entrySec, exitSec);

    return { entrySec, exitSec: Math.max(exitSec, entrySec + 60), dur };
  }, [
    candles,
    dbEntrySec,
    exitSec,
    entry,
    trade.side,
    trade.duration_minutes,
    timesBroken,
  ]);

  // 차트용 캔들: 추정 진입 기준으로 앞뒤만 잘라 확대 품질 확보
  const chartCandles = useMemo(() => {
    if (!candles.length) return candles;
    const { entrySec, exitSec: ex } = chartTiming;
    const hold = Math.max(ex - entrySec, 30 * 60);
    const from = entrySec - hold * 2.2;
    const to = ex + hold * 1.2;
    const sliced = candles.filter((c) => c.time >= from && c.time <= to);
    return sliced.length >= 10 ? sliced : candles;
  }, [candles, chartTiming]);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch("/api/trades", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: trade.id, ...body }),
      });
      const data = (await res.json()) as { trade?: Trade; error?: string };
      if (data.error) throw new Error(data.error);
      if (data.trade) onUpdated?.(data.trade);
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function toggleReview() {
    const next = !isReview;
    setIsReview(next);
    const ok = await patch({ is_review: next });
    if (!ok) setIsReview(!next);
  }

  async function setStyle(style: TradeStyle) {
    const prev = tradeStyle;
    setTradeStyle(style);
    const ok = await patch({ trade_style: style });
    if (!ok) {
      const tags = new Set((trade.tags ?? []).filter(Boolean));
      tags.delete("원칙");
      tags.delete("뇌동");
      if (style) tags.add(style);
      const ok2 = await patch({ tags: [...tags] });
      if (!ok2) setTradeStyle(prev);
    }
  }

  const move = Math.abs(exit - entry) || entry * 0.008;
  // PnL 기준으로 TP/SL 판정 (가격만 보면 수수료 때문에 어긋남)
  const isTp =
    trade.status === "TP" ||
    (trade.status !== "SL" && Number(trade.pnl) > 0);
  let tp: number | null;
  let sl: number | null;
  if (isTp) {
    tp = exit;
    sl = trade.side === "LONG" ? entry - move * 1.5 : entry + move * 1.5;
  } else {
    sl = exit;
    tp = trade.side === "LONG" ? entry + move * 0.8 : entry - move * 0.8;
  }

  const displayStatus = isTp ? "TP" : trade.status === "CLOSED" ? "CLOSED" : "SL";

  const sideCls =
    trade.side === "LONG" ? "text-emerald-400" : "text-rose-400";

  const summary = (
    <>
      <span className="font-semibold text-zinc-50">{asset}</span>
      <span className={`font-semibold ${sideCls}`}>{sideLabel}</span>
      <span className="text-zinc-600">·</span>
      <span className="text-zinc-400">{exchangeLabel(trade.exchange)}</span>
      <span className="text-zinc-600">·</span>
      <span
        className={
          displayStatus === "TP"
            ? "text-emerald-400"
            : displayStatus === "SL"
              ? "text-rose-400"
              : "text-zinc-400"
        }
      >
        {statusLabel(displayStatus)}
      </span>
      <span className="text-zinc-600">·</span>
      <span className={isWin ? "text-emerald-400" : "text-rose-400"}>
        순손익 {formatPnl(Number(trade.pnl))}
      </span>
      <span className="text-zinc-600">·</span>
      <span className="text-zinc-400">
        보유 {formatDuration(chartTiming.dur || trade.duration_minutes)}
      </span>
      <span className="text-zinc-600">·</span>
      <span className="tabular-nums text-zinc-500">
        {formatKst(trade.exit_time)} KST
      </span>
      {tradeStyle && (
        <>
          <span className="text-zinc-600">·</span>
          <span
            className={
              tradeStyle === "원칙" ? "text-sky-400" : "text-orange-400"
            }
          >
            {tradeStyle}
          </span>
        </>
      )}
      {isReview && (
        <>
          <span className="text-zinc-600">·</span>
          <span className="text-amber-400">오답</span>
        </>
      )}
      {commentCount > 0 && (
        <>
          <span className="text-zinc-600">·</span>
          <span className="text-zinc-400">댓글 {commentCount}</span>
        </>
      )}
    </>
  );

  return (
    <article className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-zinc-900/60"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm sm:text-base">
          {summary}
        </div>
        <span className="shrink-0 text-xs text-zinc-500">
          {open ? "접기 ▲" : "펼치기 ▼"}
        </span>
      </button>

      {open && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-500">매매 유형</span>
              <StyleChip
                active={tradeStyle === "원칙"}
                label="원칙매매"
                tone="sky"
                disabled={saving}
                onClick={() =>
                  void setStyle(tradeStyle === "원칙" ? null : "원칙")
                }
              />
              <StyleChip
                active={tradeStyle === "뇌동"}
                label="뇌동"
                tone="orange"
                disabled={saving}
                onClick={() =>
                  void setStyle(tradeStyle === "뇌동" ? null : "뇌동")
                }
              />
            </div>
            <button
              type="button"
              onClick={() => void toggleReview()}
              disabled={saving}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                isReview
                  ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
              }`}
            >
              {isReview ? "★ 오답노트" : "☆ 오답노트 지정"}
            </button>
          </div>

          <div className="border-t border-zinc-800 bg-zinc-950/40 px-4 py-2 text-xs text-zinc-500">
            <span className={sideCls}>{sideLabel}</span>
            {" · "}
            {exchangeLabel(trade.exchange)}
            {" · "}
            진입 {formatPrice(entry)} · 청산 {formatPrice(exit)}
            {tp != null && ` · TP ${formatPrice(tp)}`}
            {sl != null && ` · SL ${formatPrice(sl)}`}
            <br className="sm:hidden" />
            <span className="sm:ml-1">
              {" · "}
              {formatKst(new Date(chartTiming.entrySec * 1000))}
              {" → "}
              {formatKst(trade.exit_time)} KST
            </span>
            {timesBroken && (
              <span className="ml-2 text-amber-500/80">
                (진입시각 차트 추정)
              </span>
            )}
          </div>

          <div className="bg-white p-3 sm:p-4">
            {loading && (
              <div className="flex h-[440px] items-center justify-center text-sm text-zinc-400">
                차트 불러오는 중…
              </div>
            )}
            {error && (
              <div className="flex h-40 items-center justify-center text-sm text-rose-500">
                {error}
              </div>
            )}
            {!loading && !error && chartCandles.length > 0 && (
              <TradeChart
                candles={chartCandles}
                height={440}
                levels={{
                  entry,
                  exit,
                  tp,
                  sl,
                  entryTime: chartTiming.entrySec,
                  exitTime: chartTiming.exitSec,
                  side: trade.side,
                }}
              />
            )}
            {!loading && !error && chartCandles.length === 0 && (
              <div className="flex h-40 items-center justify-center text-sm text-zinc-400">
                캔들 데이터 없음
              </div>
            )}
          </div>

          <TradeComments
            tradeId={trade.id}
            legacyNotes={trade.notes}
            onCountChange={setCommentCount}
          />
        </>
      )}
    </article>
  );
}

function pickFetchInterval(durationMinutes: number | null): string {
  const d = durationMinutes && durationMinutes > 0 ? durationMinutes : 180;
  if (d <= 90) return "1";
  if (d <= 360) return "5";
  if (d <= 720) return "15";
  return "30";
}

function StyleChip({
  active,
  label,
  tone,
  disabled,
  onClick,
}: {
  active: boolean;
  label: string;
  tone: "sky" | "orange";
  disabled?: boolean;
  onClick: () => void;
}) {
  const activeCls =
    tone === "sky"
      ? "border-sky-500/50 bg-sky-500/15 text-sky-300"
      : "border-orange-500/50 bg-orange-500/15 text-orange-300";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
        active
          ? activeCls
          : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
      }`}
    >
      {label}
    </button>
  );
}
