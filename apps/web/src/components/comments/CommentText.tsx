import Link from "next/link";

const tokenPattern = /(https?:\/\/[^\s<]+|@[\p{L}\p{N}_-]{3,32})/gu;
const trailingPunctuationPattern = /[，。！？、；：）】》」』〉.,!?;:]+$/u;

export function CommentText({ children }: { children: string }) {
  const parts = children.split(tokenPattern);
  return (
    <p className="comment-text">
      {parts.map((part, index) => {
        if (/^https?:\/\//i.test(part)) {
          const suffix = part.match(trailingPunctuationPattern)?.[0] || "";
          const href = suffix ? part.slice(0, -suffix.length) : part;
          return (
            <span key={index}>
              <a href={href} target="_blank" rel="nofollow noreferrer noopener">
                {href}
              </a>
              {suffix}
            </span>
          );
        }
        if (part.startsWith("@")) {
          return (
            <Link key={index} href="/account" className="comment-mention">
              {part}
            </Link>
          );
        }
        return part;
      })}
    </p>
  );
}
