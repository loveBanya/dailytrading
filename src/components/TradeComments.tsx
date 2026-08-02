"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export interface TradeComment {
  id: string;
  trade_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

interface TradeCommentsProps {
  tradeId: string;
  /** 예전 단일 메모 — 댓글이 없을 때 한 번 옮기는 용도 */
  legacyNotes?: string | null;
  onCountChange?: (count: number) => void;
  /** 등록/수정/삭제 후 — 검색 인덱스 갱신용 */
  onMutated?: () => void;
}

export function TradeComments({
  tradeId,
  legacyNotes,
  onCountChange,
  onMutated,
}: TradeCommentsProps) {
  const [comments, setComments] = useState<TradeComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trades/comments?tradeId=${tradeId}`);
      const data = (await res.json()) as {
        comments?: TradeComment[];
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      let list = data.comments ?? [];

      // 예전 notes가 있고 댓글이 없으면 한 번 이전
      if (list.length === 0 && legacyNotes?.trim()) {
        const mig = await fetch("/api/trades/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tradeId,
            body: legacyNotes.trim(),
          }),
        });
        const migData = (await mig.json()) as {
          comment?: TradeComment;
          error?: string;
        };
        if (!migData.error && migData.comment) {
          list = [migData.comment];
          // 예전 notes 비우기
          await fetch("/api/trades", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: tradeId, notes: "" }),
          });
        }
      }

      setComments(list);
      onCountChange?.(list.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, [tradeId, legacyNotes, onCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const roots = useMemo(
    () => comments.filter((c) => !c.parent_id),
    [comments]
  );

  const repliesOf = useCallback(
    (parentId: string) => comments.filter((c) => c.parent_id === parentId),
    [comments]
  );

  async function postComment(body: string, parentId?: string | null) {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/trades/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tradeId,
          body: body.trim(),
          parentId: parentId ?? null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (data.error) throw new Error(data.error);
      if (parentId) {
        setReplyTo(null);
        setReplyDraft("");
      } else {
        setDraft("");
      }
      await load();
      onMutated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "등록 실패");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: string) {
    if (!editDraft.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/trades/comments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, body: editDraft.trim() }),
      });
      const data = (await res.json()) as { error?: string };
      if (data.error) throw new Error(data.error);
      setEditingId(null);
      await load();
      onMutated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "수정 실패");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("이 댓글을 삭제할까요? (답글도 함께 삭제됩니다)")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/trades/comments?id=${id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (data.error) throw new Error(data.error);
      await load();
      onMutated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-zinc-800 px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-medium text-zinc-400">
          댓글 {comments.length > 0 ? `(${comments.length})` : ""}
        </h3>
      </div>

      {loading && (
        <p className="mb-3 text-xs text-zinc-500">댓글 불러오는 중…</p>
      )}
      {error && (
        <p className="mb-3 text-xs text-amber-300/80">
          {error}
          {(error.includes("does not exist") ||
            error.includes("schema cache")) &&
            " — Supabase에서 004_trade_comments.sql 을 실행하세요."}
        </p>
      )}

      <div className="mb-4 space-y-3">
        {roots.map((c) => (
          <CommentItem
            key={c.id}
            comment={c}
            replies={repliesOf(c.id)}
            busy={busy}
            replyTo={replyTo}
            replyDraft={replyDraft}
            editingId={editingId}
            editDraft={editDraft}
            onReply={() => {
              setReplyTo(c.id);
              setReplyDraft("");
              setEditingId(null);
            }}
            onCancelReply={() => setReplyTo(null)}
            onReplyDraftChange={setReplyDraft}
            onSubmitReply={() => void postComment(replyDraft, c.id)}
            onEdit={() => {
              setEditingId(c.id);
              setEditDraft(c.body);
              setReplyTo(null);
            }}
            onEditDraftChange={setEditDraft}
            onSaveEdit={() => void saveEdit(c.id)}
            onCancelEdit={() => setEditingId(null)}
            onDelete={() => void remove(c.id)}
            onEditReply={(r) => {
              setEditingId(r.id);
              setEditDraft(r.body);
              setReplyTo(null);
            }}
            onDeleteReply={(id) => void remove(id)}
            onSaveReplyEdit={() => void saveEdit(editingId!)}
          />
        ))}

        {!loading && roots.length === 0 && !error && (
          <p className="text-xs text-zinc-600">아직 댓글이 없습니다.</p>
        )}
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="새 댓글을 입력하세요…"
          className="w-full resize-y rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            disabled={busy || !draft.trim()}
            onClick={() => void postComment(draft)}
            className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {busy ? "등록 중…" : "댓글 등록"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentItem({
  comment,
  replies,
  busy,
  replyTo,
  replyDraft,
  editingId,
  editDraft,
  onReply,
  onCancelReply,
  onReplyDraftChange,
  onSubmitReply,
  onEdit,
  onEditDraftChange,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onEditReply,
  onDeleteReply,
  onSaveReplyEdit,
}: {
  comment: TradeComment;
  replies: TradeComment[];
  busy: boolean;
  replyTo: string | null;
  replyDraft: string;
  editingId: string | null;
  editDraft: string;
  onReply: () => void;
  onCancelReply: () => void;
  onReplyDraftChange: (v: string) => void;
  onSubmitReply: () => void;
  onEdit: () => void;
  onEditDraftChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onEditReply: (c: TradeComment) => void;
  onDeleteReply: (id: string) => void;
  onSaveReplyEdit: () => void;
}) {
  return (
    <div className="rounded-md border border-zinc-800/80 bg-zinc-950/30 px-3 py-2.5">
      {editingId === comment.id ? (
        <div>
          <textarea
            value={editDraft}
            onChange={(e) => onEditDraftChange(e.target.value)}
            rows={2}
            className="w-full resize-y rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500/50"
          />
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onSaveEdit}
              className="text-xs text-emerald-400 hover:text-emerald-300"
            >
              저장
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">
            {comment.body}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-zinc-600">
            <time dateTime={comment.created_at}>
              {new Date(comment.created_at).toLocaleString("ko-KR")}
            </time>
            <button
              type="button"
              onClick={onReply}
              className="hover:text-emerald-400"
            >
              답글
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="hover:text-zinc-300"
            >
              수정
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="hover:text-rose-400"
            >
              삭제
            </button>
          </div>
        </>
      )}

      {replies.length > 0 && (
        <div className="mt-3 space-y-2 border-l border-zinc-800 pl-3">
          {replies.map((r) => (
            <div key={r.id} className="py-1">
              {editingId === r.id ? (
                <div>
                  <textarea
                    value={editDraft}
                    onChange={(e) => onEditDraftChange(e.target.value)}
                    rows={2}
                    className="w-full resize-y rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500/50"
                  />
                  <div className="mt-1.5 flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={onSaveReplyEdit}
                      className="text-xs text-emerald-400"
                    >
                      저장
                    </button>
                    <button
                      type="button"
                      onClick={onCancelEdit}
                      className="text-xs text-zinc-500"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="whitespace-pre-wrap text-sm text-zinc-300">
                    {r.body}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-zinc-600">
                    <time>
                      {new Date(r.created_at).toLocaleString("ko-KR")}
                    </time>
                    <button
                      type="button"
                      onClick={() => onEditReply(r)}
                      className="hover:text-zinc-300"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteReply(r.id)}
                      className="hover:text-rose-400"
                    >
                      삭제
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {replyTo === comment.id && (
        <div className="mt-3 border-l border-emerald-500/30 pl-3">
          <textarea
            value={replyDraft}
            onChange={(e) => onReplyDraftChange(e.target.value)}
            rows={2}
            placeholder="답글을 입력하세요…"
            className="w-full resize-y rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500/50"
            autoFocus
          />
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              disabled={busy || !replyDraft.trim()}
              onClick={onSubmitReply}
              className="rounded bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-zinc-950 disabled:opacity-50"
            >
              답글 등록
            </button>
            <button
              type="button"
              onClick={onCancelReply}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
