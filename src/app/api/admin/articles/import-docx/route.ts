import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import { jsonError } from "@/lib/admin";
import { isAdminRequest } from "@/lib/auth";
import { cleanHtml } from "@/lib/content";
import { cleanupUnreferencedUploads, registerUploadedAsset } from "@/lib/uploaded-assets";

export const runtime = "nodejs";

const MAX_DOCX_SIZE = 20 * 1024 * 1024;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const imageExtensions = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
]);

function titleFromFilename(filename: string) {
  return filename
    .replace(/\.docx$/i, "")
    .replace(/^《|》$/g, "")
    .trim();
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);

  const data = await request.formData();
  const file = data.get("file");
  if (!(file instanceof File)) return jsonError("没有收到 DOCX 文件。");
  if (!file.name.toLowerCase().endsWith(".docx") && file.type !== DOCX_MIME) {
    return jsonError("只支持 .docx 文件；旧版 .doc 请先用 Word 另存为 DOCX。");
  }
  if (!file.size || file.size > MAX_DOCX_SIZE) {
    return jsonError("DOCX 文件不能为空，且不能超过 20MB。");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) return jsonError("文件不是有效的 DOCX。");

  const batchName = `${Date.now()}-${crypto.randomBytes(5).toString("hex")}`;
  const relativeDirectory = path.posix.join("uploads", "docx", batchName);
  const outputDirectory = path.join(process.cwd(), "public", ...relativeDirectory.split("/"));
  let imageCount = 0;
  const imageUrls: string[] = [];
  const imageWarnings: string[] = [];

  await fs.mkdir(outputDirectory, { recursive: true });
  try {
    const result = await mammoth.convertToHtml(
      { buffer },
      {
        externalFileAccess: false,
        convertImage: mammoth.images.imgElement(async (image) => {
          const extension = imageExtensions.get(image.contentType);
          if (!extension) {
            imageWarnings.push(`未导入 ${image.contentType || "未知格式"} 图片。`);
            return { src: "" };
          }

          imageCount += 1;
          const filename = `image-${imageCount}.${extension}`;
          await fs.writeFile(path.join(outputDirectory, filename), await image.readAsBuffer());
          const url = `/${relativeDirectory}/${filename}`;
          imageUrls.push(url);
          return { src: url };
        }),
      },
    );

    const content = cleanHtml(result.value);
    if (!content.trim()) {
      await fs.rm(outputDirectory, { recursive: true, force: true });
      return jsonError("没有从这个 DOCX 中读取到正文。");
    }

    if (!imageCount) await fs.rm(outputDirectory, { recursive: true, force: true });
    for (const url of imageUrls) registerUploadedAsset(url);
    cleanupUnreferencedUploads();
    return Response.json({
      ok: true,
      title: titleFromFilename(file.name),
      content_html: content,
      image_count: imageCount,
      warnings: [...result.messages.map((message) => message.message), ...imageWarnings].slice(
        0,
        10,
      ),
    });
  } catch {
    await fs.rm(outputDirectory, { recursive: true, force: true });
    return jsonError("DOCX 解析失败。请确认文件没有损坏，或先用 Word 重新另存为 DOCX。");
  }
}
