/**
 * 前台固定文案集中在这里。
 *
 * 日常改字时，只修改引号里的内容即可。不要修改冒号左侧的名称，
 * 也不要删除逗号、引号或花括号。
 *
 * 文章和活动不在这里维护，请使用管理后台。
 */
export const siteConfig = {
  identity: {
    name: "破晓",
    tagline: "写作与作品档案",
    description: "破晓写作组作品档案",
  },

  navigation: {
    directoryTitle: "导航",
    directoryColor: "#f2ed27",
    directoryLinks: [
      { href: "/", label: "首页" },
      { href: "/about", label: "关于破晓" },
      { href: "/changelog", label: "更新记录" },
      { href: "/login", label: "登入" },
    ],
    worksTitle: "作品",
    worksColor: "#ff7255",
    worksLinks: [
      { href: "/articles", label: "全部文章" },
      { href: "/events", label: "活动专题" },
      { href: "/search", label: "搜索" },
    ],
    archiveTitle: "文章档案",
    archiveColor: "#ffa70f",
  },

  sectionLogos: [
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
  ],

  homeLogo: {
    eyebrow: "writing collective",
    title: "破晓",
    tone: "home",
  },

  statusBar: {
    clockLabel: "local time",
    message: "dawn comes after every long night",
  },

  footer: {
    left: "破晓 · 作品档案",
    right: "请尊重原作与作品版权",
  },

  home: {
    welcomeTitle: "欢迎！！！",
    welcome: {
      opening: "欢迎来到破晓！",
      aboutLink: "想知道什么是破晓？",
      randomLink: "想随便看看？",
      treatPrefix: "或是想",
      cookieButton: "来块饼干",
      teaButton: "来杯红茶",
      treatSuffix: "？",
      closing: "希望你能在这里享受宁静的片刻。玩得愉快！",
      visitPrefix: "（顺带一提，这是第 ",
      visitSuffix: " 次访问。少得可怜呢……）",
    },
    recentTitle: "最近更新",
  },

  about: {
    title: "关于破晓",
    paragraphs: [
      "破晓是写作组所举办的一系列小说比赛以及相关活动。",
      "而此网站则为了记录破晓而设立。",
      "网站目前提供作品展示与受邀账号评论，不开放公开注册或公众投稿。",
    ],
  },

  changelog: {
    title: "更新记录",
    entryTitle: "网站建立",
    entryText: "建立作品档案和活动专题页面。",
  },
} as const;
