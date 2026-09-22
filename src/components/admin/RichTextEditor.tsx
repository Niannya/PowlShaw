"use client";

import DOMPurify from "dompurify";
import { marked } from "marked";
import TurndownService from "turndown";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { MAX_MARKDOWN_SIZE } from "@/lib/content-limits";

function renderMarkdown(markdown: string) {
  const rendered = marked.parse(markdown, { async: false, gfm: true });
  return DOMPurify.sanitize(String(rendered));
}

export function RichTextEditor({
  value,
  markdownValue,
  onChange,
}: {
  value: string;
  markdownValue: string;
  onChange: (html: string, markdown: string) => void;
}) {
  const richEditor = useRef<HTMLDivElement>(null);
  const markdownInput = useRef<HTMLInputElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [mode, setMode] = useState<"rich" | "markdown">(markdownValue ? "markdown" : "rich");
  const [message, setMessage] = useState("");
  const turndown = useMemo(() => {
    const service = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });
    // 原有活动文章可能包含复杂表格，切换编辑模式时不要把它们丢掉。
    service.keep(["table", "figure", "iframe"]);
    return service;
  }, []);

  useEffect(() => {
    if (mode === "rich" && richEditor.current && richEditor.current.innerHTML !== value) {
      richEditor.current.innerHTML = value || "<p><br></p>";
    }
  }, [mode, value]);

  function rememberSelection() {
    const editor = richEditor.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    if (container === editor || editor.contains(container)) savedRange.current = range.cloneRange();
  }

  function restoreSelection() {
    const selection = window.getSelection();
    const range = savedRange.current;
    if (!selection || !range) return false;
    try {
      richEditor.current?.focus();
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    } catch {
      savedRange.current = null;
      return false;
    }
  }

  function command(name: string, arg?: string) {
    restoreSelection();
    document.execCommand(name, false, arg);
    richEditor.current?.focus();
    rememberSelection();
    onChange(richEditor.current?.innerHTML || "", "");
  }

  function link() {
    if (!savedRange.current || savedRange.current.collapsed) {
      setMessage("请先选中要添加链接的文字。");
      return;
    }
    const input = window.prompt("请输入链接地址（https://… 或 /events/…）");
    if (input === null) return;
    const url = input.trim();
    if (url.includes("\\") || !/^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(url)) {
      setMessage("链接地址必须以 https://、http://、mailto:、/或 # 开头。");
      return;
    }
    setMessage("");
    command("createLink", url);
  }

  function showMarkdown() {
    if (!markdownValue) onChange(value, turndown.turndown(value));
    setMessage("");
    setMode("markdown");
  }

  function showRichText() {
    setMessage("");
    setMode("rich");
  }

  function updateMarkdown(next: string) {
    const html = renderMarkdown(next);
    onChange(html, next);
  }

  async function importMarkdown(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > MAX_MARKDOWN_SIZE) {
      setMessage(`Markdown 文件不能超过 ${MAX_MARKDOWN_SIZE / 1024 / 1024}MB。`);
      input.value = "";
      return;
    }
    if (value.trim() && !window.confirm("导入 Markdown 会替换当前正文，是否继续？")) {
      input.value = "";
      return;
    }
    try {
      const text = await file.text();
      updateMarkdown(text.replace(/^\uFEFF/, ""));
      setMode("markdown");
      setMessage(`已导入 ${file.name}，保存前请检查正文。`);
    } catch {
      setMessage("Markdown 文件读取失败。");
    }
    input.value = "";
  }

  return (
    <div className="content-editor">
      <div className="editor-mode-tabs">
        <button type="button" className={mode === "rich" ? "is-active" : ""} onClick={showRichText}>
          富文本
        </button>
        <button
          type="button"
          className={mode === "markdown" ? "is-active" : ""}
          onClick={showMarkdown}
        >
          Markdown
        </button>
        <button type="button" onClick={() => markdownInput.current?.click()}>
          导入 .md
        </button>
        <input
          ref={markdownInput}
          className="visually-hidden"
          type="file"
          accept=".md,.markdown,text/markdown,text/plain"
          onChange={importMarkdown}
        />
      </div>

      {mode === "rich" ? (
        <>
          <div className="editor-toolbar">
            <button
              type="button"
              title="粗体"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => command("bold")}
            >
              <b>B</b>
            </button>
            <button
              type="button"
              title="斜体"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => command("italic")}
            >
              <i>I</i>
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => command("formatBlock", "h2")}
            >
              标题
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => command("formatBlock", "p")}
            >
              正文
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => command("insertUnorderedList")}
            >
              列表
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => command("formatBlock", "blockquote")}
            >
              引用
            </button>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={link}>
              链接
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => command("unlink")}
            >
              取消链接
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => command("removeFormat")}
            >
              清除格式
            </button>
          </div>
          <div
            ref={richEditor}
            className="rich-editor"
            contentEditable
            role="textbox"
            aria-label="富文本正文"
            aria-multiline="true"
            suppressContentEditableWarning
            onInput={(event) => {
              onChange(event.currentTarget.innerHTML, "");
              rememberSelection();
            }}
            onMouseUp={rememberSelection}
            onKeyUp={rememberSelection}
            onFocus={rememberSelection}
          />
        </>
      ) : (
        <textarea
          className="markdown-editor"
          value={markdownValue}
          spellCheck={false}
          aria-label="Markdown 正文"
          onChange={(event) => updateMarkdown(event.target.value)}
        />
      )}
      {message ? <p className="editor-message">{message}</p> : null}
    </div>
  );
}
