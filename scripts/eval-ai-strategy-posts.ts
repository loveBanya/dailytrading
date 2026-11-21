/**
 * 저널 글(파레토·칼마르·존버대비·앙상블·고원) 기준으로
 * NAMED_STRATEGIES + 파라미터 스윕을 평가합니다.
 */
import { fetchKlineHistory } from "../src/lib/exchanges/klines";
import {
  DEFAULT_INDICATOR_CONFIG,
  NAMED_STRATEGIES,
  computeSeries,
  enabledConditions,
  runIndicatorBacktest,
  summarize,
  type IndicatorConfig,
} from "../src/lib/backtest/indicator-strategy";
import { toBars, type BacktestTrade, type Money } from "../src/lib/backtest/types";

const MONEY: Money = { bet: 100, lev: 1, feePct: 0.04 };
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const INTERVAL = "60";
const BARS = 4000; // ~5.5개월 1H — API 한도 내 최대에 가깝게

type Row = {
  id: string;
  name: string;
  symbol: string;
  closed: number;
  winRate: number | null;
  sumUsd: number;
  avgUsd: number;
  maxDd: number;
  calmar: number | null;
  pf: number | null;
  holdPct: number;
  beatHold: boolean;
  netEdge: boolean; // avgUsd > 왕복수수료 대략
  trades: BacktestTrade[];
};

function holdPct(bars: { close: number }[]): number {
  if (bars.length < 2) return 0;
  const a = bars[0]!.close;
  const b = bars[bars.length - 1]!.close;
  return a > 0 ? ((b - a) / a) * 100 : 0;
}

/** 계좌 $100 기준 단순 누적 손익 → 수익률%, MDD% */
function equityStats(trades: BacktestTrade[], start = 100) {
  let eq = start;
  let peak = start;
  let mddPct = 0;
  for (const t of trades) {
    if (t.usd == null || t.exitTime == null) continue;
    eq += t.usd;
    peak = Math.max(peak, eq);
    if (peak > 0) mddPct = Math.max(mddPct, ((peak - eq) / peak) * 100);
  }
  const retPct = ((eq - start) / start) * 100;
  const calmar = mddPct > 1e-6 ? retPct / mddPct : retPct > 0 ? Infinity : null;
  return { retPct, mddPct, endEq: eq, calmar };
}

function runOne(
  id: string,
  name: string,
  symbol: string,
  bars: ReturnType<typeof toBars>,
  config: IndicatorConfig
): Row {
  const series = computeSeries(bars, config, null);
  const trades = runIndicatorBacktest(
    bars,
    series,
    config,
    enabledConditions(config),
    MONEY
  );
  const stats = summarize(trades);
  const eq = equityStats(trades);
  const hp = holdPct(bars);
  const roundTripFee = MONEY.bet * MONEY.lev * (MONEY.feePct / 100) * 2;
  const avgUsd = stats.closed ? stats.sumUsd / stats.closed : 0;
  return {
    id,
    name,
    symbol,
    closed: stats.closed,
    winRate: stats.winRate,
    sumUsd: stats.sumUsd,
    avgUsd,
    maxDd: stats.maxDrawdown,
    calmar: eq.calmar,
    pf: stats.profitFactor,
    holdPct: hp,
    // 계좌 수익률(%)이 같은 기간 존버 수익률(%)보다 나은지
    beatHold: eq.retPct > hp,
    netEdge: avgUsd > roundTripFee,
    trades,
  };
}

/** 파레토: 수익↑ MDD↓ — 다른 점이 둘 다 더 좋으면 지배당함 */
function paretoFront(rows: Row[]): Row[] {
  return rows.filter((a) => {
    if (a.closed < 5) return false;
    const eqA = equityStats(a.trades);
    return !rows.some((b) => {
      if (a === b || b.closed < 5) return false;
      const eqB = equityStats(b.trades);
      const betterRet = eqB.retPct >= eqA.retPct;
      const betterDd = eqB.mddPct <= eqA.mddPct;
      const strict =
        eqB.retPct > eqA.retPct || eqB.mddPct < eqA.mddPct;
      return betterRet && betterDd && strict;
    });
  });
}

/** 주간 손익 상관계수 (앙상블 상호배타성) */
function weeklyCorr(a: BacktestTrade[], b: BacktestTrade[]): number | null {
  const bucket = (trades: BacktestTrade[]) => {
    const m = new Map<number, number>();
    for (const t of trades) {
      if (t.usd == null || t.exitTime == null) continue;
      const w = Math.floor(t.exitTime / (7 * 86400));
      m.set(w, (m.get(w) ?? 0) + t.usd);
    }
    return m;
  };
  const A = bucket(a);
  const B = bucket(b);
  const keys = [...new Set([...A.keys(), ...B.keys()])].sort((x, y) => x - y);
  if (keys.length < 8) return null;
  const xs = keys.map((k) => A.get(k) ?? 0);
  const ys = keys.map((k) => B.get(k) ?? 0);
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const vx = xs[i]! - mx;
    const vy = ys[i]! - my;
    num += vx * vy;
    dx += vx * vx;
    dy += vy * vy;
  }
  if (dx < 1e-9 || dy < 1e-9) return null;
  return num / Math.sqrt(dx * dy);
}

/** 고원 스윕: 기준 전략 주변 파라미터 */
function plateauVariants(base: IndicatorConfig): { tag: string; config: IndicatorConfig }[] {
  const out: { tag: string; config: IndicatorConfig }[] = [];
  const rs = [1, 1.5, 2, 2.5, 3];
  const atrStops = [1, 1.5, 2, 2.5];
  const adxMins = [15, 20, 25, 30];
  for (const r of rs) {
    out.push({
      tag: `tpR=${r}`,
      config: {
        ...base,
        target: { ...base.target, mode: "r", r },
      },
    });
  }
  for (const atr of atrStops) {
    out.push({
      tag: `slATR=${atr}`,
      config: {
        ...base,
        stop: { ...base.stop, mode: "atr", atrMult: atr },
      },
    });
  }
  if (base.adx.on) {
    for (const min of adxMins) {
      out.push({
        tag: `adx=${min}`,
        config: { ...base, adx: { ...base.adx, min } },
      });
    }
  }
  return out;
}

function fmt(n: number | null, d = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(d);
}

async function main() {
  console.log("=== AI 매매법 글 기준 평가 ===");
  console.log(`봉: ${INTERVAL}분 × ${BARS} · 심볼: ${SYMBOLS.join(", ")} · 베팅 $${MONEY.bet}`);
  console.log("기준: 칼마르(수익%/MDD%) · 존버 대비 · 수수료 엣지 · 파레토 · 앙상블 상관\n");

  const barMap = new Map<string, ReturnType<typeof toBars>>();
  for (const sym of SYMBOLS) {
    process.stdout.write(`캔들 ${sym}… `);
    const candles = await fetchKlineHistory({
      symbol: sym,
      interval: INTERVAL,
      bars: BARS,
      prefer: "binance",
    });
    const bars = toBars(candles);
    barMap.set(sym, bars);
    const days = ((bars.at(-1)!.time - bars[0]!.time) / 86400).toFixed(0);
    console.log(`${bars.length}봉 (~${days}일) 존버 ${holdPct(bars).toFixed(1)}%`);
  }

  const allRows: Row[] = [];

  for (const sym of SYMBOLS) {
    const bars = barMap.get(sym)!;
    for (const s of NAMED_STRATEGIES) {
      const cfg = s.apply(DEFAULT_INDICATOR_CONFIG);
      allRows.push(runOne(s.id, s.name, sym, bars, cfg));
    }
  }

  // —— 심볼별 랭킹 (칼마르) ——
  console.log("\n## 1) 심볼별 칼마르 상위 (닫힌 매매 ≥5)");
  for (const sym of SYMBOLS) {
    const rows = allRows
      .filter((r) => r.symbol === sym && r.closed >= 5)
      .map((r) => ({ ...r, eq: equityStats(r.trades) }))
      .sort((a, b) => (b.eq.calmar ?? -99) - (a.eq.calmar ?? -99));
    console.log(`\n### ${sym}`);
    console.log(
      "전략".padEnd(22) +
        "건수".padStart(5) +
        "승률".padStart(7) +
        "손익$".padStart(9) +
        "MDD%".padStart(7) +
        "Calmar".padStart(8) +
        " 존버대비".padStart(8) +
        " 엣지"
    );
    for (const r of rows.slice(0, 6)) {
      console.log(
        r.name.slice(0, 20).padEnd(22) +
          String(r.closed).padStart(5) +
          (r.winRate == null ? "—" : r.winRate.toFixed(0) + "%").padStart(7) +
          fmt(r.sumUsd).padStart(9) +
          fmt(r.eq.mddPct, 1).padStart(7) +
          fmt(r.eq.calmar, 2).padStart(8) +
          (r.beatHold ? "  OK" : "  NG").padStart(8) +
          (r.netEdge ? "  OK" : "  NG")
      );
    }
  }

  // —— BTC 파레토 + 고원 (MACD·RSI+ADX 주변) ——
  const btc = barMap.get("BTCUSDT")!;
  const plateauBase = NAMED_STRATEGIES.find((s) => s.id === "macd-rsi-adx")!.apply(
    DEFAULT_INDICATOR_CONFIG
  );
  const plateauRows: Row[] = [];
  for (const v of plateauVariants(plateauBase)) {
    plateauRows.push(
      runOne(`plateau:${v.tag}`, `MACD·RSI·ADX ${v.tag}`, "BTCUSDT", btc, v.config)
    );
  }
  // 추가: WT / EMA / BB 도 파레토 후보에
  const namedBtc = allRows.filter((r) => r.symbol === "BTCUSDT" && r.closed >= 5);
  const front = paretoFront([...namedBtc, ...plateauRows.filter((r) => r.closed >= 5)]);

  console.log("\n## 2) BTC 파레토 경계 (수익↑·MDD↓ 비지배)");
  for (const r of front
    .map((r) => ({ ...r, eq: equityStats(r.trades) }))
    .sort((a, b) => a.eq.mddPct - b.eq.mddPct)) {
    console.log(
      `- ${r.name}: 수익 ${fmt(r.eq.retPct, 1)}% / MDD ${fmt(r.eq.mddPct, 1)}% / Calmar ${fmt(r.eq.calmar)} / $${fmt(r.sumUsd)} (${r.closed}건)`
    );
  }

  console.log("\n## 3) 매개변수 고원 스윕 (MACD·RSI·ADX @ BTC) — 주변이 무너지지 않는지");
  const byAxis = new Map<string, Row[]>();
  for (const r of plateauRows) {
    const axis = r.id.split(":")[1]?.split("=")[0] ?? "?";
    if (!byAxis.has(axis)) byAxis.set(axis, []);
    byAxis.get(axis)!.push(r);
  }
  for (const [axis, list] of byAxis) {
    const scored = list
      .map((r) => ({ ...r, eq: equityStats(r.trades) }))
      .sort((a, b) => (b.eq.calmar ?? -99) - (a.eq.calmar ?? -99));
    const best = scored[0]!;
    const worst = scored[scored.length - 1]!;
    const spread = (best.eq.calmar ?? 0) - (worst.eq.calmar ?? 0);
    const plateauish =
      scored.filter((r) => (r.eq.calmar ?? -99) > 0).length >= Math.ceil(scored.length * 0.5);
    console.log(
      `- ${axis}: best ${best.name.replace("MACD·RSI·ADX ", "")} Calmar ${fmt(best.eq.calmar)} · spread ${fmt(spread)} · ${plateauish ? "고원 후보" : "봉우리/불안정"}`
    );
  }

  // —— 앙상블: BTC에서 칼마르>0 이고 상관 낮은 쌍 ——
  console.log("\n## 4) 앙상블 후보 (BTC, Calmar>0, 주간 상관 낮음)");
  const survivors = namedBtc
    .map((r) => ({ ...r, eq: equityStats(r.trades) }))
    .filter((r) => (r.eq.calmar ?? 0) > 0 && r.beatHold && r.netEdge)
    .sort((a, b) => (b.eq.calmar ?? 0) - (a.eq.calmar ?? 0));

  if (survivors.length === 0) {
    console.log("칼마르>0 + 존버승 + 수수료엣지 동시 충족 전략 없음 (기간·심볼 한계).");
    const soft = namedBtc
      .map((r) => ({ ...r, eq: equityStats(r.trades) }))
      .filter((r) => r.closed >= 10)
      .sort((a, b) => (b.eq.calmar ?? -99) - (a.eq.calmar ?? -99))
      .slice(0, 5);
    console.log("완화 기준 상위:");
    for (const r of soft) {
      console.log(
        `  ${r.name}: Calmar ${fmt(r.eq.calmar)} beatHold=${r.beatHold} edge=${r.netEdge} $${fmt(r.sumUsd)}`
      );
    }
  } else {
    console.log("단독 생존:");
    for (const r of survivors) {
      console.log(`  ${r.name}: Calmar ${fmt(r.eq.calmar)} $${fmt(r.sumUsd)} MDD% ${fmt(r.eq.mddPct, 1)}`);
    }
    console.log("낮은 상관 쌍 (|ρ|<0.35):");
    for (let i = 0; i < survivors.length; i += 1) {
      for (let j = i + 1; j < survivors.length; j += 1) {
        const rho = weeklyCorr(survivors[i]!.trades, survivors[j]!.trades);
        if (rho == null) continue;
        if (Math.abs(rho) < 0.35) {
          console.log(
            `  ${survivors[i]!.name} × ${survivors[j]!.name}: ρ=${fmt(rho, 2)}`
          );
        }
      }
    }
  }

  // —— 병신 매매법 체크 요약 ——
  console.log("\n## 5) 병신 매매법 필터 요약 (BTC 네임드)");
  let trash = 0;
  for (const r of namedBtc) {
    const reasons: string[] = [];
    if (!r.beatHold) reasons.push("존버패배");
    if (!r.netEdge) reasons.push("수수료미달");
    if ((r.calmar ?? 0) < 0.5 && r.calmar != null) reasons.push("칼마르<0.5");
    if (r.closed < 5) reasons.push("표본부족");
    if (reasons.length) {
      trash += 1;
      console.log(`  ✗ ${r.name}: ${reasons.join(", ")}`);
    } else {
      console.log(`  ✓ ${r.name}`);
    }
  }
  console.log(`\n기각 ${trash}/${namedBtc.length}`);
  console.log(
    "\n참고: 글에서 말한 4년+ 사이클에는 부족(1H 4000봉≈수개월). 방향성 스크리닝용. 고원·앙상블은 더 긴 데이터로 재검증 필요."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
