import { handle } from "hono/vercel";
import { app } from "@/server/app";

/**
 * Next.js App Router 挂载入口：`/api/v1/*` 全部交给同一个 Hono 应用。
 *
 * 必须固定为 `nodejs` 运行时，以支持 `node:crypto.scrypt` 校验存量密码哈希
 * 以及 mammoth 的 DOCX 解析。
 */
export const runtime = "nodejs";

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
