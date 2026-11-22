"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatKst, formatPnl, formatUsd } from "@/lib/utils/format";
import type {
  HlEventType,
  HlFill,
  HlLeaderboardRow,
  HlOpenPosition,
  HlPortfolioSlice,
  HlPositionEvent,
  HlTrader,
} from "@/lib/hyperliquid/types";

type SubView = "watch" | "board" | "history";

const EVENT_LABEL: Record<HlEventType, string> = {
  OPEN: "오픈",
  INCREASE: "증액",
  DECREASE: "감액",
  CLOSE: "청산",
  FLIP: "플립",
};

function shortAddr(a: string): string {
  if (a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function fmtUsdCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return formatUsd(n);
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  const pct = n * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function pnlClass(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n === 0) return "text-zinc-400";
  return n > 0 ? "text-emerald-400" : "text-rose-400";
}

export function HlTradersPanel() {
  const [view, setView] = useState<SubView>("watch");
  const [traders, setTraders] = useState<HlTrader[]>([]);
  const [positions, setPositions] = useState<HlOpenPosition[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrationHint, setMigrationHint] = useState<string | null>(null);

  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const [board, setBoard] = useState<HlLeaderboardRow[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);

  const [events, setEvents] = useState<HlPositionEvent[]>([]);
  const [fills, setFills] = useState<HlFill[]>([]);
  const [portfolio, setPortfolio] = useState<HlPortfolioSlice[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const selected = useMemo(
    () => traders.find((t) => t.id === selectedId) ?? null,
    [traders, selectedId]
  );

  const selectedPositions = useMemo(
    () =>
      selectedId
        ? positions.filter((p) => p.trader_id === selectedId)
        : positions,
    [positions, selectedId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hl-traders");
      const data = (await res.json()) as {
        traders?: HlTrader[];
        positions?: HlOpenPosition[];
        error?: string;
        needsMigration?: boolean;
        migrationHint?: string;
      };
      if (data.needsMigration) {
        setMigrationHint(
          data.migrationHint ??
            "supabase/migrations/012_hl_traders.sql 을 실행하세요."
        );
      } else {
        setMigrationHint(null);
      }
      if (data.error && !data.needsMigration) throw new Error(data.error);
      const list = data.traders ?? [];
      setTraders(list);
      setPositions(data.positions ?? []);
      setSelectedId((prev) => {
        if (prev && list.some((t) => t.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadBoard = useCallback(async () => {
    setBoardLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hl-traders/leaderboard?limit=40");
      const data = (await res.json()) as {
        rows?: HlLeaderboardRow[];
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setBoard(data.rows ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "리더보드 실패");
    } finally {
      setBoardLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (traderId: string) => {
    setHistoryLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/hl-traders/history?traderId=${encodeURIComponent(traderId)}&limit=120&fills=1&portfolio=1`
      );
      const data = (await res.json()) as {
        events?: HlPositionEvent[];
        fills?: HlFill[] | null;
        portfolio?: HlPortfolioSlice[] | null;
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setEvents(data.events ?? []);
      setFills(data.fills ?? []);
      setPortfolio(data.portfolio ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "히스토리 실패");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "board" && board.length === 0) void loadBoard();
  }, [view, board.length, loadBoard]);

  useEffect(() => {
    if (view === "history" && selectedId) void loadHistory(selectedId);
  }, [view, selectedId, loadHistory]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/hl-traders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: address.trim(),
          label: label.trim() || undefined,
          sync: true,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        needsMigration?: boolean;
        migrationHint?: string;
      };
      if (data.needsMigration) {
        setMigrationHint(data.migrationHint ?? null);
      }
      if (data.error) throw new Error(data.error);
      setAddress("");
      setLabel("");
      await load();
      setView("watch");
    } catch (err) {
      setError(err instanceof Error ? err.message : "추가 실패");
    } finally {
      setSaving(false);
    }
  }

  async function handleSync(traderId?: string) {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/hl-traders/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(traderId ? { traderId } : {}),
      });
      const data = (await res.json()) as {
        error?: string;
        needsMigration?: boolean;
        migrationHint?: string;
        eventsCreated?: number;
      };
      if (data.needsMigration) setMigrationHint(data.migrationHint ?? null);
      if (data.error) throw new Error(data.error);
      await load();
      if (view === "history" && selectedId) await loadHistory(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "동기화 실패");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("이 트레이더를 관심 목록에서 제거할까요?")) return;
    await fetch(`/api/hl-traders?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    await load();
  }

  async function followFromBoard(row: HlLeaderboardRow) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/hl-traders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: row.address,
          label: row.displayName || shortAddr(row.address),
          sync: true,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (data.error) throw new Error(data.error);
      await load();
      setView("watch");
    } catch (err) {
      setError(err instanceof Error ? err.message : "추가 실패");
    } finally {
      setSaving(false);
    }
  }

  const watchedAddresses = useMemo(
    () => new Set(traders.map((t) => t.address.toLowerCase())),
    [traders]
  );

  const weekSlice = portfolio.find((p) => p.window === "week");
  const monthSlice = portfolio.find((p) => p.window === "month");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-400">
          Hyperliquid 공개 지갑을 관심에 두고 포지션·변경 이력을 추적합니다.
          이후 알림·카피 테스트 기반입니다.
        </p>
        <button
          type="button"
          disabled={syncing || traders.length === 0}
          onClick={() => void handleSync()}
          className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40"
        >
          {syncing ? "동기화 중…" : "전체 동기화"}
        </button>
      </div>

      {migrationHint && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-100">
          <p className="font-medium">DB 테이블이 필요합니다</p>
          <p className="mt-1 text-xs text-amber-200/70">{migrationHint}</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <form
        onSubmit={handleAdd}
        className="flex flex-wrap items-end gap-2 rounded-md border border-zinc-800/80 bg-zinc-950/40 p-3"
      >
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-zinc-500">지갑 주소</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x…"
            className="w-56 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-sm text-zinc-100 outline-none focus:border-emerald-500/50 sm:w-72"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-zinc-500">별칭</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="탑트레이더 A"
            className="w-32 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500/50"
          />
        </label>
        <button
          type="submit"
          disabled={saving || !address.trim()}
          className="rounded-md border border-emerald-700/60 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40"
        >
          {saving ? "추가 중…" : "관심 추가"}
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["watch", "관심·포지션"],
            ["board", "리더보드"],
            ["history", "히스토리"],
          ] as const
        ).map(([id, name]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
              view === id
                ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-200"
                : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {traders.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {traders.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedId(t.id)}
              className={`rounded border px-2.5 py-1 text-xs transition ${
                selectedId === t.id
                  ? "border-zinc-500 bg-zinc-800 text-zinc-100"
                  : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t.label || shortAddr(t.address)}
              {t.account_value != null ? (
                <span className="ml-1.5 text-zinc-600">
                  {fmtUsdCompact(Number(t.account_value))}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <p className="py-8 text-center text-sm text-zinc-500">불러오는 중…</p>
      )}

      {!loading && view === "watch" && (
        <div className="space-y-4">
          {traders.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              관심 트레이더가 없습니다. 주소를 추가하거나 리더보드에서
              따라가세요.
            </p>
          ) : (
            <>
              {selected && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium text-zinc-200">
                      {selected.label || shortAddr(selected.address)}
                    </span>
                    <a
                      href={`https://app.hyperliquid.xyz/explorer/address/${selected.address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 font-mono text-xs text-zinc-500 underline hover:text-zinc-300"
                    >
                      {shortAddr(selected.address)}
                    </a>
                    {selected.last_synced_at && (
                      <span className="ml-2 text-xs text-zinc-600">
                        동기화 {formatKst(selected.last_synced_at)}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={syncing}
                      onClick={() => void handleSync(selected.id)}
                      className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
                    >
                      동기화
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setView("history");
                      }}
                      className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200"
                    >
                      히스토리
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(selected.id)}
                      className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-rose-400/80 hover:text-rose-300"
                    >
                      제거
                    </button>
                  </div>
                </div>
              )}

              {selectedPositions.length === 0 ? (
                <p className="py-6 text-center text-sm text-zinc-500">
                  열린 포지션이 없습니다. 동기화하면 스냅샷이 갱신됩니다.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="border-b border-zinc-800 text-[11px] uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="px-2 py-2 font-medium">코인</th>
                        <th className="px-2 py-2 font-medium">방향</th>
                        <th className="px-2 py-2 font-medium">크기</th>
                        <th className="px-2 py-2 font-medium">진입</th>
                        <th className="px-2 py-2 font-medium">가치</th>
                        <th className="px-2 py-2 font-medium">미실현</th>
                        <th className="px-2 py-2 font-medium">레버</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPositions.map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-zinc-900/80 text-zinc-300"
                        >
                          <td className="px-2 py-2 font-medium text-zinc-100">
                            {p.coin}
                          </td>
                          <td
                            className={`px-2 py-2 ${
                              p.side === "LONG"
                                ? "text-emerald-400"
                                : "text-rose-400"
                            }`}
                          >
                            {p.side}
                          </td>
                          <td className="px-2 py-2 tabular-nums">
                            {Number(p.size).toPrecision(6)}
                          </td>
                          <td className="px-2 py-2 tabular-nums text-zinc-400">
                            {p.entry_price != null
                              ? Number(p.entry_price).toLocaleString()
                              : "-"}
                          </td>
                          <td className="px-2 py-2 tabular-nums">
                            {fmtUsdCompact(
                              p.position_value != null
                                ? Number(p.position_value)
                                : null
                            )}
                          </td>
                          <td
                            className={`px-2 py-2 tabular-nums ${pnlClass(
                              p.unrealised_pnl != null
                                ? Number(p.unrealised_pnl)
                                : null
                            )}`}
                          >
                            {p.unrealised_pnl != null
                              ? formatPnl(Number(p.unrealised_pnl))
                              : "-"}
                          </td>
                          <td className="px-2 py-2 tabular-nums text-zinc-500">
                            {p.leverage != null ? `${p.leverage}x` : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!loading && view === "board" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              disabled={boardLoading}
              onClick={() => void loadBoard()}
              className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
            >
              {boardLoading ? "불러오는 중…" : "리더보드 새로고침"}
            </button>
          </div>
          {boardLoading && board.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              리더보드 불러오는 중…
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-zinc-800 text-[11px] uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-2 py-2 font-medium">#</th>
                    <th className="px-2 py-2 font-medium">주소</th>
                    <th className="px-2 py-2 font-medium">잔고</th>
                    <th className="px-2 py-2 font-medium">일 PnL</th>
                    <th className="px-2 py-2 font-medium">주 ROI</th>
                    <th className="px-2 py-2 font-medium">월 ROI</th>
                    <th className="px-2 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {board.map((row, i) => {
                    const following = watchedAddresses.has(
                      row.address.toLowerCase()
                    );
                    return (
                      <tr
                        key={row.address}
                        className="border-b border-zinc-900/80 text-zinc-300"
                      >
                        <td className="px-2 py-2 tabular-nums text-zinc-600">
                          {i + 1}
                        </td>
                        <td className="px-2 py-2">
                          <span className="font-mono text-xs">
                            {shortAddr(row.address)}
                          </span>
                          {row.displayName ? (
                            <span className="ml-2 text-xs text-zinc-500">
                              {row.displayName}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {fmtUsdCompact(row.accountValue)}
                        </td>
                        <td
                          className={`px-2 py-2 tabular-nums ${pnlClass(row.pnlDay)}`}
                        >
                          {fmtUsdCompact(row.pnlDay)}
                        </td>
                        <td
                          className={`px-2 py-2 tabular-nums ${pnlClass(row.roiWeek)}`}
                        >
                          {fmtPct(row.roiWeek)}
                        </td>
                        <td
                          className={`px-2 py-2 tabular-nums ${pnlClass(row.roiMonth)}`}
                        >
                          {fmtPct(row.roiMonth)}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            disabled={following || saving}
                            onClick={() => void followFromBoard(row)}
                            className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:text-emerald-300 disabled:opacity-40"
                          >
                            {following ? "관심 중" : "따라가기"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!loading && view === "history" && (
        <div className="space-y-5">
          {!selectedId ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              관심 트레이더를 먼저 선택하세요.
            </p>
          ) : historyLoading && events.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              히스토리 불러오는 중…
            </p>
          ) : (
            <>
              {(weekSlice || monthSlice) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {weekSlice && (
                    <PortfolioMini
                      title="주간 계좌가치"
                      points={weekSlice.accountValueHistory}
                    />
                  )}
                  {monthSlice && (
                    <PortfolioMini
                      title="월간 PnL"
                      points={monthSlice.pnlHistory}
                      asPnl
                    />
                  )}
                </div>
              )}

              <div>
                <h3 className="mb-2 text-sm font-medium text-zinc-200">
                  포지션 변경 기록
                </h3>
                {events.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    아직 기록된 이벤트가 없습니다. 동기화를 반복하면
                    오픈·증감·청산이 쌓입니다.
                  </p>
                ) : (
                  <ul className="max-h-72 space-y-1.5 overflow-y-auto pretty-scroll">
                    {events.map((ev) => (
                      <li
                        key={ev.id}
                        className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded border border-zinc-800/80 bg-zinc-950/30 px-2.5 py-1.5 text-sm"
                      >
                        <span className="text-[11px] text-zinc-600">
                          {formatKst(ev.observed_at)}
                        </span>
                        <span className="font-medium text-zinc-200">
                          {ev.coin}
                        </span>
                        <span
                          className={
                            ev.side === "LONG"
                              ? "text-emerald-400"
                              : "text-rose-400"
                          }
                        >
                          {ev.side}
                        </span>
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-300">
                          {EVENT_LABEL[ev.event_type]}
                        </span>
                        <span className="tabular-nums text-zinc-500">
                          {ev.size_before ?? 0} → {ev.size_after ?? 0}
                        </span>
                        {ev.note ? (
                          <span className="text-xs text-zinc-600">
                            {ev.note}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium text-zinc-200">
                  최근 체결 (HL)
                </h3>
                {fills.length === 0 ? (
                  <p className="text-sm text-zinc-500">체결 내역이 없습니다.</p>
                ) : (
                  <div className="max-h-72 overflow-auto pretty-scroll">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="sticky top-0 border-b border-zinc-800 bg-zinc-950 text-[11px] uppercase tracking-wide text-zinc-500">
                        <tr>
                          <th className="px-2 py-2 font-medium">시각</th>
                          <th className="px-2 py-2 font-medium">코인</th>
                          <th className="px-2 py-2 font-medium">방향</th>
                          <th className="px-2 py-2 font-medium">가격</th>
                          <th className="px-2 py-2 font-medium">크기</th>
                          <th className="px-2 py-2 font-medium">실현</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fills.slice(0, 80).map((f, i) => (
                          <tr
                            key={`${f.hash}-${i}`}
                            className="border-b border-zinc-900/80 text-zinc-300"
                          >
                            <td className="px-2 py-1.5 text-xs text-zinc-500">
                              {f.time ? formatKst(f.time) : "-"}
                            </td>
                            <td className="px-2 py-1.5">{f.coin}</td>
                            <td className="px-2 py-1.5 text-xs text-zinc-400">
                              {f.dir || f.side}
                            </td>
                            <td className="px-2 py-1.5 tabular-nums">
                              {f.px.toLocaleString()}
                            </td>
                            <td className="px-2 py-1.5 tabular-nums">
                              {f.sz}
                            </td>
                            <td
                              className={`px-2 py-1.5 tabular-nums ${pnlClass(f.closedPnl)}`}
                            >
                              {formatPnl(f.closedPnl)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PortfolioMini({
  title,
  points,
  asPnl,
}: {
  title: string;
  points: Array<{ time: number; value: number }>;
  asPnl?: boolean;
}) {
  if (points.length < 2) {
    return (
      <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
        <p className="text-xs text-zinc-500">{title}</p>
        <p className="mt-2 text-sm text-zinc-600">데이터 부족</p>
      </div>
    );
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const last = values[values.length - 1];
  const first = values[0];
  const delta = last - first;
  const range = max - min || 1;
  const w = 220;
  const h = 48;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p.value - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-xs text-zinc-500">{title}</p>
        <p className={`text-sm tabular-nums ${pnlClass(asPnl ? last : delta)}`}>
          {asPnl ? formatPnl(last) : formatPnl(delta)}
        </p>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full text-emerald-400/80">
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
