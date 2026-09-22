import Link from "next/link";
import { SiteClock } from "@/components/SiteClock";
import { SectionLogo } from "@/components/SectionLogo";
import { siteConfig } from "@/config/site";
import { getDb } from "@/lib/db";
import { getArchiveYears } from "@/lib/queries";
import { getSiteSettings } from "@/lib/site-settings";
import { getCurrentUser } from "@/lib/user-auth";

function NavGroup({
  title,
  color,
  children,
}: {
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <section className="nav-group">
      <h2 style={{ backgroundColor: color }}>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

export async function SiteShell({ children }: { children: React.ReactNode }) {
  const years = getArchiveYears();
  const settings = getSiteSettings();
  const user = await getCurrentUser();
  const unread = user
    ? (
        getDb()
          .prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id=? AND is_read=0")
          .get(user.id) as { count: number }
      ).count
    : 0;

  return (
    <div className="site-shell">
      <aside className="sidebar">
        <SectionLogo tagline={siteConfig.identity.tagline} />

        <NavGroup
          title={siteConfig.navigation.directoryTitle}
          color={siteConfig.navigation.directoryColor}
        >
          {siteConfig.navigation.directoryLinks.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </NavGroup>
        <NavGroup title={siteConfig.navigation.worksTitle} color={siteConfig.navigation.worksColor}>
          {siteConfig.navigation.worksLinks.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </NavGroup>
        {years.length > 0 && (
          <NavGroup
            title={siteConfig.navigation.archiveTitle}
            color={siteConfig.navigation.archiveColor}
          >
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
          <b>{siteConfig.statusBar.clockLabel}</b> <SiteClock />
          <i> {siteConfig.statusBar.message}</i>
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
            {siteConfig.footer.left}
            <small title="建站日期"> · 始于 {settings.site_started_on.replaceAll("-", ".")}</small>
          </span>
          <span>{siteConfig.footer.right}</span>
        </footer>
      </main>
    </div>
  );
}
