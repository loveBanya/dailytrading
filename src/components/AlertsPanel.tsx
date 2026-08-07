"use client";

import { useCallback, useEffect, useState } from "react";
import { formatKst } from "@/lib/utils/format";
import {
  ALARM_HISTORY_EVENT,
  clearAlarmHistory,
  kindLabel,
  loadAlarmHistory,
  markAlarmRead,
  markAllAlarmsRead,
  type AlarmEvent,
} from "@/lib/alarms/history";
import {
  targetTabForKind,
  type AlarmTargetTab,
} from "@/lib/alarms/toast";

interface AlertsPanelProps {
  onNavigate?: (tab: AlarmTargetTab) => void;
}

export function AlertsPanel({ onNavigate }: AlertsPanelProps) {
  const [items, setItems] = useState<AlarmEvent[]>([]);

  const refresh = useCallback(() => {
    setItems(loadAlarmHistory());
  }, []);

  useEffect(() => {
    refresh();
    const onStorage = (e: StorageEvent) => {
      if (e.key?.includes("alarm.history")) refresh();
    };
    window.addEventListener(ALARM_HISTORY_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(ALARM_HISTORY_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  const unread = items.filter((i) => !i.read).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-400">
          최근 알림 {items.length}건
          {unread > 0 ? (
            <span className="ml-2 text-amber-300">미읽음 {unread}</span>
          ) : null}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              markAllAlarmsRead();
              refresh();
            }}
            disabled={unread === 0}
            className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-40"
          >
            모두 읽음
          </button>
          <button
            type="button"
            onClick={() => {
              if (!confirm("알림 기록을 모두 삭제할까요?")) return;
              clearAlarmHistory();
              refresh();
            }}
            disabled={items.length === 0}
            className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-40"
          >
            비우기
          </button>
        </div>
      </div>

      {items.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-700 p-10 text-center text-sm text-zinc-500">
          아직 알림이 없습니다. 체결·포지션·스크리너 알람이 울리면 여기에
          쌓입니다.
        </div>
      )}

      <ul className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => {
                markAlarmRead(item.id);
                refresh();
                const target =
                  (item.targetTab as AlarmTargetTab | undefined) ??
                  targetTabForKind(item.kind);
                onNavigate?.(target);
              }}
              className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition hover:bg-zinc-900/60 ${
                item.read ? "bg-transparent" : "bg-amber-500/5"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                {!item.read && (
                  <span className="size-1.5 rounded-full bg-amber-400" />
                )}
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                  {kindLabel(item.kind)}
                </span>
                <span
                  className={`text-sm font-medium ${
                    item.read ? "text-zinc-300" : "text-zinc-50"
                  }`}
                >
                  {item.title}
                </span>
                <span className="ml-auto text-[11px] tabular-nums text-zinc-600">
                  {formatKst(new Date(item.createdAt).toISOString())} KST
                </span>
              </div>
              {item.body && (
                <p className="pl-3.5 text-xs text-zinc-500">{item.body}</p>
              )}
              <p className="pl-3.5 text-[10px] text-zinc-600">
                클릭하면 관련 탭으로 이동
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
