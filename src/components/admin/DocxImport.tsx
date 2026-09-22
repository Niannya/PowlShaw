"use client";

import { ChangeEvent, useState } from "react";
import { fetchJson } from "@/lib/client-fetch";

export type ImportedDocx = {
  title: string;
  content_html: string;
  image_count: number;
  warnings: string[];
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
  const [warnings, setWarnings] = useState<string[]>([]);

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (hasContent && !window.confirm("导入 DOCX 会替换当前编辑器中的正文，是否继续？")) {
      input.value = "";
      return;
    }

    setBusy(true);
    setMessage("正在读取 Word 文档……");
    setWarnings([]);
    const data = new FormData();
    data.set("file", file);
    const { response, data: result } = await fetchJson<ImportedDocx & { error?: string }>(
      "/api/admin/articles/import-docx",
      { method: "POST", body: data },
    );
    setBusy(false);
    input.value = "";

    if (!response?.ok) {
      setMessage(result.error || "DOCX 导入失败，请检查网络连接后重试。");
      return;
    }

    onImported(result);
    setWarnings(result.warnings || []);
    setMessage(`导入完成：正文已放入编辑器，提取了 ${result.image_count} 张图片。`);
  }

  return (
    <section className="docx-import-box">
      <strong>从 Word 导入</strong>
      <p>支持最大 20MB 的 .docx；导入后仍需预览、检查并手动保存。</p>
      <input
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        disabled={busy}
        onChange={importFile}
      />
      {message ? (
        <p className={message.includes("失败") ? "form-error" : "form-success"}>{message}</p>
      ) : null}
      {warnings.length ? (
        <details>
          <summary>转换提示（{warnings.length}）</summary>
          <ul>
            {warnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
