"use client";

import Link from "next/link";
import { DragEvent, useState } from "react";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { EventDirectoryCard, type EventCardStatus } from "@/components/EventDirectoryCard";
import { EVENT_GROUPS, eventGroupLabel, type EventGroup } from "@/lib/event-groups";
import { moveWithinEventGroup } from "@/lib/event-order";
import { fetchJson } from "@/lib/client-fetch";

export type AdminEventRow = {
  id: number;
  title: string;
  slug: string;
  event_group: EventGroup;
  summary: string;
  article_count: number;
  is_featured: number;
  status: EventCardStatus;
};

export function EventOrderManager({ initialRows }: { initialRows: AdminEventRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dropTargetId, setDropTargetId] = useState<number | null>(null);

  async function moveTo(group: EventGroup, sourceIndex: number, targetIndex: number) {
    if (busy) return;
    const reordered = moveWithinEventGroup(rows, group, sourceIndex, targetIndex);
    if (!reordered) return;
    const previous = rows;
    const selected = rows.filter((row) => row.event_group === group)[sourceIndex];
    setRows(reordered);
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const { response, data: result } = await fetchJson<{ error?: string }>(
        "/api/admin/events/order",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids: reordered.map((row) => row.id) }),
        },
      );
      if (!response?.ok) {
        throw new Error(
          result.error || (response ? "活动顺序保存失败。" : "无法连接服务器，请稍后重试。"),
        );
      }
      setMessage(
        `“${selected.title}”已移到“${eventGroupLabel(group)}”第 ${targetIndex + 1} 位；前台同步采用此顺序。`,
      );
    } catch (cause) {
      setRows(previous);
      setError(cause instanceof Error ? cause.message : "活动顺序保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  async function featureEvent(row: AdminEventRow) {
    if (busy || row.is_featured) return;
    const previous = rows;
    setRows((current) =>
      current.map((item) => ({ ...item, is_featured: item.id === row.id ? 1 : 0 })),
    );
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { response, data: result } = await fetchJson<{ error?: string }>(
        "/api/admin/events/featured",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ eventId: row.id }),
        },
      );
      if (!response?.ok) {
        throw new Error(
          result.error || (response ? "首页展示活动保存失败。" : "无法连接服务器，请稍后重试。"),
        );
      }
      setMessage(`首页现在展示“${row.title}”。`);
    } catch (cause) {
      setRows(previous);
      setError(cause instanceof Error ? cause.message : "首页展示活动保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  function startDrag(event: DragEvent<HTMLButtonElement>, id: number) {
    if (busy) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(id));
    setDraggedId(id);
  }

  function drop(event: DragEvent<HTMLDivElement>, group: EventGroup, targetIndex: number) {
    event.preventDefault();
    const sourceIndex = rows
      .filter((row) => row.event_group === group)
      .findIndex((row) => row.id === draggedId);
    setDraggedId(null);
    setDropTargetId(null);
    void moveTo(group, sourceIndex, targetIndex);
  }

  return (
    <section className="admin-event-order-section">
      <div className="admin-event-order-heading">
        <div>
          <h2>活动专题预览与排序</h2>
          <p>与前台一样分为“破晓”和“其他”；可在同组内拖动或选择任意位置，调整后自动保存。</p>
        </div>
        <Link href="/events" target="_blank" rel="noopener noreferrer">
          打开活动专题 ↗
        </Link>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="form-success" role="status">
          {message}
        </p>
      ) : null}
      {EVENT_GROUPS.map((group) => {
        const groupRows = rows.filter((row) => row.event_group === group.id);
        return (
          <section className="admin-event-group" key={group.id}>
            <h3 className={`panel-title ${group.tone} admin-event-group-heading`}>
              {group.label} <small>（{groupRows.length} 个活动）</small>
            </h3>
            {groupRows.length ? (
              <div className="directory-grid admin-event-grid">
                {groupRows.map((row, index) => (
                  <div
                    className={`admin-event-item${draggedId === row.id ? " is-dragging" : ""}${dropTargetId === row.id ? " is-drop-target" : ""}`}
                    key={row.id}
                    onDragOver={(event) => {
                      if (draggedId === null || draggedId === row.id) return;
                      const dragged = rows.find((item) => item.id === draggedId);
                      if (dragged?.event_group !== group.id) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDropTargetId(row.id);
                    }}
                    onDrop={(event) => drop(event, group.id, index)}
                  >
                    <div className="admin-event-item-toolbar">
                      <span className="admin-event-item-index">第 {index + 1} 位</span>
                      <label>
                        移到
                        <select
                          aria-label={`将“${row.title}”移到“${group.label}”第几位`}
                          value={index + 1}
                          disabled={busy}
                          onChange={(event) =>
                            void moveTo(group.id, index, Number(event.target.value) - 1)
                          }
                        >
                          {groupRows.map((_, position) => (
                            <option value={position + 1} key={position}>
                              {position + 1}
                            </option>
                          ))}
                        </select>
                        位
                      </label>
                      <button
                        className="admin-event-drag-handle"
                        type="button"
                        draggable={!busy}
                        onDragStart={(event) => startDrag(event, row.id)}
                        onDragEnd={() => {
                          setDraggedId(null);
                          setDropTargetId(null);
                        }}
                        aria-label={`拖动“${row.title}”调整顺序`}
                        title="按住并拖到同组其他活动卡片"
                      >
                        ☷ 拖动
                      </button>
                      <button
                        className={`admin-event-toolbar-button${row.is_featured ? " is-active" : ""}`}
                        type="button"
                        disabled={busy || Boolean(row.is_featured)}
                        onClick={() => void featureEvent(row)}
                      >
                        {row.is_featured ? "首页展示中" : "在首页展示"}
                      </button>
                      <Link className="admin-event-toolbar-button" href={`/admin/events/${row.id}`}>
                        编辑
                      </Link>
                    </div>
                    <EventDirectoryCard
                      event={row}
                      status={row.status}
                      openInNewTab
                      headingLevel={4}
                    />
                    <div className="admin-event-item-actions">
                      <Link
                        className="admin-event-action-link"
                        href={`/events/${row.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        前台查看 ↗
                      </Link>
                      <DeleteButton endpoint={`/api/admin/events/${row.id}`} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-note">暂无活动；编辑活动时可在“活动类型”中调整。</p>
            )}
          </section>
        );
      })}
    </section>
  );
}
