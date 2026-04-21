import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError, isWriteRole } from "@/lib/auth-helpers";
import { safeError } from "@/lib/safe-log";
import { trackChange } from "@/lib/change-tracker";
import { logAction } from "@/lib/action-logger";
import ExcelJS from "exceljs";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

// ─── HW Type mapping ────────────────────────────────────────────────────────

const HW_TYPE_MAP: Record<string, string> = {
  computing_device: "SERVER",
  server: "SERVER",
  storage_device: "SERVER",
  switch: "NETWORK_DEVICE",
  router: "NETWORK_DEVICE",
  firewall: "NETWORK_DEVICE",
  gateway: "NETWORK_DEVICE",
  access_point: "NETWORK_DEVICE",
  bridge: "NETWORK_DEVICE",
  hmi: "PC",
  workstation: "PC",
  navigation_control_hardware: "PC",
  communication_equipment: "OTHER_DEVICE",
  plc: "PLC",
  engine_machinery_control: "PLC",
  sensors_monitoring: "SENSOR",
  sensor: "SENSOR",
  security_equipment: "OTHER_DEVICE",
  other: "OTHER_DEVICE",
};

function mapHwType(rawType: string): { type: string; subType: string } {
  const lower = (rawType || "").toLowerCase().trim();
  return {
    type: HW_TYPE_MAP[lower] || "OTHER_DEVICE",
    subType: lower,
  };
}

// ─── Helper: read cell value ─────────────────────────────────────────────────

function cellStr(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "object" && "text" in v) return String(v.text || "");
  if (typeof v === "object" && "result" in v) return String(v.result || "");
  return String(v);
}

// ─── POST /api/projects/[projectId]/inventory/import-bulk ────────────────────

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
    const equipmentId = formData.get("equipmentId") as string | null;

    if (!file) return apiError("No file uploaded", 400);

    const arrayBuf = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(arrayBuf as any);

    // Validate bulk format — must have HW or SW sheet
    const hasHW = !!wb.getWorksheet("HW");
    const hasSW = !!wb.getWorksheet("SW");
    if (!hasHW && !hasSW) {
      return apiError("Not a bulk format file (missing HW/SW sheets)", 422);
    }

    const results = {
      cbs: { created: 0, skipped: 0 },
      hardware: { created: 0, skipped: 0 },
      software: { created: 0, skipped: 0 },
      connections: { created: 0 },
    };

    // ── 1. Process CBS sheet → build cat mapping ────────────────────────

    const cbsCatMap = new Map<string, string>(); // shipSystemId → cat (1/2/3)
    const cbsSheet = wb.getWorksheet("CBS");
    if (cbsSheet) {
      const dataStartRow = 4;
      for (let r = dataStartRow; r <= cbsSheet.rowCount; r++) {
        const row = cbsSheet.getRow(r);
        const sysId = cellStr(row.getCell(1)).trim();
        const cat = cellStr(row.getCell(7)).trim();
        if (sysId && cat) cbsCatMap.set(sysId, cat);
      }
      results.cbs.created = cbsCatMap.size;

      // If equipmentId provided, update Equipment with first CBS row
      if (equipmentId) {
        const firstDataRow = cbsSheet.getRow(dataStartRow);
        const sysName = cellStr(firstDataRow.getCell(2));
        if (sysName) {
          await prisma.equipment.update({
            where: { id: equipmentId },
            data: {
              shipSystemId: cellStr(firstDataRow.getCell(1)) || undefined,
              securityCategory: parseInt(cellStr(firstDataRow.getCell(7))) || undefined,
              cidr: cellStr(firstDataRow.getCell(9)) || undefined,
              isTypeApproved: cellStr(firstDataRow.getCell(8)) === "1",
              manufacturerName: cellStr(firstDataRow.getCell(4)) || undefined,
              productModelName: cellStr(firstDataRow.getCell(6)) || undefined,
            },
          });
        }
      }
    }

    // ── 2. Process HW sheet ───────────────────────────────────────────────

    const hwSheet = wb.getWorksheet("HW");
    const hwNameToId = new Map<string, string>(); // For SW linking

    if (hwSheet) {
      const headers = hwSheet.getRow(1);
      const colMap: Record<string, number> = {};
      headers.eachCell((cell, colNum) => {
        colMap[cellStr(cell).trim()] = colNum;
      });

      const dataStartRow = 4;
      for (let r = dataStartRow; r <= hwSheet.rowCount; r++) {
        const row = hwSheet.getRow(r);
        const name = cellStr(row.getCell(colMap["hardwareName"] || 3)).trim();
        if (!name) continue;

        // Check duplicate
        const existing = await prisma.hardware.findFirst({
          where: { projectId, name, ...(equipmentId ? { equipmentId } : {}) },
        });
        if (existing) {
          hwNameToId.set(name, existing.id);
          results.hardware.skipped++;
          continue;
        }

        const rawType = cellStr(row.getCell(colMap["hardwareType"] || 10));
        const { type, subType } = mapHwType(rawType);

        // Map CBS cat to hardware category
        const hwSysId = cellStr(row.getCell(colMap["shipSystemId"] || 1)).trim();
        const cbsCat = cbsCatMap.get(hwSysId) || "";

        // Build additional IPs JSON
        const additionalIps: { ip: string; mac: string; ports: string }[] = [];
        for (let i = 2; i <= 5; i++) {
          const ip = cellStr(row.getCell(colMap[`assetIp${i}`] || (15 + (i - 2) * 3)));
          if (ip && ip !== "N/A") {
            additionalIps.push({
              ip,
              mac: cellStr(row.getCell(colMap[`assetMac${i}`] || (16 + (i - 2) * 3))),
              ports: cellStr(row.getCell(colMap[`assetPorts${i}`] || (17 + (i - 2) * 3))),
            });
          }
        }

        const hw = await prisma.hardware.create({
          data: {
            projectId,
            equipmentId: equipmentId || null,
            name,
            type,
            subType: subType || null,
            category: cbsCat || null,
            manufacturer: cellStr(row.getCell(colMap["hardwareManufacturerName"] || 4)) || null,
            model: cellStr(row.getCell(colMap["hardwareModelName"] || 5)) || null,
            purpose: cellStr(row.getCell(colMap["hardwarePurpose"] || 6)) || null,
            identifier: cellStr(row.getCell(colMap["systemIdentifier"] || 7)) || null,
            zone: cellStr(row.getCell(colMap["remarkZoneName"] || 8)) || null,
            sysSoftwareVersion: cellStr(row.getCell(colMap["hardwareOsVersion"] || 9)) || null,
            physicalInterface: cellStr(row.getCell(colMap["interfaceNames"] || 12)) || null,
            ipAddress: cellStr(row.getCell(colMap["assetIp1"] || 13)) || null,
            macAddress: cellStr(row.getCell(colMap["assetMac1"] || 14)) || null,
            commProtocols: cellStr(row.getCell(colMap["assetPorts1"] || 15)) || null,
            additionalIps: additionalIps.length > 0 ? JSON.stringify(additionalIps) : null,
            resetPeriodDay: parseInt(cellStr(row.getCell(colMap["resetPeriodDay"] || 11))) || null,
          },
        });

        hwNameToId.set(name, hw.id);
        results.hardware.created++;

        trackChange({
          projectId, entityType: "HARDWARE", entityId: hw.id,
          changeType: "CREATE", changedBy: user.id,
        }).catch(() => {});
      }
    }

    // ── 3. Process SW sheet ───────────────────────────────────────────────

    const swSheet = wb.getWorksheet("SW");
    if (swSheet) {
      const headers = swSheet.getRow(1);
      const colMap: Record<string, number> = {};
      headers.eachCell((cell, colNum) => {
        colMap[cellStr(cell).trim()] = colNum;
      });

      const dataStartRow = 4;
      for (let r = dataStartRow; r <= swSheet.rowCount; r++) {
        const row = swSheet.getRow(r);
        const swName = cellStr(row.getCell(colMap["assetSoftwareName"] || 4)).trim();
        if (!swName) continue;

        // Link to hardware
        const linkedHwName = cellStr(row.getCell(colMap["hardwareName"] || 3)).trim();
        const hardwareId = hwNameToId.get(linkedHwName) || null;

        // Determine swType
        let swType = cellStr(row.getCell(colMap["softwareType"] || 10)).toUpperCase().trim();
        if (!["OS", "SOFTWARE", "FIRMWARE", "DRIVER", "LIBRARY", "MIDDLEWARE"].includes(swType)) {
          swType = "APPLICATION";
        }

        const sw = await prisma.software.create({
          data: {
            projectId,
            equipmentId: equipmentId || null,
            hardwareId,
            name: swName,
            version: cellStr(row.getCell(colMap["softwareVersion"] || 7)) || null,
            vendor: cellStr(row.getCell(colMap["assetSoftwareManufacturerName"] || 5)) || null,
            swType,
            purpose: cellStr(row.getCell(colMap["softwarePurpose"] || 9)) || null,
            modelName: cellStr(row.getCell(colMap["assetSoftwareModelName"] || 6)) || null,
            uniqueIdentifier: cellStr(row.getCell(colMap["uniqueIdentifier"] || 8)) || null,
          },
        });

        results.software.created++;

        trackChange({
          projectId, entityType: "SOFTWARE", entityId: sw.id,
          changeType: "CREATE", changedBy: user.id,
        }).catch(() => {});
      }
    }

    // ── 4. Process Connect sheet (DFD edges) ─────────────────────────────

    const connectSheet = wb.getWorksheet("Connect");
    if (connectSheet && hwNameToId.size > 0) {
      const edges: { source: string; target: string }[] = [];

      for (let r = 2; r <= connectSheet.rowCount; r++) {
        const row = connectSheet.getRow(r);
        const fromHw = cellStr(row.getCell(2)).trim();
        const toHw = cellStr(row.getCell(4)).trim();

        const fromId = hwNameToId.get(fromHw);
        const toId = hwNameToId.get(toHw);

        if (fromId && toId && fromId !== toId) {
          edges.push({ source: fromId, target: toId });
          results.connections.created++;
        }
      }

      // Generate DFD from connections
      if (edges.length > 0) {
        const dfdNodes = [...hwNameToId.entries()].map(([name, id]) => ({
          id,
          type: "hardware",
          position: { x: 0, y: 0 },
          data: { label: name, hwType: "SERVER" },
        }));

        const dfdEdges = edges.map((e, i) => ({
          id: `bulk-e-${i}`,
          source: e.source,
          target: e.target,
          type: "smoothstep",
          animated: false,
          data: { connectionType: "ethernet" },
        }));

        // Auto-layout with dagre
        const dagre = (await import("@dagrejs/dagre")).default;
        const g = new dagre.graphlib.Graph();
        g.setDefaultEdgeLabel(() => ({}));
        g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 100 });
        for (const node of dfdNodes) g.setNode(node.id, { width: 180, height: 90 });
        for (const edge of dfdEdges) {
          if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
            g.setEdge(edge.source, edge.target);
          }
        }
        dagre.layout(g);

        const layoutedNodes = dfdNodes.map((node) => {
          const pos = g.node(node.id);
          return pos ? { ...node, position: { x: pos.x - 90, y: pos.y - 45 } } : node;
        });

        const dfdData = JSON.stringify({ nodes: layoutedNodes, edges: dfdEdges });

        if (equipmentId) {
          await prisma.dfdDiagram.upsert({
            where: { equipmentId },
            create: { projectId, equipmentId, data: dfdData, source: "IMPORT" },
            update: { data: dfdData, source: "IMPORT", version: { increment: 1 } },
          });
        } else {
          const existing = await prisma.dfdDiagram.findFirst({
            where: { projectId, equipmentId: null },
          });
          if (existing) {
            await prisma.dfdDiagram.update({
              where: { id: existing.id },
              data: { data: dfdData, source: "IMPORT", version: { increment: 1 } },
            });
          } else {
            await prisma.dfdDiagram.create({
              data: { projectId, data: dfdData, source: "IMPORT" },
            });
          }
        }
      }
    }

    logAction(user.id, "EXCEL_IMPORT", { entity: "bulk", projectId, data: { hwCount: results.hardware.created, swCount: results.software.created } }).catch(() => {});

    return NextResponse.json({
      success: true,
      created: {
        cbs: results.cbs.created,
        hardware: results.hardware.created,
        software: results.software.created,
        connections: results.connections.created,
      },
      skipped: {
        hardware: results.hardware.skipped,
      },
    });
  } catch (err) {
    safeError("import-bulk POST", err);
    return apiError("Import failed: " + (err instanceof Error ? err.message : "Unknown error"), 500);
  }
}
