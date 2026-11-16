import { Hono } from "hono";
import type { Context } from "hono";
import mammoth from "mammoth";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import type { AppEnv } from "../middleware/session";
import { requireAdmin } from "../middleware/session";
import { apiData, apiError } from "../lib/api-response";
import { cleanHtml } from "@/lib/content";
import { getEventById } from "../lib/queries";
import {
  EVENT_DOCUMENT_MIME_TYPES,
  MAX_DOCX_SIZE,
  MAX_EVENT_DOCUMENT_SIZE,
  docxTitleFromFilename,
  eventDocumentUploadPathname,
  eventIdFromClientPayload,
  eventIdFromUploadPathname,
  hasDocxMagic,
  isDocxFile,
} from "../lib/event-documents";

/**
 * 上传路由（挂在 `/api/v1/upload`）。
 *
 * - `POST /docx-parse`：作品 DOCX 纯内存解析，零落盘（图片一律忽略）；
 * - `POST /event-document-token`：签发活动评议资料的 Vercel Blob 客户端直传令牌。
 *   入库由客户端拿到 `blob.url` 后调用 `POST /admin/events/:id/documents` 完成，
 *   因此本地开发不依赖 Vercel 的 `onUploadCompleted` Webhook。
 */
export const uploadRoutes = new Hono<AppEnv>();

type DocxParseResult =
  | { ok: true; title: string; contentHtml: string; warnings: string[] }
  | { ok: false; status: number; code: string; message: string };

/** DOCX 解析的共用实现：新端点与旧 `/admin/articles/import-docx` 别名共用。 */
export async function parseDocxUpload(c: Context<AppEnv>): Promise<DocxParseResult> {
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return { ok: false, status: 400, code: "INVALID_FILE", message: "没有收到 DOCX 文件。" };
  }
  if (!isDocxFile(file)) {
    return {
      ok: false,
      status: 400,
      code: "INVALID_FILE",
      message: "只支持 .docx 文件；旧版 .doc 请先用 Word 另存为 DOCX。",
    };
  }
  if (!file.size || file.size > MAX_DOCX_SIZE) {
    return {
      ok: false,
      status: 400,
      code: "FILE_SIZE_LIMIT",
      message: "DOCX 文件不能为空，且不能超过 20MB。",
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!hasDocxMagic(buffer)) {
    return { ok: false, status: 400, code: "INVALID_DOCX", message: "文件不是有效的 DOCX。" };
  }

  let result: Awaited<ReturnType<typeof mammoth.convertToHtml>>;
  try {
    result = await mammoth.convertToHtml(
      { buffer },
      {
        externalFileAccess: false,
        // 站点彻底去图片化：内嵌图片不落地、不输出 src。
        convertImage: mammoth.images.imgElement(async () => ({ src: "" })),
      },
    );
  } catch {
    return {
      ok: false,
      status: 400,
      code: "INVALID_DOCX",
      message: "DOCX 解析失败。请确认文件没有损坏，或先用 Word 重新另存为 DOCX。",
    };
  }

  const contentHtml = cleanHtml(result.value);
  if (!contentHtml.trim()) {
    return {
      ok: false,
      status: 400,
      code: "EMPTY_DOCX",
      message: "没有从这个 DOCX 中读取到正文。",
    };
  }

  return {
    ok: true,
    title: docxTitleFromFilename(file.name),
    contentHtml,
    warnings: result.messages.map((message) => message.message).slice(0, 10),
  };
}

uploadRoutes.post("/docx-parse", requireAdmin, async (c) => {
  const result = await parseDocxUpload(c);
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiData({ title: result.title, content_html: result.contentHtml });
});

class UploadValidationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "UploadValidationError";
    this.status = status;
  }
}

uploadRoutes.post("/event-document-token", requireAdmin, async (c) => {
  const body = (await c.req.json().catch(() => null)) as HandleUploadBody | null;
  if (!body || typeof body !== "object") {
    return apiError("INVALID_REQUEST", "请求格式不正确。", 400);
  }

  try {
    const tokenResult = await handleUpload({
      body,
      // `@vercel/blob` 接受标准 `Request`；Hono 的 `c.req.raw` 正是同一个对象。
      request: c.req.raw,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const eventId =
          eventIdFromClientPayload(clientPayload) ?? eventIdFromUploadPathname(pathname);
        if (!eventId) throw new UploadValidationError("上传路径必须包含有效的活动编号。");

        const target = eventDocumentUploadPathname(pathname, eventId);
        if (!target) {
          throw new UploadValidationError(
            "只支持 XLSX、XLS、CSV、DOCX、DOC、RTF、PDF、TXT 文件，且路径需为 events/<活动编号>/<文件名>。",
          );
        }
        const event = await getEventById(eventId);
        if (!event) throw new UploadValidationError("活动不存在。", 404);

        return {
          maximumSizeInBytes: MAX_EVENT_DOCUMENT_SIZE,
          allowedContentTypes: [...EVENT_DOCUMENT_MIME_TYPES],
          addRandomSuffix: true,
        };
      },
      // 生产环境的 Webhook 只作日志留存；入库由客户端拿 blob.url 后主动确认，
      // 这样本地开发与 Preview 环境行为一致。
      onUploadCompleted: async () => undefined,
    });
    return Response.json(tokenResult);
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return apiError("INVALID_UPLOAD", error.message, error.status);
    }
    throw error;
  }
});
