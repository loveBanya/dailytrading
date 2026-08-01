import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface JournalPostComment {
  id: string;
  post_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

/** GET /api/posts/comments?postId= */
export async function GET(req: NextRequest) {
  try {
    const postId = req.nextUrl.searchParams.get("postId");
    if (!postId) {
      return NextResponse.json({ error: "postId 필요" }, { status: 400 });
    }
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("journal_post_comments")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return NextResponse.json({
      comments: (data ?? []) as JournalPostComment[],
    });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

/** POST /api/posts/comments */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      postId: string;
      body: string;
      parentId?: string | null;
    };
    if (!body.postId || !body.body?.trim()) {
      return NextResponse.json(
        { error: "postId와 내용이 필요합니다." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("journal_post_comments")
      .insert({
        post_id: body.postId,
        body: body.body.trim(),
        parent_id: body.parentId ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ comment: data as JournalPostComment });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

/** DELETE /api/posts/comments?id= */
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id 필요" }, { status: 400 });
    }
    const supabase = createSupabaseAdmin();
    const { error } = await supabase
      .from("journal_post_comments")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
