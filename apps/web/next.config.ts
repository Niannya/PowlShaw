import type { NextConfig } from "next";

const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// 单应用架构：`/api/v1/*` 由同仓挂载的 Hono（src/app/api/v1/[[...route]]）直接处理，
// 不再需要 Next 重写到独立后端，也不再由 Nginx 反代双进程。
const nextConfig: NextConfig = {
  ...(allowedDevOrigins.length ? { allowedDevOrigins } : {}),
  async redirects() {
    // “列国纪”下线后，旧地图深链回落到普通活动页；?snapshot= 参数会被忽略。
    return [
      {
        source: "/events/:slug/map",
        destination: "/events/:slug",
        statusCode: 301,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
