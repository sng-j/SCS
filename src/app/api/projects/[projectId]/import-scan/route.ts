import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError } from "@/lib/auth-helpers";
import { safeError } from "@/lib/safe-log";
import { trackChange } from "@/lib/change-tracker";
import { logAction } from "@/lib/action-logger";
import type { ScpScanResult } from "@/lib/scan-parser";
import dagre from "@dagrejs/dagre";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

// ─── DFD layout helper ───────────────────────────────────────────────────────

function layoutNodes(
  nodes: { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }[],
  edges: { id: string; source: string; target: string }[],
) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 120, marginx: 30, marginy: 30 });

  for (const node of nodes) {
    g.setNode(node.id, { width: 180, height: 90 });
  }
  for (const edge of edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    if (pos) return { ...node, position: { x: pos.x - 90, y: pos.y - 45 } };
    return node;
  });
}

// ─── POST /api/projects/[projectId]/import-scan ──────────────────────────────

export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  try {
    const body = await request.json();
    const { scanResult, equipmentId } = body as { scanResult: ScpScanResult; equipmentId?: string };

    if (!scanResult?.hosts || !Array.isArray(scanResult.hosts)) {
      return apiError("Invalid scan result format", 400);
    }

    const validTypes = ["PLC", "SERVER", "SENSOR", "NETWORK_DEVICE", "PC", "OTHER_DEVICE"];

    // Check for existing IPs to skip duplicates
    const existingHw = await prisma.hardware.findMany({
      where: { projectId, ...(equipmentId ? { equipmentId } : {}) },
      select: { ipAddress: true },
    });
    const existingIps = new Set(existingHw.map((h) => h.ipAddress).filter(Boolean));

    const hwCreated: { id: string; ip: string; hwType: string }[] = [];
    const swCreated: string[] = [];
    let skipped = 0;

    // Create hardware + software in transaction
    await prisma.$transaction(async (tx) => {
      for (const host of scanResult.hosts) {
        // Skip duplicates
        if (existingIps.has(host.ip)) {
          skipped++;
          continue;
        }

        const hwType = validTypes.includes(host.hwType) ? host.hwType : "SERVER";

        // Create hardware
        const hw = await tx.hardware.create({
          data: {
            projectId,
            equipmentId: equipmentId || null,
            name: host.hwName,
            type: hwType,
            ipAddress: host.ip,
            macAddress: host.mac !== "00:00:00:00:00:00" ? host.mac : null,
            commProtocols: host.ports.map((p) => `${p.port}/${p.service}`).join(", "),
          },
        });

        hwCreated.push({ id: hw.id, ip: host.ip, hwType });

        // Create software linked to this hardware
        for (const sw of host.software) {
          const created = await tx.software.create({
            data: {
              projectId,
              equipmentId: equipmentId || null,
              hardwareId: hw.id,
              name: sw.name,
              version: sw.version,
              vendor: sw.vendor,
              swType: sw.swType || "APPLICATION",
              listeningPort: sw.listeningPort,
            },
          });
          swCreated.push(created.id);
        }
      }
    });

    // Track changes (non-blocking)
    for (const hw of hwCreated) {
      trackChange({ projectId, entityType: "HARDWARE", entityId: hw.id, changeType: "CREATE", changedBy: user.id }).catch(() => {});
    }

    // ── Generate DFD ────────────────────────────────────────────────────────

    if (hwCreated.length > 0) {
      // Build nodes
      const dfdNodes = hwCreated.map((hw) => {
        const host = scanResult.hosts.find((h) => h.ip === hw.ip);
        return {
          id: hw.id,
          type: "hardware" as const,
          position: { x: 0, y: 0 },
          data: {
            label: host?.hwName || hw.ip,
            hwType: hw.hwType,
            ipAddress: hw.ip,
            software: host?.software.map((s) => ({ name: s.name, version: s.version })) || [],
          },
        };
      });

      // Build edges: star topology from gateway/firewall
      const dfdEdges: { id: string; source: string; target: string; type: string; animated: boolean; data: Record<string, unknown> }[] = [];

      // Find gateway node (NETWORK_DEVICE)
      const gatewayNode = hwCreated.find((h) => h.hwType === "NETWORK_DEVICE");

      if (gatewayNode) {
        // Connect all non-gateway nodes to gateway
        let edgeIdx = 0;
        for (const hw of hwCreated) {
          if (hw.id === gatewayNode.id) continue;
          dfdEdges.push({
            id: `scp-e-${edgeIdx++}`,
            source: gatewayNode.id,
            target: hw.id,
            type: "smoothstep",
            animated: false,
            data: { connectionType: "ethernet", protocol: "tcp" },
          });
        }
      } else {
        // No gateway found: connect in chain
        for (let i = 0; i < hwCreated.length - 1; i++) {
          dfdEdges.push({
            id: `scp-e-${i}`,
            source: hwCreated[i].id,
            target: hwCreated[i + 1].id,
            type: "smoothstep",
            animated: false,
            data: { connectionType: "ethernet", protocol: "tcp" },
          });
        }
      }

      // Add edges between hosts sharing elasticsearch (9200)
      const esHosts = scanResult.hosts.filter((h) => h.ports.some((p) => p.port === 9200));
      if (esHosts.length > 1) {
        let edgeIdx = dfdEdges.length;
        for (let i = 0; i < esHosts.length - 1; i++) {
          const srcHw = hwCreated.find((h) => h.ip === esHosts[i].ip);
          const tgtHw = hwCreated.find((h) => h.ip === esHosts[i + 1].ip);
          if (srcHw && tgtHw) {
            dfdEdges.push({
              id: `scp-e-${edgeIdx++}`,
              source: srcHw.id,
              target: tgtHw.id,
              type: "smoothstep",
              animated: false,
              data: { connectionType: "ethernet", protocol: "tcp", label: "elasticsearch" },
            });
          }
        }
      }

      // Auto-layout with dagre
      const layoutedNodes = layoutNodes(dfdNodes, dfdEdges);

      // Upsert DFD
      const dfdData = JSON.stringify({ nodes: layoutedNodes, edges: dfdEdges });
      const whereClause = equipmentId
        ? { equipmentId }
        : { projectId_equipmentId: { projectId, equipmentId: "" } };

      if (equipmentId) {
        await prisma.dfdDiagram.upsert({
          where: { equipmentId },
          create: { projectId, equipmentId, data: dfdData, source: "IMPORT" },
          update: { data: dfdData, source: "IMPORT", version: { increment: 1 } },
        });
      } else {
        // Project-level: find existing or create
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

    // ── Summary ─────────────────────────────────────────────────────────────

    const byType: Record<string, number> = {};
    for (const hw of hwCreated) {
      byType[hw.hwType] = (byType[hw.hwType] || 0) + 1;
    }

    logAction(user.id, "SCAN_IMPORT", { entity: "scan", projectId, data: { hostCount: scanResult.hosts.length, fileCount: swCreated.length } }).catch(() => {});

    return NextResponse.json({
      created: { hardware: hwCreated.length, software: swCreated.length },
      skipped,
      summary: {
        byType,
        totalPorts: scanResult.hosts.reduce((sum, h) => sum + h.ports.length, 0),
        osDetected: scanResult.hosts.filter((h) => h.os).length,
      },
    });
  } catch (err) {
    safeError("import-scan POST", err);
    return apiError("Internal server error", 500);
  }
}
