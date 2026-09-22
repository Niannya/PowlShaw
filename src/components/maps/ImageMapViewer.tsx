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
import {
  DEFAULT_EVENT_MAP_REGION_COLOR,
  EVENT_MAP_REGION_MAX_POINTS,
  type EditableEventMapRegion,
  type EventMapPoint,
} from "@/lib/event-map-region-validation";
import type { EventMapRegion } from "@/lib/event-map-regions";
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

type NodeFormState = EditableEventMapNode & {
  nodeId?: number;
};

type RegionFormState = EditableEventMapRegion & {
  regionId?: number;
};

type RegionDrawingState = {
  points: EventMapPoint[];
  region?: EventMapRegion;
};

type NodeMoveState = {
  node: EventMapNode;
  x: number;
  y: number;
};

type RegionPointDragState = {
  pointerId: number;
  index: number;
  target: "drawing" | "form";
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
  initialRegions?: EventMapRegion[];
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

function svgPoints(points: EventMapPoint[], width: number, height: number) {
  return points.map((point) => `${point.x * width},${point.y * height}`).join(" ");
}

function regionLabelPosition(points: EventMapPoint[], width: number, height: number) {
  const total = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), {
    x: 0,
    y: 0,
  });
  return {
    x: (total.x / points.length) * width,
    y: (total.y / points.length) * height,
  };
}

export function ImageMapViewer({
  src,
  alt,
  width,
  height,
  eventId,
  initialNodes = [],
  initialRegions = [],
  initialRelations = [],
  currentUser,
  loginPath = "/login",
}: ImageMapViewerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const nodeMovePointerRef = useRef<number | null>(null);
  const regionPointDragRef = useRef<RegionPointDragState | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [isDragging, setIsDragging] = useState(false);
  const [nodes, setNodes] = useState(initialNodes);
  const [regions, setRegions] = useState(initialRegions);
  const [relations, setRelations] = useState(initialRelations);
  const [selectedNodeId, setSelectedNodeId] = useState<number>();
  const [selectedRegionId, setSelectedRegionId] = useState<number>();
  const [selectedRelationId, setSelectedRelationId] = useState<number>();
  const [nodeForm, setNodeForm] = useState<NodeFormState>();
  const [regionForm, setRegionForm] = useState<RegionFormState>();
  const [relationForm, setRelationForm] = useState<RelationFormState>();
  const [isPlacing, setIsPlacing] = useState(false);
  const [movingNode, setMovingNode] = useState<NodeMoveState>();
  const [regionDrawing, setRegionDrawing] = useState<RegionDrawingState>();
  const [relationMode, setRelationMode] = useState<RelationMode>();
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const selectedRegion = regions.find((region) => region.id === selectedRegionId);
  const selectedRelation = relations.find((relation) => relation.id === selectedRelationId);
  const canContribute = Boolean(eventId && currentUser?.canEdit);
  const isChoosingMapPosition = Boolean(isPlacing || movingNode || regionDrawing);
  const renderedNodes = movingNode
    ? nodes.map((node) =>
        node.id === movingNode.node.id ? { ...node, x: movingNode.x, y: movingNode.y } : node,
      )
    : nodes;

  function nodeName(nodeId: number) {
    return nodes.find((node) => node.id === nodeId)?.name || "已隐藏节点";
  }

  function closePanels() {
    setSelectedNodeId(undefined);
    setSelectedRegionId(undefined);
    setSelectedRelationId(undefined);
    setNodeForm(undefined);
    setRegionForm(undefined);
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
    if (event.button !== 0 || isChoosingMapPosition) return;
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
    if (isPlacing) {
      setIsPlacing(false);
      setMessage("");
      return;
    }
    closePanels();
    setMovingNode(undefined);
    setRegionDrawing(undefined);
    setRelationMode(undefined);
    setIsPlacing(true);
    setMessage("请在地图上点击节点的位置。");
  }

  function beginRelation() {
    closePanels();
    setIsPlacing(false);
    setMovingNode(undefined);
    setRegionDrawing(undefined);
    if (relationMode) {
      setRelationMode(undefined);
      setMessage("");
      return;
    }
    setRelationMode({});
    setMessage("请先选择关系的第一个节点。");
  }

  function beginRegionDrawing(region?: EventMapRegion) {
    closePanels();
    setIsPlacing(false);
    setMovingNode(undefined);
    setRelationMode(undefined);
    setRegionDrawing({ points: [], region });
    setMessage("请依次点击地图添加区域顶点。");
  }

  function cancelRegionDrawing() {
    const regionId = regionDrawing?.region?.id;
    setRegionDrawing(undefined);
    setSelectedRegionId(regionId);
    setMessage("");
  }

  function undoRegionPoint() {
    setRegionDrawing((drawing) =>
      drawing ? { ...drawing, points: drawing.points.slice(0, -1) } : drawing,
    );
  }

  function finishRegionDrawing() {
    if (!regionDrawing || regionDrawing.points.length < 3) {
      setMessage("区域至少需要三个顶点。");
      return;
    }

    const existing = regionDrawing.region;
    setRegionForm({
      regionId: existing?.id,
      name: existing?.name || "",
      description: existing?.description || "",
      notes: existing?.notes || "",
      color: existing?.color || DEFAULT_EVENT_MAP_REGION_COLOR,
      points: regionDrawing.points,
    });
    setRegionDrawing(undefined);
    setMessage("");
  }

  function beginNodeMove(node: EventMapNode) {
    closePanels();
    setIsPlacing(false);
    setRegionDrawing(undefined);
    setRelationMode(undefined);
    setMovingNode({ node, x: node.x, y: node.y });
    setMessage("");
  }

  function pointFromClient(clientX: number, clientY: number) {
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds) return undefined;
    return {
      x: clamp((clientX - bounds.left) / bounds.width),
      y: clamp((clientY - bounds.top) / bounds.height),
    };
  }

  function pointFromMapClick(event: ReactMouseEvent<HTMLDivElement>) {
    return pointFromClient(event.clientX, event.clientY);
  }

  function beginNodeMoveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!movingNode || isSaving || event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    nodeMovePointerRef.current = event.pointerId;
  }

  function dragMovingNode(event: ReactPointerEvent<HTMLButtonElement>) {
    if (nodeMovePointerRef.current !== event.pointerId) return;
    event.stopPropagation();
    const point = pointFromClient(event.clientX, event.clientY);
    if (!point) return;
    setMovingNode((current) => (current ? { ...current, ...point } : current));
  }

  function endNodeMoveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (nodeMovePointerRef.current !== event.pointerId) return;
    event.stopPropagation();
    nodeMovePointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function beginRegionPointDrag(
    target: RegionPointDragState["target"],
    index: number,
    event: ReactPointerEvent<SVGGElement>,
  ) {
    if (isSaving || event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    regionPointDragRef.current = { pointerId: event.pointerId, index, target };
    setMessage("");
  }

  function dragRegionPoint(event: ReactPointerEvent<SVGGElement>) {
    const drag = regionPointDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const point = pointFromClient(event.clientX, event.clientY);
    if (!point) return;

    if (drag.target === "drawing") {
      setRegionDrawing((current) => {
        if (!current) return current;
        const points = current.points.map((item, index) => (index === drag.index ? point : item));
        return { ...current, points };
      });
      return;
    }

    setRegionForm((current) => {
      if (!current) return current;
      const points = current.points.map((item, index) => (index === drag.index ? point : item));
      return { ...current, points };
    });
  }

  function endRegionPointDrag(event: ReactPointerEvent<SVGGElement>) {
    if (regionPointDragRef.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    regionPointDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleMapClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!canContribute) return;
    const point = pointFromMapClick(event);
    if (!point) return;

    if (movingNode) {
      if (isSaving) return;
      setMovingNode({ ...movingNode, ...point });
      setMessage("");
      return;
    }

    if (regionDrawing) {
      if (regionDrawing.points.length >= EVENT_MAP_REGION_MAX_POINTS) {
        setMessage(`区域最多只能使用 ${EVENT_MAP_REGION_MAX_POINTS} 个顶点。`);
        return;
      }
      setRegionDrawing({ ...regionDrawing, points: [...regionDrawing.points, point] });
      setMessage("");
      return;
    }

    if (!isPlacing) return;

    setIsPlacing(false);
    setNodeForm({
      name: "",
      description: "",
      notes: "",
      ...point,
    });
    setMessage("");
  }

  function selectNode(nodeId: number) {
    if (movingNode || regionDrawing || isPlacing) {
      setMessage("请点击地图空白处完成当前操作。");
      return;
    }
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
    setRegionForm(undefined);
    setRelationForm(undefined);
    setIsPlacing(false);
    setSelectedRegionId(undefined);
    setSelectedRelationId(undefined);
    setSelectedNodeId(nodeId);
    setMessage("");
  }

  function selectRelation(relationId: number) {
    if (isChoosingMapPosition) {
      setMessage("请点击地图空白处完成当前操作。");
      return;
    }
    if (relationMode) {
      setMessage("请点击两个节点来建立关系，而不是点击已有关系线。");
      return;
    }
    setNodeForm(undefined);
    setRegionForm(undefined);
    setRelationForm(undefined);
    setSelectedNodeId(undefined);
    setSelectedRegionId(undefined);
    setSelectedRelationId(relationId);
    setMessage("");
  }

  function selectRegion(regionId: number) {
    if (isChoosingMapPosition || relationMode) {
      setMessage(relationMode ? "请点击两个节点来建立关系。" : "请点击地图空白处完成当前操作。");
      return;
    }
    setNodeForm(undefined);
    setRegionForm(undefined);
    setRelationForm(undefined);
    setSelectedNodeId(undefined);
    setSelectedRelationId(undefined);
    setSelectedRegionId(regionId);
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

  function editRegion(region: EventMapRegion) {
    setRegionForm({
      regionId: region.id,
      name: region.name,
      description: region.description,
      notes: region.notes,
      color: region.color,
      points: region.points,
    });
    setSelectedRegionId(undefined);
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

  async function submitRegion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!eventId || !regionForm || !canContribute) return;

    setIsSaving(true);
    setMessage("");
    const response = await fetch(
      regionForm.regionId
        ? `/api/events/${eventId}/map/regions/${regionForm.regionId}`
        : `/api/events/${eventId}/map/regions`,
      {
        method: regionForm.regionId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(regionForm),
      },
    ).catch(() => undefined);
    if (!response) {
      setIsSaving(false);
      setMessage("区域保存失败，请检查网络连接后重试。");
      return;
    }
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      region?: EventMapRegion;
    };
    setIsSaving(false);

    if (!response.ok || !result.region) {
      setMessage(result.error || "区域保存失败，请稍后再试。");
      return;
    }

    setRegions((items) => {
      const exists = items.some((item) => item.id === result.region!.id);
      if (!exists) return [...items, result.region!];
      return items.map((item) => (item.id === result.region!.id ? result.region! : item));
    });
    setRegionForm(undefined);
    setSelectedRegionId(result.region.id);
    setMessage(regionForm.regionId ? "区域已更新。" : "区域已添加并公开显示。");
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

  async function deleteRegion(region: EventMapRegion) {
    if (!eventId || currentUser?.id !== region.user_id) return;
    if (!window.confirm(`确定删除区域“${region.name}”吗？`)) return;

    setIsSaving(true);
    const response = await fetch(`/api/events/${eventId}/map/regions/${region.id}`, {
      method: "DELETE",
    }).catch(() => undefined);
    if (!response) {
      setIsSaving(false);
      setMessage("区域删除失败，请检查网络连接后重试。");
      return;
    }
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setIsSaving(false);
    if (!response.ok) {
      setMessage(result.error || "区域删除失败，请稍后再试。");
      return;
    }
    setRegions((items) => items.filter((item) => item.id !== region.id));
    setSelectedRegionId(undefined);
    setMessage("区域已删除。");
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

  async function persistNodePosition(node: EventMapNode, x: number, y: number) {
    if (!eventId) return;
    setIsSaving(true);
    setMessage("");
    const response = await fetch(`/api/events/${eventId}/map/nodes/${node.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...node, x, y }),
    }).catch(() => undefined);
    setIsSaving(false);
    if (!response) {
      setMessage("节点位置保存失败，请检查网络连接后重试。");
      return;
    }
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      node?: EventMapNode;
    };
    if (!response.ok || !result.node) {
      setMessage(result.error || "节点位置保存失败，请稍后再试。");
      return;
    }
    setNodes((items) => items.map((item) => (item.id === result.node!.id ? result.node! : item)));
    setMovingNode(undefined);
    setSelectedNodeId(result.node.id);
    setMessage("");
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
            节点 {nodes.length} · 区域 {regions.length} · 关系 {relations.length}
          </span>
        ) : null}
        {canContribute ? (
          <>
            <button className={isPlacing ? "is-active" : ""} type="button" onClick={beginPlacement}>
              {isPlacing ? "取消添加" : "添加节点"}
            </button>
            <button
              className={regionDrawing ? "is-active" : ""}
              type="button"
              onClick={() => (regionDrawing ? cancelRegionDrawing() : beginRegionDrawing())}
            >
              {regionDrawing ? "取消圈选" : "添加区域"}
            </button>
            {regionDrawing ? (
              <>
                <button
                  type="button"
                  onClick={undoRegionPoint}
                  disabled={!regionDrawing.points.length}
                >
                  撤销一点
                </button>
                <button
                  type="button"
                  onClick={finishRegionDrawing}
                  disabled={regionDrawing.points.length < 3}
                >
                  完成圈选
                </button>
              </>
            ) : null}
            {movingNode ? (
              <>
                <button
                  className="is-active"
                  type="button"
                  onClick={() =>
                    void persistNodePosition(movingNode.node, movingNode.x, movingNode.y)
                  }
                  disabled={isSaving}
                >
                  {isSaving ? "保存中…" : "保存位置"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMovingNode(undefined);
                    setSelectedNodeId(movingNode.node.id);
                    setMessage("");
                  }}
                  disabled={isSaving}
                >
                  取消移动
                </button>
              </>
            ) : null}
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

      <div className="world-map-canvas-shell">
        {message ? (
          <p className="world-map-message" role="status">
            {message}
          </p>
        ) : null}
        <div
          ref={viewportRef}
          className={`world-map-viewport${isDragging ? " is-dragging" : ""}${isChoosingMapPosition ? " is-placing" : ""}${relationMode ? " is-relating" : ""}`}
          style={{ aspectRatio: `${width} / ${height}` }}
          tabIndex={0}
          role="region"
          aria-label="可缩放、拖动并包含共创节点、区域和关系的列国纪世界地图"
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
            onClick={handleMapClick}
          >
            <img src={src} alt={alt} width={width} height={height} draggable={false} />
            <svg
              className={`world-map-overlay-layer${isChoosingMapPosition ? " is-choosing-position" : ""}${regionForm ? " is-editing-region" : ""}`}
              viewBox={`0 0 ${width} ${height}`}
              aria-label="地图区域和节点关系"
            >
              {regions
                .filter((region) => region.id !== regionForm?.regionId)
                .map((region) => {
                  const label = regionLabelPosition(region.points, width, height);
                  const isOwn = currentUser?.id === region.user_id;
                  const isSelected = selectedRegionId === region.id;
                  return (
                    <g
                      key={region.id}
                      className={`world-map-region${isOwn ? " is-own" : ""}${isSelected ? " is-selected" : ""}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${region.name}，创建者 ${region.owner_name}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        selectRegion(region.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        selectRegion(region.id);
                      }}
                    >
                      <polygon
                        className="world-map-region-shape"
                        points={svgPoints(region.points, width, height)}
                        fill={region.color}
                        stroke={region.color}
                      />
                      <text
                        className="world-map-region-label"
                        x={label.x}
                        y={label.y}
                        textAnchor="middle"
                      >
                        {region.name}
                      </text>
                    </g>
                  );
                })}
              {regionDrawing ? (
                <g className="world-map-region-draft">
                  {regionDrawing.points.length >= 3 ? (
                    <polygon
                      points={svgPoints(regionDrawing.points, width, height)}
                      fill={regionDrawing.region?.color || DEFAULT_EVENT_MAP_REGION_COLOR}
                    />
                  ) : null}
                  <polyline points={svgPoints(regionDrawing.points, width, height)} />
                  {regionDrawing.points.map((point, index) => (
                    <g
                      key={index}
                      className="world-map-region-point"
                      role="button"
                      tabIndex={0}
                      aria-label={`第 ${index + 1} 个区域顶点，可拖动微调`}
                      onPointerDown={(event) => beginRegionPointDrag("drawing", index, event)}
                      onPointerMove={dragRegionPoint}
                      onPointerUp={endRegionPointDrag}
                      onPointerCancel={endRegionPointDrag}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <circle
                        className="world-map-region-point-hit"
                        cx={point.x * width}
                        cy={point.y * height}
                        r={14}
                      />
                      <circle
                        className="world-map-region-point-handle"
                        cx={point.x * width}
                        cy={point.y * height}
                        r={5}
                      />
                    </g>
                  ))}
                </g>
              ) : null}
              {regionForm ? (
                <g className="world-map-region-form-preview">
                  <polygon
                    points={svgPoints(regionForm.points, width, height)}
                    fill={regionForm.color}
                    stroke={regionForm.color}
                  />
                  {regionForm.points.map((point, index) => (
                    <g
                      key={index}
                      className="world-map-region-point"
                      role="button"
                      tabIndex={0}
                      aria-label={`第 ${index + 1} 个区域顶点，可拖动微调`}
                      onPointerDown={(event) => beginRegionPointDrag("form", index, event)}
                      onPointerMove={dragRegionPoint}
                      onPointerUp={endRegionPointDrag}
                      onPointerCancel={endRegionPointDrag}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <circle
                        className="world-map-region-point-hit"
                        cx={point.x * width}
                        cy={point.y * height}
                        r={14}
                      />
                      <circle
                        className="world-map-region-point-handle"
                        cx={point.x * width}
                        cy={point.y * height}
                        r={5}
                      />
                    </g>
                  ))}
                </g>
              ) : null}
              {relations.map((relation) => {
                const geometry = relationGeometry(relation, renderedNodes, width, height);
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
            <div
              className={`world-map-node-layer${isChoosingMapPosition ? " is-choosing-position" : ""}${regionForm ? " is-editing-region" : ""}`}
            >
              {renderedNodes.map((node) => {
                const isOwn = currentUser?.id === node.user_id;
                const isRelationSource = relationMode?.sourceNodeId === node.id;
                const isMoving = movingNode?.node.id === node.id;
                return (
                  <button
                    key={node.id}
                    type="button"
                    className={`world-map-node${selectedNodeId === node.id ? " is-selected" : ""}${isOwn ? " is-own" : ""}${isRelationSource ? " is-relation-source" : ""}${isMoving ? " is-move-preview" : ""}`}
                    style={{ left: `${node.x * 100}%`, top: `${node.y * 100}%` }}
                    aria-label={`${node.name}，创建者 ${node.owner_name}`}
                    title={
                      isMoving
                        ? `${node.name}（拖动微调位置）`
                        : relationMode
                          ? isRelationSource
                            ? `${node.name}（已选为第一个节点）`
                            : `选择 ${node.name}`
                          : node.name
                    }
                    onPointerDown={(event) =>
                      isMoving ? beginNodeMoveDrag(event) : event.stopPropagation()
                    }
                    onPointerMove={isMoving ? dragMovingNode : undefined}
                    onPointerUp={isMoving ? endNodeMoveDrag : undefined}
                    onPointerCancel={isMoving ? endNodeMoveDrag : undefined}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!isMoving) selectNode(node.id);
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
        ) : regionForm ? (
          <form className="world-map-node-panel world-map-node-form" onSubmit={submitRegion}>
            <div className="world-map-node-panel-heading">
              <h3>{regionForm.regionId ? "编辑区域" : "新区域"}</h3>
              <button
                type="button"
                aria-label="关闭区域编辑"
                onClick={() => {
                  const regionId = regionForm.regionId;
                  setRegionForm(undefined);
                  setSelectedRegionId(regionId);
                }}
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
                value={regionForm.name}
                onChange={(event) => setRegionForm({ ...regionForm, name: event.target.value })}
              />
            </label>
            <label>
              颜色
              <input
                className="world-map-region-color-input"
                type="color"
                value={regionForm.color}
                onChange={(event) => setRegionForm({ ...regionForm, color: event.target.value })}
              />
            </label>
            <label>
              描述
              <textarea
                rows={5}
                maxLength={2000}
                value={regionForm.description}
                onChange={(event) =>
                  setRegionForm({ ...regionForm, description: event.target.value })
                }
              />
            </label>
            <label>
              备注（公开）
              <textarea
                rows={3}
                maxLength={1000}
                value={regionForm.notes}
                onChange={(event) => setRegionForm({ ...regionForm, notes: event.target.value })}
              />
            </label>
            <small>{regionForm.points.length} 个顶点，可直接拖动地图上的顶点微调</small>
            <div className="world-map-node-actions">
              <button type="submit" disabled={isSaving}>
                {isSaving ? "保存中…" : "保存并公开"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const regionId = regionForm.regionId;
                  setRegionForm(undefined);
                  setSelectedRegionId(regionId);
                }}
                disabled={isSaving}
              >
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
        ) : selectedRegion ? (
          <aside className="world-map-node-panel" aria-label="区域详情">
            <div className="world-map-node-panel-heading">
              <h3>{selectedRegion.name}</h3>
              <button
                type="button"
                aria-label="关闭区域详情"
                onClick={() => setSelectedRegionId(undefined)}
              >
                ×
              </button>
            </div>
            <p className="world-map-region-color-line">
              <span style={{ backgroundColor: selectedRegion.color }} aria-hidden="true" />
              {selectedRegion.points.length} 个顶点
            </p>
            {selectedRegion.description ? (
              <p className="world-map-node-description">{selectedRegion.description}</p>
            ) : (
              <p className="world-map-node-empty">暂时没有描述。</p>
            )}
            {selectedRegion.notes ? (
              <div className="world-map-node-notes">
                <strong>备注</strong>
                <p>{selectedRegion.notes}</p>
              </div>
            ) : null}
            <p className="world-map-node-owner">创建者：{selectedRegion.owner_name}</p>
            {currentUser?.id === selectedRegion.user_id && currentUser.canEdit ? (
              <div className="world-map-node-actions">
                <button type="button" onClick={() => editRegion(selectedRegion)}>
                  编辑信息
                </button>
                <button type="button" onClick={() => beginRegionDrawing(selectedRegion)}>
                  重新圈选
                </button>
                <button
                  className="is-danger"
                  type="button"
                  onClick={() => void deleteRegion(selectedRegion)}
                  disabled={isSaving}
                >
                  删除区域
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
                <button type="button" onClick={() => beginNodeMove(selectedNode)}>
                  移动位置
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

      {isPlacing || movingNode || regionDrawing || relationMode ? (
        <p className="world-map-help">
          {isPlacing
            ? "添加模式：请点击地图确定新节点的位置。"
            : movingNode
              ? `移动模式：点击地图粗调“${movingNode.node.name}”的位置，拖动节点微调，完成后保存。`
              : regionDrawing
                ? `圈选模式：已添加 ${regionDrawing.points.length} 个顶点，可拖动已有顶点微调。`
                : relationMode?.sourceNodeId
                  ? `关系模式：已选择“${nodeName(relationMode.sourceNodeId)}”，请点击第二个节点。`
                  : "关系模式：请依次点击两个节点。"}
        </p>
      ) : null}
    </section>
  );
}
