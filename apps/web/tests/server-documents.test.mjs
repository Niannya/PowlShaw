import assert from "node:assert/strict";
import test from "node:test";

const {
  EVENT_DOCUMENT_EXTENSIONS,
  MAX_EVENT_DOCUMENT_SIZE,
  blobPathnameFromUrl,
  docxTitleFromFilename,
  eventDocumentExtension,
  eventDocumentSourceRelPath,
  eventDocumentUploadPathname,
  eventIdFromClientPayload,
  eventIdFromUploadPathname,
  fileExtension,
  hasDocxMagic,
  isBlobFileUrl,
  isDocxFile,
  normalizeEventDocumentContext,
  normalizeEventDocumentName,
} = await import("../src/server/lib/event-documents.ts");

/* ------------------------------------------------------- 活动资料白名单 */

test("event documents only allow the eight document formats (no images)", () => {
  assert.deepEqual([...EVENT_DOCUMENT_EXTENSIONS].sort(), [
    "csv",
    "doc",
    "docx",
    "pdf",
    "rtf",
    "txt",
    "xls",
    "xlsx",
  ]);
  assert.equal(EVENT_DOCUMENT_EXTENSIONS.has("jpg"), false);
  assert.equal(EVENT_DOCUMENT_EXTENSIONS.has("jpeg"), false);
  assert.equal(EVENT_DOCUMENT_EXTENSIONS.has("png"), false);
  assert.equal(MAX_EVENT_DOCUMENT_SIZE, 20 * 1024 * 1024);
});

test("extension detection is case-insensitive and rejects unknown types", () => {
  assert.equal(eventDocumentExtension("成绩单.PDF"), "pdf");
  assert.equal(eventDocumentExtension("dir/upload.XLSX"), "xlsx");
  assert.equal(eventDocumentExtension("海报.png"), undefined);
  assert.equal(eventDocumentExtension("no-extension"), undefined);
  assert.equal(fileExtension("archive.tar.gz"), "gz");
});

test("display names must keep the same extension as the file", () => {
  assert.equal(normalizeEventDocumentName("成绩单", "pdf"), "成绩单.pdf");
  assert.equal(normalizeEventDocumentName("成绩单.PDF", "pdf"), "成绩单.PDF");
  assert.equal(normalizeEventDocumentName("成绩单.docx", "pdf"), undefined);
  assert.equal(normalizeEventDocumentName("  ", "pdf"), undefined);
  assert.equal(normalizeEventDocumentName("../../etc/passwd", "pdf"), "passwd.pdf");
  assert.equal(normalizeEventDocumentName("a\u0000b.pdf", "pdf"), "ab.pdf");
});

test("context labels are collapsed and capped at 160 characters", () => {
  assert.equal(normalizeEventDocumentContext("  初赛   评议表 "), "初赛 评议表");
  assert.equal(normalizeEventDocumentContext("x".repeat(200)).length, 160);
  assert.equal(normalizeEventDocumentContext(undefined), "");
});

/* --------------------------------------------------------------- Blob URL */

test("only https Vercel Blob hosts are accepted as document URLs", () => {
  assert.equal(isBlobFileUrl("https://abc123.public.blob.vercel-storage.com/events/1/a.pdf"), true);
  assert.equal(isBlobFileUrl("http://abc123.public.blob.vercel-storage.com/events/1/a.pdf"), false);
  assert.equal(isBlobFileUrl("https://evil.example/events/1/a.pdf"), false);
  assert.equal(isBlobFileUrl("https://user:pw@abc.public.blob.vercel-storage.com/a.pdf"), false);
  assert.equal(isBlobFileUrl("/uploads/events/documents/a.pdf"), false);
  assert.equal(isBlobFileUrl(undefined), false);
});

test("blob pathnames keep no traversal segments", () => {
  assert.equal(
    blobPathnameFromUrl("https://x.public.blob.vercel-storage.com/events/1/u-成绩单.pdf"),
    "events/1/u-成绩单.pdf",
  );
  // WHATWG URL 解析会先消解 `..`，所以拿到的路径天然没有回溯段。
  assert.equal(
    blobPathnameFromUrl("https://x.public.blob.vercel-storage.com/events/1/../a.pdf"),
    "events/a.pdf",
  );
  assert.equal(blobPathnameFromUrl("not a url"), "");
  assert.equal(eventDocumentSourceRelPath(7, "events/7/u-a.pdf"), "blob/7/events/7/u-a.pdf");
});

test("upload pathnames must live under events/<eventId>/ with an allowed extension", () => {
  const ok = eventDocumentUploadPathname("events/12/uuid-成绩单.pdf", 12);
  assert.deepEqual(ok, { pathname: "events/12/uuid-成绩单.pdf", extension: "pdf" });

  assert.equal(eventDocumentUploadPathname("events/12/uuid-海报.png", 12), undefined);
  assert.equal(eventDocumentUploadPathname("events/13/uuid-成绩单.pdf", 12), undefined);
  assert.equal(eventDocumentUploadPathname("events/12/../secret.pdf", 12), undefined);
  assert.equal(eventDocumentUploadPathname("", 12), undefined);
});

test("event id comes from clientPayload first, then from the pathname", () => {
  assert.equal(eventIdFromClientPayload(JSON.stringify({ eventId: 5 })), 5);
  assert.equal(eventIdFromClientPayload(JSON.stringify({ eventId: "5" })), 5);
  assert.equal(eventIdFromClientPayload("not json"), undefined);
  assert.equal(eventIdFromClientPayload(null), undefined);
  assert.equal(eventIdFromUploadPathname("events/9/file.pdf"), 9);
  assert.equal(eventIdFromUploadPathname("docs/9/file.pdf"), undefined);
});

/* -------------------------------------------------------------------- DOCX */

test("docx titles are derived from 《书名》.docx filenames", () => {
  assert.equal(docxTitleFromFilename("《破晓》.docx"), "破晓");
  assert.equal(docxTitleFromFilename("dir/第一篇.docx"), "第一篇");
  assert.equal(docxTitleFromFilename("没有扩展名"), "没有扩展名");
});

test("docx detection checks the extension, mime type and ZIP magic bytes", () => {
  assert.equal(isDocxFile({ name: "a.DOCX" }), true);
  assert.equal(
    isDocxFile({
      name: "a.bin",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    true,
  );
  assert.equal(isDocxFile({ name: "a.doc" }), false);
  assert.equal(hasDocxMagic(Uint8Array.from([0x50, 0x4b, 3, 4])), true);
  assert.equal(hasDocxMagic(Uint8Array.from([0x25, 0x50, 0x44, 0x46])), false);
  assert.equal(hasDocxMagic(Uint8Array.from([0x50])), false);
});
