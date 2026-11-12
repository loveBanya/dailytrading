import { NextRequest, NextResponse } from "next/server";
import type { CashEntry } from "@/app/api/cash/route";
import {
  fetchUsdtKrw,
  fetchUsdtKrwDaily,
  rateOnDay,
} from "@/lib/fx/usdt-krw";
import { withCache } from "@/lib/screener/cache";
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
  /** 현금 입출금(원화)에서 온 줄이면 원래 원화 금액 */
  amount_krw?: number;
  /** 원화를 USDT로 바꿀 때 쓴 그날 시세 */
  fx_rate?: number;
}

const FALLBACK_FX = 1350;

async function loadCashEntries(
  supabase: ReturnType<typeof createSupabaseAdmin>
): Promise<CashEntry[]> {
  const { data, error } = await supabase.from("cash_entries").select("*");
  if (error) return [];
  return (data ?? []) as CashEntry[];
}

async function loadDailyFx(since: string): Promise<{
  daily: Record<string, number>;
  current: number;
}> {
  let current = FALLBACK_FX;
  try {
    const quote = await withCache("fx:usdt-krw", 10 * 60 * 1000, fetchUsdtKrw);
    current = quote.rate;
  } catch {
    /* 현재 시세가 막히면 기본값 */
  }
  try {
    const daily = await withCache(
      `fx:usdt-krw:daily:v2:${since}`,
      6 * 60 * 60 * 1000,
      () => fetchUsdtKrwDaily(since)
    );
    return { daily, current };
  } catch {
    return { daily: {}, current };
  }
}

function cashToFlows(
  entries: CashEntry[],
  daily: Record<string, number>,
  current: number
): AssetFlow[] {
  const out: AssetFlow[] = [];
  for (const entry of entries) {
    const day = entry.entry_date.slice(0, 10);
    const rate = rateOnDay(daily, day, current);
    const deposit = Number(entry.deposit) || 0;
    const withdrawal = Number(entry.withdrawal) || 0;
    const base = {
      entry_date: entry.entry_date,
      source: "cash",
      note: entry.title || entry.note || null,
      created_at: entry.created_at,
      updated_at: entry.updated_at,
      fx_rate: rate,
    };
    if (deposit > 0) {
      out.push({
        ...base,
        id: `cash:${entry.id}:in`,
        direction: "in",
        amount_usdt: deposit / rate,
        amount_krw: deposit,
      });
    }
    if (withdrawal > 0) {
      out.push({
        ...base,
        id: `cash:${entry.id}:out`,
        direction: "out",
        amount_usdt: withdrawal / rate,
        amount_krw: withdrawal,
      });
    }
  }
  return out;
}

function signedNet(e: { direction: string; amount_usdt: number }): number {
  const amt = Number(e.amount_usdt) || 0;
  return e.direction === "out" ? -amt : amt;
}

/** GET /api/asset-flows — USDT 입출금에 현금 입출금(원화)을 그날 시세로 바꿔 합친다 */
export async function GET() {
  try {
    const supabase = createSupabaseAdmin();
    const [{ data, error }, cash] = await Promise.all([
      supabase
        .from("asset_flows")
        .select("*")
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false }),
      loadCashEntries(supabase),
    ]);

    if (error) throw error;

    const usdtFlows = (data ?? []) as AssetFlow[];
    const days = [
      ...usdtFlows.map((f) => f.entry_date.slice(0, 10)),
      ...cash.map((e) => e.entry_date.slice(0, 10)),
    ].sort();
    const { daily, current } =
      days.length > 0
        ? await loadDailyFx(days[0]!)
        : { daily: {}, current: FALLBACK_FX };

    const flows = [...usdtFlows, ...cashToFlows(cash, daily, current)].sort(
      (a, b) =>
        b.entry_date.localeCompare(a.entry_date) ||
        b.created_at.localeCompare(a.created_at)
    );

    let totalIn = 0;
    let totalOut = 0;
    let krwIn = 0;
    let krwOut = 0;
    for (const f of flows) {
      const amt = Number(f.amount_usdt) || 0;
      const krw =
        f.amount_krw ??
        amt * rateOnDay(daily, f.entry_date.slice(0, 10), current);
      if (f.direction === "out") {
        totalOut += amt;
        krwOut += krw;
      } else {
        totalIn += amt;
        krwIn += krw;
      }
    }

    return NextResponse.json({
      flows,
      totals: {
        in: totalIn,
        out: totalOut,
        net: totalIn - totalOut,
      },
      totalsKrw: {
        in: krwIn,
        out: krwOut,
        net: krwIn - krwOut,
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
    if (body.id.startsWith("cash:")) {
      return NextResponse.json(
        { error: "현금 입출금 기록은 실시간·입출금 탭에서 고칩니다." },
        { status: 400 }
      );
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
    if (id.startsWith("cash:")) {
      return NextResponse.json(
        { error: "현금 입출금 기록은 실시간·입출금 탭에서 지웁니다." },
        { status: 400 }
      );
    }
    const supabase = createSupabaseAdmin();
    const { error } = await supabase.from("asset_flows").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
