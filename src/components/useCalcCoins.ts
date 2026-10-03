"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { MarketTicker } from "@/lib/exchanges/market";
import { COIN_SHORTCUTS, COIN_STEP } from "./risk-calc";

export type CalcCoin = {
  symbol: string;
  label: string;
  unit: string;
  qtyUnit: string;
};

const KEY = "dailytrading.calcoins.v1";
const MAX_COINS = 24;

const LABELS: Record<string, string> = {
  BTC: "비트",
  ETH: "이더",
  XRP: "리플",
};

type Book = {
  coins: CalcCoin[];
  prices: Record<string, number>;
  refreshing: boolean;
  ready: boolean;
  error: string;
};

const SERVER: Book = {
  coins: [],
  prices: {},
  refreshing: false,
  ready: false,
  error: "",
};

let state: Book = SERVER;
const listeners = new Set<() => void>();
let hydrated = false;
let fetchGen = 0;
let flight: { key: string; promise: Promise<Record<string, number>> } | null =
  null;

function emit() {
  for (const listener of listeners) listener();
}

function defaultCoins(): CalcCoin[] {
  return COIN_SHORTCUTS.map(([symbol, label, unit]) => ({
    symbol,
    label,
    unit,
    qtyUnit: COIN_STEP[unit] ?? "",
  }));
}

const DEFAULT_SYMBOLS = new Set(defaultCoins().map((coin) => coin.symbol));
const DROPPED_SYMBOLS = new Set(["SOXLUSDT", "KORUUSDT"]);

export function isPinnedCalcCoin(symbol: string): boolean {
  return DEFAULT_SYMBOLS.has(symbol.toUpperCase());
}

function withDefaults(coins: CalcCoin[]): CalcCoin[] {
  const bySymbol = new Map(coins.map((coin) => [coin.symbol, coin]));
  const base = defaultCoins().map((coin) => bySymbol.get(coin.symbol) ?? coin);
  const extras = coins.filter(
    (coin) => !DEFAULT_SYMBOLS.has(coin.symbol) && !DROPPED_SYMBOLS.has(coin.symbol)
  );
  return [...base, ...extras].slice(0, MAX_COINS);
}

function parseCoins(raw: string): CalcCoin[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return defaultCoins();
  const coins: CalcCoin[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== "object") continue;
    const item = row as Partial<CalcCoin>;
    const symbol = String(item.symbol ?? "").toUpperCase();
    const unit = String(item.unit ?? "").replace(/USDT$/i, "");
    if (!symbol.endsWith("USDT") || !unit || DROPPED_SYMBOLS.has(symbol)) continue;
    coins.push({
      symbol,
      label: String(item.label || LABELS[unit] || unit),
      unit,
      qtyUnit: String(item.qtyUnit ?? COIN_STEP[unit] ?? ""),
    });
  }
  return coins.slice(0, MAX_COINS);
}

function persist() {
  if (!state.ready || typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state.coins));
  } catch {
    /* ignore */
  }
}

function applySaved(raw: string) {
  state = { ...state, coins: withDefaults(parseCoins(raw)), ready: true, error: "" };
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) {
      state = { ...state, coins: defaultCoins(), ready: true };
      persist();
    } else {
      applySaved(raw);
      persist();
    }
  } catch {
    state = { ...state, coins: defaultCoins(), ready: true };
  }
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

export function getCalcCoinSnapshot() {
  return state;
}

function coinFromTicker(ticker: MarketTicker): CalcCoin {
  const unit = ticker.symbol.replace(/USDT$/i, "");
  const qtyUnit =
    ticker.qtyStep && ticker.qtyStep > 0
      ? String(ticker.qtyStep)
      : (COIN_STEP[unit] ?? "");
  return {
    symbol: ticker.symbol.toUpperCase(),
    label: LABELS[unit] ?? unit,
    unit,
    qtyUnit,
  };
}

export function upsertCalcCoin(ticker: MarketTicker): CalcCoin | null {
  hydrate();
  const next = coinFromTicker(ticker);
  const idx = state.coins.findIndex((c) => c.symbol === next.symbol);
  if (idx < 0 && state.coins.length >= MAX_COINS) {
    state = { ...state, error: "코인은 24개까지 넣을 수 있습니다" };
    emit();
    return null;
  }
  const coins = state.coins.slice();
  if (idx >= 0) {
    const prev = coins[idx];
    coins[idx] = {
      ...prev,
      qtyUnit: next.qtyUnit || prev.qtyUnit,
    };
  } else {
    coins.push(next);
  }
  const prices = { ...state.prices };
  if (ticker.lastPrice > 0) prices[next.symbol] = ticker.lastPrice;
  state = { ...state, coins, prices, ready: true, error: "" };
  persist();
  emit();
  return coins[idx >= 0 ? idx : coins.length - 1];
}

export function removeCalcCoin(symbol: string) {
  hydrate();
  if (isPinnedCalcCoin(symbol)) return;
  state = {
    ...state,
    coins: state.coins.filter((c) => c.symbol !== symbol),
    ready: true,
    error: "",
  };
  persist();
  emit();
}

export function loadCalcCoinPrices(): Promise<Record<string, number>> {
  const key = state.coins.map((c) => c.symbol).join(",");
  if (flight?.key === key) return flight.promise;
  const id = ++fetchGen;
  const promise = (async () => {
    if (!key) {
      if (id !== fetchGen) return getSnapshot().prices;
      state = { ...state, prices: {}, refreshing: false, error: "" };
      emit();
      return state.prices;
    }
    state = { ...state, refreshing: true, error: "" };
    emit();
    try {
      const res = await fetch(
        `/api/market?symbols=${encodeURIComponent(key)}`
      );
      const data = (await res.json()) as {
        tickers?: MarketTicker[];
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      if (id !== fetchGen) return getSnapshot().prices;
      const prices = { ...state.prices };
      const coins = state.coins.slice();
      for (const ticker of data.tickers ?? []) {
        const symbol = ticker.symbol.toUpperCase();
        if (ticker.lastPrice > 0) prices[symbol] = ticker.lastPrice;
        const step =
          ticker.qtyStep && ticker.qtyStep > 0 ? String(ticker.qtyStep) : "";
        const at = coins.findIndex((c) => c.symbol === symbol);
        if (at >= 0 && step && coins[at].qtyUnit !== step) {
          coins[at] = { ...coins[at], qtyUnit: step };
        }
      }
      state = { ...state, coins, prices, refreshing: false, error: "" };
      persist();
      emit();
      return prices;
    } catch {
      if (id !== fetchGen) return getSnapshot().prices;
      state = {
        ...state,
        refreshing: false,
        error: "시세를 불러오지 못했습니다",
      };
      emit();
      return state.prices;
    }
  })();
  flight = { key, promise };
  void promise.finally(() => {
    if (flight?.promise === promise) flight = null;
  });
  return promise;
}

export function useCalcCoins() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const symbolKey = snap.coins.map((c) => c.symbol).join(",");

  useEffect(() => {
    hydrate();
    function onStorage(event: StorageEvent) {
      if (event.key !== KEY || event.newValue == null) return;
      try {
        applySaved(event.newValue);
        emit();
        void loadCalcCoinPrices();
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!snap.ready) return;
    void loadCalcCoinPrices();
  }, [snap.ready, symbolKey]);

  return snap;
}
