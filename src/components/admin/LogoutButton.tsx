"use client";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/client-fetch";
export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="admin-button"
      onClick={async () => {
        const { response } = await fetchJson("/api/admin/logout", { method: "POST" });
        if (!response?.ok) return;
        router.push("/admin/login");
        router.refresh();
      }}
    >
      退出登录
    </button>
  );
}
