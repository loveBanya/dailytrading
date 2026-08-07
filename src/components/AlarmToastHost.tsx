"use client";

import { useEffect, useState } from "react";
import { markAlarmRead, kindLabel } from "@/lib/alarms/history";
import {
  ALARM_TOAST_EVENT,
  type AlarmTargetTab,
  type AlarmToastPayload,
} from "@/lib/alarms/toast";

interface AlarmToastHostProps {
  onNavigate: (tab: AlarmTargetTab) => void;
}

export function AlarmToastHost({ onNavigate }: AlarmToastHostProps) {
  const [toasts, setToasts] = useState<AlarmToastPayload[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent<AlarmToastPayload>).detail;
      if (!detail) return;
      setToasts((prev) => [detail, ...prev].slice(0, 5));
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== detail.id));
      }, 8000);
    }
    window.addEventListener(ALARM_TOAST_EVENT, onToast);
    return () => window.removeEventListener(ALARM_TOAST_EVENT, onToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(100%-2rem,22rem)] flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => {
            markAlarmRead(t.id);
            onNavigate(t.targetTab);
            setToasts((prev) => prev.filter((x) => x.id !== t.id));
          }}
          className="pointer-events-auto rounded-xl border border-amber-500/40 bg-zinc-950/95 px-4 py-3 text-left shadow-xl shadow-black/40 backdrop-blur transition hover:border-amber-400/70"
        >
          <div className="flex items-center gap-2">
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
              {kindLabel(t.kind)}
            </span>
            <span className="text-[10px] text-zinc-500">클릭하면 이동</span>
          </div>
          <p className="mt-1 text-sm font-medium text-zinc-50">{t.title}</p>
          {t.body && (
            <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400">{t.body}</p>
          )}
        </button>
      ))}
    </div>
  );
}
