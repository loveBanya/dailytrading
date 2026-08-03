"use client";

import { useEffect, useState } from "react";
import { playDoorbell } from "@/lib/alarms/ding";
import {
  DEFAULT_ALARM_SETTINGS,
  loadAlarmSettings,
  saveAlarmSettings,
  type AlarmSettings,
} from "@/lib/alarms/settings";

export function AlarmSettingsButton() {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<AlarmSettings>(DEFAULT_ALARM_SETTINGS);

  useEffect(() => {
    setS(loadAlarmSettings());
  }, []);

  function update(patch: Partial<AlarmSettings>) {
    setS((prev) => {
      const next = { ...prev, ...patch };
      saveAlarmSettings(next);
      return next;
    });
  }

  async function enableBrowserNotify() {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    update({ browserNotify: perm === "granted" });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`rounded-md border px-3 py-2 text-sm transition ${
          s.enabled
            ? "border-amber-500/40 bg-amber-500/10 text-amber-200 hover:border-amber-400/60"
            : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
        }`}
        title="알람 설정"
      >
        {s.enabled ? "알람 ON" : "알람 OFF"}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="닫기"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-zinc-700 bg-zinc-950 p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-100">알람</p>
              <button
                type="button"
                onClick={() => void playDoorbell()}
                className="text-xs text-amber-300/90 hover:text-amber-200"
              >
                딩 테스트
              </button>
            </div>

            <label className="mb-3 flex items-center justify-between gap-3 text-sm text-zinc-300">
              <span>알람 사용</span>
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={(e) => update({ enabled: e.target.checked })}
                className="size-4 accent-amber-500"
              />
            </label>

            <div className="space-y-2 border-t border-zinc-800 pt-3 text-sm">
              <p className="text-xs font-medium text-zinc-500">스크리너</p>
              <label className="flex items-center justify-between gap-3 text-zinc-300">
                <span>새 신호 딩</span>
                <input
                  type="checkbox"
                  checked={s.screenerEnabled}
                  disabled={!s.enabled}
                  onChange={(e) =>
                    update({ screenerEnabled: e.target.checked })
                  }
                  className="size-4 accent-amber-500"
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-zinc-300">
                <span>최소 ★</span>
                <select
                  value={s.screenerMinStars}
                  disabled={!s.enabled || !s.screenerEnabled}
                  onChange={(e) =>
                    update({ screenerMinStars: Number(e.target.value) })
                  }
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}★+
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center justify-between gap-3 text-zinc-300">
                <span>즐겨찾기만</span>
                <input
                  type="checkbox"
                  checked={s.screenerFavoritesOnly}
                  disabled={!s.enabled || !s.screenerEnabled}
                  onChange={(e) =>
                    update({ screenerFavoritesOnly: e.target.checked })
                  }
                  className="size-4 accent-amber-500"
                />
              </label>
            </div>

            <div className="mt-3 space-y-2 border-t border-zinc-800 pt-3 text-sm">
              <p className="text-xs font-medium text-zinc-500">매매 · 포지션</p>
              <label className="flex items-center justify-between gap-3 text-zinc-300">
                <span>거래 체결(새 기록)</span>
                <input
                  type="checkbox"
                  checked={s.tradeFillEnabled}
                  disabled={!s.enabled}
                  onChange={(e) =>
                    update({ tradeFillEnabled: e.target.checked })
                  }
                  className="size-4 accent-amber-500"
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-zinc-300">
                <span>포지션 진입/청산</span>
                <input
                  type="checkbox"
                  checked={s.positionChangeEnabled}
                  disabled={!s.enabled}
                  onChange={(e) =>
                    update({ positionChangeEnabled: e.target.checked })
                  }
                  className="size-4 accent-amber-500"
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-zinc-300">
                <span>TP/SL/청산 근접</span>
                <input
                  type="checkbox"
                  checked={s.positionEnabled}
                  disabled={!s.enabled}
                  onChange={(e) =>
                    update({ positionEnabled: e.target.checked })
                  }
                  className="size-4 accent-amber-500"
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-zinc-300">
                <span>근접 %</span>
                <input
                  type="number"
                  min={0.1}
                  max={5}
                  step={0.1}
                  value={s.positionProximityPct}
                  disabled={!s.enabled || !s.positionEnabled}
                  onChange={(e) =>
                    update({
                      positionProximityPct: Math.max(
                        0.1,
                        Number(e.target.value) || 0.8
                      ),
                    })
                  }
                  className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                />
              </label>
            </div>

            <div className="mt-3 space-y-2 border-t border-zinc-800 pt-3 text-sm">
              <label className="flex items-center justify-between gap-3 text-zinc-300">
                <span>쿨다운(초)</span>
                <input
                  type="number"
                  min={30}
                  max={600}
                  step={30}
                  value={s.cooldownSec}
                  disabled={!s.enabled}
                  onChange={(e) =>
                    update({
                      cooldownSec: Math.max(30, Number(e.target.value) || 120),
                    })
                  }
                  className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-zinc-300">
                <span>브라우저 알림</span>
                <input
                  type="checkbox"
                  checked={s.browserNotify}
                  disabled={!s.enabled}
                  onChange={(e) => {
                    if (e.target.checked) void enableBrowserNotify();
                    else update({ browserNotify: false });
                  }}
                  className="size-4 accent-amber-500"
                />
              </label>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">
              탭을 열어 둔 동안만 동작합니다. 첫 딩은 화면을 한 번 클릭한 뒤에
              재생됩니다(브라우저 정책).
            </p>
          </div>
        </>
      )}
    </div>
  );
}
