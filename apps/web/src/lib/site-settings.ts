import { getSiteSettings as getPublicSiteSettings } from "@/lib/api/public";
import type { SiteSettingKey, SiteSettings } from "@/lib/api/types";

export type { SiteSettingKey, SiteSettings };

export const siteSettingDefaults: SiteSettings = {
  welcome_title: "欢迎！！！",
  welcome_opening: "欢迎来到破晓！",
  welcome_about_link: "想知道什么是破晓？",
  welcome_random_link: "想随便看看？",
  welcome_treat_prefix: "或是想",
  welcome_cookie_button: "来块饼干",
  welcome_tea_button: "来杯红茶",
  welcome_treat_suffix: "？",
  welcome_closing: "希望你能在这里享受宁静的片刻。玩得愉快！",
  welcome_visit_prefix: "（顺带一提，这是第 ",
  welcome_visit_suffix: " 次访问。少得可怜呢……）",
  announcement_enabled: "1",
  announcement_title: "站内公告",
  announcement_body: "第一届破晓活动资料已经整理上线。",
  announcement_link_label: "查看第一届破晓",
  announcement_link_url: "/events/first-poxiao",
  site_started_on: "2026-09-03",
  visit_count: "0",
};

export async function getSiteSettings(): Promise<SiteSettings> {
  return getPublicSiteSettings();
}
