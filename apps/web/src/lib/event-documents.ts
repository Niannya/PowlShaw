export type { EventDocument, EventDocumentRecord } from "@/lib/api/types";

/**
 * 活动评议资料只接受文档与表格格式（不含图片）：
 * 去图片化后 jpg/jpeg/png 不再允许成为变相图床。
 */
export const EVENT_DOCUMENT_EXTENSIONS = [
  "xlsx",
  "xls",
  "csv",
  "docx",
  "doc",
  "rtf",
  "pdf",
  "txt",
] as const;

export type EventDocumentExtension = (typeof EVENT_DOCUMENT_EXTENSIONS)[number];

export const EVENT_DOCUMENT_ACCEPT = EVENT_DOCUMENT_EXTENSIONS.map(
  (extension) => `.${extension}`,
).join(",");

export function eventDocumentExtensionOf(name: string): string {
  const base = name.split(/[\\/]/).at(-1) || name;
  const index = base.lastIndexOf(".");
  return index > 0 ? base.slice(index + 1).toLowerCase() : "";
}

export function isEventDocumentName(name: string): boolean {
  return (EVENT_DOCUMENT_EXTENSIONS as readonly string[]).includes(eventDocumentExtensionOf(name));
}
