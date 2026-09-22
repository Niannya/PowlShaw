"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { COMMENT_MAX_LENGTH } from "@/lib/comment-rules";
import { fetchJson } from "@/lib/client-fetch";

export function CommentForm({
  articleId,
  parentId,
  compact = false,
  onDone,
}: {
  articleId: number;
  parentId?: number;
  compact?: boolean;
  onDone?: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const { response, data: result } = await fetchJson<{ error?: string }>("/api/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        article_id: articleId,
        parent_id: parentId || null,
        content: data.get("content"),
      }),
    });
    setBusy(false);
    if (!response?.ok) {
      setError(result.error || "评论发布失败，请检查网络连接后重试。");
      return;
    }
    form.reset();
    onDone?.();
    router.refresh();
  }

  return (
    <form className="comment-form" onSubmit={submit}>
      {error ? <p className="form-error">{error}</p> : null}
      <label htmlFor={parentId ? `reply-content-${parentId}` : "comment-content"}>
        {parentId ? "写下回复" : "写下评论"}
      </label>
      <textarea
        id={parentId ? `reply-content-${parentId}` : "comment-content"}
        name="content"
        maxLength={COMMENT_MAX_LENGTH}
        rows={compact ? 3 : 5}
        required
      />
      <div className="comment-form-footer">
        <span>最多 {COMMENT_MAX_LENGTH} 字</span>
        <button className="retro-button" disabled={busy}>
          {busy ? "正在发布……" : "发表评论"}
        </button>
      </div>
    </form>
  );
}
