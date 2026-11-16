import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { jsonError } from "@/lib/admin";
import { isAdminRequest } from "@/lib/auth";
import { cleanupUnreferencedUploads, registerUploadedAsset } from "@/lib/uploaded-assets";

const allowed = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
]);

function matchesImageSignature(buffer: Buffer, extension: string) {
  if (extension === "jpg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (extension === "png")
    return buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  if (extension === "gif")
    return buffer
      .subarray(0, 6)
      .toString("ascii")
      .match(/^GIF8[79]a$/);
  if (extension === "webp") {
    return (
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  return false;
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);
  const data = await request.formData();
  const file = data.get("file");
  if (!(file instanceof File)) return jsonError("没有收到图片。");
  if (file.size > 5 * 1024 * 1024) return jsonError("图片不能超过 5MB。");
  const extension = allowed.get(file.type);
  if (!extension) return jsonError("只支持 JPG、PNG、GIF 和 WebP 图片。");
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!matchesImageSignature(buffer, extension)) return jsonError("图片内容与文件格式不符。");
  const name = `${Date.now()}-${crypto.randomBytes(5).toString("hex")}.${extension}`;
  const directory = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, name), buffer);
  const url = `/uploads/${name}`;
  registerUploadedAsset(url);
  cleanupUnreferencedUploads();
  return Response.json({ ok: true, url });
}
