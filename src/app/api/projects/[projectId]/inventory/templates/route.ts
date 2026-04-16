import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSessionUser,
  verifyProjectAccess,
  apiError,
} from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

// ─── Template Data Types ─────────────────────────────────────────────────────

interface TemplateHwItem {
  name: string;
  type: "PLC" | "SERVER" | "SENSOR" | "NETWORK_DEVICE" | "PC" | "OTHER_DEVICE";
  manufacturer: string;
  model: string;
  zone: string;
  location: string;
}

interface TemplateSwItem {
  name: string;
  version: string;
  vendor: string;
  swType: "OS" | "APPLICATION" | "FIRMWARE" | "DRIVER" | "LIBRARY";
  linkedHardware: string; // name of hardware to link
}

interface SystemTemplate {
  id: string;
  name: string;
  nameKo: string;
  description: string;
  descriptionKo: string;
  category: string;
  hardware: TemplateHwItem[];
  software: TemplateSwItem[];
}

// ─── Maritime CBS Templates ──────────────────────────────────────────────────

const SYSTEM_TEMPLATES: SystemTemplate[] = [
  {
    id: "ias",
    name: "IAS (Integrated Automation System)",
    nameKo: "IAS (통합 자동화 시스템)",
    description:
      "Standard IAS setup with PLCs, operator stations, engineering workstation, and control network",
    descriptionKo:
      "PLC, 운영 스테이션, 엔지니어링 워크스테이션 및 제어 네트워크를 포함한 표준 IAS 구성",
    category: "automation",
    hardware: [
      {
        name: "IAS Main PLC",
        type: "PLC",
        manufacturer: "Kongsberg",
        model: "K-Chief 700",
        zone: "propulsion",
        location: "Engine Control Room",
      },
      {
        name: "IAS Backup PLC",
        type: "PLC",
        manufacturer: "Kongsberg",
        model: "K-Chief 700",
        zone: "propulsion",
        location: "Engine Control Room",
      },
      {
        name: "IAS Operator Station #1",
        type: "PC",
        manufacturer: "Kongsberg",
        model: "C20 Operator Station",
        zone: "propulsion",
        location: "Engine Control Room",
      },
      {
        name: "IAS Operator Station #2 (Bridge)",
        type: "PC",
        manufacturer: "Kongsberg",
        model: "C20 Operator Station",
        zone: "navigation",
        location: "Bridge",
      },
      {
        name: "IAS Engineering Workstation",
        type: "PC",
        manufacturer: "Dell",
        model: "Precision 3640",
        zone: "propulsion",
        location: "Engine Control Room",
      },
      {
        name: "IAS Process Network Switch",
        type: "NETWORK_DEVICE",
        manufacturer: "Hirschmann",
        model: "RSP30",
        zone: "propulsion",
        location: "Engine Control Room",
      },
      {
        name: "IAS Temperature Sensor Array",
        type: "SENSOR",
        manufacturer: "Danfoss",
        model: "MBS 3000",
        zone: "propulsion",
        location: "Engine Room",
      },
      {
        name: "IAS Pressure Sensor Array",
        type: "SENSOR",
        manufacturer: "Danfoss",
        model: "MBS 3050",
        zone: "propulsion",
        location: "Engine Room",
      },
    ],
    software: [
      {
        name: "K-Chief 700 Firmware",
        version: "8.2",
        vendor: "Kongsberg",
        swType: "FIRMWARE",
        linkedHardware: "IAS Main PLC",
      },
      {
        name: "K-Chief 700 Firmware",
        version: "8.2",
        vendor: "Kongsberg",
        swType: "FIRMWARE",
        linkedHardware: "IAS Backup PLC",
      },
      {
        name: "K-Chief Operator Software",
        version: "8.2.1",
        vendor: "Kongsberg",
        swType: "APPLICATION",
        linkedHardware: "IAS Operator Station #1",
      },
      {
        name: "Windows 10 IoT Enterprise LTSC",
        version: "10.0.17763",
        vendor: "Microsoft",
        swType: "OS",
        linkedHardware: "IAS Operator Station #1",
      },
      {
        name: "K-Chief Engineering Tool",
        version: "8.2.1",
        vendor: "Kongsberg",
        swType: "APPLICATION",
        linkedHardware: "IAS Engineering Workstation",
      },
    ],
  },
  {
    id: "ecdis",
    name: "ECDIS (Electronic Chart Display)",
    nameKo: "ECDIS (전자해도표시시스템)",
    description:
      "ECDIS dual-station setup with chart display units, GPS receiver, and navigation network",
    descriptionKo:
      "차트 디스플레이 유닛, GPS 수신기, 항해 네트워크를 포함한 ECDIS 이중 스테이션 구성",
    category: "navigation",
    hardware: [
      {
        name: "ECDIS Station #1 (Primary)",
        type: "PC",
        manufacturer: "Furuno",
        model: "FMD-3200",
        zone: "navigation",
        location: "Bridge",
      },
      {
        name: "ECDIS Station #2 (Backup)",
        type: "PC",
        manufacturer: "Furuno",
        model: "FMD-3200",
        zone: "navigation",
        location: "Bridge",
      },
      {
        name: "GPS Receiver",
        type: "SENSOR",
        manufacturer: "Furuno",
        model: "GP-170",
        zone: "navigation",
        location: "Bridge Top",
      },
      {
        name: "Navigation Network Switch",
        type: "NETWORK_DEVICE",
        manufacturer: "Moxa",
        model: "EDS-408A",
        zone: "navigation",
        location: "Bridge",
      },
      {
        name: "AIS Transponder",
        type: "OTHER_DEVICE",
        manufacturer: "Furuno",
        model: "FA-170",
        zone: "navigation",
        location: "Bridge",
      },
    ],
    software: [
      {
        name: "FMD-3200 Chart Software",
        version: "3.01",
        vendor: "Furuno",
        swType: "APPLICATION",
        linkedHardware: "ECDIS Station #1 (Primary)",
      },
      {
        name: "Windows 7 Embedded",
        version: "6.1.7601",
        vendor: "Microsoft",
        swType: "OS",
        linkedHardware: "ECDIS Station #1 (Primary)",
      },
      {
        name: "FMD-3200 Chart Software",
        version: "3.01",
        vendor: "Furuno",
        swType: "APPLICATION",
        linkedHardware: "ECDIS Station #2 (Backup)",
      },
      {
        name: "GP-170 Firmware",
        version: "2.10",
        vendor: "Furuno",
        swType: "FIRMWARE",
        linkedHardware: "GPS Receiver",
      },
    ],
  },
  {
    id: "vdr",
    name: "VDR (Voyage Data Recorder)",
    nameKo: "VDR (항해 데이터 기록장치)",
    description:
      "Voyage Data Recorder with data acquisition unit, sensors, and capsule",
    descriptionKo:
      "데이터 수집 장치, 센서, 캡슐을 포함한 항해 데이터 기록장치",
    category: "navigation",
    hardware: [
      {
        name: "VDR Data Acquisition Unit",
        type: "SERVER",
        manufacturer: "Danelec",
        model: "DM100",
        zone: "navigation",
        location: "Bridge",
      },
      {
        name: "VDR Bridge Microphone",
        type: "SENSOR",
        manufacturer: "Danelec",
        model: "DM100-MIC",
        zone: "navigation",
        location: "Bridge",
      },
      {
        name: "VDR Radar Interface",
        type: "OTHER_DEVICE",
        manufacturer: "Danelec",
        model: "DM100-RADAR",
        zone: "navigation",
        location: "Bridge",
      },
      {
        name: "VDR Protective Capsule",
        type: "OTHER_DEVICE",
        manufacturer: "Danelec",
        model: "DM100-FRC",
        zone: "navigation",
        location: "Upper Deck",
      },
    ],
    software: [
      {
        name: "DM100 VDR Firmware",
        version: "4.20",
        vendor: "Danelec",
        swType: "FIRMWARE",
        linkedHardware: "VDR Data Acquisition Unit",
      },
      {
        name: "VDR Playback Software",
        version: "2.3",
        vendor: "Danelec",
        swType: "APPLICATION",
        linkedHardware: "VDR Data Acquisition Unit",
      },
    ],
  },
  {
    id: "engine-monitoring",
    name: "Engine Monitoring System",
    nameKo: "엔진 모니터링 시스템",
    description:
      "Engine room monitoring with PLCs, temperature/pressure sensors, HMIs, and alarm system",
    descriptionKo:
      "PLC, 온도/압력 센서, HMI, 경보 시스템을 포함한 기관실 모니터링 시스템",
    category: "propulsion",
    hardware: [
      {
        name: "Engine Monitoring PLC #1 (M/E)",
        type: "PLC",
        manufacturer: "ABB",
        model: "AC500-S",
        zone: "propulsion",
        location: "Engine Room",
      },
      {
        name: "Engine Monitoring PLC #2 (Aux)",
        type: "PLC",
        manufacturer: "ABB",
        model: "AC500-S",
        zone: "propulsion",
        location: "Engine Room",
      },
      {
        name: "Engine Room HMI Panel #1",
        type: "PC",
        manufacturer: "ABB",
        model: "CP620",
        zone: "propulsion",
        location: "Engine Control Room",
      },
      {
        name: "Engine Room HMI Panel #2",
        type: "PC",
        manufacturer: "ABB",
        model: "CP620",
        zone: "propulsion",
        location: "Engine Room",
      },
      {
        name: "M/E Exhaust Temp Sensor Array",
        type: "SENSOR",
        manufacturer: "ABB",
        model: "TTF300",
        zone: "propulsion",
        location: "Engine Room",
      },
      {
        name: "M/E Bearing Temp Sensors",
        type: "SENSOR",
        manufacturer: "ABB",
        model: "TSP300",
        zone: "propulsion",
        location: "Engine Room",
      },
      {
        name: "M/E LO Pressure Sensor",
        type: "SENSOR",
        manufacturer: "ABB",
        model: "266DSH",
        zone: "propulsion",
        location: "Engine Room",
      },
      {
        name: "Engine Alarm Server",
        type: "SERVER",
        manufacturer: "ABB",
        model: "Ability Symphony Plus",
        zone: "propulsion",
        location: "Engine Control Room",
      },
      {
        name: "Engine Network Switch",
        type: "NETWORK_DEVICE",
        manufacturer: "Hirschmann",
        model: "SPIDER III",
        zone: "propulsion",
        location: "Engine Control Room",
      },
    ],
    software: [
      {
        name: "AC500-S Safety Firmware",
        version: "3.1.2",
        vendor: "ABB",
        swType: "FIRMWARE",
        linkedHardware: "Engine Monitoring PLC #1 (M/E)",
      },
      {
        name: "AC500-S Safety Firmware",
        version: "3.1.2",
        vendor: "ABB",
        swType: "FIRMWARE",
        linkedHardware: "Engine Monitoring PLC #2 (Aux)",
      },
      {
        name: "ABB Panel Builder",
        version: "6.1",
        vendor: "ABB",
        swType: "APPLICATION",
        linkedHardware: "Engine Room HMI Panel #1",
      },
      {
        name: "Symphony Plus Alarm Server",
        version: "6.1",
        vendor: "ABB",
        swType: "APPLICATION",
        linkedHardware: "Engine Alarm Server",
      },
      {
        name: "Windows 10 IoT Enterprise LTSC",
        version: "10.0.17763",
        vendor: "Microsoft",
        swType: "OS",
        linkedHardware: "Engine Alarm Server",
      },
    ],
  },
];

/** GET /api/projects/[projectId]/inventory/templates — list available templates */
export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  const templates = SYSTEM_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    nameKo: t.nameKo,
    description: t.description,
    descriptionKo: t.descriptionKo,
    category: t.category,
    hwCount: t.hardware.length,
    swCount: t.software.length,
  }));

  return NextResponse.json(templates);
}

/** POST /api/projects/[projectId]/inventory/templates — apply a template */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  try {
    const body = await request.json();
    const { templateId } = body;

    if (!templateId) {
      return apiError("templateId is required", 400);
    }

    const template = SYSTEM_TEMPLATES.find((t) => t.id === templateId);
    if (!template) {
      return apiError("Template not found", 404);
    }

    // Create hardware first
    const createdHardware: { id: string; name: string }[] = [];

    for (const hw of template.hardware) {
      const created = await prisma.hardware.create({
        data: {
          projectId,
          name: hw.name,
          type: hw.type,
          manufacturer: hw.manufacturer || null,
          model: hw.model || null,
          zone: hw.zone || null,
          location: hw.location || null,
        },
        select: { id: true, name: true },
      });
      createdHardware.push(created);
    }

    // Build name → id map for linking software
    const hwNameMap = new Map(createdHardware.map((h) => [h.name, h.id]));

    // Create software with hardware links
    let softwareCreated = 0;
    for (const sw of template.software) {
      const hardwareId = hwNameMap.get(sw.linkedHardware) ?? null;
      await prisma.software.create({
        data: {
          projectId,
          name: sw.name,
          version: sw.version || null,
          vendor: sw.vendor || null,
          swType: sw.swType,
          hardwareId,
        },
      });
      softwareCreated++;
    }

    return NextResponse.json({
      created: {
        hardware: createdHardware.length,
        software: softwareCreated,
      },
      templateId: template.id,
      templateName: template.name,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to apply template";
    return apiError(message, 500);
  }
}
