import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/trades?limit=50&symbol=ICPUSDT */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const limit = Number(searchParams.get("limit") ?? "50");
    const symbol = searchParams.get("symbol");
    const exchange = searchParams.get("exchange");

    const supabase = createSupabaseAdmin();
    let query = supabase
      .from("trades")
      .select("*")
      .order("exit_time", { ascending: false })
      .limit(Math.min(limit, 200));

    if (symbol) query = query.eq("symbol", symbol);
    if (exchange) query = query.eq("exchange", exchange);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ trades: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PATCH /api/trades — notes / status / screenshot 수동 수정 */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id: string;
      notes?: string;
      status?: string;
      screenshot_url?: string;
      tags?: string[];
    };

    if (!body.id) {
      return NextResponse.json({ error: "id 필요" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.status !== undefined) updates.status = body.status;
    if (body.screenshot_url !== undefined)
      updates.screenshot_url = body.screenshot_url;
    if (body.tags !== undefined) updates.tags = body.tags;

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("trades")
      .update(updates)
      .eq("id", body.id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ trade: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
