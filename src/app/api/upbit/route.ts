import { NextRequest, NextResponse } from "next/server";
import { hasUpbitCredentials } from "@/lib/exchanges/upbit-client";
import { syncUpbitOnce } from "@/lib/exchanges/upbit-sync";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils/labels";
import { cacheGet, cacheSet, TTL } from "@/lib/screener/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CACHE_KEY = "upbit:db-view:v1";

export interface UpbitDbView {
  snapshot: {
    synced_at: string;
    accounts: Array<{
      currency: string;
      balance: string;
      locked: string;
      avg_buy_price: string;
      unit_currency?: string;
    }>;
  } | null;
  orders: Array<Record<string, unknown>>;
  transfers: Array<Record<string, unknown>>;
  hasCredentials: boolean;
}

/** GET /api/upbit — DB(+캐시)에서만 읽기. 업비트 API 호출 없음 */
export async function GET() {
  try {
    const hit = cacheGet<UpbitDbView>(CACHE_KEY);
    if (hit) {
      return NextResponse.json({ ...hit, cached: true });
    }

    const supabase = createSupabaseAdmin();
    const [snapRes, ordRes, trRes] = await Promise.all([
      supabase
        .from("upbit_account_snapshots")
        .select("synced_at, accounts")
        .order("synced_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("upbit_orders")
        .select(
          "uuid, market, side, ord_type, state, price, volume, executed_volume, paid_fee, created_at, done_at"
        )
        .order("done_at", { ascending: false })
        .limit(80),
      supabase
        .from("upbit_transfers")
        .select(
          "uuid, kind, currency, amount, fee, state, created_at, done_at, txid"
        )
        .order("done_at", { ascending: false })
        .limit(80),
    ]);

    if (snapRes.error) throw snapRes.error;
    if (ordRes.error) throw ordRes.error;
    if (trRes.error) throw trRes.error;

    const view: UpbitDbView = {
      snapshot: snapRes.data
        ? {
            synced_at: String(snapRes.data.synced_at),
            accounts: Array.isArray(snapRes.data.accounts)
              ? (snapRes.data.accounts as NonNullable<
                  UpbitDbView["snapshot"]
                >["accounts"])
              : [],
          }
        : null,
      orders: (ordRes.data ?? []) as Array<Record<string, unknown>>,
      transfers: (trRes.data ?? []) as Array<Record<string, unknown>>,
      hasCredentials: hasUpbitCredentials(),
    };

    cacheSet(CACHE_KEY, view, TTL.tickers);
    return NextResponse.json({ ...view, cached: false });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

/**
 * POST /api/upbit/sync — 업비트 API 1회 호출 후 DB 저장.
 * 로컬(허용 IP)에서 실행 권장. 이미 있는 주문/이체 uuid는 건너뜀.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      orderPages?: number;
      transferPages?: number;
    };
    if (!hasUpbitCredentials()) {
      return NextResponse.json(
        {
          error:
            "UPBIT_ACCESS_KEY / UPBIT_SECRET_KEY 가 .env.local 에 필요합니다. Secret Key를 넣고 업비트에 로컬 공인 IP를 등록한 뒤 동기화하세요.",
        },
        { status: 400 }
      );
    }

    const result = await syncUpbitOnce({
      orderPages: body.orderPages,
      transferPages: body.transferPages,
    });

    // 캐시 무효화 — 빈 값으로 덮어 TTL 만료 유도
    cacheSet(CACHE_KEY, null as unknown as UpbitDbView, 1);

    if (result.error) {
      return NextResponse.json(
        { ok: false, ...result },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
