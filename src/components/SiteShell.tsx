import Link from "next/link";
import { SiteClock } from "@/components/SiteClock";
import { SectionLogo } from "@/components/SectionLogo";
import { getDb } from "@/lib/db";
import { getArchiveYears } from "@/lib/queries";
import { getSiteSettings } from "@/lib/site-settings";
import { getCurrentUser } from "@/lib/user-auth";

type NavItem = {
  href: string;
  label: string;
};

type NavGroupProps = {
  title: string;
  color: string;
  children: React.ReactNode;
};

// 固定导航和布局放在同一个文件中，改菜单时不需要再查找单独的文案配置。
const mainNavigation: NavItem[] = [
  { href: "/", label: "首页" },
  { href: "/about", label: "关于破晓" },
  { href: "/changelog", label: "更新记录" },
  { href: "/login", label: "登入" },
];

const workNavigation: NavItem[] = [
  { href: "/articles", label: "全部文章" },
  { href: "/events", label: "活动专题" },
  { href: "/search", label: "搜索" },
];

function NavGroup({ title, color, children }: NavGroupProps) {
  return (
    <section className="nav-group">
      <h2 style={{ backgroundColor: color }}>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

function NavigationLinks({ items }: { items: NavItem[] }) {
  return items.map((item) => (
    <Link key={item.href} href={item.href}>
      {item.label}
    </Link>
  ));
}

function getUnreadNotificationCount(userId: number | undefined) {
  if (!userId) return 0;

  const row = getDb()
    .prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id=? AND is_read=0")
    .get(userId) as { count: number };
  return row.count;
}

export async function SiteShell({ children }: { children: React.ReactNode }) {
  // 年份、建站日期和登录状态会变化，仍然从数据库和会话实时读取。
  const years = getArchiveYears();
  const settings = getSiteSettings();
  const user = await getCurrentUser();
  const unread = getUnreadNotificationCount(user?.id);

  return (
    <div className="site-shell">
      <aside className="sidebar">
        <SectionLogo />

        <NavGroup title="导航" color="#f2ed27">
          <NavigationLinks items={mainNavigation} />
        </NavGroup>
        <NavGroup title="作品" color="#ff7255">
          <NavigationLinks items={workNavigation} />
        </NavGroup>
        {years.length > 0 && (
          <NavGroup title="文章档案" color="#ffa70f">
            {years.map((year) => (
              <Link key={year.year} href={`/search?year=${year.year}`}>
                {year.year}年（{year.count}）
              </Link>
            ))}
          </NavGroup>
        )}
      </aside>
      <main className="main-column">
        <div className="status-strip">
          <b>local time</b> <SiteClock />
          <i> dawn comes after every long night</i>
          <span className="account-status-link">
            {user ? (
              <Link href="/account">
                {user.display_name}
                {unread ? `（${unread}）` : ""}
              </Link>
            ) : (
              <Link href="/login">登录</Link>
            )}
          </span>
        </div>
        {children}
        <footer className="site-footer">
          <span>
            破晓 · 作品档案
            <small title="建站日期"> · 始于 {settings.site_started_on.replaceAll("-", ".")}</small>
          </span>
          <span>请尊重原作与作品版权</span>
        </footer>
      </main>
    </div>
  );
}
