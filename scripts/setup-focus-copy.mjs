/**
 * 주목(focus) 점수 트레이더를 모의투자 카피 전략으로 등록.
 * 사용: node scripts/setup-focus-copy.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function trustTone(t) {
  const month = num(t.roi_month) ?? num(t.pnl_month);
  const all = num(t.pnl_all_time);
  if (month == null && all == null) return "unknown";
  const monthOk =
    (num(t.roi_month) != null && num(t.roi_month) > 0) ||
    (num(t.pnl_month) != null && num(t.pnl_month) > 0);
  const allOk = all == null || all >= 0;
  if (monthOk && allOk) return "good";
  if (monthOk || allOk) return "mixed";
  return "weak";
}

/** src/lib/hyperliquid/perf.ts importanceScore 와 동일 취지 */
function importanceScore(t, opts = {}) {
  let score = 0;
  if (opts.pinned) score += 28;
  const tone = trustTone(t);
  if (tone === "good") score += 34;
  else if (tone === "mixed") score += 16;
  else if (tone === "weak") score += 4;

  const monthRoi = num(t.roi_month);
  if (monthRoi != null) {
    score += Math.max(-12, Math.min(22, monthRoi * 100 * 0.35));
  } else {
    const monthPnl = num(t.pnl_month);
    if (monthPnl != null && Math.abs(monthPnl) >= 10_000) {
      score += Math.max(-8, Math.min(12, Math.sign(monthPnl) * 8));
    }
  }

  const allPnl = num(t.pnl_all_time);
  if (allPnl != null && allPnl > 0) score += 8;
  else if (allPnl != null && allPnl < 0) score -= 6;

  const av = num(t.account_value);
  if (av != null && av > 0) {
    score += Math.min(12, Math.log10(Math.max(av, 1_000)) * 3);
  }

  const exposure = opts.exposureUsd ?? 0;
  if (exposure >= 100_000) score += 8;
  else if (exposure > 0) score += 3;

  if (opts.hasRecentEntry) score += 12;

  score = Math.round(Math.max(0, Math.min(100, score)));
  const focus = score >= 65 || opts.pinned;
  return { score, focus, label: focus ? "주목" : score >= 40 ? "관심" : "참고" };
}

function shortAddr(a) {
  if (!a || a.length < 12) return a || "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Supabase env 없음");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: traders, error: tErr } = await supabase
  .from("hl_traders")
  .select("*")
  .eq("is_active", true)
  .order("created_at", { ascending: true });
if (tErr) throw tErr;

const { data: positions, error: pErr } = await supabase
  .from("hl_open_positions")
  .select("trader_id, position_value");
if (pErr) throw pErr;

const exposureBy = new Map();
for (const p of positions ?? []) {
  const id = p.trader_id;
  exposureBy.set(
    id,
    (exposureBy.get(id) ?? 0) + Math.abs(Number(p.position_value ?? 0))
  );
}

const scored = (traders ?? []).map((t) => {
  const imp = importanceScore(t, {
    exposureUsd: exposureBy.get(t.id) ?? 0,
  });
  return { t, ...imp };
});

const focus = scored
  .filter((x) => x.focus)
  .sort((a, b) => b.score - a.score);

console.log(`활성 트레이더 ${scored.length} · 주목 ${focus.length}`);
for (const x of focus) {
  console.log(
    `  [${x.score}] ${x.t.label || shortAddr(x.t.address)} (${x.t.id.slice(0, 8)})`
  );
}

if (focus.length === 0) {
  console.log("주목 트레이더 없음 — 종료");
  process.exit(0);
}

let { data: accounts, error: aErr } = await supabase
  .from("paper_accounts")
  .select("*")
  .eq("status", "active")
  .order("created_at", { ascending: true })
  .limit(1);
if (aErr) {
  console.error(aErr.message);
  console.error("→ 015_paper_trading.sql 을 Supabase에서 실행했는지 확인");
  process.exit(1);
}

let account = accounts?.[0];
if (!account) {
  const start = 10_000;
  const { data, error } = await supabase
    .from("paper_accounts")
    .insert({
      name: "카피 계좌",
      starting_equity: start,
      cash: start,
      equity: start,
      status: "active",
    })
    .select("*")
    .single();
  if (error) throw error;
  account = data;
  console.log(`계좌 생성: ${account.id}`);
} else {
  console.log(`계좌 사용: ${account.name} (${account.id})`);
}

const { data: existing, error: eErr } = await supabase
  .from("paper_strategies")
  .select("id, name, config, mode")
  .eq("account_id", account.id)
  .eq("mode", "copy");
if (eErr) throw eErr;

const already = new Set(
  (existing ?? [])
    .map((s) => s.config?.traderId)
    .filter(Boolean)
);

let created = 0;
let skipped = 0;
for (const x of focus) {
  if (already.has(x.t.id)) {
    skipped += 1;
    continue;
  }
  const name = `카피 ${x.t.label || shortAddr(x.t.address)} (${x.score})`;
  const { error } = await supabase.from("paper_strategies").insert({
    account_id: account.id,
    name,
    mode: "copy",
    enabled: true,
    config: {
      traderId: x.t.id,
      scale: 0.1,
      maxNotional: 2000,
    },
    note: `자동등록 · 주목 점수 ${x.score}`,
  });
  if (error) {
    console.error(`FAIL ${name}: ${error.message}`);
    continue;
  }
  created += 1;
  console.log(`+ ${name}`);
}

console.log(
  `완료 · 신규 ${created} · 이미있음 ${skipped} · 주목대상 ${focus.length}`
);
