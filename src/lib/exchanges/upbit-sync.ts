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
}): Promise<UpbitSyncResult> {
  const orderPages = Math.min(20, Math.max(1, options?.orderPages ?? 5));
  const transferPages = Math.min(10, Math.max(1, options?.transferPages ?? 3));
  const supabase = createSupabaseAdmin();
  const syncedAt = new Date().toISOString();

  try {
    const accounts = await fetchUpbitAccounts();
    const { error: snapErr } = await supabase
      .from("upbit_account_snapshots")
      .insert({
        synced_at: syncedAt,
        accounts: accounts as unknown as UpbitAccount[],
        note: "manual sync",
      });
    if (snapErr) throw snapErr;

    let ordersFetched = 0;
    let ordersInserted = 0;
    let ordersSkipped = 0;

    for (let page = 1; page <= orderPages; page++) {
      const batch = await fetchUpbitClosedOrders({ page, limit: 100, state: "done" });
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

      // 한 페이지가 전부 이미 있으면 더 오래된 쪽도 이미 있을 가능성 큼 → 조기 종료
      if (fresh.length === 0 && page >= 2) break;
      if (batch.length < 100) break;
    }

    let transfersFetched = 0;
    let transfersInserted = 0;
    let transfersSkipped = 0;

    async function ingestTransfers(
      kind: "deposit" | "withdraw",
      fetcher: (p: number) => Promise<UpbitTransfer[]>
    ) {
      for (let page = 1; page <= transferPages; page++) {
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
        if (fresh.length === 0 && page >= 2) break;
        if (batch.length < 100) break;
      }
    }

    await ingestTransfers("deposit", (page) =>
      fetchUpbitDeposits({ page, limit: 100 })
    );
    await ingestTransfers("withdraw", (page) =>
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
      syncedAt,
    };
  } catch (err) {
    return {
      accounts: 0,
      ordersFetched: 0,
      ordersInserted: 0,
      ordersSkipped: 0,
      transfersFetched: 0,
      transfersInserted: 0,
      transfersSkipped: 0,
      syncedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
