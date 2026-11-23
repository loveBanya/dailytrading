import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { normalizeHlAddress } from "@/lib/hyperliquid/client";
import { syncTraderPositions } from "@/lib/hyperliquid/sync";
import { errorMessage } from "@/lib/utils/labels";
import type { HlOpenPosition, HlTrader } from "@/lib/hyperliquid/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function missingTable(msg: string): boolean {
  return (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("Could not find the table")
  );
}

/** GET /api/hl-traders — 관심 트레이더 + 현재 포지션 */
export async function GET() {
  try {
    const supabase = createSupabaseAdmin();
    const { data: traders, error } = await supabase
      .from("hl_traders")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      if (missingTable(error.message)) {
        return NextResponse.json({
          traders: [],
          positions: [],
          needsMigration: true,
          migrationHint:
            "supabase/migrations/012_hl_traders.sql 을 Supabase에서 실행하세요.",
        });
      }
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 }
      );
    }

    let list = (traders ?? []) as HlTrader[];
    const ids = list.map((t) => t.id);
    let positions: HlOpenPosition[] = [];
    if (ids.length > 0) {
      const { data: pos, error: posErr } = await supabase
        .from("hl_open_positions")
        .select("*")
        .in("trader_id", ids)
        .order("position_value", { ascending: false });
      if (posErr) throw posErr;
      positions = (pos ?? []) as HlOpenPosition[];
    }

    // 과거 성과 보강 (리더보드/포트폴리오) — DB 컬럼 없어도 응답에 포함
    try {
      const { fetchPerfForAddresses, traderPerfPatch } = await import(
        "@/lib/hyperliquid/perf"
      );
      const perfMap = await fetchPerfForAddresses(list.map((t) => t.address));
      list = list.map((t) => {
        const perf = perfMap.get(t.address.toLowerCase());
        if (!perf) return t;
        return {
          ...t,
          pnl_day: t.pnl_day ?? perf.pnlDay,
          roi_day: t.roi_day ?? perf.roiDay,
          pnl_week: t.pnl_week ?? perf.pnlWeek,
          roi_week: t.roi_week ?? perf.roiWeek,
          pnl_month: t.pnl_month ?? perf.pnlMonth,
          roi_month: t.roi_month ?? perf.roiMonth,
          pnl_all_time: t.pnl_all_time ?? perf.pnlAllTime,
          roi_all_time: t.roi_all_time ?? perf.roiAllTime,
          volume_month: t.volume_month ?? perf.volumeMonth,
        };
      });
      // 컬럼 있으면 저장 (없으면 무시)
      void Promise.all(
        list.map(async (t) => {
          const perf = perfMap.get(t.address.toLowerCase());
          if (!perf) return;
          await supabase.from("hl_traders").update(traderPerfPatch(perf)).eq("id", t.id);
        })
      ).catch(() => {});
    } catch {
      /* perf enrichment optional */
    }

    return NextResponse.json({ traders: list, positions });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err) },
      { status: 500 }
    );
  }
}

/** POST /api/hl-traders — { address, label?, note?, sync? } */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      address?: string;
      label?: string;
      note?: string;
      sync?: boolean;
    };

    const address = normalizeHlAddress(body.address ?? "");
    if (!address) {
      return NextResponse.json(
        { error: "유효한 Hyperliquid 지갑 주소(0x…)가 필요합니다" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdmin();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("hl_traders")
      .upsert(
        {
          address,
          label: body.label?.trim() || null,
          note: body.note?.trim() || null,
          is_active: true,
          updated_at: now,
        },
        { onConflict: "address" }
      )
      .select()
      .single();

    if (error) {
      if (missingTable(error.message)) {
        return NextResponse.json(
          {
            error: error.message,
            needsMigration: true,
            migrationHint:
              "supabase/migrations/012_hl_traders.sql 을 Supabase에서 실행하세요.",
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 }
      );
    }

    const trader = data as HlTrader;
    let sync = null;
    if (body.sync !== false) {
      sync = await syncTraderPositions(supabase, {
        id: trader.id,
        address: trader.address,
      });
    }

    return NextResponse.json({ trader, sync });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err) },
      { status: 500 }
    );
  }
}

/** PATCH /api/hl-traders — { id, label?, note?, is_active? } */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id?: string;
      label?: string | null;
      note?: string | null;
      is_active?: boolean;
    };
    if (!body.id) {
      return NextResponse.json({ error: "id 필요" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.label !== undefined) {
      patch.label =
        body.label == null || body.label.trim() === ""
          ? null
          : body.label.trim();
    }
    if (body.note !== undefined) {
      patch.note =
        body.note == null || body.note.trim() === ""
          ? null
          : body.note.trim();
    }
    if (typeof body.is_active === "boolean") {
      patch.is_active = body.is_active;
    }

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("hl_traders")
      .update(patch)
      .eq("id", body.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 }
      );
    }

    return NextResponse.json({ trader: data as HlTrader });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err) },
      { status: 500 }
    );
  }
}

/** DELETE /api/hl-traders?id= */
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id 필요" }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();
    const { error } = await supabase.from("hl_traders").delete().eq("id", id);
    if (error) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err) },
      { status: 500 }
    );
  }
}
