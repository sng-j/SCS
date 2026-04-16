import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

/** GET /api/projects/[projectId] — get single project with counts */
export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;

  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      shipyard: { select: { id: true, name: true } },
      _count: {
        select: {
          hardware: { where: { deletedAt: null } },
          software: { where: { deletedAt: null } },
          submissions: { where: { deletedAt: null } },
          equipments: { where: { deletedAt: null } },
        },
      },
    },
  });

  if (!project) return apiError("Project not found", 404);

  return NextResponse.json(project);
}

/** PATCH /api/projects/[projectId] — update a project (SHIPYARD/ADMIN only) */
export async function PATCH(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  // VENDOR cannot modify project settings
  if (user.role === "VENDOR") {
    return apiError("Vendors cannot modify project settings", 403);
  }

  const { projectId } = await params;

  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  const body = await request.json();
  const { vesselName, classification, systemName, shipowner, status } = body;

  // Validate status if provided
  if (status !== undefined) {
    const validStatuses = ["ACTIVE", "COMPLETED", "ARCHIVED"];
    if (!validStatuses.includes(status)) {
      return apiError("Invalid project status", 400);
    }
  }

  const data: Record<string, unknown> = {};
  if (vesselName !== undefined) data.vesselName = vesselName;
  if (classification !== undefined) data.classification = classification;
  if (systemName !== undefined) data.systemName = systemName;
  if (shipowner !== undefined) data.shipowner = shipowner;
  if (status !== undefined) data.status = status;

  const updated = await prisma.project.update({
    where: { id: projectId },
    data,
  });

  return NextResponse.json(updated);
}

/** DELETE /api/projects/[projectId] — soft-delete a project + children (ADMIN only) */
export async function DELETE(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  if (user.role !== "ADMIN") {
    return apiError("Only admin can delete projects", 403);
  }

  const { projectId } = await params;

  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  // Manual cascade: soft-delete all children before the project itself.
  // The extension rewrites these deleteMany calls to updateMany(deletedAt).
  const eqIds = (await prisma.equipment.findMany({ where: { projectId }, select: { id: true } })).map((e) => e.id);
  if (eqIds.length > 0) {
    await prisma.vendorAuditResult.deleteMany({ where: { equipmentId: { in: eqIds } } });
    await prisma.certDocument.deleteMany({ where: { equipmentId: { in: eqIds } } });
    await prisma.dfdDiagram.deleteMany({ where: { equipmentId: { in: eqIds } } });
    await prisma.auditRun.deleteMany({ where: { equipmentId: { in: eqIds } } });
  }
  await prisma.cveMatch.deleteMany({ where: { hardware: { projectId } } });
  await prisma.assessment.deleteMany({ where: { hardware: { projectId } } });
  await prisma.assetFile.deleteMany({ where: { hardware: { projectId } } });
  await prisma.software.deleteMany({ where: { projectId } });
  await prisma.hardware.deleteMany({ where: { projectId } });
  await prisma.equipment.deleteMany({ where: { projectId } });
  await prisma.networkConnection.deleteMany({ where: { projectId } });
  await prisma.dfdDiagram.deleteMany({ where: { projectId } });
  await prisma.riskEntry.deleteMany({ where: { projectId } });
  await prisma.submissionFile.deleteMany({ where: { submission: { projectId } } });
  await prisma.document.deleteMany({ where: { submission: { projectId } } });
  await prisma.submission.deleteMany({ where: { projectId } });
  await prisma.compliancePackage.deleteMany({ where: { projectId } });
  await prisma.auditRun.deleteMany({ where: { projectId } });

  await prisma.project.delete({ where: { id: projectId } });

  return NextResponse.json({ success: true });
}
