"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { EVENT_GROUPS, type EventGroup } from "@/lib/event-groups";
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
  banner_url?: string | null;
};

function toMonthInput(value?: string | null) {
  return value ? value.slice(0, 7) : "";
}

export function EventForm({ initial = {} }: { initial?: Initial }) {
  const router = useRouter();
  const [content, setContent] = useState(initial.content_html || "");
  const [markdown, setMarkdown] = useState(initial.content_markdown || "");
  const [banner, setBanner] = useState(initial.banner_url || "");
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
      banner_url: banner,
    };

    const endpoint = initial.id ? `/api/admin/events/${initial.id}` : "/api/admin/events";
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
        横幅图片地址
        <input value={banner} onChange={(e) => setBanner(e.target.value)} />
      </label>
      <ImageUpload onUploaded={setBanner} />
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
