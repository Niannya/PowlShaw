import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db";

function localUploadPath(fileUrl: string) {
  if (!fileUrl.startsWith("/uploads/") || fileUrl.includes("\0")) return undefined;
  const publicRoot = path.resolve(process.cwd(), "public");
  const target = path.resolve(publicRoot, fileUrl.slice(1).replaceAll("/", path.sep));
  return target.startsWith(`${publicRoot}${path.sep}`) ? target : undefined;
}

export function registerUploadedAsset(fileUrl: string) {
  getDb().prepare("INSERT OR IGNORE INTO uploaded_assets(file_url) VALUES (?)").run(fileUrl);
}

export function claimUploadedAssets(values: Array<string | null | undefined>) {
  const urls = new Set<string>();
  for (const value of values) {
    for (const match of String(value || "").matchAll(/(?:src=["']|^)(\/uploads\/[^"'\s<]+)/g)) {
      urls.add(match[1]);
    }
  }
  const claim = getDb().prepare(
    "UPDATE uploaded_assets SET claimed_at=CURRENT_TIMESTAMP WHERE file_url=?",
  );
  for (const url of urls) claim.run(url);
}

/** Remove registered files older than a day when no saved content references them. */
export function cleanupUnreferencedUploads() {
  const db = getDb();
  const candidates = db
    .prepare(
      `SELECT file_url FROM uploaded_assets
       WHERE created_at < datetime('now', '-1 day')`,
    )
    .all() as { file_url: string }[];
  const referenced = db.prepare(
    `SELECT 1
     WHERE EXISTS(SELECT 1 FROM articles WHERE cover_url=? OR instr(content_html, ?) > 0)
        OR EXISTS(SELECT 1 FROM events WHERE banner_url=? OR instr(content_html, ?) > 0)
        OR EXISTS(SELECT 1 FROM event_map_settings WHERE image_url=?)`,
  );
  const remove = db.prepare("DELETE FROM uploaded_assets WHERE file_url=?");
  for (const { file_url: url } of candidates) {
    if (referenced.get(url, url, url, url, url)) continue;
    const target = localUploadPath(url);
    if (target) {
      try {
        fs.rmSync(target, { force: true });
      } catch {
        continue;
      }
    }
    remove.run(url);
  }
}
