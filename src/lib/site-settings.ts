import { getDb } from "@/lib/db";

export const siteSettingDefaults = {
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
} as const;

export type SiteSettingKey = keyof typeof siteSettingDefaults;

export function getSiteSettings() {
  const rows = getDb()
    .prepare(
      `SELECT key, value FROM site_settings
       WHERE key IN (${Object.keys(siteSettingDefaults)
         .map(() => "?")
         .join(",")})`,
    )
    .all(...Object.keys(siteSettingDefaults)) as { key: SiteSettingKey; value: string }[];
  const saved = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return { ...siteSettingDefaults, ...saved };
}

export function getLastPublicUpdate() {
  const row = getDb()
    .prepare(
      `SELECT MAX(updated_at) AS updated_at
       FROM (
         SELECT updated_at FROM articles WHERE status='published'
         UNION ALL
         SELECT updated_at FROM events
       )`,
    )
    .get() as { updated_at: string | null };
  return row.updated_at;
}
