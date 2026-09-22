"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { siteConfig } from "@/config/site";

export function SectionLogo({ tagline }: { tagline: string }) {
  const pathname = usePathname();
  const section = siteConfig.sectionLogos.find((item) => pathname.startsWith(item.prefix)) || {
    eyebrow: siteConfig.homeLogo.eyebrow,
    title: siteConfig.homeLogo.title,
    subtitle: tagline,
    tone: siteConfig.homeLogo.tone,
  };
  return (
    <Link href="/" className={`site-logo logo-${section.tone}`} aria-label="返回首页">
      <small>{section.eyebrow}</small>
      <strong>{section.title}</strong>
      <em>{section.subtitle}</em>
    </Link>
  );
}
