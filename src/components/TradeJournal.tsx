"use client";

import { useCallback, useEffect, useState } from "react";
import type { Trade } from "@/lib/exchanges/types";
import { TradeCard } from "./TradeCard";
import { StatsBar } from "./StatsBar";
import { SyncButton } from "./SyncButton";

export function TradeJournal() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/trades?limit=100");
      const data = (await res.json()) as { trades?: Trade[]; error?: string };
      if (data.error) throw new Error(data.error);
      setTrades(data.trades ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Daily Trading
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-50">
            매매일지
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Bybit / Binance 청산 포지션을 자동으로 기록합니다.
          </p>
        </div>
        <SyncButton onSynced={load} />
      </header>

      {!loading && !error && trades.length > 0 && (
        <div className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
          <StatsBar trades={trades} />
        </div>
      )}

      {loading && (
        <p className="py-16 text-center text-sm text-zinc-500">불러오는 중…</p>
      )}

      {error && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-200">
          <p className="font-medium">DB 연결 또는 설정이 필요합니다</p>
          <p className="mt-2 text-amber-200/70">{error}</p>
          <p className="mt-3 text-xs text-zinc-500">
            `.env.local`에 Supabase URL/키를 넣고, SQL 마이그레이션을
            실행한 뒤 새로고침하세요.
          </p>
        </div>
      )}

      {!loading && !error && trades.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-700 p-10 text-center">
          <p className="text-zinc-300">아직 기록된 매매가 없습니다</p>
          <p className="mt-2 text-sm text-zinc-500">
            거래소 API 키를 설정한 뒤 상단의 「거래소 동기화」를 눌러보세요.
          </p>
        </div>
      )}

      <div className="divide-y divide-zinc-800/0">
        {trades.map((trade) => (
          <TradeCard key={trade.id} trade={trade} />
        ))}
      </div>
    </div>
  );
}
