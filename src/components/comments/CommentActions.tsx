"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CommentForm } from "@/components/comments/CommentForm";
import { COMMENT_MAX_LENGTH } from "@/lib/comment-rules";
import { fetchJson } from "@/lib/client-fetch";

export function CommentActions({
  articleId,
  commentId,
  content,
  owned,
  editable,
  replyable,
}: {
  articleId: number;
  commentId: number;
  content: string;
  owned: boolean;
  editable: boolean;
  replyable: boolean;
}) {
  const [mode, setMode] = useState<"" | "edit" | "reply">("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function saveEdit() {
    const value = (document.getElementById(`edit-comment-${commentId}`) as HTMLTextAreaElement)
      .value;
    setBusy(true);
    setError("");
    const { response, data: result } = await fetchJson<{ error?: string }>(
      `/api/comments/${commentId}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: value }),
      },
    );
    setBusy(false);
    if (!response?.ok) return setError(result.error || "保存失败，请检查网络连接后重试。");
    setMode("");
    router.refresh();
  }

  return (
    <>
      <span className="comment-actions">
        {replyable ? (
          <button className="text-button" onClick={() => setMode(mode === "reply" ? "" : "reply")}>
            回复
          </button>
        ) : null}
        {owned && editable ? (
          <button className="text-button" onClick={() => setMode(mode === "edit" ? "" : "edit")}>
            编辑
          </button>
        ) : null}
        {owned ? (
          <button
            className="text-button"
            onClick={async () => {
              if (!window.confirm("确定删除这条评论？管理员可以从回收状态恢复。")) return;
              const { response, data } = await fetchJson<{ error?: string }>(
                `/api/comments/${commentId}`,
                { method: "DELETE" },
              );
              if (response?.ok) router.refresh();
              else alert(data.error || "删除失败，请检查网络连接后重试。");
            }}
          >
            删除
          </button>
        ) : null}
      </span>
      {mode === "edit" ? (
        <div className="comment-inline-editor">
          {error ? <p className="form-error">{error}</p> : null}
          <textarea
            id={`edit-comment-${commentId}`}
            defaultValue={content}
            maxLength={COMMENT_MAX_LENGTH}
            rows={4}
          />
          <div className="admin-actions">
            <button className="retro-button" disabled={busy} onClick={saveEdit}>
              {busy ? "保存中……" : "保存修改"}
            </button>
            <button className="text-button" onClick={() => setMode("")}>
              取消
            </button>
          </div>
        </div>
      ) : null}
      {mode === "reply" ? (
        <div className="comment-inline-editor">
          <CommentForm
            articleId={articleId}
            parentId={commentId}
            compact
            onDone={() => setMode("")}
          />
        </div>
      ) : null}
    </>
  );
}
