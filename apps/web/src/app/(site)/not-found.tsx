import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default function NotFound() {
  return (
    <>
      <Breadcrumbs items={[{ label: "页面不存在" }]} />
      <div className="page-pad">
        <section className="article-header">
          <h1>404：没有找到这一页</h1>
          <p>它可能被移动、改名，或者从未存在过。</p>
          <p>
            <Link href="/">返回破晓首页</Link>
          </p>
        </section>
      </div>
    </>
  );
}
