"use client";

import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/client-fetch";

export function CommentAdminActions({
  id,
  status,
  pinned,
  deleted,
}: {
  id: number;
  status: string;
  pinned: boolean;
  deleted: boolean;
}) {
  const router = useRouter();
  async function update(body: Record<string, unknown>) {
    const { response, data } = await fetchJson<{ error?: string }>(`/api/admin/comments/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response?.ok) router.refresh();
    else alert(data.error || "操作失败，请检查网络连接后重试。");
  }
  async function remove(permanent = false) {
    if (!window.confirm(permanent ? "确定永久删除？此操作无法恢复。" : "移入回收状态？")) return;
    const { response, data } = await fetchJson<{ error?: string }>(
      `/api/admin/comments/${id}${permanent ? "?permanent=1" : ""}`,
      { method: "DELETE" },
    );
    if (response?.ok) router.refresh();
    else alert(data.error || "删除失败，请检查网络连接后重试。");
  }
  return (
    <div className="admin-actions">
      <button className="admin-button" onClick={() => update({ is_pinned: !pinned })}>
        {pinned ? "取消置顶" : "置顶"}
      </button>
      <button
        className="admin-button"
        onClick={() => update({ status: status === "visible" ? "hidden" : "visible" })}
      >
        {status === "visible" ? "隐藏" : "公开"}
      </button>
      {deleted ? (
        <>
          <button className="admin-button" onClick={() => update({ action: "restore" })}>
            恢复
          </button>
          <button className="admin-button danger-button" onClick={() => remove(true)}>
            永久删除
          </button>
        </>
      ) : (
        <button className="admin-button danger-button" onClick={() => remove(false)}>
          删除
        </button>
      )}
    </div>
  );
}
