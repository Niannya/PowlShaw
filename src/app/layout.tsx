import type { Metadata } from "next";
import "./globals.css";

// 全站浏览器标题和搜索摘要直接在根布局中维护。
export const metadata: Metadata = {
  title: {
    default: "破晓",
    template: "%s｜破晓",
  },
  description: "破晓写作组作品档案",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
