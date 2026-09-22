"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/client-fetch";

export function LoginForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const { response, data: result } = await fetchJson<{ error?: string }>("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: data.get("username"), password: data.get("password") }),
    });
    setBusy(false);
    if (!response?.ok) {
      setError(result.error || (response ? "登录失败。" : "无法连接服务器，请稍后重试。"));
      return;
    }
    router.push("/admin");
    router.refresh();
  }
  return (
    <form className="admin-form" action="/api/admin/login" method="post" onSubmit={submit}>
      {error ? <p className="form-error">{error}</p> : null}
      <label>
        用户名
        <input name="username" autoComplete="username" defaultValue="admin" required />
      </label>
      <label>
        密码
        <input type="password" name="password" autoComplete="current-password" required autoFocus />
      </label>
      <button className="admin-button" disabled={busy}>
        {busy ? "正在登录……" : "登录"}
      </button>
    </form>
  );
}
