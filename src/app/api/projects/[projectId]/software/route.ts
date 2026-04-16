import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, verifyEquipmentOwnership, apiError } from "@/lib/auth-helpers";
import { safeError } from "@/lib/safe-log";
import { trackChange } from "@/lib/change-tracker";
import { logAction } from "@/lib/action-logger";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

/** GET /api/projects/[projectId]/software — list software */
export async function GET(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const equipmentId = searchParams.get("equipmentId");

  const software = await prisma.software.findMany({
    where: { projectId, ...(equipmentId ? { equipmentId } : {}) },
    include: {
      hardware: { select: { id: true, name: true } },
      _count: { select: { cveMatches: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(software);
}

/** POST /api/projects/[projectId]/software — create software */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  try {
    const body = await request.json();
    const { name, version, vendor, swType, hardwareId, cpe, brand, listeningPort, purpose, equipmentId, modelName, osVersion, firmwareVersion, updateLog } = body;

    if (!name) {
      return apiError("Name is required", 400);
    }

    // VENDOR: verify ownership of target hardware via equipment
    if (user.role === "VENDOR" && hardwareId) {
      const isOwner = await verifyEquipmentOwnership(user.id, user.role, hardwareId);
      if (!isOwner) return apiError("Forbidden — not your equipment", 403);
    }

    const validTypes = ["OS", "APPLICATION", "FIRMWARE", "DRIVER", "LIBRARY", "MIDDLEWARE"];
    if (swType && !validTypes.includes(swType)) {
      return apiError("Invalid software type", 400);
    }

    const software = await prisma.software.create({
      data: {
        projectId,
        equipmentId: equipmentId || null,
        name: name.trim(),
        version: version?.trim() || null,
        vendor: vendor?.trim() || null,
        swType: swType || "APPLICATION",
        hardwareId: hardwareId || null,
        cpe: cpe?.trim() || null,
        brand: brand?.trim() || null,
        listeningPort: listeningPort?.trim() || null,
        purpose: purpose?.trim() || null,
        modelName: modelName?.trim() || null,
        osVersion: osVersion?.trim() || null,
        firmwareVersion: firmwareVersion?.trim() || null,
        updateLog: updateLog?.trim() || null,
      },
    });

    trackChange({
      projectId, entityType: "SOFTWARE", entityId: software.id,
      changeType: "CREATE", changedBy: user.id,
    }).catch(() => {});

    logAction(user.id, "SW_CREATE", { entity: "software", entityId: software.id, projectId, data: { name, version, vendor, swType } }).catch(() => {});

    return NextResponse.json(software, { status: 201 });
  } catch (error) {
    safeError("Software POST error", error);
    return apiError("Failed to create software", 500);
  }
}
