import { createSupabaseAdmin } from "@/lib/supabase/client";
import { durationMinutes, inferStatus } from "@/lib/utils/format";
import { binanceOrderExternalId } from "./binance";

interface StoredFill {
  id: string;
  external_id: string;
  symbol: string;
  base_asset: string | null;
  side: "LONG" | "SHORT";
  qty: number;
  entry_price: number;
  exit_price: number;
  leverage: number | null;
  pnl: number;
  fee: number | null;
  status: string;
  entry_time: string;
  exit_time: string;
  notes: string | null;
  screenshot_url: string | null;
  tags: string[] | null;
  raw: Record<string, unknown> | null;
  is_review?: boolean | null;
}

function orderIdOf(raw: StoredFill["raw"]): string | null {
  const id = raw?.orderId;
  if (id == null || id === "") return null;
  return String(id);
}

function isCanonical(row: StoredFill, orderId: string): boolean {
  return row.external_id === binanceOrderExternalId(row.symbol, orderId);
}

function tradeIdsOf(raw: StoredFill["raw"]): string[] {
  const ids: string[] = [];
  if (raw?.id != null) ids.push(String(raw.id));
  if (Array.isArray(raw?.tradeIds)) {
    for (const id of raw.tradeIds) ids.push(String(id));
  }
  return ids;
}

function missingTable(message: string): boolean {
  return (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("Could not find")
  );
}

async function loadBinanceTrades(): Promise<StoredFill[]> {
  const supabase = createSupabaseAdmin();
  const rows: StoredFill[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("trades")
      .select(
        "id, external_id, symbol, base_asset, side, qty, entry_price, exit_price, leverage, pnl, fee, status, entry_time, exit_time, notes, screenshot_url, tags, raw, is_review"
      )
      .eq("exchange", "binance")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as StoredFill[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function keeperOf(rows: StoredFill[]): StoredFill {
  const canonical = rows.find((row) => {
    const orderId = orderIdOf(row.raw);
    return orderId != null && isCanonical(row, orderId);
  });
  if (canonical) return canonical;
  return [...rows].sort((a, b) => {
    const score = (row: StoredFill) =>
      (row.notes?.trim() ? 4 : 0) +
      (row.is_review ? 4 : 0) +
      (row.screenshot_url ? 2 : 0);
    return score(b) - score(a) || a.exit_time.localeCompare(b.exit_time);
  })[0]!;
}

/** 이미 저장된 바이낸스 체결 조각을 주문 번호 기준으로 한 줄로 합친다. */
export async function collapseBinanceFillTrades(): Promise<{
  groups: number;
  removed: number;
}> {
  const supabase = createSupabaseAdmin();
  const trades = await loadBinanceTrades();
  const groups = new Map<string, StoredFill[]>();
  for (const trade of trades) {
    const orderId = orderIdOf(trade.raw);
    if (!orderId) continue;
    const key = `${trade.symbol}:${orderId}`;
    const list = groups.get(key) ?? [];
    list.push(trade);
    groups.set(key, list);
  }

  let mergedGroups = 0;
  let removed = 0;

  for (const [key, rows] of groups) {
    const orderId = key.split(":")[1]!;
    const canonical = rows.find((row) => isCanonical(row, orderId));
    const fills = rows.filter((row) => !isCanonical(row, orderId));
    if (fills.length === 0) continue;

    const keeper = canonical ?? keeperOf(fills);
    const drops = rows.filter((row) => row.id !== keeper.id);
    if (drops.length === 0 && isCanonical(keeper, orderId)) continue;

    if (!canonical) {
      const qty = fills.reduce((sum, row) => sum + Number(row.qty), 0);
      const pnl = fills.reduce((sum, row) => sum + Number(row.pnl), 0);
      const fee = fills.reduce((sum, row) => sum + Number(row.fee ?? 0), 0);
      const exitNotional = fills.reduce(
        (sum, row) => sum + Number(row.exit_price) * Number(row.qty),
        0
      );
      const exitPrice = qty > 0 ? exitNotional / qty : Number(keeper.exit_price);
      const entryPrice =
        qty > 0
          ? keeper.side === "LONG"
            ? exitPrice - pnl / qty
            : exitPrice + pnl / qty
          : Number(keeper.entry_price);
      const notional = Math.abs(entryPrice * qty);
      const entryTime = fills.reduce(
        (min, row) => (row.entry_time < min ? row.entry_time : min),
        fills[0]!.entry_time
      );
      const exitTime = fills.reduce(
        (max, row) => (row.exit_time > max ? row.exit_time : max),
        fills[0]!.exit_time
      );
      const notes = [
        ...new Set(fills.map((row) => row.notes?.trim()).filter(Boolean)),
      ].join("\n");
      const tags = [...new Set(fills.flatMap((row) => row.tags ?? []))];
      const tradeIds = [...new Set(fills.flatMap((row) => tradeIdsOf(row.raw)))];

      const { error } = await supabase
        .from("trades")
        .update({
          external_id: binanceOrderExternalId(keeper.symbol, orderId),
          qty,
          entry_price: entryPrice,
          exit_price: exitPrice,
          pnl,
          pnl_percent: notional > 0 ? (pnl / notional) * 100 : null,
          fee,
          status: inferStatus(keeper.side, entryPrice, exitPrice, pnl),
          entry_time: entryTime,
          exit_time: exitTime,
          duration_minutes: durationMinutes(new Date(entryTime), new Date(exitTime)),
          notes: notes || keeper.notes,
          tags,
          is_review: fills.some((row) => row.is_review),
          screenshot_url:
            fills.find((row) => row.screenshot_url)?.screenshot_url ?? null,
          raw: {
            orderId: Number(orderId) || orderId,
            fillCount: fills.length,
            tradeIds,
          },
        })
        .eq("id", keeper.id);
      if (error) throw error;
    }

    const dropIds = drops.map((row) => row.id);
    if (dropIds.length === 0) {
      mergedGroups += 1;
      continue;
    }

    const comments = await supabase
      .from("trade_comments")
      .update({ trade_id: keeper.id })
      .in("trade_id", dropIds);
    if (comments.error && !missingTable(comments.error.message)) {
      throw comments.error;
    }

    const charts = await supabase
      .from("trade_chart_candles")
      .select("trade_id")
      .in("trade_id", [keeper.id, ...dropIds]);
    if (charts.error && !missingTable(charts.error.message)) throw charts.error;
    if (!charts.error) {
      const keeperHasChart = (charts.data ?? []).some(
        (row) => row.trade_id === keeper.id
      );
      const donor = (charts.data ?? []).find((row) => row.trade_id !== keeper.id);
      if (!keeperHasChart && donor) {
        await supabase
          .from("trade_chart_candles")
          .update({ trade_id: keeper.id })
          .eq("trade_id", donor.trade_id);
      }
    }

    const deleted = await supabase.from("trades").delete().in("id", dropIds);
    if (deleted.error) throw deleted.error;

    mergedGroups += 1;
    removed += dropIds.length;
  }

  return { groups: mergedGroups, removed };
}
