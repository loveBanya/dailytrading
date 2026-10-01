"use client";

import { useEffect, useMemo, useState } from "react";
import type { WalletOverview } from "@/lib/exchanges/wallet";
import type { MarketTicker } from "@/lib/exchanges/market";

const STORAGE_KEY = "dailytrading.riskcalc.v1";

type Side = "long" | "short";

interface SavedInputs {
  equity: string;
  riskPct: string;
  entry: string;
  /** 직접 정한 손절가 */
  stop: string;
  leverage: string;
  /** 편도 수수료 % */
  feePct: string;
  /** 가격 기준 손익비. 2면 1:2 */
  rewardR: string;
  side: Side;
  /** 현재가 버튼으로 고른 코인 */
  coin: string;
}

const DEFAULTS: SavedInputs = {
  equity: "1000",
  riskPct: "3",
  entry: "",
  stop: "",
  leverage: "10",
  feePct: "0.055",
  rewardR: "2",
  side: "long",
  coin: "",
};

function qtyFmt(n: number, step?: number): string {
  if (step && step > 0) {
    const decimals = (String(step).split(".")[1] ?? "").length;
    return n.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  const digits = n >= 1000 ? 2 : n >= 1 ? 4 : 6;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

const LOT_SYMBOL: Record<string, string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  XRP: "XRPUSDT",
  SOXL: "SOXLUSDT",
  KORU: "KORUUSDT",
};

/** 시세 API에 단위가 없어도 이 코인들은 바이비트 선물 단위로 내린다 */
const FALLBACK_LOT: Record<string, { min: number; step: number }> = {
  BTC: { min: 0.001, step: 0.001 },
  ETH: { min: 0.01, step: 0.01 },
  XRP: { min: 0.1, step: 0.1 },
  SOXL: { min: 0.01, step: 0.01 },
  KORU: { min: 0.01, step: 0.01 },
};

function floorToStep(qty: number, step: number): number {
  if (!(step > 0)) return qty;
  const decimals = (String(step).split(".")[1] ?? "").length;
  const units = Math.floor(qty / step + 1e-8);
  return Number((units * step).toFixed(decimals));
}

function money(n: number, digits = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function priceFmt(n: number): string {
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function won(usdtAmt: number, fx: number): string {
  return `₩${Math.round(usdtAmt * fx).toLocaleString("ko-KR")}`;
}

/** 1:2 처럼 손익비 표기 */
function ratioLabel(rewardPerRisk: number): string {
  if (!Number.isFinite(rewardPerRisk) || rewardPerRisk <= 0) return "—";
  const rounded =
    rewardPerRisk >= 10
      ? rewardPerRisk.toFixed(1)
      : rewardPerRisk.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `1 : ${rounded}`;
}

export function RiskCalculatorPanel({
  wallet,
  walletLoading,
  fxRate,
  tickers = [],
}: {
  wallet: WalletOverview | null;
  walletLoading?: boolean;
  fxRate?: number;
  tickers?: MarketTicker[];
}) {
  const fx = fxRate && fxRate > 0 ? fxRate : 1350;
  const [equity, setEquity] = useState(DEFAULTS.equity);
  const [riskPct, setRiskPct] = useState(DEFAULTS.riskPct);
  const [entry, setEntry] = useState(DEFAULTS.entry);
  const [stop, setStop] = useState(DEFAULTS.stop);
  const [leverage, setLeverage] = useState(DEFAULTS.leverage);
  const [feePct, setFeePct] = useState(DEFAULTS.feePct);
  const [rewardR, setRewardR] = useState(DEFAULTS.rewardR);
  const [side, setSide] = useState<Side>(DEFAULTS.side);
  const [coin, setCoin] = useState(DEFAULTS.coin);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<SavedInputs>;
        if (saved.equity) setEquity(String(saved.equity));
        if (saved.riskPct && String(saved.riskPct) !== "1") {
          setRiskPct(String(saved.riskPct));
        }
        if (saved.entry) setEntry(String(saved.entry));
        if (saved.stop) setStop(String(saved.stop));
        if (saved.leverage) setLeverage(String(saved.leverage));
        if (saved.feePct) setFeePct(String(saved.feePct));
        if (saved.rewardR) setRewardR(String(saved.rewardR));
        if (saved.side === "long" || saved.side === "short") setSide(saved.side);
        if (saved.coin) setCoin(String(saved.coin));
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const payload: SavedInputs = {
      equity,
      riskPct,
      entry,
      stop,
      leverage,
      feePct,
      rewardR,
      side,
      coin,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }, [ready, equity, riskPct, entry, stop, leverage, feePct, rewardR, side, coin]);

  const result = useMemo(() => {
    const eq = Number(equity);
    const risk = Number(riskPct);
    const px = Number(entry);
    const stopPx = Number(stop);
    const lev = Number(leverage);
    const fee = Number(feePct);
    const rr = Number(rewardR);

    if (
      !(eq > 0) ||
      !(risk > 0) ||
      !(px > 0) ||
      !(stopPx > 0) ||
      !(lev >= 1) ||
      !(fee >= 0) ||
      !(rr > 0)
    ) {
      return null;
    }

    const riskAmount = eq * (risk / 100);
    const distance = Math.abs(px - stopPx);
    const wrongSide = side === "long" ? stopPx >= px : stopPx <= px;
    const feeRate = fee / 100;
    // 개당 손실 = 가격 간격 + 진입·청산 수수료
    const lossPerUnit = distance + px * feeRate * 2;
    const rawQty = lossPerUnit > 0 ? riskAmount / lossPerUnit : 0;
    const lotSymbol = LOT_SYMBOL[coin];
    const lot = lotSymbol
      ? tickers.find((t) => t.symbol === lotSymbol)
      : undefined;
    const fallback = FALLBACK_LOT[coin];
    const qtyStep = lot?.qtyStep || fallback?.step || 0;
    const minOrderQty = lot?.minOrderQty || fallback?.min || 0;
    const lotApplied = qtyStep > 0 && minOrderQty > 0;
    const steppedQty = lotApplied ? floorToStep(rawQty, qtyStep) : rawQty;
    const belowMin = lotApplied && steppedQty < minOrderQty;
    const qty = belowMin ? rawQty : steppedQty;
    const notional = qty * px;
    const roundTripFee = notional * feeRate * 2;
    const margin = notional / lev;
    const betPct = eq > 0 ? (margin / eq) * 100 : 0;
    const stopPct = px > 0 ? (distance / px) * 100 : 0;
    const tpDistance = distance * rr;
    const tpPrice = side === "long" ? px + tpDistance : px - tpDistance;
    const tpPct = px > 0 ? (tpDistance / px) * 100 : 0;
    const netLoss = qty * distance + roundTripFee;
    const netProfit = qty * tpDistance - roundTripFee;
    const netRatio = netLoss > 0 ? netProfit / netLoss : 0;
    const liqPrice =
      side === "long" ? px * (1 - 1 / lev) : px * (1 + 1 / lev);
    const stopBeyondLiq =
      !wrongSide &&
      (side === "long" ? stopPx <= liqPrice : stopPx >= liqPrice);
    const tpInvalid = side === "short" && tpPrice <= 0;

    return {
      riskAmount,
      margin,
      betPct,
      notional,
      qty,
      rawQty,
      qtyStep,
      minOrderQty,
      lotApplied,
      belowMin,
      roundTripFee,
      stopPrice: stopPx,
      stopPct,
      tpPrice,
      tpPct,
      netLoss,
      netProfit,
      netRatio,
      liqPrice,
      stopBeyondLiq,
      tpInvalid,
      wrongSide,
    };
  }, [equity, riskPct, entry, stop, leverage, feePct, rewardR, side, coin, tickers]);

  const pricesOk =
    !!result && !result.wrongSide && !result.tpInvalid && !result.belowMin;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["long", "롱"],
            ["short", "숏"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSide(id)}
            className={`rounded-md border px-4 py-1.5 text-sm font-medium transition ${
              side === id
                ? id === "long"
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                  : "border-rose-500/50 bg-rose-500/15 text-rose-200"
                : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="text-[11px] text-zinc-600">
          환율 {fx.toLocaleString("ko-KR")}원
        </span>
        <button
          type="button"
          disabled={!wallet || walletLoading || !(wallet.totalEquity > 0)}
          onClick={() => {
            if (!wallet || !(wallet.totalEquity > 0)) return;
            setEquity(wallet.totalEquity.toFixed(2));
          }}
          className="ml-auto rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
        >
          {walletLoading ? "지갑 불러오는 중…" : "지갑 자산 넣기"}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
          <p className="text-xs font-medium text-zinc-400">계좌</p>
          <div className="grid grid-cols-2 items-start gap-x-3 gap-y-1.5">
            <Field
              label="자산 USDT"
              value={equity}
              step="10"
              onChange={setEquity}
              hint={
                Number(equity) > 0 ? won(Number(equity), fx) : "금액을 입력하세요"
              }
            />
            <Field
              label="리스크 %"
              value={riskPct}
              step="0.1"
              onChange={setRiskPct}
              hint={
                Number(equity) > 0 && Number(riskPct) > 0
                  ? `$${money(Number(equity) * (Number(riskPct) / 100))} · ${won(Number(equity) * (Number(riskPct) / 100), fx)}`
                  : "\u00a0"
              }
            />
            <div />
            <Chips
              values={["1", "2", "3", "4", "5"]}
              current={riskPct}
              onPick={setRiskPct}
              suffix="%"
            />
          </div>
          <div>
            <Field
              label="레버리지"
              value={leverage}
              step="1"
              onChange={setLeverage}
              hint="수량을 정한 뒤 필요한 증거금만 계산합니다"
            />
            <Chips
              values={["1", "3", "5", "10", "20", "25", "50", "100"]}
              current={leverage}
              onPick={setLeverage}
              suffix="x"
            />
          </div>

          <p className="pt-1 text-xs font-medium text-zinc-400">가격</p>
          <div className="grid grid-cols-2 items-start gap-3">
            <Field
              label="현재가"
              value={entry}
              step="any"
              onChange={(v) => {
                setEntry(v);
                setCoin("");
              }}
              placeholder="진입가"
            />
            <Field
              label="손절가"
              value={stop}
              step="any"
              onChange={setStop}
              placeholder="여기까지"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["BTCUSDT", "비트", "BTC"],
                ["ETHUSDT", "이더", "ETH"],
                ["XRPUSDT", "리플", "XRP"],
                ["SOXLUSDT", "SOXL", "SOXL"],
                ["KORUUSDT", "KORU", "KORU"],
              ] as const
            ).map(([symbol, label, unit]) => {
              const px = tickers.find((t) => t.symbol === symbol)?.lastPrice;
              const on = coin === unit && px != null && Number(entry) === Number(px.toFixed(2));
              return (
                <button
                  key={symbol}
                  type="button"
                  disabled={!(px && px > 0)}
                  onClick={() => {
                    if (!(px && px > 0)) return;
                    setEntry(px.toFixed(2));
                    setCoin(unit);
                  }}
                  className={`rounded-md border px-2.5 py-1 text-[11px] tabular-nums transition disabled:opacity-40 ${
                    on
                      ? "border-sky-500/50 bg-sky-500/15 text-sky-200"
                      : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {label}
                  {px && px > 0 ? ` ${priceFmt(px)}` : " …"}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Field
                label="수수료 % 편도"
                value={feePct}
                step="0.0001"
                onChange={setFeePct}
                hint="진입·청산 각 1회"
              />
              <Chips
                values={["0", "0.0180", "0.02", "0.055", "0.06"]}
                current={feePct}
                onPick={setFeePct}
              />
            </div>
            <div>
              <Field
                label="손익비"
                value={rewardR}
                step="0.5"
                onChange={setRewardR}
                hint={
                  Number(rewardR) > 0 ? ratioLabel(Number(rewardR)) : undefined
                }
              />
              <Chips
                values={["1", "1.5", "2", "3"]}
                current={rewardR}
                onPick={setRewardR}
                format={(v) => ratioLabel(Number(v))}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {!result && (
            <div className="flex h-full min-h-48 items-center justify-center rounded-xl border border-dashed border-zinc-800 px-4 text-center text-sm text-zinc-500">
              현재가와 손절가를 넣으면, 그 구간에서 리스크만큼만 잃도록 몇 개
              살지가 나옵니다.
            </div>
          )}

          {result && (
            <>
              <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
                <p className="text-[11px] font-medium text-zinc-400">
                  {coin ? `${coin} ` : ""}살 수량
                </p>
                <p className="mt-1 text-3xl font-semibold tabular-nums text-zinc-50">
                  {result.wrongSide
                    ? "—"
                    : result.belowMin
                      ? "최소 수량 미달"
                      : `${qtyFmt(result.qty, result.qtyStep)}개`}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {result.wrongSide
                    ? side === "long"
                      ? "롱이면 손절가는 현재가보다 아래여야 합니다."
                      : "숏이면 손절가는 현재가보다 위여야 합니다."
                    : result.belowMin
                      ? `계산 ${qtyFmt(result.rawQty)}개는 바이비트 최소 ${qtyFmt(result.minOrderQty, result.qtyStep)}개보다 작습니다. 손절을 더 가깝게 하거나 리스크를 키워야 주문할 수 있습니다.`
                      : result.lotApplied &&
                          Math.abs(result.qty - result.rawQty) >=
                            result.qtyStep / 2
                        ? `계산 ${qtyFmt(result.rawQty)}개를 ${qtyFmt(result.qtyStep, result.qtyStep)}개 단위로 내림 · 손절 시 −$${money(result.netLoss)} · ${won(result.netLoss, fx)}`
                        : `손절까지 가면 −$${money(result.netLoss)} · ${won(result.netLoss, fx)} · 증거금 ${won(result.margin, fx)} (${result.betPct.toFixed(1)}%)`}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Outcome
                  tone={result.wrongSide ? "bad" : result.stopBeyondLiq ? "warn" : "stop"}
                  kicker="손절"
                  price={result.wrongSide ? "—" : priceFmt(result.stopPrice)}
                  move={pricesOk ? `${result.stopPct.toFixed(2)}%` : undefined}
                  usdt={pricesOk ? `−$${money(result.netLoss)}` : undefined}
                  krw={pricesOk ? won(result.netLoss, fx) : undefined}
                />
                <Outcome
                  tone={
                    result.wrongSide || result.tpInvalid || result.netProfit <= 0
                      ? "bad"
                      : "tp"
                  }
                  kicker={`익절 ${ratioLabel(Number(rewardR))}`}
                  price={
                    result.wrongSide || result.tpInvalid
                      ? "—"
                      : priceFmt(result.tpPrice)
                  }
                  move={pricesOk ? `${result.tpPct.toFixed(2)}%` : undefined}
                  usdt={
                    pricesOk && result.netProfit > 0
                      ? `+$${money(result.netProfit)}`
                      : undefined
                  }
                  krw={
                    pricesOk && result.netProfit > 0
                      ? won(result.netProfit, fx)
                      : undefined
                  }
                  note={
                    pricesOk
                      ? `수수료 반영 ${ratioLabel(result.netRatio)}`
                      : undefined
                  }
                />
              </div>

              {pricesOk && (
                <PriceRail
                  side={side}
                  entry={Number(entry)}
                  stop={result.stopPrice}
                  tp={result.tpPrice}
                />
              )}

              {result.wrongSide && (
                <p className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm text-rose-100/90">
                  손절 방향이 포지션과 맞지 않습니다.
                </p>
              )}
              {!result.wrongSide &&
                !result.belowMin &&
                result.margin > Number(equity) && (
                  <p className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm text-rose-100/90">
                    필요 증거금이 자산보다 큽니다. 이 수량은 지금 계좌로 열 수
                    없습니다. 레버리지를{" "}
                    {Math.ceil(result.notional / Number(equity))}배 이상으로
                    올리거나, 리스크를 낮추세요.
                  </p>
                )}
              {result.stopBeyondLiq && !result.wrongSide && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-100/90">
                  이 손절은 청산가 {priceFmt(result.liqPrice)} 바깥입니다. 레버리지를
                  낮추면 청산이 손절보다 멀어집니다.
                </p>
              )}

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat
                  label="수량"
                  value={
                    result.wrongSide || result.belowMin
                      ? "—"
                      : qtyFmt(result.qty, result.qtyStep)
                  }
                  sub={
                    result.lotApplied
                      ? `최소 ${qtyFmt(result.minOrderQty, result.qtyStep)} · 단위 ${qtyFmt(result.qtyStep, result.qtyStep)}`
                      : coin || "개"
                  }
                />
                <Stat
                  label="필요 증거금"
                  value={result.wrongSide ? "—" : won(result.margin, fx)}
                  sub={
                    result.wrongSide
                      ? undefined
                      : `$${money(result.margin)} · 자산의 ${result.betPct.toFixed(1)}%`
                  }
                />
                <Stat
                  label="왕복 수수료"
                  value={result.wrongSide ? "—" : won(result.roundTripFee, fx)}
                  sub={result.wrongSide ? undefined : `$${money(result.roundTripFee)}`}
                />
                <Stat
                  label="청산가"
                  value={priceFmt(result.liqPrice)}
                  sub={`${leverage}x · 유지증거금 제외`}
                  accent={result.stopBeyondLiq ? "rose" : undefined}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Chips({
  values,
  current,
  onPick,
  suffix,
  format,
}: {
  values: string[];
  current: string;
  onPick: (v: string) => void;
  suffix?: string;
  format?: (v: string) => string;
}) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {values.map((v) => {
        const on = Number(current) === Number(v);
        return (
          <button
            key={v}
            type="button"
            onClick={() => onPick(v)}
            className={`rounded px-2 py-0.5 text-[11px] tabular-nums transition ${
              on
                ? "bg-zinc-200 text-zinc-900"
                : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {format ? format(v) : `${v}${suffix ?? ""}`}
          </button>
        );
      })}
    </div>
  );
}

function Outcome({
  tone,
  kicker,
  price,
  move,
  usdt,
  krw,
  note,
}: {
  tone: "stop" | "tp" | "bad" | "warn";
  kicker: string;
  price: string;
  move?: string;
  usdt?: string;
  krw?: string;
  note?: string;
}) {
  const box =
    tone === "tp"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : tone === "stop"
        ? "border-rose-500/25 bg-rose-500/5"
        : tone === "warn"
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-rose-500/40 bg-rose-500/5";
  const priceCls =
    tone === "tp"
      ? "text-emerald-200"
      : tone === "bad" || tone === "stop"
        ? "text-rose-200"
        : "text-amber-100";
  return (
    <div className={`rounded-xl border p-4 ${box}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-zinc-400">{kicker}</p>
        {move && <p className="text-[11px] tabular-nums text-zinc-500">{move}</p>}
      </div>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${priceCls}`}>
        {price}
      </p>
      {krw && (
        <p className="mt-2 text-sm font-medium tabular-nums text-zinc-100">
          {krw}
        </p>
      )}
      {usdt && <p className="text-[11px] tabular-nums text-zinc-500">{usdt}</p>}
      {note && <p className="mt-1 text-[11px] text-zinc-500">{note}</p>}
    </div>
  );
}

function PriceRail({
  side,
  entry,
  stop,
  tp,
}: {
  side: Side;
  entry: number;
  stop: number;
  tp: number;
}) {
  const lo = Math.min(stop, entry, tp);
  const hi = Math.max(stop, entry, tp);
  const span = hi - lo || 1;
  const at = (p: number) => ((p - lo) / span) * 100;
  const marks = [
    { key: "sl", label: "손절", price: stop, at: at(stop), cls: "bg-rose-400" },
    {
      key: "en",
      label: "진입",
      price: entry,
      at: at(entry),
      cls: "bg-zinc-200",
    },
    { key: "tp", label: "익절", price: tp, at: at(tp), cls: "bg-emerald-400" },
  ];
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3">
      <div className="relative h-10">
        <div className="absolute top-2 right-0 left-0 h-1 rounded-full bg-zinc-800" />
        <div
          className="absolute top-2 h-1 rounded-full bg-zinc-600"
          style={{
            left: `${Math.min(at(stop), at(tp))}%`,
            width: `${Math.abs(at(tp) - at(stop))}%`,
          }}
        />
        {marks.map((m) => (
          <div
            key={m.key}
            className="absolute top-0.5 -translate-x-1/2"
            style={{ left: `${m.at}%` }}
          >
            <div className={`mx-auto h-4 w-1 rounded-full ${m.cls}`} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between gap-2 text-[11px] text-zinc-500">
        <span>
          {side === "long" ? "손절" : "익절"}{" "}
          <span className="tabular-nums text-zinc-300">
            {priceFmt(side === "long" ? stop : tp)}
          </span>
        </span>
        <span>
          진입{" "}
          <span className="tabular-nums text-zinc-300">{priceFmt(entry)}</span>
        </span>
        <span>
          {side === "long" ? "익절" : "손절"}{" "}
          <span className="tabular-nums text-zinc-300">
            {priceFmt(side === "long" ? tp : stop)}
          </span>
        </span>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  step,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block min-w-0 text-xs text-zinc-500">
      <span className="block leading-4">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500/50"
      />
      <span className="mt-0.5 block min-h-4 text-[11px] leading-4 break-all text-zinc-600">
        {hint || "\u00a0"}
      </span>
    </label>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "rose" | "emerald";
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p
        className={`mt-0.5 text-lg font-semibold tabular-nums ${
          accent === "rose"
            ? "text-rose-300"
            : accent === "emerald"
              ? "text-emerald-300"
              : "text-zinc-100"
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-[11px] text-zinc-600">{sub}</p>}
    </div>
  );
}
