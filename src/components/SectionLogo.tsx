"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type SectionIdentity = {
  prefix: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  tone: string;
};

const homeIdentity: Omit<SectionIdentity, "prefix"> = {
  eyebrow: "writing collective",
  title: "破晓",
  subtitle: "写作与作品档案",
  tone: "home",
};

// 每个分区的标识紧邻渲染组件，修改对应页面的左上角文字时直接改这里。
const sectionIdentities: SectionIdentity[] = [
  {
    prefix: "/articles",
    eyebrow: "the archive",
    title: "作品",
    subtitle: "stories & writings",
    tone: "archive",
  },
  {
    prefix: "/events",
    eyebrow: "special projects",
    title: "活动",
    subtitle: "past & present",
    tone: "events",
  },
  {
    prefix: "/search",
    eyebrow: "find a passage",
    title: "索引",
    subtitle: "search the archive",
    tone: "search",
  },
  {
    prefix: "/account",
    eyebrow: "members only",
    title: "账号",
    subtitle: "passwords & notices",
    tone: "account",
  },
  {
    prefix: "/login",
    eyebrow: "members only",
    title: "登录",
    subtitle: "invited accounts",
    tone: "account",
  },
  {
    prefix: "/about",
    eyebrow: "about this place",
    title: "破晓",
    subtitle: "who we are",
    tone: "about",
  },
  {
    prefix: "/changelog",
    eyebrow: "what has changed",
    title: "更新",
    subtitle: "site history",
    tone: "change",
  },
];

function getSectionIdentity(pathname: string) {
  return sectionIdentities.find((section) => pathname.startsWith(section.prefix)) ?? homeIdentity;
}

export function SectionLogo() {
  const pathname = usePathname();
  const section = getSectionIdentity(pathname);

  return (
    <Link href="/" className={`site-logo logo-${section.tone}`} aria-label="返回首页">
      <small>{section.eyebrow}</small>
      <strong>{section.title}</strong>
      <em>{section.subtitle}</em>
    </Link>
  );
}
