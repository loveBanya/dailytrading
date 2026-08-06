import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?exchange=&symbol=&q=&limit= */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const exchange = sp.get("exchange");
    const symbol = sp.get("symbol");
    const q = sp.get("q")?.trim().toLowerCase() ?? "";
    const limit = Math.min(Number(sp.get("limit") ?? 200) || 200, 500);
    const supabase = createSupabaseAdmin();
    let query = supabase
      .from("screener_coin_notes")
      .select("*")
      .order("noted_at", { ascending: false })
      .limit(limit);
    if (exchange) query = query.eq("exchange", exchange);
    if (symbol) query = query.eq("symbol", symbol.toUpperCase());
    const { data, error } = await query;
    if (error) throw error;

    let items = data ?? [];
    if (q) {
      items = items.filter((n) => {
        const sym = String(n.symbol ?? "").toLowerCase();
        const base = sym.replace(/usdt$/i, "");
        const body = String(n.body ?? "").toLowerCase();
        const ex = String(n.exchange ?? "").toLowerCase();
        return (
          sym.includes(q) ||
          base.includes(q) ||
          body.includes(q) ||
          ex.includes(q)
        );
      });
    }

    return NextResponse.json({ items });
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
