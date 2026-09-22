"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArticlePreviewDialog } from "@/components/admin/ArticlePreviewDialog";
import { DocxImport, type ImportedDocx } from "@/components/admin/DocxImport";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import {
  createArticleDraft,
  type ArticleDraft,
  type ArticleInitial,
} from "@/components/admin/article-draft";
import { useArticleAutoSave } from "@/components/admin/useArticleAutoSave";

type Option = { id: number; name?: string; title?: string };

export function ArticleForm({
  initial = {},
  events,
  returnPath = "/admin/articles",
}: {
  initial?: ArticleInitial;
  events: Option[];
  returnPath?: string;
}) {
  const router = useRouter();
  const storageKey = useMemo(
    () => `poxiao:article-draft:${initial.id ? `edit:${initial.id}` : "new"}`,
    [initial.id],
  );
  const [draft, setDraft] = useState<ArticleDraft>(() => createArticleDraft(initial));
  const [dirty, setDirty] = useState(false);
  const { recoverableDraft, lastAutoSave, autoSaveError, dismissRecovery, clearLocalDraft } =
    useArticleAutoSave(storageKey, draft, dirty);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const submitting = useRef(false);

  const closePreview = useCallback(() => setPreviewHtml(null), []);

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty || submitting.current) return;
      event.preventDefault();
    }
    function warnBeforeLink(event: MouseEvent) {
      if (!dirty || submitting.current || event.defaultPrevented) return;
      const target = event.target;
      const anchor = target instanceof Element ? target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || anchor.target === "_blank") return;
      if (window.confirm("这篇文章还有未保存的修改。确定离开吗？")) return;
      event.preventDefault();
      event.stopPropagation();
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", warnBeforeLink, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", warnBeforeLink, true);
    };
  }, [dirty]);

  function update<K extends keyof ArticleDraft>(key: K, value: ArticleDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  function applyDocx(result: ImportedDocx) {
    setDraft((current) => ({
      ...current,
      title: current.title.trim() || result.title,
      content_html: result.content_html,
      content_markdown: "",
    }));
    setDirty(true);
  }

  async function openPreview() {
    setPreviewBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/articles/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content_html: draft.content_html }),
      });
      const result = (await response.json()) as { html?: string; error?: string };
      if (!response.ok) {
        setError(result.error || "预览生成失败。");
        return;
      }
      setPreviewHtml(result.html || "");
    } catch {
      setError("无法生成预览，请检查网络连接后重试。");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    submitting.current = true;

    try {
      const endpoint = initial.id ? `/api/admin/articles/${initial.id}` : "/api/admin/articles";
      const response = await fetch(endpoint, {
        method: initial.id ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error || "保存失败");
        return;
      }

      clearLocalDraft();
      setDirty(false);
      router.push(returnPath);
      router.refresh();
    } catch {
      setError("无法保存文章，请检查网络连接后重试。");
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }

  function cancel() {
    if (dirty && !window.confirm("这篇文章还有未保存的修改。确定离开吗？")) return;
    submitting.current = true;
    router.back();
  }

  return (
    <>
      <form className="admin-form" onSubmit={submit}>
        {recoverableDraft ? (
          <aside className="draft-recovery">
            <strong>发现本机自动保存的未提交草稿</strong>
            <span>保存时间：{new Date(recoverableDraft.saved_at).toLocaleString("zh-CN")}</span>
            <div className="admin-actions">
              <button
                className="admin-button"
                type="button"
                onClick={() => {
                  setDraft(recoverableDraft.data);
                  dismissRecovery();
                  setDirty(true);
                }}
              >
                恢复草稿
              </button>
              <button className="admin-button" type="button" onClick={clearLocalDraft}>
                丢弃草稿
              </button>
            </div>
          </aside>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}
        <DocxImport hasContent={Boolean(draft.content_html.trim())} onImported={applyDocx} />

        <label>
          文章标题
          <input
            value={draft.title}
            onChange={(event) => update("title", event.target.value)}
            required
          />
        </label>
        <label>
          网址别名
          <input value={draft.slug} readOnly placeholder="保存时根据所属活动自动生成" />
        </label>
        <div className="inline">
          <label>
            发布时间
            <input
              type="date"
              value={draft.published_at}
              onChange={(event) => update("published_at", event.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.is_pinned}
              onChange={(event) => update("is_pinned", event.target.checked)}
            />
            首页置顶
          </label>
          <label>
            评论区
            <select
              value={draft.comments_mode}
              onChange={(event) =>
                update("comments_mode", event.target.value as ArticleDraft["comments_mode"])
              }
            >
              <option value="open">开放评论</option>
              <option value="closed">显示旧评论，但禁止新评论</option>
              <option value="hidden">隐藏整个评论区</option>
            </select>
          </label>
        </div>
        <label>
          封面图片地址
          <input
            value={draft.cover_url}
            onChange={(event) => update("cover_url", event.target.value)}
            placeholder="/uploads/… 或 https://…"
          />
        </label>
        <ImageUpload onUploaded={(url) => update("cover_url", url)} />
        <div className="admin-field admin-editor-field">
          <span className="admin-field-label">正文</span>
          <RichTextEditor
            value={draft.content_html}
            markdownValue={draft.content_markdown}
            onChange={(html, markdown) => {
              setDraft((current) => ({
                ...current,
                content_html: html,
                content_markdown: markdown,
              }));
              setDirty(true);
            }}
          />
        </div>
        <fieldset>
          <legend>所属活动（必须选择一个）</legend>
          <div className="inline">
            {events.map((eventOption) => (
              <label key={eventOption.id}>
                <input
                  type="radio"
                  name="article_event"
                  checked={draft.event_ids.includes(eventOption.id)}
                  required
                  onChange={(event) => {
                    if (event.target.checked) update("event_ids", [eventOption.id]);
                  }}
                />
                {eventOption.title}
              </label>
            ))}
          </div>
        </fieldset>
        {autoSaveError || lastAutoSave ? (
          <p className="auto-save-status">
            {autoSaveError
              ? "本机自动保存不可用，请及时手动保存。"
              : `未提交内容已自动保存在这台电脑上：${new Date(lastAutoSave!).toLocaleTimeString("zh-CN")}`}
          </p>
        ) : null}
        <div className="admin-actions">
          <button className="admin-button" disabled={busy}>
            {busy ? "保存中……" : "保存文章"}
          </button>
          <button
            className="admin-button"
            type="button"
            disabled={previewBusy}
            onClick={openPreview}
          >
            {previewBusy ? "生成预览中……" : "发布前预览"}
          </button>
          <button className="admin-button" type="button" onClick={cancel}>
            取消
          </button>
        </div>
      </form>

      {previewHtml !== null ? (
        <ArticlePreviewDialog title={draft.title} html={previewHtml} onClose={closePreview} />
      ) : null}
    </>
  );
}
