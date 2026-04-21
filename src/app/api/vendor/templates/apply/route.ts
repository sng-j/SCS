import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError, isWriteRole } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** POST /api/vendor/templates/apply — apply template to equipment */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  try {
    const body = await request.json();
    const { templateId, equipmentId, projectId } = body;

    if (!templateId) return apiError("templateId is required", 400);
    if (!equipmentId && !projectId) return apiError("equipmentId or projectId is required", 400);

    const template = await prisma.equipmentTemplate.findUnique({ where: { id: templateId } });
    if (!template) return apiError("Template not found", 404);
    if (template.vendorId !== user.id) return apiError("Forbidden", 403);

    // Verify project access
    if (projectId) {
      const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
      if (!hasAccess) return apiError("Forbidden", 403);
  if (!isWriteRole(user.role)) return apiError("Read-only role cannot modify this resource", 403);
    }

    // Check equipment lock status
    if (equipmentId) {
      const eq = await prisma.equipment.findUnique({ where: { id: equipmentId }, select: { status: true, projectId: true } });
      if (!eq) return apiError("Equipment not found", 404);
      if (["SUBMITTED", "APPROVED"].includes(eq.status)) {
        return apiError("Cannot modify submitted/approved equipment", 403);
      }
    }

    const templateData = (typeof template.data === 'string' ? JSON.parse(template.data) : template.data) as {
      hardware?: Record<string, unknown>[];
      software?: Record<string, unknown>[];
      dfd?: { data?: unknown };
    };

    // Resolve projectId
    const resolvedProjectId = projectId || (await prisma.equipment.findUnique({ where: { id: equipmentId }, select: { projectId: true } }))?.projectId;
    if (!resolvedProjectId) return apiError("Cannot resolve projectId", 400);

    // Delete existing HW/SW for this equipment before applying template (replace, not add)
    if (equipmentId) {
      await prisma.software.deleteMany({ where: { equipmentId } });
      await prisma.hardware.deleteMany({ where: { equipmentId } });
    }

    const created: { hardware: number; software: number } = { hardware: 0, software: 0 };

    // Create hardware from template
    if (templateData.hardware?.length) {
      for (const hw of templateData.hardware) {
        await prisma.hardware.create({
          data: {
            projectId: resolvedProjectId,
            equipmentId: equipmentId || null,
            name: hw.name as string,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            type: ((hw.type as string) || "OTHER_DEVICE") as any,
            manufacturer: (hw.manufacturer as string) || null,
            model: (hw.model as string) || null,
            ipAddress: (hw.ipAddress as string) || null,
            zone: (hw.zone as string) || null,
          },
        });
        created.hardware++;
      }
    }

    // Create software from template
    if (templateData.software?.length) {
      for (const sw of templateData.software) {
        await prisma.software.create({
          data: {
            projectId: resolvedProjectId,
            equipmentId: equipmentId || null,
            name: sw.name as string,
            version: (sw.version as string) || null,
            vendor: (sw.vendor as string) || null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            swType: ((sw.swType as string) || "APPLICATION") as any,
          },
        });
        created.software++;
      }
    }

    // Apply DFD from template
    let dfdApplied = false;
    if (templateData.dfd?.data && equipmentId) {
      const dfdString = typeof templateData.dfd.data === "string" ? templateData.dfd.data : JSON.stringify(templateData.dfd.data);
      const existing = await prisma.dfdDiagram.findFirst({ where: { equipmentId } });
      if (existing) {
        await prisma.dfdDiagram.update({ where: { id: existing.id }, data: { data: dfdString, source: "TEMPLATE" } });
      } else {
        await prisma.dfdDiagram.create({ data: { projectId: resolvedProjectId, equipmentId, data: dfdString, source: "TEMPLATE" } });
      }
      dfdApplied = true;
    }

    return NextResponse.json({ success: true, created: { ...created, dfd: dfdApplied } });
  } catch {
    return apiError("Failed to apply template", 500);
  }
}
