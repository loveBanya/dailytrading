"use client";

import { useCallback, useEffect, useState } from "react";
import { formatKst } from "@/lib/utils/format";

interface Account {
  currency: string;
  balance: string;
  locked: string;
  avg_buy_price: string;
}

interface OrderRow {
  uuid: string;
  market: string;
  side: string;
  price: number | null;
  executed_volume: number | null;
  paid_fee: number | null;
  done_at: string | null;
  created_at: string | null;
}

interface TransferRow {
  uuid: string;
  kind: string;
  currency: string;
  amount: number | null;
  fee: number | null;
  state: string | null;
  done_at: string | null;
  txid: string | null;
}

function wonOrAmt(currency: string, n: number): string {
  if (currency === "KRW") {
    return `₩${Math.round(n).toLocaleString("ko-KR")}`;
  }
  return n.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

export function UpbitPanel() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [cached, setCached] = useState(false);
  const [publicIp, setPublicIp] = useState<string | null>(null);
  const [ipLoading, setIpLoading] = useState(false);
  const [ipCopied, setIpCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/upbit");
      const data = (await res.json()) as {
        snapshot?: { synced_at: string; accounts: Account[] } | null;
        orders?: OrderRow[];
        transfers?: TransferRow[];
        hasCredentials?: boolean;
        cached?: boolean;
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setHasCredentials(!!data.hasCredentials);
      setSyncedAt(data.snapshot?.synced_at ?? null);
      setAccounts(data.snapshot?.accounts ?? []);
      setOrders(data.orders ?? []);
      setTransfers(data.transfers ?? []);
      setCached(!!data.cached);
    } catch (err) {
      setError(err instanceof Error ? err.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function syncOnce(mode: "recent" | "older" = "recent") {
    setSyncing(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/upbit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "older"
            ? { mode: "older", orderPages: 5, transferPages: 3 }
            : { mode: "recent", orderPages: 2, transferPages: 1 }
        ),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        accounts?: number;
        ordersInserted?: number;
        ordersSkipped?: number;
        transfersInserted?: number;
        transfersSkipped?: number;
        orderStartPage?: number;
        syncedAt?: string;
      };
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "동기화 실패");
      }
      const pageHint =
        mode === "older" && data.orderStartPage
          ? ` · 주문 p${data.orderStartPage}~`
          : "";
      setMessage(
        `${mode === "older" ? "이전 이력" : "동기화"} 완료${pageHint} · 잔고 ${data.accounts ?? 0}종 · 주문 +${data.ordersInserted ?? 0}/건너뜀 ${data.ordersSkipped ?? 0} · 입출금 +${data.transfersInserted ?? 0}/건너뜀 ${data.transfersSkipped ?? 0}`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "동기화 실패");
    } finally {
      setSyncing(false);
    }
  }

  async function loadPublicIp() {
    setIpLoading(true);
    setIpCopied(false);
    try {
      const res = await fetch("https://api.ipify.org?format=json");
      const data = (await res.json()) as { ip?: string };
      if (!data.ip) throw new Error("IP를 가져오지 못했습니다");
      setPublicIp(data.ip);
    } catch {
      try {
        const res2 = await fetch("https://ifconfig.me/ip");
        const text = (await res2.text()).trim();
        if (!text) throw new Error("fail");
        setPublicIp(text);
      } catch {
        setPublicIp(null);
        setError(
          "공인 IP를 가져오지 못했습니다. 브라우저에서 https://ifconfig.me 을 열어보세요."
        );
      }
    } finally {
      setIpLoading(false);
    }
  }

  async function copyIp() {
    if (!publicIp) return;
    try {
      await navigator.clipboard.writeText(publicIp);
      setIpCopied(true);
      window.setTimeout(() => setIpCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  const missingTable =
    error?.includes("upbit_") ||
    error?.includes("schema cache") ||
    error?.includes("does not exist");

  const held = accounts.filter((a) => Number(a.balance) + Number(a.locked) > 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        업비트 API는{" "}
        <span className="text-zinc-300">로컬에서</span> 동기화해 DB에
        저장합니다. 「더 이전」을 여러 번 누르면 과거 주문이 이어서
        쌓입니다. 한도가 나면 1~2분 후 다시 누르세요.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={syncing}
          onClick={() => void syncOnce("recent")}
          className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-200 disabled:opacity-40"
        >
          {syncing ? "업비트 호출 중…" : "최근 동기화"}
        </button>
        <button
          type="button"
          disabled={syncing}
          onClick={() => void syncOnce("older")}
          className="rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm text-violet-200 disabled:opacity-40"
          title="이미 저장된 다음 페이지부터 더 옛 주문·입출금 가져오기"
        >
          {syncing ? "불러오는 중…" : "더 이전 불러오기"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200"
        >
          DB 새로고침
        </button>
        <button
          type="button"
          disabled={ipLoading}
          onClick={() => void loadPublicIp()}
          className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-500"
        >
          {ipLoading ? "IP 조회 중…" : "내 공인 IP 보기"}
        </button>
        {publicIp && (
          <button
            type="button"
            onClick={() => void copyIp()}
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 font-mono text-sm text-amber-100"
            title="클릭하면 복사"
          >
            {publicIp}
            <span className="ml-2 text-[11px] text-amber-300/70">
              {ipCopied ? "복사됨" : "복사"}
            </span>
          </button>
        )}
        {syncedAt && (
          <span className="text-xs text-zinc-600">
            마지막 동기화 {formatKst(syncedAt)} KST
            {cached ? " · 캐시" : ""}
          </span>
        )}
        {!hasCredentials && (
          <span className="text-xs text-amber-300/80">
            .env.local 에 UPBIT_SECRET_KEY 필요
          </span>
        )}
      </div>

      {publicIp && (
        <p className="text-xs text-zinc-500">
          위 IP를 업비트 → Open API → 해당 키 →{" "}
          <span className="text-zinc-300">허용 IP</span>에 등록한 뒤, 로컬에서
          「업비트 1회 동기화」를 누르세요.
        </p>
      )}

      {message && (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200">
          {message}
        </p>
      )}
      {missingTable && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
          테이블이 없습니다. Supabase에서{" "}
          <code className="text-amber-100">011_upbit_cache.sql</code> 을 실행하세요.
        </p>
      )}
      {error && !missingTable && (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-200">
          {error}
          {(error.includes("IP") || error.includes("ip") || error.includes("403")) && (
            <span className="mt-1 block text-zinc-400">
              업비트 키에 현재 PC 공인 IP를 등록했는지 확인하세요. Vercel에서는
              보통 실패하므로 로컬에서 동기화하세요.
            </span>
          )}
        </p>
      )}

      {loading ? (
        <p className="text-xs text-zinc-500">불러오는 중…</p>
      ) : (
        <>
          <div>
            <h4 className="mb-2 text-xs font-medium text-zinc-400">보유 자산 (스냅샷)</h4>
            {held.length === 0 ? (
              <p className="text-xs text-zinc-600">동기화된 잔고가 없습니다.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {held.map((a) => {
                  const total = Number(a.balance) + Number(a.locked);
                  return (
                    <li
                      key={a.currency}
                      className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs"
                    >
                      <span className="font-medium text-zinc-200">{a.currency}</span>
                      <span className="ml-2 tabular-nums text-zinc-400">
                        {wonOrAmt(a.currency, total)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h4 className="mb-2 text-xs font-medium text-zinc-400">
                체결·종료 주문 (DB)
              </h4>
              <ul className="max-h-64 divide-y divide-zinc-800 overflow-y-auto rounded-lg border border-zinc-800 text-xs">
                {orders.length === 0 && (
                  <li className="px-3 py-6 text-center text-zinc-600">없음</li>
                )}
                {orders.map((o) => (
                  <li key={o.uuid} className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <span className="font-medium text-zinc-200">{o.market}</span>
                      <span
                        className={
                          o.side === "bid" ? "text-emerald-400" : "text-rose-400"
                        }
                      >
                        {o.side === "bid" ? "매수" : "매도"}
                      </span>
                      <span className="tabular-nums text-zinc-500">
                        {o.executed_volume ?? "—"} @ {o.price ?? "—"}
                      </span>
                      <span className="ml-auto text-zinc-600">
                        {o.done_at
                          ? formatKst(o.done_at)
                          : o.created_at
                            ? formatKst(o.created_at)
                            : ""}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-2 text-xs font-medium text-zinc-400">
                입출금 (DB)
              </h4>
              <ul className="max-h-64 divide-y divide-zinc-800 overflow-y-auto rounded-lg border border-zinc-800 text-xs">
                {transfers.length === 0 && (
                  <li className="px-3 py-6 text-center text-zinc-600">없음</li>
                )}
                {transfers.map((t) => (
                  <li key={t.uuid} className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={
                          t.kind === "deposit"
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }
                      >
                        {t.kind === "deposit" ? "입금" : "출금"}
                      </span>
                      <span className="font-medium text-zinc-200">
                        {t.currency}
                      </span>
                      <span className="tabular-nums text-zinc-400">
                        {t.amount != null
                          ? wonOrAmt(t.currency, Number(t.amount))
                          : "—"}
                      </span>
                      <span className="text-zinc-600">{t.state}</span>
                      <span className="ml-auto text-zinc-600">
                        {t.done_at ? formatKst(t.done_at) : ""}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
