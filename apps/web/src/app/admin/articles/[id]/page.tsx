import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { ArticleForm } from "@/components/admin/ArticleForm";
import { getAdminArticle } from "@/lib/api/admin";
import { requireAdmin } from "@/lib/auth";

export default async function EditArticle({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  const data = await getAdminArticle(id);
  if (!data) notFound();
  return (
    <AdminShell>
      <h1>编辑文章</h1>
      <ArticleForm initial={{ ...data.article, event_ids: data.eventIds }} events={data.events} />
    </AdminShell>
  );
}
