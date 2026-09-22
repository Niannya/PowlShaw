import Link from "next/link";
import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { NotificationReadButton } from "@/components/account/NotificationReadButton";
import { PasswordChangeForm } from "@/components/account/PasswordChangeForm";
import { UserLogoutButton } from "@/components/account/UserLogoutButton";
import { getDb } from "@/lib/db";
import { formatUtcDateTime } from "@/lib/date-time";
import { safeInternalPath } from "@/lib/safe-path";
import { getCurrentUser } from "@/lib/user-auth";

type Props = { searchParams: Promise<{ first?: string; next?: string }> };

export const metadata = { title: "账号中心" };

export default async function AccountPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Faccount");
  const query = await searchParams;
  const returnPath = safeInternalPath(query.next, "/account");
  const notifications = getDb()
    .prepare(
      `SELECT n.id, n.type, n.is_read, n.created_at, c.id AS comment_id,
              a.slug AS article_slug, a.title AS article_title,
              actor.display_name AS actor_name
       FROM notifications n
       LEFT JOIN comments c ON c.id=n.comment_id
       LEFT JOIN articles a ON a.id=c.article_id
       LEFT JOIN users actor ON actor.id=n.actor_user_id
       WHERE n.user_id=?
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT 100`,
    )
    .all(user.id) as {
    id: number;
    type: "mention" | "reply";
    is_read: number;
    created_at: string;
    comment_id: number | null;
    article_slug: string | null;
    article_title: string | null;
    actor_name: string | null;
  }[];
  const unread = notifications.filter((item) => !item.is_read).length;

  return (
    <>
      <Breadcrumbs items={[{ label: "账号中心" }]} />
      <div className="page-pad account-page">
        <section className="account-box">
          <h1>账号中心</h1>
          <p>
            当前账号：<strong>{user.display_name}</strong>（{user.username}） · <UserLogoutButton />
          </p>
          {query.first || user.must_change_password ? (
            <p className="form-error">这是管理员设置的初始密码，请先修改密码再发表评论。</p>
          ) : null}
          <h2>修改密码</h2>
          <PasswordChangeForm returnPath={returnPath} />
        </section>

        <section className="account-box notification-box">
          <div className="section-heading-row">
            <h2>提及与回复（{unread} 条未读）</h2>
            {unread ? <NotificationReadButton /> : null}
          </div>
          <ul className="notification-list">
            {notifications.map((item) => (
              <li key={item.id} className={item.is_read ? "" : "is-unread"}>
                {item.article_slug && item.comment_id ? (
                  <Link href={`/articles/${item.article_slug}?commentId=${item.comment_id}`}>
                    {item.actor_name || "某位用户"}
                    {item.type === "reply" ? "回复了你的评论" : "在评论中提到了你"}：
                    {item.article_title}
                  </Link>
                ) : (
                  "对应评论已经不存在"
                )}
                <small>{formatUtcDateTime(item.created_at)}</small>
              </li>
            ))}
            {!notifications.length ? <li>目前没有通知。</li> : null}
          </ul>
        </section>
      </div>
    </>
  );
}
