import Link from "next/link";
import { AdminNavigation } from "@/components/admin/AdminNavigation";
import { LogoutButton } from "@/components/admin/LogoutButton";

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="site-logo admin-logo" href="/admin" aria-label="返回管理概览">
          <small>writing collective</small>
          <strong>破晓</strong>
          <em>管理手帖 · archive desk</em>
        </Link>
        <p className="admin-sidebar-caption">内容管理 / ADMIN INDEX</p>
        <AdminNavigation />
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <span className="admin-topbar-title">✦ 破晓 · 管理手帖</span>
          <div className="admin-topbar-actions">
            <Link href="/" target="_blank" rel="noopener noreferrer">
              查看网站 ↗
            </Link>
            <LogoutButton />
          </div>
        </header>
        <main className="admin-content">{children}</main>
        <footer className="admin-footer">
          破晓 · 作品档案 <span>仅管理员可见</span>
        </footer>
      </div>
    </div>
  );
}
