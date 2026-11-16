export type EventMapConfig = {
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

export const eventMapDefaults: Record<string, EventMapConfig> = {
  "the-legends-of-countries": {
    map_title: "列国纪世界地图",
    map_description: "浏览列国纪共创世界的当前地图。",
    image_url: "/assets/events/the-legends-of-countries/map-final.png",
    image_alt: "列国纪架空世界地图",
    image_width: 1844,
    image_height: 853,
    hero_kicker: "A COLLABORATIVE WORLD · 共创世界活动",
    map_eyebrow: "THE WORLD AS IT STANDS",
    map_section_title: "当前世界地图",
    introduction_eyebrow: "ABOUT THE PROJECT",
    introduction_title: "活动介绍",
    works_eyebrow: "STORIES FROM THIS WORLD",
    works_title: "参与作品",
  },
};

export function getDefaultEventMapConfig(slug: string) {
  return eventMapDefaults[slug];
}
