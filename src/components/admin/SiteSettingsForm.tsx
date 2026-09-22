"use client";

import { FormEvent, useState } from "react";
import { fetchJson } from "@/lib/client-fetch";

export type EditableSiteSettings = {
  welcome_title: string;
  welcome_opening: string;
  welcome_about_link: string;
  welcome_random_link: string;
  welcome_treat_prefix: string;
  welcome_cookie_button: string;
  welcome_tea_button: string;
  welcome_treat_suffix: string;
  welcome_closing: string;
  welcome_visit_prefix: string;
  welcome_visit_suffix: string;
  announcement_enabled: string;
  announcement_title: string;
  announcement_body: string;
  announcement_link_label: string;
  announcement_link_url: string;
};

export function SiteSettingsForm({ initial }: { initial: EditableSiteSettings }) {
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function update(key: keyof EditableSiteSettings, value: string) {
    setSettings((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const { response, data: result } = await fetchJson<{ error?: string }>("/api/admin/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings),
    });
    setBusy(false);
    setMessage(
      response?.ok ? "站点设置已保存。" : result.error || "保存失败，请检查网络连接后重试。",
    );
  }

  return (
    <form className="admin-form site-settings-form" onSubmit={submit}>
      <fieldset>
        <legend>首页欢迎区</legend>
        <p className="settings-help">
          这里的字段按首页从上到下排列；饼干、红茶和访问次数功能不受修改影响。
        </p>
        <div className="settings-fields">
          <label>
            欢迎区标题
            <input
              value={settings.welcome_title}
              maxLength={50}
              onChange={(event) => update("welcome_title", event.target.value)}
            />
          </label>
          <label>
            第一行文字
            <input
              value={settings.welcome_opening}
              maxLength={200}
              onChange={(event) => update("welcome_opening", event.target.value)}
            />
          </label>
          <div className="inline settings-inline-text">
            <label>
              “关于破晓”链接文字
              <input
                value={settings.welcome_about_link}
                maxLength={80}
                onChange={(event) => update("welcome_about_link", event.target.value)}
              />
            </label>
            <label>
              “随机文章”链接文字
              <input
                value={settings.welcome_random_link}
                maxLength={80}
                onChange={(event) => update("welcome_random_link", event.target.value)}
              />
            </label>
          </div>
          <div className="inline settings-inline-text">
            <label>
              点心行开头
              <input
                value={settings.welcome_treat_prefix}
                maxLength={80}
                onChange={(event) => update("welcome_treat_prefix", event.target.value)}
              />
            </label>
            <label>
              饼干按钮
              <input
                value={settings.welcome_cookie_button}
                maxLength={40}
                onChange={(event) => update("welcome_cookie_button", event.target.value)}
              />
            </label>
            <label>
              红茶按钮
              <input
                value={settings.welcome_tea_button}
                maxLength={40}
                onChange={(event) => update("welcome_tea_button", event.target.value)}
              />
            </label>
            <label>
              点心行结尾
              <input
                value={settings.welcome_treat_suffix}
                maxLength={40}
                onChange={(event) => update("welcome_treat_suffix", event.target.value)}
              />
            </label>
          </div>
          <label>
            结束语
            <input
              value={settings.welcome_closing}
              maxLength={300}
              onChange={(event) => update("welcome_closing", event.target.value)}
            />
          </label>
          <div className="inline settings-inline-text">
            <label>
              访问次数前文字
              <input
                value={settings.welcome_visit_prefix}
                maxLength={100}
                onChange={(event) => update("welcome_visit_prefix", event.target.value)}
              />
            </label>
            <label>
              访问次数后文字
              <input
                value={settings.welcome_visit_suffix}
                maxLength={100}
                onChange={(event) => update("welcome_visit_suffix", event.target.value)}
              />
            </label>
          </div>
        </div>
      </fieldset>
      <fieldset>
        <legend>首页公告</legend>
        <div className="settings-fields">
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={settings.announcement_enabled === "1"}
              onChange={(event) => update("announcement_enabled", event.target.checked ? "1" : "0")}
            />
            在首页显示公告
          </label>
          <label>
            公告标题
            <input
              value={settings.announcement_title}
              maxLength={50}
              onChange={(event) => update("announcement_title", event.target.value)}
            />
          </label>
          <label>
            公告正文
            <textarea
              value={settings.announcement_body}
              maxLength={1000}
              onChange={(event) => update("announcement_body", event.target.value)}
            />
          </label>
          <div className="inline">
            <label>
              链接文字（可留空）
              <input
                value={settings.announcement_link_label}
                maxLength={50}
                onChange={(event) => update("announcement_link_label", event.target.value)}
              />
            </label>
            <label>
              链接地址（可留空）
              <input
                value={settings.announcement_link_url}
                maxLength={300}
                placeholder="/events/… 或 https://…"
                onChange={(event) => update("announcement_link_url", event.target.value)}
              />
            </label>
          </div>
        </div>
      </fieldset>
      {message ? (
        <p className={message.includes("失败") ? "form-error" : "form-success"}>{message}</p>
      ) : null}
      <button className="admin-button" disabled={busy}>
        {busy ? "保存中……" : "保存首页设置"}
      </button>
    </form>
  );
}
