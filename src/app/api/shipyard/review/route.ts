import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** GET /api/shipyard/review — submitted equipment pending review */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "SHIPYARD" && user.role !== "ADMIN") return apiError("Forbidden", 403);

  let where: Record<string, unknown>;
  if (user.role === "SHIPYARD") {
    if (!user.shipyardId) return NextResponse.json([]); // No shipyard = no results
    where = { project: { shipyardId: user.shipyardId }, status: "SUBMITTED" };
  } else {
    // ADMIN sees all
    where = { status: "SUBMITTED" };
  }

  const equipment = await prisma.equipment.findMany({
    where,
    include: {
      vendor: { select: { id: true, name: true, company: true } },
      project: { select: { id: true, vesselName: true } },
      _count: { select: { hardware: true, software: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(equipment);
}

/** PATCH /api/shipyard/review — approve or request revision */
export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "SHIPYARD" && user.role !== "ADMIN") return apiError("Forbidden", 403);

  try {
    const body = await request.json();
    const { equipmentId, action, comment } = body;

    if (!equipmentId) return apiError("equipmentId is required", 400);
    if (!action || !["approve", "revision"].includes(action)) {
      return apiError("action must be 'approve' or 'revision'", 400);
    }

    const newStatus = action === "approve" ? "APPROVED" : "REVISION_REQUESTED";

    // Verify ownership
    const eq = await prisma.equipment.findUnique({
      where: { id: equipmentId },
      select: { certificationInfo: true, project: { select: { shipyardId: true } } },
    });
    if (!eq) return apiError("Equipment not found", 404);
    if (user.role === "SHIPYARD" && eq.project?.shipyardId !== user.shipyardId) {
      return apiError("Forbidden", 403);
    }
    const existing = eq;
    const certInfo = existing?.certificationInfo ? JSON.parse(existing.certificationInfo as string) as Record<string, unknown> : {};
    if (comment) certInfo.reviewComment = comment;
    certInfo.reviewedBy = user.id;
    certInfo.reviewedAt = new Date().toISOString();

    const equipment = await prisma.equipment.update({
      where: { id: equipmentId },
      data: {
        status: newStatus,
        certificationInfo: JSON.stringify(certInfo),
      },
      include: {
        vendor: { select: { id: true, name: true, company: true } },
        project: { select: { id: true, vesselName: true } },
      },
    });

    return NextResponse.json(equipment);
  } catch {
    return apiError("Failed to update equipment status", 500);
  }
}
