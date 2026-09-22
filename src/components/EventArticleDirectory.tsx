import { ArticleList } from "@/components/ArticleList";
import type { ArticleListItem } from "@/lib/queries";

type DirectoryNode = {
  name: string;
  articles: ArticleListItem[];
  children: Map<string, DirectoryNode>;
};

function newNode(name: string): DirectoryNode {
  return { name, articles: [], children: new Map() };
}

/**
 * 把后台填写的自由栏目路径转换成树。
 * 例如“科幻组 / 第一轮”是两层，“友谊赛”是一层，留空则直接平铺。
 */
function buildDirectory(articles: ArticleListItem[]) {
  const root = newNode("");

  for (const article of articles) {
    const path = (article.event_section_path || "")
      .split(/\s*(?:\/|／|>|＞)\s*/)
      .map((part) => part.trim())
      .filter(Boolean);
    let node = root;

    for (const part of path) {
      let child = node.children.get(part);
      if (!child) {
        child = newNode(part);
        node.children.set(part, child);
      }
      node = child;
    }
    node.articles.push(article);
  }

  return root;
}

function articleCount(node: DirectoryNode): number {
  return (
    node.articles.length +
    [...node.children.values()].reduce((sum, child) => sum + articleCount(child), 0)
  );
}

function renderNestedNode(node: DirectoryNode, keyPath: string, depth: number) {
  const count = articleCount(node);
  return (
    <details className="event-stage" open key={keyPath}>
      <summary>
        <span>{node.name}</span>
        <small>{count} 篇</small>
      </summary>
      <div className={`event-directory-children depth-${depth}`}>
        {node.articles.length ? <ArticleList articles={node.articles} /> : null}
        {[...node.children.values()].map((child, index) =>
          renderNestedNode(child, `${keyPath}-${index}`, depth + 1),
        )}
      </div>
    </details>
  );
}

export function EventArticleDirectory({ articles }: { articles: ArticleListItem[] }) {
  if (!articles.length) {
    return <p className="empty-note">目前还没有关联到这个活动的文章。</p>;
  }

  const root = buildDirectory(articles);
  const topSections = [...root.children.values()];

  // 没有设置栏目时保持普通活动的简单列表，不强加比赛结构。
  if (!topSections.length) return <ArticleList articles={root.articles} />;

  return (
    <div className="event-directory">
      {topSections.length > 1 ? (
        <nav className="event-directory-index" aria-label="活动作品快速跳转">
          <strong>快速跳转：</strong>
          {topSections.map((section, index) => (
            <a href={`#event-section-${index + 1}`} key={section.name}>
              {section.name}
            </a>
          ))}
        </nav>
      ) : null}

      {root.articles.length ? (
        <section className="event-ungrouped-articles">
          <ArticleList articles={root.articles} />
        </section>
      ) : null}

      {topSections.map((section, sectionIndex) => (
        <section
          className="event-article-group"
          id={`event-section-${sectionIndex + 1}`}
          key={section.name}
        >
          <h3>
            {section.name}
            <small>{articleCount(section)} 篇</small>
          </h3>
          {section.articles.length ? <ArticleList articles={section.articles} /> : null}
          {[...section.children.values()].map((child, index) =>
            renderNestedNode(child, `${sectionIndex}-${index}`, 1),
          )}
        </section>
      ))}
    </div>
  );
}
