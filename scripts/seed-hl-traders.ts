/**
 * 유명·탑 HL 트레이더 시드 + 포지션 동기화
 * 사용: npx tsx scripts/seed-hl-traders.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { syncActiveTraders } from "../src/lib/hyperliquid/sync";

function loadEnv() {
  const raw = readFileSync(".env.local", "utf8");
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()] as const;
      })
  );
}

const SEED = [
  {
    address: "0x020ca66c30bec2c4fe3861a94e4db4a498a35872",
    label: "Machi Big Brother",
    note: "유명 고래(Jeffrey Huang). 고레버·대형 포지션으로 언론에 자주 등장. 최근 성적 약세라 관점용.",
  },
  {
    address: "0x5078c2fbea2b2ad61bc840bc023e35fce56bedb6",
    label: "James Wynn",
    note: "공개 트레이더(@JamesWynnReal). PEPE·BTC 고레버로 유명. 팔로워 많음, 변동성 큼.",
  },
  {
    address: "0x7fdafde5cfb5465924316eced2d3715494c517d1",
    label: "BobbyBigSize",
    note: "HL 유명 닉네임. 올타임 수익 큰 편. 거래 빈도 높음(카피 시 수수료 주의).",
  },
  {
    address: "0x5b5d51203a0f9079f8aeb098a6523a13f298c060",
    label: "Abraxas A (5b5d)",
    note: "Abraxas Capital 연결로 자주 거론. 대형 숏·펀딩 수취 스타일. 초대형 계좌.",
  },
  {
    address: "0xb83de012dba672c76a7dbbbf3e459cb59d7d6e36",
    label: "Abraxas B (b83d)",
    note: "Abraxas Capital 연결로 자주 거론(A와 페어). 다수 숏 포지션. 관점 비교용.",
  },
  {
    address: "0x45d26f28196d226497130c4bac709d808fed4029",
    label: "와이드 숏북 (45d2)",
    note: "포지션 수 많음·거래 빈도 낮음. 카피 테스트에 비교적 수월한 편으로 언급됨.",
  },
  {
    address: "0xf5d81a135f756ca16544e53c20fc20643ec3ad53",
    label: "잔고 탑 (f5d8)",
    note: "리더보드 상위·계좌가치 초대형. 다종목 포지션. 규모/방향 스냅샷용.",
  },
  {
    address: "0x87f9cd15f5050a9283b8896300f7c8cf69ece2cf",
    label: "월간 수익 강세 (87f9)",
    note: "현재 리더보드 상위, 월 PnL·잔고 모두 큼. 최근 모멘텀 추적.",
  },
  {
    address: "0xecb63caa47c7c4e77f60f1ce858cf28dc2b82b00",
    label: "올타임 PnL 강자 (ecb6)",
    note: "올타임 수익 최상위권으로 자주 거론. 거래량·포지션 수 매우 많음(초단타 성격).",
  },
  {
    address: "0xfc667adba8d4837586078f4fdcdc29804337ca06",
    label: "혼용 포지션 (fc66)",
    note: "롱/숏 혼용·거래 활발. 리더보드·카피 기사에 반복 등장.",
  },
  {
    address: "0x8c625ff57d8a4374784c7eff585dfdc42ccec974",
    label: "고ROI (8c62)",
    note: "현재 리더보드 상위, 월 ROI 높음. 계좌는 상대적으로 작아 움직임 관찰하기 좋음.",
  },
  {
    address: "0x1f250df59a777d61cb8bd043c12970f3afe4f925",
    label: "AguilaTrades",
    note: "공개 디렉터리 닉네임 AguilaTrades. 최근 고ROI 구간으로 거론됨. 변동성 큼.",
  },
  {
    address: "0xb695651daa495f59dd2725c6fe98322d8b51a92d",
    label: "숏 집중 (b695)",
    note: "숏 위주·거래 빈도 보통. 카피 후보로 거론된 지갑.",
  },
  {
    address: "0x399965e15d4e61ec3529cc98b7f7ebb93b733336",
    label: "리더보드 상위 (3999)",
    note: "현재 HL 리더보드 상위권. 잔고·월 PnL 안정적 규모.",
  },
  {
    address: "0x7839e2f2c375dd2935193f2736167514efff9916",
    label: "리더보드 상위 (7839)",
    note: "리더보드 상위. 중대형 계좌, 최근 주·월 수익 양호.",
  },
  {
    address: "0x082e843a431aef031264dc232693dd710aedca88",
    label: "HYPE 롱웨일 (082e)",
    note: "HYPE 단일 롱 초대형(~$80M+). 방향성 베팅 관점용. 집중 리스크 큼.",
  },
  {
    address: "0xdf954bbe619273a56e0cfa90dad8382195dc7d72",
    label: "대형 숏북 (df95)",
    note: "월 PnL 상위. ETH/BTC 등 대형 숏·포지션 수 매우 많음. 시장 숏 바이어스 스냅샷용.",
  },
  {
    address: "0xfc27136e42af1732ddc9ce2605ea9bff1b959d9d",
    label: "메이저 숏북 (fc27)",
    note: "BTC/SOL/XRP/ZEC 숏. 월 ROI·PnL 강세. 리더보드 상위 단골.",
  },
  {
    address: "0x218a65e21eddeece7a9df38c6bbdd89f692b7da2",
    label: "BTC 숏 집중 (218a)",
    note: "BTC 숏 초대형·계좌 대비 ROI 높음. 소수 포지션 집중형.",
  },
  {
    address: "0xfe7ce058edc7cfcde9ef8262ba51f8d4796ab7ae",
    label: "알트 숏 분산 (fe7c)",
    note: "HYPE·알트 숏 다수. 월 수익 상위권. 분산 숏 스타일.",
  },
  {
    address: "0x2639dc3ab1bc1eb232720be305ce83b57c14405b",
    label: "Ansem",
    note: "유명 솔라나/밈 트레이더로 거론. 현재 잔고 거의 없음. 이름값·재진입 감시용.",
  },
  {
    address: "0xbb876071a63bc4d9bfcf46b012b4437ea7ff4281",
    label: "Andrew Kang",
    note: "유명 온체인 트레이더(Mechanism Capital 등)로 거론. 현재 잔고 거의 없음. 재진입 감시용.",
  },
  {
    address: "0xb78d97390a96a17fd2b58fedbeb3dd876c8f660a",
    label: "Andrew Tate",
    note: "공개 디렉터리상 Andrew Tate 연결 지갑으로 거론. 현재 잔고 거의 없음. 관점용.",
  },
] as const;

async function main() {
  const env = loadEnv();
  const sb = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("hl_traders")
    .upsert(
      SEED.map((t) => ({
        address: t.address.toLowerCase(),
        label: t.label,
        note: t.note,
        is_active: true,
        updated_at: now,
      })),
      { onConflict: "address" }
    )
    .select("id, address, label");

  if (error) throw error;
  console.log(`upserted ${data?.length ?? 0}`);

  const results = await syncActiveTraders(sb);
  for (const r of results) {
    const tag = r.error ? "ERR" : "OK ";
    console.log(
      `${tag} ${r.address.slice(0, 10)}… pos=${r.positionCount} ev=${r.eventsCreated} av=${r.accountValue ?? "-"}${r.error ? ` ${r.error}` : ""}`
    );
  }
  console.log(
    `synced ${results.length}, errors ${results.filter((r) => r.error).length}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
