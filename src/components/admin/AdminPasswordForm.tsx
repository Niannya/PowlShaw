"use client";

import { FormEvent, useState } from "react";
import { fetchJson } from "@/lib/client-fetch";

export function AdminPasswordForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage("");
    setIsError(false);

    const { response, data: result } = await fetchJson<{ error?: string }>("/api/admin/password", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        current_password: data.get("current_password"),
        new_password: data.get("new_password"),
        confirm_password: data.get("confirm_password"),
      }),
    });
    setBusy(false);

    if (!response?.ok) {
      setIsError(true);
      setMessage(result.error || (response ? "修改密码失败。" : "无法连接服务器，请稍后重试。"));
      return;
    }

    form.reset();
    setMessage("管理员密码已修改，其他设备上的后台登录状态已经失效。");
  }

  return (
    <form className="admin-form" onSubmit={submit}>
      <label>
        当前密码
        <input
          type="password"
          name="current_password"
          autoComplete="current-password"
          required
          autoFocus
        />
      </label>
      <label>
        新密码
        <input
          type="password"
          name="new_password"
          autoComplete="new-password"
          minLength={8}
          maxLength={200}
          required
        />
      </label>
      <label>
        再输入一次新密码
        <input
          type="password"
          name="confirm_password"
          autoComplete="new-password"
          minLength={8}
          maxLength={200}
          required
        />
      </label>
      <p>密码至少 8 位。修改后，其他设备上已经登录的后台会话会失效。</p>
      {message ? <p className={isError ? "form-error" : "form-success"}>{message}</p> : null}
      <button className="admin-button" disabled={busy}>
        {busy ? "正在修改……" : "修改管理员密码"}
      </button>
    </form>
  );
}
