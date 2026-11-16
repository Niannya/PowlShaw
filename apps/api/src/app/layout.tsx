import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PowlShaw API",
  robots: { index: false, follow: false },
};

export default function ApiRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
