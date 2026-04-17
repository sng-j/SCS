import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError } from "@/lib/auth-helpers";
import { safeError } from "@/lib/safe-log";
import { logAction } from "@/lib/action-logger";
import { notifyRole, createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

/** GET /api/projects/[projectId]/equipment — list equipment with stats */
export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  const where = user.role === "VENDOR"
    ? { projectId, vendors: { some: { id: user.id } } }
    : { projectId };

  const equipment = await prisma.equipment.findMany({
    where,
    include: {
      vendors: { select: { id: true, name: true, company: true, email: true } },
      _count: {
        select: {
          hardware: { where: { deletedAt: null } },
          software: { where: { deletedAt: null } },
        },
      },
      dfdDiagram: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(equipment);
}

/** POST /api/projects/[projectId]/equipment — create equipment (SUPPORT/ADMIN only) */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  // Write: only SUPPORT or ADMIN. VENDOR and SHIPYARD (viewer) cannot create.
  if (user.role !== "SUPPORT" && user.role !== "ADMIN") {
    return apiError("Only support and admin can create equipment", 403);
  }

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  try {
    const body = await request.json();
    const { name, description, vendorIds } = body;

    if (!name?.trim()) return apiError("Equipment name is required", 400);
    if (!vendorIds || !Array.isArray(vendorIds) || vendorIds.length === 0) {
      return apiError("At least one vendor assignment is required", 400);
    }

    // Verify vendors exist and belong to same shipyard
    const vendors = await prisma.user.findMany({
      where: { id: { in: vendorIds }, role: "VENDOR" },
      select: { id: true, shipyardId: true },
    });
    if (vendors.length !== vendorIds.length) {
      return apiError("One or more invalid vendors", 400);
    }

    // For SUPPORT users, verify vendors belong to same shipyard
    if (user.role === "SUPPORT") {
      const invalidVendor = vendors.find(v => v.shipyardId !== user.shipyardId);
      if (invalidVendor) return apiError("Vendor does not belong to your shipyard", 403);
    }

    const projectRecord = await prisma.project.findUnique({
      where: { id: projectId },
      select: { shipyardId: true },
    });
    if (projectRecord?.shipyardId) {
      const invalidVendor = vendors.find(v => v.shipyardId && v.shipyardId !== projectRecord.shipyardId);
      if (invalidVendor) return apiError("Vendor does not belong to this project's shipyard", 400);
    }

    const equipment = await prisma.equipment.create({
      data: {
        projectId,
        vendors: {
          connect: vendorIds.map(id => ({ id })),
        },
        name: name.trim(),
        description: description?.trim() || null,
        vendorId: vendorIds[0], // Keep legacy vendorId for now
      },
      include: {
        vendors: { select: { id: true, name: true, company: true, email: true } },
      },
    });

    return NextResponse.json(equipment, { status: 201 });
  } catch (error) {
    safeError("Equipment POST error", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(`Failed to create equipment: ${message}`, 500);
  }
}

/** PATCH /api/projects/[projectId]/equipment — update equipment */
export async function PATCH(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  try {
    const body = await request.json();
    const { id, name, description, status, vendorIds, certificationInfo, securityCategory, isTypeApproved, manufacturerName, productModelName, cidr } = body;

    if (!id) return apiError("Equipment id is required", 400);

    // Verify equipment belongs to this project
    const existing = await prisma.equipment.findFirst({
      where: { id, projectId },
      include: { vendors: { select: { id: true } } },
    });
    if (!existing) return apiError("Equipment not found", 404);

    const vendorIdsOfEq = existing.vendors.map(v => v.id);

    // Vendors can only update status to SUBMITTED
    if (user.role === "VENDOR") {
      if (!vendorIdsOfEq.includes(user.id)) return apiError("Forbidden", 403);
      // Vendors can submit their work
      if (status && status !== "SUBMITTED") {
        return apiError("Vendors can only submit equipment", 403);
      }
      if (name || vendorIds) {
        return apiError("Vendors cannot change name or assignment", 403);
      }
    }

    // Shipyard/Admin status transitions for review
    const validStatuses = ["PENDING", "IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW", "REVISION_REQUESTED", "APPROVED"];
    if (status && !validStatuses.includes(status)) {
      return apiError("Invalid status", 400);
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name.trim();
    if (description !== undefined) data.description = description?.trim() || null;
    if (status !== undefined) data.status = status;
    // Only SUPPORT/ADMIN can reassign vendors or edit certification info. SHIPYARD is read-only.
    if (vendorIds !== undefined && (user.role === "SUPPORT" || user.role === "ADMIN")) {
      data.vendors = { set: vendorIds.map((id: string) => ({ id })) };
      data.vendorId = vendorIds[0] || ""; // Legacy
    }
    if (certificationInfo !== undefined && (user.role === "SUPPORT" || user.role === "ADMIN")) data.certificationInfo = certificationInfo;
    // CBS fields — VENDOR can only modify their own equipment CBS fields
    if (user.role !== "VENDOR" || vendorIdsOfEq.includes(user.id)) {
      if (securityCategory !== undefined) data.securityCategory = securityCategory;
      if (isTypeApproved !== undefined) data.isTypeApproved = isTypeApproved;
      if (manufacturerName !== undefined) data.manufacturerName = manufacturerName?.trim() || null;
      if (productModelName !== undefined) data.productModelName = productModelName?.trim() || null;
      if (cidr !== undefined) data.cidr = cidr?.trim() || null;
    }

    const updated = await prisma.equipment.update({
      where: { id },
      data,
      include: {
        vendors: { select: { id: true, name: true, company: true, email: true } },
        project: { select: { vesselName: true } },
        _count: { select: { hardware: true, software: true } },
        dfdDiagram: { select: { id: true } },
      },
    });

    // Send notifications on status changes
    const eqName = updated.name;
    const vessel = updated.project?.vesselName || "";
    const eqLink = `/project/${projectId}/equipment/${id}`;

    if (status === "SUBMITTED") {
      logAction(user.id, "SUBMIT", { entity: "equipment", entityId: id, projectId, data: { status: "SUBMITTED" } }).catch(() => {});
    }

    // NOTE: Notification messages are intentionally in Korean (ko-KR) as the primary user base is Korean shipyards.
    if (status === "SUBMITTED") {
      // Notify shipyard + admin that vendor submitted
      notifyRole("SHIPYARD", "EQUIPMENT_SUBMITTED", `Equipment submitted: ${eqName}`, `${vessel} — ${eqName} needs review.`, `/project/${projectId}/submit`).catch(() => {});
      notifyRole("ADMIN", "EQUIPMENT_SUBMITTED", `Equipment submitted: ${eqName}`, `${vessel} — ${eqName}`, `/project/${projectId}/submit`).catch(() => {});
    } else if (status === "APPROVED" && updated.vendors.length > 0) {
      // Notify all vendors that equipment was approved
      updated.vendors.forEach(v => {
        createNotification(v.id, "EQUIPMENT_APPROVED", `Equipment approved: ${eqName}`, `${vessel} — ${eqName} has been approved.`, eqLink).catch(() => {});
      });

      // Check if ALL equipment in this vessel is approved → notify shipyard for E26
      const allEquipments = await prisma.equipment.findMany({
        where: { projectId },
        select: { status: true },
      });
      const allApproved = allEquipments.length > 0 && allEquipments.every((e) => e.status === "APPROVED");
      if (allApproved) {
        notifyRole("SHIPYARD", "E26_READY", `E26 documents ready: ${vessel}`, `All ${allEquipments.length} equipment approved. E26 ship-level documents can now be generated.`, `/project/${projectId}`).catch(() => {});
        notifyRole("ADMIN", "E26_READY", `E26 ready: ${vessel}`, `All equipment approved for ${vessel}.`, `/project/${projectId}`).catch(() => {});
      }
    } else if (status === "REVISION_REQUESTED" && updated.vendors.length > 0) {
      // Notify all vendors that revision is requested
      updated.vendors.forEach(v => {
        createNotification(v.id, "REVISION_REQUESTED", `Revision requested: ${eqName}`, `${vessel} — Revision requested for ${eqName}.`, eqLink).catch(() => {});
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    safeError("Equipment PATCH error", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(`Failed to update equipment: ${message}`, 500);
  }
}

/** DELETE /api/projects/[projectId]/equipment — delete equipment (SUPPORT/ADMIN only) */
export async function DELETE(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  // Write: only SUPPORT or ADMIN. VENDOR and SHIPYARD (viewer) cannot delete.
  if (user.role !== "SUPPORT" && user.role !== "ADMIN") {
    return apiError("Only support and admin can delete equipment", 403);
  }

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return apiError("Equipment id is required", 400);

    // Verify equipment exists and belongs to this project
    const existing = await prisma.equipment.findFirst({
      where: { id, projectId },
    });
    if (!existing) return apiError("Equipment not found", 404);
    if (existing.projectId !== projectId) return apiError("Equipment does not belong to this project", 403);

    // Manual cascade: soft-delete children before the equipment itself.
    await prisma.vendorAuditResult.deleteMany({ where: { equipmentId: id } });
    await prisma.certDocument.deleteMany({ where: { equipmentId: id } });
    await prisma.auditRun.deleteMany({ where: { equipmentId: id } });
    await prisma.dfdDiagram.deleteMany({ where: { equipmentId: id } });
    await prisma.assessment.deleteMany({ where: { hardware: { equipmentId: id } } });
    await prisma.cveMatch.deleteMany({ where: { hardware: { equipmentId: id } } });
    await prisma.assetFile.deleteMany({ where: { hardware: { equipmentId: id } } });
    await prisma.software.deleteMany({ where: { equipmentId: id } });
    await prisma.hardware.deleteMany({ where: { equipmentId: id } });
    await prisma.equipment.delete({ where: { id, projectId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    safeError("Equipment DELETE error", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(`Failed to delete equipment: ${message}`, 500);
  }
}
