import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeEventMapSettings,
  validEventMapImageUrl,
} from "../src/lib/event-map-validation.ts";

const validSettings = {
  is_enabled: true,
  map_title: "列国纪世界地图",
  map_description: "浏览当前地图。",
  image_url: "/uploads/example.png",
  image_alt: "列国纪架空世界地图",
  image_width: 1844,
  image_height: 853,
  hero_kicker: "共创世界活动",
  map_eyebrow: "WORLD MAP",
  map_section_title: "当前世界地图",
  introduction_eyebrow: "ABOUT",
  introduction_title: "活动介绍",
  works_eyebrow: "STORIES",
  works_title: "参与作品",
};

test("event map image URLs reject protocol-relative and backslash paths", () => {
  assert.equal(validEventMapImageUrl("/uploads/map.png"), true);
  assert.equal(validEventMapImageUrl("https://example.com/map.png"), true);
  assert.equal(validEventMapImageUrl("//example.com/map.png"), false);
  assert.equal(validEventMapImageUrl(String.raw`\uploads\map.png`), false);
});

test("enabled event maps require an image and accessible labels", () => {
  assert.equal(normalizeEventMapSettings(validSettings).ok, true);
  assert.deepEqual(normalizeEventMapSettings({ ...validSettings, image_url: "" }), {
    ok: false,
    error: "启用地图前请先上传地图图片。",
  });
  assert.deepEqual(normalizeEventMapSettings({ ...validSettings, image_alt: "" }), {
    ok: false,
    error: "请填写地图图片的替代文字。",
  });
});

test("event map dimensions must be safe positive integers", () => {
  const result = normalizeEventMapSettings({ ...validSettings, image_width: 0 });
  assert.deepEqual(result, { ok: false, error: "地图尺寸不正确，请重新选择图片。" });
});
