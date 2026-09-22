"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { FormEvent, useState } from "react";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { fetchJson } from "@/lib/client-fetch";
import type { EventMapSettings } from "@/lib/event-map-settings";

type FormState = Omit<EventMapSettings, "event_id" | "is_enabled"> & { is_enabled: boolean };

export function EventMapSettingsForm({
  eventId,
  eventSlug,
  initial,
}: {
  eventId: number;
  eventSlug: string;
  initial: EventMapSettings;
}) {
  const [settings, setSettings] = useState<FormState>({
    ...initial,
    is_enabled: Boolean(initial.is_enabled),
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  function applyUploadedImage(url: string) {
    const image = new Image();
    image.onload = () => {
      setSettings((current) => ({
        ...current,
        image_url: url,
        image_width: image.naturalWidth,
        image_height: image.naturalHeight,
      }));
      setIsError(false);
      setMessage(
        `地图已上传并读取尺寸：${image.naturalWidth} × ${image.naturalHeight}。请保存设置。`,
      );
    };
    image.onerror = () => {
      setIsError(true);
      setMessage("图片已经上传，但浏览器无法读取尺寸，请重新选择图片。");
    };
    image.src = url;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setIsError(false);
    const { response, data } = await fetchJson<{ error?: string }>(
      `/api/admin/events/${eventId}/map`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      },
    );
    setBusy(false);
    if (!response?.ok) {
      setIsError(true);
      setMessage(data.error || "专题地图设置保存失败，请检查网络连接后重试。");
      return;
    }
    setMessage("专题地图设置已保存，刷新专题页即可看到结果。");
  }

  return (
    <section className="admin-card event-map-settings">
      <div className="event-map-settings-heading">
        <h2>列国纪专题设置</h2>
        <div className="admin-actions">
          <Link className="admin-event-action-link" href={`/events/${eventSlug}`} target="_blank">
            查看专题页 ↗
          </Link>
          {settings.is_enabled && settings.image_url ? (
            <Link
              className="admin-event-action-link"
              href={`/events/${eventSlug}/map`}
              target="_blank"
            >
              查看地图页 ↗
            </Link>
          ) : null}
        </div>
      </div>

      <form className="admin-form event-map-settings-form" onSubmit={submit}>
        <fieldset>
          <legend>世界地图</legend>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={settings.is_enabled}
              onChange={(event) => update("is_enabled", event.target.checked)}
            />
            在专题页显示世界地图并开放独立地图页
          </label>

          {settings.image_url ? (
            <div className="event-map-settings-preview">
              <img src={settings.image_url} alt="当前世界地图预览" />
              <p>
                当前图片：{settings.image_width} × {settings.image_height}
              </p>
            </div>
          ) : (
            <p className="empty-note">尚未上传地图图片。</p>
          )}

          <label>
            地图图片地址
            <input value={settings.image_url} readOnly placeholder="上传后自动填写" />
          </label>
          <div className="event-map-upload-row">
            <span>上传或替换地图（JPG、PNG、GIF、WebP，最大 5MB）</span>
            <ImageUpload onUploaded={applyUploadedImage} />
            {settings.image_url ? (
              <button
                type="button"
                className="admin-button"
                onClick={() => {
                  setSettings((current) => ({
                    ...current,
                    is_enabled: false,
                    image_url: "",
                    image_width: 1,
                    image_height: 1,
                  }));
                  setIsError(false);
                  setMessage("已从表单中清除地图；点击“保存专题设置”后生效。");
                }}
              >
                清除地图
              </button>
            ) : null}
          </div>
          <label>
            图片替代文字
            <input
              value={settings.image_alt}
              maxLength={300}
              onChange={(event) => update("image_alt", event.target.value)}
            />
          </label>
          <label>
            独立地图页标题
            <input
              value={settings.map_title}
              maxLength={120}
              onChange={(event) => update("map_title", event.target.value)}
            />
          </label>
          <label>
            独立地图页说明
            <textarea
              value={settings.map_description}
              maxLength={500}
              onChange={(event) => update("map_description", event.target.value)}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>专题页标题</legend>
          <label>
            活动标题上方小字
            <input
              value={settings.hero_kicker}
              maxLength={160}
              onChange={(event) => update("hero_kicker", event.target.value)}
            />
          </label>
          <div className="event-map-copy-grid">
            <label>
              地图区英文小字
              <input
                value={settings.map_eyebrow}
                maxLength={120}
                onChange={(event) => update("map_eyebrow", event.target.value)}
              />
            </label>
            <label>
              地图区标题
              <input
                value={settings.map_section_title}
                maxLength={80}
                onChange={(event) => update("map_section_title", event.target.value)}
              />
            </label>
            <label>
              介绍区英文小字
              <input
                value={settings.introduction_eyebrow}
                maxLength={120}
                onChange={(event) => update("introduction_eyebrow", event.target.value)}
              />
            </label>
            <label>
              介绍区标题
              <input
                value={settings.introduction_title}
                maxLength={80}
                onChange={(event) => update("introduction_title", event.target.value)}
              />
            </label>
            <label>
              作品区英文小字
              <input
                value={settings.works_eyebrow}
                maxLength={120}
                onChange={(event) => update("works_eyebrow", event.target.value)}
              />
            </label>
            <label>
              作品区标题
              <input
                value={settings.works_title}
                maxLength={80}
                onChange={(event) => update("works_title", event.target.value)}
              />
            </label>
          </div>
        </fieldset>

        {message ? <p className={isError ? "form-error" : "form-success"}>{message}</p> : null}
        <button className="admin-button" disabled={busy}>
          {busy ? "保存中……" : "保存专题设置"}
        </button>
      </form>
    </section>
  );
}
