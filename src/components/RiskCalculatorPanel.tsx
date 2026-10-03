"use client";

import type { WalletOverview } from "@/lib/exchanges/wallet";
import type { MarketTicker } from "@/lib/exchanges/market";
import { SymbolSearch } from "./SymbolSearch";
import { useRiskCalc } from "./useRiskCalc";
import {
  COIN_SHORTCUTS,
  COIN_STEP,
  QTY_UNIT_PRESETS,
  money,
  priceFmt,
  qtyFmt,
  ratioLabel,
  won,
  type Side,
} from "./risk-calc";

export function RiskCalculatorPanel({
  wallet,
  walletLoading,
  fxRate,
  tickers = [],
  embedded = false,
}: {
  wallet: WalletOverview | null;
  walletLoading?: boolean;
  fxRate?: number;
  tickers?: MarketTicker[];
  /** 작은 계산 창. 좁으면 한 줄, 넓으면 입력과 결과를 나란히 둔다 */
  embedded?: boolean;
}) {
  const fx = fxRate && fxRate > 0 ? fxRate : 1350;
  const {
    equity,
    setEquity,
    riskPct,
    setRiskPct,
    entry,
    setEntry,
    stop,
    setStop,
    leverage,
    setLeverage,
    feePct,
    setFeePct,
    rewardR,
    setRewardR,
    side,
    coin,
    setCoin,
    qtyUnit,
    setQtyUnit,
    customQuote,
    setCustomQuote,
    linkWallet,
    setLinkWallet,
    result,
    pickTicker,
    pickShortcut,
    restoreCustom,
  } = useRiskCalc(wallet);

  const pricesOk =
    !!result && !result.wrongSide && !result.tpInvalid && !result.belowMin;

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-zinc-600">
        환율 {fx.toLocaleString("ko-KR")}원
      </p>

      <div
        className={
          embedded
            ? "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3"
            : "grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-4"
        }
      >
        <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
          <p className="text-xs font-medium text-zinc-400">계좌</p>
          <div className="grid grid-cols-2 items-start gap-x-3 gap-y-1.5">
            <div className="min-w-0">
              <Field
                label="자산 USDT"
                value={equity}
                step="10"
                onChange={(v) => {
                  setLinkWallet(false);
                  setEquity(v);
                }}
                hint={
                  Number(equity) > 0 ? won(Number(equity), fx) : "금액을 입력하세요"
                }
              />
              <button
                type="button"
                disabled={!wallet || walletLoading || !(wallet.totalEquity > 0)}
                onClick={() => {
                  if (!wallet || !(wallet.totalEquity > 0)) return;
                  setEquity(wallet.totalEquity.toFixed(2));
                  setLinkWallet(true);
                }}
                className={`mt-1.5 rounded-md border px-2.5 py-1 text-[11px] transition disabled:opacity-40 ${
                  linkWallet
                    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                    : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {walletLoading
                  ? "지갑 불러오는 중…"
                  : linkWallet
                    ? "지갑 연동 중"
                    : "현재 지갑 연동"}
              </button>
            </div>
            <div className="min-w-0">
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
              <Chips
                values={["1", "2", "3", "4", "5"]}
                current={riskPct}
                onPick={setRiskPct}
                suffix="%"
              />
            </div>
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
                setCustomQuote({ entry: v, stop, qtyUnit });
              }}
              placeholder="진입가"
            />
            <Field
              label="손절가"
              value={stop}
              step="any"
              onChange={(v) => {
                setStop(v);
                setCoin("");
                setCustomQuote({ entry, stop: v, qtyUnit });
              }}
              placeholder="여기까지"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-[11px] text-zinc-500">
              수량 단위
              {Number(qtyUnit) > 0
                ? ` · ${qtyUnit}개씩`
                : " · 단위 없음"}
            </p>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setQtyUnit("");
                  if (!COIN_STEP[coin]) {
                    setCustomQuote({ entry, stop, qtyUnit: "" });
                  }
                }}
                className={`rounded px-2 py-0.5 text-[11px] transition ${
                  !(Number(qtyUnit) > 0)
                    ? "bg-zinc-200 text-zinc-900"
                    : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                없음
              </button>
              {QTY_UNIT_PRESETS.map((unit) => (
                <button
                  key={unit}
                  type="button"
                  onClick={() => {
                    setQtyUnit(unit);
                    if (!COIN_STEP[coin]) {
                      setCustomQuote({ entry, stop, qtyUnit: unit });
                    }
                  }}
                  className={`rounded px-2 py-0.5 text-[11px] tabular-nums transition ${
                    Number(qtyUnit) === Number(unit)
                      ? "bg-zinc-200 text-zinc-900"
                      : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {unit}
                </button>
              ))}
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={qtyUnit}
                placeholder="직접"
                onChange={(e) => {
                  const v = e.target.value;
                  setQtyUnit(v);
                  if (!COIN_STEP[coin]) {
                    setCustomQuote({ entry, stop, qtyUnit: v });
                  }
                }}
                className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] tabular-nums text-zinc-100 outline-none focus:border-sky-500/50"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {COIN_SHORTCUTS.map(([symbol, label, unit]) => {
              const px = tickers.find((t) => t.symbol === symbol)?.lastPrice;
              const on = coin === unit && px != null && Number(entry) === Number(px.toFixed(2));
              return (
                <button
                  key={symbol}
                  type="button"
                  disabled={!(px && px > 0)}
                  onClick={() => {
                    if (!(px && px > 0)) return;
                    pickShortcut(unit, px);
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
            <button
              type="button"
              disabled={!customQuote}
              onClick={restoreCustom}
              className={`rounded-md border px-2.5 py-1 text-[11px] tabular-nums transition disabled:opacity-40 ${
                !COIN_STEP[coin]
                  ? "border-sky-500/50 bg-sky-500/15 text-sky-200"
                  : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              기타
              {customQuote?.entry ? ` ${customQuote.entry}` : ""}
            </button>
            <SymbolSearch onPick={pickTicker} flow={embedded} />
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
              <div
                className={`rounded-xl border p-4 ${
                  side === "long"
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-rose-500/40 bg-rose-500/10"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium text-zinc-400">
                      {coin || "기타"} 살 수량
                    </p>
                    <p className="mt-1 text-3xl font-semibold tabular-nums text-zinc-50">
                      {result.wrongSide
                        ? "—"
                        : result.belowMin
                          ? "최소 수량 미달"
                          : `${qtyFmt(result.qty, result.qtyStep)}개`}
                    </p>
                  </div>
                  <p
                    className={`rounded-lg px-3 py-2 text-2xl font-bold leading-none ${
                      side === "long"
                        ? "bg-emerald-500 text-zinc-950"
                        : "bg-rose-500 text-white"
                    }`}
                  >
                    {side === "long" ? "롱" : "숏"}
                  </p>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {result.wrongSide
                    ? side === "long"
                      ? "롱이면 손절가는 현재가보다 아래여야 합니다."
                      : "숏이면 손절가는 현재가보다 위여야 합니다."
                    : result.belowMin
                      ? `계산 ${qtyFmt(result.rawQty)}개는 ${qtyFmt(result.qtyStep, result.qtyStep)}개 단위보다 작아서 주문할 수 없습니다.`
                      : result.lotApplied &&
                          result.rawQty - result.qty > result.qtyStep * 1e-8
                        ? `계산 ${qtyFmt(result.rawQty)}개를 ${qtyFmt(result.qtyStep, result.qtyStep)}개 단위로 내려 ${qtyFmt(result.qty, result.qtyStep)}개 · 손절 시 −$${money(result.netLoss)} · ${won(result.netLoss, fx)}`
                        : `손절까지 가면 −$${money(result.netLoss)} · ${won(result.netLoss, fx)} · 증거금 ${won(result.margin, fx)} (${result.betPct.toFixed(1)}%)`}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
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

              <div className="grid grid-cols-4 gap-2">
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
