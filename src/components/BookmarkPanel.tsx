"use client";

import { useCallback, useEffect, useState } from "react";

interface Bookmark {
  id: string;
  title: string;
  url: string;
  category: string;
}

export function BookmarkPanel() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("일반");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bookmarks");
      const data = (await res.json()) as {
        bookmarks?: Bookmark[];
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setBookmarks(data.bookmarks ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, url, category }),
      });
      const data = (await res.json()) as { error?: string };
      if (data.error) throw new Error(data.error);
      setTitle("");
      setUrl("");
      setCategory("일반");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/bookmarks?id=${id}`, { method: "DELETE" });
    await load();
  }

  const grouped = bookmarks.reduce<Record<string, Bookmark[]>>((acc, b) => {
    const key = b.category || "일반";
    (acc[key] ??= []).push(b);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <form
        onSubmit={handleAdd}
        className="flex flex-wrap items-end gap-2 rounded-md border border-zinc-800/80 bg-zinc-950/40 p-3"
      >
        <Field label="이름">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="트레이딩뷰"
            className="w-28 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500/50 sm:w-36"
          />
        </Field>
        <Field label="주소">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className="w-44 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500/50 sm:w-56"
          />
        </Field>
        <Field label="분류">
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="차트"
            className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500/50"
          />
        </Field>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          {saving ? "저장 중…" : "추가"}
        </button>
      </form>

      {loading && (
        <p className="text-sm text-zinc-500">즐겨찾기를 불러오는 중…</p>
      )}
      {error && (
        <p className="text-sm text-amber-300/80">
          {error}
          {error.includes("does not exist") || error.includes("schema cache")
            ? " — Supabase에서 002_bookmarks.sql 을 실행하세요."
            : null}
        </p>
      )}

      {!loading && !error && bookmarks.length === 0 && (
        <p className="text-sm text-zinc-500">
          즐겨찾기가 없습니다. 위에서 사이트를 추가하세요.
        </p>
      )}

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat}>
          <p className="mb-2 text-xs font-medium text-zinc-500">{cat}</p>
          <div className="flex flex-wrap gap-2">
            {items.map((b) => (
              <div
                key={b.id}
                className="group flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 py-1.5 pl-3 pr-1.5"
              >
                <a
                  href={b.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-zinc-200 hover:text-emerald-400"
                >
                  {b.title}
                </a>
                <button
                  type="button"
                  onClick={() => void handleDelete(b.id)}
                  className="ml-1 rounded px-1.5 text-xs text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:text-rose-400"
                  aria-label="삭제"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-zinc-500">{label}</span>
      {children}
    </label>
  );
}
