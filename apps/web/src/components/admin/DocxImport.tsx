"use client";

import { ChangeEvent, useState } from "react";
import { fetchJson } from "@/lib/client-fetch";

export type ImportedDocx = {
  title: string;
  content_html: string;
};

type DocxParsePayload = {
  data?: { title?: string; content_html?: string };
  error?: string | { message?: string };
};

export function DocxImport({
  hasContent,
  onImported,
}: {
  hasContent: boolean;
  onImported: (result: ImportedDocx) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (hasContent && !window.confirm("导入 DOCX 会替换当前编辑器中的正文，是否继续？")) {
      input.value = "";
      return;
    }

    setBusy(true);
    setFailed(false);
    setMessage("正在读取 Word 文档……");
    const data = new FormData();
    data.set("file", file);
    const { response, data: result } = await fetchJson<DocxParsePayload>(
      "/api/v1/upload/docx-parse",
      { method: "POST", body: data },
    );
    setBusy(false);
    input.value = "";

    if (!response?.ok || !result.data) {
      setFailed(true);
      setMessage(
        typeof result.error === "string"
          ? result.error
          : result.error?.message || "DOCX 导入失败，请检查网络连接后重试。",
      );
      return;
    }

    onImported({
      title: result.data.title || "",
      content_html: result.data.content_html || "",
    });
    setMessage("导入完成：正文已放入编辑器，文档内的图片会被忽略。");
  }

  return (
    <section className="docx-import-box">
      <strong>从 Word 导入</strong>
      <input
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        disabled={busy}
        onChange={importFile}
      />
      {message ? <p className={failed ? "form-error" : "form-success"}>{message}</p> : null}
    </section>
  );
}
