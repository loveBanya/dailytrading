import type { OpenPosition } from "@/lib/exchanges/wallet";
import { playDoorbell } from "./ding";
import { pushAlarmHistory } from "./history";
import {
  loadAlarmSettings,
  tryAlarmCooldown,
  type AlarmSettings,
} from "./settings";
import type { AlarmKind } from "./types";

export type { AlarmKind } from "./types";

function pctDistance(mark: number, target: number): number {
  if (!Number.isFinite(mark) || !Number.isFinite(target) || mark === 0) {
    return Infinity;
  }
  return (Math.abs(mark - target) / Math.abs(mark)) * 100;
}

async function notifyBrowser(title: string, body: string) {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
    if (Notification.permission !== "granted") return;
    new Notification(title, { body, silent: true });
  } catch {
    /* ignore */
  }
}

export async function fireAlarm(
  kind: AlarmKind,
  id: string,
  title: string,
  body: string,
  settings?: AlarmSettings
): Promise<boolean> {
  const s = settings ?? loadAlarmSettings();
  if (!s.enabled) return false;
  if (!tryAlarmCooldown(`${kind}:${id}`, s.cooldownSec)) return false;

  void playDoorbell();
  if (s.browserNotify) void notifyBrowser(title, body);
  pushAlarmHistory(kind, title, body);

  // 탭 포커스 힌트
  try {
    const prev = document.title;
    document.title = `🔔 ${title}`;
    window.setTimeout(() => {
      if (document.title.startsWith("🔔 ")) document.title = prev;
    }, 4000);
  } catch {
    /* ignore */
  }

  return true;
}

export function checkPositionAlarms(
  positions: OpenPosition[],
  settings?: AlarmSettings
): void {
  const s = settings ?? loadAlarmSettings();
  if (!s.enabled || !s.positionEnabled) return;

  const thr = s.positionProximityPct;
  for (const p of positions) {
    const key = `${p.exchange}:${p.symbol}:${p.side}`;
    const mark = p.markPrice;

    if (p.takeProfit != null && p.takeProfit > 0) {
      const d = pctDistance(mark, p.takeProfit);
      if (d <= thr) {
        void fireAlarm(
          "tp_near",
          key,
          `${p.symbol} TP 근접`,
          `마크 ${mark} · TP ${p.takeProfit} (${d.toFixed(2)}%)`,
          s
        );
      }
    }

    if (p.stopLoss != null && p.stopLoss > 0) {
      const d = pctDistance(mark, p.stopLoss);
      if (d <= thr) {
        void fireAlarm(
          "sl_near",
          key,
          `${p.symbol} SL 근접`,
          `마크 ${mark} · SL ${p.stopLoss} (${d.toFixed(2)}%)`,
          s
        );
      }
    }

    if (p.liqPrice != null && p.liqPrice > 0) {
      const d = pctDistance(mark, p.liqPrice);
      if (d <= thr * 1.5) {
        void fireAlarm(
          "liq_near",
          key,
          `${p.symbol} 청산가 근접`,
          `마크 ${mark} · 청산 ${p.liqPrice} (${d.toFixed(2)}%)`,
          s
        );
      }
    }
  }
}

/** 포지션 목록 변화(신규 진입 / 청산) */
export function checkPositionChanges(
  positions: OpenPosition[],
  prevKeys: Set<string> | null
): Set<string> {
  const s = loadAlarmSettings();
  const next = new Set(
    positions.map((p) => `${p.exchange}:${p.symbol}:${p.side}`)
  );

  if (prevKeys == null || !s.enabled || !s.positionChangeEnabled) {
    return next;
  }

  for (const p of positions) {
    const key = `${p.exchange}:${p.symbol}:${p.side}`;
    if (!prevKeys.has(key)) {
      void fireAlarm(
        "pos_open",
        key,
        `포지션 진입 ${p.symbol}`,
        `${p.side} · ${p.exchange} · 진입가 ${p.avgPrice}`,
        s
      );
    }
  }

  for (const key of prevKeys) {
    if (!next.has(key)) {
      const [exchange, symbol, side] = key.split(":");
      void fireAlarm(
        "pos_close",
        key,
        `포지션 청산 ${symbol ?? key}`,
        `${side ?? ""} · ${exchange ?? ""}`.trim(),
        s
      );
    }
  }

  return next;
}

/** 새로 동기화된 매매 체결 기록 */
export function checkNewTradeFills(
  tradeIds: string[],
  summaries: Array<{ id: string; label: string }>,
  prevIds: Set<string> | null
): Set<string> {
  const next = new Set(tradeIds);
  const s = loadAlarmSettings();
  if (prevIds == null || !s.enabled || !s.tradeFillEnabled) {
    return next;
  }

  const fresh = summaries.filter((t) => !prevIds.has(t.id));
  if (fresh.length > 0) {
    const top = fresh[0]!;
    void fireAlarm(
      "trade_fill",
      top.id,
      fresh.length === 1
        ? `체결 ${top.label}`
        : `체결 ${fresh.length}건`,
      fresh.length === 1
        ? top.label
        : fresh
            .slice(0, 3)
            .map((t) => t.label)
            .join(" · "),
      s
    );
  }

  return next;
}
