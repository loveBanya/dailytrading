import type { AlarmKind } from "./types";

export type { AlarmKind } from "./types";

export interface AlarmEvent {
  id: string;
  kind: AlarmKind;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
}

const KEY = "dailytrading.alarm.history.v1";
const MAX = 200;
export const ALARM_HISTORY_EVENT = "dt-alarm-history";

function readAll(): AlarmEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as AlarmEvent[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeAll(list: AlarmEvent[]) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  window.dispatchEvent(new Event(ALARM_HISTORY_EVENT));
}

export function loadAlarmHistory(): AlarmEvent[] {
  return readAll();
}

export function unreadAlarmCount(): number {
  return readAll().filter((e) => !e.read).length;
}

export function pushAlarmHistory(
  kind: AlarmKind,
  title: string,
  body: string
): AlarmEvent {
  const event: AlarmEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    title,
    body,
    createdAt: Date.now(),
    read: false,
  };
  const list = [event, ...readAll()].slice(0, MAX);
  writeAll(list);
  return event;
}

export function markAlarmRead(id: string): void {
  writeAll(readAll().map((e) => (e.id === id ? { ...e, read: true } : e)));
}

export function markAllAlarmsRead(): void {
  writeAll(readAll().map((e) => ({ ...e, read: true })));
}

export function clearAlarmHistory(): void {
  writeAll([]);
}

export function kindLabel(kind: AlarmKind): string {
  switch (kind) {
    case "screener":
      return "스크리너";
    case "trade_fill":
      return "체결";
    case "pos_open":
      return "진입";
    case "pos_close":
      return "청산";
    case "tp_near":
      return "TP근접";
    case "sl_near":
      return "SL근접";
    case "liq_near":
      return "청산가";
    default:
      return kind;
  }
}
