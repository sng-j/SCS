import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

// ─── Predefined DFD Templates ──────────────────────────────────────────────

interface DfdTemplate {
  id: string;
  name: string;
  nameKo: string;
  description: string;
  descriptionKo: string;
  data: { nodes: TemplateNode[]; edges: TemplateEdge[] };
}

interface TemplateNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    hwType: string;
    zone: string | null;
    ipAddress: string | null;
    software: { name: string; version: string | null }[];
  };
}

interface TemplateEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  animated: boolean;
  style: { stroke: string; strokeWidth: number };
}

function makeEdge(id: string, source: string, target: string): TemplateEdge {
  return {
    id,
    source,
    target,
    type: "smoothstep",
    animated: true,
    style: { stroke: "#0F62FE", strokeWidth: 1.5 },
  };
}

const TEMPLATES: DfdTemplate[] = [
  {
    id: "basic-ias",
    name: "Basic IAS Network",
    nameKo: "기본 IAS 네트워크",
    description: "Integrated Automation System with PLC, Server, HMI, and Sensors",
    descriptionKo: "PLC, 서버, HMI, 센서로 구성된 통합 자동화 시스템",
    data: {
      nodes: [
        {
          id: "ias-plc-1",
          type: "hardware",
          position: { x: 0, y: 0 },
          data: { label: "IAS PLC #1", hwType: "PLC", zone: "Control Zone", ipAddress: "192.168.1.10", software: [{ name: "PLC Firmware", version: "3.2" }] },
        },
        {
          id: "ias-plc-2",
          type: "hardware",
          position: { x: 0, y: 140 },
          data: { label: "IAS PLC #2", hwType: "PLC", zone: "Control Zone", ipAddress: "192.168.1.11", software: [{ name: "PLC Firmware", version: "3.2" }] },
        },
        {
          id: "ias-server",
          type: "hardware",
          position: { x: 260, y: 0 },
          data: { label: "IAS Server", hwType: "SERVER", zone: "Server Zone", ipAddress: "192.168.1.100", software: [{ name: "IAS Application", version: "5.1" }] },
        },
        {
          id: "ias-hmi",
          type: "hardware",
          position: { x: 260, y: 140 },
          data: { label: "HMI Workstation", hwType: "PC", zone: "Server Zone", ipAddress: "192.168.1.101", software: [{ name: "HMI Client", version: "2.0" }] },
        },
        {
          id: "ias-sensor-1",
          type: "hardware",
          position: { x: 520, y: 0 },
          data: { label: "Temperature Sensor", hwType: "SENSOR", zone: "Field Zone", ipAddress: null, software: [] },
        },
        {
          id: "ias-sensor-2",
          type: "hardware",
          position: { x: 520, y: 140 },
          data: { label: "Pressure Sensor", hwType: "SENSOR", zone: "Field Zone", ipAddress: null, software: [] },
        },
      ],
      edges: [
        makeEdge("e-plc1-server", "ias-plc-1", "ias-server"),
        makeEdge("e-plc2-server", "ias-plc-2", "ias-server"),
        makeEdge("e-server-hmi", "ias-server", "ias-hmi"),
        makeEdge("e-sensor1-plc1", "ias-sensor-1", "ias-plc-1"),
        makeEdge("e-sensor2-plc2", "ias-sensor-2", "ias-plc-2"),
      ],
    },
  },
  {
    id: "ecdis-system",
    name: "ECDIS System",
    nameKo: "ECDIS 시스템",
    description: "Electronic Chart Display with Navigation PC, GPS, and AIS",
    descriptionKo: "항해용 PC, GPS, AIS가 포함된 전자해도 표시 시스템",
    data: {
      nodes: [
        {
          id: "ecdis-nav-pc",
          type: "hardware",
          position: { x: 0, y: 0 },
          data: { label: "Navigation PC", hwType: "PC", zone: "Navigation Zone", ipAddress: "192.168.2.10", software: [{ name: "ECDIS Software", version: "4.0" }] },
        },
        {
          id: "ecdis-backup-pc",
          type: "hardware",
          position: { x: 0, y: 140 },
          data: { label: "Backup ECDIS PC", hwType: "PC", zone: "Navigation Zone", ipAddress: "192.168.2.11", software: [{ name: "ECDIS Software", version: "4.0" }] },
        },
        {
          id: "ecdis-display",
          type: "hardware",
          position: { x: 260, y: 70 },
          data: { label: "Chart Display", hwType: "PC", zone: "Navigation Zone", ipAddress: "192.168.2.20", software: [] },
        },
        {
          id: "ecdis-gps",
          type: "hardware",
          position: { x: 520, y: 0 },
          data: { label: "GPS Receiver", hwType: "SENSOR", zone: "Sensor Zone", ipAddress: null, software: [] },
        },
        {
          id: "ecdis-ais",
          type: "hardware",
          position: { x: 520, y: 140 },
          data: { label: "AIS Transponder", hwType: "NETWORK_DEVICE", zone: "Sensor Zone", ipAddress: "192.168.2.30", software: [{ name: "AIS Firmware", version: "1.5" }] },
        },
      ],
      edges: [
        makeEdge("e-nav-display", "ecdis-nav-pc", "ecdis-display"),
        makeEdge("e-backup-display", "ecdis-backup-pc", "ecdis-display"),
        makeEdge("e-gps-nav", "ecdis-gps", "ecdis-nav-pc"),
        makeEdge("e-gps-backup", "ecdis-gps", "ecdis-backup-pc"),
        makeEdge("e-ais-nav", "ecdis-ais", "ecdis-nav-pc"),
      ],
    },
  },
  {
    id: "engine-monitoring",
    name: "Engine Room Monitoring",
    nameKo: "기관실 모니터링",
    description: "Engine room monitoring system with PLCs, sensors, and monitoring server",
    descriptionKo: "PLC, 센서, 모니터링 서버로 구성된 기관실 감시 시스템",
    data: {
      nodes: [
        {
          id: "eng-plc-main",
          type: "hardware",
          position: { x: 0, y: 0 },
          data: { label: "Main Engine PLC", hwType: "PLC", zone: "Engine Control", ipAddress: "192.168.3.10", software: [{ name: "Engine Control FW", version: "2.1" }] },
        },
        {
          id: "eng-plc-aux",
          type: "hardware",
          position: { x: 0, y: 140 },
          data: { label: "Auxiliary Engine PLC", hwType: "PLC", zone: "Engine Control", ipAddress: "192.168.3.11", software: [{ name: "Aux Control FW", version: "2.1" }] },
        },
        {
          id: "eng-server",
          type: "hardware",
          position: { x: 260, y: 70 },
          data: { label: "Monitoring Server", hwType: "SERVER", zone: "Server Zone", ipAddress: "192.168.3.100", software: [{ name: "Engine Monitor", version: "3.0" }] },
        },
        {
          id: "eng-sensor-temp",
          type: "hardware",
          position: { x: 520, y: 0 },
          data: { label: "Exhaust Temp Sensor", hwType: "SENSOR", zone: "Field Zone", ipAddress: null, software: [] },
        },
        {
          id: "eng-sensor-rpm",
          type: "hardware",
          position: { x: 520, y: 140 },
          data: { label: "RPM Sensor", hwType: "SENSOR", zone: "Field Zone", ipAddress: null, software: [] },
        },
        {
          id: "eng-sensor-pressure",
          type: "hardware",
          position: { x: 520, y: 280 },
          data: { label: "Oil Pressure Sensor", hwType: "SENSOR", zone: "Field Zone", ipAddress: null, software: [] },
        },
      ],
      edges: [
        makeEdge("e-main-server", "eng-plc-main", "eng-server"),
        makeEdge("e-aux-server", "eng-plc-aux", "eng-server"),
        makeEdge("e-temp-main", "eng-sensor-temp", "eng-plc-main"),
        makeEdge("e-rpm-main", "eng-sensor-rpm", "eng-plc-main"),
        makeEdge("e-pressure-aux", "eng-sensor-pressure", "eng-plc-aux"),
      ],
    },
  },
  {
    id: "full-cbs",
    name: "Full CBS Network",
    nameKo: "전체 CBS 네트워크",
    description: "Comprehensive onboard CBS network with all major system components",
    descriptionKo: "주요 시스템 구성 요소를 포함한 선박 CBS 네트워크 전체 구성",
    data: {
      nodes: [
        {
          id: "cbs-ias-server",
          type: "hardware",
          position: { x: 0, y: 0 },
          data: { label: "IAS Server", hwType: "SERVER", zone: "Server Zone", ipAddress: "192.168.1.100", software: [{ name: "IAS Platform", version: "5.0" }] },
        },
        {
          id: "cbs-nav-pc",
          type: "hardware",
          position: { x: 0, y: 140 },
          data: { label: "ECDIS PC", hwType: "PC", zone: "Navigation Zone", ipAddress: "192.168.2.10", software: [{ name: "ECDIS", version: "4.0" }] },
        },
        {
          id: "cbs-vdr",
          type: "hardware",
          position: { x: 0, y: 280 },
          data: { label: "VDR", hwType: "SERVER", zone: "Navigation Zone", ipAddress: "192.168.2.50", software: [{ name: "VDR Software", version: "2.0" }] },
        },
        {
          id: "cbs-switch-core",
          type: "hardware",
          position: { x: 260, y: 70 },
          data: { label: "Core Switch", hwType: "NETWORK_DEVICE", zone: "Network Zone", ipAddress: "192.168.0.1", software: [{ name: "Switch OS", version: "6.2" }] },
        },
        {
          id: "cbs-firewall",
          type: "hardware",
          position: { x: 260, y: 210 },
          data: { label: "Firewall", hwType: "NETWORK_DEVICE", zone: "Network Zone", ipAddress: "192.168.0.254", software: [{ name: "FW OS", version: "3.1" }] },
        },
        {
          id: "cbs-plc-1",
          type: "hardware",
          position: { x: 520, y: 0 },
          data: { label: "Main Engine PLC", hwType: "PLC", zone: "Control Zone", ipAddress: "192.168.3.10", software: [{ name: "PLC Firmware", version: "2.1" }] },
        },
        {
          id: "cbs-plc-2",
          type: "hardware",
          position: { x: 520, y: 140 },
          data: { label: "Aux Engine PLC", hwType: "PLC", zone: "Control Zone", ipAddress: "192.168.3.11", software: [{ name: "PLC Firmware", version: "2.1" }] },
        },
        {
          id: "cbs-hmi",
          type: "hardware",
          position: { x: 520, y: 280 },
          data: { label: "HMI Panel", hwType: "PC", zone: "Control Zone", ipAddress: "192.168.3.50", software: [{ name: "HMI Client", version: "2.0" }] },
        },
      ],
      edges: [
        makeEdge("e-ias-switch", "cbs-ias-server", "cbs-switch-core"),
        makeEdge("e-nav-switch", "cbs-nav-pc", "cbs-switch-core"),
        makeEdge("e-vdr-switch", "cbs-vdr", "cbs-switch-core"),
        makeEdge("e-switch-fw", "cbs-switch-core", "cbs-firewall"),
        makeEdge("e-fw-plc1", "cbs-firewall", "cbs-plc-1"),
        makeEdge("e-fw-plc2", "cbs-firewall", "cbs-plc-2"),
        makeEdge("e-plc1-hmi", "cbs-plc-1", "cbs-hmi"),
        makeEdge("e-plc2-hmi", "cbs-plc-2", "cbs-hmi"),
      ],
    },
  },
];

/** GET /api/projects/[projectId]/dfd/templates — list predefined DFD templates */
export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);

  // Return templates without full data for listing (include data for preview)
  const templates = TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    nameKo: t.nameKo,
    description: t.description,
    descriptionKo: t.descriptionKo,
    nodeCount: t.data.nodes.length,
    edgeCount: t.data.edges.length,
  }));

  return NextResponse.json(templates);
}

/** POST /api/projects/[projectId]/dfd/templates — apply a template to the project DFD */
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

    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) {
      return apiError("Template not found", 404);
    }

    const { nodes, edges } = template.data;
    const dfdData = JSON.stringify({ nodes, edges });

    const existing = await prisma.dfdDiagram.findFirst({
      where: { projectId, equipmentId: null },
    });

    let diagram;
    if (existing) {
      diagram = await prisma.dfdDiagram.update({
        where: { id: existing.id },
        data: {
          data: dfdData,
          source: "TEMPLATE",
          version: { increment: 1 },
        },
      });
    } else {
      diagram = await prisma.dfdDiagram.create({
        data: {
          projectId,
          data: dfdData,
          source: "TEMPLATE",
        },
      });
    }

    // Log the template action
    await prisma.dfdLog.create({
      data: {
        diagramId: diagram.id,
        action: `template_apply:${templateId}`,
        source: "TEMPLATE",
        snapshot: JSON.stringify({ nodes, edges }),
      },
    });

    return NextResponse.json({ nodes, edges, diagramId: diagram.id }, { status: 201 });
  } catch {
    return apiError("Failed to apply template", 500);
  }
}
