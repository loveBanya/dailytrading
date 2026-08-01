import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?exchange=&symbol= */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const exchange = sp.get("exchange");
    const symbol = sp.get("symbol");
    const supabase = createSupabaseAdmin();
    let q = supabase
      .from("screener_coin_notes")
      .select("*")
      .order("noted_at", { ascending: false })
      .limit(100);
    if (exchange) q = q.eq("exchange", exchange);
    if (symbol) q = q.eq("symbol", symbol.toUpperCase());
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ items: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

/** POST { exchange, symbol, body, snapshot } */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      exchange?: string;
      symbol?: string;
      body?: string;
      snapshot?: Record<string, unknown>;
    };
    if (!body.exchange || !body.symbol || !body.body?.trim()) {
      return NextResponse.json(
        { error: "exchange, symbol, body 필요" },
        { status: 400 }
      );
    }
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("screener_coin_notes")
      .insert({
        exchange: body.exchange,
        symbol: body.symbol.toUpperCase(),
        body: body.body.trim(),
        snapshot: body.snapshot ?? {},
        noted_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ item: data });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

/** DELETE ?id= */
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id 필요" }, { status: 400 });
    }
    const supabase = createSupabaseAdmin();
    const { error } = await supabase
      .from("screener_coin_notes")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
