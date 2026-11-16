"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { EVENT_GROUPS, type EventGroup } from "@/lib/event-groups";
import { normalizeVisualTheme, VISUAL_THEMES, type VisualTheme } from "@/lib/visual-theme";
import { fetchJson } from "@/lib/client-fetch";

type Initial = {
  id?: number;
  title?: string;
  slug?: string;
  event_group?: EventGroup;
  summary?: string;
  content_html?: string;
  content_markdown?: string;
  starts_at?: string | null;
  ends_at?: string | null;
  status_override?: string | null;
  visual_theme?: string | null;
};

function toMonthInput(value?: string | null) {
  return value ? value.slice(0, 7) : "";
}

export function EventForm({ initial = {} }: { initial?: Initial }) {
  const router = useRouter();
  const [content, setContent] = useState(initial.content_html || "");
  const [markdown, setMarkdown] = useState(initial.content_markdown || "");
  const [visualTheme, setVisualTheme] = useState<VisualTheme>(
    normalizeVisualTheme(initial.visual_theme),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const payload = {
      title: form.get("title"),
      slug: form.get("slug"),
      event_group: form.get("event_group"),
      summary: form.get("summary"),
      content_html: content,
      content_markdown: markdown,
      starts_at: form.get("starts_at"),
      ends_at: form.get("ends_at"),
      status_override: form.get("status_override"),
      visual_theme: visualTheme,
    };

    const endpoint = initial.id ? `/api/v1/admin/events/${initial.id}` : "/api/v1/admin/events";
    const { response, data: result } = await fetchJson<{ error?: string }>(endpoint, {
      method: initial.id ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!response?.ok) {
      setError(result.error || "无法保存活动，请检查网络连接后重试。");
      return;
    }

    router.push("/admin/events");
    router.refresh();
  }

  return (
    <form className="admin-form" onSubmit={submit}>
      {error ? <p className="form-error">{error}</p> : null}
      <label>
        活动名称
        <input name="title" defaultValue={initial.title || ""} required />
      </label>
      <label>
        网址别名
        <input name="slug" defaultValue={initial.slug || ""} />
      </label>
      <label>
        活动类型
        <select name="event_group" defaultValue={initial.event_group || "other"}>
          {EVENT_GROUPS.map((group) => (
            <option value={group.id} key={group.id}>
              {group.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        活动简介
        <textarea name="summary" defaultValue={initial.summary || ""} />
      </label>
      <div className="inline">
        <label>
          开始时间
          <input type="month" name="starts_at" defaultValue={toMonthInput(initial.starts_at)} />
        </label>
        <label>
          结束时间
          <input type="month" name="ends_at" defaultValue={toMonthInput(initial.ends_at)} />
        </label>
        <label>
          状态
          <select name="status_override" defaultValue={initial.status_override || ""}>
            <option value="">根据时间自动判断</option>
            <option value="upcoming">即将开始</option>
            <option value="active">进行中</option>
            <option value="ended">已经结束</option>
          </select>
        </label>
      </div>
      <label>
        题头主题
        <select
          name="visual_theme"
          value={visualTheme}
          onChange={(event) => setVisualTheme(normalizeVisualTheme(event.target.value))}
        >
          {VISUAL_THEMES.map((theme) => (
            <option value={theme.value} key={theme.value}>
              {theme.label}
            </option>
          ))}
        </select>
      </label>
      <div className="admin-field admin-editor-field">
        <span className="admin-field-label">活动介绍</span>
        <RichTextEditor
          value={content}
          markdownValue={markdown}
          onChange={(html, source) => {
            setContent(html);
            setMarkdown(source);
          }}
        />
      </div>
      <div className="admin-actions">
        <button className="admin-button" disabled={busy}>
          {busy ? "保存中……" : "保存活动"}
        </button>
        <button type="button" className="admin-button" onClick={() => router.back()}>
          取消
        </button>
      </div>
    </form>
  );
}
