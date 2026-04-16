import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError } from "@/lib/auth-helpers";
import { safeError } from "@/lib/safe-log";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

/** GET /api/projects/[projectId]/dfd — get DFD diagram data */
export async function GET(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const equipmentId = searchParams.get("equipmentId");

  const diagram = await prisma.dfdDiagram.findFirst({
    where: equipmentId ? { equipmentId } : { projectId, equipmentId: null },
  });

  if (!diagram) {
    return NextResponse.json({ nodes: [], edges: [] });
  }

  try {
    const data = typeof diagram.data === 'string' ? JSON.parse(diagram.data) : diagram.data;
    if (!data || typeof data !== 'object') {
      return NextResponse.json({ nodes: [], edges: [] });
    }
    return NextResponse.json(data);
  } catch (parseError) {
    safeError("DFD data parse error", parseError);
    return NextResponse.json({ nodes: [], edges: [] });
  }
}

/** PUT /api/projects/[projectId]/dfd — save DFD diagram data */
export async function PUT(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  try {
    const body = await request.json();
    const { nodes, edges, equipmentId } = body;

    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      return apiError("nodes and edges arrays are required", 400);
    }

    // Verify equipmentId belongs to this project if provided
    if (equipmentId) {
      const eq = await prisma.equipment.findFirst({
        where: { id: equipmentId, projectId },
        include: { vendors: { select: { id: true } } },
      });
      if (!eq) return apiError("Equipment not found in this project", 404);

      // VENDOR can only edit their own equipment's DFD
      const vendorIds = eq.vendors.map(v => v.id);
      if (user.role === "VENDOR" && !vendorIds.includes(user.id)) {
        return apiError("Forbidden", 403);
      }
    }

    const whereClause = equipmentId
      ? { equipmentId }
      : { projectId, equipmentId: null };

    const existing = await prisma.dfdDiagram.findFirst({
      where: whereClause,
    });

    let diagram;
    if (existing) {
      diagram = await prisma.dfdDiagram.update({
        where: { id: existing.id },
        data: {
          data: JSON.stringify({ nodes, edges }),
          version: { increment: 1 },
        },
      });
    } else {
      diagram = await prisma.dfdDiagram.create({
        data: {
          ...(equipmentId ? { equipmentId } : { projectId }),
          data: JSON.stringify({ nodes, edges }),
          source: "MANUAL",
        },
      });
    }

    return NextResponse.json(diagram);
  } catch (error) {
    safeError("DFD PUT error", error);
    return apiError("Failed to save diagram", 500);
  }
}
