import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** GET /api/vendor/templates — list templates for current vendor */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const templates = await prisma.equipmentTemplate.findMany({
    where: { vendorId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(templates);
}

/** POST /api/vendor/templates — save equipment as template */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  try {
    const body = await request.json();
    const { name, equipmentId, projectId } = body;

    if (!name?.trim()) return apiError("Template name is required", 400);

    // If equipmentId provided, snapshot hardware/software from that equipment
    let data: Record<string, unknown> = {};
    if (equipmentId) {
      // Verify vendor owns this equipment
      const eq = await prisma.equipment.findFirst({
        where: {
          id: equipmentId,
          vendors: { some: { id: user.id } },
        },
        select: { projectId: true },
      });
      if (!eq) return apiError("Equipment not found or access denied", 403);

      const [hardware, software, dfd] = await Promise.all([
        prisma.hardware.findMany({ where: { equipmentId } }),
        prisma.software.findMany({ where: { equipmentId } }),
        prisma.dfdDiagram.findFirst({ where: { equipmentId }, select: { data: true, source: true } }),
      ]);
      const dfdData = dfd?.data ? (typeof dfd.data === "string" ? JSON.parse(dfd.data) : dfd.data) : null;
      data = { hardware, software, dfd: dfd ? { data: dfdData, source: dfd.source } : null, equipmentId };
    } else if (projectId) {
      // Verify user has access to this project
      const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId ?? null);
      if (!hasAccess) return apiError("Project access denied", 403);

      const [hardware, software] = await Promise.all([
        prisma.hardware.findMany({ where: { projectId } }),
        prisma.software.findMany({ where: { projectId } }),
      ]);
      data = { hardware, software, projectId };
    }

    const template = await prisma.equipmentTemplate.create({
      data: {
        vendorId: user.id,
        name: name.trim(),
        data: JSON.stringify(data),
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch {
    return apiError("Failed to create template", 500);
  }
}

/** PATCH /api/vendor/templates — rename template */
export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { id, name } = await request.json();
  if (!id || !name?.trim()) return apiError("id and name required", 400);

  const template = await prisma.equipmentTemplate.findUnique({ where: { id } });
  if (!template) return apiError("Not found", 404);
  if (template.vendorId !== user.id) return apiError("Forbidden", 403);

  const updated = await prisma.equipmentTemplate.update({
    where: { id },
    data: { name: name.trim() },
  });
  return NextResponse.json(updated);
}

/** DELETE /api/vendor/templates?id=xxx — delete template */
export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return apiError("id is required", 400);

  const template = await prisma.equipmentTemplate.findUnique({ where: { id } });
  if (!template) return apiError("Not found", 404);
  if (template.vendorId !== user.id) return apiError("Forbidden", 403);

  await prisma.equipmentTemplate.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
