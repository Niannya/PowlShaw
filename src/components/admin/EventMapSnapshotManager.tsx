"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { fetchJson } from "@/lib/client-fetch";
import {
  EVENT_MAP_SNAPSHOT_DESCRIPTION_MAX_LENGTH,
  EVENT_MAP_SNAPSHOT_TITLE_MAX_LENGTH,
} from "@/lib/event-map-snapshot-validation";
import type { EventMapSnapshotSummary } from "@/lib/event-map-snapshots";

export function EventMapSnapshotManager({
  eventId,
  eventSlug,
  initialDate,
  initialSnapshots,
}: {
  eventId: number;
  eventSlug: string;
  initialDate: string;
  initialSnapshots: EventMapSnapshotSummary[];
}) {
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [snapshotDate, setSnapshotDate] = useState(initialDate);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function createSnapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setIsError(false);
    const { response, data } = await fetchJson<{
      error?: string;
      snapshot?: EventMapSnapshotSummary;
    }>(`/api/admin/events/${eventId}/map/snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshot_date: snapshotDate, title, description }),
    });
    setBusy(false);
    if (!response?.ok || !data.snapshot) {
      setIsError(true);
      setMessage(data.error || "世界快照创建失败，请检查网络连接后重试。");
      return;
    }

    setSnapshots((current) =>
      [...current, data.snapshot!].sort(
        (left, right) =>
          right.snapshot_date.localeCompare(left.snapshot_date) || right.id - left.id,
      ),
    );
    setTitle("");
    setDescription("");
    setMessage("已记录当前世界状态。公开地图现在可以切换到这份历史快照。");
  }

  async function deleteSnapshot(snapshot: EventMapSnapshotSummary) {
    if (!window.confirm(`确定删除“${snapshot.title}”吗？删除后无法恢复。`)) return;
    setBusy(true);
    setMessage("");
    setIsError(false);
    const { response, data } = await fetchJson<{ error?: string }>(
      `/api/admin/events/${eventId}/map/snapshots/${snapshot.id}`,
      { method: "DELETE" },
    );
    setBusy(false);
    if (!response?.ok) {
      setIsError(true);
      setMessage(data.error || "世界快照删除失败，请稍后再试。");
      return;
    }
    setSnapshots((current) => current.filter((item) => item.id !== snapshot.id));
    setMessage("世界快照已删除。");
  }

  return (
    <section className="admin-card event-map-snapshots">
      <div className="event-map-settings-heading">
        <div>
          <h2>世界快照</h2>
          <p>由管理员手动记录；快照创建后保持不变，不会随当前地图继续编辑。</p>
        </div>
      </div>

      <form className="event-map-snapshot-form" onSubmit={createSnapshot}>
        <label>
          快照日期
          <input
            type="date"
            required
            value={snapshotDate}
            onChange={(event) => setSnapshotDate(event.target.value)}
          />
        </label>
        <label>
          名称（可选）
          <input
            value={title}
            maxLength={EVENT_MAP_SNAPSHOT_TITLE_MAX_LENGTH}
            placeholder="留空时自动使用日期命名"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="event-map-snapshot-description">
          说明（可选）
          <textarea
            value={description}
            maxLength={EVENT_MAP_SNAPSHOT_DESCRIPTION_MAX_LENGTH}
            placeholder="例如：第一阶段创作结束"
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <button className="admin-button" disabled={busy}>
          {busy ? "记录中……" : "记录当前世界"}
        </button>
      </form>

      {message ? <p className={isError ? "form-error" : "form-success"}>{message}</p> : null}

      {snapshots.length ? (
        <div className="event-map-snapshot-list">
          {snapshots.map((snapshot) => (
            <article key={snapshot.id}>
              <div>
                <strong>{snapshot.title}</strong>
                <time dateTime={snapshot.snapshot_date}>{snapshot.snapshot_date}</time>
                {snapshot.description ? <p>{snapshot.description}</p> : null}
                <small>
                  节点 {snapshot.node_count} · 区域 {snapshot.region_count} · 关系{" "}
                  {snapshot.relation_count}
                </small>
              </div>
              <div className="admin-actions">
                <Link
                  className="admin-event-action-link"
                  href={`/events/${eventSlug}/map?snapshot=${snapshot.id}`}
                  target="_blank"
                >
                  查看 ↗
                </Link>
                <button
                  type="button"
                  className="admin-button danger-button"
                  disabled={busy}
                  onClick={() => void deleteSnapshot(snapshot)}
                >
                  删除
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-note">还没有世界快照。当前地图仍会照常公开和更新。</p>
      )}
    </section>
  );
}
