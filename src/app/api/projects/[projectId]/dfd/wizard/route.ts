import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError } from "@/lib/auth-helpers";
import type { Node, Edge } from "@xyflow/react";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

interface WizardBody {
  systemType: string;
  components: string[];
  zones: string[];
  connections: { from: string; to: string }[];
}

/** Auto-layout: position nodes in a grid grouped by zone */
function layoutNodes(
  components: string[],
  zones: string[],
  connections: { from: string; to: string }[],
  systemType: string,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Assign components to zones round-robin if zones are provided
  const zoneAssignment = new Map<string, string[]>();
  if (zones.length > 0) {
    zones.forEach((z) => zoneAssignment.set(z, []));
    components.forEach((comp, idx) => {
      const zone = zones[idx % zones.length];
      zoneAssignment.get(zone)!.push(comp);
    });
  } else {
    zoneAssignment.set("default", [...components]);
  }

  // Create nodes grouped by zone in columns
  let colX = 0;
  const COL_WIDTH = 260;
  const ROW_HEIGHT = 140;

  zoneAssignment.forEach((comps, zone) => {
    comps.forEach((comp, rowIdx) => {
      const nodeId = comp.toLowerCase().replace(/\s+/g, "-") + `-${colX}-${rowIdx}`;
      nodes.push({
        id: nodeId,
        type: "hardware",
        position: { x: colX, y: rowIdx * ROW_HEIGHT },
        data: {
          label: comp,
          hwType: inferHwType(comp),
          zone: zone !== "default" ? zone : null,
          ipAddress: null,
          software: [],
        },
      });
    });
    colX += COL_WIDTH;
  });

  // Create edges from connections
  connections.forEach((conn, idx) => {
    const fromNode = nodes.find(
      (n) => (n.data as Record<string, unknown>).label === conn.from,
    );
    const toNode = nodes.find(
      (n) => (n.data as Record<string, unknown>).label === conn.to,
    );
    if (fromNode && toNode) {
      edges.push({
        id: `wizard-edge-${idx}`,
        source: fromNode.id,
        target: toNode.id,
        type: "smoothstep",
        animated: true,
        style: { stroke: "#0F62FE", strokeWidth: 1.5 },
      });
    }
  });

  return { nodes, edges };
}

/** Infer hardware type from component name */
function inferHwType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("plc")) return "PLC";
  if (lower.includes("sensor")) return "SENSOR";
  if (lower.includes("server")) return "SERVER";
  if (lower.includes("switch") || lower.includes("router") || lower.includes("firewall"))
    return "NETWORK_DEVICE";
  if (lower.includes("pc") || lower.includes("hmi") || lower.includes("display") || lower.includes("workstation"))
    return "PC";
  return "OTHER_DEVICE";
}

/** POST /api/projects/[projectId]/dfd/wizard — generate DFD from wizard answers */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  try {
    const body: WizardBody = await request.json();
    const { systemType, components, zones, connections } = body;

    if (!systemType || !Array.isArray(components) || components.length === 0) {
      return apiError("systemType and at least one component are required", 400);
    }

    const { nodes, edges } = layoutNodes(
      components,
      zones || [],
      connections || [],
      systemType,
    );

    const existing = await prisma.dfdDiagram.findFirst({
      where: { projectId, equipmentId: null },
    });

    let diagram;
    if (existing) {
      diagram = await prisma.dfdDiagram.update({
        where: { id: existing.id },
        data: {
          data: JSON.stringify({ nodes, edges }),
          source: "WIZARD",
          version: { increment: 1 },
        },
      });
    } else {
      diagram = await prisma.dfdDiagram.create({
        data: {
          projectId,
          data: JSON.stringify({ nodes, edges }),
          source: "WIZARD",
        },
      });
    }

    // Log the wizard action
    await prisma.dfdLog.create({
      data: {
        diagramId: diagram.id,
        action: `wizard_generate:${systemType}`,
        source: "WIZARD",
        snapshot: JSON.stringify({ nodes, edges }),
      },
    });

    return NextResponse.json({ nodes, edges, diagramId: diagram.id }, { status: 201 });
  } catch {
    return apiError("Failed to generate DFD from wizard", 500);
  }
}
