import Link from "next/link";

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="breadcrumbs" aria-label="当前位置">
      <Link href="/">首页</Link>
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`}>
          <b> &gt; </b>
          {item.href ? <Link href={item.href}>{item.label}</Link> : item.label}
        </span>
      ))}
    </nav>
  );
}
