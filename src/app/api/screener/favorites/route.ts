import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/screener/favorites */
export async function GET() {
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("screener_coin_favorites")
      .select("*")
      .order("favorited_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ items: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

/** POST { exchange, symbol, snapshot } — 토글(있으면 삭제) */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      exchange?: string;
      symbol?: string;
      snapshot?: Record<string, unknown>;
      forceAdd?: boolean;
    };
    if (!body.exchange || !body.symbol) {
      return NextResponse.json(
        { error: "exchange, symbol 필요" },
        { status: 400 }
      );
    }
    const exchange = body.exchange;
    const symbol = body.symbol.toUpperCase();
    const supabase = createSupabaseAdmin();

    const { data: existing } = await supabase
      .from("screener_coin_favorites")
      .select("id")
      .eq("exchange", exchange)
      .eq("symbol", symbol)
      .maybeSingle();

    if (existing && !body.forceAdd) {
      const { error } = await supabase
        .from("screener_coin_favorites")
        .delete()
        .eq("id", existing.id);
      if (error) throw error;
      return NextResponse.json({ favorited: false });
    }

    const { data, error } = await supabase
      .from("screener_coin_favorites")
      .upsert(
        {
          exchange,
          symbol,
          snapshot: body.snapshot ?? {},
          favorited_at: new Date().toISOString(),
        },
        { onConflict: "exchange,symbol" }
      )
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ favorited: true, item: data });
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
    let q = supabase.from("screener_coin_favorites").delete();
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
