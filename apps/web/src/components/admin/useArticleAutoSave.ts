"use client";

import { useCallback, useEffect, useState } from "react";
import {
  isStoredArticleDraft,
  type ArticleDraft,
  type StoredArticleDraft,
} from "@/components/admin/article-draft";

/** Local drafts are only a safety net; storage failures must not block editing. */
export function useArticleAutoSave(storageKey: string, draft: ArticleDraft, dirty: boolean) {
  const [recoverableDraft, setRecoverableDraft] = useState<StoredArticleDraft | null>(null);
  const [ready, setReady] = useState(false);
  const [lastAutoSave, setLastAutoSave] = useState("");
  const [autoSaveError, setAutoSaveError] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const saved = JSON.parse(raw) as unknown;
          if (isStoredArticleDraft(saved)) setRecoverableDraft(saved);
          else window.localStorage.removeItem(storageKey);
        }
      } catch {
        // Corrupt or inaccessible local storage should not prevent editing.
        try {
          window.localStorage.removeItem(storageKey);
        } catch {
          // Storage may be disabled entirely.
        }
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  useEffect(() => {
    if (!ready || !dirty) return;
    const timer = window.setTimeout(() => {
      try {
        const savedAt = new Date().toISOString();
        window.localStorage.setItem(storageKey, JSON.stringify({ saved_at: savedAt, data: draft }));
        setLastAutoSave(savedAt);
        setAutoSaveError(false);
      } catch {
        setAutoSaveError(true);
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, ready, storageKey]);

  const dismissRecovery = useCallback(() => setRecoverableDraft(null), []);
  const clearLocalDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Saving to the server still succeeds when local storage is unavailable.
    }
    setRecoverableDraft(null);
  }, [storageKey]);

  return { recoverableDraft, lastAutoSave, autoSaveError, dismissRecovery, clearLocalDraft };
}
