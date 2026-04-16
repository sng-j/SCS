import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { safeError } from "@/lib/safe-log";
import { findOrCreateShipyardByName } from "@/lib/data-health";

export const dynamic = "force-dynamic";

/** GET /api/admin/shipyards — list all shipyards with stats */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  const shipyards = await prisma.shipyard.findMany({
    include: {
      _count: {
        select: {
          users: true,
          projects: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(shipyards);
}

/** POST /api/admin/shipyards — create a new shipyard */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  try {
    const body = await request.json();
    const { name, address, phone, contact } = body;

    if (!name?.trim()) {
      return apiError("Shipyard name is required", 400);
    }

    // Normalized find-or-create avoids producing near-duplicate rows like
    // "Test Shipyard" / "test  shipyard". If a row already exists, we still
    // patch in any newly-supplied address/phone/contact fields.
    const found = await findOrCreateShipyardByName(name, {
      address: address?.trim() || null,
      phone: phone?.trim() || null,
      contact: contact?.trim() || null,
    });
    if (!found.created && (address || phone || contact)) {
      await prisma.shipyard.update({
        where: { id: found.id },
        data: {
          ...(address !== undefined && { address: address?.trim() || null }),
          ...(phone !== undefined && { phone: phone?.trim() || null }),
          ...(contact !== undefined && { contact: contact?.trim() || null }),
        },
      });
    }
    const shipyard = await prisma.shipyard.findUnique({ where: { id: found.id } });
    return NextResponse.json(shipyard, { status: found.created ? 201 : 200 });
  } catch (error) {
    safeError("Shipyard POST error", error);
    return apiError("Failed to create shipyard", 500);
  }
}

/** PATCH /api/admin/shipyards — update shipyard */
export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  try {
    const body = await request.json();
    const { id, name, address, phone, contact, isActive } = body;

    if (!id) return apiError("Shipyard id is required", 400);

    const data: Prisma.ShipyardUpdateInput = {};
    if (name !== undefined) data.name = name.trim();
    if (address !== undefined) data.address = address?.trim() || null;
    if (phone !== undefined) data.phone = phone?.trim() || null;
    if (contact !== undefined) data.contact = contact?.trim() || null;
    if (isActive !== undefined) data.isActive = isActive;

    const updated = await prisma.shipyard.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    safeError("Shipyard PATCH error", error);
    return apiError("Failed to update shipyard", 500);
  }
}

/** DELETE /api/admin/shipyards — soft-delete a shipyard + children */
export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return apiError("Admin required", 403);

  try {
    const { id } = await request.json();
    if (!id) return apiError("Shipyard ID required", 400);

    // Manual cascade: soft-delete projects (and their children), then the shipyard.
    const projectIds = (
      await prisma.project.findMany({ where: { shipyardId: id }, select: { id: true } })
    ).map((p) => p.id);

    if (projectIds.length > 0) {
      const eqIds = (
        await prisma.equipment.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } })
      ).map((e) => e.id);

      if (eqIds.length > 0) {
        await prisma.vendorAuditResult.deleteMany({ where: { equipmentId: { in: eqIds } } });
        await prisma.certDocument.deleteMany({ where: { equipmentId: { in: eqIds } } });
        await prisma.dfdDiagram.deleteMany({ where: { equipmentId: { in: eqIds } } });
        await prisma.auditRun.deleteMany({ where: { equipmentId: { in: eqIds } } });
      }

      await prisma.assessment.deleteMany({ where: { hardware: { projectId: { in: projectIds } } } });
      await prisma.cveMatch.deleteMany({ where: { hardware: { projectId: { in: projectIds } } } });
      await prisma.assetFile.deleteMany({ where: { hardware: { projectId: { in: projectIds } } } });
      await prisma.software.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.hardware.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.equipment.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.networkConnection.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.dfdDiagram.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.riskEntry.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.submissionFile.deleteMany({ where: { submission: { projectId: { in: projectIds } } } });
      await prisma.document.deleteMany({ where: { submission: { projectId: { in: projectIds } } } });
      await prisma.submission.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.compliancePackage.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.auditRun.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.project.deleteMany({ where: { shipyardId: id } });
    }

    // Soft-delete project groups under this shipyard.
    await prisma.projectGroup.deleteMany({ where: { shipyardId: id } });

    await prisma.shipyard.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    safeError("Shipyard DELETE error", error);
    return apiError("Failed to delete shipyard", 500);
  }
}
