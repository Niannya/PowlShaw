"use client";

import { FormEvent, useState } from "react";
import { fetchJson } from "@/lib/client-fetch";
import type { EventDocumentRecord } from "@/lib/event-documents";

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

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy("upload");
    setError("");
    setMessage("");
    const { response, data } = await fetchJson<{
      error?: string;
      document?: EventDocumentRecord;
    }>(`/api/admin/events/${eventId}/documents`, {
      method: "POST",
      body: new FormData(form),
    });
    setBusy(null);
    if (!response?.ok || !data.document) {
      setError(data.error || "资料上传失败，请检查网络连接后重试。");
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
    }>(`/api/admin/events/${eventId}/documents/${document.id}`, {
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
      `/api/admin/events/${eventId}/documents/order`,
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
      `/api/admin/events/${eventId}/documents/${document.id}`,
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
      </header>

      <form className="event-document-upload" onSubmit={upload}>
        <label>
          选择文件（最大 20MB）
          <input
            type="file"
            name="file"
            accept=".xlsx,.xls,.csv,.docx,.doc,.rtf,.pdf,.txt,.jpg,.jpeg,.png"
            required
          />
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
          {busy === "upload" ? "上传中……" : "上传资料"}
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
