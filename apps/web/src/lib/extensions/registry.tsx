"use client";

import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/client-fetch";
import {
  ballotExtension,
  galleryExtension,
  rankingExtension,
  timelineExtension,
} from "@/lib/extensions/definitions";
import type { PublicExtensionItem } from "@/lib/extensions/types";

/**
 * 活动扩展模块的纯代码视图注册表。
 *
 * - `kind` 与版本来自 `definitions.ts`，这里只负责渲染；
 * - 每个视图都做一次 `safeParse`：即使后台数据结构不兼容，也只隐藏该模块，不影响整页；
 * - 全部视图不使用任何位图，风格延续纸本档案。
 */

export type ExtensionViewProps = {
  config: unknown;
  items?: PublicExtensionItem[];
  eventId: number;
  /** 后端计算的可提交状态：已登录、未禁言、模块允许用户条目。 */
  canSubmit?: boolean;
};

export type ExtensionView = (props: ExtensionViewProps) => ReactNode;

function readItems<TItem>(
  items: PublicExtensionItem[] | undefined,
  parse: (value: unknown) => TItem | null,
) {
  return (items ?? []).flatMap((item) => {
    const payload = parse(item.payload);
    return payload === null ? [] : [payload];
  });
}

/* -------------------------------------------------------------- 晋级名单 */

function parseRankingItem(value: unknown) {
  const schema = rankingExtension.itemSchema;
  if (!schema) return null;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function RankingView({ config, items }: ExtensionViewProps) {
  const parsed = rankingExtension.configSchema.safeParse(config);
  if (!parsed.success) return null;
  const data = parsed.data;
  const rows = readItems(items, parseRankingItem).sort((left, right) => left.rank - right.rank);
  const showAward = data.showAward !== false && rows.some((row) => row.award);

  return (
    <>
      {data.note ? <p className="event-extension-note">{data.note}</p> : null}
      {rows.length ? (
        <table className="extension-ranking">
          <thead>
            <tr>
              <th scope="col">名次</th>
              <th scope="col">姓名</th>
              <th scope="col">作品</th>
              {showAward ? <th scope="col">奖项</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.rank}-${row.name}-${index}`}>
                <td className="extension-rank">{row.rank}</td>
                <td>
                  {row.name}
                  {row.note ? <small className="extension-rank-note">{row.note}</small> : null}
                </td>
                <td>{row.work || "—"}</td>
                {showAward ? <td>{row.award || "—"}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty-note">名单尚未公布。</p>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- 时间线 */

function parseTimelineItem(value: unknown) {
  const schema = timelineExtension.itemSchema;
  if (!schema) return null;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function TimelineView({ config, items }: ExtensionViewProps) {
  const parsed = timelineExtension.configSchema.safeParse(config);
  if (!parsed.success) return null;
  const data = parsed.data;
  const nodes = readItems(items, parseTimelineItem);

  return (
    <>
      {data.note ? <p className="event-extension-note">{data.note}</p> : null}
      {nodes.length ? (
        <ol className="extension-timeline">
          {nodes.map((node, index) => (
            <li
              key={`${node.date}-${node.title}-${index}`}
              className={node.done ? "is-done" : undefined}
            >
              <time>{node.date}</time>
              <strong>{node.title}</strong>
              {node.body ? <p>{node.body}</p> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="empty-note">时间线尚未公布。</p>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- 作品墙 */

function parseGalleryItem(value: unknown) {
  const schema = galleryExtension.itemSchema;
  if (!schema) return null;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function safeHref(href: string) {
  if (!href) return "";
  if (href.startsWith("/")) return href;
  if (/^https?:\/\//i.test(href)) return href;
  return "";
}

function GalleryView({ config, items }: ExtensionViewProps) {
  const parsed = galleryExtension.configSchema.safeParse(config);
  if (!parsed.success) return null;
  const data = parsed.data;
  const cards = readItems(items, parseGalleryItem);
  const columns = data.columns === 2 || data.columns === 4 ? data.columns : 3;

  return (
    <>
      {data.note ? <p className="event-extension-note">{data.note}</p> : null}
      {cards.length ? (
        <div className="extension-gallery" data-columns={columns}>
          {cards.map((card, index) => {
            const href = safeHref(card.href || "");
            return (
              <article className="extension-gallery-card" key={`${card.title}-${index}`}>
                <h3>
                  {href ? (
                    href.startsWith("/") ? (
                      <Link href={href}>{card.title}</Link>
                    ) : (
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        {card.title}
                      </a>
                    )
                  ) : (
                    card.title
                  )}
                </h3>
                {card.author ? <p className="extension-gallery-author">{card.author}</p> : null}
                {card.summary ? <p>{card.summary}</p> : null}
                {card.tag ? <span className="extension-gallery-tag">{card.tag}</span> : null}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="empty-note">作品墙尚未开放。</p>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- 读者投票 */

function parseBallotItem(value: unknown) {
  const schema = ballotExtension.itemSchema;
  if (!schema) return null;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function tallyBallot(items: PublicExtensionItem[]) {
  const counts = new Map<string, number>();
  for (const item of readItems(items, parseBallotItem)) {
    const choices = Array.isArray(item.choice) ? item.choice : [item.choice];
    for (const choice of choices) counts.set(choice, (counts.get(choice) ?? 0) + 1);
  }
  return counts;
}

function BallotView({ config, items, eventId, canSubmit = false }: ExtensionViewProps) {
  const router = useRouter();
  const parsed = ballotExtension.configSchema.safeParse(config);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const counts = useMemo(
    () => (parsed.success ? tallyBallot(items ?? []) : new Map()),
    [parsed.success, items],
  );

  if (!parsed.success) return null;
  const data = parsed.data;
  const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
  const votesUrl = `/api/v1/events/${eventId}/extensions/${ballotExtension.kind}/items`;

  function toggle(key: string) {
    setSelected((current) => {
      if (data.multiple) {
        return current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
      }
      return [key];
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected.length) {
      setError("请先选择一个选项。");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    const { response, data: result } = await fetchJson<{
      error?: string | { code?: string; message?: string };
    }>(votesUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: { choice: data.multiple ? selected : selected[0] } }),
    });
    setBusy(false);
    if (!response?.ok) {
      setError(
        typeof result.error === "string"
          ? result.error
          : result.error?.message || "投票提交失败，请稍后重试。",
      );
      return;
    }
    setMessage("投票已记录。");
    router.refresh();
  }

  return (
    <>
      {data.prompt ? <p className="event-extension-note">{data.prompt}</p> : null}
      <ul className="extension-ballot">
        {data.options.map((option) => {
          const count = counts.get(option.key) ?? 0;
          const percent = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <li key={option.key}>
              <div className="extension-ballot-row">
                <label>
                  <input
                    type={data.multiple ? "checkbox" : "radio"}
                    name={`ballot-${eventId}`}
                    checked={selected.includes(option.key)}
                    onChange={() => toggle(option.key)}
                  />
                  {option.label}
                </label>
                <small>
                  {count} 票 · {percent}%
                </small>
              </div>
              <span className="extension-ballot-bar" aria-hidden="true">
                <i style={{ width: `${percent}%` }} />
              </span>
            </li>
          );
        })}
      </ul>
      {canSubmit ? (
        <form className="extension-ballot-form" onSubmit={submit}>
          <button className="old-button" disabled={busy}>
            {busy ? "提交中……" : "提交投票"}
          </button>
        </form>
      ) : (
        <p className="extension-ballot-login">
          <Link href="/login">登录后可投票</Link>
        </p>
      )}
      {error ? <p className="form-error">{error}</p> : null}
      {message ? (
        <p className="form-success" role="status">
          {message}
        </p>
      ) : null}
    </>
  );
}

export const extensionRegistry: Record<string, { render: ExtensionView }> = {
  [rankingExtension.kind]: { render: RankingView },
  [timelineExtension.kind]: { render: TimelineView },
  [galleryExtension.kind]: { render: GalleryView },
  [ballotExtension.kind]: { render: BallotView },
};
