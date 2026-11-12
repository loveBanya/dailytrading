"use client";

import { useEffect, useRef, useState } from "react";
import type { Trade } from "@/lib/exchanges/types";
import type { Candle } from "@/lib/exchanges/klines";
import { estimateEntryTimeSec } from "@/lib/exchanges/estimate-entry";
import { formatDuration, formatPrice } from "@/lib/utils/format";
import { exchangeLabel } from "@/lib/utils/labels";
import { BUY_COLOR, ReviewChart, SELL_COLOR } from "./ReviewChart";
import { TradeComments } from "./TradeComments";

type TradeStyle = "원칙" | "뇌동" | null;

export const FAVORITE_TAG = "즐찾";

export function isFavorite(trade: Trade): boolean {
  return (trade.tags ?? []).includes(FAVORITE_TAG);
}

export function isReviewed(trade: Trade): boolean {
  return Boolean(trade.is_review) || (trade.tags ?? []).includes("오답노트");
}

function styleOf(trade: Trade): TradeStyle {
  if (trade.trade_style === "원칙" || trade.trade_style === "뇌동") return trade.trade_style;
  const tags = trade.tags ?? [];
  if (tags.includes("원칙")) return "원칙";
  if (tags.includes("뇌동")) return "뇌동";
  return null;
}

function holdKind(minutes: number): string {
  if (minutes < 30) return "스캘핑";
  if (minutes < 24 * 60) return "데이";
  return "스윙";
}

function won(usdt: number, fx: number, signed = false): string {
  const v = Math.round(usdt * fx);
  const body = `${Math.abs(v).toLocaleString("ko-KR")}원`;
  if (!signed) return v < 0 ? `-${body}` : body;
  return v > 0 ? `+${body}` : v < 0 ? `-${body}` : body;
}

function kstDateTime(sec: number, withSeconds = false): string {
  return new Date(sec * 1000).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
    hour12: false,
  });
}

function kstClock(sec: number): string {
  return new Date(sec * 1000).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function intervalLabel(interval: string | null): string {
  if (!interval) return "";
  const n = Number(interval);
  if (Number.isFinite(n)) return n >= 60 ? `${n / 60}시간봉` : `${n}분봉`;
  return interval === "D" ? "일봉" : interval;
}

export function ReviewTradeCard({
  trade,
  fx,
  bigLoss = false,
  highlighted = false,
  onUpdated,
}: {
  trade: Trade;
  fx: number;
  bigLoss?: boolean;
  highlighted?: boolean;
  onUpdated?: (trade: Trade) => void;
}) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [interval, setInterval] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [style, setStyle] = useState<TradeStyle>(styleOf(trade));
  const [isReview, setIsReview] = useState(isReviewed(trade));
  const [starred, setStarred] = useState(isFavorite(trade));
  const [seenTrade, setSeenTrade] = useState(trade);
  if (seenTrade !== trade) {
    setSeenTrade(trade);
    setIsReview(isReviewed(trade));
    setStarred(isFavorite(trade));
    setStyle(styleOf(trade));
  }
  const [memoOpen, setMemoOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(trade.comment_count ?? 0);
  const [saving, setSaving] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void fetch(`/api/trades/chart?tradeId=${trade.id}`)
      .then(async (res) => {
        const data = (await res.json()) as {
          candles?: Candle[];
          interval?: string;
          source?: string | null;
          error?: string;
        };
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setCandles(data.candles ?? []);
        setInterval(data.interval ?? null);
        setSource(data.source ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "차트 로드 실패");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [trade.id, visible]);

  const entry = Number(trade.entry_price);
  const exit = Number(trade.exit_price);
  const qty = Number(trade.qty);
  const pnl = Number(trade.pnl) || 0;
  const fee = Math.abs(Number(trade.fee) || 0);
  const exitSec = Math.floor(new Date(trade.exit_time).getTime() / 1000);
  const dbEntrySec = Math.floor(new Date(trade.entry_time).getTime() / 1000);
  const timesBroken = Math.abs(exitSec - dbEntrySec) < 60;
  let entrySec = dbEntrySec;
  if (timesBroken && candles.length > 0) {
    const est = estimateEntryTimeSec(candles, entry, exitSec, trade.side);
    if (est != null && est < exitSec) entrySec = est;
  }
  const holdMin =
    trade.duration_minutes && trade.duration_minutes > 0 && !timesBroken
      ? trade.duration_minutes
      : Math.max(1, Math.round((exitSec - entrySec) / 60));
  const notional = entry * qty;
  const pnlPct = notional > 0 ? (pnl / notional) * 100 : 0;
  const asset = (trade.base_asset || trade.symbol).replace(/(USDT|USDC)$/i, "");
  const quote = trade.symbol.toUpperCase().endsWith("USDC") ? "USDC" : "USDT";
  const long = trade.side === "LONG";
  const exitFills = Number(trade.raw?.fillCount);
  const profitCls = pnl >= 0 ? "text-red-400" : "text-blue-400";

  async function patch(body: Record<string, unknown>): Promise<boolean> {
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

  async function chooseStyle(next: TradeStyle) {
    const prev = style;
    setStyle(next);
    if (!(await patch({ trade_style: next }))) {
      const tags = new Set((trade.tags ?? []).filter(Boolean));
      tags.delete("원칙");
      tags.delete("뇌동");
      if (next) tags.add(next);
      if (!(await patch({ tags: [...tags] }))) setStyle(prev);
    }
  }

  async function toggleReview() {
    const next = !isReview;
    setIsReview(next);
    if (!(await patch({ is_review: next }))) setIsReview(!next);
  }

  async function toggleStar() {
    const next = !starred;
    setStarred(next);
    const tags = new Set((trade.tags ?? []).filter(Boolean));
    if (next) tags.add(FAVORITE_TAG);
    else tags.delete(FAVORITE_TAG);
    if (!(await patch({ tags: [...tags] }))) setStarred(!next);
  }

  const rows = [
    {
      n: 1,
      kind: long ? "진입 · 매수" : "진입 · 매도",
      color: long ? BUY_COLOR : SELL_COLOR,
      sec: entrySec,
      price: entry,
      fills: "—",
    },
    {
      n: 2,
      kind: long ? "청산 · 매도" : "청산 · 매수",
      color: long ? SELL_COLOR : BUY_COLOR,
      sec: exitSec,
      price: exit,
      fills: Number.isFinite(exitFills) && exitFills > 0 ? String(exitFills) : "—",
    },
  ];

  return (
    <article
      ref={cardRef}
      id={`review-${trade.id}`}
      className={`scroll-mt-4 overflow-hidden rounded-2xl border bg-zinc-950 p-4 transition sm:p-5 ${
        highlighted
          ? "border-amber-400/70 ring-2 ring-amber-400/30"
          : bigLoss
            ? "border-rose-500/40"
            : "border-zinc-800"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void toggleStar()}
            title={starred ? "즐겨찾기 빼기" : "즐겨찾기"}
            className={`text-2xl leading-none transition disabled:opacity-50 ${
              starred ? "text-yellow-300" : "text-zinc-700 hover:text-zinc-400"
            }`}
          >
            {starred ? "★" : "☆"}
          </button>
          <p className="text-3xl font-semibold tracking-tight text-zinc-50">
            {asset}
            <span className="ml-1 text-sm font-normal text-zinc-500">{quote}</span>
          </p>
          {bigLoss && (
            <span className="rounded-full border border-rose-500/50 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-200">
              과한 손실
            </span>
          )}
        </div>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-2 text-xs text-zinc-400">
          <span>{exchangeLabel(trade.exchange)}</span>
          <span className="text-zinc-700">•</span>
          <span className={long ? "text-red-300" : "text-blue-300"}>{long ? "롱" : "숏"}</span>
          <span className="text-zinc-700">•</span>
          <span>{holdKind(holdMin)}</span>
          <span className="text-zinc-700">•</span>
          <span className="tabular-nums">
            {kstDateTime(entrySec)} → {kstClock(exitSec)}
          </span>
          <span className="text-zinc-700">•</span>
          <span>{formatDuration(holdMin)}</span>
          {style && (
            <>
              <span className="text-zinc-700">•</span>
              <span className={style === "원칙" ? "text-sky-300" : "text-orange-300"}>{style}</span>
            </>
          )}
        </p>
        <div className="text-right">
          <p className={`text-2xl font-semibold tabular-nums ${profitCls}`}>
            {pnlPct >= 0 ? "+" : ""}
            {pnlPct.toFixed(2)}%
          </p>
          <p className="text-xs tabular-nums text-zinc-500">{won(pnl, fx, true)}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-zinc-800/80 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["방향 · 수량", `${long ? "롱" : "숏"} ${qty.toLocaleString("en-US", { maximumFractionDigits: 4 })}`],
          ["평균 진입가", `${formatPrice(entry)} ${quote}`],
          ["평균 청산가", `${formatPrice(exit)} ${quote}`],
          ["보유 시간", formatDuration(holdMin)],
          ["수수료", fee > 0 ? won(fee, fx) : "—"],
          ["순손익", won(pnl, fx, true)],
        ].map(([label, value], i) => (
          <div key={label} className="bg-zinc-900 px-3 py-2.5">
            <p className="text-[11px] text-zinc-500">{label}</p>
            <p
              className={`mt-1 text-sm font-medium tabular-nums ${
                i === 5 ? profitCls : "text-zinc-100"
              }`}
            >
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl bg-zinc-900/70 p-3">
        <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-500">
          <span>
            {intervalLabel(interval)}
            {source ? ` · ${source} 시세` : ""}
            {timesBroken ? " · 진입 시각은 차트로 추정" : ""}
          </span>
          <span className="flex items-center gap-3">
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: BUY_COLOR }} />
              매수
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: SELL_COLOR }} />
              매도
            </span>
          </span>
        </div>
        {loading && (
          <div className="flex h-[260px] items-center justify-center text-sm text-zinc-500">
            차트 불러오는 중…
          </div>
        )}
        {error && (
          <div className="flex h-24 items-center justify-center text-sm text-rose-400">{error}</div>
        )}
        {!loading && !error && candles.length > 0 && (
          <ReviewChart
            candles={candles}
            entry={entry}
            exit={exit}
            entrySec={entrySec}
            exitSec={exitSec}
            side={trade.side}
            height={260}
          />
        )}
        {!loading && !error && candles.length === 0 && (
          <div className="flex h-24 items-center justify-center text-sm text-zinc-500">캔들 데이터 없음</div>
        )}
      </div>

      <table className="mt-3 w-full text-left text-xs">
        <thead className="text-zinc-500">
          <tr className="border-b border-zinc-800">
            <th className="py-2 pr-2 font-medium">#</th>
            <th className="py-2 pr-2 font-medium">구분</th>
            <th className="py-2 pr-2 font-medium">시각(KST)</th>
            <th className="py-2 pr-2 text-right font-medium">평균가 ({quote})</th>
            <th className="py-2 pr-2 text-right font-medium">수량</th>
            <th className="py-2 text-right font-medium">체결</th>
          </tr>
        </thead>
        <tbody className="text-zinc-200">
          {rows.map((row) => (
            <tr key={row.n} className="border-b border-zinc-800/70">
              <td className="py-2 pr-2 text-zinc-500">{row.n}</td>
              <td className="py-2 pr-2">
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: row.color }} />
                {row.kind}
              </td>
              <td className="py-2 pr-2 tabular-nums">{kstDateTime(row.sec, true)}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{formatPrice(row.price)}</td>
              <td className="py-2 pr-2 text-right tabular-nums">
                {qty.toLocaleString("en-US", { maximumFractionDigits: 4 })}
              </td>
              <td className="py-2 text-right tabular-nums">{row.fills}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(
          [
            ["원칙", "원칙매매", "border-sky-500/50 bg-sky-500/15 text-sky-200"],
            ["뇌동", "뇌동", "border-orange-500/50 bg-orange-500/15 text-orange-200"],
          ] as const
        ).map(([id, label, on]) => (
          <button
            key={id}
            type="button"
            disabled={saving}
            onClick={() => void chooseStyle(style === id ? null : id)}
            className={`rounded-md border px-2.5 py-1 text-xs transition disabled:opacity-50 ${
              style === id ? on : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          disabled={saving}
          onClick={() => void toggleReview()}
          className={`rounded-md border px-2.5 py-1 text-xs transition disabled:opacity-50 ${
            isReview
              ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
              : bigLoss
                ? "border-rose-500/50 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
                : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {isReview ? "✓ 오답노트에 있음" : "오답노트에 넣기"}
        </button>
        <button
          type="button"
          onClick={() => setMemoOpen((v) => !v)}
          className="ml-auto rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200"
        >
          메모 {commentCount > 0 ? `(${commentCount})` : ""} {memoOpen ? "▲" : "▼"}
        </button>
      </div>
      {memoOpen && (
        <div className="mt-2 overflow-hidden rounded-xl border border-zinc-800">
          <TradeComments
            tradeId={trade.id}
            legacyNotes={trade.notes}
            onCountChange={setCommentCount}
          />
        </div>
      )}
    </article>
  );
}
