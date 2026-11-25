import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { assertPaperCronAuth, PaperAuthError } from "@/lib/paper/auth";
import { runPaperTick } from "@/lib/paper/engine";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const preferredRegion = ["sin1", "hnd1", "icn1"];

/**
 * POST /api/paper/tick
 * Header: x-cron-secret: PAPER_CRON_SECRET  또는 Authorization: Bearer …
 * Body(optional): { accountId?, snapshot? }
 */
export async function POST(req: NextRequest) {
  const started = new Date().toISOString();
  try {
    assertPaperCronAuth(req);
    let accountId: string | undefined;
    let snapshot = true;
    try {
      const body = (await req.json()) as {
        accountId?: string;
        snapshot?: boolean;
      };
      accountId = body.accountId;
      if (body.snapshot === false) snapshot = false;
    } catch {
      /* empty body ok */
    }

    const supabase = createSupabaseAdmin();
    const result = await runPaperTick(supabase, { accountId, snapshot });
    const finished = new Date().toISOString();

    await supabase.from("paper_tick_logs").insert({
      started_at: started,
      finished_at: finished,
      ok: result.errors.length === 0,
      strategies_run: result.strategiesRun,
      fills_created: result.fillsCreated,
      message: result.message,
      detail: { errors: result.errors, accounts: result.accountsTouched },
    });

    return NextResponse.json({ ...result, started, finished });
  } catch (err) {
    if (err instanceof PaperAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = errorMessage(err);
    const needsMigration =
      message.includes("does not exist") ||
      message.includes("schema cache") ||
      message.includes("Could not find the table");
    try {
      const supabase = createSupabaseAdmin();
      await supabase.from("paper_tick_logs").insert({
        started_at: started,
        finished_at: new Date().toISOString(),
        ok: false,
        message,
      });
    } catch {
      /* ignore log failure */
    }
    return NextResponse.json(
      {
        error: message,
        needsMigration: needsMigration || undefined,
        migrationHint: needsMigration
          ? "supabase/migrations/015_paper_trading.sql 을 Supabase SQL Editor에서 실행하세요."
          : undefined,
      },
      { status: needsMigration ? 503 : 500 }
    );
  }
}
