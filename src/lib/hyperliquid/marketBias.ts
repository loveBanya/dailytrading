import { fetchLeaderboard } from "./client";
import { fetchClearinghouseState } from "./client";

export interface MarketCoinCtx {
  coin: string;
  markPx: number;
  openInterestUsd: number;
  funding: number;
  /** 8h 펀딩 기준 연환산 대략치 */
  fundingAprPct: number;
}

export interface SideSplit {
  longUsd: number;
  shortUsd: number;
  longAccounts: number;
  shortAccounts: number;
  bothAccounts: number;
  accountsWithPos: number;
}

export interface CoinSideSplit extends SideSplit {
  coin: string;
}

export interface CohortBias {
  label: string;
  sampleSize: number;
  overall: SideSplit;
  byCoin: CoinSideSplit[];
}

function emptySplit(): SideSplit {
  return {
    longUsd: 0,
    shortUsd: 0,
    longAccounts: 0,
    shortAccounts: 0,
    bothAccounts: 0,
    accountsWithPos: 0,
  };
}

export function longPct(split: SideSplit): number | null {
  const t = split.longUsd + split.shortUsd;
  if (t <= 0) return null;
  return (split.longUsd / t) * 100;
}

export function accountLongPct(split: SideSplit): number | null {
  const t = split.longAccounts + split.shortAccounts;
  if (t <= 0) return null;
  return (split.longAccounts / t) * 100;
}

/** 관심 vs 대중: 같은 쪽이면 with, 반대면 against, 애매하면 mixed */
export function compareBias(
  a: number | null,
  b: number | null,
  thr = 8
): "with" | "against" | "mixed" | "unknown" {
  if (a == null || b == null) return "unknown";
  const aLean = a - 50;
  const bLean = b - 50;
  if (Math.abs(aLean) < thr || Math.abs(bLean) < thr) return "mixed";
  return aLean * bLean > 0 ? "with" : "against";
}

export async function fetchMarketCoinCtx(
  coins?: string[]
): Promise<MarketCoinCtx[]> {
  const res = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "metaAndAssetCtxs" }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`metaAndAssetCtxs ${res.status}`);
  const json = (await res.json()) as [
    { universe?: Array<{ name?: string }> },
    Array<{
      openInterest?: string;
      markPx?: string;
      midPx?: string;
      funding?: string;
    }>,
  ];
  const universe = json[0]?.universe ?? [];
  const ctxs = json[1] ?? [];
  const want = coins?.length ? new Set(coins.map((c) => c.toUpperCase())) : null;
  const out: MarketCoinCtx[] = [];
  for (let i = 0; i < universe.length; i++) {
    const name = universe[i]?.name;
    if (!name) continue;
    if (want && !want.has(name.toUpperCase()) && !want.has(name)) continue;
    const ctx = ctxs[i];
    if (!ctx) continue;
    const mark = Number(ctx.markPx ?? ctx.midPx ?? 0);
    const oi = Number(ctx.openInterest ?? 0);
    const funding = Number(ctx.funding ?? 0);
    if (!Number.isFinite(mark) || mark <= 0) continue;
    out.push({
      coin: name,
      markPx: mark,
      openInterestUsd: oi * mark,
      funding,
      fundingAprPct: funding * 3 * 365 * 100,
    });
  }
  out.sort((a, b) => b.openInterestUsd - a.openInterestUsd);
  return out;
}

export function aggregatePositions(
  positions: Array<{
    coin: string;
    side: "LONG" | "SHORT";
    position_value: number | null;
    trader_id?: string;
  }>
): { overall: SideSplit; byCoin: CoinSideSplit[] } {
  const overall = emptySplit();
  const byTrader = new Map<string, { L: number; S: number }>();
  const byCoin = new Map<
    string,
    SideSplit & { tradersL: Set<string>; tradersS: Set<string> }
  >();

  for (const p of positions) {
    const v = Math.abs(Number(p.position_value ?? 0));
    if (!(v > 0)) continue;
    const tid = p.trader_id ?? "_";
    const t = byTrader.get(tid) ?? { L: 0, S: 0 };
    if (p.side === "LONG") {
      overall.longUsd += v;
      t.L += v;
    } else {
      overall.shortUsd += v;
      t.S += v;
    }
    byTrader.set(tid, t);

    const c =
      byCoin.get(p.coin) ??
      ({
        ...emptySplit(),
        coin: p.coin,
        tradersL: new Set<string>(),
        tradersS: new Set<string>(),
      } as SideSplit & {
        coin: string;
        tradersL: Set<string>;
        tradersS: Set<string>;
      });
    if (p.side === "LONG") {
      c.longUsd += v;
      c.tradersL.add(tid);
    } else {
      c.shortUsd += v;
      c.tradersS.add(tid);
    }
    byCoin.set(p.coin, c);
  }

  for (const t of byTrader.values()) {
    if (t.L <= 0 && t.S <= 0) continue;
    overall.accountsWithPos += 1;
    if (t.L > 0 && t.S > 0) overall.bothAccounts += 1;
    else if (t.L > 0) overall.longAccounts += 1;
    else overall.shortAccounts += 1;
  }

  const coins: CoinSideSplit[] = [...byCoin.entries()].map(([coin, c]) => ({
    coin,
    longUsd: c.longUsd,
    shortUsd: c.shortUsd,
    longAccounts: c.tradersL.size,
    shortAccounts: c.tradersS.size,
    bothAccounts: 0,
    accountsWithPos: new Set([...c.tradersL, ...c.tradersS]).size,
  }));
  coins.sort(
    (a, b) => b.longUsd + b.shortUsd - (a.longUsd + a.shortUsd)
  );

  return { overall, byCoin: coins };
}

/** 중형 계좌 샘플 = 대중 프록시 (리더보드 $50k~$3M, 관심 지갑 제외) */
export async function sampleCrowdBias(
  sample = 40,
  excludeAddresses: Set<string> = new Set()
): Promise<CohortBias> {
  const rows = await fetchLeaderboard(800);
  const mid = rows.filter((r) => {
    const av = r.accountValue ?? 0;
    if (av < 50_000 || av > 3_000_000) return false;
    return !excludeAddresses.has(r.address.toLowerCase());
  });
  // 앞쪽은 상대적으로 큰 편 → 중간 구간
  const start = Math.min(60, Math.max(0, mid.length - sample));
  const pick = mid.slice(start, start + sample);

  const positions: Array<{
    coin: string;
    side: "LONG" | "SHORT";
    position_value: number | null;
    trader_id: string;
  }> = [];

  const settled = await Promise.allSettled(
    pick.map(async (r) => {
      const snap = await fetchClearinghouseState(r.address);
      return snap.positions.map((p) => ({
        coin: p.coin,
        side: p.side,
        position_value: p.positionValue,
        trader_id: r.address,
      }));
    })
  );

  for (const s of settled) {
    if (s.status === "fulfilled") positions.push(...s.value);
  }

  const { overall, byCoin } = aggregatePositions(positions);
  return {
    label: "대중(중형 계좌 샘플)",
    sampleSize: pick.length,
    overall,
    byCoin,
  };
}
