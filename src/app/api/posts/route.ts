import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface JournalPost {
  id: string;
  title: string;
  body: string;
  images: string[];
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  comment_count?: number;
}

/** GET /api/posts?favorites=1 */
export async function GET(req: NextRequest) {
  try {
    const favorites = req.nextUrl.searchParams.get("favorites");
    const supabase = createSupabaseAdmin();
    let query = supabase
      .from("journal_posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (favorites === "1" || favorites === "true") {
      query = query.eq("is_favorite", true);
    }

    const { data, error } = await query;
    if (error) throw error;

    const posts = (data ?? []) as JournalPost[];
    const ids = posts.map((p) => p.id);
    let counts = new Map<string, number>();
    if (ids.length > 0) {
      const { data: comments } = await supabase
        .from("journal_post_comments")
        .select("post_id")
        .in("post_id", ids);
      counts = (comments ?? []).reduce((map, row) => {
        const id = row.post_id as string;
        map.set(id, (map.get(id) ?? 0) + 1);
        return map;
      }, new Map<string, number>());
    }

    return NextResponse.json({
      posts: posts.map((p) => ({
        ...p,
        comment_count: counts.get(p.id) ?? 0,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

/** POST /api/posts */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      title: string;
      body?: string;
      images?: string[];
    };
    if (!body.title?.trim()) {
      return NextResponse.json({ error: "제목이 필요합니다." }, { status: 400 });
    }

    const images = (body.images ?? []).slice(0, 6);
    // 이미지당 대략 1.5MB data URL 제한 (개인용)
    for (const img of images) {
      if (img.length > 1_800_000) {
        return NextResponse.json(
          { error: "이미지가 너무 큽니다. 더 작은 사진을 올려주세요." },
          { status: 400 }
        );
      }
    }

    // 본문 인라인 data URL 총량 대략 제한 (약 8MB)
    const postBody = String(body.body ?? "");
    if (postBody.length > 8_000_000) {
      return NextResponse.json(
        { error: "본문(이미지 포함)이 너무 큽니다." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("journal_posts")
      .insert({
        title: body.title.trim(),
        body: postBody,
        images,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ post: data as JournalPost });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

/** PATCH /api/posts */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id: string;
      title?: string;
      body?: string;
      images?: string[];
      is_favorite?: boolean;
    };
    if (!body.id) {
      return NextResponse.json({ error: "id 필요" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title.trim();
    if (body.body !== undefined) updates.body = body.body;
    if (body.images !== undefined) updates.images = body.images.slice(0, 6);
    if (body.is_favorite !== undefined) updates.is_favorite = body.is_favorite;

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("journal_posts")
      .update(updates)
      .eq("id", body.id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ post: data as JournalPost });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

/** DELETE /api/posts?id= */
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id 필요" }, { status: 400 });
    }
    const supabase = createSupabaseAdmin();
    const { error } = await supabase.from("journal_posts").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
