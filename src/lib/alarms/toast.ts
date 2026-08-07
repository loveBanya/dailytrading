import type { AlarmKind } from "./types";

export type AlarmTargetTab =
  | "trades"
  | "live"
  | "screener"
  | "alerts"
  | "overview";

export const ALARM_TOAST_EVENT = "dt-alarm-toast";

export interface AlarmToastPayload {
  id: string;
  kind: AlarmKind;
  title: string;
  body: string;
  targetTab: AlarmTargetTab;
}

export function targetTabForKind(kind: AlarmKind): AlarmTargetTab {
  switch (kind) {
    case "screener":
      return "screener";
    case "trade_fill":
      return "trades";
    case "pos_open":
    case "pos_close":
    case "tp_near":
    case "sl_near":
    case "liq_near":
      return "live";
    default:
      return "alerts";
  }
}

export function emitAlarmToast(payload: AlarmToastPayload): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(ALARM_TOAST_EVENT, { detail: payload })
  );
}
