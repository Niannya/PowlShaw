import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const MAX_EVENT_DOCUMENT_SIZE = 20 * 1024 * 1024;

export const EVENT_DOCUMENT_EXTENSIONS = new Set([
  "xlsx",
  "xls",
  "csv",
  "docx",
  "doc",
  "rtf",
  "pdf",
  "txt",
  "jpg",
  "jpeg",
  "png",
]);

export type EventDocumentRecord = {
  id: number;
  display_name: string;
  context_label: string;
  file_url: string;
  file_size: number;
  sort_order: number;
};

export function eventDocumentExtension(fileName: string) {
  const extension = path.extname(fileName).slice(1).toLowerCase();
  return EVENT_DOCUMENT_EXTENSIONS.has(extension) ? extension : undefined;
}

function cleanFileName(value: string) {
  return path
    .basename(value.replaceAll("\\", "/"))
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 240);
}

export function normalizeEventDocumentName(value: unknown, extension: string) {
  const name = cleanFileName(String(value || ""));
  if (!name) return undefined;
  const currentExtension = path.extname(name).slice(1).toLowerCase();
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

export function matchesEventDocumentSignature(buffer: Buffer, extension: string) {
  if (!buffer.length) return false;
  if (extension === "pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (extension === "docx" || extension === "xlsx") {
    return buffer.subarray(0, 2).toString("ascii") === "PK";
  }
  if (extension === "doc" || extension === "xls") {
    return buffer.subarray(0, 8).equals(Buffer.from("d0cf11e0a1b11ae1", "hex"));
  }
  if (extension === "rtf") return buffer.subarray(0, 5).toString("ascii") === "{\\rtf";
  if (extension === "jpg" || extension === "jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (extension === "png") {
    return buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  }
  if (extension === "txt" || extension === "csv") return !buffer.includes(0);
  return false;
}

export function eventDocumentStorage(eventId: number, extension: string, buffer: Buffer) {
  const digest = crypto.createHash("sha256").update(buffer).digest("hex");
  const fileName = `${digest}.${extension}`;
  const relativePath = path.join(
    "uploads",
    "events",
    "documents",
    "admin",
    String(eventId),
    fileName,
  );
  return {
    digest,
    fileUrl: `/${relativePath.replaceAll(path.sep, "/")}`,
    targetPath: path.resolve(process.cwd(), "public", relativePath),
  };
}

export async function writeEventDocument(targetPath: string, buffer: Buffer) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, buffer);
}

export async function removeEventDocumentFile(fileUrl: string) {
  if (!fileUrl.startsWith("/uploads/events/documents/") || fileUrl.includes("\0")) return;
  const publicRoot = path.resolve(process.cwd(), "public");
  const target = path.resolve(publicRoot, fileUrl.slice(1).replaceAll("/", path.sep));
  if (!target.startsWith(`${publicRoot}${path.sep}`)) return;
  await fs.rm(target, { force: true });
}
