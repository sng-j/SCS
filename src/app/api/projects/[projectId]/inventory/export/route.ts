import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSessionUser,
  verifyProjectAccess,
  apiError,
} from "@/lib/auth-helpers";
import ExcelJS from "exceljs";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

/** GET /api/projects/[projectId]/inventory/export — export assets as xlsx */
export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  try {
    const [hardware, software, project] = await Promise.all([
      prisma.hardware.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.software.findMany({
        where: { projectId },
        include: { hardware: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.project.findUnique({
        where: { id: projectId },
        select: { vesselName: true, systemName: true },
      }),
    ]);

    const vesselName = project?.vesselName ?? "Project";

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SCS v13";
    workbook.created = new Date();

    // ─── Hardware Sheet (E27-compatible columns matching v12 format) ───
    const hwSheet = workbook.addWorksheet("Hardware");

    hwSheet.columns = [
      { header: "HW Component Name", key: "name", width: 28 },
      { header: "Device type", key: "type", width: 18 },
      { header: "Brand", key: "brand", width: 18 },
      { header: "Manufacturer", key: "manufacturer", width: 22 },
      { header: "HW Model", key: "model", width: 22 },
      { header: "Identifier", key: "identifier", width: 20 },
      { header: "Category", key: "category", width: 16 },
      { header: "Physical interface", key: "physicalInterface", width: 22 },
      { header: "IP address", key: "ipAddress", width: 18 },
      { header: "MAC Address", key: "macAddress", width: 20 },
      { header: "Supported communication protocols and port number", key: "commProtocols", width: 38 },
      { header: "Category of system software", key: "sysSoftwareCategory", width: 26 },
      { header: "Version and patch level of system software", key: "sysSoftwareVersion", width: 30 },
      { header: "Physical location", key: "location", width: 22 },
      { header: "Logical location", key: "logicalLocation", width: 22 },
      { header: "Zone", key: "zone", width: 18 },
      { header: "Purpose", key: "purpose", width: 30 },
      { header: "Protection method", key: "protectionMethod", width: 30 },
    ];

    // Style header row
    const hwHeaderRow = hwSheet.getRow(1);
    hwHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    hwHeaderRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F62FE" },
    };
    hwHeaderRow.alignment = { vertical: "middle", wrapText: true };
    hwHeaderRow.height = 36;

    for (const hw of hardware) {
      hwSheet.addRow({
        name: hw.name,
        type: hw.type,
        brand: hw.brand ?? "",
        manufacturer: hw.manufacturer ?? "",
        model: hw.model ?? "",
        identifier: hw.identifier ?? "",
        category: hw.category ?? "",
        physicalInterface: hw.physicalInterface ?? "",
        ipAddress: hw.ipAddress ?? "",
        macAddress: hw.macAddress ?? "",
        commProtocols: hw.commProtocols ?? "",
        sysSoftwareCategory: hw.sysSoftwareCategory ?? "",
        sysSoftwareVersion: hw.sysSoftwareVersion ?? "",
        location: hw.location ?? "",
        logicalLocation: hw.logicalLocation ?? "",
        zone: hw.zone ?? "",
        purpose: hw.purpose ?? "",
        protectionMethod: hw.protectionMethod ?? "",
      });
    }

    // ─── Software Sheet (E27-compatible columns matching v12 format) ───
    const swSheet = workbook.addWorksheet("Software");

    swSheet.columns = [
      { header: "SW Component Name", key: "name", width: 28 },
      { header: "Type", key: "swType", width: 16 },
      { header: "Brand", key: "brand", width: 18 },
      { header: "Manufacturer", key: "vendor", width: 22 },
      { header: "Version and patch level of software", key: "version", width: 28 },
      { header: "Installed HW Location", key: "linkedHardware", width: 28 },
      { header: "Required listening port number", key: "listeningPort", width: 26 },
      { header: "Purpose", key: "purpose", width: 30 },
      { header: "CPE", key: "cpe", width: 50 },
    ];

    const swHeaderRow = swSheet.getRow(1);
    swHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    swHeaderRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F62FE" },
    };
    swHeaderRow.alignment = { vertical: "middle", wrapText: true };
    swHeaderRow.height = 36;

    for (const sw of software) {
      swSheet.addRow({
        name: sw.name,
        swType: sw.swType,
        brand: sw.brand ?? "",
        vendor: sw.vendor ?? "",
        version: sw.version ?? "",
        linkedHardware: sw.hardware?.name ?? "",
        listeningPort: sw.listeningPort ?? "",
        purpose: sw.purpose ?? "",
        cpe: sw.cpe ?? "",
      });
    }

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `${vesselName.replace(/[^a-zA-Z0-9_\-]/g, "_")}_inventory.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to export inventory";
    return apiError(message, 500);
  }
}
