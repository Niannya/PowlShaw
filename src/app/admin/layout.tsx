export const dynamic = "force-dynamic";
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-body">{children}</div>;
}
