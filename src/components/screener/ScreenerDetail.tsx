"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  createChart,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { ScreenerCandidate } from "@/lib/screener/types";
import { STRATEGY_LABELS } from "@/lib/screener/types";
import { exchangeLabel } from "@/lib/screener/filters";
import { candidateSnapshot } from "@/lib/screener/snapshot";
import { formatKst } from "@/lib/utils/format";

interface DetailPayload {
  candles: Record<
    string,
    Array<{
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>
  >;
  metrics: Record<
    string,
    { rsi: number; ema20: number; ema50: number; ema200: number; atr: number } | null
  >;
  fundingRate: number | null;
  oiChangePct: number | null;
  error?: string;
}

interface NoteRow {
  id: string;
  body: string;
  noted_at: string;
  snapshot: Record<string, unknown>;
}

export function ScreenerDetail({
  candidate,
  onClose,
  onExcluded,
  favorited,
  onFavoriteChange,
}: {
  candidate: ScreenerCandidate;
  onClose: () => void;
  onExcluded?: () => void;
  favorited?: boolean;
  onFavoriteChange?: (v: boolean) => void;
}) {
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [isFav, setIsFav] = useState(!!favorited);
  const [trackFlash, setTrackFlash] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartApi = useRef<IChartApi | null>(null);

  const snap = candidateSnapshot(candidate);

  const loadNotes = useCallback(async () => {
    try {
      const qs = new URLSearchParams({
        exchange: candidate.exchange,
        symbol: candidate.symbol,
      });
      const res = await fetch(`/api/screener/notes?${qs}`);
      const data = (await res.json()) as { items?: NoteRow[]; error?: string };
      if (!data.error) setNotes(data.items ?? []);
    } catch {
      /* ignore */
    }
  }, [candidate.exchange, candidate.symbol]);

  useEffect(() => {
    setIsFav(!!favorited);
  }, [favorited]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          exchange: candidate.exchange,
          symbol: candidate.symbol,
          timeframe: candidate.timeframe,
        });
        const res = await fetch(`/api/screener/detail?${qs}`);
        const data = (await res.json()) as DetailPayload;
        if (data.error) throw new Error(data.error);
        if (!cancelled) setDetail(data);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "상세 로드 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    void loadNotes();
    return () => {
      cancelled = true;
    };
  }, [candidate.exchange, candidate.symbol, candidate.timeframe, loadNotes]);

  useEffect(() => {
    if (!chartRef.current || !detail?.candles["15m"]?.length) return;
    if (chartApi.current) {
      chartApi.current.remove();
      chartApi.current = null;
    }
    const chart = createChart(chartRef.current, {
      height: 320,
      layout: {
        background: { type: ColorType.Solid, color: "#09090b" },
        textColor: "#a1a1aa",
      },
      grid: {
        vertLines: { color: "#27272a" },
        horzLines: { color: "#27272a" },
      },
      rightPriceScale: { borderColor: "#3f3f46" },
      timeScale: { borderColor: "#3f3f46" },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#34d399",
      downColor: "#fb7185",
      borderVisible: false,
      wickUpColor: "#34d399",
      wickDownColor: "#fb7185",
    });
    series.setData(
      detail.candles["15m"].map((c) => ({
        time: Math.floor(c.time / 1000) as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    const vol = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    vol.setData(
      detail.candles["15m"].map((c) => ({
        time: Math.floor(c.time / 1000) as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? "#34d39955" : "#fb718555",
      }))
    );
    chart.timeScale().fitContent();
    chartApi.current = chart;

    return () => {
      chart.remove();
      chartApi.current = null;
    };
  }, [detail]);

  async function excludeCoin() {
    setBusy("exclude");
    try {
      await fetch("/api/screener/exclusions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange: candidate.exchange,
          symbol: candidate.symbol,
          reason: "사용자 제외",
        }),
      });
      onExcluded?.();
      onClose();
    } finally {
      setBusy(null);
    }
  }

  async function toggleFav() {
    setBusy("fav");
    try {
      const res = await fetch("/api/screener/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange: candidate.exchange,
          symbol: candidate.symbol,
          snapshot: snap,
        }),
      });
      const data = (await res.json()) as { favorited?: boolean };
      const next = !!data.favorited;
      setIsFav(next);
      onFavoriteChange?.(next);
    } finally {
      setBusy(null);
    }
  }

  async function saveMemo() {
    if (!memo.trim()) return;
    setBusy("memo");
    try {
      await fetch("/api/screener/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange: candidate.exchange,
          symbol: candidate.symbol,
          body: memo,
          snapshot: snap,
        }),
      });
      setMemo("");
      await loadNotes();
    } finally {
      setBusy(null);
    }
  }

  async function startPaper(trackType: "manual" | "macd") {
    setBusy(trackType);
    setTrackFlash(null);
    try {
      const res = await fetch("/api/screener/paper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          trackType,
          candidates: [candidate],
        }),
      });
      const data = (await res.json()) as { started?: number; error?: string };
      if (data.error) {
        setTrackFlash({ ok: false, text: data.error });
      } else {
        setTrackFlash({
          ok: true,
          text:
            trackType === "macd"
              ? "MACD 가상투자 시작! 성과 탭에서 수익률을 보세요"
              : "지금 가격에 들어갔다고 기록했어요 · 성과 탭에서 추적",
        });
      }
    } catch (err) {
      setTrackFlash({
        ok: false,
        text: err instanceof Error ? err.message : "실패",
      });
    } finally {
      setBusy(null);
    }
  }

  const maxStrategy = Math.max(
    ...candidate.strategyScores.map((s) => s.score),
    1
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="pretty-scroll max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 p-4 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-zinc-50">
              {candidate.baseAsset}
              <span className="ml-2 text-sm font-normal text-zinc-500">
                {candidate.symbol} · {exchangeLabel(candidate.exchange)}
              </span>
            </h3>
            <p
              className={`text-sm ${
                candidate.direction.startsWith("LONG")
                  ? "text-emerald-400"
                  : candidate.direction.startsWith("SHORT")
                    ? "text-rose-400"
                    : "text-zinc-400"
              }`}
            >
              {candidate.direction} · {candidate.label} · 종합{" "}
              {candidate.scoreTotal}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400"
          >
            닫기
          </button>
        </div>

        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void toggleFav()}
              className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${
                isFav
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                  : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {isFav ? "★ 즐겨찾기됨" : "☆ 즐겨찾기"}
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void excludeCoin()}
              className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-400 transition hover:border-rose-500/40 hover:text-rose-300"
            >
              제외 목록에 추가
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={!!busy || candidate.direction === "WAIT"}
              onClick={() => void startPaper("manual")}
              className="group relative overflow-hidden rounded-xl border border-sky-400/40 bg-gradient-to-br from-sky-500/25 via-sky-600/10 to-transparent px-4 py-3 text-left transition hover:border-sky-300/70 hover:from-sky-500/35 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="pointer-events-none absolute -right-4 -top-4 size-20 rounded-full bg-sky-400/20 blur-2xl transition group-hover:bg-sky-300/30" />
              <span className="relative block text-sm font-semibold text-sky-100">
                {busy === "manual" ? "기록 중…" : "⚡ 지금 들어갔다고 가정"}
              </span>
              <span className="relative mt-0.5 block text-[11px] text-sky-200/70">
                현재가 진입으로 가상투자 시작 · 성과 탭에서 수익 추적
              </span>
            </button>
            <button
              type="button"
              disabled={!!busy || candidate.direction === "WAIT"}
              onClick={() => void startPaper("macd")}
              className="group relative overflow-hidden rounded-xl border border-violet-400/40 bg-gradient-to-br from-violet-500/25 via-fuchsia-600/10 to-transparent px-4 py-3 text-left transition hover:border-violet-300/70 hover:from-violet-500/35 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="pointer-events-none absolute -right-4 -top-4 size-20 rounded-full bg-violet-400/20 blur-2xl transition group-hover:bg-violet-300/30" />
              <span className="relative block text-sm font-semibold text-violet-100">
                {busy === "macd" ? "기록 중…" : "📡 MACD 신호로 추적"}
              </span>
              <span className="relative mt-0.5 block text-[11px] text-violet-200/70">
                MACD 기준으로 따로 모아 성과를 봅니다
              </span>
            </button>
          </div>

          {trackFlash && (
            <p
              className={`rounded-lg px-3 py-2 text-xs ${
                trackFlash.ok
                  ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : "border border-amber-500/30 bg-amber-500/10 text-amber-200"
              }`}
            >
              {trackFlash.ok ? "✓ " : ""}
              {trackFlash.text}
            </p>
          )}
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <Box label="진입" value={String(candidate.entryPrice ?? "—")} />
          <Box label="손절" value={String(candidate.stopPrice ?? "—")} />
          <Box label="TP1" value={String(candidate.tp1 ?? "—")} />
          <Box
            label="TP2 / RR"
            value={`${candidate.tp2 ?? "—"} / ${candidate.rr1 ?? "—"}`}
          />
          <Box label="RSI" value={String(candidate.rsi)} />
          <Box label="EMA" value={candidate.emaState} />
          <Box label="MACD" value={candidate.macdState} />
          <Box label="BB" value={candidate.bbState} />
          <Box
            label="OI 변화"
            value={
              candidate.oiChangePct != null
                ? `${candidate.oiChangePct.toFixed(1)}%`
                : "데이터 없음"
            }
          />
          <Box
            label="펀딩"
            value={
              candidate.fundingRate != null
                ? `${(candidate.fundingRate * 100).toFixed(4)}%`
                : "데이터 없음"
            }
          />
          <Box label="지지" value={String(candidate.support ?? "—")} />
          <Box label="저항" value={String(candidate.resistance ?? "—")} />
        </div>

        {loading && <p className="text-sm text-zinc-500">차트 로딩…</p>}
        {error && <p className="text-sm text-amber-300/80">{error}</p>}
        <div ref={chartRef} className="mb-4 w-full" />

        {detail?.metrics && (
          <div className="mb-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {(["5m", "15m", "1h", "4h"] as const).map((tf) => {
              const m = detail.metrics[tf];
              return (
                <div
                  key={tf}
                  className="rounded border border-zinc-800 px-2 py-1.5"
                >
                  <p className="text-zinc-500">{tf}</p>
                  <p className="text-zinc-200">
                    {m
                      ? `RSI ${m.rsi.toFixed(0)} · EMA20 ${m.ema20.toPrecision(6)}`
                      : "데이터 부족"}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <div className="mb-4 rounded-lg border border-zinc-800 p-3">
          <h4 className="mb-2 text-xs font-medium text-zinc-400">
            메모 (저장 시각·당시 상태 함께 기록)
          </h4>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={2}
            placeholder="관찰 메모…"
            className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200"
          />
          <button
            type="button"
            disabled={!!busy || !memo.trim()}
            onClick={() => void saveMemo()}
            className="rounded bg-emerald-600 px-3 py-1 text-xs text-white disabled:opacity-40"
          >
            메모 저장
          </button>
          <ul className="mt-3 space-y-2">
            {notes.map((n) => (
              <li
                key={n.id}
                className="rounded border border-zinc-800/80 bg-zinc-900/40 px-2 py-1.5 text-xs"
              >
                <p className="text-zinc-200">{n.body}</p>
                <p className="mt-1 text-[10px] text-zinc-500">
                  {formatKst(n.noted_at)} KST
                  {n.snapshot?.direction != null &&
                    ` · ${String(n.snapshot.direction)}`}
                  {n.snapshot?.price != null &&
                    ` · $${String(n.snapshot.price)}`}
                  {n.snapshot?.macdState != null &&
                    ` · MACD ${String(n.snapshot.macdState)}`}
                  {n.snapshot?.scoreTotal != null &&
                    ` · 점수 ${String(n.snapshot.scoreTotal)}`}
                  {n.snapshot?.rsi != null && ` · RSI ${String(n.snapshot.rsi)}`}
                </p>
              </li>
            ))}
            {notes.length === 0 && (
              <li className="text-[11px] text-zinc-600">메모 없음</li>
            )}
          </ul>
        </div>

        <div className="mb-4">
          <h4 className="mb-2 text-xs font-medium text-zinc-400">전략별 점수</h4>
          <div className="space-y-1.5">
            {candidate.strategyScores.slice(0, 12).map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-xs">
                <span className="w-28 shrink-0 text-zinc-400">
                  {STRATEGY_LABELS[s.id]}
                </span>
                <div className="h-2 flex-1 rounded bg-zinc-800">
                  <div
                    className={`h-2 rounded ${
                      s.side === "LONG"
                        ? "bg-emerald-500/70"
                        : s.side === "SHORT"
                          ? "bg-rose-500/70"
                          : "bg-zinc-600"
                    }`}
                    style={{ width: `${(s.score / maxStrategy) * 100}%` }}
                  />
                </div>
                <span className="w-10 text-right tabular-nums text-zinc-300">
                  {s.score.toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="mb-1 text-xs font-medium text-emerald-400/80">
              추천 근거
            </h4>
            <ul className="list-disc space-y-1 pl-4 text-xs text-zinc-300">
              {candidate.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-1 text-xs font-medium text-rose-400/80">
              위험요소
            </h4>
            {candidate.risks.length === 0 ? (
              <p className="text-xs text-zinc-600">표시된 위험 없음</p>
            ) : (
              <ul className="list-disc space-y-1 pl-4 text-xs text-zinc-300">
                {candidate.risks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-zinc-600">
              청산 데이터: 데이터 없음 (공개 REST 미지원)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-zinc-800 px-2 py-1.5">
      <p className="text-[10px] text-zinc-500">{label}</p>
      <p className="tabular-nums text-zinc-200">{value}</p>
    </div>
  );
}
