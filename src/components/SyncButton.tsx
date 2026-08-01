"use client";

import { useState } from "react";
import type { SyncResult } from "@/lib/exchanges/types";
import { exchangeLabel } from "@/lib/utils/labels";

interface SyncButtonProps {
  onSynced?: () => void;
}

export function SyncButton({ onSynced }: SyncButtonProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 30 }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        results?: SyncResult[];
        error?: string;
      };

      if (data.error) {
        setMessage(data.error);
        return;
      }

      const summary = (data.results ?? [])
        .map((r) =>
          r.error
            ? `${exchangeLabel(r.exchange)}: 오류 — ${r.error}`
            : `${exchangeLabel(r.exchange)}: ${r.inserted}건 저장 / ${r.skipped}건 건너뜀 (조회 ${r.fetched}건)`
        )
        .join(" · ");
      setMessage(summary || "동기화 완료");
      onSynced?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "동기화 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleSync}
        disabled={loading}
        className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "불러오는 중…" : "거래소 동기화"}
      </button>
      {message && (
        <p className="max-w-md text-right text-xs text-zinc-400">{message}</p>
      )}
    </div>
  );
}
