import { jsonError } from "@/lib/admin";
import { isAdminRequest } from "@/lib/auth";
import { auditAdmin } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { normalizeDateFilter } from "@/lib/date-filter";
import { containsLike } from "@/lib/db-search";
import { localDayBoundaryUtc } from "@/lib/date-time";

type Row = Record<string, string | number | null>;

function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return jsonError("请先登录。", 401);
  const search = new URL(request.url).searchParams;
  const format = search.get("format") === "json" ? "json" : "csv";
  const clauses: string[] = [];
  const values: unknown[] = [];
  const q = search.get("q");
  const article = search.get("article");
  const user = search.get("user");
  const status = search.get("status");
  if (q) {
    clauses.push("c.content LIKE ? ESCAPE '\\'");
    values.push(containsLike(q));
  }
  if (article) {
    clauses.push("(a.title LIKE ? ESCAPE '\\' OR a.slug LIKE ? ESCAPE '\\')");
    const value = containsLike(article);
    values.push(value, value);
  }
  if (user) {
    clauses.push("(u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\')");
    const value = containsLike(user);
    values.push(value, value);
  }
  if (status === "visible" || status === "hidden") {
    clauses.push("c.status=?");
    values.push(status);
  } else if (status === "deleted") {
    clauses.push("c.deleted_at IS NOT NULL");
  }
  const from = normalizeDateFilter(search.get("from"));
  const to = normalizeDateFilter(search.get("to"));
  if (from) {
    clauses.push("c.created_at>=?");
    values.push(localDayBoundaryUtc(from));
  }
  if (to) {
    clauses.push("c.created_at<=?");
    values.push(localDayBoundaryUtc(to, true));
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = getDb()
    .prepare(
      `SELECT c.id, c.content, c.status, c.is_pinned, c.edited_at, c.deleted_at,
              c.deleted_by, c.created_at, u.username, u.display_name,
              a.title AS article_title, a.slug AS article_slug
       FROM comments c
       JOIN users u ON u.id=c.user_id
       JOIN articles a ON a.id=c.article_id
       ${where}
       ORDER BY c.created_at DESC`,
    )
    .all(...values) as Row[];
  auditAdmin("export", "comments", undefined, { format, count: rows.length });
  if (format === "json") {
    return new Response(JSON.stringify(rows, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": 'attachment; filename="comments.json"',
      },
    });
  }
  const columns = Object.keys(rows[0] || { id: "", content: "" });
  const csv = [columns.map(csvCell).join(",")]
    .concat(rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")))
    .join("\r\n");
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="comments.csv"',
    },
  });
}
