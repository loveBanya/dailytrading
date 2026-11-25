import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { runPaperTick } from "@/lib/paper/engine";
import { errorMessage } from "@/lib/utils/labels";
import type {
  CopyStrategyConfig,
  IndicatorStrategyConfig,
  PaperStrategyMode,
} from "@/lib/paper/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["sin1", "hnd1", "icn1"];

function migrationPayload(message: string) {
  const needsMigration =
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("Could not find the table");
  return {
    error: message,
    needsMigration: needsMigration || undefined,
    migrationHint: needsMigration
      ? "supabase/migrations/015_paper_trading.sql 을 Supabase SQL Editor에서 실행하세요."
      : undefined,
    status: needsMigration ? 503 : 500,
  };
}

/** GET — 계좌·전략·오픈포지션·최근체결·에쿼티 */
export async function GET() {
  try {
    const supabase = createSupabaseAdmin();
    const { data: accounts, error: aErr } = await supabase
      .from("paper_accounts")
      .select("*")
      .order("created_at", { ascending: true });
    if (aErr) throw aErr;

    const accountIds = (accounts ?? []).map((a) => a.id);
    if (accountIds.length === 0) {
      return NextResponse.json({
        accounts: [],
        strategies: [],
        positions: [],
        fills: [],
        equity: [],
        ticks: [],
      });
    }

    const [
      { data: strategies, error: sErr },
      { data: positions, error: pErr },
      { data: fills, error: fErr },
      { data: equity, error: eErr },
      { data: ticks, error: tErr },
    ] = await Promise.all([
      supabase
        .from("paper_strategies")
        .select("*")
        .in("account_id", accountIds)
        .order("created_at", { ascending: true }),
      supabase
        .from("paper_positions")
        .select("*")
        .in("account_id", accountIds)
        .eq("status", "open")
        .order("opened_at", { ascending: false }),
      supabase
        .from("paper_fills")
        .select("*")
        .in("account_id", accountIds)
        .order("observed_at", { ascending: false })
        .limit(80),
      supabase
        .from("paper_equity_snapshots")
        .select("*")
        .in("account_id", accountIds)
        .order("taken_at", { ascending: false })
        .limit(120),
      supabase
        .from("paper_tick_logs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(20),
    ]);
    if (sErr) throw sErr;
    if (pErr) throw pErr;
    if (fErr) throw fErr;
    if (eErr) throw eErr;
    if (tErr) throw tErr;

    return NextResponse.json({
      accounts: accounts ?? [],
      strategies: strategies ?? [],
      positions: positions ?? [],
      fills: fills ?? [],
      equity: equity ?? [],
      ticks: ticks ?? [],
    });
  } catch (err) {
    const m = migrationPayload(errorMessage(err));
    return NextResponse.json(
      {
        error: m.error,
        needsMigration: m.needsMigration,
        migrationHint: m.migrationHint,
      },
      { status: m.status }
    );
  }
}

type Body =
  | {
      action: "create_account";
      name?: string;
      startingEquity?: number;
    }
  | {
      action: "set_account_status";
      accountId: string;
      status: "active" | "paused" | "archived";
    }
  | {
      action: "create_strategy";
      accountId: string;
      name: string;
      mode: PaperStrategyMode;
      config: IndicatorStrategyConfig | CopyStrategyConfig;
      note?: string;
      enabled?: boolean;
    }
  | {
      action: "update_strategy";
      strategyId: string;
      name?: string;
      enabled?: boolean;
      config?: IndicatorStrategyConfig | CopyStrategyConfig;
      note?: string | null;
    }
  | {
      action: "delete_strategy";
      strategyId: string;
    }
  | {
      action: "reset_account";
      accountId: string;
      startingEquity?: number;
    }
  | {
      action: "tick";
      accountId?: string;
      snapshot?: boolean;
    };

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const supabase = createSupabaseAdmin();
    const now = new Date().toISOString();

    if (body.action === "create_account") {
      const start = Math.max(100, Number(body.startingEquity ?? 10_000));
      const { data, error } = await supabase
        .from("paper_accounts")
        .insert({
          name: body.name?.trim() || "기본 계좌",
          starting_equity: start,
          cash: start,
          equity: start,
          status: "active",
        })
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ account: data });
    }

    if (body.action === "set_account_status") {
      const { error } = await supabase
        .from("paper_accounts")
        .update({ status: body.status, updated_at: now })
        .eq("id", body.accountId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.action === "create_strategy") {
      const { data, error } = await supabase
        .from("paper_strategies")
        .insert({
          account_id: body.accountId,
          name: body.name.trim(),
          mode: body.mode,
          enabled: body.enabled !== false,
          config: body.config ?? {},
          note: body.note ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ strategy: data });
    }

    if (body.action === "update_strategy") {
      const patch: Record<string, unknown> = { updated_at: now };
      if (body.name != null) patch.name = body.name.trim();
      if (body.enabled != null) patch.enabled = body.enabled;
      if (body.config != null) patch.config = body.config;
      if (body.note !== undefined) patch.note = body.note;
      const { data, error } = await supabase
        .from("paper_strategies")
        .update(patch)
        .eq("id", body.strategyId)
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ strategy: data });
    }

    if (body.action === "delete_strategy") {
      const { error } = await supabase
        .from("paper_strategies")
        .delete()
        .eq("id", body.strategyId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.action === "reset_account") {
      const start = Math.max(
        100,
        Number(body.startingEquity ?? 10_000)
      );
      // 오픈 포지션 강제 종료 표시만 (PnL 정산 없이 리셋)
      await supabase
        .from("paper_positions")
        .update({
          status: "closed",
          closed_at: now,
          realised_pnl: 0,
          updated_at: now,
        })
        .eq("account_id", body.accountId)
        .eq("status", "open");

      const { data, error } = await supabase
        .from("paper_accounts")
        .update({
          starting_equity: start,
          cash: start,
          equity: start,
          updated_at: now,
        })
        .eq("id", body.accountId)
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ account: data });
    }

    if (body.action === "tick") {
      const started = new Date().toISOString();
      const result = await runPaperTick(supabase, {
        accountId: body.accountId,
        snapshot: body.snapshot !== false,
      });
      await supabase.from("paper_tick_logs").insert({
        started_at: started,
        finished_at: new Date().toISOString(),
        ok: result.errors.length === 0,
        strategies_run: result.strategiesRun,
        fills_created: result.fillsCreated,
        message: result.message,
        detail: { errors: result.errors, accounts: result.accountsTouched },
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    const m = migrationPayload(errorMessage(err));
    return NextResponse.json(
      {
        error: m.error,
        needsMigration: m.needsMigration,
        migrationHint: m.migrationHint,
      },
      { status: m.status }
    );
  }
}
