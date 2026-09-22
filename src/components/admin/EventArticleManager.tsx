"use client";

import Link from "next/link";
import { DragEvent, FormEvent, useMemo, useRef, useState } from "react";
import { fetchJson } from "@/lib/client-fetch";

type EventArticleEntry = { id: number; title: string; section_path: string };
type InitialSection = { id: number; path_name: string };
type ArticleSection = {
  key: string;
  pathName: string;
  articles: EventArticleEntry[];
};
type SectionTreeNode = {
  section: ArticleSection;
  children: SectionTreeNode[];
};
type DraggedItem =
  | { type: "article"; articleId: number; sectionKey: string }
  | { type: "section"; sectionKey: string };

const UNGROUPED_KEY = "ungrouped";

function pathParts(value: string) {
  return value
    .split(/\s*(?:\/|／|>|＞)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizePath(value: string) {
  return pathParts(value).join(" / ").slice(0, 160);
}

function normalizeSegment(value: string) {
  return value
    .replace(/[\/／>＞]/g, "")
    .trim()
    .slice(0, 80);
}

function parentPath(pathName: string) {
  const parts = pathParts(pathName);
  return parts.slice(0, -1).join(" / ");
}

function sectionName(pathName: string) {
  return pathParts(pathName).at(-1) || pathName;
}

function pathIsInside(pathName: string, parent: string) {
  return pathName === parent || pathName.startsWith(`${parent} / `);
}

function buildSections(entries: EventArticleEntry[], initialSections: InitialSection[]) {
  const result: ArticleSection[] = [{ key: UNGROUPED_KEY, pathName: "", articles: [] }];
  const pathToSection = new Map<string, ArticleSection>();
  let generatedKey = 0;

  function ensurePath(pathValue: string, preferredKey?: string) {
    const parts = pathParts(pathValue);
    let currentPath = "";
    let currentSection: ArticleSection | undefined;

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath} / ${part}` : part;
      currentSection = pathToSection.get(currentPath);
      if (!currentSection) {
        currentSection = {
          key:
            index === parts.length - 1 && preferredKey
              ? preferredKey
              : `structure-${generatedKey++}`,
          pathName: currentPath,
          articles: [],
        };
        result.push(currentSection);
        pathToSection.set(currentPath, currentSection);
      }
    });
    return currentSection;
  }

  for (const section of initialSections) {
    const pathName = normalizePath(section.path_name);
    if (pathName) ensurePath(pathName, `saved-${section.id}`);
  }

  for (const entry of entries) {
    const pathName = normalizePath(entry.section_path);
    const section = pathName ? ensurePath(pathName, `legacy-${entry.id}`) : result[0];
    section?.articles.push({ ...entry, section_path: pathName });
  }
  return result;
}

function buildSectionTree(sections: ArticleSection[]) {
  const nodes = new Map<string, SectionTreeNode>();
  const roots: SectionTreeNode[] = [];

  for (const section of sections) {
    if (section.key === UNGROUPED_KEY || !section.pathName) continue;
    nodes.set(section.pathName, { section, children: [] });
  }
  for (const section of sections) {
    if (section.key === UNGROUPED_KEY || !section.pathName) continue;
    const node = nodes.get(section.pathName);
    if (!node) continue;
    const parent = nodes.get(parentPath(section.pathName));
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function flattenSectionTree(nodes: SectionTreeNode[]): ArticleSection[] {
  return nodes.flatMap((node) => [node.section, ...flattenSectionTree(node.children)]);
}

function subtreeArticleCount(node: SectionTreeNode): number {
  return (
    node.section.articles.length +
    node.children.reduce((total, child) => total + subtreeArticleCount(child), 0)
  );
}

export function EventArticleManager({
  eventId,
  initialEntries,
  initialSections,
}: {
  eventId: number;
  initialEntries: EventArticleEntry[];
  initialSections: InitialSection[];
}) {
  const [sections, setSections] = useState(() => buildSections(initialEntries, initialSections));
  const [newSectionName, setNewSectionName] = useState("");
  const [childParentPath, setChildParentPath] = useState("");
  const [childSectionName, setChildSectionName] = useState("");
  const [draggedItem, setDraggedItem] = useState<DraggedItem | null>(null);
  const draggedItemRef = useRef<DraggedItem | null>(null);
  const [dropTarget, setDropTarget] = useState("");
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const sectionTree = useMemo(() => buildSectionTree(sections), [sections]);
  const articleCount = useMemo(
    () => sections.reduce((total, section) => total + section.articles.length, 0),
    [sections],
  );

  function setError(messageText: string) {
    setMessage(messageText);
    setMessageIsError(true);
  }

  function markChanged() {
    setMessage("分组或顺序有改动，记得保存。");
    setMessageIsError(false);
  }

  function sectionExists(pathName: string) {
    const comparison = pathName.toLocaleLowerCase("zh-CN");
    return sections.some((section) => section.pathName.toLocaleLowerCase("zh-CN") === comparison);
  }

  function addSection(pathName: string) {
    setSections((current) => [
      ...current,
      { key: `new-${Date.now()}-${current.length}`, pathName, articles: [] },
    ]);
    markChanged();
  }

  function createSection(event: FormEvent) {
    event.preventDefault();
    const name = normalizeSegment(newSectionName);
    if (!name) return setError("请先填写一级分组名称。");
    if (sectionExists(name)) return setError(`分组“${name}”已经存在。`);
    addSection(name);
    setNewSectionName("");
  }

  function createChildSection(event: FormEvent) {
    event.preventDefault();
    const name = normalizeSegment(childSectionName);
    if (!name || !childParentPath) return setError("请填写子分组名称。");
    const pathName = `${childParentPath} / ${name}`;
    if (pathName.length > 160) return setError("分组层级或名称过长。");
    if (sectionExists(pathName)) return setError(`分组“${pathName}”已经存在。`);
    addSection(pathName);
    setChildSectionName("");
    setChildParentPath("");
  }

  function renameSection(sectionKey: string, value: string) {
    const name = normalizeSegment(value);
    if (!name) return;
    const renamed = sections.find((section) => section.key === sectionKey);
    if (!renamed) return;
    const oldPath = renamed.pathName;
    const parent = parentPath(oldPath);
    const nextPath = parent ? `${parent} / ${name}` : name;
    const longestPath = Math.max(
      ...sections
        .filter((section) => pathIsInside(section.pathName, oldPath))
        .map((section) => nextPath.length + section.pathName.slice(oldPath.length).length),
    );
    if (longestPath > 160) return setError("分组层级或名称过长。");
    const renamedPaths = sections
      .filter((section) => pathIsInside(section.pathName, oldPath))
      .map((section) => `${nextPath}${section.pathName.slice(oldPath.length)}`);
    const unchangedPaths = new Set(
      sections
        .filter((section) => !pathIsInside(section.pathName, oldPath))
        .map((section) => section.pathName.toLocaleLowerCase("zh-CN")),
    );
    if (renamedPaths.some((pathName) => unchangedPaths.has(pathName.toLocaleLowerCase("zh-CN")))) {
      return setError("同一层级已经有这个分组名称。");
    }

    setSections((current) =>
      current.map((section) =>
        pathIsInside(section.pathName, oldPath)
          ? { ...section, pathName: `${nextPath}${section.pathName.slice(oldPath.length)}` }
          : section,
      ),
    );
    if (childParentPath && pathIsInside(childParentPath, oldPath)) {
      setChildParentPath(`${nextPath}${childParentPath.slice(oldPath.length)}`);
    }
    markChanged();
  }

  function removeSection(sectionKey: string) {
    const section = sections.find((item) => item.key === sectionKey);
    if (!section || section.key === UNGROUPED_KEY) return;
    const removedSections = sections.filter((item) =>
      pathIsInside(item.pathName, section.pathName),
    );
    const removedArticles = removedSections.flatMap((item) => item.articles);
    const childCount = removedSections.length - 1;
    if (
      !window.confirm(
        `删除“${section.pathName}”${childCount ? `及其 ${childCount} 个子分组` : ""}？其中的文章会移到“未分组”，文章本身不会删除。`,
      )
    ) {
      return;
    }
    const removedKeys = new Set(removedSections.map((item) => item.key));
    setSections((current) =>
      current
        .filter((item) => !removedKeys.has(item.key))
        .map((item) =>
          item.key === UNGROUPED_KEY
            ? { ...item, articles: [...item.articles, ...removedArticles] }
            : item,
        ),
    );
    if (pathIsInside(childParentPath, section.pathName)) {
      setChildParentPath("");
      setChildSectionName("");
    }
    markChanged();
  }

  function moveArticle(
    articleDrag: Extract<DraggedItem, { type: "article" }>,
    targetSectionKey: string,
    targetIndex: number,
  ) {
    setSections((current) => {
      const sourceSection = current.find((section) => section.key === articleDrag.sectionKey);
      const article = sourceSection?.articles.find((item) => item.id === articleDrag.articleId);
      if (!sourceSection || !article) return current;
      const sourceIndex = sourceSection.articles.findIndex((item) => item.id === article.id);
      const next = current.map((section) => ({
        ...section,
        articles: section.articles.filter((item) => item.id !== article.id),
      }));
      const target = next.find((section) => section.key === targetSectionKey);
      if (!target) return current;
      let insertionIndex = targetIndex;
      if (sourceSection.key === targetSectionKey && sourceIndex < targetIndex) insertionIndex -= 1;
      target.articles.splice(
        Math.max(0, Math.min(insertionIndex, target.articles.length)),
        0,
        article,
      );
      return next;
    });
    markChanged();
    endDrag();
  }

  function moveSection(
    sectionDrag: Extract<DraggedItem, { type: "section" }>,
    targetSectionKey: string,
  ) {
    const source = sections.find((section) => section.key === sectionDrag.sectionKey);
    const target = sections.find((section) => section.key === targetSectionKey);
    if (!source || !target || source.key === target.key) return endDrag();
    if (parentPath(source.pathName) !== parentPath(target.pathName)) {
      setError("分组只能在同一层级中拖动排序；文章可以跨层级拖动。");
      return endDrag();
    }

    setSections((current) => {
      const moved = current.filter((section) => pathIsInside(section.pathName, source.pathName));
      const movedKeys = new Set(moved.map((section) => section.key));
      const remaining = current.filter((section) => !movedKeys.has(section.key));
      const targetIndex = remaining.findIndex((section) => section.key === targetSectionKey);
      if (targetIndex < 0) return current;
      remaining.splice(targetIndex, 0, ...moved);
      return remaining;
    });
    markChanged();
    endDrag();
  }

  function removeArticle(articleId: number) {
    const article = sections
      .flatMap((section) => section.articles)
      .find((item) => item.id === articleId);
    if (!article || !window.confirm(`把“${article.title}”移出本活动？文章本身不会被删除。`)) {
      return;
    }
    setSections((current) =>
      current.map((section) => ({
        ...section,
        articles: section.articles.filter((item) => item.id !== articleId),
      })),
    );
    markChanged();
  }

  async function save() {
    const orderedNamedSections = flattenSectionTree(sectionTree);
    const normalizedNames = orderedNamedSections.map((section) => normalizePath(section.pathName));
    if (normalizedNames.some((name) => !name)) {
      return setError("分组名称不能为空；不需要的分组可以直接删除。");
    }
    const comparableNames = normalizedNames.map((name) => name.toLocaleLowerCase("zh-CN"));
    if (new Set(comparableNames).size !== comparableNames.length) {
      return setError("同一层级的分组名称不能重复。");
    }

    const ungrouped = sections.find((section) => section.key === UNGROUPED_KEY);
    const orderedSections = ungrouped ? [ungrouped, ...orderedNamedSections] : orderedNamedSections;
    const articles = orderedSections.flatMap((section) =>
      section.articles.map((article) => ({
        id: article.id,
        section_path: section.key === UNGROUPED_KEY ? "" : normalizePath(section.pathName),
      })),
    );

    setBusy(true);
    const { response, data: result } = await fetchJson<{
      count?: number;
      sectionCount?: number;
      error?: string;
    }>(`/api/admin/events/${eventId}/articles`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sections: normalizedNames.map((pathName) => ({ path_name: pathName })),
        articles,
      }),
    });
    setBusy(false);
    setMessage(
      response?.ok
        ? `已保存 ${result.sectionCount || 0} 个分组和 ${result.count || 0} 篇作品。`
        : result.error || "保存失败，请检查网络连接后重试。",
    );
    setMessageIsError(!response?.ok);
  }

  function beginDrag(event: DragEvent, item: DraggedItem) {
    draggedItemRef.current = item;
    setDraggedItem(item);
    event.dataTransfer.effectAllowed = "move";
    const payload = JSON.stringify(item);
    event.dataTransfer.setData("application/x-poxiao-drag", payload);
    event.dataTransfer.setData("text/plain", payload);
  }

  function readDraggedItem(event: DragEvent): DraggedItem | null {
    try {
      const payload =
        event.dataTransfer.getData("application/x-poxiao-drag") ||
        event.dataTransfer.getData("text/plain");
      if (!payload) return draggedItemRef.current;
      const item = JSON.parse(payload) as DraggedItem;
      if (item.type === "article" && Number.isSafeInteger(item.articleId)) return item;
      if (item.type === "section" && typeof item.sectionKey === "string") return item;
    } catch {
      // 某些浏览器只允许在 drop 时读取拖动数据；此时回退到同步 ref。
    }
    return draggedItemRef.current;
  }

  function endDrag() {
    draggedItemRef.current = null;
    setDraggedItem(null);
    setDropTarget("");
  }

  function renderArticleList(section: ArticleSection) {
    return (
      <div
        className={`event-article-card-list${
          section.articles.length ? "" : " is-empty"
        }${dropTarget === `end-${section.key}` ? " is-drop-target" : ""}`}
        onDragOver={(event) => {
          if (draggedItemRef.current?.type !== "article") return;
          event.preventDefault();
          event.stopPropagation();
          setDropTarget(`end-${section.key}`);
        }}
        onDrop={(event) => {
          const item = readDraggedItem(event);
          if (item?.type !== "article") return;
          event.preventDefault();
          event.stopPropagation();
          moveArticle(item, section.key, section.articles.length);
        }}
      >
        {section.articles.map((article, articleIndex) => (
          <article
            className={`event-article-drag-card${
              draggedItem?.type === "article" && draggedItem.articleId === article.id
                ? " is-dragging"
                : ""
            }${
              dropTarget === `article-${article.id}-before`
                ? " is-drop-target-before"
                : dropTarget === `article-${article.id}-after`
                  ? " is-drop-target-after"
                  : ""
            }`}
            draggable
            key={article.id}
            onDragStart={(event) =>
              beginDrag(event, {
                type: "article",
                articleId: article.id,
                sectionKey: section.key,
              })
            }
            onDragEnd={endDrag}
            onDragOver={(event) => {
              if (draggedItemRef.current?.type !== "article") return;
              event.preventDefault();
              event.stopPropagation();
              const bounds = event.currentTarget.getBoundingClientRect();
              const after = event.clientY > bounds.top + bounds.height / 2;
              setDropTarget(`article-${article.id}-${after ? "after" : "before"}`);
            }}
            onDrop={(event) => {
              const item = readDraggedItem(event);
              if (item?.type !== "article") return;
              event.preventDefault();
              event.stopPropagation();
              const bounds = event.currentTarget.getBoundingClientRect();
              const after = event.clientY > bounds.top + bounds.height / 2;
              moveArticle(item, section.key, articleIndex + (after ? 1 : 0));
            }}
          >
            <span className="event-article-drag-grip" aria-hidden="true">
              ⠿
            </span>
            <span>{article.title || `文章 #${article.id}`}</span>
            <button
              type="button"
              className="admin-button"
              onClick={() => removeArticle(article.id)}
            >
              移出活动
            </button>
          </article>
        ))}
      </div>
    );
  }

  function renderSectionNode(node: SectionTreeNode, depth: number) {
    const section = node.section;
    const isDropTarget = dropTarget === `section-${section.key}`;
    return (
      <section
        className={`event-section-node depth-${Math.min(depth, 3)}${
          isDropTarget ? " is-drop-target" : ""
        }`}
        key={section.key}
        onDragOver={(event) => {
          if (draggedItemRef.current?.type !== "section") return;
          event.preventDefault();
          event.stopPropagation();
          setDropTarget(`section-${section.key}`);
        }}
        onDrop={(event) => {
          const item = readDraggedItem(event);
          if (item?.type !== "section") return;
          event.preventDefault();
          event.stopPropagation();
          moveSection(item, section.key);
        }}
      >
        <header
          className="event-section-header"
          onDragOver={(event) => {
            if (draggedItemRef.current?.type !== "article") return;
            event.preventDefault();
            event.stopPropagation();
            setDropTarget(`end-${section.key}`);
          }}
          onDrop={(event) => {
            const item = readDraggedItem(event);
            if (item?.type !== "article") return;
            event.preventDefault();
            event.stopPropagation();
            moveArticle(item, section.key, section.articles.length);
          }}
        >
          <span
            className="event-section-drag-handle"
            draggable
            title="拖动调整同层分组顺序"
            onDragStart={(event) => beginDrag(event, { type: "section", sectionKey: section.key })}
            onDragEnd={endDrag}
          >
            ↕ 拖动
          </span>
          <input
            aria-label={`分组名称：${section.pathName}`}
            value={sectionName(section.pathName)}
            onChange={(event) => renameSection(section.key, event.target.value)}
            maxLength={80}
          />
          <button
            type="button"
            className="admin-button"
            onClick={() => {
              setChildParentPath((current) =>
                current === section.pathName ? "" : section.pathName,
              );
              setChildSectionName("");
            }}
          >
            添加子分组
          </button>
          <button
            type="button"
            className="admin-button danger-button"
            onClick={() => removeSection(section.key)}
          >
            删除
          </button>
          <small>{subtreeArticleCount(node)} 篇</small>
        </header>

        {renderArticleList(section)}

        {childParentPath === section.pathName ? (
          <form className="event-child-section-creator" onSubmit={createChildSection}>
            <span>在“{sectionName(section.pathName)}”下创建：</span>
            <input
              autoFocus
              value={childSectionName}
              onChange={(event) => setChildSectionName(event.target.value)}
              placeholder="子分组名称"
              maxLength={80}
            />
            <button type="submit" className="admin-button">
              创建
            </button>
            <button
              type="button"
              className="admin-button"
              onClick={() => {
                setChildParentPath("");
                setChildSectionName("");
              }}
            >
              取消
            </button>
          </form>
        ) : null}

        {node.children.length ? (
          <div className="event-section-children">
            {node.children.map((child) => renderSectionNode(child, depth + 1))}
          </div>
        ) : null}
      </section>
    );
  }

  const ungrouped = sections.find((section) => section.key === UNGROUPED_KEY);

  return (
    <section className="admin-card event-article-manager">
      <div className="event-article-manager-heading">
        <h2>参与作品与分组</h2>
        <Link className="admin-button" href={`/admin/articles/new?event=${eventId}`}>
          添加新文章
        </Link>
      </div>

      <form className="event-section-creator" onSubmit={createSection}>
        <label htmlFor="new-event-section">新建一级分组</label>
        <input
          id="new-event-section"
          value={newSectionName}
          onChange={(event) => setNewSectionName(event.target.value)}
          placeholder="例如：第一轮"
          maxLength={80}
        />
        <button type="submit" className="admin-button">
          创建分组
        </button>
      </form>

      <div className="event-section-board">
        {ungrouped ? (
          <section className="event-section-lane event-section-ungrouped">
            <header
              className="event-section-header"
              onDragOver={(event) => {
                if (draggedItemRef.current?.type !== "article") return;
                event.preventDefault();
                event.stopPropagation();
                setDropTarget(`end-${ungrouped.key}`);
              }}
              onDrop={(event) => {
                const item = readDraggedItem(event);
                if (item?.type !== "article") return;
                event.preventDefault();
                event.stopPropagation();
                moveArticle(item, ungrouped.key, ungrouped.articles.length);
              }}
            >
              <strong>未分组</strong>
              <small>{ungrouped.articles.length} 篇</small>
            </header>
            {renderArticleList(ungrouped)}
          </section>
        ) : null}

        <div className="event-section-tree">
          {sectionTree.map((node) => renderSectionNode(node, 0))}
        </div>
      </div>

      <footer className="event-article-manager-footer">
        <span>共 {articleCount} 篇作品</span>
        <button type="button" className="admin-button" onClick={save} disabled={busy}>
          {busy ? "保存中……" : "保存分组与顺序"}
        </button>
      </footer>
      {message ? <p className={messageIsError ? "form-error" : "form-success"}>{message}</p> : null}
    </section>
  );
}
