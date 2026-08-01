import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  category: string;
  sort_order: number;
  created_at: string;
}

/** GET /api/bookmarks */
export async function GET() {
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("bookmarks")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 }
      );
    }

    return NextResponse.json({ bookmarks: (data ?? []) as Bookmark[] });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/bookmarks — { title, url, category? } */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      title?: string;
      url?: string;
      category?: string;
    };

    if (!body.title?.trim() || !body.url?.trim()) {
      return NextResponse.json(
        { error: "title, url이 필요합니다" },
        { status: 400 }
      );
    }

    let url = body.url.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("bookmarks")
      .insert({
        title: body.title.trim(),
        url,
        category: body.category?.trim() || "일반",
        sort_order: 100,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 }
      );
    }

    return NextResponse.json({ bookmark: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/bookmarks?id= */
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id 필요" }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();
    const { error } = await supabase.from("bookmarks").delete().eq("id", id);
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
