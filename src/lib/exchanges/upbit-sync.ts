import { createSupabaseAdmin } from "@/lib/supabase/client";
import {
  fetchUpbitAccounts,
  fetchUpbitClosedOrders,
  fetchUpbitDeposits,
  fetchUpbitWithdraws,
  type UpbitAccount,
  type UpbitOrder,
  type UpbitTransfer,
} from "./upbit-client";

export interface UpbitSyncResult {
  accounts: number;
  ordersFetched: number;
  ordersInserted: number;
  ordersSkipped: number;
  transfersFetched: number;
  transfersInserted: number;
  transfersSkipped: number;
  orderStartPage: number;
  transferStartPage: number;
  mode: "recent" | "older";
  syncedAt: string;
  error?: string;
}

function num(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toIso(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function orderRow(o: UpbitOrder) {
  return {
    uuid: o.uuid,
    market: o.market,
    side: o.side,
    ord_type: o.ord_type ?? null,
    state: o.state ?? null,
    price: num(o.price),
    volume: num(o.volume),
    executed_volume: num(o.executed_volume),
    paid_fee: num(o.paid_fee),
    created_at: toIso(o.created_at),
    done_at: toIso(o.done_at ?? null),
    raw: o as unknown as Record<string, unknown>,
  };
}

function transferRow(kind: "deposit" | "withdraw", t: UpbitTransfer) {
  return {
    uuid: t.uuid,
    kind,
    currency: t.currency,
    amount: num(t.amount),
    fee: num(t.fee),
    state: t.state ?? null,
    created_at: toIso(t.created_at),
    done_at: toIso(t.done_at ?? null),
    txid: t.txid ?? null,
    raw: t as unknown as Record<string, unknown>,
  };
}

/** 업비트 API 1회 호출 → DB 저장. 기존 uuid는 건너뜀(이력 불변). */
export async function syncUpbitOnce(options?: {
  orderPages?: number;
  transferPages?: number;
  /** recent: 최신부터. older: DB에 쌓인 만큼 건너뛰고 더 옛 페이지 */
  mode?: "recent" | "older";
}): Promise<UpbitSyncResult> {
  const mode = options?.mode === "older" ? "older" : "recent";
  const orderPages = Math.min(
    20,
    Math.max(1, options?.orderPages ?? (mode === "older" ? 5 : 2))
  );
  const transferPages = Math.min(
    10,
    Math.max(1, options?.transferPages ?? (mode === "older" ? 3 : 1))
  );
  const supabase = createSupabaseAdmin();
  const syncedAt = new Date().toISOString();

  const empty = (error?: string): UpbitSyncResult => ({
    accounts: 0,
    ordersFetched: 0,
    ordersInserted: 0,
    ordersSkipped: 0,
    transfersFetched: 0,
    transfersInserted: 0,
    transfersSkipped: 0,
    orderStartPage: 1,
    transferStartPage: 1,
    mode,
    syncedAt,
    error,
  });

  try {
    let orderStartPage = 1;
    let transferStartPage = 1;
    let depositStartPage = 1;
    let withdrawStartPage = 1;
    if (mode === "older") {
      const [
        { count: orderCount },
        { count: depositCount },
        { count: withdrawCount },
      ] = await Promise.all([
        supabase.from("upbit_orders").select("*", { count: "exact", head: true }),
        supabase
          .from("upbit_transfers")
          .select("*", { count: "exact", head: true })
          .eq("kind", "deposit"),
        supabase
          .from("upbit_transfers")
          .select("*", { count: "exact", head: true })
          .eq("kind", "withdraw"),
      ]);
      // 마지막 페이지와 1페이지 겹쳐 구멍 방지
      orderStartPage = Math.max(1, Math.floor((orderCount ?? 0) / 100));
      depositStartPage = Math.max(1, Math.floor((depositCount ?? 0) / 100));
      withdrawStartPage = Math.max(1, Math.floor((withdrawCount ?? 0) / 100));
      transferStartPage = Math.min(depositStartPage, withdrawStartPage);
    }

    const accounts = await fetchUpbitAccounts();
    const { error: snapErr } = await supabase
      .from("upbit_account_snapshots")
      .insert({
        synced_at: syncedAt,
        accounts: accounts as unknown as UpbitAccount[],
        note: mode === "older" ? "older sync" : "manual sync",
      });
    if (snapErr) throw snapErr;

    let ordersFetched = 0;
    let ordersInserted = 0;
    let ordersSkipped = 0;

    for (let i = 0; i < orderPages; i++) {
      const page = orderStartPage + i;
      const batch = await fetchUpbitClosedOrders({
        page,
        limit: 100,
        state: "done",
      });
      if (batch.length === 0) break;
      ordersFetched += batch.length;

      const uuids = batch.map((o) => o.uuid);
      const { data: existing } = await supabase
        .from("upbit_orders")
        .select("uuid")
        .in("uuid", uuids);
      const have = new Set((existing ?? []).map((r) => r.uuid as string));
      const fresh = batch.filter((o) => !have.has(o.uuid)).map(orderRow);
      ordersSkipped += batch.length - fresh.length;

      if (fresh.length > 0) {
        const { error } = await supabase.from("upbit_orders").insert(fresh);
        if (error) throw error;
        ordersInserted += fresh.length;
      }

      // recent만: 이미 있는 구간이면 조기 종료. older는 더 뒤로 계속
      if (mode === "recent" && fresh.length === 0 && i >= 1) break;
      if (batch.length < 100) break;
    }

    let transfersFetched = 0;
    let transfersInserted = 0;
    let transfersSkipped = 0;

    async function ingestTransfers(
      kind: "deposit" | "withdraw",
      startPage: number,
      fetcher: (p: number) => Promise<UpbitTransfer[]>
    ) {
      for (let i = 0; i < transferPages; i++) {
        const page = startPage + i;
        const batch = await fetcher(page);
        if (batch.length === 0) break;
        transfersFetched += batch.length;
        const uuids = batch.map((t) => t.uuid);
        const { data: existing } = await supabase
          .from("upbit_transfers")
          .select("uuid")
          .in("uuid", uuids);
        const have = new Set((existing ?? []).map((r) => r.uuid as string));
        const fresh = batch
          .filter((t) => !have.has(t.uuid))
          .map((t) => transferRow(kind, t));
        transfersSkipped += batch.length - fresh.length;
        if (fresh.length > 0) {
          const { error } = await supabase.from("upbit_transfers").insert(fresh);
          if (error) throw error;
          transfersInserted += fresh.length;
        }
        if (mode === "recent" && fresh.length === 0 && i >= 1) break;
        if (batch.length < 100) break;
      }
    }

    await ingestTransfers("deposit", depositStartPage, (page) =>
      fetchUpbitDeposits({ page, limit: 100 })
    );
    await ingestTransfers("withdraw", withdrawStartPage, (page) =>
      fetchUpbitWithdraws({ page, limit: 100 })
    );

    return {
      accounts: accounts.length,
      ordersFetched,
      ordersInserted,
      ordersSkipped,
      transfersFetched,
      transfersInserted,
      transfersSkipped,
      orderStartPage,
      transferStartPage,
      mode,
      syncedAt,
    };
  } catch (err) {
    return empty(err instanceof Error ? err.message : String(err));
  }
}
