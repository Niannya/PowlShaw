"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const groups = [
  {
    title: "档案",
    color: "yellow",
    links: [
      { href: "/admin", label: "内容概览" },
      { href: "/admin/articles", label: "文章" },
      { href: "/admin/events", label: "活动" },
    ],
  },
  {
    title: "往来",
    color: "coral",
    links: [
      { href: "/admin/comments", label: "评论" },
      { href: "/admin/users", label: "用户" },
    ],
  },
  {
    title: "维护",
    color: "blue",
    links: [
      { href: "/admin/settings", label: "站点设置" },
      { href: "/admin/security", label: "后台安全" },
      { href: "/admin/audit", label: "操作记录" },
    ],
  },
] as const;

export function AdminNavigation() {
  const pathname = usePathname();

  return (
    <nav className="admin-navigation" aria-label="后台导航">
      {groups.map((group) => (
        <section className="admin-nav-group" key={group.title}>
          <h2 className={group.color}>{group.title}</h2>
          <div>
            {group.links.map((link) => {
              const active =
                link.href === "/admin"
                  ? pathname === link.href
                  : pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  className={active ? "is-current" : undefined}
                  aria-current={active ? "page" : undefined}
                  href={link.href}
                  key={link.href}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}
