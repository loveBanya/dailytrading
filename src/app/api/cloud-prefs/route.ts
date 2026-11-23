import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { CLOUD_PREF_KEYS } from "@/lib/cloud/prefsSync";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function missingTable(msg: string): boolean {
  return (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("Could not find the table")
  );
}

const HINT =
  "supabase/migrations/014_cloud_prefs.sql 을 Supabase SQL 에디터에서 실행하세요.";

/** GET /api/cloud-prefs — 클라우드에 저장된 설정 전부 */
export async function GET() {
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("app_cloud_prefs")
      .select("key, value, updated_at")
      .in("key", [...CLOUD_PREF_KEYS]);

    if (error) {
      if (missingTable(error.message)) {
        return NextResponse.json({
          prefs: {},
          needsMigration: true,
          migrationHint: HINT,
        });
      }
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 }
      );
    }

    const prefs: Record<string, { value: string; updated_at: string }> = {};
    for (const row of data ?? []) {
      prefs[row.key as string] = {
        value: String(row.value),
        updated_at: String(row.updated_at),
      };
    }
    return NextResponse.json({ prefs });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err) },
      { status: 500 }
    );
  }
}

/** PUT /api/cloud-prefs — { prefs: { key: stringValue } } */
export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as { prefs?: Record<string, string> };
    const incoming = body.prefs ?? {};
    const allowed = new Set<string>(CLOUD_PREF_KEYS);
    const now = new Date().toISOString();
    const rows = Object.entries(incoming)
      .filter(([k, v]) => allowed.has(k) && typeof v === "string")
      .map(([key, value]) => ({
        key,
        value,
        updated_at: now,
      }));

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, saved: 0 });
    }

    const supabase = createSupabaseAdmin();
    const { error } = await supabase.from("app_cloud_prefs").upsert(rows, {
      onConflict: "key",
    });

    if (error) {
      if (missingTable(error.message)) {
        return NextResponse.json(
          {
            error: error.message,
            needsMigration: true,
            migrationHint: HINT,
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, saved: rows.length });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err) },
      { status: 500 }
    );
  }
}
