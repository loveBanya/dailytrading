import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface CashEntry {
  id: string;
  entry_date: string;
  title: string;
  deposit: number;
  withdrawal: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/** GET /api/cash */
export async function GET() {
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("cash_entries")
      .select("*")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    const entries = (data ?? []) as CashEntry[];
    const totalDeposit = entries.reduce((s, e) => s + Number(e.deposit), 0);
    const totalWithdrawal = entries.reduce(
      (s, e) => s + Number(e.withdrawal),
      0
    );

    return NextResponse.json({
      entries,
      totals: {
        deposit: totalDeposit,
        withdrawal: totalWithdrawal,
        net: totalDeposit - totalWithdrawal,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

/** POST /api/cash */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      entry_date: string;
      title: string;
      deposit?: number;
      withdrawal?: number;
      note?: string | null;
    };

    if (!body.entry_date || !body.title?.trim()) {
      return NextResponse.json(
        { error: "날짜와 물건(제목)이 필요합니다." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("cash_entries")
      .insert({
        entry_date: body.entry_date,
        title: body.title.trim(),
        deposit: Number(body.deposit ?? 0),
        withdrawal: Number(body.withdrawal ?? 0),
        note: body.note?.trim() || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ entry: data as CashEntry });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

/** PATCH /api/cash */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id: string;
      entry_date?: string;
      title?: string;
      deposit?: number;
      withdrawal?: number;
      note?: string | null;
    };
    if (!body.id) {
      return NextResponse.json({ error: "id 필요" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (body.entry_date !== undefined) updates.entry_date = body.entry_date;
    if (body.title !== undefined) updates.title = body.title.trim();
    if (body.deposit !== undefined) updates.deposit = Number(body.deposit);
    if (body.withdrawal !== undefined)
      updates.withdrawal = Number(body.withdrawal);
    if (body.note !== undefined) updates.note = body.note?.trim() || null;

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("cash_entries")
      .update(updates)
      .eq("id", body.id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ entry: data as CashEntry });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

/** DELETE /api/cash?id= */
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id 필요" }, { status: 400 });
    }
    const supabase = createSupabaseAdmin();
    const { error } = await supabase.from("cash_entries").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
