import type { OpenPosition } from "@/lib/exchanges/wallet";
import { readHlCache } from "@/lib/hyperliquid/cache";
import { importanceScore } from "@/lib/hyperliquid/perf";
import type { HlRecentEntry, HlTrader } from "@/lib/hyperliquid/types";
import { playDoorbell } from "./ding";
import { pushAlarmHistory } from "./history";
import {
  loadAlarmSettings,
  tryAlarmCooldown,
  type AlarmSettings,
} from "./settings";
import { emitAlarmToast, targetTabForKind } from "./toast";
import { alarmSpeechText, speakAlarm } from "./tts";
import type { AlarmKind } from "./types";

export type { AlarmKind } from "./types";

const HL_PINS_KEY = "dailytrading.hl.pins.v1";
const TRADERS_CACHE_KEY = "traders";

function loadPinnedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(HL_PINS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

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

  const targetTab = targetTabForKind(kind);
  const vol = Math.max(0, Math.min(100, s.volume ?? 70)) / 100;
  if (s.dingEnabled !== false) void playDoorbell(vol);
  if (s.ttsEnabled) {
    const ttsVol = Math.max(0, Math.min(100, s.ttsVolume ?? 85)) / 100;
    speakAlarm(alarmSpeechText(title, body), ttsVol);
  }
  if (s.browserNotify) void notifyBrowser(title, body);
  const event = pushAlarmHistory(kind, title, body, targetTab);
  if (s.toastEnabled !== false) {
    emitAlarmToast({
      id: event.id,
      kind,
      title,
      body,
      targetTab,
    });
  }

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

function filterHlEntries(
  entries: HlRecentEntry[],
  s: AlarmSettings
): HlRecentEntry[] {
  const pins = loadPinnedIds();
  const traders =
    readHlCache<HlTrader[]>(TRADERS_CACHE_KEY)?.data ?? [];
  const byId = new Map(traders.map((t) => [t.id, t]));

  return entries.filter((e) => {
    if (e.notional < s.hlEntryMinNotional) return false;
    if (e.side === "LONG" && s.hlLongEnabled === false) return false;
    if (e.side === "SHORT" && s.hlShortEnabled === false) return false;
    if (s.hlPinnedOnly && !pins.has(e.traderId)) return false;
    if (s.hlFocusOnly) {
      if (pins.has(e.traderId)) return true;
      const t = byId.get(e.traderId);
      if (!t) return false;
      const imp = importanceScore(t, {
        pinned: false,
        hasRecentEntry: true,
        exposureUsd: e.notional,
      });
      return imp.tier === "focus";
    }
    return true;
  });
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

const HL_SEEN_KEY = "dailytrading.alarm.hlSeen.v1";
/** 이보다 오래된 진입은 처음 보더라도 알리지 않음 */
const HL_FRESH_MS = 20 * 60_000;

export function hlEntryKey(e: HlRecentEntry): string {
  return `${e.traderId}:${e.coin}:${e.side}:${e.firstTime}`;
}

function readHlSeen(): Set<string> | null {
  try {
    const raw = localStorage.getItem(HL_SEEN_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function writeHlSeen(keys: Set<string>) {
  try {
    localStorage.setItem(HL_SEEN_KEY, JSON.stringify([...keys].slice(-2000)));
  } catch {
    /* ignore */
  }
}

/** 관심 HL 트레이더의 새 진입 — 처음 호출 땐 기준점만 저장 */
export function checkHlEntries(entries: HlRecentEntry[]): HlRecentEntry[] {
  const s = loadAlarmSettings();
  const prev = readHlSeen();
  const next = new Set(prev ?? []);
  for (const e of entries) next.add(hlEntryKey(e));
  writeHlSeen(next);

  if (prev == null || !s.enabled || !s.hlEntryEnabled) return [];

  const now = Date.now();
  const freshRaw = entries.filter(
    (e) => !prev.has(hlEntryKey(e)) && now - e.lastTime <= HL_FRESH_MS
  );
  const fresh = filterHlEntries(freshRaw, s).sort(
    (a, b) => b.notional - a.notional
  );
  if (fresh.length === 0) return [];

  const maxSpeak = Math.max(1, Math.min(5, s.hlMaxSpeak ?? 2));
  const line = (e: HlRecentEntry) =>
    `${e.label ?? e.address.slice(0, 8)} ${e.coin} ${e.side === "LONG" ? "롱" : "숏"} $${Math.round(e.notional).toLocaleString()}`;
  const top = fresh[0]!;
  const hlCd = s.hlCooldownSec > 0 ? s.hlCooldownSec : s.cooldownSec;
  // HL은 전용 쿨다운 키로 묶어서 연달아 울리는 것 완화
  if (!tryAlarmCooldown("hl_entry:batch", hlCd)) return fresh;

  void fireAlarm(
    "hl_entry",
    hlEntryKey(top),
    fresh.length === 1
      ? `HL 신규 진입 · ${top.coin}`
      : `HL 신규 진입 ${fresh.length}건`,
    fresh.slice(0, maxSpeak).map(line).join(" · "),
    { ...s, cooldownSec: 0 }
  );
  return fresh;
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
