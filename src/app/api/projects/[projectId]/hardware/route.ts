import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError, isWriteRole } from "@/lib/auth-helpers";
import { trackChange } from "@/lib/change-tracker";
import { logAction } from "@/lib/action-logger";
import { autoMatchCveForSoftware, autoMatchCveForHardware } from "@/lib/cve-auto-match";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

/** GET /api/projects/[projectId]/hardware — list hardware */
export async function GET(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const equipmentId = searchParams.get("equipmentId");

  const hardware = await prisma.hardware.findMany({
    where: { projectId, ...(equipmentId ? { equipmentId } : {}) },
    include: {
      software: {
        select: { id: true, name: true, swType: true, version: true, vendor: true, listeningPort: true, purpose: true, _count: { select: { cveMatches: { where: { deletedAt: null } } } } },
        where: { deletedAt: null },
      },
      _count: { select: { cveMatches: { where: { deletedAt: null } }, assessments: { where: { deletedAt: null } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Enrich: add swCveCount (CVEs via software) for each HW
  const enriched = hardware.map(hw => ({
    ...hw,
    swCveCount: hw.software.reduce((sum, sw) => sum + (sw._count?.cveMatches || 0), 0),
  }));

  return NextResponse.json(enriched);
}

/** POST /api/projects/[projectId]/hardware — create hardware */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);
  if (!isWriteRole(user.role)) return apiError("Read-only role cannot modify this resource", 403);

  try {
    const body = await request.json();
    const {
      name, type, manufacturer, model, ipAddress, macAddress, zone, location,
      brand, identifier, category, physicalInterface, commProtocols,
      logicalLocation, purpose, protectionMethod, sysSoftwareCategory, sysSoftwareVersion,
      typeApprovalCert, updateLog, equipmentId,
    } = body;

    if (!name || !type) {
      return apiError("Name and type are required", 400);
    }

    const validTypes = ["PLC", "SERVER", "SENSOR", "NETWORK_DEVICE", "PC", "OTHER_DEVICE"];
    if (!validTypes.includes(type)) {
      return apiError("Invalid hardware type", 400);
    }

    const hardware = await prisma.hardware.create({
      data: {
        projectId,
        equipmentId: equipmentId || null,
        name: name.trim(),
        type,
        manufacturer: manufacturer?.trim() || null,
        model: model?.trim() || null,
        ipAddress: ipAddress?.trim() || null,
        macAddress: macAddress?.trim() || null,
        zone: zone || null,
        location: location?.trim() || null,
        brand: brand?.trim() || null,
        identifier: identifier?.trim() || null,
        category: category?.trim() || null,
        physicalInterface: physicalInterface?.trim() || null,
        commProtocols: commProtocols?.trim() || null,
        logicalLocation: logicalLocation?.trim() || null,
        purpose: purpose?.trim() || null,
        protectionMethod: protectionMethod?.trim() || null,
        sysSoftwareCategory: sysSoftwareCategory?.trim() || null,
        sysSoftwareVersion: sysSoftwareVersion?.trim() || null,
        typeApprovalCert: typeApprovalCert?.trim() || null,
        updateLog: updateLog?.trim() || null,
      },
    });

    trackChange({
      projectId, entityType: "HARDWARE", entityId: hardware.id,
      changeType: "CREATE", changedBy: user.id,
    }).catch(() => {});

    logAction(user.id, "HW_CREATE", {
      entity: "hardware", entityId: hardware.id, projectId,
      data: { name, type, manufacturer, model, zone, category },
    }).catch(() => {});

    // Auto-match CVEs for HW (sync)
    await autoMatchCveForHardware(hardware.id, projectId);

    // 자산 등록 시 equipment 상태를 IN_PROGRESS로 자동 변경 (PENDING일 때만)
    if (equipmentId) {
      prisma.equipment.updateMany({
        where: { id: equipmentId, status: "PENDING" },
        data: { status: "IN_PROGRESS" },
      }).catch(() => {});
    }

    // 시스템 SW 입력 → Software 테이블에 자동 등록
    if (sysSoftwareCategory?.trim()) {
      const swName = sysSoftwareCategory.trim();
      const swVersion = sysSoftwareVersion?.trim() || null;
      const fwKeywords = ["firmware", "rtos", "ios-xe", "ios", "junos", "vxworks", "freertos", "nuttx"];
      const swType = fwKeywords.some((k: string) => swName.toLowerCase().includes(k)) ? "FIRMWARE" : "OS";
      try {
        const newSw = await prisma.software.create({
          data: {
            projectId,
            equipmentId: equipmentId || null,
            hardwareId: hardware.id,
            name: swName,
            version: swVersion,
            swType,
          },
        });
        await autoMatchCveForSoftware(newSw.id, projectId);
      } catch { /* non-blocking */ }
    }

    return NextResponse.json(hardware, { status: 201 });
  } catch {
    return apiError("Failed to create hardware", 500);
  }
}
