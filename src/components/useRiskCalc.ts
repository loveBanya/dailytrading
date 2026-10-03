"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { WalletOverview } from "@/lib/exchanges/wallet";
import { followedEquity } from "@/lib/wallet-follow";
import type { MarketTicker } from "@/lib/exchanges/market";
import {
  computeRisk,
  COIN_STEP,
  linkedStop,
  linkedTp,
  priceInput,
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
    useTp: state.useTp,
    tp: state.tp,
    priceAnchor: state.priceAnchor,
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
  if (saved.tp != null) next.tp = String(saved.tp);
  if (saved.useTp === "0" || saved.useTp === "1") next.useTp = saved.useTp;
  if (saved.priceAnchor === "stop" || saved.priceAnchor === "tp") {
    next.priceAnchor = saved.priceAnchor;
  }
  state = withSide(next);
}

function linkedPartial(cur: State, entry: string): Partial<State> {
  if (cur.useTp !== "1") return {};
  const px = Number(entry);
  const reward = Number(cur.rewardR);
  if (!(px > 0) || !(reward > 0)) return {};
  if (cur.priceAnchor === "tp") {
    const stop = linkedStop(px, Number(cur.tp), reward);
    return stop == null ? {} : { stop: priceInput(stop) };
  }
  const tp = linkedTp(px, Number(cur.stop), reward);
  return tp == null ? {} : { tp: priceInput(tp) };
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

export function useRiskCalc(
  wallet?: WalletOverview | null,
  walletFollow?: string
): State & {
  result: RiskResult | null;
  setEquity: (v: string) => void;
  setRiskPct: (v: string) => void;
  setEntry: (v: string) => void;
  setStop: (v: string) => void;
  setTp: (v: string) => void;
  setUseTp: (on: boolean) => void;
  convertStopToTp: () => void;
  revertTpToStop: () => void;
  setLeverage: (v: string) => void;
  setFeePct: (v: string) => void;
  setRewardR: (v: string) => void;
  setCoin: (v: string) => void;
  setQtyUnit: (v: string) => void;
  setCustomQuote: (v: CustomQuote | null) => void;
  setLinkWallet: (v: boolean) => void;
  pickTicker: (ticker: MarketTicker) => void;
  pickShortcut: (unit: string, price: number) => void;
  applyListedCoin: (unit: string, price: number, qtyUnit: string) => void;
  refreshEntry: (price: number) => void;
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
    if (!snap.linkWallet || !wallet) return;
    const amount = followedEquity(wallet, walletFollow);
    if (!(amount > 0)) return;
    const next = amount.toFixed(2);
    if (getSnapshot().equity === next) return;
    patch({ equity: next });
  }, [snap.linkWallet, wallet, walletFollow]);

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
    setEntry: (v) => {
      const cur = getSnapshot();
      const linked = linkedPartial(cur, v);
      patch({
        entry: v,
        ...linked,
        coin: "",
        customQuote: {
          entry: v,
          stop: linked.stop ?? cur.stop,
          qtyUnit: cur.qtyUnit,
        },
      });
    },
    setStop: (v) => {
      const cur = getSnapshot();
      const partial: Partial<State> = {
        stop: v,
        coin: "",
        customQuote: { entry: cur.entry, stop: v, qtyUnit: cur.qtyUnit },
      };
      if (cur.useTp === "1") {
        const tp = linkedTp(Number(cur.entry), Number(v), Number(cur.rewardR));
        if (tp != null) {
          partial.tp = priceInput(tp);
          partial.priceAnchor = "stop";
        }
      }
      patch(partial);
    },
    setTp: (v) => {
      const cur = getSnapshot();
      const partial: Partial<State> = { tp: v, useTp: "1" };
      const stop = linkedStop(Number(cur.entry), Number(v), Number(cur.rewardR));
      if (stop != null) {
        partial.stop = priceInput(stop);
        partial.priceAnchor = "tp";
        if (!cur.coin) {
          partial.customQuote = {
            entry: cur.entry,
            stop: partial.stop,
            qtyUnit: cur.qtyUnit,
          };
        }
      }
      patch(partial);
    },
    setUseTp: (on) => {
      const cur = getSnapshot();
      if (!on) {
        patch({ useTp: "0" });
        return;
      }
      const tp = linkedTp(Number(cur.entry), Number(cur.stop), Number(cur.rewardR));
      patch({
        useTp: "1",
        priceAnchor: "stop",
        ...(tp != null ? { tp: priceInput(tp) } : {}),
      });
    },
    convertStopToTp: () => {
      const cur = getSnapshot();
      const stop = linkedStop(Number(cur.entry), Number(cur.stop), Number(cur.rewardR));
      if (stop == null) return;
      const nextStop = priceInput(stop);
      patch({
        tp: cur.stop,
        useTp: "1",
        stop: nextStop,
        priceAnchor: "tp",
        ...(!cur.coin
          ? {
              customQuote: {
                entry: cur.entry,
                stop: nextStop,
                qtyUnit: cur.qtyUnit,
              },
            }
          : {}),
      });
    },
    revertTpToStop: () => {
      const cur = getSnapshot();
      const stop = Number(cur.tp) > 0 ? cur.tp : cur.stop;
      patch({
        stop,
        useTp: "0",
        priceAnchor: "stop",
        ...(!cur.coin
          ? {
              customQuote: { entry: cur.entry, stop, qtyUnit: cur.qtyUnit },
            }
          : {}),
      });
    },
    setLeverage: (v) => patch({ leverage: v }),
    setFeePct: (v) => patch({ feePct: v }),
    setRewardR: (v) => {
      const cur = getSnapshot();
      patch({
        rewardR: v,
        ...linkedPartial({ ...cur, rewardR: v }, cur.entry),
      });
    },
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
        ...linkedPartial(cur, next.entry),
        ...(!sameCoin && next.customQuote ? { customQuote: next.customQuote } : {}),
      });
    },
    pickShortcut: (unit, price) => {
      const cur = getSnapshot();
      const customQuote = !COIN_STEP[cur.coin]
        ? { entry: cur.entry, stop: cur.stop, qtyUnit: cur.qtyUnit }
        : cur.customQuote;
      const entry = priceInput(price);
      patch({
        entry,
        coin: unit,
        qtyUnit: COIN_STEP[unit] ?? "",
        customQuote,
        ...linkedPartial(cur, entry),
      });
    },
    applyListedCoin: (unit, price, qtyUnit) => {
      if (!(price > 0) || !unit) return;
      const cur = getSnapshot();
      const customQuote = cur.coin
        ? cur.customQuote
        : { entry: cur.entry, stop: cur.stop, qtyUnit: cur.qtyUnit };
      const entry = priceInput(price);
      patch({
        entry,
        coin: unit,
        qtyUnit: qtyUnit || COIN_STEP[unit] || cur.qtyUnit,
        customQuote,
        ...linkedPartial(cur, entry),
      });
    },
    refreshEntry: (price) => {
      const cur = getSnapshot();
      if (!(price > 0) || !cur.coin) return;
      const entry = priceInput(price);
      patch({ entry, ...linkedPartial(cur, entry) });
    },
    restoreCustom: () => {
      const cur = getSnapshot();
      if (!cur.customQuote) return;
      const entry = cur.customQuote.entry;
      const stop = cur.customQuote.stop;
      patch({
        entry,
        stop,
        qtyUnit: cur.customQuote.qtyUnit,
        coin: "",
        ...(cur.useTp === "1" ? { priceAnchor: "stop" as const } : {}),
        ...linkedPartial(
          { ...cur, stop, priceAnchor: "stop" },
          entry
        ),
      });
    },
  };
}
