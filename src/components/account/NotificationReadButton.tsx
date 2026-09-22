"use client";

import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/client-fetch";

export function NotificationReadButton() {
  const router = useRouter();
  return (
    <button
      className="retro-button"
      onClick={async () => {
        const { response } = await fetchJson("/api/account/notifications/read", { method: "POST" });
        if (response?.ok) router.refresh();
      }}
    >
      全部标为已读
    </button>
  );
}
