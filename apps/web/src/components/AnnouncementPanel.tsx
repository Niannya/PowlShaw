import Link from "next/link";

function safeLink(url: string) {
  if (url.startsWith("/") && !url.startsWith("//") && !url.includes("\\")) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : "";
  } catch {
    return "";
  }
}

export function AnnouncementPanel({
  title,
  body,
  linkLabel,
  linkUrl,
}: {
  title: string;
  body: string;
  linkLabel: string;
  linkUrl: string;
}) {
  const href = safeLink(linkUrl);
  return (
    <section className="panel site-announcement">
      <h2 className="panel-title announcement">{title || "站内公告"}</h2>
      <div className="panel-body">
        <p>{body}</p>
        {href && linkLabel ? <Link href={href}>{linkLabel} →</Link> : null}
      </div>
    </section>
  );
}
