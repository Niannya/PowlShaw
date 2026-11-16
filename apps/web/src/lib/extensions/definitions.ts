import { z } from "zod";
import type { ExtensionDefinition } from "./types";

/**
 * 活动扩展模块的“数据定义层”：只包含版本与 Zod schema，不含 React 组件。
 * - 服务端用它校验 `config_json` / `payload_json`；
 * - 前端 registry 用它反序列化并挑选渲染组件；
 * - 新增一届活动的差异化模块时，只需在这里新增一个 `kind` 定义，再在 registry 中注册视图。
 */

const titleSchema = z.string().trim().min(1, "标题不能为空").max(80, "标题不能超过 80 个字符");

const rankingConfig = z.object({
  title: titleSchema.default("晋级名单"),
  note: z.string().trim().max(500).optional().default(""),
  columns: z.array(z.string().trim().min(1).max(20)).max(6).optional().default([]),
  showAward: z.boolean().optional().default(true),
});

const rankingItem = z.object({
  rank: z.number().int().min(1).max(999),
  name: z.string().trim().min(1).max(80),
  work: z.string().trim().max(120).optional().default(""),
  award: z.string().trim().max(80).optional().default(""),
  note: z.string().trim().max(300).optional().default(""),
});

const timelineConfig = z.object({
  title: titleSchema.default("活动时间线"),
  note: z.string().trim().max(500).optional().default(""),
});

const timelineItem = z.object({
  date: z.string().trim().min(4).max(40),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().max(1000).optional().default(""),
  done: z.boolean().optional().default(false),
});

const galleryConfig = z.object({
  title: titleSchema.default("作品墙"),
  note: z.string().trim().max(500).optional().default(""),
  columns: z
    .union([z.literal(2), z.literal(3), z.literal(4)])
    .optional()
    .default(3),
});

const galleryItem = z.object({
  title: z.string().trim().min(1).max(120),
  author: z.string().trim().max(80).optional().default(""),
  summary: z.string().trim().max(600).optional().default(""),
  href: z.string().trim().max(500).optional().default(""),
  tag: z.string().trim().max(40).optional().default(""),
});

const ballotConfig = z.object({
  title: titleSchema.default("读者投票"),
  prompt: z.string().trim().max(500).optional().default(""),
  options: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(40),
        label: z.string().trim().min(1).max(120),
      }),
    )
    .min(1, "至少提供一个投票选项")
    .max(30),
  multiple: z.boolean().optional().default(false),
});

const ballotItem = z.object({
  choice: z.union([z.string().trim().min(1).max(40), z.array(z.string().trim().min(1).max(40))]),
  note: z.string().trim().max(300).optional().default(""),
});

export const rankingExtension: ExtensionDefinition<
  z.infer<typeof rankingConfig>,
  z.infer<typeof rankingItem>
> = {
  kind: "ranking",
  version: 1,
  title: "晋级名单",
  description: "按名次展示晋级者、作品与奖项，适合评议公示与决赛名单。",
  configSchema: rankingConfig,
  itemSchema: rankingItem,
};

export const timelineExtension: ExtensionDefinition<
  z.infer<typeof timelineConfig>,
  z.infer<typeof timelineItem>
> = {
  kind: "timeline",
  version: 1,
  title: "时间线",
  description: "按日期展示活动节点，适合赛程、征稿与评审安排。",
  configSchema: timelineConfig,
  itemSchema: timelineItem,
};

export const galleryExtension: ExtensionDefinition<
  z.infer<typeof galleryConfig>,
  z.infer<typeof galleryItem>
> = {
  kind: "gallery",
  version: 1,
  title: "作品墙",
  description: "以纯代码卡片陈列作品，不使用任何位图。",
  configSchema: galleryConfig,
  itemSchema: galleryItem,
};

export const ballotExtension: ExtensionDefinition<
  z.infer<typeof ballotConfig>,
  z.infer<typeof ballotItem>
> = {
  kind: "ballot",
  version: 1,
  title: "读者投票",
  description: "受邀登录用户可提交投票条目；未开启互动时仅展示说明。",
  configSchema: ballotConfig,
  itemSchema: ballotItem,
  allowsUserItems: true,
};

export const extensionDefinitions = {
  ranking: rankingExtension,
  timeline: timelineExtension,
  gallery: galleryExtension,
  ballot: ballotExtension,
} as const;

export type ExtensionDefinitionMap = typeof extensionDefinitions;
export type RegisteredExtensionKind = keyof ExtensionDefinitionMap;

export function getExtensionDefinition(kind: string) {
  return extensionDefinitions[kind as RegisteredExtensionKind];
}

export const extensionKindOptions = Object.values(extensionDefinitions).map((definition) => ({
  kind: definition.kind,
  title: definition.title,
  description: definition.description,
  version: definition.version,
}));
