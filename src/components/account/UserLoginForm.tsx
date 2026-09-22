"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/client-fetch";
import { safeInternalPath } from "@/lib/safe-path";

export function UserLoginForm({ nextPath = "/" }: { nextPath?: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const { response, data: result } = await fetchJson<{
      error?: string;
      must_change_password?: boolean;
    }>("/api/account/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: data.get("username"), password: data.get("password") }),
    });
    setBusy(false);
    if (!response?.ok) {
      setError(result.error || (response ? "登录失败。" : "无法连接服务器，请稍后重试。"));
      return;
    }
    router.push(
      result.must_change_password
        ? `/account?first=1&next=${encodeURIComponent(safeInternalPath(nextPath))}`
        : safeInternalPath(nextPath),
    );
    router.refresh();
  }

  return (
    <form className="account-form" action="/api/account/login" method="post" onSubmit={submit}>
      {error ? <p className="form-error">{error}</p> : null}
      <input type="hidden" name="next" value={safeInternalPath(nextPath)} />
      <label>
        用户名
        <input name="username" autoComplete="username" required autoFocus />
      </label>
      <label>
        密码
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <button className="retro-button" disabled={busy}>
        {busy ? "正在登录……" : "登录"}
      </button>
    </form>
  );
}
