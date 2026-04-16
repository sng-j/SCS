import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { safeError } from "@/lib/safe-log";

export const dynamic = "force-dynamic";

/** GET /api/vendor/export?equipmentId=xxx — export equipment full config */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "VENDOR") return apiError("Vendor only", 403);

  const { searchParams } = new URL(request.url);
  const equipmentId = searchParams.get("equipmentId");
  if (!equipmentId) return apiError("equipmentId is required", 400);

  const equipment = await prisma.equipment.findFirst({
    where: {
      id: equipmentId,
      OR: [
        { vendorId: user.id },
        { vendors: { some: { id: user.id } } }
      ]
    },
    select: { id: true, name: true, description: true },
  });
  if (!equipment) return apiError("Equipment not found or not yours", 404);

  const [hardware, software, dfd] = await Promise.all([
    prisma.hardware.findMany({
      where: { equipmentId },
      select: {
        name: true, type: true, manufacturer: true, model: true,
        ipAddress: true, macAddress: true, zone: true, location: true,
        brand: true, identifier: true, category: true,
        physicalInterface: true, commProtocols: true,
        logicalLocation: true, purpose: true, protectionMethod: true,
      },
    }),
    prisma.software.findMany({
      where: { equipmentId },
      select: {
        name: true, version: true, vendor: true, swType: true,
        cpe: true, brand: true, listeningPort: true, purpose: true,
        hardwareId: true,
      },
    }),
    prisma.dfdDiagram.findFirst({
      where: { equipmentId },
      select: { data: true, source: true },
    }),
  ]);

  // Map software hardwareId to hardware name for portability
  const hwIdMap = new Map<string, string>();
  const hwList = await prisma.hardware.findMany({
    where: { equipmentId },
    select: { id: true, name: true },
  });
  hwList.forEach((h) => hwIdMap.set(h.id, h.name));

  const swExport = software.map((sw) => ({
    ...sw,
    hardwareId: undefined,
    hardwareName: sw.hardwareId ? hwIdMap.get(sw.hardwareId) ?? null : null,
  }));

  const dfdData = dfd?.data ? (typeof dfd.data === 'string' ? JSON.parse(dfd.data) : dfd.data) : null;
  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    equipmentName: equipment.name,
    equipmentDescription: equipment.description,
    hardware,
    software: swExport,
    dfd: dfd ? { data: dfdData, source: dfd.source } : null,
  };

  return NextResponse.json(exportData);
}

/** POST /api/vendor/export — import equipment config into target equipment */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "VENDOR") return apiError("Vendor only", 403);

  try {
    const body = await request.json();
    const { equipmentId, data } = body;

    if (!equipmentId || !data) return apiError("equipmentId and data are required", 400);

    const equipment = await prisma.equipment.findFirst({
      where: {
        id: equipmentId,
        OR: [
          { vendorId: user.id },
          { vendors: { some: { id: user.id } } }
        ]
      },
      include: { project: { select: { id: true } } },
    });
    if (!equipment) return apiError("Equipment not found or not yours", 404);

    // Check lock status
    if (["SUBMITTED", "APPROVED"].includes(equipment.status)) {
      return apiError("Cannot modify submitted/approved equipment", 403);
    }

    const projectId = equipment.project.id;
    let hwCreated = 0;
    let swCreated = 0;

    // Delete existing HW/SW before importing (replace, not add)
    await prisma.software.deleteMany({ where: { equipmentId } });
    await prisma.hardware.deleteMany({ where: { equipmentId } });

    // Import hardware
    const hwNameToId = new Map<string, string>();
    if (Array.isArray(data.hardware)) {
      for (const hw of data.hardware) {
        const created = await prisma.hardware.create({
          data: {
            projectId,
            equipmentId,
            name: hw.name ?? "Imported HW",
            type: hw.type ?? "OTHER_DEVICE",
            manufacturer: hw.manufacturer ?? null,
            model: hw.model ?? null,
            ipAddress: hw.ipAddress ?? null,
            macAddress: hw.macAddress ?? null,
            zone: hw.zone ?? null,
            location: hw.location ?? null,
            brand: hw.brand ?? null,
            identifier: hw.identifier ?? null,
            category: hw.category ?? null,
            physicalInterface: hw.physicalInterface ?? null,
            commProtocols: hw.commProtocols ?? null,
            logicalLocation: hw.logicalLocation ?? null,
            purpose: hw.purpose ?? null,
            protectionMethod: hw.protectionMethod ?? null,
          },
        });
        hwNameToId.set(hw.name, created.id);
        hwCreated++;
      }
    }

    // Import software
    if (Array.isArray(data.software)) {
      for (const sw of data.software) {
        const linkedHwId = sw.hardwareName ? hwNameToId.get(sw.hardwareName) ?? null : null;
        await prisma.software.create({
          data: {
            projectId,
            equipmentId,
            hardwareId: linkedHwId,
            name: sw.name ?? "Imported SW",
            version: sw.version ?? null,
            vendor: sw.vendor ?? null,
            swType: sw.swType ?? "APPLICATION",
            cpe: sw.cpe ?? null,
            brand: sw.brand ?? null,
            listeningPort: sw.listeningPort ?? null,
            purpose: sw.purpose ?? null,
          },
        });
        swCreated++;
      }
    }

    // Import DFD
    let dfdImported = false;
    if (data.dfd?.data) {
      const dfdString = typeof data.dfd.data === 'string' ? data.dfd.data : JSON.stringify(data.dfd.data);
      const existing = await prisma.dfdDiagram.findFirst({ where: { equipmentId } });
      if (existing) {
        await prisma.dfdDiagram.update({
          where: { id: existing.id },
          data: { data: dfdString, source: "IMPORT" },
        });
      } else {
        await prisma.dfdDiagram.create({
          data: {
            projectId,
            equipmentId,
            data: dfdString,
            source: "IMPORT",
          },
        });
      }
      dfdImported = true;
    }

    // Update equipment status to IN_PROGRESS if still PENDING
    if (equipment.status === "PENDING") {
      await prisma.equipment.update({
        where: { id: equipmentId },
        data: { status: "IN_PROGRESS" },
      });
    }

    return NextResponse.json({
      success: true,
      created: { hardware: hwCreated, software: swCreated, dfd: dfdImported },
    });
  } catch (err) {
    safeError("vendor/export POST", err);
    return apiError("Failed to import data", 500);
  }
}
