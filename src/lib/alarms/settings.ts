export interface AlarmSettings {
  enabled: boolean;
  /** 스크리너 새 신호 */
  screenerEnabled: boolean;
  screenerMinStars: number;
  screenerFavoritesOnly: boolean;
  /** 실시간 포지션 TP/SL/청산가 근접 */
  positionEnabled: boolean;
  /** 목표가/손절/청산가까지 남은 거리 % (이하면 울림) */
  positionProximityPct: number;
  /** 포지션 진입/청산 변화 */
  positionChangeEnabled: boolean;
  /** 새 매매 체결(동기화로 들어온 청산 기록) */
  tradeFillEnabled: boolean;
  /** 같은 알림 재울림 쿨다운(초) */
  cooldownSec: number;
  /** 브라우저 알림(탭 백그라운드 시) */
  browserNotify: boolean;
  /** 딩 볼륨 0~100 */
  volume: number;
  /** 화면 토스트 */
  toastEnabled: boolean;
}

export const DEFAULT_ALARM_SETTINGS: AlarmSettings = {
  enabled: true,
  screenerEnabled: true,
  screenerMinStars: 3,
  screenerFavoritesOnly: false,
  positionEnabled: true,
  positionProximityPct: 0.8,
  positionChangeEnabled: true,
  tradeFillEnabled: true,
  cooldownSec: 120,
  browserNotify: true,
  volume: 70,
  toastEnabled: true,
};

const KEY = "dailytrading.alarm.settings.v1";
const COOLDOWN_KEY = "dailytrading.alarm.cooldown.v1";

export function loadAlarmSettings(): AlarmSettings {
  if (typeof window === "undefined") return { ...DEFAULT_ALARM_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_ALARM_SETTINGS };
    return { ...DEFAULT_ALARM_SETTINGS, ...(JSON.parse(raw) as AlarmSettings) };
  } catch {
    return { ...DEFAULT_ALARM_SETTINGS };
  }
}

export function saveAlarmSettings(settings: AlarmSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

function readCooldowns(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(COOLDOWN_KEY) ?? "{}") as Record<
      string,
      number
    >;
  } catch {
    return {};
  }
}

function writeCooldowns(map: Record<string, number>) {
  localStorage.setItem(COOLDOWN_KEY, JSON.stringify(map));
}

/** 쿨다운 통과하면 true */
export function tryAlarmCooldown(id: string, cooldownSec: number): boolean {
  const now = Date.now();
  const map = readCooldowns();
  const until = map[id] ?? 0;
  if (until > now) return false;
  map[id] = now + cooldownSec * 1000;
  // 오래된 키 정리
  for (const [k, v] of Object.entries(map)) {
    if (v < now - 3600_000) delete map[k];
  }
  writeCooldowns(map);
  return true;
}
