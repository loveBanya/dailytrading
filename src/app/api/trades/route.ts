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

    const review = searchParams.get("review");
    const sort = searchParams.get("sort") ?? "newest";

    const supabase = createSupabaseAdmin();
    let query = supabase.from("trades").select("*").limit(Math.min(limit, 200));

    if (symbol) query = query.eq("symbol", symbol);
    if (exchange) query = query.eq("exchange", exchange);
    if (review === "1" || review === "true") query = query.eq("is_review", true);

    switch (sort) {
      case "oldest":
        query = query.order("exit_time", { ascending: true });
        break;
      case "pnl_desc":
        query = query.order("pnl", { ascending: false });
        break;
      case "pnl_asc":
        query = query.order("pnl", { ascending: true });
        break;
      case "newest":
      default:
        query = query.order("exit_time", { ascending: false });
        break;
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: 500 }
      );
    }

    const trades = (data ?? []) as Array<{ id: string } & Record<string, unknown>>;
    const ids = trades.map((t) => t.id).filter(Boolean);

    let counts = new Map<string, number>();
    if (ids.length > 0) {
      const { data: commentRows, error: countError } = await supabase
        .from("trade_comments")
        .select("trade_id")
        .in("trade_id", ids);

      if (!countError && commentRows) {
        counts = commentRows.reduce((map, row) => {
          const tid = row.trade_id as string;
          map.set(tid, (map.get(tid) ?? 0) + 1);
          return map;
        }, new Map<string, number>());
      }
      // 테이블 없으면 comment_count 0으로 무시
    }

    return NextResponse.json({
      trades: trades.map((t) => ({
        ...t,
        comment_count: counts.get(t.id) ?? 0,
      })),
      sort,
      sortLabel:
        sort === "oldest"
          ? "오래된순"
          : sort === "pnl_desc"
            ? "수익 높은순"
            : sort === "pnl_asc"
              ? "수익 낮은순"
              : "최신순",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PATCH /api/trades — notes / status / screenshot / 오답노트 수동 수정 */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id: string;
      notes?: string;
      status?: string;
      screenshot_url?: string;
      tags?: string[];
      is_review?: boolean;
      trade_style?: "원칙" | "뇌동" | null;
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
    if (body.is_review !== undefined) updates.is_review = body.is_review;
    if (body.trade_style !== undefined) updates.trade_style = body.trade_style;

    const supabase = createSupabaseAdmin();
    let { data, error } = await supabase
      .from("trades")
      .update(updates)
      .eq("id", body.id)
      .select()
      .single();

    // is_review / trade_style 컬럼이 아직 없으면 tags로 폴백
    if (
      error &&
      (body.is_review !== undefined || body.trade_style !== undefined) &&
      (error.message.includes("is_review") ||
        error.message.includes("trade_style") ||
        error.message.includes("schema cache"))
    ) {
      const tagRes = await supabase
        .from("trades")
        .select("tags")
        .eq("id", body.id)
        .single();
      const tags = new Set<string>(
        ((tagRes.data?.tags as string[] | null) ?? []).filter(Boolean)
      );
      if (body.is_review !== undefined) {
        if (body.is_review) tags.add("오답노트");
        else tags.delete("오답노트");
      }
      if (body.trade_style !== undefined) {
        tags.delete("원칙");
        tags.delete("뇌동");
        if (body.trade_style) tags.add(body.trade_style);
      }

      const cleanUpdates = { ...updates };
      delete cleanUpdates.is_review;
      delete cleanUpdates.trade_style;
      cleanUpdates.tags = [...tags];

      const retry = await supabase
        .from("trades")
        .update(cleanUpdates)
        .eq("id", body.id)
        .select()
        .single();

      if (retry.error) throw retry.error;
      data = {
        ...retry.data,
        is_review:
          body.is_review !== undefined
            ? body.is_review
            : (retry.data as TradeLike)?.is_review,
        trade_style:
          body.trade_style !== undefined
            ? body.trade_style
            : (retry.data as TradeLike)?.trade_style,
      } as typeof data;
      error = null;
    }

    if (error) throw error;
    return NextResponse.json({ trade: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type TradeLike = { is_review?: boolean; trade_style?: string | null };
