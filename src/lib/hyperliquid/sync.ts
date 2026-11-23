import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchClearinghouseState } from "./client";
import {
  INITIAL_SNAPSHOT_NOTE,
  type HlEventType,
  type HlLivePosition,
  type HlOpenPosition,
  type HlSide,
} from "./types";

const SIZE_EPS = 1e-9;

function posKey(coin: string, side: HlSide): string {
  return `${coin}:${side}`;
}

function sizeChanged(a: number, b: number): boolean {
  return Math.abs(a - b) > SIZE_EPS;
}

interface EventInsert {
  trader_id: string;
  coin: string;
  side: HlSide;
  event_type: HlEventType;
  size_before: number | null;
  size_after: number | null;
  entry_price: number | null;
  mark_price: number | null;
  unrealised_pnl: number | null;
  note: string | null;
  raw: unknown;
}

function diffPositions(
  traderId: string,
  prev: HlOpenPosition[],
  next: HlLivePosition[]
): EventInsert[] {
  const prevMap = new Map(prev.map((p) => [posKey(p.coin, p.side), p]));
  const nextMap = new Map(next.map((p) => [posKey(p.coin, p.side), p]));
  const events: EventInsert[] = [];
  const handledPrev = new Set<string>();

  for (const [key, cur] of nextMap) {
    const old = prevMap.get(key);
    if (!old) {
      const opposite: HlSide = cur.side === "LONG" ? "SHORT" : "LONG";
      const flipFrom = prevMap.get(posKey(cur.coin, opposite));
      if (flipFrom) {
        events.push({
          trader_id: traderId,
          coin: cur.coin,
          side: cur.side,
          event_type: "FLIP",
          size_before: flipFrom.size,
          size_after: cur.size,
          entry_price: cur.entryPrice,
          mark_price: cur.markPrice,
          unrealised_pnl: cur.unrealisedPnl,
          note: `${opposite} → ${cur.side}`,
          raw: cur.raw,
        });
        handledPrev.add(posKey(cur.coin, opposite));
      } else {
        events.push({
          trader_id: traderId,
          coin: cur.coin,
          side: cur.side,
          event_type: "OPEN",
          size_before: 0,
          size_after: cur.size,
          entry_price: cur.entryPrice,
          mark_price: cur.markPrice,
          unrealised_pnl: cur.unrealisedPnl,
          note: null,
          raw: cur.raw,
        });
      }
      continue;
    }

    handledPrev.add(key);
    if (!sizeChanged(old.size, cur.size)) continue;
    events.push({
      trader_id: traderId,
      coin: cur.coin,
      side: cur.side,
      event_type: cur.size > old.size ? "INCREASE" : "DECREASE",
      size_before: old.size,
      size_after: cur.size,
      entry_price: cur.entryPrice,
      mark_price: cur.markPrice,
      unrealised_pnl: cur.unrealisedPnl,
      note: null,
      raw: cur.raw,
    });
  }

  for (const [key, old] of prevMap) {
    if (handledPrev.has(key)) continue;
    if (nextMap.has(key)) continue;
    events.push({
      trader_id: traderId,
      coin: old.coin,
      side: old.side,
      event_type: "CLOSE",
      size_before: old.size,
      size_after: 0,
      entry_price: old.entry_price,
      mark_price: old.mark_price,
      unrealised_pnl: old.unrealised_pnl,
      note: null,
      raw: old.raw,
    });
  }

  return events;
}

export interface SyncTraderResult {
  traderId: string;
  address: string;
  accountValue: number | null;
  positionCount: number;
  eventsCreated: number;
  error?: string;
}

export async function syncTraderPositions(
  supabase: SupabaseClient,
  trader: { id: string; address: string; last_synced_at?: string | null }
): Promise<SyncTraderResult> {
  const base: SyncTraderResult = {
    traderId: trader.id,
    address: trader.address,
    accountValue: null,
    positionCount: 0,
    eventsCreated: 0,
  };

  try {
    const snap = await fetchClearinghouseState(trader.address);
    base.accountValue = snap.accountValue;
    base.positionCount = snap.positions.length;

    const { data: prevRows, error: prevErr } = await supabase
      .from("hl_open_positions")
      .select("*")
      .eq("trader_id", trader.id);
    if (prevErr) throw prevErr;

    const prev = (prevRows ?? []) as HlOpenPosition[];
    const firstSync = !trader.last_synced_at;
    const events = diffPositions(trader.id, prev, snap.positions).map((e) =>
      firstSync ? { ...e, note: INITIAL_SNAPSHOT_NOTE } : e
    );

    if (events.length > 0) {
      const { error: evErr } = await supabase
        .from("hl_position_events")
        .insert(events);
      if (evErr) throw evErr;
      base.eventsCreated = events.length;
    }

    const { error: delErr } = await supabase
      .from("hl_open_positions")
      .delete()
      .eq("trader_id", trader.id);
    if (delErr) throw delErr;

    if (snap.positions.length > 0) {
      const rows = snap.positions.map((p) => {
        const old = prev.find(
          (x) => x.coin === p.coin && x.side === p.side
        );
        return {
          trader_id: trader.id,
          coin: p.coin,
          side: p.side,
          size: p.size,
          entry_price: p.entryPrice,
          mark_price: p.markPrice,
          unrealised_pnl: p.unrealisedPnl,
          leverage: p.leverage,
          liquidation_px: p.liquidationPx,
          position_value: p.positionValue,
          raw: p.raw,
          opened_at: old?.opened_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      });
      const { error: insErr } = await supabase
        .from("hl_open_positions")
        .insert(rows);
      if (insErr) throw insErr;
    }

    const now = new Date().toISOString();
    const { error: updErr } = await supabase
      .from("hl_traders")
      .update({
        account_value: snap.accountValue,
        last_synced_at: now,
        updated_at: now,
      })
      .eq("id", trader.id);
    if (updErr) throw updErr;

    return base;
  } catch (err) {
    base.error = err instanceof Error ? err.message : String(err);
    return base;
  }
}

export async function syncActiveTraders(
  supabase: SupabaseClient,
  traderId?: string
): Promise<SyncTraderResult[]> {
  let query = supabase
    .from("hl_traders")
    .select("id, address, last_synced_at")
    .eq("is_active", true);

  if (traderId) query = query.eq("id", traderId);

  const { data, error } = await query;
  if (error) throw error;

  const traders = (data ?? []) as Array<{
    id: string;
    address: string;
    last_synced_at: string | null;
  }>;
  const results: SyncTraderResult[] = [];
  for (const t of traders) {
    results.push(await syncTraderPositions(supabase, t));
  }

  // 포지션 동기화 후 과거 성과(일/주/월/올타임) 갱신
  if (traders.length > 0) {
    try {
      const { fetchPerfForAddresses, traderPerfPatch } = await import("./perf");
      const perfMap = await fetchPerfForAddresses(traders.map((t) => t.address));
      for (const t of traders) {
        const perf = perfMap.get(t.address.toLowerCase());
        if (!perf) continue;
        const { error: perfErr } = await supabase
          .from("hl_traders")
          .update(traderPerfPatch(perf))
          .eq("id", t.id);
        if (perfErr && !String(perfErr.message).includes("pnl_")) {
          // 컬럼 없으면 무시(마이그레이션 전)
          console.warn("hl perf update", t.address, perfErr.message);
        }
      }
    } catch (err) {
      console.warn("hl perf sync failed", err);
    }
  }

  return results;
}
