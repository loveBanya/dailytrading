import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface TradeComment {
  id: string;
  trade_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

/** GET /api/trades/comments?tradeId= | ?feed=1 | (없음=검색용 인덱스) */
export async function GET(req: NextRequest) {
  try {
    const tradeId = req.nextUrl.searchParams.get("tradeId");
    const feed = req.nextUrl.searchParams.get("feed") === "1";
    const supabase = createSupabaseAdmin();

    if (feed) {
      const limit = Math.min(
        500,
        Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 200) || 200)
      );
      const { data, error } = await supabase
        .from("trade_comments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: 500 }
        );
      }

      return NextResponse.json({
        comments: (data ?? []) as TradeComment[],
      });
    }

    if (!tradeId) {
      const { data, error } = await supabase
        .from("trade_comments")
        .select("trade_id, body")
        .order("created_at", { ascending: false })
        .limit(5000);

      if (error) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: 500 }
        );
      }

      return NextResponse.json({
        comments: (data ?? []) as Pick<TradeComment, "trade_id" | "body">[],
      });
    }

    const { data, error } = await supabase
      .from("trade_comments")
      .select("*")
      .eq("trade_id", tradeId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 }
      );
    }

    return NextResponse.json({ comments: (data ?? []) as TradeComment[] });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/trades/comments — { tradeId, body, parentId? } */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      tradeId?: string;
      body?: string;
      parentId?: string | null;
    };

    if (!body.tradeId || !body.body?.trim()) {
      return NextResponse.json(
        { error: "tradeId, body가 필요합니다" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("trade_comments")
      .insert({
        trade_id: body.tradeId,
        parent_id: body.parentId ?? null,
        body: body.body.trim(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 }
      );
    }

    return NextResponse.json({ comment: data as TradeComment });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PATCH /api/trades/comments — { id, body } */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as { id?: string; body?: string };
    if (!body.id || body.body === undefined) {
      return NextResponse.json({ error: "id, body 필요" }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("trade_comments")
      .update({ body: body.body.trim(), updated_at: new Date().toISOString() })
      .eq("id", body.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 }
      );
    }

    return NextResponse.json({ comment: data as TradeComment });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/trades/comments?id= */
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id 필요" }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();
    const { error } = await supabase
      .from("trade_comments")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
