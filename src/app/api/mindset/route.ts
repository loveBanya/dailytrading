import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/mindset */
export async function GET() {
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("mindset_docs")
      .select("*")
      .eq("id", "main")
      .maybeSingle();

    if (error) throw error;
    return NextResponse.json({
      body: data?.body ?? "",
      updated_at: data?.updated_at ?? null,
    });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

/** PUT /api/mindset — { body } */
export async function PUT(req: NextRequest) {
  try {
    const payload = (await req.json()) as { body?: string };
    const body = payload.body ?? "";

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("mindset_docs")
      .upsert({ id: "main", body, updated_at: new Date().toISOString() })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({
      body: data.body as string,
      updated_at: data.updated_at as string,
    });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
