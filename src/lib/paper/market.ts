import { getAdapter } from "@/lib/screener/scan";
import type { ScreenerExchange } from "@/lib/screener/types";
import { ema, rsi } from "@/lib/backtest/indicators";
import { macd } from "@/lib/screener/indicators";
import type { IndicatorRule, IndicatorStrategyConfig } from "./types";

export type PaperInterval = "5m" | "15m" | "1h" | "4h";

export async function fetchCloses(
  exchange: ScreenerExchange,
  symbol: string,
  interval: PaperInterval,
  limit = 120
): Promise<{ closes: number[]; last: number; bars: number }> {
  const adapter = getAdapter(exchange);
  const kl = await adapter.fetchKlines(symbol, interval, limit);
  const closes = kl.map((k) => k.close).filter((n) => Number.isFinite(n));
  const last = closes[closes.length - 1];
  if (last == null || !(last > 0)) {
    throw new Error(`${exchange} ${symbol} 시세를 가져오지 못했습니다`);
  }
  return { closes, last, bars: closes.length };
}

export async function fetchMarkPrice(
  exchange: ScreenerExchange,
  symbol: string
): Promise<number> {
  const { last } = await fetchCloses(exchange, symbol, "5m", 5);
  return last;
}

/** HL 코인명 → 바이낸스 선물 심볼 추정 (BTC → BTCUSDT) */
export function hlCoinToBinanceSymbol(coin: string): string {
  const c = coin.trim().toUpperCase();
  if (c.endsWith("USDT")) return c;
  return `${c}USDT`;
}

export type IndicatorSignal = "LONG" | "SHORT" | "FLAT" | "HOLD";

export function evaluateIndicatorSignal(
  closes: number[],
  cfg: IndicatorStrategyConfig
): { signal: IndicatorSignal; detail: string } {
  const rule: IndicatorRule = cfg.rule ?? "ema_cross";
  if (closes.length < 30) {
    return { signal: "HOLD", detail: "봉 부족" };
  }

  if (rule === "ema_cross") {
    const fastN = cfg.emaFast ?? 9;
    const slowN = cfg.emaSlow ?? 21;
    const fast = ema(closes, fastN);
    const slow = ema(closes, slowN);
    const i = closes.length - 1;
    const p = closes.length - 2;
    const f0 = fast[i];
    const s0 = slow[i];
    const f1 = fast[p];
    const s1 = slow[p];
    if (f0 == null || s0 == null || f1 == null || s1 == null) {
      return { signal: "HOLD", detail: "EMA 미준비" };
    }
    if (f1 <= s1 && f0 > s0) {
      return { signal: "LONG", detail: `EMA${fastN}↑EMA${slowN}` };
    }
    if (f1 >= s1 && f0 < s0) {
      return { signal: "SHORT", detail: `EMA${fastN}↓EMA${slowN}` };
    }
    if (f0 > s0) return { signal: "HOLD", detail: "EMA 롱 유지" };
    if (f0 < s0) return { signal: "HOLD", detail: "EMA 숏 유지" };
    return { signal: "FLAT", detail: "EMA 중립" };
  }

  if (rule === "rsi_reclaim") {
    const len = cfg.rsiLength ?? 14;
    const buyBelow = cfg.rsiBuyBelow ?? 35;
    const sellAbove = cfg.rsiSellAbove ?? 65;
    const series = rsi(closes, len);
    const i = closes.length - 1;
    const p = closes.length - 2;
    const r0 = series[i];
    const r1 = series[p];
    if (r0 == null || r1 == null) {
      return { signal: "HOLD", detail: "RSI 미준비" };
    }
    if (r1 < buyBelow && r0 >= buyBelow) {
      return { signal: "LONG", detail: `RSI ${r0.toFixed(1)} 회복` };
    }
    if (r1 > sellAbove && r0 <= sellAbove) {
      return { signal: "SHORT", detail: `RSI ${r0.toFixed(1)} 이탈` };
    }
    return { signal: "HOLD", detail: `RSI ${r0.toFixed(1)}` };
  }

  // macd_cross
  const m = macd(closes, 12, 26, 9);
  const i = closes.length - 1;
  const p = closes.length - 2;
  const h0 = m.hist[i];
  const h1 = m.hist[p];
  if (
    h0 == null ||
    h1 == null ||
    Number.isNaN(h0) ||
    Number.isNaN(h1)
  ) {
    return { signal: "HOLD", detail: "MACD 미준비" };
  }
  if (h1 <= 0 && h0 > 0) {
    return { signal: "LONG", detail: "MACD hist↑" };
  }
  if (h1 >= 0 && h0 < 0) {
    return { signal: "SHORT", detail: "MACD hist↓" };
  }
  return { signal: "HOLD", detail: "MACD 유지" };
}
