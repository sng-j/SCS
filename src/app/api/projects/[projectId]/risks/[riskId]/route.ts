import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string; riskId: string }>;
}

/** PATCH /api/projects/[projectId]/risks/[riskId] — update a risk entry */
export async function PATCH(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId, riskId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  try {
    // Verify the risk entry belongs to this project
    const existing = await prisma.riskEntry.findFirst({
      where: { id: riskId, projectId },
    });
    if (!existing) return apiError("Risk entry not found", 404);

    const body = await request.json();
    const { threatId, assetRef, likelihood, impact, mitigation, status } = body;

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (threatId !== undefined) updateData.threatId = threatId;
    if (assetRef !== undefined) updateData.assetRef = assetRef || null;
    if (mitigation !== undefined) updateData.mitigation = mitigation || null;

    if (status !== undefined) {
      const validStatuses = ["OPEN", "MITIGATED", "ACCEPTED", "TRANSFERRED"];
      if (!validStatuses.includes(status)) {
        return apiError("Invalid status", 400);
      }
      updateData.status = status;
    }

    // Handle likelihood/impact: recalculate riskLevel if either changes
    const newLikelihood = likelihood !== undefined ? Number(likelihood) : existing.likelihood;
    const newImpact = impact !== undefined ? Number(impact) : existing.impact;

    if (likelihood !== undefined) {
      if (!Number.isInteger(newLikelihood) || newLikelihood < 1 || newLikelihood > 5) {
        return apiError("likelihood must be an integer between 1 and 5", 400);
      }
      updateData.likelihood = newLikelihood;
    }

    if (impact !== undefined) {
      if (!Number.isInteger(newImpact) || newImpact < 1 || newImpact > 5) {
        return apiError("impact must be an integer between 1 and 5", 400);
      }
      updateData.impact = newImpact;
    }

    // Recalculate riskLevel if likelihood or impact changed
    if (likelihood !== undefined || impact !== undefined) {
      updateData.riskLevel = newLikelihood * newImpact;
    }

    const updated = await prisma.riskEntry.update({
      where: { id: riskId },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch {
    return apiError("Failed to update risk entry", 500);
  }
}

/** DELETE /api/projects/[projectId]/risks/[riskId] — delete a risk entry */
export async function DELETE(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId, riskId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  try {
    const existing = await prisma.riskEntry.findFirst({
      where: { id: riskId, projectId },
    });
    if (!existing) return apiError("Risk entry not found", 404);

    await prisma.riskEntry.delete({ where: { id: riskId } });

    return NextResponse.json({ success: true });
  } catch {
    return apiError("Failed to delete risk entry", 500);
  }
}
