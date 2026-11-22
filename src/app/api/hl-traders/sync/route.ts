import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { syncActiveTraders } from "@/lib/hyperliquid/sync";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/hl-traders/sync — { traderId? } 관심 트레이더 포지션 스냅샷 */
export async function POST(req: NextRequest) {
  try {
    let traderId: string | undefined;
    try {
      const body = (await req.json()) as { traderId?: string };
      traderId = body.traderId || undefined;
    } catch {
      traderId = undefined;
    }

    const supabase = createSupabaseAdmin();
    const results = await syncActiveTraders(supabase, traderId);
    const eventsCreated = results.reduce((s, r) => s + r.eventsCreated, 0);
    const errors = results.filter((r) => r.error);

    return NextResponse.json({
      results,
      synced: results.length,
      eventsCreated,
      errors: errors.map((e) => ({
        traderId: e.traderId,
        address: e.address,
        error: e.error,
      })),
    });
  } catch (err) {
    const message = errorMessage(err);
    const needsMigration =
      message.includes("does not exist") ||
      message.includes("schema cache") ||
      message.includes("Could not find the table");
    return NextResponse.json(
      {
        error: message,
        needsMigration: needsMigration || undefined,
        migrationHint: needsMigration
          ? "supabase/migrations/012_hl_traders.sql 을 Supabase에서 실행하세요."
          : undefined,
      },
      { status: needsMigration ? 503 : 500 }
    );
  }
}
