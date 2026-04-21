import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError, isWriteRole } from "@/lib/auth-helpers";
import { safeError } from "@/lib/safe-log";
import { trackChange } from "@/lib/change-tracker";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

interface BulkHwItem {
  name: string;
  type: string;
}

/** POST /api/projects/[projectId]/hardware/bulk — bulk create hardware */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);
  if (!isWriteRole(user.role)) return apiError("Read-only role cannot modify this resource", 403);

  try {
    const body = await request.json();
    const { items, equipmentId } = body as { items: BulkHwItem[]; equipmentId?: string };

    if (!Array.isArray(items) || items.length === 0) {
      return apiError("items array is required", 400);
    }

    const validTypes = ["PLC", "SERVER", "SENSOR", "NETWORK_DEVICE", "PC", "OTHER_DEVICE"];

    const created = [];
    for (const item of items) {
      if (!item.name?.trim() || !validTypes.includes(item.type)) continue;

      const hw = await prisma.hardware.create({
        data: {
          projectId,
          equipmentId: equipmentId || null,
          name: item.name.trim(),
          type: item.type as "PLC" | "SERVER" | "SENSOR" | "NETWORK_DEVICE" | "PC" | "OTHER_DEVICE",
        },
      });

      await trackChange({
        projectId,
        entityType: "HARDWARE",
        entityId: hw.id,
        changeType: "CREATE",
        changedBy: user.id,
      }).catch(() => {});

      created.push(hw);
    }

    // 자산 등록 시 equipment 상태를 IN_PROGRESS로 자동 변경
    if (equipmentId && created.length > 0) {
      prisma.equipment.updateMany({
        where: { id: equipmentId, status: "PENDING" },
        data: { status: "IN_PROGRESS" },
      }).catch(() => {});
    }

    return NextResponse.json({ created, count: created.length });
  } catch (err) {
    safeError("hardware/bulk POST", err);
    return apiError("Internal server error", 500);
  }
}
