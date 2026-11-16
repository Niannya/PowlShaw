/**
 * 活动评议资料的纯函数校验层（无 `fs`、无数据库）。
 *
 * 上云后文件本体存放在 Vercel Blob，因此这里只保留：
 * - 允许的 8 种文档扩展名（图片扩展名已随“去图片化”移除）；
 * - 显示名 / 上下文标签的归一化；
 * - Blob URL 的校验与路径推导。
 */

export const MAX_EVENT_DOCUMENT_SIZE = 20 * 1024 * 1024;

/** 只允许文档与表格；`jpg` / `jpeg` / `png` 已移除，防止活动附件成为变相图床。 */
export const EVENT_DOCUMENT_EXTENSIONS = new Set([
  "xlsx",
  "xls",
  "csv",
  "docx",
  "doc",
  "rtf",
  "pdf",
  "txt",
]);

/** 与 `EVENT_DOCUMENT_EXTENSIONS` 对应的 MIME 白名单，用于 Blob 直传令牌。 */
export const EVENT_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "text/csv",
  "text/plain",
  "application/rtf",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const MAX_DOCX_SIZE = 20 * 1024 * 1024;

export type EventDocumentRecord = {
  id: number;
  display_name: string;
  context_label: string;
  file_url: string;
  file_size: number;
  sort_order: number;
};

function baseName(value: string) {
  const normalized = value.replaceAll("\\", "/");
  const slash = normalized.lastIndexOf("/");
  return slash < 0 ? normalized : normalized.slice(slash + 1);
}

/** 小写扩展名（不含点）；没有扩展名时返回空串。 */
export function fileExtension(fileName: string) {
  const base = baseName(String(fileName || ""));
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function eventDocumentExtension(fileName: string) {
  const extension = fileExtension(fileName);
  return EVENT_DOCUMENT_EXTENSIONS.has(extension) ? extension : undefined;
}

function cleanFileName(value: string) {
  return baseName(value.replaceAll("\\", "/"))
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 240);
}

/** 显示名必须与文件扩展名一致；缺扩展名时自动补上。 */
export function normalizeEventDocumentName(value: unknown, extension: string) {
  const name = cleanFileName(String(value || ""));
  if (!name) return undefined;
  const currentExtension = fileExtension(name);
  if (currentExtension && currentExtension !== extension) return undefined;
  return currentExtension ? name : `${name}.${extension}`;
}

export function normalizeEventDocumentContext(value: unknown) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

/* -------------------------------------------------------------------- docx */

/** `《作品名》.docx` → `作品名`；与旧 `import-docx` 的标题推导一致。 */
export function docxTitleFromFilename(filename: string) {
  return baseName(String(filename || ""))
    .replace(/\.docx$/i, "")
    .replace(/^《|》$/g, "")
    .trim();
}

export function isDocxFile(file: { name: string; type?: string }) {
  return file.name.toLowerCase().endsWith(".docx") || file.type === DOCX_MIME_TYPE;
}

/** DOCX 是 ZIP 容器，前两个字节必须是 `PK`。 */
export function hasDocxMagic(buffer: Uint8Array) {
  return buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

/* -------------------------------------------------------------------- blob */

export const DEFAULT_BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

/** Vercel Blob 的公共域名后缀；私有存储或自定义域名可用 `BLOB_HOST_SUFFIX` 覆盖。 */
export function blobHostSuffix() {
  const configured = process.env.BLOB_HOST_SUFFIX?.trim();
  return configured || DEFAULT_BLOB_HOST_SUFFIX;
}

/** 只接受 https 的 Blob 公网地址，避免把任意 URL 写进 `event_documents.file_url`。 */
export function isBlobFileUrl(value: unknown) {
  const text = String(value ?? "");
  if (!text.startsWith("https://")) return false;
  try {
    const url = new URL(text);
    if (url.username || url.password) return false;
    if (url.protocol !== "https:") return false;
    return url.hostname.endsWith(blobHostSuffix());
  } catch {
    return false;
  }
}

/** 从 Blob URL 推导存储路径（去掉前导斜杠与 `..` 段），用于 `source_rel_path`。 */
export function blobPathnameFromUrl(value: string) {
  let pathname: string;
  try {
    pathname = new URL(value).pathname;
  } catch {
    return "";
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    decoded = pathname;
  }
  return decoded
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
}

export function eventDocumentSourceRelPath(eventId: number, blobPathname: string) {
  return `blob/${eventId}/${blobPathname}`.slice(0, 400);
}

/**
 * Blob 直传时校验 `pathname`：必须以 `events/<eventId>/` 开头，
 * 且扩展名在白名单内。返回规范化后的扩展名，失败返回 `undefined`。
 */
export function eventDocumentUploadPathname(pathname: unknown, eventId: number) {
  const text = String(pathname ?? "").trim();
  if (!text || text.includes("\0")) return undefined;
  const prefix = `events/${eventId}/`;
  if (!text.startsWith(prefix)) return undefined;
  const extension = eventDocumentExtension(text);
  if (!extension) return undefined;
  const segments = text.split("/");
  if (segments.length < 3) return undefined;
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return undefined;
  return { pathname: text, extension };
}

/** 从 `clientPayload`（JSON 字符串）里取活动 id；缺失或非法时返回 `undefined`。 */
export function eventIdFromClientPayload(clientPayload: unknown) {
  if (typeof clientPayload !== "string" || !clientPayload.trim()) return undefined;
  try {
    const parsed = JSON.parse(clientPayload) as { eventId?: unknown } | null;
    const eventId = Number(parsed?.eventId);
    return Number.isSafeInteger(eventId) && eventId > 0 ? eventId : undefined;
  } catch {
    return undefined;
  }
}

/** 从 `events/<id>/...` 形式的路径里取活动 id，作为 `clientPayload` 的兜底。 */
export function eventIdFromUploadPathname(pathname: unknown) {
  const match = /^events\/(\d+)\//.exec(String(pathname ?? ""));
  if (!match) return undefined;
  const eventId = Number(match[1]);
  return Number.isSafeInteger(eventId) && eventId > 0 ? eventId : undefined;
}
