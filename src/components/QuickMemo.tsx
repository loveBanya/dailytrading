"use client";

import { useEffect, useState } from "react";

const TEXT_KEY = "dailytrading.quickmemo.v1";
const OPEN_KEY = "dailytrading.quickmemo.open.v1";

function loadText(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(TEXT_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveText(text: string) {
  try {
    localStorage.setItem(TEXT_KEY, text);
  } catch {
    /* ignore */
  }
}

function loadOpen(fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    if (raw === null) return fallback;
    return raw === "1";
  } catch {
    return fallback;
  }
}

function saveOpen(open: boolean) {
  try {
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    /* ignore */
  }
}

interface QuickMemoProps {
  defaultOpen?: boolean;
}

/** 메인 상단 빠른 메모 — 브라우저에 저장 */
export function QuickMemo({ defaultOpen = false }: QuickMemoProps) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(defaultOpen);
  const [ready, setReady] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setText(loadText());
    setOpen(loadOpen(defaultOpen));
    setReady(true);
  }, [defaultOpen]);

  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => {
      saveText(text);
      setSavedAt(Date.now());
    }, 300);
    return () => window.clearTimeout(t);
  }, [text, ready]);

  useEffect(() => {
    if (!ready) return;
    saveOpen(open);
  }, [open, ready]);

  const preview = text.trim().split(/\n/).find((l) => l.trim()) ?? "";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3 shadow-lg shadow-black/20 backdrop-blur sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="min-w-0 text-left"
          aria-expanded={open}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-zinc-100">빠른 메모</p>
            {!open && preview && (
              <span className="max-w-[14rem] truncate text-[11px] text-zinc-500 sm:max-w-xs">
                {preview}
              </span>
            )}
            {!open && !preview && (
              <span className="text-[11px] text-zinc-600">비어 있음</span>
            )}
          </div>
        </button>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200"
          >
            {open ? "접기 ▲" : "펼치기 ▼"}
          </button>
          {open && text.trim() && (
            <button
              type="button"
              onClick={() => {
                if (!confirm("메모를 모두 지울까요?")) return;
                setText("");
              }}
              className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-500 hover:text-rose-300"
            >
              비우기
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="오늘 관찰 · 계획 · 주의할 점…"
            rows={5}
            className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
          />
          <p className="text-[11px] text-zinc-600">
            이 브라우저에만 저장됩니다
            {savedAt != null ? " · 자동 저장됨" : ""}.
          </p>
        </div>
      )}
    </div>
  );
}
