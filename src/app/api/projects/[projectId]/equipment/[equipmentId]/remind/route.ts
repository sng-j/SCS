import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** POST /api/projects/[projectId]/equipment/[equipmentId]/remind */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; equipmentId: string }> }
) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "SHIPYARD" && user.role !== "ADMIN") return apiError("Forbidden", 403);

  const { projectId, equipmentId } = await params;

  try {
    const equipment = await prisma.equipment.findFirst({
      where: { id: equipmentId, projectId },
      include: {
        vendor: { select: { id: true, name: true } },
        project: { select: { vesselName: true } },
      },
    });

    if (!equipment) return apiError("Equipment not found", 404);
    if (!equipment.vendor) return apiError("No vendor assigned", 400);

    const vessel = equipment.project?.vesselName || "Unknown";
    const eqName = equipment.name;
    const link = `/project/${projectId}/equipment/${equipmentId}`;

    await createNotification(
      equipment.vendor.id,
      "REMINDER",
      `Reminder: ${eqName}`,
      `${vessel} — Please proceed with ${eqName} certification.`,
      link,
    );

    return NextResponse.json({ ok: true });
  } catch {
    return apiError("Failed to send reminder", 500);
  }
}
