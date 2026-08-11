"use client";

import { useCallback, useEffect, useState } from "react";
import type { AssetFlow, AssetFlowDirection } from "@/app/api/asset-flows/route";

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  if (!y) return isoDate;
  return `${y}. ${m}. ${d}`;
}

const inputCls =
  "rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500/50";

const SOURCE_PRESETS = [
  { value: "upbit", label: "업비트→테더" },
  { value: "bank", label: "은행/기타" },
  { value: "other", label: "기타" },
];

interface AssetFlowsPanelProps {
  compact?: boolean;
  onChanged?: () => void;
}

export function AssetFlowsPanel({ compact, onChanged }: AssetFlowsPanelProps) {
  const [flows, setFlows] = useState<AssetFlow[]>([]);
  const [totals, setTotals] = useState({ in: 0, out: 0, net: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [date, setDate] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
  );
  const [direction, setDirection] = useState<AssetFlowDirection>("in");
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("upbit");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/asset-flows");
      const data = (await res.json()) as {
        flows?: AssetFlow[];
        totals?: { in: number; out: number; net: number };
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setFlows(data.flows ?? []);
      setTotals(data.totals ?? { in: 0, out: 0, net: 0 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "불러오기 실패";
      setError(msg);
      setFlows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addFlow() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("USDT 금액을 입력하세요");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/asset-flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry_date: date,
          direction,
          amount_usdt: amt,
          source,
          note: note || null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "저장 실패");
      setAmount("");
      setNote("");
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  async function removeFlow(id: string) {
    if (!confirm("이 기록을 삭제할까요?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/asset-flows?id=${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "삭제 실패");
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setBusy(false);
    }
  }

  const missingTable =
    error?.toLowerCase().includes("asset_flows") ||
    error?.includes("schema cache") ||
    error?.includes("does not exist");

  return (
    <div className="space-y-3">
      {!compact && (
        <p className="text-sm text-zinc-500">
          업비트에서 TRX 등을 팔아 만든 USDT를 선물 지갑으로 옮긴 경우 여기에
          기록하세요. 자산 그래프에 반영됩니다. (KRW 입출금 장부와 별개)
        </p>
      )}

      <div className="flex flex-wrap gap-3 text-sm">
        <div>
          <p className="text-[11px] text-zinc-500">유입</p>
          <p className="font-semibold tabular-nums text-emerald-400">
            {usd(totals.in)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">유출</p>
          <p className="font-semibold tabular-nums text-rose-400">
            {usd(totals.out)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">순유입</p>
          <p className="font-semibold tabular-nums text-zinc-100">
            {usd(totals.net)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-zinc-500">
          날짜
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`mt-1 block ${inputCls}`}
          />
        </label>
        <label className="text-xs text-zinc-500">
          방향
          <select
            value={direction}
            onChange={(e) =>
              setDirection(e.target.value as AssetFlowDirection)
            }
            className={`mt-1 block ${inputCls}`}
          >
            <option value="in">입금 (유입)</option>
            <option value="out">출금 (유출)</option>
          </select>
        </label>
        <label className="text-xs text-zinc-500">
          USDT
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="예: 500"
            className={`mt-1 block w-28 ${inputCls}`}
          />
        </label>
        <label className="text-xs text-zinc-500">
          출처
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className={`mt-1 block ${inputCls}`}
          >
            {SOURCE_PRESETS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[10rem] flex-1 text-xs text-zinc-500">
          메모
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="TRX 매도 후 테더 입금"
            className={`mt-1 w-full ${inputCls}`}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void addFlow()}
          className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 disabled:opacity-40"
        >
          {busy ? "저장 중…" : "기록"}
        </button>
      </div>

      {missingTable && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
          `asset_flows` 테이블이 없습니다. Supabase에서{" "}
          <code className="text-amber-100">010_asset_flows.sql</code> 을
          실행하세요.
        </p>
      )}
      {error && !missingTable && (
        <p className="text-xs text-amber-300/90">{error}</p>
      )}

      {loading ? (
        <p className="text-xs text-zinc-500">불러오는 중…</p>
      ) : (
        <ul
          className={`divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 ${
            compact ? "max-h-48 overflow-y-auto" : ""
          }`}
        >
          {flows.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-zinc-500">
              아직 USDT 유입/유출 기록이 없습니다.
            </li>
          )}
          {flows.map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
            >
              <span className="text-xs tabular-nums text-zinc-500">
                {formatDate(f.entry_date)}
              </span>
              <span
                className={
                  f.direction === "in" ? "text-emerald-400" : "text-rose-400"
                }
              >
                {f.direction === "in" ? "유입" : "유출"}
              </span>
              <span className="font-medium tabular-nums text-zinc-100">
                {usd(Number(f.amount_usdt))}
              </span>
              <span className="text-xs text-zinc-600">{f.source}</span>
              {f.note && (
                <span className="text-xs text-zinc-500">{f.note}</span>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeFlow(f.id)}
                className="ml-auto text-xs text-zinc-600 hover:text-rose-300"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
