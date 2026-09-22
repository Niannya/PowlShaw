"use client";

import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/client-fetch";

export function CommentDeleteButton({ commentId }: { commentId: number }) {
  const router = useRouter();
  return (
    <button
      className="text-button"
      onClick={async () => {
        if (!window.confirm("确定删除这条评论？")) return;
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
  );
}
