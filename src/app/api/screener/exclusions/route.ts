import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/screener/exclusions */
export async function GET() {
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("screener_exclusions")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ items: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

/** POST { exchange, symbol, reason? } */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      exchange?: string;
      symbol?: string;
      reason?: string;
    };
    if (!body.exchange || !body.symbol) {
      return NextResponse.json(
        { error: "exchange, symbol 필요" },
        { status: 400 }
      );
    }
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("screener_exclusions")
      .upsert(
        {
          exchange: body.exchange,
          symbol: body.symbol.toUpperCase(),
          reason: body.reason ?? null,
        },
        { onConflict: "exchange,symbol" }
      )
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ item: data });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

/** DELETE ?exchange=&symbol= or ?id= */
export async function DELETE(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const id = sp.get("id");
    const exchange = sp.get("exchange");
    const symbol = sp.get("symbol");
    const supabase = createSupabaseAdmin();
    let q = supabase.from("screener_exclusions").delete();
    if (id) q = q.eq("id", id);
    else if (exchange && symbol) {
      q = q.eq("exchange", exchange).eq("symbol", symbol.toUpperCase());
    } else {
      return NextResponse.json({ error: "id 또는 exchange+symbol" }, { status: 400 });
    }
    const { error } = await q;
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
