import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError } from "@/lib/auth-helpers";
import { trackChange } from "@/lib/change-tracker";
import { autoMatchCveForSoftware } from "@/lib/cve-auto-match";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string; softwareId: string }>;
}

/** PATCH /api/projects/[projectId]/software/[softwareId] — update */
export async function PATCH(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId, softwareId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  try {
    const body = await request.json();
    const { name, version, vendor, swType, hardwareId, cpe, brand, listeningPort, purpose } = body;

    const software = await prisma.software.update({
      where: { id: softwareId, projectId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(version !== undefined && { version: version?.trim() || null }),
        ...(vendor !== undefined && { vendor: vendor?.trim() || null }),
        ...(swType !== undefined && { swType }),
        ...(hardwareId !== undefined && { hardwareId: hardwareId || null }),
        ...(cpe !== undefined && { cpe: cpe?.trim() || null }),
        ...(brand !== undefined && { brand: brand?.trim() || null }),
        ...(listeningPort !== undefined && { listeningPort: listeningPort?.trim() || null }),
        ...(purpose !== undefined && { purpose: purpose?.trim() || null }),
      },
    });

    trackChange({
      projectId, entityType: "SOFTWARE", entityId: softwareId,
      changeType: "UPDATE", severity: "MEDIUM", reauditRequired: true,
      changedBy: user.id,
    }).catch(() => {});

    // Re-match CVEs on update (sync — wait for completion)
    await autoMatchCveForSoftware(software.id, projectId);

    return NextResponse.json(software);
  } catch {
    return apiError("Failed to update software", 500);
  }
}

/** DELETE /api/projects/[projectId]/software/[softwareId] — delete */
export async function DELETE(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId, softwareId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  await prisma.software.delete({ where: { id: softwareId, projectId } });

  trackChange({
    projectId, entityType: "SOFTWARE", entityId: softwareId,
    changeType: "DELETE", severity: "HIGH", reauditRequired: true,
    changedBy: user.id,
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
