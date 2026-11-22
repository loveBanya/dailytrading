import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { fetchUserFills } from "@/lib/hyperliquid/client";
import { groupEntryFills } from "@/lib/hyperliquid/entries";
import { errorMessage } from "@/lib/utils/labels";
import type { HlRecentEntry } from "@/lib/hyperliquid/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_MS = 60_000;
let cache: { key: string; at: number; entries: HlRecentEntry[] } | null = null;

/** GET /api/hl-traders/recent?hours=24&minNotional=10000 — 관심 트레이더 전체 최근 진입 */
export async function GET(req: NextRequest) {
  try {
    const hours = Math.min(
      168,
      Math.max(1, Number(req.nextUrl.searchParams.get("hours") ?? 24) || 24)
    );
    const minNotional = Math.max(
      0,
      Number(req.nextUrl.searchParams.get("minNotional") ?? 0) || 0
    );
    const fresh = req.nextUrl.searchParams.get("fresh") === "1";

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("hl_traders")
      .select("id, address, label")
      .eq("is_active", true);
    if (error) throw error;

    const traders = (data ?? []) as Array<{
      id: string;
      address: string;
      label: string | null;
    }>;
    const key = `${hours}:${traders.map((t) => t.id).sort().join(",")}`;

    let entries: HlRecentEntry[];
    if (!fresh && cache && cache.key === key && Date.now() - cache.at < CACHE_MS) {
      entries = cache.entries;
    } else {
      const sinceMs = Date.now() - hours * 3600_000;
      const settled = await Promise.allSettled(
        traders.map(async (t) =>
          groupEntryFills(t, await fetchUserFills(t.address), sinceMs)
        )
      );
      entries = settled
        .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
        .sort((a, b) => b.lastTime - a.lastTime);
      cache = { key, at: Date.now(), entries };
    }

    const filtered =
      minNotional > 0
        ? entries.filter((e) => e.notional >= minNotional)
        : entries;

    return NextResponse.json({ entries: filtered.slice(0, 300), hours });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err) },
      { status: 500 }
    );
  }
}
