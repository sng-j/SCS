import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, verifyEquipmentOwnership, apiError } from "@/lib/auth-helpers";
import { safeError } from "@/lib/safe-log";
import { trackChange } from "@/lib/change-tracker";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string; hardwareId: string }>;
}

/** PATCH /api/projects/[projectId]/hardware/[hardwareId] — update */
export async function PATCH(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId, hardwareId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  // VENDOR: verify ownership of this hardware via equipment
  if (user.role === "VENDOR") {
    const isOwner = await verifyEquipmentOwnership(user.id, user.role, hardwareId);
    if (!isOwner) return apiError("Forbidden — not your equipment", 403);
  }

  try {
    const body = await request.json();
    const {
      name, type, manufacturer, model, ipAddress, macAddress, zone, location,
      brand, identifier, category, physicalInterface, commProtocols,
      logicalLocation, purpose, protectionMethod, sysSoftwareCategory, sysSoftwareVersion,
      typeApprovalCert, updateLog,
    } = body;

    const hardware = await prisma.hardware.update({
      where: { id: hardwareId, projectId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(type !== undefined && { type }),
        ...(manufacturer !== undefined && { manufacturer: manufacturer?.trim() || null }),
        ...(model !== undefined && { model: model?.trim() || null }),
        ...(ipAddress !== undefined && { ipAddress: ipAddress?.trim() || null }),
        ...(macAddress !== undefined && { macAddress: macAddress?.trim() || null }),
        ...(zone !== undefined && { zone: zone || null }),
        ...(location !== undefined && { location: location?.trim() || null }),
        ...(brand !== undefined && { brand: brand?.trim() || null }),
        ...(identifier !== undefined && { identifier: identifier?.trim() || null }),
        ...(category !== undefined && { category: category?.trim() || null }),
        ...(physicalInterface !== undefined && { physicalInterface: physicalInterface?.trim() || null }),
        ...(commProtocols !== undefined && { commProtocols: commProtocols?.trim() || null }),
        ...(logicalLocation !== undefined && { logicalLocation: logicalLocation?.trim() || null }),
        ...(purpose !== undefined && { purpose: purpose?.trim() || null }),
        ...(protectionMethod !== undefined && { protectionMethod: protectionMethod?.trim() || null }),
        ...(sysSoftwareCategory !== undefined && { sysSoftwareCategory: sysSoftwareCategory?.trim() || null }),
        ...(sysSoftwareVersion !== undefined && { sysSoftwareVersion: sysSoftwareVersion?.trim() || null }),
        ...(typeApprovalCert !== undefined && { typeApprovalCert: typeApprovalCert?.trim() || null }),
        ...(updateLog !== undefined && { updateLog: updateLog?.trim() || null }),
      },
    });

    trackChange({
      projectId, entityType: "HARDWARE", entityId: hardwareId,
      changeType: "UPDATE", severity: "MEDIUM", reauditRequired: true,
      changedBy: user.id,
    }).catch(() => {});

    // 시스템 SW 입력 → Software 테이블에 자동 등록/업데이트
    if (sysSoftwareCategory !== undefined && sysSoftwareCategory?.trim()) {
      const swName = sysSoftwareCategory.trim();
      const swVersion = sysSoftwareVersion?.trim() || null;
      // swType 판별: Firmware/RTOS/IOS 계열 → FIRMWARE, 나머지 → OS
      const fwKeywords = ["firmware", "rtos", "ios-xe", "ios", "junos", "vxworks", "freertos", "nuttx"];
      const swType = fwKeywords.some((k) => swName.toLowerCase().includes(k)) ? "FIRMWARE" : "OS";

      try {
        // 해당 HW에 연결된 시스템 SW (OS or FIRMWARE) 찾기
        const existing = await prisma.software.findFirst({
          where: { hardwareId, swType: { in: ["OS", "FIRMWARE"] } },
        });
        if (existing) {
          // 업데이트
          await prisma.software.update({
            where: { id: existing.id },
            data: { name: swName, version: swVersion, swType },
          });
        } else {
          // 새로 생성
          const hw = await prisma.hardware.findUnique({ where: { id: hardwareId }, select: { equipmentId: true } });
          await prisma.software.create({
            data: {
              projectId,
              equipmentId: hw?.equipmentId || null,
              hardwareId,
              name: swName,
              version: swVersion,
              swType,
            },
          });
        }
      } catch {
        // Non-blocking
      }
    }

    return NextResponse.json(hardware);
  } catch (error) {
    safeError("Hardware PATCH error", error);
    return apiError("Failed to update hardware", 500);
  }
}

/** DELETE /api/projects/[projectId]/hardware/[hardwareId] — delete */
export async function DELETE(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId, hardwareId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  // VENDOR: verify ownership of this hardware via equipment
  if (user.role === "VENDOR") {
    const isOwner = await verifyEquipmentOwnership(user.id, user.role, hardwareId);
    if (!isOwner) return apiError("Forbidden — not your equipment", 403);
  }

  // Delete linked software first, then hardware
  await prisma.software.deleteMany({ where: { hardwareId } });
  await prisma.hardware.delete({ where: { id: hardwareId, projectId } });

  trackChange({
    projectId, entityType: "HARDWARE", entityId: hardwareId,
    changeType: "DELETE", severity: "HIGH", reauditRequired: true,
    changedBy: user.id,
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
