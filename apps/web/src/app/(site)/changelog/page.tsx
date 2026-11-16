import { Breadcrumbs } from "@/components/Breadcrumbs";

const pageTitle = "更新记录";
const firstEntry = {
  title: "网站建立",
  content: "建立作品档案和活动专题页面。",
};

export const metadata = { title: pageTitle };

export default function ChangelogPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: pageTitle }]} />
      <div className="page-pad">
        <h1 className="site-heading">{pageTitle}</h1>
        <section className="panel">
          <h2 className="panel-title green">{firstEntry.title}</h2>
          <div className="panel-body">
            <p>{firstEntry.content}</p>
          </div>
        </section>
      </div>
    </>
  );
}
