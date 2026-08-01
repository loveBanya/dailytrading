"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { JournalPost } from "@/app/api/posts/route";
import type { JournalPostComment } from "@/app/api/posts/comments/route";
import { formatKst } from "@/lib/utils/format";
import { richBodyIsEmpty, sanitizeRichHtml } from "@/lib/utils/rich-body";
import { RichBodyEditor, RichBodyView } from "./RichBodyEditor";

export function JournalPostsPanel() {
  const [posts, setPosts] = useState<JournalPost[]>([]);
  const [onlyFav, setOnlyFav] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = onlyFav ? "?favorites=1" : "";
      const res = await fetch(`/api/posts${qs}`);
      const data = (await res.json()) as {
        posts?: JournalPost[];
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setPosts(data.posts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, [onlyFav]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createPost() {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const clean = sanitizeRichHtml(body);
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: clean,
          images: [],
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (data.error) throw new Error(data.error);
      setTitle("");
      setBody("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "작성 실패");
    } finally {
      setBusy(false);
    }
  }

  async function toggleFavorite(post: JournalPost) {
    setBusy(true);
    try {
      const res = await fetch("/api/posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: post.id,
          is_favorite: !post.is_favorite,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (data.error) throw new Error(data.error);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "즐겨찾기 실패");
    } finally {
      setBusy(false);
    }
  }

  async function removePost(id: string) {
    if (!confirm("이 글을 삭제할까요? (댓글도 함께 삭제)")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/posts?id=${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (data.error) throw new Error(data.error);
      if (openId === id) setOpenId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setBusy(false);
    }
  }

  function hasInlineImage(html: string): boolean {
    return /<img\b/i.test(html);
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-500">
        매매 후기·메모를 글로 남깁니다. 이미지는 본문에 바로 붙여넣기(Ctrl+V)
        하거나 「이미지 넣기」로 삽입하세요.
      </p>

      <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목"
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/50"
        />
        <RichBodyEditor
          value={body}
          onChange={setBody}
          minHeight={180}
          onError={setError}
          placeholder="내용을 입력하세요. 스크린샷을 Ctrl+V 로 붙여넣으면 글 안에 들어갑니다."
        />
        <div className="flex justify-end">
          <button
            type="button"
            disabled={busy || !title.trim() || richBodyIsEmpty(body)}
            onClick={() => void createPost()}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            게시
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOnlyFav(false)}
          className={`rounded-md border px-3 py-1.5 text-xs ${
            !onlyFav
              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
              : "border-zinc-700 text-zinc-500"
          }`}
        >
          전체
        </button>
        <button
          type="button"
          onClick={() => setOnlyFav(true)}
          className={`rounded-md border px-3 py-1.5 text-xs ${
            onlyFav
              ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
              : "border-zinc-700 text-zinc-500"
          }`}
        >
          즐겨찾기
        </button>
      </div>

      {loading && <p className="text-sm text-zinc-500">불러오는 중…</p>}
      {error && (
        <p className="text-sm text-amber-300/80">
          {error}
          {(error.includes("does not exist") ||
            error.includes("schema cache")) &&
            " — Supabase에서 007_cash_mindset_posts.sql 을 실행하세요."}
        </p>
      )}

      <div className="space-y-4">
        {posts.map((post) => (
          <article
            key={post.id}
            className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40"
          >
            <button
              type="button"
              onClick={() =>
                setOpenId((id) => (id === post.id ? null : post.id))
              }
              className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-900/60"
            >
              <div className="min-w-0">
                <h3 className="font-medium text-zinc-100">
                  {post.is_favorite && (
                    <span className="mr-1 text-amber-400">★</span>
                  )}
                  {post.title}
                </h3>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {formatKst(post.created_at)} KST
                  {(post.comment_count ?? 0) > 0 &&
                    ` · 댓글 ${post.comment_count}`}
                  {(hasInlineImage(post.body) || post.images?.length > 0) &&
                    " · 이미지"}
                </p>
              </div>
              <span className="shrink-0 text-xs text-zinc-500">
                {openId === post.id ? "접기 ▲" : "펼치기 ▼"}
              </span>
            </button>

            {openId === post.id && (
              <div className="space-y-4 border-t border-zinc-800 px-4 py-4">
                {post.body.includes("<") ? (
                  <RichBodyView html={post.body} />
                ) : (
                  post.body && (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                      {post.body}
                    </p>
                  )
                )}
                {/* 예전 첨부 방식 호환 */}
                {post.images?.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {post.images.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={src}
                        alt=""
                        className="max-h-64 w-full rounded-md object-cover"
                      />
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleFavorite(post)}
                    className={`rounded-md border px-3 py-1.5 text-xs ${
                      post.is_favorite
                        ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                        : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {post.is_favorite ? "★ 즐겨찾기됨" : "☆ 즐겨찾기"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removePost(post.id)}
                    className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-500 hover:border-rose-500/40 hover:text-rose-400"
                  >
                    삭제
                  </button>
                </div>

                <PostComments postId={post.id} onChanged={() => void load()} />
              </div>
            )}
          </article>
        ))}
      </div>

      {!loading && posts.length === 0 && !error && (
        <p className="text-sm text-zinc-500">아직 글이 없습니다.</p>
      )}
    </div>
  );
}

function PostComments({
  postId,
  onChanged,
}: {
  postId: string;
  onChanged: () => void;
}) {
  const [comments, setComments] = useState<JournalPostComment[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts/comments?postId=${postId}`);
      const data = (await res.json()) as {
        comments?: JournalPostComment[];
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setComments(data.comments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "댓글 불러오기 실패");
    }
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  const roots = useMemo(
    () => comments.filter((c) => !c.parent_id),
    [comments]
  );

  async function post(body: string, parentId?: string | null) {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/posts/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, body: body.trim(), parentId }),
      });
      const data = (await res.json()) as { error?: string };
      if (data.error) throw new Error(data.error);
      setDraft("");
      setReplyDraft("");
      setReplyTo(null);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "등록 실패");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("댓글을 삭제할까요?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/posts/comments?id=${id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (data.error) throw new Error(data.error);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-zinc-800 pt-4">
      <h4 className="mb-3 text-xs font-medium text-zinc-400">
        댓글 {comments.length > 0 ? `(${comments.length})` : ""}
      </h4>
      {error && <p className="mb-2 text-xs text-amber-300/80">{error}</p>}

      <div className="mb-3 space-y-3">
        {roots.map((c) => {
          const replies = comments.filter((r) => r.parent_id === c.id);
          return (
            <div key={c.id} className="space-y-2">
              <CommentRow
                comment={c}
                onReply={() => setReplyTo(c.id)}
                onDelete={() => void remove(c.id)}
              />
              {replies.map((r) => (
                <div key={r.id} className="ml-4 border-l border-zinc-800 pl-3">
                  <CommentRow
                    comment={r}
                    onDelete={() => void remove(r.id)}
                  />
                </div>
              ))}
              {replyTo === c.id && (
                <div className="ml-4 flex gap-2">
                  <input
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    placeholder="답글"
                    className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 outline-none"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void post(replyDraft, c.id)}
                    className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300"
                  >
                    등록
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="댓글 작성"
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500/50"
          onKeyDown={(e) => {
            if (e.key === "Enter") void post(draft);
          }}
        />
        <button
          type="button"
          disabled={busy || !draft.trim()}
          onClick={() => void post(draft)}
          className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
        >
          등록
        </button>
      </div>
    </div>
  );
}

function CommentRow({
  comment,
  onReply,
  onDelete,
}: {
  comment: JournalPostComment;
  onReply?: () => void;
  onDelete: () => void;
}) {
  return (
    <div>
      <p className="whitespace-pre-wrap text-sm text-zinc-300">{comment.body}</p>
      <div className="mt-1 flex gap-3 text-[11px] text-zinc-600">
        <time>{formatKst(comment.created_at)}</time>
        {onReply && (
          <button
            type="button"
            onClick={onReply}
            className="hover:text-zinc-400"
          >
            답글
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="hover:text-rose-400"
        >
          삭제
        </button>
      </div>
    </div>
  );
}
