import sanitizeHtml from "sanitize-html";
import { marked } from "marked";

export function cleanHtml(html: string) {
  return sanitizeHtml(html || "", {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "figure",
      "figcaption",
      "h1",
      "h2",
      "iframe",
      "span",
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      iframe: ["src", "title", "width", "height", "allowfullscreen"],
      "*": ["class", "data-original-src"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    allowedIframeHostnames: ["www.youtube.com", "player.bilibili.com"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true),
      img: sanitizeHtml.simpleTransform("img", { loading: "lazy" }, true),
    },
  });
}

export function markdownToHtml(markdown: string) {
  return cleanHtml(String(marked.parse(markdown, { async: false, gfm: true })));
}

export function textExcerpt(html: string, length = 120) {
  const text = sanitizeHtml(html || "", { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
  return text.length > length ? `${text.slice(0, length)}……` : text;
}

export function slugify(input: string, fallback = "item") {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{Letter}\p{Number}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || fallback;
}

export function formatDate(value?: string | null) {
  if (!value) return "日期未定";
  const date = new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : "+08:00"));
  if (Number.isNaN(date.getTime())) return value.slice(0, 10).replaceAll("-", ".");
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatMonth(value?: string | null) {
  if (!value) return "月份未定";
  const match = /^(\d{4})-(\d{2})/.exec(value);
  return match ? `${match[1]}年${match[2]}月` : value.slice(0, 7).replace("-", "年") + "月";
}
