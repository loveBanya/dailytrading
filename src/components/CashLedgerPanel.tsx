"use client";

import { useCallback, useEffect, useState } from "react";
import type { CashEntry } from "@/app/api/cash/route";

function won(n: number): string {
  if (!n) return "";
  return `₩${Math.round(n).toLocaleString("ko-KR")}`;
}

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  if (!y) return isoDate;
  return `${y}. ${m}. ${d}`;
}

function toDateInput(isoDate: string): string {
  return isoDate.slice(0, 10);
}

const inputCls =
  "rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500/50";

const cellInputCls =
  "w-full min-w-0 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-sm text-zinc-200 outline-none focus:border-emerald-500/50";

type EditDraft = {
  entry_date: string;
  title: string;
  deposit: string;
  withdrawal: string;
  note: string;
};

export function CashLedgerPanel() {
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [totals, setTotals] = useState({
    deposit: 0,
    withdrawal: 0,
    net: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [date, setDate] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
  );
  const [title, setTitle] = useState("입금");
  const [deposit, setDeposit] = useState("");
  const [withdrawal, setWithdrawal] = useState("");
  const [note, setNote] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cash");
      const data = (await res.json()) as {
        entries?: CashEntry[];
        totals?: { deposit: number; withdrawal: number; net: number };
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setEntries(data.entries ?? []);
      setTotals(data.totals ?? { deposit: 0, withdrawal: 0, net: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(e: CashEntry) {
    setEditingId(e.id);
    setDraft({
      entry_date: toDateInput(e.entry_date),
      title: e.title,
      deposit: Number(e.deposit) ? String(Number(e.deposit)) : "",
      withdrawal: Number(e.withdrawal) ? String(Number(e.withdrawal)) : "",
      note: e.note ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  async function addEntry() {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry_date: date,
          title: title.trim(),
          deposit: Number(deposit || 0),
          withdrawal: Number(withdrawal || 0),
          note: note.trim() || null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (data.error) throw new Error(data.error);
      setDeposit("");
      setWithdrawal("");
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editingId || !draft || !draft.title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cash", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          entry_date: draft.entry_date,
          title: draft.title.trim(),
          deposit: Number(draft.deposit || 0),
          withdrawal: Number(draft.withdrawal || 0),
          note: draft.note.trim() || null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (data.error) throw new Error(data.error);
      cancelEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "수정 실패");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("이 기록을 삭제할까요?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/cash?id=${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (data.error) throw new Error(data.error);
      if (editingId === id) cancelEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-500">
        업비트 등 국내 거래소 경유 KRW 입출금 개인 기록입니다. 차액은 입·출금이
        모두 있을 때 (출금 − 입금)으로 표시합니다.
      </p>

      <div className="grid grid-cols-3 gap-3">
        <SumBox label="총 입금" value={won(totals.deposit) || "₩0"} tone="pos" />
        <SumBox
          label="총 출금"
          value={won(totals.withdrawal) || "₩0"}
          tone="neg"
        />
        <SumBox
          label="순유입 (입−출)"
          value={
            totals.net === 0
              ? "₩0"
              : `${totals.net < 0 ? "-" : ""}₩${Math.abs(Math.round(totals.net)).toLocaleString("ko-KR")}`
          }
          tone={totals.net >= 0 ? "pos" : "neg"}
        />
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
        <label className="block text-xs text-zinc-500">
          <span className="mb-1 block">날짜</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block text-xs text-zinc-500">
          <span className="mb-1 block">물건</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="입금 / 출금"
            className={`${inputCls} w-36`}
          />
        </label>
        <label className="block text-xs text-zinc-500">
          <span className="mb-1 block">입금</span>
          <input
            type="number"
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
            placeholder="0"
            className={`${inputCls} w-28`}
          />
        </label>
        <label className="block text-xs text-zinc-500">
          <span className="mb-1 block">출금</span>
          <input
            type="number"
            value={withdrawal}
            onChange={(e) => setWithdrawal(e.target.value)}
            placeholder="0"
            className={`${inputCls} w-28`}
          />
        </label>
        <label className="block text-xs text-zinc-500">
          <span className="mb-1 block">비고</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="메모"
            className={`${inputCls} w-40`}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void addEntry()}
          className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          추가
        </button>
      </div>

      {loading && <p className="text-sm text-zinc-500">불러오는 중…</p>}
      {error && (
        <p className="text-sm text-amber-300/80">
          {error}
          {(error.includes("does not exist") ||
            error.includes("schema cache")) &&
            " — Supabase에서 007_cash_mindset_posts.sql 을 실행하세요."}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs text-zinc-500">
              <th className="pb-2 font-medium">날짜</th>
              <th className="pb-2 font-medium">물건</th>
              <th className="pb-2 text-right font-medium">입금</th>
              <th className="pb-2 text-right font-medium">출금</th>
              <th className="pb-2 text-right font-medium">차액</th>
              <th className="pb-2 font-medium">비고</th>
              <th className="pb-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const isEditing = editingId === e.id && draft;
              if (isEditing && draft) {
                const depN = Number(draft.deposit || 0);
                const witN = Number(draft.withdrawal || 0);
                const showDiff = depN > 0 && witN > 0;
                const diff = witN - depN;
                return (
                  <tr key={e.id} className="border-b border-zinc-800/60 bg-zinc-900/50">
                    <td className="py-2 pr-1">
                      <input
                        type="date"
                        value={draft.entry_date}
                        onChange={(ev) =>
                          setDraft({ ...draft, entry_date: ev.target.value })
                        }
                        className={cellInputCls}
                      />
                    </td>
                    <td className="py-2 pr-1">
                      <input
                        value={draft.title}
                        onChange={(ev) =>
                          setDraft({ ...draft, title: ev.target.value })
                        }
                        className={cellInputCls}
                      />
                    </td>
                    <td className="py-2 pr-1">
                      <input
                        type="number"
                        value={draft.deposit}
                        onChange={(ev) =>
                          setDraft({ ...draft, deposit: ev.target.value })
                        }
                        className={`${cellInputCls} text-right`}
                      />
                    </td>
                    <td className="py-2 pr-1">
                      <input
                        type="number"
                        value={draft.withdrawal}
                        onChange={(ev) =>
                          setDraft({ ...draft, withdrawal: ev.target.value })
                        }
                        className={`${cellInputCls} text-right`}
                      />
                    </td>
                    <td
                      className={`py-2.5 text-right tabular-nums ${
                        !showDiff
                          ? "text-zinc-600"
                          : diff >= 0
                            ? "text-rose-400"
                            : "text-emerald-400"
                      }`}
                    >
                      {showDiff
                        ? `${diff < 0 ? "-" : ""}₩${Math.abs(Math.round(diff)).toLocaleString("ko-KR")}`
                        : ""}
                    </td>
                    <td className="py-2 pr-1">
                      <input
                        value={draft.note}
                        onChange={(ev) =>
                          setDraft({ ...draft, note: ev.target.value })
                        }
                        className={cellInputCls}
                      />
                    </td>
                    <td className="whitespace-nowrap py-2.5 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveEdit()}
                        className="mr-2 text-xs text-emerald-400 hover:text-emerald-300"
                      >
                        저장
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={cancelEdit}
                        className="text-xs text-zinc-500 hover:text-zinc-300"
                      >
                        취소
                      </button>
                    </td>
                  </tr>
                );
              }

              const dep = Number(e.deposit);
              const wit = Number(e.withdrawal);
              const showDiff = dep > 0 && wit > 0;
              const diff = wit - dep;
              return (
                <tr key={e.id} className="border-b border-zinc-800/60">
                  <td className="py-2.5 tabular-nums text-zinc-300">
                    {formatDate(e.entry_date)}
                  </td>
                  <td className="py-2.5 text-zinc-100">{e.title}</td>
                  <td className="py-2.5 text-right tabular-nums text-emerald-400/90">
                    {won(dep)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-rose-400/90">
                    {won(wit)}
                  </td>
                  <td
                    className={`py-2.5 text-right tabular-nums ${
                      !showDiff
                        ? "text-zinc-600"
                        : diff >= 0
                          ? "text-rose-400"
                          : "text-emerald-400"
                    }`}
                  >
                    {showDiff
                      ? `${diff < 0 ? "-" : ""}₩${Math.abs(Math.round(diff)).toLocaleString("ko-KR")}`
                      : ""}
                  </td>
                  <td className="max-w-[200px] truncate py-2.5 text-zinc-500">
                    {e.note}
                  </td>
                  <td className="whitespace-nowrap py-2.5 text-right">
                    <button
                      type="button"
                      disabled={busy || editingId != null}
                      onClick={() => startEdit(e)}
                      className="mr-2 text-xs text-zinc-500 hover:text-zinc-200 disabled:opacity-40"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(e.id)}
                      className="text-xs text-zinc-600 hover:text-rose-400"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!loading && entries.length === 0 && !error && (
        <p className="text-sm text-zinc-500">아직 입출금 기록이 없습니다.</p>
      )}
    </div>
  );
}

function SumBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
}) {
  return (
    <div className="rounded-md border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p
        className={`mt-1 text-base font-semibold tabular-nums sm:text-lg ${
          tone === "pos"
            ? "text-emerald-400"
            : tone === "neg"
              ? "text-rose-400"
              : "text-zinc-100"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
