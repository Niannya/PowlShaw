import { all, get } from "../db/sql";

/**
 * 站点设置。`siteSettingDefaults` 与旧实现逐字一致；
 * 数据库里的值覆盖默认值，缺失的键永远回退默认值，因此新增键不会破坏旧库。
 */
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
export type SiteSettings = Record<SiteSettingKey, string>;

export async function getSiteSettings(): Promise<SiteSettings> {
  const keys = Object.keys(siteSettingDefaults) as SiteSettingKey[];
  const rows = await all<{ key: SiteSettingKey; value: string }>(
    `SELECT key, value FROM site_settings
     WHERE key IN (${keys.map(() => "?").join(",")})`,
    keys,
  );
  const saved = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return { ...siteSettingDefaults, ...saved } as SiteSettings;
}

export async function getLastPublicUpdate() {
  const row = await get<{ updated_at: string | null }>(
    `SELECT MAX(updated_at) AS updated_at
     FROM (
       SELECT updated_at FROM articles WHERE status='published'
       UNION ALL
       SELECT updated_at FROM events
     )`,
  );
  return row?.updated_at ?? null;
}
