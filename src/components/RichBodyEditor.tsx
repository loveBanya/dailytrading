"use client";

import { useEffect, useRef, useState } from "react";
import {
  fileToCompressedDataUrl,
  richBodyIsEmpty,
  sanitizeRichHtml,
} from "@/lib/utils/rich-body";

interface RichBodyEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  onError?: (message: string) => void;
}

export function RichBodyEditor({
  value,
  onChange,
  placeholder = "내용을 입력하세요. 이미지는 Ctrl+V 로 붙여넣기 할 수 있습니다.",
  minHeight = 160,
  onError,
}: RichBodyEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const skipSync = useRef(false);
  const [empty, setEmpty] = useState(() => richBodyIsEmpty(value));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (skipSync.current) {
      skipSync.current = false;
      setEmpty(richBodyIsEmpty(el.innerHTML));
      return;
    }
    if (el.innerHTML !== value) {
      el.innerHTML = value || "";
    }
    setEmpty(richBodyIsEmpty(value));
  }, [value]);

  function emit() {
    const el = ref.current;
    if (!el) return;
    skipSync.current = true;
    const html = sanitizeRichHtml(el.innerHTML);
    setEmpty(richBodyIsEmpty(html));
    onChange(html);
  }

  function insertHtml(html: string) {
    const el = ref.current;
    if (!el) return;
    el.focus();

    const sel = window.getSelection();
    if (!sel) {
      el.insertAdjacentHTML("beforeend", html);
      emit();
      return;
    }

    if (!el.contains(sel.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    const range = sel.getRangeAt(0);
    range.deleteContents();
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    const frag = document.createDocumentFragment();
    let node: ChildNode | null;
    let last: ChildNode | null = null;
    while ((node = wrapper.firstChild)) {
      last = frag.appendChild(node);
    }
    range.insertNode(frag);
    if (last) {
      range.setStartAfter(last);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    emit();
  }

  async function insertImageFile(file: File) {
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      insertHtml(
        `<div><img src="${dataUrl}" alt="" /></div><div><br/></div>`
      );
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "이미지 삽입 실패");
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) void insertImageFile(file);
        return;
      }
    }

    const text = e.clipboardData.getData("text/plain");
    if (text && e.clipboardData.types.includes("text/html")) {
      e.preventDefault();
      const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br/>");
      insertHtml(escaped);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith("image/")) {
      e.preventDefault();
      void insertImageFile(file);
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        {empty && (
          <div className="pointer-events-none absolute left-3 top-2 z-0 whitespace-pre-wrap text-sm text-zinc-600">
            {placeholder}
          </div>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline
          onInput={emit}
          onPaste={onPaste}
          onDrop={onDrop}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) e.preventDefault();
          }}
          className="relative z-10 w-full overflow-auto rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm leading-relaxed text-zinc-200 outline-none focus:border-emerald-500/50 [&_img]:my-2 [&_img]:max-h-[420px] [&_img]:max-w-full [&_img]:rounded-md"
          style={{ minHeight }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
        >
          이미지 넣기
        </button>
        <span className="text-[11px] text-zinc-600">
          Ctrl+V 붙여넣기 · 드래그앤드롭 · 글 안에 바로 표시
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void insertImageFile(file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

interface RichBodyViewProps {
  html: string;
  className?: string;
}

export function RichBodyView({ html, className = "" }: RichBodyViewProps) {
  const safe = sanitizeRichHtml(html);
  if (!safe.trim()) return null;
  return (
    <div
      className={`rich-body text-sm leading-relaxed text-zinc-300 [&_img]:my-3 [&_img]:max-h-[480px] [&_img]:max-w-full [&_img]:rounded-md ${className}`}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
