"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { WalletOverview } from "@/lib/exchanges/wallet";
import type { MarketTicker } from "@/lib/exchanges/market";
import {
  computeRisk,
  COIN_STEP,
  quoteFromTicker,
  RISK_DEFAULTS,
  RISK_STORAGE_KEY,
  type CustomQuote,
  type RiskResult,
  type SavedInputs,
  type Side,
} from "./risk-calc";

type State = SavedInputs & {
  customQuote: CustomQuote | null;
  linkWallet: boolean;
  ready: boolean;
};

const SERVER: State = {
  ...RISK_DEFAULTS,
  customQuote: null,
  linkWallet: false,
  ready: false,
};

let state: State = SERVER;
const listeners = new Set<() => void>();
let hydrated = false;

function emit() {
  for (const listener of listeners) listener();
}

function withSide(next: State): State {
  const px = Number(next.entry);
  const stopPx = Number(next.stop);
  if (!(px > 0) || !(stopPx > 0) || stopPx === px) return next;
  const side: Side = stopPx < px ? "long" : "short";
  if (side === next.side) return next;
  return { ...next, side };
}

function persist() {
  if (!state.ready || typeof window === "undefined") return;
  const payload: SavedInputs = {
    equity: state.equity,
    riskPct: state.riskPct,
    entry: state.entry,
    stop: state.stop,
    leverage: state.leverage,
    feePct: state.feePct,
    rewardR: state.rewardR,
    side: state.side,
    coin: state.coin,
    qtyUnit: state.qtyUnit,
    customEntry: state.customQuote?.entry ?? "",
    customStop: state.customQuote?.stop ?? "",
    customQtyUnit: state.customQuote?.qtyUnit ?? "",
  };
  try {
    localStorage.setItem(RISK_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function patch(partial: Partial<State>) {
  state = withSide({ ...state, ...partial });
  persist();
  emit();
}

function applySaved(raw: string) {
  const saved = JSON.parse(raw) as Partial<SavedInputs>;
  const next: State = { ...state, ready: true };
  if (saved.equity) next.equity = String(saved.equity);
  if (saved.riskPct && String(saved.riskPct) !== "1") {
    next.riskPct = String(saved.riskPct);
  }
  if (saved.entry != null) next.entry = String(saved.entry);
  if (saved.stop != null) next.stop = String(saved.stop);
  if (saved.leverage) next.leverage = String(saved.leverage);
  if (saved.feePct) next.feePct = String(saved.feePct);
  if (saved.rewardR) next.rewardR = String(saved.rewardR);
  if (saved.side === "long" || saved.side === "short") next.side = saved.side;
  if (saved.coin != null) next.coin = String(saved.coin);
  if (saved.qtyUnit != null) {
    next.qtyUnit = String(saved.qtyUnit);
  } else if (saved.coin && COIN_STEP[String(saved.coin)]) {
    next.qtyUnit = COIN_STEP[String(saved.coin)];
  }
  if (
    saved.customEntry != null ||
    saved.customStop != null ||
    saved.customQtyUnit != null
  ) {
    next.customQuote = {
      entry: String(saved.customEntry ?? ""),
      stop: String(saved.customStop ?? ""),
      qtyUnit: String(saved.customQtyUnit ?? ""),
    };
  } else if (!saved.coin || !COIN_STEP[String(saved.coin)]) {
    next.customQuote = {
      entry: String(saved.entry ?? ""),
      stop: String(saved.stop ?? ""),
      qtyUnit: String(saved.qtyUnit ?? ""),
    };
  }
  state = withSide(next);
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(RISK_STORAGE_KEY);
    if (raw) applySaved(raw);
    else state = { ...state, ready: true };
  } catch {
    state = { ...state, ready: true };
  }
  persist();
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

function getServerSnapshot() {
  return SERVER;
}

export function useRiskCalc(wallet?: WalletOverview | null): State & {
  result: RiskResult | null;
  setEquity: (v: string) => void;
  setRiskPct: (v: string) => void;
  setEntry: (v: string) => void;
  setStop: (v: string) => void;
  setLeverage: (v: string) => void;
  setFeePct: (v: string) => void;
  setRewardR: (v: string) => void;
  setCoin: (v: string) => void;
  setQtyUnit: (v: string) => void;
  setCustomQuote: (v: CustomQuote | null) => void;
  setLinkWallet: (v: boolean) => void;
  pickTicker: (ticker: MarketTicker) => void;
  pickShortcut: (unit: string, price: number) => void;
  restoreCustom: () => void;
} {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    hydrate();
    function onStorage(event: StorageEvent) {
      if (event.key !== RISK_STORAGE_KEY || event.newValue == null) return;
      try {
        applySaved(event.newValue);
        emit();
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!snap.linkWallet || !wallet || !(wallet.totalEquity > 0)) return;
    const next = wallet.totalEquity.toFixed(2);
    if (getSnapshot().equity === next) return;
    patch({ equity: next });
  }, [snap.linkWallet, wallet]);

  const result = useMemo(
    () =>
      computeRisk({
        equity: snap.equity,
        riskPct: snap.riskPct,
        entry: snap.entry,
        stop: snap.stop,
        leverage: snap.leverage,
        feePct: snap.feePct,
        rewardR: snap.rewardR,
        side: snap.side,
        qtyUnit: snap.qtyUnit,
      }),
    [snap]
  );

  return {
    ...snap,
    result,
    setEquity: (v) => patch({ equity: v, linkWallet: false }),
    setRiskPct: (v) => patch({ riskPct: v }),
    setEntry: (v) => patch({ entry: v }),
    setStop: (v) => patch({ stop: v }),
    setLeverage: (v) => patch({ leverage: v }),
    setFeePct: (v) => patch({ feePct: v }),
    setRewardR: (v) => patch({ rewardR: v }),
    setCoin: (v) => patch({ coin: v }),
    setQtyUnit: (v) => patch({ qtyUnit: v }),
    setCustomQuote: (v) => patch({ customQuote: v }),
    setLinkWallet: (v) => patch({ linkWallet: v }),
    pickTicker: (ticker) => {
      if (!(ticker.lastPrice > 0)) return;
      const cur = getSnapshot();
      const next = quoteFromTicker(cur, ticker);
      const sameCoin = cur.coin === next.coin;
      patch({
        entry: next.entry,
        coin: next.coin,
        qtyUnit: next.qtyUnit,
        ...(!sameCoin && next.customQuote ? { customQuote: next.customQuote } : {}),
      });
    },
    pickShortcut: (unit, price) => {
      const cur = getSnapshot();
      const customQuote = !COIN_STEP[cur.coin]
        ? { entry: cur.entry, stop: cur.stop, qtyUnit: cur.qtyUnit }
        : cur.customQuote;
      patch({
        entry: price.toFixed(2),
        coin: unit,
        qtyUnit: COIN_STEP[unit] ?? "",
        customQuote,
      });
    },
    restoreCustom: () => {
      const cur = getSnapshot();
      if (!cur.customQuote) return;
      patch({
        entry: cur.customQuote.entry,
        stop: cur.customQuote.stop,
        qtyUnit: cur.customQuote.qtyUnit,
        coin: "",
      });
    },
  };
}
