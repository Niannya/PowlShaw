"use client";

import { useRouter } from "next/navigation";
import type { EventMapSnapshotSummary } from "@/lib/event-map-snapshots";

export function EventMapSnapshotSelector({
  snapshots,
  selectedSnapshot,
  basePath,
  anchor = "",
}: {
  snapshots: EventMapSnapshotSummary[];
  selectedSnapshot?: EventMapSnapshotSummary;
  basePath: string;
  anchor?: string;
}) {
  const router = useRouter();

  if (!snapshots.length) return null;

  return (
    <section className="world-map-timeline" aria-label="世界快照">
      <label>
        查看世界状态
        <select
          value={selectedSnapshot ? String(selectedSnapshot.id) : "current"}
          onChange={(event) => {
            const value = event.target.value;
            router.push(
              value === "current"
                ? `${basePath}${anchor}`
                : `${basePath}?snapshot=${value}${anchor}`,
            );
          }}
        >
          <option value="current">当前世界（实时）</option>
          {snapshots.map((snapshot) => (
            <option key={snapshot.id} value={snapshot.id}>
              {snapshot.snapshot_date} · {snapshot.title}
            </option>
          ))}
        </select>
      </label>
      {selectedSnapshot ? (
        <div>
          <strong>
            {selectedSnapshot.snapshot_date} · {selectedSnapshot.title}
          </strong>
          {selectedSnapshot.description ? <p>{selectedSnapshot.description}</p> : null}
          <small>
            历史快照，只读 · 节点 {selectedSnapshot.node_count} · 区域{" "}
            {selectedSnapshot.region_count} · 关系 {selectedSnapshot.relation_count}
          </small>
        </div>
      ) : (
        <small>当前世界会随参与者的编辑实时更新。</small>
      )}
    </section>
  );
}
