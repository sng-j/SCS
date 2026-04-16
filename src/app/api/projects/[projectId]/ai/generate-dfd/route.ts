import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError } from "@/lib/auth-helpers";
import { logAction } from "@/lib/action-logger";
import { MARITIME_ZONES } from "@/lib/constants";
import { normalizeZoneId } from "@/lib/diagram-parser";
import dagre from "@dagrejs/dagre";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

// ─── Node/Edge types for React Flow ─────────────────────────────────────────

interface RFNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  parentId?: string;
  extent?: string;
  style?: Record<string, string | number>;
}

interface RFEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  animated?: boolean;
  label?: string;
  data?: Record<string, unknown>;
  style?: Record<string, string | number>;
}

// ─── Layout constants ───────────────────────────────────────────────────────

const NODE_WIDTH = 210;
const NODE_HEIGHT = 100;
const ZONE_PADDING_X = 60;
const ZONE_PADDING_Y = 70;
const ZONE_HEADER_HEIGHT = 44;
const INTER_ZONE_GAP = 100;

// ─── Maritime zone ordering (higher trust = lower index) ────────────────────

const ZONE_ORDER: Record<string, number> = {
  // Maritime system zones
  shore: 0, admin: 1, communication: 2, navigation: 3, cargo: 4, propulsion: 5, safety: 6,
};

/** Get zone order — supports Lv-based, system-based, and custom zones */
function getZoneOrder(zoneName: string): number {
  // Direct match
  if (ZONE_ORDER[zoneName] !== undefined) return ZONE_ORDER[zoneName];
  // Lv-based (higher Lv = lower number = top of diagram)
  const lvMatch = zoneName.match(/Lv\s*(\d+\.?\d*)/i);
  if (lvMatch) return 10 - parseFloat(lvMatch[1]); // Lv4=6, Lv3.5=6.5, Lv3=7, Lv2=8, Lv1=9
  return 50; // Custom zones at bottom
}

const ZONE_COLORS: Record<string, { border: string; bg: string }> = {
  navigation: { border: "#0F62FE", bg: "rgba(15, 98, 254, 0.06)" },
  propulsion: { border: "#DA1E28", bg: "rgba(218, 30, 40, 0.06)" },
  safety: { border: "#EB6200", bg: "rgba(235, 98, 0, 0.06)" },
  cargo: { border: "#F1C21B", bg: "rgba(241, 194, 27, 0.07)" },
  communication: { border: "#24A148", bg: "rgba(36, 161, 72, 0.06)" },
  admin: { border: "#8D8D8D", bg: "rgba(141, 141, 141, 0.06)" },
  shore: { border: "#393939", bg: "rgba(57, 57, 57, 0.06)" },
};

const LV_COLORS: Record<string, { border: string; bg: string }> = {
  "4":   { border: "#0F62FE", bg: "rgba(15, 98, 254, 0.05)" },
  "3.5": { border: "#24A148", bg: "rgba(36, 161, 72, 0.05)" },
  "3":   { border: "#8A3FFC", bg: "rgba(138, 63, 252, 0.05)" },
  "2":   { border: "#EB6200", bg: "rgba(235, 98, 0, 0.05)" },
  "1":   { border: "#DA1E28", bg: "rgba(218, 30, 40, 0.05)" },
};

function getZoneColor(zoneName: string): { border: string; bg: string } {
  if (ZONE_COLORS[zoneName]) return ZONE_COLORS[zoneName];
  const lvMatch = zoneName.match(/Lv\s*(\d+\.?\d*)/i);
  if (lvMatch && LV_COLORS[lvMatch[1]]) return LV_COLORS[lvMatch[1]];
  return { border: "#8D8D8D", bg: "rgba(141, 141, 141, 0.06)" };
}

// ─── Connection inference rules ─────────────────────────────────────────────

function inferConnectionType(
  sourceType: string,
  targetType: string,
  sameZone: boolean,
): { connectionType: string; protocol: string; encrypted: boolean } {
  // PLC/SENSOR → typically serial/modbus
  if (
    (sourceType === "PLC" && targetType === "SENSOR") ||
    (sourceType === "SENSOR" && targetType === "PLC")
  ) {
    return { connectionType: "serial", protocol: "Modbus RTU", encrypted: false };
  }

  // PLC ↔ PLC or PLC ↔ SERVER
  if (
    (sourceType === "PLC" || targetType === "PLC") &&
    (sourceType === "SERVER" || targetType === "SERVER")
  ) {
    return { connectionType: "ethernet", protocol: "Modbus TCP", encrypted: false };
  }

  // Cross-zone connections through network devices
  if (!sameZone) {
    return { connectionType: "ethernet", protocol: "TCP/IP", encrypted: true };
  }

  // NETWORK_DEVICE connections
  if (sourceType === "NETWORK_DEVICE" || targetType === "NETWORK_DEVICE") {
    return { connectionType: "ethernet", protocol: "TCP/IP", encrypted: false };
  }

  // Default intra-zone
  return { connectionType: "ethernet", protocol: "TCP/IP", encrypted: false };
}

// ─── Dagre layout engine ────────────────────────────────────────────────────

function layoutWithDagre(
  hwNodes: RFNode[],
  rawEdges: RFEdge[],
): { nodes: RFNode[]; edges: RFEdge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 60,
    ranksep: 80,
    marginx: 40,
    marginy: 40,
  });

  for (const node of hwNodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const edge of rawEdges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const positionedNodes = hwNodes.map((node) => {
    const dagreNode = g.node(node.id);
    return {
      ...node,
      position: {
        x: dagreNode.x - NODE_WIDTH / 2,
        y: dagreNode.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: positionedNodes, edges: rawEdges };
}

// ─── Zone-aware layout: group by zone, dagre within each, stack zones ───────

function zoneAwareLayout(
  hwNodes: RFNode[],
  rawEdges: RFEdge[],
): { nodes: RFNode[]; edges: RFEdge[] } {
  // Group nodes by zone
  const zoneMap = new Map<string, RFNode[]>();
  for (const node of hwNodes) {
    const zone = (node.data.zone as string) || "unassigned";
    if (!zoneMap.has(zone)) zoneMap.set(zone, []);
    zoneMap.get(zone)!.push(node);
  }

  // Sort zones by maritime hierarchy
  const sortedZones = Array.from(zoneMap.keys()).sort((a, b) => {
    return getZoneOrder(a) - getZoneOrder(b);
  });

  const allNodes: RFNode[] = [];
  const allEdges: RFEdge[] = [...rawEdges];
  let globalOffsetY = 0;
  let maxZoneWidth = 800; // minimum width for band layout

  for (const zoneName of sortedZones) {
    const zoneNodes = zoneMap.get(zoneName)!;

    // Get intra-zone edges for dagre layout
    const zoneNodeIds = new Set(zoneNodes.map((n) => n.id));
    const intraEdges = rawEdges.filter(
      (e) => zoneNodeIds.has(e.source) && zoneNodeIds.has(e.target),
    );

    // Layout nodes within zone using dagre — dynamic spacing based on node count
    const nodeCount = zoneNodes.length;
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
      rankdir: nodeCount > 15 ? "TB" : "LR", // switch to TB for dense zones
      nodesep: nodeCount > 30 ? 30 : nodeCount > 15 ? 40 : 50,
      ranksep: nodeCount > 30 ? 50 : nodeCount > 15 ? 60 : 70,
      marginx: 20,
      marginy: 20,
    });

    for (const node of zoneNodes) {
      g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }
    for (const edge of intraEdges) {
      g.setEdge(edge.source, edge.target);
    }

    dagre.layout(g);

    // Calculate zone bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of zoneNodes) {
      const dn = g.node(node.id);
      const nx = dn.x - NODE_WIDTH / 2;
      const ny = dn.y - NODE_HEIGHT / 2;
      minX = Math.min(minX, nx);
      minY = Math.min(minY, ny);
      maxX = Math.max(maxX, nx + NODE_WIDTH);
      maxY = Math.max(maxY, ny + NODE_HEIGHT);
    }

    const contentWidth = (maxX - minX) + ZONE_PADDING_X * 2;
    const zoneHeight = (maxY - minY) + ZONE_PADDING_Y * 2 + ZONE_HEADER_HEIGHT;
    // Track max width for full-width band layout
    maxZoneWidth = Math.max(maxZoneWidth, contentWidth);

    // Add zone background node (width will be normalized in second pass)
    const zoneColor = getZoneColor(zoneName);
    const zoneDefn = MARITIME_ZONES.find((z) => z.id === zoneName);
    allNodes.push({
      id: `zone-${zoneName}`,
      type: "zone",
      position: { x: 0, y: globalOffsetY },
      data: {
        label: zoneName,
        hwType: "ZONE",
        zone: zoneName,
        trustLevel: zoneDefn?.trustLevel || "trust",
      },
      style: {
        width: contentWidth, // will be normalized to maxZoneWidth
        height: zoneHeight,
        backgroundColor: zoneColor.bg,
        borderRadius: 12,
        border: `1.5px dashed ${zoneColor.border}40`,
      },
    });

    // Position hardware nodes as children of zone node (relative coordinates)
    // Position hardware nodes with absolute coordinates (no parentId — avoids nesting issues)
    for (const node of zoneNodes) {
      const dn = g.node(node.id);
      allNodes.push({
        ...node,
        type: "hardware",
        position: {
          x: (dn.x - NODE_WIDTH / 2) - minX + ZONE_PADDING_X,
          y: (dn.y - NODE_HEIGHT / 2) - minY + ZONE_PADDING_Y + ZONE_HEADER_HEIGHT + globalOffsetY,
        },
      });
    }

    globalOffsetY += zoneHeight + INTER_ZONE_GAP;
  }

  // Second pass: normalize all zone widths to maxZoneWidth (horizontal band layout)
  for (const node of allNodes) {
    if (node.type === "zone" && node.style) {
      node.style.width = maxZoneWidth;
    }
  }

  return { nodes: allNodes, edges: allEdges };
}

// ─── POST: Generate DFD from hardware inventory ─────────────────────────────

export async function POST(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  // Support optional equipmentId filter
  let eqId: string | null = null;
  try {
    const body = await _request.json();
    eqId = body.equipmentId || null;
  } catch { /* no body = project-level */ }

  // Fetch hardware (filtered by equipmentId if provided)
  const hwWhere: Record<string, unknown> = { projectId };
  if (eqId) hwWhere.equipmentId = eqId;

  const hardware = await prisma.hardware.findMany({
    where: hwWhere,
    include: { software: { select: { id: true, name: true, version: true, swType: true } } },
    orderBy: [{ zone: "asc" }, { type: "asc" }, { name: "asc" }],
  });

  if (hardware.length === 0) {
    return apiError("No hardware registered. Add hardware before generating a DFD.", 400);
  }

  // ── Build nodes ───────────────────────────────────────────────────────────

  const hwNodes: RFNode[] = hardware.map((hw) => ({
    id: hw.id,
    type: "hardware",
    position: { x: 0, y: 0 }, // will be set by dagre
    data: {
      label: hw.name,
      hwType: hw.type,
      manufacturer: hw.manufacturer ?? undefined,
      model: hw.model ?? undefined,
      ipAddress: hw.ipAddress ?? undefined,
      zone: hw.zone ?? undefined,
      software: hw.software.map((sw) => ({
        name: sw.name,
        version: sw.version,
        swType: sw.swType,
      })),
    },
  }));

  // ── Build edges with smart inference ──────────────────────────────────────

  const edges: RFEdge[] = [];
  const edgeSet = new Set<string>(); // prevent duplicates

  const addEdge = (
    sourceId: string,
    targetId: string,
    extra?: Partial<RFEdge>,
  ) => {
    const key = [sourceId, targetId].sort().join("-");
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push({
      id: `e-${sourceId.slice(-6)}-${targetId.slice(-6)}`,
      source: sourceId,
      target: targetId,
      type: "smoothstep",
      ...extra,
    });
  };

  // ── Rule 0: 수동 연결(NetworkConnection)을 먼저 적용 ──
  // 사용자가 직접 입력한 연결은 자동 생성보다 우선. edgeSet에 등록되므로 자동 규칙이 중복 생성하지 않음.
  const manualConns = await prisma.networkConnection.findMany({
    where: { projectId, deletedAt: null },
  });
  const hwIdSet = new Set(hardware.map((h) => h.id));
  for (const mc of manualConns) {
    if (!hwIdSet.has(mc.fromHwId) || !hwIdSet.has(mc.toHwId)) continue;
    addEdge(mc.fromHwId, mc.toHwId, {
      data: { connectionType: mc.medium, protocol: mc.protocol || "", encrypted: mc.encrypted },
      style: { stroke: "#0F62FE", strokeWidth: 1.5 },
    });
  }

  // Rule 1: NETWORK_DEVICE connects to all other hardware in same zone
  const networkDevices = hardware.filter((hw) => hw.type === "NETWORK_DEVICE");
  for (const nd of networkDevices) {
    const ndZone = nd.zone || "unassigned";
    const sameZoneHw = hardware.filter(
      (hw) => hw.id !== nd.id && (hw.zone || "unassigned") === ndZone,
    );
    for (const hw of sameZoneHw) {
      const connInfo = inferConnectionType(nd.type, hw.type, true);
      addEdge(nd.id, hw.id, {
        data: connInfo,
        style: { stroke: "#0F62FE", strokeWidth: 1.5 },
      });
    }
  }

  // Rule 2: Cross-zone conduits between NETWORK_DEVICE nodes
  for (let i = 0; i < networkDevices.length; i++) {
    for (let j = i + 1; j < networkDevices.length; j++) {
      const nd1 = networkDevices[i];
      const nd2 = networkDevices[j];
      if ((nd1.zone || "unassigned") !== (nd2.zone || "unassigned")) {
        const connInfo = inferConnectionType(nd1.type, nd2.type, false);
        addEdge(nd1.id, nd2.id, {
          animated: true,
          label: "Conduit",
          data: connInfo,
          style: { stroke: "#DA1E28", strokeWidth: 2, strokeDasharray: "6,4" },
        });
      }
    }
  }

  // Rule 3: Zones without NETWORK_DEVICE — connect PLC→SENSOR pairs, then chain remaining
  const zoneGroups = new Map<string, typeof hardware>();
  for (const hw of hardware) {
    const z = hw.zone || "unassigned";
    if (!zoneGroups.has(z)) zoneGroups.set(z, []);
    zoneGroups.get(z)!.push(hw);
  }

  for (const [, zoneHw] of zoneGroups) {
    const hasNetDev = zoneHw.some((h) => h.type === "NETWORK_DEVICE");
    if (hasNetDev || zoneHw.length <= 1) continue;

    // PLC ↔ SENSOR pairing
    const plcs = zoneHw.filter((h) => h.type === "PLC");
    const sensors = zoneHw.filter((h) => h.type === "SENSOR");
    const paired = new Set<string>();

    for (const plc of plcs) {
      for (const sensor of sensors) {
        if (!paired.has(sensor.id)) {
          const connInfo = inferConnectionType(plc.type, sensor.type, true);
          addEdge(plc.id, sensor.id, {
            data: connInfo,
            style: { stroke: "#94a3b8", strokeWidth: 1 },
          });
          paired.add(sensor.id);
          break; // one sensor per PLC for now
        }
      }
    }

    // Chain remaining unconnected nodes
    const connected = new Set<string>();
    for (const e of edges) {
      const zoneIds = new Set(zoneHw.map((h) => h.id));
      if (zoneIds.has(e.source)) connected.add(e.source);
      if (zoneIds.has(e.target)) connected.add(e.target);
    }

    const unconnected = zoneHw.filter((h) => !connected.has(h.id));
    if (unconnected.length > 0) {
      // Connect first unconnected to first connected (or chain all)
      const anchor = zoneHw.find((h) => connected.has(h.id)) || unconnected[0];
      for (const hw of unconnected) {
        if (hw.id === anchor.id) continue;
        const connInfo = inferConnectionType(anchor.type, hw.type, true);
        addEdge(anchor.id, hw.id, {
          data: connInfo,
          style: { stroke: "#94a3b8", strokeWidth: 1 },
        });
      }
    }
  }

  // Rule 4: SERVER ↔ SERVER connections across zones (management links)
  const servers = hardware.filter((h) => h.type === "SERVER");
  for (let i = 0; i < servers.length; i++) {
    for (let j = i + 1; j < servers.length; j++) {
      if ((servers[i].zone || "unassigned") !== (servers[j].zone || "unassigned")) {
        // Only if no network device conduit exists between these zones
        const z1 = servers[i].zone || "unassigned";
        const z2 = servers[j].zone || "unassigned";
        const hasConduit = edges.some(
          (e) =>
            e.animated &&
            networkDevices.some(
              (nd) =>
                (nd.zone || "unassigned") === z1 &&
                (e.source === nd.id || e.target === nd.id),
            ) &&
            networkDevices.some(
              (nd) =>
                (nd.zone || "unassigned") === z2 &&
                (e.source === nd.id || e.target === nd.id),
            ),
        );
        if (!hasConduit) {
          addEdge(servers[i].id, servers[j].id, {
            animated: true,
            data: { connectionType: "ethernet", protocol: "TCP/IP", encrypted: true },
            style: { stroke: "#8D8D8D", strokeWidth: 1, strokeDasharray: "4,4" },
          });
        }
      }
    }
  }

  // ── Apply zone-aware dagre layout ─────────────────────────────────────────

  const hasZones = hardware.some((h) => h.zone);
  const { nodes: layoutNodes, edges: layoutEdges } = hasZones
    ? zoneAwareLayout(hwNodes, edges)
    : layoutWithDagre(hwNodes, edges);

  // ── Persist ───────────────────────────────────────────────────────────────

  const dfdData = {
    nodes: layoutNodes,
    edges: layoutEdges,
    generatedAt: new Date().toISOString(),
    hardwareCount: hardware.length,
    zoneCount: zoneGroups.size,
  };

  const dfdJson = JSON.stringify(dfdData);

  const findWhere = eqId ? { equipmentId: eqId } : { projectId, equipmentId: null };
  const existing = await prisma.dfdDiagram.findFirst({ where: findWhere });

  let dfdDiagram;
  if (existing) {
    dfdDiagram = await prisma.dfdDiagram.update({
      where: { id: existing.id },
      data: {
        data: dfdJson,
        source: "AI",
        version: { increment: 1 },
      },
    });
  } else {
    dfdDiagram = await prisma.dfdDiagram.create({
      data: {
        projectId,
        ...(eqId ? { equipmentId: eqId } : {}),
        data: dfdJson,
        source: "AI",
        version: 1,
      },
    });
  }

  await prisma.dfdLog.create({
    data: {
      diagramId: dfdDiagram.id,
      action: "AI_GENERATED",
      source: "AI",
      snapshot: dfdJson,
    },
  });

  // Sync connections to NetworkConnection table
  try {
    // Delete old connections for this project
    await prisma.networkConnection.deleteMany({ where: { projectId } });

    // Build HW ID lookup from edges
    const hwIdSet = new Set(hardware.map((h) => h.id));
    const connData = edges
      .filter((e) => hwIdSet.has(e.source) && hwIdSet.has(e.target))
      .map((e) => ({
        projectId,
        fromHwId: e.source,
        toHwId: e.target,
        medium: (e.data as Record<string, unknown>)?.connectionType as string || "ethernet",
        protocol: (e.data as Record<string, unknown>)?.protocol as string || null,
        encrypted: !!((e.data as Record<string, unknown>)?.encrypted),
      }));

    if (connData.length > 0) {
      await prisma.networkConnection.createMany({ data: connData });
    }
  } catch {
    // Non-blocking — connection sync failure shouldn't break DFD generation
  }

  logAction(user.id, "DFD_GENERATE", { entity: "dfd", projectId }).catch(() => {});

  return NextResponse.json({
    id: dfdDiagram.id,
    projectId: dfdDiagram.projectId,
    source: dfdDiagram.source,
    version: dfdDiagram.version,
    data: dfdData,
    createdAt: dfdDiagram.createdAt,
    updatedAt: dfdDiagram.updatedAt,
  });
}
