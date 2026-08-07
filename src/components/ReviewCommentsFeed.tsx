"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Trade } from "@/lib/exchanges/types";
import { formatKst, formatPnl } from "@/lib/utils/format";
import { exchangeLabel } from "@/lib/utils/labels";

interface FeedComment {
  id: string;
  trade_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
}

interface ReviewCommentsFeedProps {
  trades: Trade[];
  onOpenTrade: (tradeId: string) => void;
}

export function ReviewCommentsFeed({
  trades,
  onOpenTrade,
}: ReviewCommentsFeedProps) {
  const [items, setItems] = useState<FeedComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const tradeMap = useMemo(() => {
    const m = new Map<string, Trade>();
    for (const t of trades) m.set(t.id, t);
    return m;
  }, [trades]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/trades/comments?feed=1&limit=300");
      const data = (await res.json()) as {
        comments?: FeedComment[];
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setItems(data.comments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "댓글 불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((c) => {
      const trade = tradeMap.get(c.trade_id);
      if (!needle) return true;
      const hay = [
        c.body,
        trade?.symbol,
        trade?.side,
        trade?.exchange,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [items, q, tradeMap]);

  return (
    <div className="mb-6 space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">댓글 모아보기</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            매매 일지에 단 댓글입니다. 클릭하면 해당 매매 기록으로 이동합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
        >
          새로고침
        </button>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="댓글·코인 검색"
        className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50"
      />

      {loading && (
        <p className="py-6 text-center text-xs text-zinc-500">불러오는 중…</p>
      )}
      {error && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
          {error}
        </p>
      )}
      {!loading && !error && filtered.length === 0 && (
        <p className="py-6 text-center text-xs text-zinc-500">
          {items.length === 0
            ? "아직 매매 일지 댓글이 없습니다."
            : "검색 결과가 없습니다."}
        </p>
      )}

      <ul className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800">
        {filtered.map((c) => {
          const trade = tradeMap.get(c.trade_id);
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onOpenTrade(c.trade_id)}
                className="flex w-full flex-col gap-1 px-3 py-3 text-left transition hover:bg-zinc-900/80"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {trade ? (
                    <>
                      <span className="font-medium text-zinc-100">
                        {trade.symbol}
                      </span>
                      <span
                        className={
                          trade.side === "LONG"
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }
                      >
                        {trade.side}
                      </span>
                      <span className="text-zinc-600">
                        {exchangeLabel(trade.exchange)}
                      </span>
                      <span
                        className={`tabular-nums ${
                          trade.pnl >= 0 ? "text-emerald-400/80" : "text-rose-400/80"
                        }`}
                      >
                        {formatPnl(trade.pnl)}
                      </span>
                      {(trade.is_review ||
                        (trade.tags ?? []).includes("오답노트")) && (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
                          오답
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-zinc-500">삭제된 매매</span>
                  )}
                  {c.parent_id && (
                    <span className="text-[10px] text-zinc-600">답글</span>
                  )}
                  <span className="ml-auto tabular-nums text-zinc-600">
                    {formatKst(c.created_at)} KST
                  </span>
                </div>
                <p className="line-clamp-3 whitespace-pre-wrap text-sm text-zinc-300">
                  {c.body}
                </p>
                <span className="text-[10px] text-zinc-600">
                  클릭하면 매매 일지로 이동
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
