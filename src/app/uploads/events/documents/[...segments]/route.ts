import fs from "node:fs/promises";
import path from "node:path";
import { getDb } from "@/lib/db";

const contentTypes: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  rtf: "application/rtf",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

function validSegment(segment: string) {
  return Boolean(segment) && segment !== "." && segment !== ".." && !/[\\/\0]/.test(segment);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ segments: string[] }> },
) {
  const segments = (await params).segments;
  if (!segments.length || !segments.every(validSegment)) return new Response(null, { status: 404 });
  const fileUrl = `/uploads/events/documents/${segments.join("/")}`;
  const document = getDb()
    .prepare("SELECT display_name FROM event_documents WHERE file_url=?")
    .get(fileUrl) as { display_name: string } | undefined;
  if (!document) return new Response(null, { status: 404 });

  const documentsRoot = path.resolve(process.cwd(), "public", "uploads", "events", "documents");
  const target = path.resolve(documentsRoot, ...segments);
  if (!target.startsWith(`${documentsRoot}${path.sep}`)) return new Response(null, { status: 404 });
  const content = await fs.readFile(target).catch(() => undefined);
  if (!content) return new Response(null, { status: 404 });
  const extension = path.extname(target).slice(1).toLowerCase();
  const encodedName = encodeURIComponent(document.display_name).replaceAll("'", "%27");
  return new Response(new Uint8Array(content), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
      "Content-Length": String(content.length),
      "Content-Type": contentTypes[extension] || "application/octet-stream",
    },
  });
}
