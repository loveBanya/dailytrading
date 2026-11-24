/** PC/폰 localStorage ↔ Supabase 클라우드 설정 동기화 */

export const CLOUD_PREF_KEYS = [
  "dailytrading.ui.tab.v1",
  "dailytrading.ui.screener.view.v1",
  "dailytrading.overview.order.v1",
  "dailytrading.goal.challenge.v1",
  "dailytrading.screener.filters.v1",
  "dailytrading.screener.watch.v1",
  "dailytrading.screener.universe.v1",
  "dailytrading.alarm.settings.v1",
  "dailytrading.alarm.history.v1",
  "dailytrading.riskcalc.v1",
  "dailytrading.calcoins.v1",
  "dailytrading.hl.pins.v1",
] as const;

export type CloudPrefKey = (typeof CLOUD_PREF_KEYS)[number];

export const CLOUD_SYNC_EVENT = "dt-cloud-prefs-synced";

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let lastPullAt = 0;

function isCloudKey(key: string): key is CloudPrefKey {
  return (CLOUD_PREF_KEYS as readonly string[]).includes(key);
}

/** 서버 → 로컬. 클라우드가 더 최신이면 덮어씀 */
export async function pullCloudPrefs(): Promise<{
  ok: boolean;
  applied: number;
  needsMigration?: boolean;
  migrationHint?: string;
  error?: string;
}> {
  try {
    const res = await fetch("/api/cloud-prefs", { cache: "no-store" });
    const data = (await res.json()) as {
      prefs?: Record<string, { value: string; updated_at: string }>;
      needsMigration?: boolean;
      migrationHint?: string;
      error?: string;
    };
    if (data.needsMigration) {
      return {
        ok: false,
        applied: 0,
        needsMigration: true,
        migrationHint: data.migrationHint,
      };
    }
    if (data.error) {
      return { ok: false, applied: 0, error: data.error };
    }

    let applied = 0;
    const prefs = data.prefs ?? {};
    for (const key of CLOUD_PREF_KEYS) {
      const row = prefs[key];
      if (!row?.value) continue;
      try {
        const localUpdated = Number(
          localStorage.getItem(`${key}__updated_at`) ?? 0
        );
        const cloudUpdated = new Date(row.updated_at).getTime();
        if (!Number.isFinite(cloudUpdated)) continue;
        // 로컬이 더 새롭고 값이 있으면 유지 (방금 폰/PC에서 수정한 경우)
        const localVal = localStorage.getItem(key);
        if (localVal != null && localUpdated > cloudUpdated) continue;
        if (localVal === row.value) {
          localStorage.setItem(`${key}__updated_at`, String(cloudUpdated));
          continue;
        }
        localStorage.setItem(key, row.value);
        localStorage.setItem(`${key}__updated_at`, String(cloudUpdated));
        applied += 1;
      } catch {
        /* ignore quota */
      }
    }
    lastPullAt = Date.now();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(CLOUD_SYNC_EVENT));
    }
    return { ok: true, applied };
  } catch (err) {
    return {
      ok: false,
      applied: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** 로컬 → 서버 (디바운스) */
export function schedulePushCloudPrefs(delayMs = 800): void {
  if (typeof window === "undefined") return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void pushCloudPrefs();
  }, delayMs);
}

export async function pushCloudPrefs(): Promise<{
  ok: boolean;
  needsMigration?: boolean;
  error?: string;
}> {
  if (typeof window === "undefined") return { ok: false };
  try {
    const prefs: Record<string, string> = {};
    for (const key of CLOUD_PREF_KEYS) {
      const v = localStorage.getItem(key);
      if (v != null) prefs[key] = v;
    }
    if (Object.keys(prefs).length === 0) return { ok: true };

    const res = await fetch("/api/cloud-prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefs }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      needsMigration?: boolean;
      migrationHint?: string;
      error?: string;
    };
    if (data.needsMigration) {
      return { ok: false, needsMigration: true, error: data.migrationHint };
    }
    if (!res.ok || data.error) {
      return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    }
    const now = String(Date.now());
    for (const key of Object.keys(prefs)) {
      localStorage.setItem(`${key}__updated_at`, now);
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** localStorage setItem 가로채서 클라우드 키면 푸시 예약 */
export function installCloudPrefsHooks(): () => void {
  if (typeof window === "undefined") return () => {};
  const original = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key: string, value: string) => {
    original(key, value);
    if (isCloudKey(key)) {
      original(`${key}__updated_at`, String(Date.now()));
      schedulePushCloudPrefs();
    }
  };
  return () => {
    localStorage.setItem = original;
  };
}

export function cloudLastPullAt(): number {
  return lastPullAt;
}
