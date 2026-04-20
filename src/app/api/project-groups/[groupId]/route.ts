import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { safeError } from "@/lib/safe-log";

export const dynamic = "force-dynamic";

/** PATCH /api/project-groups/[groupId] — update group name/shipowner */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  // Write: only SUPPORT or ADMIN. SHIPYARD is read-only now.
  if (user.role !== "SUPPORT" && user.role !== "ADMIN") return apiError("Forbidden", 403);
  const { groupId } = await params;

  try {
    // Verify ownership: SHIPYARD can only modify their own groups
    const group = await prisma.projectGroup.findUnique({
      where: { id: groupId },
      select: { shipyardId: true },
    });
    if (!group) return apiError("Not found", 404);
    if (user.role === "SUPPORT" && group.shipyardId !== user.shipyardId) {
      return apiError("Cannot modify another shipyard's project group", 403);
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.shipowner !== undefined) data.shipowner = body.shipowner?.trim() || null;
    if (body.description !== undefined) data.description = body.description?.trim() || null;

    const updated = await prisma.projectGroup.update({ where: { id: groupId }, data });
    return NextResponse.json(updated);
  } catch {
    return apiError("Failed to update", 500);
  }
}

/** DELETE /api/project-groups/[groupId] — delete group + all projects + equipment */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  // Write: only SUPPORT or ADMIN. SHIPYARD is read-only now.
  if (user.role !== "SUPPORT" && user.role !== "ADMIN") return apiError("Forbidden", 403);
  const { groupId } = await params;

  try {
    // Verify ownership: SHIPYARD can only delete their own groups
    const group = await prisma.projectGroup.findUnique({
      where: { id: groupId },
      select: { shipyardId: true },
    });
    if (!group) return apiError("Not found", 404);
    if (user.role === "SUPPORT" && group.shipyardId !== user.shipyardId) {
      return apiError("Cannot delete another shipyard's project group", 403);
    }

    // Get all projects in this group
    const projects = await prisma.project.findMany({
      where: { projectGroupId: groupId },
      select: { id: true },
    });
    const projectIds = projects.map((p) => p.id);

    if (projectIds.length > 0) {
      // Get all equipment
      const eqIds = (await prisma.equipment.findMany({
        where: { projectId: { in: projectIds } },
        select: { id: true },
      })).map((e) => e.id);

      if (eqIds.length > 0) {
        await prisma.vendorAuditResult.deleteMany({ where: { equipmentId: { in: eqIds } } });
        await prisma.assessment.deleteMany({ where: { hardware: { equipmentId: { in: eqIds } } } });
        await prisma.software.deleteMany({ where: { equipmentId: { in: eqIds } } });
        await prisma.hardware.deleteMany({ where: { equipmentId: { in: eqIds } } });
        await prisma.dfdDiagram.deleteMany({ where: { equipmentId: { in: eqIds } } });
        await prisma.certDocument.deleteMany({ where: { equipmentId: { in: eqIds } } });
        await prisma.equipment.deleteMany({ where: { projectId: { in: projectIds } } });
      }

      // Delete project-level data
      await prisma.cveMatch.deleteMany({ where: { hardware: { projectId: { in: projectIds } } } });
      await prisma.assetFile.deleteMany({ where: { hardware: { projectId: { in: projectIds } } } });
      await prisma.dfdDiagram.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.hardware.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.software.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.submissionFile.deleteMany({ where: { submission: { projectId: { in: projectIds } } } });
      await prisma.document.deleteMany({ where: { submission: { projectId: { in: projectIds } } } });
      await prisma.submission.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.riskEntry.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.auditRun.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.compliancePackage.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.networkConnection.deleteMany({ where: { projectId: { in: projectIds } } });

      // Delete projects
      await prisma.project.deleteMany({ where: { projectGroupId: groupId } });
    }

    // Delete the group itself
    await prisma.projectGroup.delete({ where: { id: groupId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    safeError("Delete project group error", err);
    return apiError("Failed to delete project group", 500);
  }
}
