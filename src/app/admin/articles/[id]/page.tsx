import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { ArticleForm } from "@/components/admin/ArticleForm";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";

export default async function EditArticle({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  const db = getDb();
  const article = db.prepare("SELECT * FROM articles WHERE id=?").get(id) as
    Record<string, unknown> | undefined;
  if (!article) notFound();
  const events = db
    .prepare("SELECT id,title FROM events ORDER BY starts_at DESC")
    .all() as unknown as { id: number; title: string }[];
  const eventIds = (
    db
      .prepare("SELECT event_id AS id FROM event_articles WHERE article_id=?")
      .all(id) as unknown as { id: number }[]
  ).map((r) => r.id);
  return (
    <AdminShell>
      <h1>编辑文章</h1>
      <ArticleForm initial={{ ...(article as object), event_ids: eventIds }} events={events} />
    </AdminShell>
  );
}
