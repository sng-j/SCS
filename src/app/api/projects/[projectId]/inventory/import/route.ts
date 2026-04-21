import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getSessionUser,
  verifyProjectAccess,
  apiError,
  isWriteRole,
} from "@/lib/auth-helpers";
import ExcelJS from "exceljs";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

const VALID_HW_TYPES = [
  "PLC",
  "SERVER",
  "SENSOR",
  "NETWORK_DEVICE",
  "PC",
  "OTHER_DEVICE",
];
const VALID_SW_TYPES = ["OS", "APPLICATION", "FIRMWARE", "DRIVER", "LIBRARY", "MIDDLEWARE"];

// ─── Column alias mapping (v12 + v13 headers → canonical key) ───────────────

/** Resolve a normalized header string to its canonical field name */
function resolveHwColumn(normalized: string): string | null {
  const map: Record<string, string> = {
    // v13 simple headers
    name: "name",
    type: "type",
    manufacturer: "manufacturer",
    model: "model",
    ipaddress: "ipAddress",
    ip: "ipAddress",
    ipadr: "ipAddress",
    macaddress: "macAddress",
    mac: "macAddress",
    macadr: "macAddress",
    zone: "zone",
    location: "location",
    // v12 E27 headers (normalized: lowered, spaces removed)
    hwcomponentname: "name",
    devicetype: "type",
    brand: "brand",
    hwmodel: "model",
    identifier: "identifier",
    category: "category",
    physicalinterface: "physicalInterface",
    supportedcommunicationprotocolsandportnumber: "commProtocols",
    commprotocols: "commProtocols",
    categoryofsystemsoftware: "sysSoftwareCategory",
    syssoftwarecategory: "sysSoftwareCategory",
    versionandpatchlevelofsystemsoftware: "sysSoftwareVersion",
    syssoftwareversion: "sysSoftwareVersion",
    physicallocation: "location",
    logicallocation: "logicalLocation",
    purpose: "purpose",
    protectionmethod: "protectionMethod",
  };
  return map[normalized] ?? null;
}

function resolveSwColumn(normalized: string): string | null {
  const map: Record<string, string> = {
    // v13 simple headers
    name: "name",
    version: "version",
    vendor: "vendor",
    type: "swType",
    swtype: "swType",
    cpe: "cpe",
    linkedhardware: "linkedHardware",
    hardware: "linkedHardware",
    linkedhw: "linkedHardware",
    // v12 E27 headers
    swcomponentname: "name",
    brand: "brand",
    manufacturer: "vendor",
    versionandpatchlevelofsoftware: "version",
    installedhwlocation: "linkedHardware",
    requiredlisteningportnumber: "listeningPort",
    listeningport: "listeningPort",
    purpose: "purpose",
  };
  return map[normalized] ?? null;
}

/** POST /api/projects/[projectId]/inventory/import — import assets from xlsx */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);
  if (!isWriteRole(user.role)) return apiError("Read-only role cannot modify this resource", 403);

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return apiError("No file provided", 400);
    }

    const arrayBuffer = await file.arrayBuffer();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer as ArrayBuffer);

    let hardwareCreated = 0;
    let softwareCreated = 0;
    let skipped = 0;

    // ─── Parse Hardware Sheet ───────────────────────────────────────────

    const hwSheet = workbook.getWorksheet("Hardware");
    if (hwSheet) {
      // Build column mapping: canonical field name → column number
      const colMap: Record<string, number> = {};
      const headerRow = hwSheet.getRow(1);
      headerRow.eachCell((cell, colNumber) => {
        const normalized = String(cell.value ?? "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "");
        const field = resolveHwColumn(normalized);
        if (field && !colMap[field]) {
          colMap[field] = colNumber;
        }
      });

      const nameCol = colMap["name"];
      const typeCol = colMap["type"];

      if (nameCol) {
        const hwData: Record<string, unknown>[] = [];

        hwSheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return;

          const name = String(row.getCell(nameCol).value ?? "").trim();
          if (!name) {
            skipped++;
            return;
          }

          const rawType = typeCol
            ? String(row.getCell(typeCol).value ?? "")
                .trim()
                .toUpperCase()
                .replace(/[\s-]+/g, "_")
            : "OTHER_DEVICE";

          const type = VALID_HW_TYPES.includes(rawType)
            ? rawType
            : "OTHER_DEVICE";

          const cell = (field: string) =>
            colMap[field]
              ? String(row.getCell(colMap[field]).value ?? "").trim() || null
              : null;

          hwData.push({
            projectId,
            name,
            type,
            manufacturer: cell("manufacturer"),
            model: cell("model"),
            ipAddress: cell("ipAddress"),
            macAddress: cell("macAddress"),
            zone: cell("zone"),
            location: cell("location"),
            brand: cell("brand"),
            identifier: cell("identifier"),
            category: cell("category"),
            physicalInterface: cell("physicalInterface"),
            commProtocols: cell("commProtocols"),
            logicalLocation: cell("logicalLocation"),
            purpose: cell("purpose"),
            protectionMethod: cell("protectionMethod"),
            sysSoftwareCategory: cell("sysSoftwareCategory"),
            sysSoftwareVersion: cell("sysSoftwareVersion"),
          });
        });

        if (hwData.length > 0) {
          const result = await prisma.hardware.createMany({
            data: hwData as Prisma.HardwareCreateManyInput[],
          });
          hardwareCreated = result.count;
        }
      }
    }

    // ─── Parse Software Sheet ───────────────────────────────────────────

    const swSheet = workbook.getWorksheet("Software");
    if (swSheet) {
      const colMap: Record<string, number> = {};
      const headerRow = swSheet.getRow(1);
      headerRow.eachCell((cell, colNumber) => {
        const normalized = String(cell.value ?? "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "");
        const field = resolveSwColumn(normalized);
        if (field && !colMap[field]) {
          colMap[field] = colNumber;
        }
      });

      const nameCol = colMap["name"];

      if (nameCol) {
        // Pre-fetch existing hardware for linking by name
        const existingHw = await prisma.hardware.findMany({
          where: { projectId },
          select: { id: true, name: true },
        });
        const hwNameMap = new Map(
          existingHw.map((h) => [h.name.toLowerCase(), h.id]),
        );

        const swData: Record<string, unknown>[] = [];

        swSheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return;

          const name = String(row.getCell(nameCol).value ?? "").trim();
          if (!name) {
            skipped++;
            return;
          }

          const cell = (field: string) =>
            colMap[field]
              ? String(row.getCell(colMap[field]).value ?? "").trim() || null
              : null;

          const rawType = cell("swType")?.toUpperCase().replace(/[\s-]+/g, "_") ?? "APPLICATION";
          const swType = VALID_SW_TYPES.includes(rawType) ? rawType : "APPLICATION";

          let hardwareId: string | null = null;
          const linkedName = cell("linkedHardware");
          if (linkedName) {
            hardwareId = hwNameMap.get(linkedName.toLowerCase()) ?? null;
          }

          swData.push({
            projectId,
            name,
            version: cell("version"),
            vendor: cell("vendor"),
            swType,
            hardwareId,
            cpe: cell("cpe"),
            brand: cell("brand"),
            listeningPort: cell("listeningPort"),
            purpose: cell("purpose"),
          });
        });

        if (swData.length > 0) {
          const result = await prisma.software.createMany({
            data: swData as Prisma.SoftwareCreateManyInput[],
          });
          softwareCreated = result.count;
        }
      }
    }

    return NextResponse.json({
      created: { hardware: hardwareCreated, software: softwareCreated },
      skipped,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to import file";
    return apiError(message, 500);
  }
}
