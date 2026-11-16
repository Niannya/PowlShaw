"use client";

import { useEffect } from "react";

export function ArticlePreviewDialog({
  title,
  html,
  onClose,
}: {
  title: string;
  html: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="article-preview-overlay" role="dialog" aria-modal="true" aria-label="文章预览">
      <div className="article-preview-window">
        <div className="article-preview-toolbar">
          <strong>发布前预览</strong>
          <button type="button" className="admin-button" onClick={onClose}>
            关闭预览
          </button>
        </div>
        <div className="article-preview-page">
          <header className="article-header">
            <h1>{title || "未命名文章"}</h1>
          </header>
          <article
            className="article-content"
            dangerouslySetInnerHTML={{ __html: html || "<p>正文为空。</p>" }}
          />
        </div>
      </div>
    </div>
  );
}
