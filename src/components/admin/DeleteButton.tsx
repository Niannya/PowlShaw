"use client";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/client-fetch";
export function DeleteButton({ endpoint, label = "删除" }: { endpoint: string; label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="admin-button"
      onClick={async () => {
        if (!window.confirm("确定删除？这个操作无法撤销。")) return;
        const { response, data } = await fetchJson<{ error?: string }>(endpoint, {
          method: "DELETE",
        });
        if (response?.ok) router.refresh();
        else alert(data.error || "删除失败，请检查网络连接后重试。");
      }}
    >
      {label}
    </button>
  );
}
