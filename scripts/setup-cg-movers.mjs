/**
 * Coinglass 스타일 CG 신호 모의투자 전략 1개 등록
 * node scripts/setup-cg-movers.mjs
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

loadEnvLocal();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: accounts, error: aErr } = await supabase
  .from("paper_accounts")
  .select("*")
  .eq("status", "active")
  .order("created_at", { ascending: true })
  .limit(1);
if (aErr) throw aErr;
let account = accounts?.[0];
if (!account) {
  const { data, error } = await supabase
    .from("paper_accounts")
    .insert({
      name: "기본 계좌",
      starting_equity: 10000,
      cash: 10000,
      equity: 10000,
      status: "active",
    })
    .select("*")
    .single();
  if (error) throw error;
  account = data;
}

const { data: existing } = await supabase
  .from("paper_strategies")
  .select("id, name")
  .eq("account_id", account.id)
  .eq("mode", "movers");

if (existing?.length) {
  console.log(`이미 CG 전략 ${existing.length}개 있음`);
  process.exit(0);
}

const { data, error } = await supabase
  .from("paper_strategies")
  .insert({
    account_id: account.id,
    name: "CG 신호 4h",
    mode: "movers",
    enabled: true,
    config: {
      period: "4h",
      followSurge: true,
      followOi: true,
      topN: 5,
      riskPct: 0.08,
      takeProfitPct: 4,
      stopLossPct: 2,
      maxPositions: 5,
    },
    note: "급상승·OI↑ 추종",
  })
  .select("*")
  .single();

if (error) {
  console.error(error.message);
  console.error("→ 016_paper_movers_mode.sql 을 Supabase에서 실행했는지 확인");
  process.exit(1);
}
console.log("등록:", data.name, data.id);
