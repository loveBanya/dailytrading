import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type AssetFlowDirection = "in" | "out";

export interface AssetFlow {
  id: string;
  entry_date: string;
  direction: AssetFlowDirection;
  amount_usdt: number;
  source: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

function signedNet(e: { direction: string; amount_usdt: number }): number {
  const amt = Number(e.amount_usdt) || 0;
  return e.direction === "out" ? -amt : amt;
}

/** GET /api/asset-flows */
export async function GET() {
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("asset_flows")
      .select("*")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    const flows = (data ?? []) as AssetFlow[];
    let totalIn = 0;
    let totalOut = 0;
    for (const f of flows) {
      const amt = Number(f.amount_usdt) || 0;
      if (f.direction === "out") totalOut += amt;
      else totalIn += amt;
    }

    return NextResponse.json({
      flows,
      totals: {
        in: totalIn,
        out: totalOut,
        net: totalIn - totalOut,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

/** POST /api/asset-flows */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      entry_date?: string;
      direction?: AssetFlowDirection;
      amount_usdt?: number;
      source?: string;
      note?: string | null;
    };

    if (!body.entry_date) {
      return NextResponse.json({ error: "날짜가 필요합니다." }, { status: 400 });
    }
    if (body.direction !== "in" && body.direction !== "out") {
      return NextResponse.json(
        { error: "direction은 in 또는 out 이어야 합니다." },
        { status: 400 }
      );
    }
    const amount = Number(body.amount_usdt);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "amount_usdt는 0보다 커야 합니다." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("asset_flows")
      .insert({
        entry_date: body.entry_date,
        direction: body.direction,
        amount_usdt: amount,
        source: (body.source ?? "upbit").trim() || "upbit",
        note: body.note?.trim() || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ flow: data as AssetFlow });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

/** PATCH /api/asset-flows */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id?: string;
      entry_date?: string;
      direction?: AssetFlowDirection;
      amount_usdt?: number;
      source?: string;
      note?: string | null;
    };
    if (!body.id) {
      return NextResponse.json({ error: "id 필요" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (body.entry_date !== undefined) updates.entry_date = body.entry_date;
    if (body.direction !== undefined) {
      if (body.direction !== "in" && body.direction !== "out") {
        return NextResponse.json({ error: "direction 잘못됨" }, { status: 400 });
      }
      updates.direction = body.direction;
    }
    if (body.amount_usdt !== undefined) {
      const amount = Number(body.amount_usdt);
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json(
          { error: "amount_usdt는 0보다 커야 합니다." },
          { status: 400 }
        );
      }
      updates.amount_usdt = amount;
    }
    if (body.source !== undefined)
      updates.source = body.source.trim() || "upbit";
    if (body.note !== undefined) updates.note = body.note?.trim() || null;

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("asset_flows")
      .update(updates)
      .eq("id", body.id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ flow: data as AssetFlow, signed: signedNet(data) });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

/** DELETE /api/asset-flows?id= */
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id 필요" }, { status: 400 });
    }
    const supabase = createSupabaseAdmin();
    const { error } = await supabase.from("asset_flows").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
