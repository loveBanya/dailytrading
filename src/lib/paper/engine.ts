import type { SupabaseClient } from "@supabase/supabase-js";
import { syncActiveTraders } from "@/lib/hyperliquid/sync";
import type { ScreenerExchange } from "@/lib/screener/types";
import {
  evaluateIndicatorSignal,
  fetchCloses,
  fetchMarkPrice,
  hlCoinToBinanceSymbol,
  type PaperInterval,
} from "./market";
import { fetchMarketMovers } from "@/lib/market/movers";
import type {
  CopyStrategyConfig,
  IndicatorStrategyConfig,
  MoversStrategyConfig,
  PaperTickResult,
  PaperSide,
} from "./types";

const FEE_RATE = 0.0004; // 왕복에 가깝게 편도 4bps

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function unrealised(
  side: PaperSide,
  entry: number,
  mark: number,
  qty: number
): number {
  if (side === "LONG") return (mark - entry) * qty;
  return (entry - mark) * qty;
}

async function markOpenPositions(
  supabase: SupabaseClient,
  accountId: string
): Promise<number> {
  const { data: opens, error } = await supabase
    .from("paper_positions")
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "open");
  if (error) throw error;

  let openPnl = 0;
  for (const p of opens ?? []) {
    try {
      const mark = await fetchMarkPrice(
        (p.exchange as ScreenerExchange) || "binance",
        String(p.symbol)
      );
      const pnl = unrealised(
        p.side as PaperSide,
        num(p.entry_price),
        mark,
        num(p.qty)
      );
      openPnl += pnl;
      await supabase
        .from("paper_positions")
        .update({
          mark_price: mark,
          unrealised_pnl: pnl,
          notional: mark * num(p.qty),
          updated_at: new Date().toISOString(),
        })
        .eq("id", p.id);
    } catch {
      openPnl += num(p.unrealised_pnl);
    }
  }
  return openPnl;
}

async function refreshAccountEquity(
  supabase: SupabaseClient,
  accountId: string,
  snapshot = true
): Promise<{ cash: number; equity: number; openPnl: number }> {
  const { data: acc, error } = await supabase
    .from("paper_accounts")
    .select("*")
    .eq("id", accountId)
    .single();
  if (error) throw error;

  const openPnl = await markOpenPositions(supabase, accountId);
  const cash = num(acc.cash);
  const equity = cash + openPnl;
  const now = new Date().toISOString();
  await supabase
    .from("paper_accounts")
    .update({
      equity,
      last_tick_at: now,
      updated_at: now,
    })
    .eq("id", accountId);

  if (snapshot) {
    await supabase.from("paper_equity_snapshots").insert({
      account_id: accountId,
      equity,
      cash,
      open_pnl: openPnl,
      taken_at: now,
    });
  }

  return { cash, equity, openPnl };
}

async function closePosition(
  supabase: SupabaseClient,
  position: {
    id: string;
    account_id: string;
    strategy_id: string | null;
    exchange: string;
    symbol: string;
    side: PaperSide;
    qty: number;
    entry_price: number;
  },
  price: number,
  reason: string
): Promise<void> {
  const qty = num(position.qty);
  const pnl = unrealised(position.side, num(position.entry_price), price, qty);
  const fee = Math.abs(price * qty) * FEE_RATE;
  const net = pnl - fee;
  const now = new Date().toISOString();

  const { data: acc } = await supabase
    .from("paper_accounts")
    .select("cash")
    .eq("id", position.account_id)
    .single();
  const cash = num(acc?.cash) + net;

  await supabase
    .from("paper_accounts")
    .update({ cash, updated_at: now })
    .eq("id", position.account_id);

  await supabase
    .from("paper_positions")
    .update({
      status: "closed",
      closed_at: now,
      close_price: price,
      realised_pnl: net,
      mark_price: price,
      unrealised_pnl: 0,
      updated_at: now,
    })
    .eq("id", position.id);

  await supabase.from("paper_fills").insert({
    account_id: position.account_id,
    strategy_id: position.strategy_id,
    position_id: position.id,
    exchange: position.exchange,
    symbol: position.symbol,
    side: position.side,
    action: "CLOSE",
    qty,
    price,
    notional: price * qty,
    fee,
    realised_pnl: net,
    reason,
    observed_at: now,
  });
}

async function openPosition(
  supabase: SupabaseClient,
  args: {
    accountId: string;
    strategyId: string;
    exchange: string;
    symbol: string;
    side: PaperSide;
    price: number;
    notional: number;
    leverage: number;
    reason: string;
    meta?: Record<string, unknown>;
  }
): Promise<boolean> {
  const { data: acc } = await supabase
    .from("paper_accounts")
    .select("cash")
    .eq("id", args.accountId)
    .single();
  const cash = num(acc?.cash);
  const notional = Math.min(args.notional, Math.max(0, cash * 0.95));
  if (notional < 5) return false;

  const qty = notional / args.price;
  const fee = notional * FEE_RATE;
  const now = new Date().toISOString();

  // 단순 모델: 진입 시 수수료만 cash에서 차감 (마진 락 없음, equity=cash+uPnL)
  await supabase
    .from("paper_accounts")
    .update({ cash: cash - fee, updated_at: now })
    .eq("id", args.accountId);

  const { data: pos, error } = await supabase
    .from("paper_positions")
    .insert({
      account_id: args.accountId,
      strategy_id: args.strategyId,
      exchange: args.exchange,
      symbol: args.symbol,
      side: args.side,
      qty,
      entry_price: args.price,
      mark_price: args.price,
      unrealised_pnl: 0,
      notional,
      leverage: args.leverage,
      status: "open",
      opened_at: now,
      meta: args.meta ?? {},
      updated_at: now,
    })
    .select("id")
    .single();
  if (error) throw error;

  await supabase.from("paper_fills").insert({
    account_id: args.accountId,
    strategy_id: args.strategyId,
    position_id: pos.id,
    exchange: args.exchange,
    symbol: args.symbol,
    side: args.side,
    action: "OPEN",
    qty,
    price: args.price,
    notional,
    fee,
    reason: args.reason,
    observed_at: now,
    meta: args.meta ?? {},
  });
  return true;
}

async function runIndicatorStrategy(
  supabase: SupabaseClient,
  strategy: {
    id: string;
    account_id: string;
    config: IndicatorStrategyConfig;
  }
): Promise<number> {
  const cfg = strategy.config;
  const exchange = (cfg.exchange ?? "binance") as ScreenerExchange;
  const symbol = cfg.symbol?.toUpperCase();
  if (!symbol) throw new Error("symbol 필요");
  const interval = (cfg.interval ?? "15m") as PaperInterval;
  const { closes, last } = await fetchCloses(exchange, symbol, interval, 120);
  const { signal, detail } = evaluateIndicatorSignal(closes, cfg);

  const { data: opens } = await supabase
    .from("paper_positions")
    .select("*")
    .eq("account_id", strategy.account_id)
    .eq("strategy_id", strategy.id)
    .eq("symbol", symbol)
    .eq("status", "open");

  let fills = 0;
  const open = (opens ?? [])[0] as
    | {
        id: string;
        account_id: string;
        strategy_id: string | null;
        exchange: string;
        symbol: string;
        side: PaperSide;
        qty: number;
        entry_price: number;
      }
    | undefined;

  // TP / SL
  if (open) {
    const entry = num(open.entry_price);
    const tp = cfg.takeProfitPct ?? 0;
    const sl = cfg.stopLossPct ?? 0;
    const ret =
      open.side === "LONG"
        ? ((last - entry) / entry) * 100
        : ((entry - last) / entry) * 100;
    if (tp > 0 && ret >= tp) {
      await closePosition(supabase, open, last, `TP ${tp}%`);
      fills += 1;
      return fills;
    }
    if (sl > 0 && ret <= -sl) {
      await closePosition(supabase, open, last, `SL ${sl}%`);
      fills += 1;
      return fills;
    }
  }

  if (signal === "HOLD" || signal === "FLAT") return fills;

  if (open && open.side === signal) return fills;

  if (open && open.side !== signal) {
    await closePosition(supabase, open, last, `반전 ${detail}`);
    fills += 1;
  }

  const { data: acc } = await supabase
    .from("paper_accounts")
    .select("cash")
    .eq("id", strategy.account_id)
    .single();
  const riskPct = Math.min(1, Math.max(0.01, cfg.riskPct ?? 0.1));
  const leverage = Math.max(1, cfg.leverage ?? 1);
  const notional = num(acc?.cash) * riskPct * leverage;

  const opened = await openPosition(supabase, {
    accountId: strategy.account_id,
    strategyId: strategy.id,
    exchange,
    symbol,
    side: signal,
    price: last,
    notional,
    leverage,
    reason: detail,
    meta: { rule: cfg.rule ?? "ema_cross", interval },
  });
  if (opened) fills += 1;
  return fills;
}

async function runCopyStrategy(
  supabase: SupabaseClient,
  strategy: {
    id: string;
    account_id: string;
    config: CopyStrategyConfig;
    last_run_at: string | null;
  }
): Promise<number> {
  const cfg = strategy.config;
  if (!cfg.traderId) throw new Error("traderId 필요");
  const scale = Math.max(0.01, cfg.scale ?? 0.1);
  const maxNotional = cfg.maxNotional ?? 2000;
  const coinFilter = (cfg.coins ?? []).map((c) => c.toUpperCase());

  // 원본 포지션 최신화
  await syncActiveTraders(supabase, cfg.traderId);

  const since =
    strategy.last_run_at ??
    new Date(Date.now() - 6 * 3600_000).toISOString();

  const { data: events, error } = await supabase
    .from("hl_position_events")
    .select("*")
    .eq("trader_id", cfg.traderId)
    .gt("observed_at", since)
    .order("observed_at", { ascending: true })
    .limit(80);
  if (error) throw error;

  let fills = 0;
  for (const ev of events ?? []) {
    const coin = String(ev.coin ?? "").toUpperCase();
    if (coinFilter.length && !coinFilter.includes(coin)) continue;
    const symbol = hlCoinToBinanceSymbol(coin);
    const side = ev.side as PaperSide;
    const type = String(ev.event_type);
    const mark = num(ev.mark_price) || num(ev.entry_price);
    if (!(mark > 0)) continue;

    const rawNotional =
      Math.abs(num(ev.size_after)) * mark ||
      Math.abs(num(ev.size_before) - num(ev.size_after)) * mark;
    const notional = Math.min(maxNotional, rawNotional * scale);

    const { data: opens } = await supabase
      .from("paper_positions")
      .select("*")
      .eq("account_id", strategy.account_id)
      .eq("strategy_id", strategy.id)
      .eq("symbol", symbol)
      .eq("status", "open");
    const open = (opens ?? [])[0] as
      | {
          id: string;
          account_id: string;
          strategy_id: string | null;
          exchange: string;
          symbol: string;
          side: PaperSide;
          qty: number;
          entry_price: number;
        }
      | undefined;

    if (type === "CLOSE" || type === "FLIP") {
      if (open) {
        let px = mark;
        try {
          px = await fetchMarkPrice("binance", symbol);
        } catch {
          /* keep mark */
        }
        await closePosition(
          supabase,
          open,
          px,
          `카피 ${type} ${coin}`
        );
        fills += 1;
      }
      if (type === "CLOSE") continue;
    }

    if (type === "OPEN" || type === "FLIP" || type === "INCREASE") {
      if (open && open.side === side) continue;
      if (open && open.side !== side) {
        let px = mark;
        try {
          px = await fetchMarkPrice("binance", symbol);
        } catch {
          /* */
        }
        await closePosition(supabase, open, px, `카피 반전 ${coin}`);
        fills += 1;
      }
      let px = mark;
      try {
        px = await fetchMarkPrice("binance", symbol);
      } catch {
        /* */
      }
      const opened = await openPosition(supabase, {
        accountId: strategy.account_id,
        strategyId: strategy.id,
        exchange: "binance",
        symbol,
        side,
        price: px,
        notional,
        leverage: 1,
        reason: `카피 ${type} ${coin}`,
        meta: {
          hlEventId: ev.id,
          traderId: cfg.traderId,
          coin,
        },
      });
      if (opened) fills += 1;
    }
  }
  return fills;
}

async function runMoversStrategy(
  supabase: SupabaseClient,
  strategy: {
    id: string;
    account_id: string;
    config: MoversStrategyConfig;
  }
): Promise<number> {
  const cfg = strategy.config;
  const period = cfg.period ?? "4h";
  const topN = Math.max(1, Math.min(10, cfg.topN ?? 5));
  const maxPositions = Math.max(1, Math.min(15, cfg.maxPositions ?? 5));
  const followSurge = cfg.followSurge !== false;
  const followOi = cfg.followOi !== false;
  const tp = cfg.takeProfitPct ?? 4;
  const sl = cfg.stopLossPct ?? 2;
  const riskPct = Math.min(1, Math.max(0.01, cfg.riskPct ?? 0.08));
  const leverage = Math.max(1, cfg.leverage ?? 1);

  const board = await fetchMarketMovers(period);
  const signals: { symbol: string; reason: string; price: number }[] = [];
  if (followSurge) {
    for (const m of board.surges.slice(0, topN)) {
      signals.push({
        symbol: m.symbol,
        reason: `급상승 ${period} ${m.changePct.toFixed(1)}%`,
        price: m.lastPrice,
      });
    }
  }
  if (followOi) {
    for (const m of board.oiRises.slice(0, topN)) {
      if (signals.some((s) => s.symbol === m.symbol)) continue;
      signals.push({
        symbol: m.symbol,
        reason: `OI↑ ${period} ${(m.oiChangePct ?? 0).toFixed(1)}%`,
        price: m.lastPrice,
      });
    }
  }

  const { data: opens } = await supabase
    .from("paper_positions")
    .select("*")
    .eq("account_id", strategy.account_id)
    .eq("strategy_id", strategy.id)
    .eq("status", "open");

  let fills = 0;
  const openList = (opens ?? []) as Array<{
    id: string;
    account_id: string;
    strategy_id: string | null;
    exchange: string;
    symbol: string;
    side: PaperSide;
    qty: number;
    entry_price: number;
  }>;

  // TP / SL
  for (const open of openList) {
    let mark = num(open.entry_price);
    try {
      mark = await fetchMarkPrice("binance", open.symbol);
    } catch {
      const hit = signals.find((s) => s.symbol === open.symbol);
      if (hit) mark = hit.price;
    }
    const entry = num(open.entry_price);
    const ret =
      open.side === "LONG"
        ? ((mark - entry) / entry) * 100
        : ((entry - mark) / entry) * 100;
    if (tp > 0 && ret >= tp) {
      await closePosition(supabase, open, mark, `TP ${tp}%`);
      fills += 1;
      continue;
    }
    if (sl > 0 && ret <= -sl) {
      await closePosition(supabase, open, mark, `SL ${sl}%`);
      fills += 1;
    }
  }

  const { data: opensAfter } = await supabase
    .from("paper_positions")
    .select("symbol")
    .eq("account_id", strategy.account_id)
    .eq("strategy_id", strategy.id)
    .eq("status", "open");
  const held = new Set((opensAfter ?? []).map((p) => String(p.symbol)));
  let slots = Math.max(0, maxPositions - held.size);

  const { data: acc } = await supabase
    .from("paper_accounts")
    .select("cash")
    .eq("id", strategy.account_id)
    .single();

  for (const sig of signals) {
    if (slots <= 0) break;
    if (held.has(sig.symbol)) continue;
    const price =
      sig.price > 0
        ? sig.price
        : await fetchMarkPrice("binance", sig.symbol).catch(() => 0);
    if (!(price > 0)) continue;
    const notional = num(acc?.cash) * riskPct * leverage;
    const opened = await openPosition(supabase, {
      accountId: strategy.account_id,
      strategyId: strategy.id,
      exchange: "binance",
      symbol: sig.symbol,
      side: "LONG",
      price,
      notional,
      leverage,
      reason: sig.reason,
      meta: { source: "coinglass-movers", period },
    });
    if (opened) {
      fills += 1;
      held.add(sig.symbol);
      slots -= 1;
    }
  }

  return fills;
}

export async function runPaperTick(
  supabase: SupabaseClient,
  opts?: { accountId?: string; snapshot?: boolean }
): Promise<PaperTickResult> {
  const errors: { strategyId: string; error: string }[] = [];
  let strategiesRun = 0;
  let fillsCreated = 0;
  const accountsTouched = new Set<string>();

  let aq = supabase
    .from("paper_accounts")
    .select("id, status")
    .eq("status", "active");
  if (opts?.accountId) aq = aq.eq("id", opts.accountId);
  const { data: accounts, error: aErr } = await aq;
  if (aErr) throw aErr;

  if (!accounts?.length) {
    return {
      strategiesRun: 0,
      fillsCreated: 0,
      accountsTouched: [],
      errors: [],
      message: "활성 모의 계좌가 없습니다",
    };
  }

  for (const acc of accounts) {
    const { data: strategies, error: sErr } = await supabase
      .from("paper_strategies")
      .select("*")
      .eq("account_id", acc.id)
      .eq("enabled", true);
    if (sErr) throw sErr;

    for (const st of strategies ?? []) {
      strategiesRun += 1;
      accountsTouched.add(acc.id);
      try {
        let n = 0;
        if (st.mode === "indicator") {
          n = await runIndicatorStrategy(supabase, {
            id: st.id,
            account_id: st.account_id,
            config: (st.config ?? {}) as IndicatorStrategyConfig,
          });
        } else if (st.mode === "copy") {
          n = await runCopyStrategy(supabase, {
            id: st.id,
            account_id: st.account_id,
            config: (st.config ?? {}) as CopyStrategyConfig,
            last_run_at: st.last_run_at,
          });
        } else if (st.mode === "movers") {
          n = await runMoversStrategy(supabase, {
            id: st.id,
            account_id: st.account_id,
            config: (st.config ?? {}) as MoversStrategyConfig,
          });
        }
        fillsCreated += n;
        await supabase
          .from("paper_strategies")
          .update({
            last_run_at: new Date().toISOString(),
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", st.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ strategyId: st.id, error: message });
        await supabase
          .from("paper_strategies")
          .update({
            last_run_at: new Date().toISOString(),
            last_error: message.slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq("id", st.id);
      }
    }

    await refreshAccountEquity(supabase, acc.id, opts?.snapshot !== false);
  }

  return {
    strategiesRun,
    fillsCreated,
    accountsTouched: [...accountsTouched],
    errors,
    message:
      errors.length === 0
        ? `틱 완료 · 전략 ${strategiesRun} · 체결 ${fillsCreated}`
        : `틱 부분 실패 · 오류 ${errors.length}`,
  };
}
