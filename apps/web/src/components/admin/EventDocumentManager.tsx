"use client";

import { FormEvent, useState } from "react";
import { upload } from "@vercel/blob/client";
import { fetchJson } from "@/lib/client-fetch";
import {
  EVENT_DOCUMENT_ACCEPT,
  EVENT_DOCUMENT_EXTENSIONS,
  isEventDocumentName,
  type EventDocumentRecord,
} from "@/lib/event-documents";

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function EventDocumentManager({
  eventId,
  initialDocuments,
}: {
  eventId: number;
  initialDocuments: EventDocumentRecord[];
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function changeDocument(id: number, key: "display_name" | "context_label", value: string) {
    setDocuments((current) =>
      current.map((document) => (document.id === id ? { ...document, [key]: value } : document)),
    );
  }

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file");
    const file = fileInput instanceof HTMLInputElement ? fileInput.files?.[0] : undefined;
    if (!file) {
      setError("请先选择要上传的资料文件。");
      return;
    }
    if (!isEventDocumentName(file.name)) {
      setError(`只接受 ${EVENT_DOCUMENT_EXTENSIONS.join(" / ")} 格式的文档，不再支持图片。`);
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setError("文件超过 20MB，请拆分后再上传。");
      return;
    }

    const displayNameInput = form.elements.namedItem("display_name");
    const contextInput = form.elements.namedItem("context_label");
    const displayName =
      displayNameInput instanceof HTMLInputElement && displayNameInput.value.trim()
        ? displayNameInput.value.trim()
        : file.name;
    const contextLabel = contextInput instanceof HTMLInputElement ? contextInput.value.trim() : "";

    setBusy("upload");
    setError("");
    setMessage("");

    let fileUrl = "";
    const uniqueName =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      // 浏览器直接上传到 Vercel Blob，绕过 4.5MB 函数体积限制。
      const blob = await upload(`events/${eventId}/${uniqueName}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/v1/upload/event-document-token",
        clientPayload: JSON.stringify({ eventId }),
      });
      fileUrl = blob.url;
    } catch (thrown) {
      setBusy(null);
      setError(
        thrown instanceof Error && thrown.message
          ? `上传失败：${thrown.message}`
          : "上传失败，请确认已配置 Vercel Blob 后重试。",
      );
      return;
    }

    const { response, data } = await fetchJson<{
      ok?: boolean;
      document?: EventDocumentRecord;
      error?: string | { message?: string };
    }>(`/api/v1/admin/events/${eventId}/documents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        file_url: fileUrl,
        display_name: displayName,
        file_size: file.size,
        context_label: contextLabel,
      }),
    });
    setBusy(null);
    if (!response?.ok || !data.document) {
      setError(
        typeof data.error === "string"
          ? data.error
          : data.error?.message || "文件已上传，但确认入库失败，请稍后重试。",
      );
      return;
    }
    setDocuments((current) => [...current, data.document!]);
    form.reset();
    setMessage("资料已经上传并显示在活动页面。");
  }

  async function save(document: EventDocumentRecord) {
    setBusy(`save-${document.id}`);
    setError("");
    setMessage("");
    const { response, data } = await fetchJson<{
      error?: string;
      display_name?: string;
      context_label?: string;
    }>(`/api/v1/admin/events/${eventId}/documents/${document.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        display_name: document.display_name,
        context_label: document.context_label,
      }),
    });
    setBusy(null);
    if (!response?.ok || !data.display_name) {
      setError(data.error || "资料信息保存失败，请稍后重试。");
      return;
    }
    setDocuments((current) =>
      current.map((item) =>
        item.id === document.id
          ? {
              ...item,
              display_name: data.display_name!,
              context_label: data.context_label || "",
            }
          : item,
      ),
    );
    setMessage("资料名称与说明已经保存。");
  }

  async function move(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= documents.length) return;
    const reordered = [...documents];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setBusy("order");
    setError("");
    setMessage("");
    const { response, data } = await fetchJson<{ error?: string }>(
      `/api/v1/admin/events/${eventId}/documents/order`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ document_ids: reordered.map((document) => document.id) }),
      },
    );
    setBusy(null);
    if (!response?.ok) {
      setError(data.error || "资料排序保存失败，请稍后重试。");
      return;
    }
    setDocuments(
      reordered.map((document, itemIndex) => ({ ...document, sort_order: itemIndex * 10 })),
    );
    setMessage("资料顺序已经保存。");
  }

  async function remove(document: EventDocumentRecord) {
    if (!window.confirm(`确定删除“${document.display_name}”？公开下载文件也会一并移除。`)) return;
    setBusy(`delete-${document.id}`);
    setError("");
    setMessage("");
    const { response, data } = await fetchJson<{ error?: string }>(
      `/api/v1/admin/events/${eventId}/documents/${document.id}`,
      { method: "DELETE" },
    );
    setBusy(null);
    if (!response?.ok) {
      setError(data.error || "资料删除失败，请稍后重试。");
      return;
    }
    setDocuments((current) => current.filter((item) => item.id !== document.id));
    setMessage("资料已经删除。");
  }

  return (
    <section className="event-document-manager admin-card">
      <header className="event-document-manager-heading">
        <h2>评议资料与附件</h2>
        <p>
          支持 {EVENT_DOCUMENT_EXTENSIONS.join(" / ")}，单个文件最大 20MB。 文件由浏览器直接上传到
          Vercel Blob，确认后才会出现在活动页面。
        </p>
      </header>

      <form className="event-document-upload" onSubmit={uploadDocument}>
        <label>
          选择文件（最大 20MB）
          <input type="file" name="file" accept={EVENT_DOCUMENT_ACCEPT} required />
        </label>
        <label>
          显示名称（可留空）
          <input name="display_name" placeholder="默认使用原文件名" maxLength={240} />
        </label>
        <label>
          说明或分组（可留空）
          <input name="context_label" placeholder="例如：第一轮 / 科幻组" maxLength={160} />
        </label>
        <button className="admin-button" disabled={Boolean(busy)}>
          {busy === "upload" ? "上传并确认中……" : "上传资料"}
        </button>
      </form>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? (
        <p className="form-success" role="status">
          {message}
        </p>
      ) : null}

      {documents.length ? (
        <div className="event-document-list">
          {documents.map((document, index) => (
            <article className="event-document-row" key={document.id}>
              <div className="event-document-file">
                <a href={document.file_url} download={document.display_name}>
                  下载检查
                </a>
                <small>{formatFileSize(document.file_size)}</small>
              </div>
              <label>
                显示名称
                <input
                  value={document.display_name}
                  maxLength={240}
                  onChange={(event) =>
                    changeDocument(document.id, "display_name", event.target.value)
                  }
                />
              </label>
              <label>
                说明或分组
                <input
                  value={document.context_label}
                  maxLength={160}
                  placeholder="可留空"
                  onChange={(event) =>
                    changeDocument(document.id, "context_label", event.target.value)
                  }
                />
              </label>
              <div className="admin-actions event-document-actions">
                <button
                  type="button"
                  className="admin-button"
                  disabled={Boolean(busy)}
                  onClick={() => save(document)}
                >
                  {busy === `save-${document.id}` ? "保存中……" : "保存"}
                </button>
                <button
                  type="button"
                  className="admin-button"
                  disabled={Boolean(busy) || index === 0}
                  onClick={() => move(index, -1)}
                >
                  上移
                </button>
                <button
                  type="button"
                  className="admin-button"
                  disabled={Boolean(busy) || index === documents.length - 1}
                  onClick={() => move(index, 1)}
                >
                  下移
                </button>
                <button
                  type="button"
                  className="admin-button danger-button"
                  disabled={Boolean(busy)}
                  onClick={() => remove(document)}
                >
                  {busy === `delete-${document.id}` ? "删除中……" : "删除"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-note">这个活动还没有评议资料或附件。</p>
      )}
    </section>
  );
}
