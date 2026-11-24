"use client";

import { useEffect, useState } from "react";
import { playDoorbell } from "@/lib/alarms/ding";
import {
  DEFAULT_ALARM_SETTINGS,
  loadAlarmSettings,
  saveAlarmSettings,
  type AlarmSettings,
} from "@/lib/alarms/settings";
import { alarmSpeechText, speakAlarm, unlockTts } from "@/lib/alarms/tts";

const HL_MIN_PRESETS = [
  { label: "전체", value: 0 },
  { label: "1만+", value: 10_000 },
  { label: "5만+", value: 50_000 },
  { label: "10만+", value: 100_000 },
  { label: "50만+", value: 500_000 },
  { label: "100만+", value: 1_000_000 },
] as const;

export function AlarmSettingsButton() {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<AlarmSettings>(DEFAULT_ALARM_SETTINGS);

  useEffect(() => {
    setS(loadAlarmSettings());
  }, []);

  useEffect(() => {
    const unlock = () => {
      unlockTts();
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
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
          <div className="absolute right-0 z-50 mt-2 flex max-h-[min(80vh,36rem)] w-[22rem] flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-xl sm:w-96">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <p className="text-sm font-medium text-zinc-100">알람 설정</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    unlockTts();
                    void playDoorbell(
                      Math.max(0, Math.min(100, s.volume)) / 100
                    );
                  }}
                  className="rounded border border-amber-700/40 px-2 py-0.5 text-xs text-amber-300/90 hover:bg-amber-500/10 hover:text-amber-200"
                >
                  딩 미리듣기
                </button>
                <button
                  type="button"
                  onClick={() => {
                    unlockTts();
                    speakAlarm(
                      alarmSpeechText(
                        "HL 신규 진입 · BTC",
                        "잔고 탑 BTC 숏 $380,000 · 올타임 PnL 강자 ETH 롱 $120,000"
                      ),
                      Math.max(0, Math.min(100, s.ttsVolume)) / 100
                    );
                  }}
                  className="rounded border border-sky-700/40 px-2 py-0.5 text-xs text-sky-300/90 hover:bg-sky-500/10 hover:text-sky-200"
                >
                  TTS 미리듣기
                </button>
              </div>
            </div>

            <div className="pretty-scroll space-y-3 overflow-y-auto px-4 py-3 text-sm">
              <label className="flex items-center justify-between gap-3 text-zinc-300">
                <span>알람 사용</span>
                <input
                  type="checkbox"
                  checked={s.enabled}
                  onChange={(e) => update({ enabled: e.target.checked })}
                  className="size-4 accent-amber-500"
                />
              </label>

              <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-900/40 p-2.5">
                <p className="text-[11px] font-medium text-zinc-500">출력</p>
                <label className="flex items-center justify-between gap-3 text-zinc-300">
                  <span>딩 소리</span>
                  <input
                    type="checkbox"
                    checked={s.dingEnabled !== false}
                    disabled={!s.enabled}
                    onChange={(e) => update({ dingEnabled: e.target.checked })}
                    className="size-4 accent-amber-500"
                  />
                </label>
                <label className="block text-zinc-300">
                  <span className="mb-1 flex justify-between text-xs text-zinc-500">
                    <span>딩 크기</span>
                    <span>{s.volume}%</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={s.volume}
                    disabled={!s.enabled || s.dingEnabled === false}
                    onChange={(e) => update({ volume: Number(e.target.value) })}
                    className="w-full accent-amber-500"
                  />
                </label>
                <div className="flex items-center justify-between gap-3 text-zinc-300">
                  <span>한국어 TTS</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!s.enabled}
                      onClick={() => {
                        unlockTts();
                        speakAlarm(
                          alarmSpeechText(
                            "HL 신규 진입 · BTC",
                            "잔고 탑 BTC 숏 $380,000"
                          ),
                          Math.max(0, Math.min(100, s.ttsVolume ?? 85)) / 100
                        );
                      }}
                      className="rounded border border-sky-700/50 px-2 py-0.5 text-[11px] text-sky-300 hover:bg-sky-500/10 disabled:opacity-40"
                    >
                      미리듣기
                    </button>
                    <input
                      type="checkbox"
                      checked={s.ttsEnabled !== false}
                      disabled={!s.enabled}
                      onChange={(e) => update({ ttsEnabled: e.target.checked })}
                      className="size-4 accent-sky-500"
                    />
                  </div>
                </div>
                <label className="block text-zinc-300">
                  <span className="mb-1 flex justify-between text-xs text-zinc-500">
                    <span>TTS 크기</span>
                    <span>{s.ttsVolume ?? 85}%</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={s.ttsVolume ?? 85}
                    disabled={!s.enabled || s.ttsEnabled === false}
                    onChange={(e) =>
                      update({ ttsVolume: Number(e.target.value) })
                    }
                    className="w-full accent-sky-500"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-zinc-300">
                  <span>토스트</span>
                  <input
                    type="checkbox"
                    checked={s.toastEnabled !== false}
                    disabled={!s.enabled}
                    onChange={(e) =>
                      update({ toastEnabled: e.target.checked })
                    }
                    className="size-4 accent-amber-500"
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

              <div className="space-y-2 border-t border-zinc-800 pt-3">
                <p className="text-[11px] font-medium text-zinc-500">
                  HL 트레이더 진입
                </p>
                <label className="flex items-center justify-between gap-3 text-zinc-300">
                  <span>신규 진입 알림</span>
                  <input
                    type="checkbox"
                    checked={s.hlEntryEnabled}
                    disabled={!s.enabled}
                    onChange={(e) =>
                      update({ hlEntryEnabled: e.target.checked })
                    }
                    className="size-4 accent-amber-500"
                  />
                </label>
                <div>
                  <p className="mb-1 text-xs text-zinc-500">최소 규모</p>
                  <div className="flex flex-wrap gap-1">
                    {HL_MIN_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        disabled={!s.enabled || !s.hlEntryEnabled}
                        onClick={() =>
                          update({ hlEntryMinNotional: p.value })
                        }
                        className={`rounded border px-2 py-0.5 text-[11px] disabled:opacity-40 ${
                          s.hlEntryMinNotional === p.value
                            ? "border-emerald-600/60 text-emerald-300"
                            : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center justify-between gap-3 text-zinc-300">
                  <span>주목 점수만</span>
                  <input
                    type="checkbox"
                    checked={s.hlFocusOnly !== false}
                    disabled={!s.enabled || !s.hlEntryEnabled}
                    onChange={(e) =>
                      update({ hlFocusOnly: e.target.checked })
                    }
                    className="size-4 accent-sky-500"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-zinc-300">
                  <span>핀 고정만</span>
                  <input
                    type="checkbox"
                    checked={!!s.hlPinnedOnly}
                    disabled={!s.enabled || !s.hlEntryEnabled}
                    onChange={(e) =>
                      update({ hlPinnedOnly: e.target.checked })
                    }
                    className="size-4 accent-sky-500"
                  />
                </label>
                <div className="flex items-center justify-between gap-3 text-zinc-300">
                  <span>방향</span>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={s.hlLongEnabled !== false}
                        disabled={!s.enabled || !s.hlEntryEnabled}
                        onChange={(e) =>
                          update({ hlLongEnabled: e.target.checked })
                        }
                        className="size-3.5 accent-emerald-500"
                      />
                      롱
                    </label>
                    <label className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={s.hlShortEnabled !== false}
                        disabled={!s.enabled || !s.hlEntryEnabled}
                        onChange={(e) =>
                          update({ hlShortEnabled: e.target.checked })
                        }
                        className="size-3.5 accent-rose-500"
                      />
                      숏
                    </label>
                  </div>
                </div>
                <label className="flex items-center justify-between gap-3 text-zinc-300">
                  <span className="text-xs text-zinc-500">HL 쿨다운(초)</span>
                  <input
                    type="number"
                    min={60}
                    max={900}
                    step={30}
                    value={s.hlCooldownSec ?? 180}
                    disabled={!s.enabled || !s.hlEntryEnabled}
                    onChange={(e) =>
                      update({
                        hlCooldownSec: Math.max(
                          60,
                          Number(e.target.value) || 180
                        ),
                      })
                    }
                    className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-zinc-300">
                  <span className="text-xs text-zinc-500">읽을 최대 건수</span>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={s.hlMaxSpeak ?? 2}
                    disabled={!s.enabled || !s.hlEntryEnabled}
                    onChange={(e) =>
                      update({
                        hlMaxSpeak: Math.max(
                          1,
                          Math.min(5, Number(e.target.value) || 2)
                        ),
                      })
                    }
                    className="w-16 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                  />
                </label>
              </div>

              <div className="space-y-2 border-t border-zinc-800 pt-3">
                <p className="text-[11px] font-medium text-zinc-500">스크리너</p>
                <label className="flex items-center justify-between gap-3 text-zinc-300">
                  <span>새 신호</span>
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

              <div className="space-y-2 border-t border-zinc-800 pt-3">
                <p className="text-[11px] font-medium text-zinc-500">
                  매매 · 포지션
                </p>
                <label className="flex items-center justify-between gap-3 text-zinc-300">
                  <span>거래 체결</span>
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

              <div className="space-y-2 border-t border-zinc-800 pt-3">
                <label className="flex items-center justify-between gap-3 text-zinc-300">
                  <span>공통 쿨다운(초)</span>
                  <input
                    type="number"
                    min={30}
                    max={600}
                    step={30}
                    value={s.cooldownSec}
                    disabled={!s.enabled}
                    onChange={(e) =>
                      update({
                        cooldownSec: Math.max(
                          30,
                          Number(e.target.value) || 120
                        ),
                      })
                    }
                    className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                  />
                </label>
              </div>

              <p className="text-[11px] leading-relaxed text-zinc-600">
                기본값: HL은 주목 점수·10만$+, TTS ON. 탭을 연 뒤 화면을 한 번
                클릭해야 딩/TTS가 재생됩니다. 핀·주목은 HL 트레이더 탭 설정과
                연동됩니다.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
