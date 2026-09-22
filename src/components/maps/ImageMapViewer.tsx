"use client";

/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import type {
  FormEvent,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import type { EditableEventMapNode } from "@/lib/event-map-node-validation";
import type { EventMapNode } from "@/lib/event-map-nodes";
import type { EditableEventMapRelation } from "@/lib/event-map-relation-validation";
import type { EventMapRelation } from "@/lib/event-map-relations";

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

type DragState = {
  pointerId: number;
  x: number;
  y: number;
  scrollLeft: number;
  scrollTop: number;
};

type NodeDragState = {
  pointerId: number;
  node: EventMapNode;
  x: number;
  y: number;
  moved: boolean;
};

type NodeFormState = EditableEventMapNode & {
  nodeId?: number;
};

type RelationFormState = EditableEventMapRelation & {
  relationId?: number;
};

type RelationMode = {
  sourceNodeId?: number;
};

type MapUser = {
  id: number;
  displayName: string;
  canEdit: boolean;
};

type ImageMapViewerProps = {
  src: string;
  alt: string;
  width: number;
  height: number;
  eventId?: number;
  initialNodes?: EventMapNode[];
  initialRelations?: EventMapRelation[];
  currentUser?: MapUser;
  loginPath?: string;
};

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function relationGeometry(
  relation: EventMapRelation,
  nodes: EventMapNode[],
  width: number,
  height: number,
) {
  const source = nodes.find((node) => node.id === relation.source_node_id);
  const target = nodes.find((node) => node.id === relation.target_node_id);
  if (!source || !target) return undefined;

  const startX = source.x * width;
  const startY = source.y * height;
  const endX = target.x * width;
  const endY = target.y * height;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const length = Math.max(1, Math.hypot(deltaX, deltaY));
  const offsets = [0, 24, -24, 42, -42];
  const offset = offsets[relation.id % offsets.length];
  const controlX = (startX + endX) / 2 + (-deltaY / length) * offset;
  const controlY = (startY + endY) / 2 + (deltaX / length) * offset;

  return {
    path: `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`,
    labelX: (startX + 2 * controlX + endX) / 4,
    labelY: (startY + 2 * controlY + endY) / 4 - 7,
  };
}

export function ImageMapViewer({
  src,
  alt,
  width,
  height,
  eventId,
  initialNodes = [],
  initialRelations = [],
  currentUser,
  loginPath = "/login",
}: ImageMapViewerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const nodeDragRef = useRef<NodeDragState | null>(null);
  const suppressNodeClickRef = useRef(false);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [isDragging, setIsDragging] = useState(false);
  const [nodes, setNodes] = useState(initialNodes);
  const [relations, setRelations] = useState(initialRelations);
  const [selectedNodeId, setSelectedNodeId] = useState<number>();
  const [selectedRelationId, setSelectedRelationId] = useState<number>();
  const [nodeForm, setNodeForm] = useState<NodeFormState>();
  const [relationForm, setRelationForm] = useState<RelationFormState>();
  const [isPlacing, setIsPlacing] = useState(false);
  const [relationMode, setRelationMode] = useState<RelationMode>();
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const selectedRelation = relations.find((relation) => relation.id === selectedRelationId);
  const canContribute = Boolean(eventId && currentUser?.canEdit);

  function nodeName(nodeId: number) {
    return nodes.find((node) => node.id === nodeId)?.name || "已隐藏节点";
  }

  function closePanels() {
    setSelectedNodeId(undefined);
    setSelectedRelationId(undefined);
    setNodeForm(undefined);
    setRelationForm(undefined);
  }

  function changeZoom(value: number) {
    const nextZoom = clampZoom(value);
    const viewport = viewportRef.current;
    if (!viewport || nextZoom === zoom) return;

    const centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / viewport.scrollWidth;
    const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / viewport.scrollHeight;
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      viewport.scrollLeft = centerX * viewport.scrollWidth - viewport.clientWidth / 2;
      viewport.scrollTop = centerY * viewport.scrollHeight - viewport.clientHeight / 2;
    });
  }

  function resetView() {
    const viewport = viewportRef.current;
    setZoom(MIN_ZOOM);
    requestAnimationFrame(() => viewport?.scrollTo({ left: 0, top: 0 }));
  }

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || isPlacing) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    viewport.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    setIsDragging(true);
  }

  function dragMap(event: ReactPointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    const drag = dragRef.current;
    if (!viewport || !drag || drag.pointerId !== event.pointerId) return;
    viewport.scrollLeft = drag.scrollLeft - (event.clientX - drag.x);
    viewport.scrollTop = drag.scrollTop - (event.clientY - drag.y);
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const step = 80;

    if (event.key === "+" || event.key === "=") changeZoom(zoom + ZOOM_STEP);
    else if (event.key === "-") changeZoom(zoom - ZOOM_STEP);
    else if (event.key === "0") resetView();
    else if (event.key === "ArrowLeft") viewport.scrollBy({ left: -step });
    else if (event.key === "ArrowRight") viewport.scrollBy({ left: step });
    else if (event.key === "ArrowUp") viewport.scrollBy({ top: -step });
    else if (event.key === "ArrowDown") viewport.scrollBy({ top: step });
    else return;
    event.preventDefault();
  }

  function beginPlacement() {
    closePanels();
    setRelationMode(undefined);
    setIsPlacing((value) => !value);
    setMessage(isPlacing ? "" : "请在地图上点击节点的位置。位置之后仍可拖动调整。");
  }

  function beginRelation() {
    closePanels();
    setIsPlacing(false);
    if (relationMode) {
      setRelationMode(undefined);
      setMessage("");
      return;
    }
    setRelationMode({});
    setMessage("请先选择关系的第一个节点。");
  }

  function placeNode(event: ReactMouseEvent<HTMLDivElement>) {
    if (!isPlacing || !canContribute) return;
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds) return;

    setIsPlacing(false);
    setNodeForm({
      name: "",
      description: "",
      notes: "",
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    });
    setMessage("");
  }

  function selectNode(nodeId: number) {
    if (suppressNodeClickRef.current) return;
    if (relationMode) {
      if (!relationMode.sourceNodeId) {
        setRelationMode({ sourceNodeId: nodeId });
        setMessage(`已选择“${nodeName(nodeId)}”，请再选择另一个节点。`);
        return;
      }
      if (relationMode.sourceNodeId === nodeId) {
        setMessage("关系不能连接同一个节点，请选择另一个节点。");
        return;
      }
      setRelationForm({
        source_node_id: relationMode.sourceNodeId,
        target_node_id: nodeId,
        name: "",
        description: "",
        notes: "",
      });
      setRelationMode(undefined);
      setMessage("");
      return;
    }

    setNodeForm(undefined);
    setRelationForm(undefined);
    setIsPlacing(false);
    setSelectedRelationId(undefined);
    setSelectedNodeId(nodeId);
    setMessage("");
  }

  function selectRelation(relationId: number) {
    if (isPlacing) return;
    if (relationMode) {
      setMessage("请点击两个节点来建立关系，而不是点击已有关系线。");
      return;
    }
    setNodeForm(undefined);
    setRelationForm(undefined);
    setSelectedNodeId(undefined);
    setSelectedRelationId(relationId);
    setMessage("");
  }

  function editNode(node: EventMapNode) {
    setNodeForm({
      nodeId: node.id,
      name: node.name,
      description: node.description,
      notes: node.notes,
      x: node.x,
      y: node.y,
    });
    setSelectedNodeId(undefined);
  }

  function editRelation(relation: EventMapRelation) {
    setRelationForm({
      relationId: relation.id,
      source_node_id: relation.source_node_id,
      target_node_id: relation.target_node_id,
      name: relation.name,
      description: relation.description,
      notes: relation.notes,
    });
    setSelectedRelationId(undefined);
  }

  async function submitNode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!eventId || !nodeForm || !canContribute) return;

    setIsSaving(true);
    setMessage("");
    const response = await fetch(
      nodeForm.nodeId
        ? `/api/events/${eventId}/map/nodes/${nodeForm.nodeId}`
        : `/api/events/${eventId}/map/nodes`,
      {
        method: nodeForm.nodeId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(nodeForm),
      },
    ).catch(() => undefined);
    if (!response) {
      setIsSaving(false);
      setMessage("节点保存失败，请检查网络连接后重试。");
      return;
    }
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      node?: EventMapNode;
    };
    setIsSaving(false);

    if (!response.ok || !result.node) {
      setMessage(result.error || "节点保存失败，请稍后再试。");
      return;
    }

    setNodes((items) => {
      const index = items.findIndex((item) => item.id === result.node!.id);
      if (index < 0) return [...items, result.node!];
      return items.map((item) => (item.id === result.node!.id ? result.node! : item));
    });
    setNodeForm(undefined);
    setSelectedNodeId(result.node.id);
    setMessage(nodeForm.nodeId ? "节点已更新。" : "节点已添加并公开显示。");
  }

  async function submitRelation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!eventId || !relationForm || !canContribute) return;

    setIsSaving(true);
    setMessage("");
    const response = await fetch(
      relationForm.relationId
        ? `/api/events/${eventId}/map/relations/${relationForm.relationId}`
        : `/api/events/${eventId}/map/relations`,
      {
        method: relationForm.relationId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(relationForm),
      },
    ).catch(() => undefined);
    if (!response) {
      setIsSaving(false);
      setMessage("关系保存失败，请检查网络连接后重试。");
      return;
    }
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      relation?: EventMapRelation;
    };
    setIsSaving(false);

    if (!response.ok || !result.relation) {
      setMessage(result.error || "关系保存失败，请稍后再试。");
      return;
    }

    setRelations((items) => {
      const index = items.findIndex((item) => item.id === result.relation!.id);
      if (index < 0) return [...items, result.relation!];
      return items.map((item) => (item.id === result.relation!.id ? result.relation! : item));
    });
    setRelationForm(undefined);
    setSelectedRelationId(result.relation.id);
    setMessage(relationForm.relationId ? "关系已更新。" : "关系已添加并公开显示。");
  }

  async function deleteNode(node: EventMapNode) {
    if (!eventId || currentUser?.id !== node.user_id) return;
    if (!window.confirm(`确定删除节点“${node.name}”吗？与它相连的关系也会从当前地图隐藏。`)) {
      return;
    }

    setIsSaving(true);
    const response = await fetch(`/api/events/${eventId}/map/nodes/${node.id}`, {
      method: "DELETE",
    }).catch(() => undefined);
    if (!response) {
      setIsSaving(false);
      setMessage("节点删除失败，请检查网络连接后重试。");
      return;
    }
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setIsSaving(false);
    if (!response.ok) {
      setMessage(result.error || "节点删除失败，请稍后再试。");
      return;
    }
    setNodes((items) => items.filter((item) => item.id !== node.id));
    setRelations((items) =>
      items.filter((item) => item.source_node_id !== node.id && item.target_node_id !== node.id),
    );
    setSelectedNodeId(undefined);
    setSelectedRelationId(undefined);
    setMessage("节点已删除，与它相连的关系已从当前地图隐藏。");
  }

  async function deleteRelation(relation: EventMapRelation) {
    if (!eventId || currentUser?.id !== relation.user_id) return;
    if (!window.confirm(`确定删除关系“${relation.name}”吗？`)) return;

    setIsSaving(true);
    const response = await fetch(`/api/events/${eventId}/map/relations/${relation.id}`, {
      method: "DELETE",
    }).catch(() => undefined);
    if (!response) {
      setIsSaving(false);
      setMessage("关系删除失败，请检查网络连接后重试。");
      return;
    }
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setIsSaving(false);
    if (!response.ok) {
      setMessage(result.error || "关系删除失败，请稍后再试。");
      return;
    }
    setRelations((items) => items.filter((item) => item.id !== relation.id));
    setSelectedRelationId(undefined);
    setMessage("关系已删除。");
  }

  function beginNodeDrag(event: ReactPointerEvent<HTMLButtonElement>, node: EventMapNode) {
    event.stopPropagation();
    if (event.button !== 0 || currentUser?.id !== node.user_id || !canContribute || relationMode) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    nodeDragRef.current = {
      pointerId: event.pointerId,
      node,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
  }

  function nodePosition(event: ReactPointerEvent<HTMLButtonElement>, drag: NodeDragState) {
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds) return { x: drag.node.x, y: drag.node.y };
    return {
      x: clamp(drag.node.x + (event.clientX - drag.x) / bounds.width),
      y: clamp(drag.node.y + (event.clientY - drag.y) / bounds.height),
    };
  }

  function dragNode(event: ReactPointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const drag = nodeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const moved = drag.moved || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 3;
    nodeDragRef.current = { ...drag, moved };
    if (!moved) return;

    const position = nodePosition(event, drag);
    setNodes((items) =>
      items.map((item) => (item.id === drag.node.id ? { ...item, ...position } : item)),
    );
  }

  async function persistNodePosition(node: EventMapNode, x: number, y: number) {
    if (!eventId) return;
    const response = await fetch(`/api/events/${eventId}/map/nodes/${node.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...node, x, y }),
    }).catch(() => undefined);
    if (!response) {
      setNodes((items) =>
        items.map((item) => (item.id === node.id ? { ...item, x: node.x, y: node.y } : item)),
      );
      setMessage("节点位置保存失败，已恢复原位置。");
      return;
    }
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      node?: EventMapNode;
    };
    if (!response.ok || !result.node) {
      setNodes((items) =>
        items.map((item) => (item.id === node.id ? { ...item, x: node.x, y: node.y } : item)),
      );
      setMessage(result.error || "节点位置保存失败，已恢复原位置。");
      return;
    }
    setNodes((items) => items.map((item) => (item.id === result.node!.id ? result.node! : item)));
    setMessage("节点位置已更新。所有人现在都能看到新位置。");
  }

  function endNodeDrag(event: ReactPointerEvent<HTMLButtonElement>, node: EventMapNode) {
    event.stopPropagation();
    const drag = nodeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    nodeDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!drag.moved) return;
    const position = nodePosition(event, drag);
    suppressNodeClickRef.current = true;
    window.setTimeout(() => {
      suppressNodeClickRef.current = false;
    }, 0);
    void persistNodePosition(node, position.x, position.y);
  }

  return (
    <section className="world-map-viewer" aria-label="地图浏览器">
      <div className="world-map-toolbar" role="toolbar" aria-label="地图浏览工具">
        <button
          type="button"
          onClick={() => changeZoom(zoom - ZOOM_STEP)}
          disabled={zoom <= MIN_ZOOM}
          aria-label="缩小地图"
        >
          −
        </button>
        <output aria-live="polite">{Math.round(zoom * 100)}%</output>
        <button
          type="button"
          onClick={() => changeZoom(zoom + ZOOM_STEP)}
          disabled={zoom >= MAX_ZOOM}
          aria-label="放大地图"
        >
          ＋
        </button>
        <button type="button" onClick={resetView} disabled={zoom === MIN_ZOOM}>
          复位
        </button>
        {eventId ? (
          <span className="world-map-node-count">
            节点 {nodes.length} · 关系 {relations.length}
          </span>
        ) : null}
        {canContribute ? (
          <>
            <button className={isPlacing ? "is-active" : ""} type="button" onClick={beginPlacement}>
              {isPlacing ? "取消添加" : "添加节点"}
            </button>
            <button
              className={relationMode ? "is-active" : ""}
              type="button"
              onClick={beginRelation}
              disabled={nodes.length < 2}
              title={nodes.length < 2 ? "至少需要两个节点" : undefined}
            >
              {relationMode ? "取消连线" : "添加关系"}
            </button>
          </>
        ) : eventId && !currentUser ? (
          <a className="world-map-login-link" href={loginPath}>
            登录后参与共创
          </a>
        ) : eventId ? (
          <span className="world-map-account-note">完成账号设置后可编辑</span>
        ) : null}
        <a className="world-map-original-link" href={src} target="_blank" rel="noreferrer">
          打开原图
        </a>
      </div>

      {message ? (
        <p className="world-map-message" role="status">
          {message}
        </p>
      ) : null}

      <div className="world-map-canvas-shell">
        <div
          ref={viewportRef}
          className={`world-map-viewport${isDragging ? " is-dragging" : ""}${isPlacing ? " is-placing" : ""}${relationMode ? " is-relating" : ""}`}
          style={{ aspectRatio: `${width} / ${height}` }}
          tabIndex={0}
          role="region"
          aria-label="可缩放、拖动并包含共创节点和关系的列国纪世界地图"
          onPointerDown={beginDrag}
          onPointerMove={dragMap}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={handleKeyboard}
        >
          <div
            ref={stageRef}
            className="world-map-stage"
            style={{ width: `${zoom * 100}%` }}
            onClick={placeNode}
          >
            <img src={src} alt={alt} width={width} height={height} draggable={false} />
            <svg
              className="world-map-relation-layer"
              viewBox={`0 0 ${width} ${height}`}
              aria-label="节点关系"
            >
              {relations.map((relation) => {
                const geometry = relationGeometry(relation, nodes, width, height);
                if (!geometry) return null;
                const isOwn = currentUser?.id === relation.user_id;
                const isSelected = selectedRelationId === relation.id;
                const relationLabel = `${relation.name}：${nodeName(relation.source_node_id)}与${nodeName(relation.target_node_id)}`;
                return (
                  <g
                    key={relation.id}
                    className={`world-map-relation${isOwn ? " is-own" : ""}${isSelected ? " is-selected" : ""}`}
                    role="button"
                    tabIndex={0}
                    aria-label={relationLabel}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      selectRelation(relation.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      selectRelation(relation.id);
                    }}
                  >
                    <path className="world-map-relation-hit" d={geometry.path} />
                    <path className="world-map-relation-line" d={geometry.path} />
                    <text
                      className="world-map-relation-label"
                      x={geometry.labelX}
                      y={geometry.labelY}
                      textAnchor="middle"
                    >
                      {relation.name}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="world-map-node-layer">
              {nodes.map((node) => {
                const isOwn = currentUser?.id === node.user_id;
                const isRelationSource = relationMode?.sourceNodeId === node.id;
                return (
                  <button
                    key={node.id}
                    type="button"
                    className={`world-map-node${selectedNodeId === node.id ? " is-selected" : ""}${isOwn ? " is-own" : ""}${isRelationSource ? " is-relation-source" : ""}`}
                    style={{ left: `${node.x * 100}%`, top: `${node.y * 100}%` }}
                    aria-label={`${node.name}，创建者 ${node.owner_name}`}
                    title={
                      relationMode
                        ? isRelationSource
                          ? `${node.name}（已选为第一个节点）`
                          : `选择 ${node.name}`
                        : isOwn
                          ? `${node.name}（可拖动）`
                          : node.name
                    }
                    onPointerDown={(event) => beginNodeDrag(event, node)}
                    onPointerMove={dragNode}
                    onPointerUp={(event) => endNodeDrag(event, node)}
                    onPointerCancel={(event) => endNodeDrag(event, node)}
                    onClick={(event) => {
                      event.stopPropagation();
                      selectNode(node.id);
                    }}
                  >
                    <span className="world-map-node-dot" aria-hidden="true">
                      ◆
                    </span>
                    <span className="world-map-node-label">{node.name}</span>
                  </button>
                );
              })}
              {nodeForm && !nodeForm.nodeId ? (
                <span
                  className="world-map-node-preview"
                  style={{ left: `${nodeForm.x * 100}%`, top: `${nodeForm.y * 100}%` }}
                  aria-hidden="true"
                >
                  ◆
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {nodeForm ? (
          <form className="world-map-node-panel world-map-node-form" onSubmit={submitNode}>
            <div className="world-map-node-panel-heading">
              <h3>{nodeForm.nodeId ? "编辑节点" : "新节点"}</h3>
              <button
                type="button"
                aria-label="关闭节点编辑"
                onClick={() => setNodeForm(undefined)}
              >
                ×
              </button>
            </div>
            <label>
              名称
              <input
                autoFocus
                required
                maxLength={80}
                value={nodeForm.name}
                onChange={(event) => setNodeForm({ ...nodeForm, name: event.target.value })}
              />
            </label>
            <label>
              描述
              <textarea
                rows={5}
                maxLength={2000}
                value={nodeForm.description}
                onChange={(event) => setNodeForm({ ...nodeForm, description: event.target.value })}
              />
            </label>
            <label>
              备注（公开）
              <textarea
                rows={3}
                maxLength={1000}
                value={nodeForm.notes}
                onChange={(event) => setNodeForm({ ...nodeForm, notes: event.target.value })}
              />
            </label>
            <small>
              位置：{(nodeForm.x * 100).toFixed(1)}%，{(nodeForm.y * 100).toFixed(1)}%
            </small>
            <div className="world-map-node-actions">
              <button type="submit" disabled={isSaving}>
                {isSaving ? "保存中…" : "保存并公开"}
              </button>
              <button type="button" onClick={() => setNodeForm(undefined)} disabled={isSaving}>
                取消
              </button>
            </div>
          </form>
        ) : relationForm ? (
          <form className="world-map-node-panel world-map-node-form" onSubmit={submitRelation}>
            <div className="world-map-node-panel-heading">
              <h3>{relationForm.relationId ? "编辑关系" : "新关系"}</h3>
              <button
                type="button"
                aria-label="关闭关系编辑"
                onClick={() => setRelationForm(undefined)}
              >
                ×
              </button>
            </div>
            <div className="world-map-relation-node-fields">
              <label>
                第一个节点
                <select
                  value={relationForm.source_node_id}
                  onChange={(event) =>
                    setRelationForm({
                      ...relationForm,
                      source_node_id: Number(event.target.value),
                    })
                  }
                >
                  {nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                第二个节点
                <select
                  value={relationForm.target_node_id}
                  onChange={(event) =>
                    setRelationForm({
                      ...relationForm,
                      target_node_id: Number(event.target.value),
                    })
                  }
                >
                  {nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              关系名称
              <input
                autoFocus
                required
                maxLength={80}
                value={relationForm.name}
                onChange={(event) => setRelationForm({ ...relationForm, name: event.target.value })}
              />
            </label>
            <label>
              关系说明
              <textarea
                rows={5}
                maxLength={2000}
                value={relationForm.description}
                onChange={(event) =>
                  setRelationForm({ ...relationForm, description: event.target.value })
                }
              />
            </label>
            <label>
              备注（公开）
              <textarea
                rows={3}
                maxLength={1000}
                value={relationForm.notes}
                onChange={(event) =>
                  setRelationForm({ ...relationForm, notes: event.target.value })
                }
              />
            </label>
            <div className="world-map-node-actions">
              <button type="submit" disabled={isSaving}>
                {isSaving ? "保存中…" : "保存并公开"}
              </button>
              <button type="button" onClick={() => setRelationForm(undefined)} disabled={isSaving}>
                取消
              </button>
            </div>
          </form>
        ) : selectedRelation ? (
          <aside className="world-map-node-panel" aria-label="关系详情">
            <div className="world-map-node-panel-heading">
              <h3>{selectedRelation.name}</h3>
              <button
                type="button"
                aria-label="关闭关系详情"
                onClick={() => setSelectedRelationId(undefined)}
              >
                ×
              </button>
            </div>
            <p className="world-map-relation-endpoints">
              {nodeName(selectedRelation.source_node_id)} ↔{" "}
              {nodeName(selectedRelation.target_node_id)}
            </p>
            {selectedRelation.description ? (
              <p className="world-map-node-description">{selectedRelation.description}</p>
            ) : (
              <p className="world-map-node-empty">暂时没有关系说明。</p>
            )}
            {selectedRelation.notes ? (
              <div className="world-map-node-notes">
                <strong>备注</strong>
                <p>{selectedRelation.notes}</p>
              </div>
            ) : null}
            <p className="world-map-node-owner">创建者：{selectedRelation.owner_name}</p>
            {currentUser?.id === selectedRelation.user_id && currentUser.canEdit ? (
              <div className="world-map-node-actions">
                <button type="button" onClick={() => editRelation(selectedRelation)}>
                  编辑关系
                </button>
                <button
                  className="is-danger"
                  type="button"
                  onClick={() => void deleteRelation(selectedRelation)}
                  disabled={isSaving}
                >
                  删除关系
                </button>
              </div>
            ) : null}
          </aside>
        ) : selectedNode ? (
          <aside className="world-map-node-panel" aria-label="节点详情">
            <div className="world-map-node-panel-heading">
              <h3>{selectedNode.name}</h3>
              <button
                type="button"
                aria-label="关闭节点详情"
                onClick={() => setSelectedNodeId(undefined)}
              >
                ×
              </button>
            </div>
            {selectedNode.description ? (
              <p className="world-map-node-description">{selectedNode.description}</p>
            ) : (
              <p className="world-map-node-empty">暂时没有描述。</p>
            )}
            {selectedNode.notes ? (
              <div className="world-map-node-notes">
                <strong>备注</strong>
                <p>{selectedNode.notes}</p>
              </div>
            ) : null}
            <p className="world-map-node-owner">创建者：{selectedNode.owner_name}</p>
            {currentUser?.id === selectedNode.user_id && currentUser.canEdit ? (
              <div className="world-map-node-actions">
                <button type="button" onClick={() => editNode(selectedNode)}>
                  编辑信息
                </button>
                <button
                  className="is-danger"
                  type="button"
                  onClick={() => void deleteNode(selectedNode)}
                  disabled={isSaving}
                >
                  删除节点
                </button>
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>

      {isPlacing || relationMode ? (
        <p className="world-map-help">
          {isPlacing
            ? "添加模式：请点击地图确定新节点的位置。"
            : relationMode?.sourceNodeId
              ? `关系模式：已选择“${nodeName(relationMode.sourceNodeId)}”，请点击第二个节点。`
              : "关系模式：请依次点击两个节点。"}
        </p>
      ) : null}
    </section>
  );
}
