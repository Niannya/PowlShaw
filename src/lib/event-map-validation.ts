export type EditableEventMapSettings = {
  is_enabled: boolean;
  map_title: string;
  map_description: string;
  image_url: string;
  image_alt: string;
  image_width: number;
  image_height: number;
  hero_kicker: string;
  map_eyebrow: string;
  map_section_title: string;
  introduction_eyebrow: string;
  introduction_title: string;
  works_eyebrow: string;
  works_title: string;
};

type ValidationResult =
  { ok: true; value: EditableEventMapSettings } | { ok: false; error: string };

const textLimits = {
  map_title: 120,
  map_description: 500,
  image_alt: 300,
  hero_kicker: 160,
  map_eyebrow: 120,
  map_section_title: 80,
  introduction_eyebrow: 120,
  introduction_title: 80,
  works_eyebrow: 120,
  works_title: 80,
} as const;

function normalizeText(value: unknown, limit: number) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

export function validEventMapImageUrl(value: unknown) {
  const url = String(value || "").trim();
  if (!url || url.includes("\\") || url.includes("\0")) return false;
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeEventMapSettings(value: unknown): ValidationResult {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "没有收到地图设置。" };
  }
  const body = value as Record<string, unknown>;
  const isEnabled = body.is_enabled === true || body.is_enabled === 1 || body.is_enabled === "1";
  const imageUrl = String(body.image_url || "").trim();
  const imageWidth = Number(body.image_width);
  const imageHeight = Number(body.image_height);

  if (imageUrl && !validEventMapImageUrl(imageUrl)) {
    return { ok: false, error: "地图地址必须是站内路径，或以 http://、https:// 开头。" };
  }
  if (isEnabled && !imageUrl) return { ok: false, error: "启用地图前请先上传地图图片。" };
  if (
    imageUrl &&
    (!Number.isSafeInteger(imageWidth) ||
      !Number.isSafeInteger(imageHeight) ||
      imageWidth < 1 ||
      imageHeight < 1 ||
      imageWidth > 30000 ||
      imageHeight > 30000)
  ) {
    return { ok: false, error: "地图尺寸不正确，请重新选择图片。" };
  }

  const normalized = Object.fromEntries(
    Object.entries(textLimits).map(([key, limit]) => [key, normalizeText(body[key], limit)]),
  ) as unknown as Pick<EditableEventMapSettings, keyof typeof textLimits>;

  if (isEnabled && !normalized.image_alt) {
    return { ok: false, error: "请填写地图图片的替代文字。" };
  }
  if (isEnabled && (!normalized.map_title || !normalized.map_section_title)) {
    return { ok: false, error: "请填写独立地图页标题和专题页地图标题。" };
  }

  return {
    ok: true,
    value: {
      is_enabled: isEnabled,
      image_url: imageUrl,
      image_width: imageUrl ? imageWidth : 1,
      image_height: imageUrl ? imageHeight : 1,
      ...normalized,
    },
  };
}
