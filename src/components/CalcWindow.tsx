"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { MarketTicker } from "@/lib/exchanges/market";
import type { WalletOverview } from "@/lib/exchanges/wallet";
import { loadGoalChallenge } from "@/lib/prefs";
import {
  calcFolded,
  calcWindowSize,
  openPlainCalc,
  pipWindow,
  resizeCalcWindow,
  saveCalcFolded,
  saveCalcPinned,
} from "./calc-host";
import { RiskCalculatorPanel } from "./RiskCalculatorPanel";
import { money, priceFmt, qtyFmt, ratioLabel } from "./risk-calc";
import { useRiskCalc } from "./useRiskCalc";

export function CalcWindow() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [fx, setFx] = useState(1350);
  const [folded, setFolded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [note, setNote] = useState("");
  const [scale, setScale] = useState(1);
  const [wallet, setWallet] = useState<WalletOverview | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [tickers, setTickers] = useState<MarketTicker[]>([]);
  const calc = useRiskCalc(wallet);

  useEffect(() => {
    const rate = loadGoalChallenge().fxRate;
    if (rate > 0) setFx(rate);
    const nextFolded = calcFolded();
    setFolded(nextFolded);
    const node = rootRef.current;
    const doc = node?.ownerDocument;
    if (doc && (doc !== document || window.location.pathname === "/calc")) {
      doc.documentElement.style.removeProperty("background-color");
      doc.body.style.removeProperty("background-color");
      doc.body.style.opacity = "1";
    }
    try {
      localStorage.removeItem("dailytrading.calcopacity");
    } catch {
      /* ignore */
    }
    const pip = pipWindow();
    setPinned(!!(node && pip && pip.document.contains(node)));
    resizeCalcWindow(nextFolded);
  }, []);

  useEffect(() => {
    const view = rootRef.current?.ownerDocument.defaultView;
    if (!view) return;
    const apply = () => {
      const width = view.document.documentElement.clientWidth || view.innerWidth;
      const design = calcWindowSize(folded).width;
      if (width <= 0 || design <= 0) return;
      setScale(Math.min(1, width / design));
    };
    apply();
    view.addEventListener("resize", apply);
    return () => view.removeEventListener("resize", apply);
  }, [folded]);

  useEffect(() => {
    let cancel = false;
    void fetch("/api/wallet")
      .then(async (res) => (await res.json()) as WalletOverview & { error?: string })
      .then((data) => {
        if (cancel || data.error) return;
        setWallet({
          accounts: data.accounts ?? [],
          wallet: data.wallet ?? null,
          positions: data.positions ?? [],
          totalEquity: data.totalEquity ?? 0,
          totalWalletBalance: data.totalWalletBalance ?? 0,
          totalAvailableBalance: data.totalAvailableBalance ?? 0,
          totalPerpUPL: data.totalPerpUPL ?? 0,
        });
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancel) setWalletLoading(false);
      });
    void fetch("/api/market")
      .then(async (res) => (await res.json()) as { tickers?: MarketTicker[] })
      .then((data) => {
        if (!cancel) setTickers(data.tickers ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  function toggleFold() {
    const next = !folded;
    setFolded(next);
    saveCalcFolded(next);
    resizeCalcWindow(next);
  }

  function togglePin(event: MouseEvent<HTMLButtonElement>) {
    const next = !pinned;
    saveCalcPinned(next);
    setPinned(next);
    setNote("");
    const node = rootRef.current;
    const pip = pipWindow();
    const insidePip = !!(node && pip && pip.document.contains(node));

    if (!next) {
      if (!insidePip) return;
      const view = event.nativeEvent.view ?? window;
      openPlainCalc(view);
      pip.close();
      return;
    }

    if (insidePip) return;
    const opener = window.opener as
      | (Window & { __dtOpenCalcPip?: () => Promise<boolean> })
      | null;
    if (opener && !opener.closed && opener.__dtOpenCalcPip) {
      void opener.__dtOpenCalcPip().then((ok) => {
        if (ok) {
          window.close();
          return;
        }
        setPinned(false);
        setNote("이 창에서는 고정이 막혀 있습니다. 대시보드의 계산을 눌러 주세요.");
      });
      return;
    }
    setPinned(false);
    setNote("맨 위 고정은 크롬·엣지의 작은 창에서 됩니다. 대시보드의 계산을 눌러 주세요.");
  }

  const { result } = calc;
  const qtyText =
    !result || result.wrongSide
      ? "—"
      : result.belowMin
        ? "미달"
        : `${qtyFmt(result.qty, result.qtyStep)}개`;
  const needLeverage =
    result &&
    !result.wrongSide &&
    !result.belowMin &&
    Number(calc.equity) > 0 &&
    result.margin > Number(calc.equity)
      ? Math.ceil(result.notional / Number(calc.equity))
      : null;
  const pricesOk =
    !!result && !result.wrongSide && !result.tpInvalid && !result.belowMin;

  const designW = calcWindowSize(folded).width;

  return (
    <div ref={rootRef} className="h-dvh overflow-x-hidden overflow-y-auto bg-zinc-950 text-zinc-100">
      <div style={{ width: designW, zoom: scale }}>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-950 px-2 py-1.5">
        <button
          type="button"
          aria-pressed={pinned}
          onClick={togglePin}
          title={pinned ? "맨 위 고정 해제" : "맨 위에 고정"}
          className={`shrink-0 rounded-md border px-2 py-1 text-[11px] ${
            pinned
              ? "border-sky-500/50 bg-sky-500/15 text-sky-100"
              : "border-zinc-700 text-zinc-400 hover:text-zinc-100"
          }`}
        >
          {pinned ? "고정됨" : "맨 위"}
        </button>
        <button
          type="button"
          onClick={toggleFold}
          className="shrink-0 rounded px-1.5 py-1 text-[11px] text-zinc-400 hover:text-zinc-100"
        >
          {folded ? "펼치기" : "접기"}
        </button>
      </header>
      {note && (
        <p className="shrink-0 px-2 py-1 text-[10px] leading-snug text-amber-200/90">
          {note}
        </p>
      )}
      {folded ? (
        <div className="flex flex-col gap-2 px-2 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-[10px] text-zinc-500">
              <span className="w-9 shrink-0">현재가</span>
              <input
                type="number"
                inputMode="decimal"
                value={calc.entry}
                onChange={(e) => {
                  const value = e.target.value;
                  calc.setEntry(value);
                  calc.setCoin("");
                  calc.setCustomQuote({
                    entry: value,
                    stop: calc.stop,
                    qtyUnit: calc.qtyUnit,
                  });
                }}
                className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm tabular-nums text-zinc-50 outline-none focus:border-sky-500/60"
              />
            </label>
            <label className="flex items-center gap-2 text-[10px] text-zinc-500">
              <span className="w-9 shrink-0">손절가</span>
              <input
                type="number"
                inputMode="decimal"
                value={calc.stop}
                onChange={(e) => {
                  const value = e.target.value;
                  calc.setStop(value);
                  calc.setCoin("");
                  calc.setCustomQuote({
                    entry: calc.entry,
                    stop: value,
                    qtyUnit: calc.qtyUnit,
                  });
                }}
                className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm tabular-nums text-zinc-50 outline-none focus:border-sky-500/60"
              />
            </label>
          </div>
          <div className="flex flex-col gap-1.5">
            <div
              className={`flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 ${
                calc.side === "long"
                  ? "border-emerald-500/35 bg-emerald-500/10"
                  : "border-rose-500/35 bg-rose-500/10"
              }`}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                {result && (
                  <p
                    className={`rounded px-1.5 py-1 text-[11px] font-bold leading-none ${
                      calc.side === "long"
                        ? "bg-emerald-500 text-zinc-950"
                        : "bg-rose-500 text-white"
                    }`}
                  >
                    {calc.side === "long" ? "롱" : "숏"}
                  </p>
                )}
                <p
                  className={`truncate text-sm font-semibold leading-none tabular-nums ${
                    calc.side === "long" ? "text-emerald-200" : "text-rose-200"
                  }`}
                >
                  {qtyText}
                </p>
              </div>
              {needLeverage != null && (
                <p className="shrink-0 text-[10px] leading-none text-rose-300">
                  {needLeverage}배
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-1 rounded-lg border border-rose-500/25 bg-rose-500/10 px-2 py-1.5">
              <p className="shrink-0 text-[10px] text-rose-300/80">손절</p>
              <p className="min-w-0 truncate text-xs font-semibold tabular-nums text-rose-100">
                {pricesOk && result ? priceFmt(result.stopPrice) : "—"}
              </p>
              <p className="shrink-0 text-[10px] tabular-nums text-rose-300">
                {pricesOk && result ? `−$${money(result.netLoss)}` : ""}
              </p>
            </div>
            <div className="flex items-center justify-between gap-1 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-1.5">
              <p className="shrink-0 text-[10px] text-emerald-300/80">
                익절{pricesOk ? ` ${ratioLabel(Number(calc.rewardR))}` : ""}
              </p>
              <p className="min-w-0 truncate text-xs font-semibold tabular-nums text-emerald-100">
                {pricesOk && result ? priceFmt(result.tpPrice) : "—"}
              </p>
              <p className="shrink-0 text-[10px] tabular-nums text-emerald-300">
                {pricesOk && result && result.netProfit > 0
                  ? `+$${money(result.netProfit)}`
                  : ""}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-3 py-3">
          <RiskCalculatorPanel
            embedded
            wallet={wallet}
            walletLoading={walletLoading}
            fxRate={fx}
            tickers={tickers}
          />
        </div>
      )}
      </div>
    </div>
  );
}
