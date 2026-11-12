"use client";

import { useCallback, useEffect, useState } from "react";
import type { KospiOutlook, StockQuote } from "@/lib/market/stocks";
import type {
  KrStockQuote,
  MarketFlow,
  StockFlow,
} from "@/lib/market/investor-flows";
import { InvestorFlowChart } from "./InvestorFlowChart";

interface Flows {
  markets: MarketFlow[];
  stocks: StockFlow[];
  quotes?: KrStockQuote[];
}

function krwPrice(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

function eok(n: number): string {
  const v = Math.round(n);
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toLocaleString("ko-KR")}억`;
}

function flowCls(n: number): string {
  return n > 0 ? "text-emerald-300" : n < 0 ? "text-rose-300" : "text-zinc-400";
}

function signed(n: number, digits = 2): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

function priceText(q: StockQuote): string {
  const digits = q.price >= 1000 ? 2 : q.price >= 10 ? 2 : 4;
  return q.price.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function whenText(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortDay(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

function targetLabel(outlook: KospiOutlook): string {
  if (!outlook.target) return "다음 장";
  return `${shortDay(outlook.target.date)} 장`;
}

function matchText(outlook: KospiOutlook): string {
  if (!outlook.target) return "";
  const said = outlook.score >= 0.25 ? 1 : outlook.score <= -0.25 ? -1 : 0;
  const was = outlook.target.changePct >= 0.25 ? 1 : outlook.target.changePct <= -0.25 ? -1 : 0;
  if (outlook.target.live) return "장중";
  if (said === 0) return "보합 판단";
  return said === was ? "판단 맞음" : "판단 빗나감";
}

const VERDICT_STYLE: Record<KospiOutlook["verdict"], string> = {
  "상승 우위": "border-emerald-500/50 bg-emerald-500/10 text-emerald-200",
  "약한 상승": "border-emerald-500/30 bg-emerald-500/5 text-emerald-200/90",
  보합: "border-zinc-600 bg-zinc-800/40 text-zinc-200",
  "약한 하락": "border-rose-500/30 bg-rose-500/5 text-rose-200/90",
  "하락 우위": "border-rose-500/50 bg-rose-500/10 text-rose-200",
};

export function StockMarketPanel() {
  const [quotes, setQuotes] = useState<StockQuote[]>([]);
  const [outlook, setOutlook] = useState<KospiOutlook | null>(null);
  const [flows, setFlows] = useState<Flows | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const res = await fetch("/api/market/stocks");
      const data = (await res.json()) as {
        quotes?: StockQuote[];
        outlook?: KospiOutlook;
        flows?: Flows | null;
        error?: string;
      };
      if (!res.ok || data.error) throw new Error(data.error || "시세를 못 불러왔습니다");
      setQuotes(data.quotes ?? []);
      setOutlook(data.outlook ?? null);
      setFlows(data.flows ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "시세를 못 불러왔습니다");
    } finally {
      setLoading(false);
    }
  }, []);

  function load() {
    setLoading(true);
    void fetchAll();
  }

  useEffect(() => {
    const first = window.setTimeout(() => void fetchAll(), 0);
    const id = window.setInterval(() => void fetchAll(), 120_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [fetchAll]);

  return (
    <div className="space-y-4">
      {outlook && (
        <div className={`rounded-xl border p-4 ${VERDICT_STYLE[outlook.verdict]}`}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs text-zinc-400">
                코스피 {targetLabel(outlook)} 방향 (참고)
              </p>
              <p className="mt-1 text-2xl font-semibold">{outlook.verdict}</p>
              <p className="mt-1 text-xs text-zinc-400">
                점수 {outlook.score >= 0 ? "+" : ""}
                {outlook.score.toFixed(2)} · {outlook.usDate ? `${shortDay(outlook.usDate)} 미국장` : "미국장"}
                과 환율로만 본 경험칙입니다. 뉴스·수급은 빠져 있어서 확률일 뿐입니다.
              </p>
            </div>
            {outlook.target && (
              <div className="text-right">
                <p className="text-xs text-zinc-400">
                  {shortDay(outlook.target.date)} 코스피 {outlook.target.live ? "지금" : "실제"}
                </p>
                <p
                  className={`text-xl font-semibold tabular-nums ${
                    outlook.target.changePct >= 0 ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {signed(outlook.target.changePct)}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {matchText(outlook)}
                </p>
              </div>
            )}
          </div>
          {outlook.target && !outlook.target.live && (
            <p className="mt-2 text-[11px] text-zinc-500">
              이 판단은 이미 끝난 장에 대한 것입니다. 다음 장 판단은 오늘 밤 미국장이
              끝나는 오전 6시 뒤에 새로 나옵니다.
            </p>
          )}
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {outlook.factors.map((f) => (
              <li
                key={f.label}
                className="flex items-center justify-between gap-2 rounded-md bg-zinc-950/40 px-2.5 py-1.5 text-xs"
              >
                <span className="min-w-0">
                  <span className="text-zinc-200">{f.label}</span>
                  <span className="ml-1.5 text-zinc-500">{f.note}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className={f.changePct >= 0 ? "text-emerald-300" : "text-rose-300"}>
                    {signed(f.changePct)}
                  </span>
                  <span
                    className={`ml-2 ${
                      f.push >= 0.05
                        ? "text-emerald-400"
                        : f.push <= -0.05
                          ? "text-rose-400"
                          : "text-zinc-500"
                    }`}
                  >
                    {f.push >= 0.05 ? "▲" : f.push <= -0.05 ? "▼" : "·"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-zinc-600">
          야후 시세 · 2분마다 갱신 · 등락은 전 거래일 종가 대비
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
        >
          {loading ? "…" : "새로고침"}
        </button>
      </div>
      {error && <p className="text-sm text-amber-300/80">{error}</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {quotes.map((q) => (
          <div
            key={q.symbol}
            className="rounded-md border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-200">{q.label}</span>
              <span
                className={`text-xs tabular-nums ${
                  q.changePct >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {signed(q.changePct)}
              </span>
            </div>
            <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-50">
              {priceText(q)}
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-600">
              전일 {priceText({ ...q, price: q.prevClose })} · {whenText(q.time)}
            </p>
          </div>
        ))}
      </div>

      {flows?.quotes && flows.quotes.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-zinc-200">
            국내 반도체 · 정규장과 프리·애프터마켓
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {flows.quotes.map((q) => (
              <div
                key={q.code}
                className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5"
              >
                <div>
                  <p className="text-xs text-zinc-500">
                    {q.name} · 정규장{q.open ? " (거래 중)" : ""}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-50">
                    {krwPrice(q.price)}
                  </p>
                  <p className={`text-xs tabular-nums ${flowCls(q.changePct)}`}>
                    {signed(q.changePct)}
                  </p>
                </div>
                <div className="border-l border-zinc-800 pl-3">
                  <p className="text-xs text-zinc-500">
                    {q.over ? `${q.over.session}${q.over.open ? " (거래 중)" : ""}` : "프리·애프터"}
                  </p>
                  {q.over ? (
                    <>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-50">
                        {krwPrice(q.over.price)}
                      </p>
                      <p className={`text-xs tabular-nums ${flowCls(q.over.changePct)}`}>
                        {signed(q.over.changePct)}
                        <span className="ml-1 text-zinc-500">
                          · 정규장보다 {q.over.price - q.price >= 0 ? "+" : ""}
                          {(q.over.price - q.price).toLocaleString("ko-KR")}원
                        </span>
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-zinc-500">지금은 열리지 않음</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-zinc-600">
            넥스트레이드(NXT) 기준 · 프리마켓 08:00–08:50, 애프터마켓 15:30–20:00 ·
            등락은 전일 종가 대비
          </p>
        </div>
      )}

      <InvestorFlowChart />

      {flows && (flows.markets.length > 0 || flows.stocks.length > 0) && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-zinc-200">투자자별 순매수</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {flows.markets.map((m) => (
              <div
                key={m.market}
                className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5"
              >
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span className="font-medium text-zinc-200">{m.market}</span>
                  <span>{shortDay(m.date)} · 억원 · 장중은 잠정</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  {(
                    [
                      ["개인", m.personal],
                      ["외국인", m.foreign],
                      ["기관", m.institution],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <p className="text-[11px] text-zinc-500">{label}</p>
                      <p className={`text-base font-semibold tabular-nums ${flowCls(value)}`}>
                        {eok(value)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {flows.stocks.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-zinc-800">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="bg-zinc-950/60 text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">종목</th>
                    <th className="px-3 py-2 font-medium">날짜</th>
                    <th className="px-3 py-2 text-right font-medium">종가</th>
                    <th className="px-3 py-2 text-right font-medium">개인</th>
                    <th className="px-3 py-2 text-right font-medium">외국인</th>
                    <th className="px-3 py-2 text-right font-medium">기관</th>
                    <th className="px-3 py-2 text-right font-medium">외국인 보유</th>
                  </tr>
                </thead>
                <tbody>
                  {flows.stocks.flatMap((s) =>
                    s.rows.map((row, i) => (
                      <tr
                        key={`${s.code}-${row.date}`}
                        className={`border-t border-zinc-800/70 ${i === 0 ? "" : "text-zinc-400"}`}
                      >
                        <td className="px-3 py-1.5 text-zinc-200">{i === 0 ? s.name : ""}</td>
                        <td className="px-3 py-1.5 tabular-nums">{shortDay(row.date)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {row.close.toLocaleString("ko-KR")}
                        </td>
                        <td className={`px-3 py-1.5 text-right tabular-nums ${flowCls(row.personal)}`}>
                          {eok(row.personal)}
                        </td>
                        <td className={`px-3 py-1.5 text-right tabular-nums ${flowCls(row.foreign)}`}>
                          {eok(row.foreign)}
                        </td>
                        <td
                          className={`px-3 py-1.5 text-right tabular-nums ${flowCls(row.institution)}`}
                        >
                          {eok(row.institution)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{row.foreignHold}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-zinc-600">
            네이버 증권 기준. 시장 전체는 잠정치라 장 마감 뒤에도 숫자가 조금씩
            고쳐집니다. 종목별은 주식 수에 그날 종가를 곱한 대략 금액이고, 그날 치는
            저녁 늦게나 다음 날 올라옵니다.
          </p>
        </div>
      )}
    </div>
  );
}
