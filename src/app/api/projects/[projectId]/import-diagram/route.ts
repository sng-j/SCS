import { NextResponse } from "next/server";
import { writeFileSync, unlinkSync } from "fs";
import path from "path";
import os from "os";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError } from "@/lib/auth-helpers";
import { safeError } from "@/lib/safe-log";
import { trackChange } from "@/lib/change-tracker";
import { logAction } from "@/lib/action-logger";
import { parseDiagram, parseStep1_OCR, parseStep2_Cleanup, parseStep3_Connections, normalizeZoneId, type DiagramDevice, type DiagramConnection, type DeviceCandidate, type OcrItem } from "@/lib/diagram-parser";
import { inferE27Fields } from "@/lib/equipment-knowledge";
import dagre from "@dagrejs/dagre";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes for OCR + LLM processing

interface Params {
  params: Promise<{ projectId: string }>;
}

// ─── Dagre layout ────────────────────────────────────────────────────────────

function layoutNodes(
  nodes: { id: string; position: { x: number; y: number }; [k: string]: unknown }[],
  edges: { source: string; target: string; [k: string]: unknown }[],
) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 100, marginx: 30, marginy: 30 });
  for (const node of nodes) g.setNode(node.id, { width: 180, height: 90 });
  for (const edge of edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) g.setEdge(edge.source, edge.target);
  }
  dagre.layout(g);
  return nodes.map((node) => {
    const pos = g.node(node.id);
    return pos ? { ...node, position: { x: pos.x - 90, y: pos.y - 45 } } : node;
  });
}

// ─── POST /api/projects/[projectId]/import-diagram ───────────────────────────

export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "analyze";

  try {
    if (action === "analyze") {
      return await handleAnalyze(request, projectId);
    } else if (action === "step1_ocr") {
      return await handleStep1(request);
    } else if (action === "step2_cleanup") {
      return await handleStep2(request);
    } else if (action === "step3_connections") {
      return await handleStep3(request);
    } else if (action === "import") {
      return await handleImport(request, projectId, user.id);
    }
    return apiError("Invalid action", 400);
  } catch (err) {
    safeError("import-diagram", err);
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}

// ─── Step-by-step handlers (for progress UI) ────────────────────────────────

async function handleStep1(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return apiError("No file uploaded", 400);

  const ext = file.name.toLowerCase().split(".").pop();
  if (!["pdf", "png", "jpg", "jpeg", "bmp", "tiff"].includes(ext || "")) {
    return apiError("Unsupported file type", 400);
  }

  const tmpPath = path.join(os.tmpdir(), `diagram_${Date.now()}.${ext}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  writeFileSync(tmpPath, buffer);

  try {
    const result = await parseStep1_OCR(tmpPath);
    // Keep temp file path for next steps
    return NextResponse.json({
      ...result,
      tmpPath, // Client passes this back for step 2
    });
  } finally {
    // Don't delete yet — needed for step 2/3
  }
}

async function handleStep2(request: Request) {
  const body = await request.json();
  const { candidates } = body;
  if (!candidates) return apiError("candidates required", 400);

  const llmApiUrl = process.env.LLM_API_URL;
  const llmModel = process.env.LLM_MODEL;
  if (!llmApiUrl || !llmModel) return apiError("LLM configuration missing. Set LLM_API_URL and LLM_MODEL environment variables.", 500);

  const devices = await parseStep2_Cleanup(candidates as DeviceCandidate[], llmApiUrl, llmModel);
  return NextResponse.json({ devices });
}

async function handleStep3(request: Request) {
  const body = await request.json();
  const { devices, ocrItems } = body;
  if (!devices) return apiError("devices required", 400);

  const llmApiUrl = process.env.LLM_API_URL;
  const llmModel = process.env.LLM_MODEL;
  if (!llmApiUrl || !llmModel) return apiError("LLM configuration missing. Set LLM_API_URL and LLM_MODEL environment variables.", 500);

  const connections = await parseStep3_Connections(
    devices as DiagramDevice[],
    (ocrItems || []) as OcrItem[],
    llmApiUrl,
    llmModel,
  );
  return NextResponse.json({ connections });
}

// ─── Phase 1: Analyze (legacy — full pipeline) ──────────────────────────────

async function handleAnalyze(request: Request, projectId: string) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) return apiError("No file uploaded", 400);

  // Validate file type
  const ext = file.name.toLowerCase().split(".").pop();
  if (!["pdf", "png", "jpg", "jpeg", "bmp", "tiff"].includes(ext || "")) {
    return apiError("Unsupported file type. Use PDF, PNG, JPG, BMP, or TIFF.", 400);
  }

  // Save to temp file
  const tmpPath = path.join(os.tmpdir(), `diagram_${Date.now()}.${ext}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  writeFileSync(tmpPath, buffer);

  try {
    // Get LLM config from env (no hardcoded fallback)
    const llmApiUrl = process.env.LLM_API_URL;
    const llmModel = process.env.LLM_MODEL;
    if (!llmApiUrl || !llmModel) return apiError("LLM configuration missing. Set LLM_API_URL and LLM_MODEL environment variables.", 500);

    // Run the full pipeline
    const result = await parseDiagram(tmpPath, llmApiUrl, llmModel);

    return NextResponse.json({
      devices: result.devices,
      connections: result.connections,
      zones: result.zones,
      stats: {
        ocrItems: result.ocrItemCount,
        candidates: result.candidateCount,
        devices: result.devices.length,
        connections: result.connections.length,
      },
    });
  } finally {
    // Cleanup temp file
    try { unlinkSync(tmpPath); } catch {}
  }
}

// ─── Phase 2: Import ─────────────────────────────────────────────────────────

async function handleImport(request: Request, projectId: string, userId: string) {
  const body = await request.json();
  const { devices, connections, equipmentId } = body as { devices: DiagramDevice[]; connections?: DiagramConnection[]; equipmentId?: string };

  if (!devices || !Array.isArray(devices) || devices.length === 0) {
    return apiError("No devices to import", 400);
  }

  const validTypes = ["PLC", "SERVER", "SENSOR", "NETWORK_DEVICE", "PC", "OTHER_DEVICE"];

  // Check for existing duplicates
  const existingHw = await prisma.hardware.findMany({
    where: { projectId, ...(equipmentId ? { equipmentId } : {}) },
    select: { name: true },
  });
  const existingNames = new Set(existingHw.map((h) => h.name.toUpperCase()));

  const hwCreated: { id: string; name: string; hwType: string; zone: string; x: number; y: number }[] = [];
  let skipped = 0;

  // Create hardware in transaction
  await prisma.$transaction(async (tx) => {
    for (const device of devices) {
      if (existingNames.has(device.name.toUpperCase())) {
        skipped++;
        continue;
      }

      const hwType = validTypes.includes(device.hwType) ? device.hwType : "OTHER_DEVICE";

      // Keep original zone text from diagram (e.g., "Lv2 Area Supervisory Ctrl")
      const normalizedZone = device.zone || null;

      // Auto-infer E27 fields from device name
      const inferred = inferE27Fields(device.name, hwType);

      const hw = await tx.hardware.create({
        data: {
          projectId,
          equipmentId: equipmentId || null,
          name: device.name,
          type: hwType,
          zone: normalizedZone,
          category: device.category || null,
          identifier: device.id || null,
          manufacturer: inferred.manufacturer || null,
          purpose: inferred.purpose || null,
          physicalInterface: inferred.physicalInterface || null,
          commProtocols: inferred.commProtocols || null,
          sysSoftwareCategory: inferred.sysSoftwareCategory || null,
          location: inferred.location || null,
        },
      });

      hwCreated.push({
        id: hw.id,
        name: device.name,
        hwType,
        zone: device.zone,
        x: device.x || 0,
        y: device.y || 0,
      });
    }
  });

  // Track changes
  for (const hw of hwCreated) {
    trackChange({ projectId, entityType: "HARDWARE", entityId: hw.id, changeType: "CREATE", changedBy: userId }).catch(() => {});
  }

  // ── Generate DFD ────────────────────────────────────────────────────────

  if (hwCreated.length > 0) {
    // Use Dagre layout (no overlap guaranteed) instead of OCR coordinates
    const NODE_W = 220;
    const NODE_H = 80;

    // Group by zone
    const zoneGroups = new Map<string, typeof hwCreated>();
    for (const hw of hwCreated) {
      const z = hw.zone || "unassigned";
      if (!zoneGroups.has(z)) zoneGroups.set(z, []);
      zoneGroups.get(z)!.push(hw);
    }

    // Sort zones by Lv (higher Lv = top)
    const sortedZones = Array.from(zoneGroups.keys()).sort((a, b) => {
      const lvA = a.match(/Lv\s*(\d+\.?\d*)/i);
      const lvB = b.match(/Lv\s*(\d+\.?\d*)/i);
      const orderA = lvA ? 10 - parseFloat(lvA[1]) : 50;
      const orderB = lvB ? 10 - parseFloat(lvB[1]) : 50;
      return orderA - orderB;
    });

    // Zone colors
    const LV_COLORS: Record<string, { border: string; bg: string }> = {
      "4": { border: "#0F62FE", bg: "rgba(15, 98, 254, 0.05)" },
      "3.5": { border: "#24A148", bg: "rgba(36, 161, 72, 0.05)" },
      "3": { border: "#8A3FFC", bg: "rgba(138, 63, 252, 0.05)" },
      "2": { border: "#EB6200", bg: "rgba(235, 98, 0, 0.05)" },
      "1": { border: "#DA1E28", bg: "rgba(218, 30, 40, 0.05)" },
    };

    const dfdNodes: Record<string, unknown>[] = [];
    let globalY = 0;

    for (const zoneName of sortedZones) {
      const zoneHw = zoneGroups.get(zoneName)!;
      const lvMatch = zoneName.match(/Lv\s*(\d+\.?\d*)/i);
      const zoneColor = lvMatch && LV_COLORS[lvMatch[1]]
        ? LV_COLORS[lvMatch[1]]
        : { border: "#8D8D8D", bg: "rgba(141, 141, 141, 0.06)" };

      // Dagre layout within zone
      const g = new dagre.graphlib.Graph();
      g.setDefaultEdgeLabel(() => ({}));
      g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 80, marginx: 30, marginy: 30 });

      for (const hw of zoneHw) {
        g.setNode(hw.id, { width: NODE_W, height: NODE_H });
      }

      // Add intra-zone edges for layout
      if (connections) {
        const zoneIds = new Set(zoneHw.map((h) => h.name.toUpperCase()));
        const idMap = new Map(zoneHw.map((h) => [h.name.toUpperCase(), h.id]));
        for (const conn of connections) {
          const srcId = idMap.get(conn.from.toUpperCase());
          const tgtId = idMap.get(conn.to.toUpperCase());
          if (srcId && tgtId) g.setEdge(srcId, tgtId);
        }
      }

      dagre.layout(g);

      // Calculate zone bounding box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const hw of zoneHw) {
        const dn = g.node(hw.id);
        if (!dn) continue;
        minX = Math.min(minX, dn.x - NODE_W / 2);
        minY = Math.min(minY, dn.y - NODE_H / 2);
        maxX = Math.max(maxX, dn.x + NODE_W / 2);
        maxY = Math.max(maxY, dn.y + NODE_H / 2);
      }

      const zonePadX = 50, zonePadY = 60, headerH = 30;
      const zoneW = (maxX - minX) + zonePadX * 2;
      const zoneH = (maxY - minY) + zonePadY * 2 + headerH;

      // Zone background
      dfdNodes.push({
        id: `zone-${zoneName}`,
        type: "zone",
        position: { x: 0, y: globalY },
        zIndex: -1,
        style: {
          width: zoneW,
          height: zoneH,
          backgroundColor: zoneColor.bg,
          borderRadius: 12,
          border: `2px dashed ${zoneColor.border}`,
        },
        data: { label: zoneName, hwType: "ZONE", zone: zoneName },
      });

      // Hardware nodes (absolute positions)
      for (const hw of zoneHw) {
        const dn = g.node(hw.id);
        if (!dn) continue;
        dfdNodes.push({
          id: hw.id,
          type: "hardware",
          position: {
            x: (dn.x - NODE_W / 2) - minX + zonePadX,
            y: (dn.y - NODE_H / 2) - minY + zonePadY + headerH + globalY,
          },
          data: { label: hw.name, hwType: hw.hwType, zone: hw.zone },
        });
      }

      globalY += zoneH + 80;
    }

    // Build edges from LLM-extracted connections (or fallback)
    const dfdEdges: { id: string; source: string; target: string; type: string; animated: boolean; data: Record<string, unknown> }[] = [];
    const nameToId = new Map<string, string>();
    for (const hw of hwCreated) nameToId.set(hw.name.toUpperCase(), hw.id);

    if (connections && connections.length > 0) {
      // Use LLM-extracted connections
      let edgeIdx = 0;
      for (const conn of connections) {
        const srcId = nameToId.get(conn.from.toUpperCase());
        const tgtId = nameToId.get(conn.to.toUpperCase());
        if (srcId && tgtId && srcId !== tgtId) {
          dfdEdges.push({
            id: `diag-e-${edgeIdx++}`,
            source: srcId,
            target: tgtId,
            type: "smoothstep",
            animated: false,
            data: {
              connectionType: conn.type || "ethernet",
              ...(conn.type === "serial" ? { label: "Serial" } : {}),
            },
          });
        }
      }
    }

    // Fallback: if no LLM connections, use proximity-based
    if (dfdEdges.length === 0) {
      let edgeIdx = 0;
      const gateways = hwCreated.filter((h) => h.hwType === "NETWORK_DEVICE");
      if (gateways.length > 0) {
        const sortedGw = [...gateways].sort((a, b) => a.y - b.y);
        for (let i = 0; i < sortedGw.length - 1; i++) {
          dfdEdges.push({ id: `diag-e-${edgeIdx++}`, source: sortedGw[i].id, target: sortedGw[i + 1].id, type: "smoothstep", animated: false, data: { connectionType: "ethernet" } });
        }
        for (const hw of hwCreated) {
          if (hw.hwType === "NETWORK_DEVICE") continue;
          const nearest = gateways.reduce((p, c) => Math.abs(c.y - hw.y) < Math.abs(p.y - hw.y) ? c : p);
          dfdEdges.push({ id: `diag-e-${edgeIdx++}`, source: nearest.id, target: hw.id, type: "smoothstep", animated: false, data: { connectionType: "ethernet" } });
        }
      }
    }

    const dfdData = JSON.stringify({ nodes: dfdNodes, edges: dfdEdges });

    // Upsert DFD
    if (equipmentId) {
      await prisma.dfdDiagram.upsert({
        where: { equipmentId },
        create: { projectId, equipmentId, data: dfdData, source: "IMPORT" },
        update: { data: dfdData, source: "IMPORT", version: { increment: 1 } },
      });
    } else {
      const existing = await prisma.dfdDiagram.findFirst({
        where: { projectId, equipmentId: null },
      });
      if (existing) {
        await prisma.dfdDiagram.update({
          where: { id: existing.id },
          data: { data: dfdData, source: "IMPORT", version: { increment: 1 } },
        });
      } else {
        await prisma.dfdDiagram.create({
          data: { projectId, data: dfdData, source: "IMPORT" },
        });
      }
    }
  }

  // Summary
  const byType: Record<string, number> = {};
  for (const hw of hwCreated) byType[hw.hwType] = (byType[hw.hwType] || 0) + 1;

  logAction(userId, "DIAGRAM_IMPORT", { entity: "diagram", projectId, data: { deviceCount: hwCreated.length } }).catch(() => {});

  return NextResponse.json({
    created: { hardware: hwCreated.length },
    skipped,
    dfd: hwCreated.length > 0,
    summary: { byType },
  });
}
