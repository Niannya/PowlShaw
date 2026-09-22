"use client";
import { useState } from "react";
import { fetchJson } from "@/lib/client-fetch";
export function ImageUpload({ onUploaded }: { onUploaded: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <input
      type="file"
      accept="image/jpeg,image/png,image/gif,image/webp"
      disabled={busy}
      onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setBusy(true);
        const data = new FormData();
        data.set("file", file);
        const { response, data: result } = await fetchJson<{ error?: string; url?: string }>(
          "/api/admin/upload",
          { method: "POST", body: data },
        );
        setBusy(false);
        if (!response?.ok || !result.url) {
          alert(result.error || "上传失败，请检查网络连接后重试。");
          return;
        }
        onUploaded(result.url);
      }}
    />
  );
}
