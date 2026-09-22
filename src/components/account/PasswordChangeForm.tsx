"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/client-fetch";

export function PasswordChangeForm({ returnPath = "/account" }: { returnPath?: string }) {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    setSuccess("");
    const { response, data: result } = await fetchJson<{ error?: string }>(
      "/api/account/password",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          current_password: data.get("current_password"),
          new_password: data.get("new_password"),
          confirm_password: data.get("confirm_password"),
        }),
      },
    );
    setBusy(false);
    if (!response?.ok) {
      return setError(
        result.error || (response ? "密码修改失败。" : "无法连接服务器，请稍后重试。"),
      );
    }
    form.reset();
    setSuccess("密码已经修改，其他设备上的旧登录状态已失效。");
    router.refresh();
    if (returnPath !== "/account") router.push(returnPath);
  }

  return (
    <form className="account-form" method="post" onSubmit={submit}>
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}
      <label>
        当前密码
        <input name="current_password" type="password" autoComplete="current-password" required />
      </label>
      <label>
        新密码（至少 8 位）
        <input
          name="new_password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      <label>
        再输入一次新密码
        <input
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      <button className="retro-button" disabled={busy}>
        {busy ? "正在修改……" : "修改密码"}
      </button>
    </form>
  );
}
