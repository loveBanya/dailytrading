"use client";

import { useEffect, useState } from "react";
import { type AltSeason, type AltSeasonKind } from "@/lib/market/alt-season";

const SEASON_LABEL: Record<AltSeasonKind, string> = {
  bitcoin: "비트코인 시즌",
  neutral: "중간",
  altcoin: "알트코인 시즌",
};

export function AltSeasonPanel() {
  const [season, setSeason] = useState<AltSeason | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancel = false;
    void fetch("/api/market/alt-season")
      .then(async (res) => {
        const data = (await res.json()) as AltSeason & { error?: string };
        if (!res.ok || data.error) throw new Error(data.error || "실패");
        return data;
      })
      .then((data) => {
        if (!cancel) setSeason(data);
      })
      .catch(() => {
        if (!cancel) setError("알트 시즌 지수를 불러오지 못했습니다");
      });
    return () => {
      cancel = true;
    };
  }, []);

  if (error) return <p className="text-sm text-amber-300/80">{error}</p>;
  if (!season) return <p className="text-sm text-zinc-500">알트 시즌 지수를 불러오는 중…</p>;

  const score = season.score;

  return (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-200">알트코인 시즌 지수</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-50">
            {score}
            <span className="ml-1 text-lg font-medium text-zinc-500">/100</span>
          </p>
        </div>
        <p className="rounded-full bg-zinc-800 px-2.5 py-1 text-[11px] text-zinc-300">
          {SEASON_LABEL[season.season]}
        </p>
      </div>

      <div>
        <div className="mb-1.5 flex justify-between text-[11px]">
          <span className="text-orange-300">비트코인 시즌</span>
          <span className="text-sky-300">알트코인 시즌</span>
        </div>
        <div className="relative h-2.5 rounded-full bg-[linear-gradient(90deg,#f97316_0%,#fdba74_42%,#93c5fd_58%,#2563eb_100%)]">
          <span
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-zinc-950 bg-white shadow"
            style={{ left: `${score}%` }}
            aria-hidden
          />
        </div>
      </div>

      <p className="text-[12px] leading-relaxed text-zinc-400">{reading(season)}</p>
      <p className="text-[11px] tabular-nums text-zinc-500">{compareLine(season)}</p>
    </div>
  );
}

function reading(season: AltSeason): string {
  const where =
    season.season === "altcoin"
      ? "알트코인 시즌입니다. 대부분 알트가 최근 90일 동안 비트코인보다 올랐습니다."
      : season.season === "bitcoin"
        ? "비트코인 시즌입니다. 알트 대부분이 최근 90일 동안 비트코인보다 약했습니다."
        : "어느 쪽으로도 기울지 않은 중간입니다.";
  return `시총 상위 100개에서 스테이블·래핑 코인을 뺀 뒤, 최근 90일 수익률이 비트코인보다 높은 종목의 비율입니다. 75 이상이면 알트코인 시즌, 25 이하면 비트코인 시즌입니다. 지금은 ${season.score}점이라 ${where}`;
}

function compareLine(season: AltSeason): string {
  const bits = [
    pair("어제", season.yesterday),
    pair("지난주", season.lastWeek),
    pair("지난달", season.lastMonth),
    pair("1년 최고", season.yearHigh),
    pair("1년 최저", season.yearLow),
  ].filter(Boolean);
  return bits.join(" · ");
}

function pair(label: string, value: number | null): string {
  if (value == null) return "";
  return `${label} ${value}`;
}
