"use client";

import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/client-fetch";

export function UserLogoutButton() {
  const router = useRouter();
  return (
    <button
      className="text-button"
      onClick={async () => {
        const { response } = await fetchJson("/api/account/logout", { method: "POST" });
        if (response?.ok) router.refresh();
      }}
    >
      退出登录
    </button>
  );
}
