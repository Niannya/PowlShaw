"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { formatUtcDateTime } from "@/lib/date-time";
import { fetchJson } from "@/lib/client-fetch";

type UserRow = {
  id: number;
  username: string;
  display_name: string;
  admin_note: string;
  is_active: number;
  must_change_password: number;
  muted_until: string | null;
  mute_reason: string;
  last_login_at: string | null;
  created_at: string;
  comment_count: number;
  cookie_eaten: number;
  tea_drunk: number;
  cookie_broken: number;
  tea_broken: number;
};

function ExistingUser({ user }: { user: UserRow }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError("");
    const data = new FormData(form);
    const { response, data: result } = await fetchJson<{ error?: string }>(
      `/api/admin/users/${user.id}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          display_name: data.get("display_name"),
          admin_note: data.get("admin_note"),
          password: data.get("password"),
          is_active: data.get("is_active") === "on",
          muted_until: data.get("muted_until"),
          mute_reason: data.get("mute_reason"),
        }),
      },
    );
    setBusy(false);
    if (!response?.ok) {
      return setError(result.error || "保存失败，请检查网络连接后重试。");
    }
    (form.elements.namedItem("password") as HTMLInputElement).value = "";
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(`确定删除账号“${user.username}”？该账号的评论也会被删除。`)) return;
    const { response, data } = await fetchJson<{ error?: string }>(`/api/admin/users/${user.id}`, {
      method: "DELETE",
    });
    if (!response?.ok) {
      return setError(data.error || "删除失败，请检查网络连接后重试。");
    }
    router.refresh();
  }

  return (
    <form className="admin-user-row" method="post" onSubmit={update}>
      <div>
        <strong>{user.username}</strong>
        <small>
          创建于 {formatUtcDateTime(user.created_at)} · {user.comment_count} 条评论
          {user.last_login_at
            ? ` · 最近登录 ${formatUtcDateTime(user.last_login_at)}`
            : " · 尚未登录"}
          {user.must_change_password ? " · 等待用户修改初始密码" : ""}
        </small>
        <small className="admin-treat-stats">
          点心记录：吃掉饼干 {user.cookie_eaten} · 喝掉红茶 {user.tea_drunk} · 摔碎饼干{" "}
          {user.cookie_broken} · 摔碎茶杯 {user.tea_broken}
        </small>
      </div>
      <label>
        显示名称
        <input name="display_name" defaultValue={user.display_name} required maxLength={40} />
      </label>
      <label>
        重设密码（留空不改）
        <input name="password" type="password" autoComplete="new-password" minLength={8} />
      </label>
      <label className="admin-note-field">
        仅管理员可见的备注
        <textarea
          name="admin_note"
          defaultValue={user.admin_note}
          maxLength={500}
          rows={2}
          placeholder="例如：真实姓名、来自哪个群、联系方式等"
        />
      </label>
      <label>
        禁言至（留空表示未禁言）
        <input
          name="muted_until"
          type="datetime-local"
          defaultValue={user.muted_until?.slice(0, 16).replace(" ", "T") || ""}
        />
      </label>
      <label className="admin-note-field">
        禁言原因
        <input name="mute_reason" defaultValue={user.mute_reason} maxLength={500} />
      </label>
      <label className="admin-checkbox">
        <input name="is_active" type="checkbox" defaultChecked={Boolean(user.is_active)} /> 启用
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="admin-actions">
        <button className="admin-button" disabled={busy}>
          {busy ? "保存中……" : "保存"}
        </button>
        <button className="admin-button danger-button" type="button" onClick={remove}>
          删除
        </button>
      </div>
    </form>
  );
}

export function UserManager({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const { response, data: result } = await fetchJson<{ error?: string }>("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: data.get("username"),
        display_name: data.get("display_name"),
        admin_note: data.get("admin_note"),
        password: data.get("password"),
      }),
    });
    setBusy(false);
    if (!response?.ok) {
      return setError(result.error || "创建失败，请检查网络连接后重试。");
    }
    form.reset();
    router.refresh();
  }

  return (
    <>
      <section className="admin-card admin-user-create">
        <h2>创建评论账号</h2>
        <p>网站没有公开注册入口。请在这里为受邀用户创建账号，并通过私下渠道告知密码。</p>
        <form className="admin-form" method="post" onSubmit={create}>
          {error ? <p className="form-error">{error}</p> : null}
          <label>
            用户名（3—32 位）
            <input name="username" required minLength={3} maxLength={32} autoComplete="off" />
          </label>
          <label>
            公开显示名称
            <input name="display_name" required maxLength={40} />
          </label>
          <label>
            初始密码（至少 8 位）
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <label>
            仅管理员可见的备注（可留空）
            <textarea
              name="admin_note"
              maxLength={500}
              rows={3}
              placeholder="例如：真实姓名、来自哪个群、联系方式等"
            />
          </label>
          <button className="admin-button" disabled={busy}>
            {busy ? "正在创建……" : "创建账号"}
          </button>
        </form>
      </section>

      <h2>已有账号（{users.length}）</h2>
      <div className="admin-user-list">
        {users.map((user) => (
          <ExistingUser key={user.id} user={user} />
        ))}
        {!users.length ? <p>尚未创建任何评论账号。</p> : null}
      </div>
    </>
  );
}
