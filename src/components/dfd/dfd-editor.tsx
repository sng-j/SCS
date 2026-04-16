"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  ConnectionMode,
  type Connection,
  type Node,
  type Edge,
  BackgroundVariant,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import { toPng } from "html-to-image";
import {
  Save,
  Undo2,
  Redo2,
  Plus,
  Download,
  LayoutDashboard,
  Maximize2,
  Pencil,
  Copy,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { useDfdStore } from "@/stores/dfd-store";
import { cn } from "@/lib/utils";
import { HardwareNode } from "./hardware-node";
import { ZoneNode } from "./zone-node";
import { DfdSidebar } from "./dfd-sidebar";
import { EdgeEditDialog } from "./edge-edit-dialog";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Hardware {
  id: string;
  name: string;
  type: string;
  ipAddress: string | null;
  zone: string | null;
  location: string | null;
  software: { name: string; version: string | null }[];
}

interface DfdEditorProps {
  projectId: string;
  hardware: Hardware[];
  equipmentId?: string | null;
  readOnly?: boolean;
  /** 노드 추가/삭제 차단 — 레이아웃·연결·속성 편집만 허용. 자산 등록에서 장비를 관리. */
  noCreate?: boolean;
}

// ─── Node types ─────────────────────────────────────────────────────────────

const nodeTypes = { hardware: HardwareNode, zone: ZoneNode };

// ─── Dagre auto-layout ──────────────────────────────────────────────────────

function getDagreLayout(
  currentNodes: Node[],
  currentEdges: Edge[],
  direction: "TB" | "LR" = "LR",
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 120, marginx: 30, marginy: 30 });

  // Include all non-zone nodes in layout (hardware, server, plc, pc, network, sensor, external, etc.)
  const layoutTargets = currentNodes.filter((n) => n.type !== "zone");
  for (const node of layoutTargets) {
    g.setNode(node.id, { width: 180, height: 90 });
  }

  for (const edge of currentEdges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(g);

  // Apply layout positions to target nodes, keep zone nodes unchanged
  const layoutNodeMap = new Map<string, { x: number; y: number }>();
  for (const node of layoutTargets) {
    const pos = g.node(node.id);
    if (pos) layoutNodeMap.set(node.id, { x: pos.x - 90, y: pos.y - 45 });
  }

  const resultNodes = currentNodes.map((node) => {
    const pos = layoutNodeMap.get(node.id);
    if (pos) return { ...node, position: pos };
    return node;
  });

  return { nodes: resultNodes, edges: currentEdges };
}

// ─── Normalize API node types to editor node types ──────────────────────────

function normalizeNodes(rawNodes: Node[]): Node[] {
  const normalized = rawNodes.map((n) => {
    const raw = n as Record<string, unknown>;
    const position = n.position ?? {
      x: typeof raw.x === "number" ? raw.x : 0,
      y: typeof raw.y === "number" ? raw.y : 0,
    };
    const rawType = typeof raw.type === "string" ? raw.type : "hardware";
    const type = rawType === "group" ? "zone" : rawType === "default" ? "hardware" : (rawType || "hardware");
    const isZone = type === "zone";
    return {
      ...n, type, position,
      // Preserve parentId and extent for zone containment
      ...(raw.parentId ? { parentId: raw.parentId as string } : {}),
      ...(raw.extent ? { extent: raw.extent as "parent" } : {}),
      selectable: true,
      draggable: true,
      focusable: true,
      zIndex: isZone ? -1 : 10,
      ...(isZone ? { dragHandle: ".zone-drag-handle" } : {}),
    };
  });
  // Sort: zone nodes first (ReactFlow requires parents before children)
  return normalized.sort((a, b) => {
    const aIsZone = a.type === "zone" ? 0 : 1;
    const bIsZone = b.type === "zone" ? 0 : 1;
    return aIsZone - bIsZone;
  });
}

function normalizeEdges(rawEdges: Edge[]): Edge[] {
  return rawEdges.map((e) => {
    const raw = e as Record<string, unknown>;
    // API data may store from/to instead of source/target
    const source = e.source ?? (typeof raw.from === "string" ? raw.from : "");
    const target = e.target ?? (typeof raw.to === "string" ? raw.to : "");
    return { ...e, source, target };
  });
}

// ─── Edge style helper ──────────────────────────────────────────────────────

const EDGE_COLORS: Record<string, string> = {
  ethernet: "#0F62FE",
  wireless: "#24A148",
  serial: "#DA1E28",
  fiber: "#8A3FFC",
  canbus: "#EB6200",
  modbus: "#F1C21B",
};

function getEdgeStyle(data?: Record<string, unknown>) {
  const ct = (data?.connectionType as string) || "ethernet";
  const enc = (data?.encrypted as boolean) || false;
  return {
    stroke: EDGE_COLORS[ct] || "#0F62FE",
    strokeWidth: enc ? 2.5 : 1.5,
    strokeDasharray: ct === "serial" ? "5,5" : undefined,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Component
// ═════════════════════════════════════════════════════════════════════════════

export function DfdEditor(props: DfdEditorProps) {
  return (
    <ReactFlowProvider>
      <DfdEditorInner {...props} />
    </ReactFlowProvider>
  );
}

function DfdEditorInner({ projectId, hardware, equipmentId, readOnly, noCreate }: DfdEditorProps) {
  const { locale } = useLocaleStore();
  const { fitView } = useReactFlow();

  // ─── React Flow state ──────────────────────────────────────────────────
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([] as Edge[]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // ─── DFD Store (undo/redo + dirty) ─────────────────────────────────────
  const { pushHistory, undo, redo, canUndo, canRedo, isDirty, markSaved, reset } = useDfdStore();
  useUnsavedChanges(isDirty);

  // ─── Refs ──────────────────────────────────────────────────────────────
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isLoadingRef = useRef(true);
  const savingRef = useRef(false);
  const flowWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // ─── Sidebar & dialog state ─────────────────────────────────────────────
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editEdge, setEditEdge] = useState<Edge | null>(null);

  // ─── Context menu ──────────────────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);

  // ─── Commit history ────────────────────────────────────────────────────
  const commitHistory = useCallback(() => {
    pushHistory(nodesRef.current, edgesRef.current);
  }, [pushHistory]);

  // ─── Load diagram ──────────────────────────────────────────────────────

  useEffect(() => {
    async function loadDiagram() {
      reset();
      try {
        const eqParam = equipmentId ? `?equipmentId=${equipmentId}` : "";
        const res = await fetch(`/api/projects/${projectId}/dfd${eqParam}`);
        if (res.ok) {
          const data = await res.json();
          if (data.nodes && data.nodes.length > 0) {
            const normalized = normalizeNodes(data.nodes);
            const normalizedEdges = normalizeEdges(data.edges || []);
            setNodes(normalized);
            setEdges(normalizedEdges);
            setLoaded(true);
            setTimeout(() => {
              pushHistory(normalized, normalizedEdges);
              fitView({ padding: 0.3, duration: 300 });
            }, 150);
            isLoadingRef.current = false;
            return;
          }
        }
      } catch {
        // fall through
      }

      // Auto-generate from hardware if no saved diagram
      if (hardware.length > 0) {
        const hwNodes: Node[] = [];
        const zoneGroups = new Map<string, Hardware[]>();
        hardware.forEach((hw) => {
          const z = hw.zone || "unassigned";
          if (!zoneGroups.has(z)) zoneGroups.set(z, []);
          zoneGroups.get(z)!.push(hw);
        });

        let colX = 0;
        zoneGroups.forEach((items) => {
          items.forEach((hw, rowIdx) => {
            hwNodes.push({
              id: hw.id,
              type: "hardware",
              position: { x: colX, y: rowIdx * 140 },
              data: {
                label: hw.name,
                hwType: hw.type,
                zone: hw.zone,
                ipAddress: hw.ipAddress,
                software: hw.software,
              },
            });
          });
          colX += 260;
        });

        setNodes(hwNodes);
        setEdges([]);
        setTimeout(() => pushHistory(hwNodes, []), 100);
      }
      setLoaded(true);
      isLoadingRef.current = false;
    }

    loadDiagram();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // ─── Save ──────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await fetch(`/api/projects/${projectId}/dfd`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes: nodesRef.current, edges: edgesRef.current, ...(equipmentId ? { equipmentId } : {}) }),
      });
      markSaved();
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }, [projectId, markSaved]);

  // ─── Auto-save (5s after last change) ──────────────────────────────────

  useEffect(() => {
    if (!isDirty || isLoadingRef.current) return;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(handleSave, 5000);
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); };
  }, [isDirty, nodes, edges, handleSave]);

  // ─── Undo / Redo ──────────────────────────────────────────────────────

  const handleUndo = useCallback(() => {
    const state = undo();
    if (state) { setNodes(state.nodes); setEdges(state.edges); }
  }, [undo, setNodes, setEdges]);

  const handleRedo = useCallback(() => {
    const state = redo();
    if (state) { setNodes(state.nodes); setEdges(state.edges); }
  }, [redo, setNodes, setEdges]);

  // ─── Keyboard shortcuts ────────────────────────────────────────────────

  const handleUndoRef = useRef(handleUndo);
  const handleRedoRef = useRef(handleRedo);
  const handleSaveRef = useRef(handleSave);
  useEffect(() => { handleUndoRef.current = handleUndo; }, [handleUndo]);
  useEffect(() => { handleRedoRef.current = handleRedo; }, [handleRedo]);
  useEffect(() => { handleSaveRef.current = handleSave; }, [handleSave]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndoRef.current();
      }
      if (meta && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        handleRedoRef.current();
      }
      if (meta && e.key === "s") {
        e.preventDefault();
        handleSaveRef.current();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // ─── Connection ────────────────────────────────────────────────────────

  const handleConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: "smoothstep",
            animated: false,
            style: { stroke: "#0F62FE", strokeWidth: 1.5 },
            data: { connectionType: "ethernet", protocol: "", port: "", encrypted: false },
          },
          eds,
        ),
      );
      setTimeout(commitHistory, 50);
    },
    [setEdges, commitHistory],
  );

  // ─── Node interactions ─────────────────────────────────────────────────

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleNodeDragStop = useCallback(() => {
    commitHistory();
  }, [commitHistory]);

  const handleNodesDelete = useCallback(() => {
    setTimeout(commitHistory, 50);
  }, [commitHistory]);

  const handleEdgesDelete = useCallback(() => {
    setTimeout(commitHistory, 50);
  }, [commitHistory]);

  // ─── Edge click → edit ─────────────────────────────────────────────────

  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setEditEdge(edge);
  }, []);

  // ─── Context menu ──────────────────────────────────────────────────────

  const handleNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
  }, []);

  useEffect(() => {
    const close = () => setCtxMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  // ─── Node update (silent — no immediate history push) ───────────────────

  const handleNodeUpdate = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data } : n)));

      // noCreate 모드: DFD 노드 수정 → 자산 등록(HW) DB에도 반영
      if (noCreate && nodeId && !nodeId.startsWith("zone-") && !nodeId.startsWith("node-")) {
        const patchData: Record<string, string | null> = {};
        if (data.label !== undefined) patchData.name = (data.label as string) || null;
        if (data.ipAddress !== undefined) patchData.ipAddress = (data.ipAddress as string) || null;
        if (data.zone !== undefined) patchData.zone = (data.zone as string) || null;
        if (Object.keys(patchData).length > 0) {
          fetch(`/api/projects/${projectId}/hardware/${nodeId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patchData),
          }).catch(() => {}); // non-blocking
        }
      }
    },
    [setNodes, noCreate, projectId],
  );

  // ─── Edge edit save ────────────────────────────────────────────────────

  const handleEdgeEditSave = useCallback(
    (edgeId: string, data: Record<string, unknown>) => {
      setEdges((eds) =>
        eds.map((e) => {
          if (e.id !== edgeId) return e;
          const ct = data.connectionType as string;
          return {
            ...e,
            label: (data.label as string) || undefined,
            data,
            style: getEdgeStyle(data),
            animated: ct === "wireless" || !!data.encrypted,
          };
        }),
      );
      setTimeout(commitHistory, 50);
    },
    [setEdges, commitHistory],
  );

  const handleEdgeDelete = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      setTimeout(commitHistory, 50);
    },
    [setEdges, commitHistory],
  );

  // ─── Add node ──────────────────────────────────────────────────────────

  const handleAddNode = useCallback(() => {
    const id = `node-${Date.now()}`;
    const newNode: Node = {
      id,
      type: "hardware",
      position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
      zIndex: 10,
      data: {
        label: tx(locale, "New Device", "새 장비", "新しいデバイス"),
        hwType: "OTHER_DEVICE",
        zone: "",
        ipAddress: "",
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setTimeout(commitHistory, 50);
  }, [locale, setNodes, commitHistory]);

  const handleAddZone = useCallback(() => {
    const id = `zone-${Date.now()}`;
    const newZone: Node = {
      id,
      type: "zone",
      position: { x: 50 + Math.random() * 100, y: 50 + Math.random() * 100 },
      zIndex: -1,
      style: { width: 350, height: 250 },
      data: {
        label: tx(locale, "New Zone", "새 구역", "新しいゾーン"),
        hwType: "ZONE",
        zone: "",
        trustLevel: "trust",
      },
    };
    setNodes((nds) => [...nds, newZone]);
    setTimeout(commitHistory, 50);
  }, [locale, setNodes, commitHistory]);

  // ─── Duplicate / Delete node (context menu) ────────────────────────────

  const handleDuplicateNode = useCallback(
    (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;
      const copy: Node = {
        ...JSON.parse(JSON.stringify(node)),
        id: `node-${Date.now()}`,
        position: { x: node.position.x + 30, y: node.position.y + 30 },
        selected: false,
      };
      setNodes((nds) => [...nds, copy]);
      setTimeout(commitHistory, 50);
    },
    [setNodes, commitHistory],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setTimeout(commitHistory, 50);
    },
    [setNodes, setEdges, commitHistory],
  );

  // ─── Auto-layout with dagre ────────────────────────────────────────────

  const handleAutoLayout = useCallback(() => {
    const { nodes: layoutNodes, edges: layoutEdges } = getDagreLayout(
      nodesRef.current,
      edgesRef.current,
    );
    setNodes(layoutNodes);
    setEdges(layoutEdges);
    setTimeout(commitHistory, 50);
    setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 100);
  }, [setNodes, setEdges, commitHistory, fitView]);

  // ─── Export PNG ────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    const viewport = flowWrapperRef.current?.querySelector(".react-flow__viewport") as HTMLElement;
    if (!viewport) return;
    try {
      const dataUrl = await toPng(viewport, {
        backgroundColor: "#ffffff",
        quality: 0.95,
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `dfd-${projectId}.png`;
      link.click();
    } catch {
      // export failed silently
    }
  }, [projectId]);

  // Edge highlighting: when a node is selected, dim unrelated edges (Dragos/ServiceNow pattern)
  const styledEdges = useMemo(() => {
    return edges.map((e) => {
      const baseStyle = e.style || getEdgeStyle(e.data as Record<string, unknown> | undefined);
      const isRelated = selectedNodeId && (e.source === selectedNodeId || e.target === selectedNodeId);
      const dimmed = selectedNodeId && !isRelated;
      // Only show labels on selected node's edges to avoid label clutter
      const showLabel = isRelated;
      const labelText = showLabel
        ? (e.label || ((e.data as Record<string, unknown>)?.connectionType as string)?.toUpperCase() || undefined)
        : undefined;
      return {
        ...e,
        style: {
          ...baseStyle,
          opacity: dimmed ? 0.08 : selectedNodeId ? (isRelated ? 1 : 0.08) : 0.6,
          strokeWidth: isRelated ? 3 : (baseStyle.strokeWidth ?? 1.5),
          transition: "opacity 0.3s, stroke-width 0.3s",
        },
        label: labelText,
        labelStyle: labelText ? { fontSize: 9, fontWeight: 700, fill: baseStyle.stroke || "#0F62FE", letterSpacing: "0.5px" } : undefined,
        labelBgStyle: labelText ? { fill: "white", fillOpacity: 0.92, rx: 4, ry: 4 } : undefined,
        labelBgPadding: labelText ? [4, 6] as [number, number] : undefined,
      };
    });
  }, [edges, selectedNodeId]);

  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId) ?? null
    : null;

  // ─── Loading ───────────────────────────────────────────────────────────

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-6 w-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Render
  // ═════════════════════════════════════════════════════════════════════════

  return (
    <div ref={flowWrapperRef} className="h-full w-full relative flex">
      <div className={cn("flex-1 h-full relative transition-all", selectedNode && "mr-[320px]")}>
      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        onNodesChange={readOnly ? undefined : onNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        onConnect={readOnly ? undefined : handleConnect}
        onNodeClick={readOnly ? undefined : handleNodeClick}
        onPaneClick={readOnly ? undefined : handlePaneClick}
        onEdgeClick={readOnly ? undefined : handleEdgeClick}
        onNodeContextMenu={readOnly ? undefined : handleNodeContextMenu}
        onNodeDragStop={readOnly ? undefined : handleNodeDragStop}
        onNodesDelete={readOnly || noCreate ? undefined : handleNodesDelete}
        onEdgesDelete={readOnly ? undefined : handleEdgesDelete}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2}
        deleteKeyCode={readOnly || noCreate ? [] : ["Backspace", "Delete"]}
        defaultEdgeOptions={{
          type: "smoothstep",
          animated: false,
          style: { stroke: "#0F62FE", strokeWidth: 1.5 },
          interactionWidth: 20,
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="#D4D4D8" className="!bg-[#FAFBFC]" />
        <Controls
          showInteractive={false}
          className="!bg-white !border-border !shadow-sm !rounded-[6px]"
        />
        <MiniMap
          className="!bg-white !border-border !shadow-sm !rounded-[6px]"
          nodeColor={(n) => (n.type === "zone" ? "transparent" : "#0F62FE")}
          maskColor="rgba(0,0,0,0.08)"
          style={{ height: 120, width: 180 }}
          pannable
          zoomable
        />

        {/* ─── Empty State ─────────────────────────────────────────── */}
        {nodes.length === 0 && (
          <Panel position="top-center" className="pointer-events-auto mt-16">
            <div className="rounded-[12px] bg-white border border-border shadow-lg p-6 max-w-sm text-center">
              <div className="flex items-center justify-center h-12 w-12 rounded-full bg-brand-lighter mx-auto mb-3">
                <Plus size={20} className="text-brand" />
              </div>
              <h3 className="text-body-sm font-semibold text-text mb-1">
                {tx(locale, "DFD Diagram", "DFD 다이어그램", "DFD(データフロー図)")}
              </h3>
              <p className="text-body-xs text-text-tertiary mb-4">
                {noCreate
                  ? tx(locale,
                    "Use 'Regenerate DFD' to create the diagram from registered assets.",
                    "상단의 'DFD 재생성' 버튼으로 등록된 자산 기반 다이어그램을 생성하세요.",
                    "上部の「DFD再生成」ボタンで登録資産からダイアグラムを生成してください。")
                  : tx(locale,
                    "The diagram will be auto-generated after asset input. You can also add nodes manually with the + button above.",
                    "자산 입력이 완료되면 다이어그램이 자동으로 생성됩니다. 상단 + 버튼으로 노드를 직접 추가할 수도 있습니다.",
                    "資産入力が完了するとダイアグラムが自動生成されます。上部の+ボタンでノードを手動追加することもできます。")}
              </p>
              {!noCreate && (
                <Button size="sm" variant="outline" onClick={handleAddNode}>
                  <Plus size={13} />
                  {tx(locale, "Add Node", "노드 추가", "ノード追加")}
                </Button>
              )}
            </div>
          </Panel>
        )}

        {/* ─── Toolbar ─────────────────────────────────────────────── */}
        {!readOnly && <Panel position="top-right" className="flex items-center gap-1 flex-wrap">
          {/* Add Node/Zone — noCreate일 때 숨김 */}
          {!noCreate && (
            <>
              <ToolbarBtn onClick={handleAddNode} title={tx(locale, "Add Node", "노드 추가", "ノード追加")}>
                <Plus size={13} /> {tx(locale, "Device", "장비", "デバイス")}
              </ToolbarBtn>
              <ToolbarBtn onClick={handleAddZone} title={tx(locale, "Add Zone", "구역 추가", "ゾーン追加")}>
                <Plus size={13} /> {tx(locale, "Zone", "구역", "ゾーン")}
              </ToolbarBtn>
            </>
          )}

          <ToolbarSep />

          {/* Layout & View */}
          <ToolbarBtn onClick={() => fitView({ padding: 0.15, duration: 400 })} title={tx(locale, "Fit View", "전체 보기", "全体表示")}>
            <Maximize2 size={13} />
          </ToolbarBtn>
          <ToolbarBtn onClick={handleAutoLayout} title={tx(locale, "Auto Layout", "자동 배치", "自動レイアウト")}>
            <LayoutDashboard size={13} />
          </ToolbarBtn>
          <ToolbarBtn onClick={handleExport} title={tx(locale, "Export PNG", "PNG 내보내기", "PNG出力")}>
            <Download size={13} />
          </ToolbarBtn>

          <ToolbarSep />

          {/* Undo / Redo */}
          <ToolbarBtn onClick={handleUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            <Undo2 size={13} />
          </ToolbarBtn>
          <ToolbarBtn onClick={handleRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">
            <Redo2 size={13} />
          </ToolbarBtn>

          <ToolbarSep />

          {/* Save */}
          <Button
            size="sm"
            variant="primary"
            onClick={handleSave}
            loading={saving}
            className="h-7 text-[11px] relative"
          >
            {isDirty && !saving && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-safety-elevated" />
            )}
            <Save size={13} />
            {tx(locale, "Save", "저장", "保存")}
          </Button>
        </Panel>}

        {/* ─── Status bar ──────────────────────────────────────────── */}
        <Panel position="bottom-left">
          <div className="flex items-center gap-3 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-[6px] border border-border shadow-sm text-[11px] text-text-tertiary select-none">
            <span>{nodes.filter((n) => n.type === "hardware").length} {tx(locale, "nodes", "노드", "ノード")}</span>
            <span className="text-border">|</span>
            <span>{edges.length} {tx(locale, "edges", "연결", "エッジ")}</span>
            {isDirty && (
              <>
                <span className="text-border">|</span>
                <span className="text-safety-elevated font-medium animate-pulse">
                  {tx(locale, "● Unsaved", "● 미저장", "● 未保存")}
                </span>
              </>
            )}
          </div>
        </Panel>
      </ReactFlow>
      </div>{/* end flex-1 canvas wrapper */}

      {/* ─── Context Menu ──────────────────────────────────────────────── */}
      {ctxMenu && (
        <div
          className="fixed z-50 bg-white border border-border rounded-[6px] shadow-lg py-1 min-w-[150px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <CtxMenuItem
            icon={<Pencil size={13} />}
            label={tx(locale, "Edit", "편집", "編集")}
            onClick={() => {
              setSelectedNodeId(ctxMenu.nodeId);
              setCtxMenu(null);
            }}
          />
          {!noCreate && (
            <>
              <CtxMenuItem
                icon={<Copy size={13} />}
                label={tx(locale, "Duplicate", "복제", "複製")}
                onClick={() => {
                  handleDuplicateNode(ctxMenu.nodeId);
                  setCtxMenu(null);
                }}
              />
              <div className="my-1 border-t border-border" />
              <CtxMenuItem
                icon={<Trash2 size={13} />}
                label={tx(locale, "Delete", "삭제", "削除")}
                danger
                onClick={() => {
                  handleDeleteNode(ctxMenu.nodeId);
                  setCtxMenu(null);
                }}
              />
            </>
          )}
        </div>
      )}

      {/* ─── Sidebar ───────────────────────────────────────────────────── */}
      {selectedNode && (
        <div className="absolute right-0 top-0 bottom-0 w-[320px] z-10 border-l border-border shadow-lg">
          <DfdSidebar
            node={selectedNode}
            edges={edges}
            nodes={nodes}
            onClose={() => setSelectedNodeId(null)}
            onUpdateNode={handleNodeUpdate}
            onDeleteNode={noCreate ? () => {} : handleDeleteNode}
            hideDelete={noCreate}
            onCommitHistory={commitHistory}
          />
        </div>
      )}

      {/* ─── Edge Edit Dialog ──────────────────────────────────────────── */}
      <EdgeEditDialog
        edge={editEdge}
        open={!!editEdge}
        onClose={() => setEditEdge(null)}
        onSave={handleEdgeEditSave}
        onDelete={handleEdgeDelete}
      />
    </div>
  );
}

// ─── Toolbar sub-components ─────────────────────────────────────────────────

function ToolbarBtn({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex items-center gap-1 h-7 px-2.5 text-[11px] font-medium rounded-lg border border-border bg-white text-text-secondary",
        "hover:bg-surface-secondary hover:text-text transition-colors",
        "disabled:opacity-30 disabled:pointer-events-none",
      )}
    >
      {children}
    </button>
  );
}

function ToolbarSep() {
  return <div className="w-px h-5 bg-border mx-0.5" />;
}

function CtxMenuItem({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full px-3 py-1.5 text-[12px] transition-colors text-left",
        danger
          ? "text-safety-high hover:bg-safety-high/10"
          : "text-text hover:bg-surface-secondary",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
