import assert from "node:assert/strict";
import test from "node:test";
import {
  eventDocumentExtension,
  eventDocumentStorage,
  matchesEventDocumentSignature,
  normalizeEventDocumentName,
} from "../src/lib/event-documents.ts";

test("event documents only accept the public download formats", () => {
  assert.equal(eventDocumentExtension("评议表.XLSX"), "xlsx");
  assert.equal(eventDocumentExtension("结果.pdf"), "pdf");
  assert.equal(eventDocumentExtension("payload.html"), undefined);
  assert.equal(eventDocumentExtension("macro.xlsm"), undefined);
});

test("event document display names keep the real extension", () => {
  assert.equal(normalizeEventDocumentName("决赛评议", "xlsx"), "决赛评议.xlsx");
  assert.equal(normalizeEventDocumentName(String.raw`..\名单.pdf`, "pdf"), "名单.pdf");
  assert.equal(normalizeEventDocumentName("伪装文件.txt", "pdf"), undefined);
});

test("event document signatures reject disguised active content", () => {
  assert.equal(matchesEventDocumentSignature(Buffer.from("%PDF-example"), "pdf"), true);
  assert.equal(matchesEventDocumentSignature(Buffer.from("PK\u0003\u0004archive"), "xlsx"), true);
  assert.equal(matchesEventDocumentSignature(Buffer.from("<script>bad</script>"), "pdf"), false);
  assert.equal(matchesEventDocumentSignature(Buffer.from([65, 0, 66]), "txt"), false);
});

test("admin event documents use deterministic event-scoped public paths", () => {
  const first = eventDocumentStorage(12, "pdf", Buffer.from("%PDF-example"));
  const second = eventDocumentStorage(12, "pdf", Buffer.from("%PDF-example"));
  assert.equal(first.fileUrl, second.fileUrl);
  assert.match(first.fileUrl, /^\/uploads\/events\/documents\/admin\/12\/[a-f0-9]{64}\.pdf$/);
});
