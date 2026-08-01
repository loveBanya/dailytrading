"use client";

import { useCallback, useEffect, useState } from "react";
import { formatKst } from "@/lib/utils/format";
import { sanitizeRichHtml } from "@/lib/utils/rich-body";
import { RichBodyEditor, RichBodyView } from "./RichBodyEditor";

export function MindsetPanel() {
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mindset");
      const data = (await res.json()) as {
        body?: string;
        updated_at?: string | null;
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setBody(data.body ?? "");
      setDraft(data.body ?? "");
      setUpdatedAt(data.updated_at ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit() {
    setDraft(body);
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(body);
    setEditing(false);
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const clean = sanitizeRichHtml(draft);
      const res = await fetch("/api/mindset", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: clean }),
      });
      const data = (await res.json()) as {
        body?: string;
        updated_at?: string;
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      const next = data.body ?? clean;
      setBody(next);
      setDraft(next);
      setUpdatedAt(data.updated_at ?? null);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  const looksHtml = body.includes("<");
  const empty = !body.trim();

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        원칙, 금지사항, 마인드셋. 평소에는 읽기만 하고, 고칠 때 「수정」을
        누르세요.
      </p>

      {loading ? (
        <p className="text-sm text-zinc-500">불러오는 중…</p>
      ) : editing ? (
        <RichBodyEditor
          value={draft}
          onChange={setDraft}
          minHeight={320}
          onError={setError}
          placeholder={`예)\n- 원칙 세팅만 진입\n- 복수매매 금지\n이미지 붙여넣기도 가능`}
        />
      ) : (
        <div className="min-h-[280px] rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-3">
          {empty ? (
            <p className="text-sm text-zinc-600">아직 작성된 마인드가 없습니다.</p>
          ) : looksHtml ? (
            <RichBodyView html={body} />
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
              {body}
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-amber-300/80">
          {error}
          {(error.includes("does not exist") ||
            error.includes("schema cache")) &&
            " — Supabase에서 007_cash_mindset_posts.sql 을 실행하세요."}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {editing ? (
          <>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={cancelEdit}
              className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
            >
              취소
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={loading}
            onClick={startEdit}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500 disabled:opacity-50"
          >
            수정
          </button>
        )}
        {updatedAt && (
          <span className="text-xs text-zinc-600">
            마지막 저장 {formatKst(updatedAt)} KST
          </span>
        )}
      </div>
    </div>
  );
}
