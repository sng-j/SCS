// ─── AI Tool Definitions & Executors ────────────────────────────────────────
import { prisma } from "@/lib/prisma";
import { verifyProjectAccess } from "@/lib/auth-helpers";
import type { LLMToolDef } from "./llm-client";

/** Verify the calling user has access to the given project. Returns an error ToolResult on failure. */
async function checkProjectAccess(params: Record<string, string>): Promise<ToolResult | null> {
  const { projectId, _userId, _userRole, _shipyardId } = params;
  if (!projectId) return { success: false, error: "projectId is required" };
  const hasAccess = await verifyProjectAccess(
    _userId || "",
    projectId,
    _userRole,
    _shipyardId || null,
  );
  if (!hasAccess) return { success: false, error: "이 프로젝트에 접근 권한이 없습니다." };
  return null;
}

// ── Tool definition for LLM ─────────────────────────────────────────────────

export const AI_TOOLS: LLMToolDef[] = [
  {
    type: "function",
    function: {
      name: "getProjectSummary",
      description: "프로젝트 전체 현황 요약 (기자재, HW, SW, DFD, 평가, 문서 수)",
      parameters: {
        type: "object",
        properties: { projectId: { type: "string", description: "프로젝트 ID" } },
        required: ["projectId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getHardwareList",
      description: "프로젝트의 하드웨어 목록 조회",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string" },
          equipmentId: { type: "string", description: "특정 기자재 필터 (선택)" },
        },
        required: ["projectId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getSoftwareList",
      description: "프로젝트의 소프트웨어 목록 조회",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string" },
          equipmentId: { type: "string", description: "특정 기자재 필터 (선택)" },
        },
        required: ["projectId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "addHardware",
      description: "하드웨어 추가. name과 type은 필수. 여러 대 추가시 이 도구를 반복 호출",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string" },
          equipmentId: { type: "string", description: "기자재 ID (선택)" },
          name: { type: "string", description: "하드웨어 이름 (예: Server-1)" },
          type: { type: "string", enum: ["PLC", "SERVER", "SENSOR", "NETWORK_DEVICE", "PC", "OTHER_DEVICE"] },
          manufacturer: { type: "string" },
          model: { type: "string" },
          ipAddress: { type: "string" },
          zone: { type: "string", description: "구역 (navigation, propulsion, safety, cargo, communication, admin, shore)" },
        },
        required: ["projectId", "name", "type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "addSoftware",
      description: "소프트웨어 추가",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string" },
          equipmentId: { type: "string", description: "기자재 ID (선택)" },
          hardwareId: { type: "string", description: "연결할 하드웨어 ID (선택)" },
          name: { type: "string", description: "소프트웨어 이름" },
          version: { type: "string" },
          vendor: { type: "string" },
          swType: { type: "string", enum: ["OS", "APPLICATION", "FIRMWARE", "DRIVER", "LIBRARY", "MIDDLEWARE"] },
        },
        required: ["projectId", "name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generateDFD",
      description: "하드웨어 인벤토리 기반 DFD(Data Flow Diagram) 자동 생성",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string" },
          equipmentId: { type: "string", description: "특정 기자재 (선택)" },
        },
        required: ["projectId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getAssessmentStatus",
      description: "보안 평가 현황 조회 (SC-1~SC-13 체크 결과)",
      parameters: {
        type: "object",
        properties: { projectId: { type: "string" } },
        required: ["projectId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "setAssessmentResult",
      description: "특정 하드웨어의 보안 평가 항목 결과 설정",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string" },
          hardwareId: { type: "string" },
          checkId: { type: "string", description: "평가 항목 ID (예: SC-1)" },
          result: { type: "string", enum: ["PASS", "FAIL", "PARTIAL", "NOT_APPLICABLE", "NOT_CHECKED"] },
          evidence: { type: "string", description: "근거 (선택)" },
        },
        required: ["projectId", "hardwareId", "checkId", "result"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generateDocument",
      description: "문서 생성 (E27-CBS, E27-SBOM, E27-AUD 등)",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string" },
          docCode: { type: "string", description: "문서 코드 (E27-CBS, E27-SBOM, E27-AUD, E27-TOP, E27-VUL, E27-ACC, E27-MON, E26-ZCD, E26-INV, E26-CRA)" },
          equipmentId: { type: "string", description: "기자재 ID (E27 문서의 경우)" },
        },
        required: ["projectId", "docCode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getReadiness",
      description: "제출 준비 상태 체크 (HW/SW/DFD/평가/문서 완료 여부)",
      parameters: {
        type: "object",
        properties: { projectId: { type: "string" } },
        required: ["projectId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getVendorEquipmentStatus",
      description: "프로젝트의 벤더별 기자재 진행 현황 조회 (조선소/관리자용). projectId 없으면 전체 프로젝트 조회",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "프로젝트 ID (선택 — 없으면 전체)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getProjectList",
      description: "전체 프로젝트 목록 조회 (조선소/관리자용)",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];

// ── Tool executors ──────────────────────────────────────────────────────────

type ToolResult = { success: boolean; data?: unknown; error?: string; actionLabel?: string };

const executors: Record<string, (params: Record<string, string>) => Promise<ToolResult>> = {
  async getProjectSummary(params) {
    const { projectId } = params;
    const denied = await checkProjectAccess(params);
    if (denied) return denied;
    const [eqCount, hwCount, swCount, dfdCount, assessCount, docCount] = await Promise.all([
      prisma.equipment.count({ where: { projectId } }),
      prisma.hardware.count({ where: { projectId } }),
      prisma.software.count({ where: { projectId } }),
      prisma.dfdDiagram.count({ where: { projectId } }),
      prisma.assessment.count({ where: { hardware: { projectId } } }),
      prisma.document.count({ where: { submission: { projectId } } }),
    ]);
    return {
      success: true,
      data: { equipment: eqCount, hardware: hwCount, software: swCount, dfd: dfdCount, assessments: assessCount, documents: docCount },
    };
  },

  async getHardwareList(params) {
    const { projectId, equipmentId } = params;
    const denied = await checkProjectAccess(params);
    if (denied) return denied;
    const hardware = await prisma.hardware.findMany({
      where: { projectId, ...(equipmentId ? { equipmentId } : {}) },
      select: { id: true, name: true, type: true, manufacturer: true, ipAddress: true, zone: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { success: true, data: hardware };
  },

  async getSoftwareList(params) {
    const { projectId, equipmentId } = params;
    const denied = await checkProjectAccess(params);
    if (denied) return denied;
    const software = await prisma.software.findMany({
      where: { projectId, ...(equipmentId ? { equipmentId } : {}) },
      select: { id: true, name: true, version: true, vendor: true, swType: true, hardwareId: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { success: true, data: software };
  },

  async addHardware(params) {
    const { projectId, equipmentId, name, type, manufacturer, model, ipAddress, zone } = params;
    const denied = await checkProjectAccess(params);
    if (denied) return denied;
    const hw = await prisma.hardware.create({
      data: {
        projectId,
        equipmentId: equipmentId || undefined,
        name,
        type: type as "PLC" | "SERVER" | "SENSOR" | "NETWORK_DEVICE" | "PC" | "OTHER_DEVICE",
        manufacturer: manufacturer || undefined,
        model: model || undefined,
        ipAddress: ipAddress || undefined,
        zone: zone || undefined,
      },
    });
    return {
      success: true,
      data: { id: hw.id, name: hw.name, type: hw.type, ipAddress: hw.ipAddress },
      actionLabel: `HW 추가: ${hw.name} (${hw.type})`,
    };
  },

  async addSoftware(params) {
    const { projectId, equipmentId, hardwareId, name, version, vendor, swType } = params;
    const denied = await checkProjectAccess(params);
    if (denied) return denied;
    const sw = await prisma.software.create({
      data: {
        projectId,
        equipmentId: equipmentId || undefined,
        hardwareId: hardwareId || undefined,
        name,
        version: version || undefined,
        vendor: vendor || undefined,
        swType: (swType as "OS" | "APPLICATION" | "FIRMWARE" | "DRIVER" | "LIBRARY" | "MIDDLEWARE") || "APPLICATION",
      },
    });
    return {
      success: true,
      data: { id: sw.id, name: sw.name, version: sw.version, swType: sw.swType },
      actionLabel: `SW 추가: ${sw.name} ${sw.version || ""}`.trim(),
    };
  },

  async generateDFD(params) {
    const { projectId, equipmentId } = params;
    const denied = await checkProjectAccess(params);
    if (denied) return denied;
    // Query hardware directly (no internal HTTP call to avoid auth issues)
    const hwWhere: Record<string, unknown> = { projectId };
    if (equipmentId) hwWhere.equipmentId = equipmentId;

    const hardware = await prisma.hardware.findMany({
      where: hwWhere,
      include: { software: { select: { id: true, name: true, version: true, swType: true } } },
      orderBy: [{ zone: "asc" }, { type: "asc" }, { name: "asc" }],
    });

    if (hardware.length === 0) {
      return { success: false, error: "하드웨어가 등록되지 않았습니다. DFD 생성 전에 하드웨어를 추가하세요.", actionLabel: "DFD 생성 실패" };
    }

    // Build simple node/edge data
    const nodes = hardware.map((hw, i) => ({
      id: hw.id,
      type: "hardware",
      position: { x: (i % 4) * 260 + 50, y: Math.floor(i / 4) * 150 + 50 },
      data: {
        label: hw.name,
        hwType: hw.type,
        manufacturer: hw.manufacturer ?? undefined,
        ipAddress: hw.ipAddress ?? undefined,
        zone: hw.zone ?? undefined,
        software: hw.software.map((sw) => ({ name: sw.name, version: sw.version, swType: sw.swType })),
      },
    }));

    // Build edges: network devices connect to same-zone hardware, cross-zone conduits
    const edges: { id: string; source: string; target: string; type: string; animated?: boolean; label?: string; data?: Record<string, unknown> }[] = [];
    const edgeSet = new Set<string>();
    const addEdge = (src: string, tgt: string, extra?: Record<string, unknown>) => {
      const key = [src, tgt].sort().join("-");
      if (edgeSet.has(key)) return;
      edgeSet.add(key);
      edges.push({ id: `e-${src.slice(-6)}-${tgt.slice(-6)}`, source: src, target: tgt, type: "smoothstep", ...extra });
    };

    const netDevs = hardware.filter((h) => h.type === "NETWORK_DEVICE");
    for (const nd of netDevs) {
      const ndZone = nd.zone || "unassigned";
      for (const hw of hardware) {
        if (hw.id !== nd.id && (hw.zone || "unassigned") === ndZone) {
          addEdge(nd.id, hw.id, { data: { connectionType: "ethernet", protocol: "TCP/IP" } });
        }
      }
    }
    // Cross-zone conduits between network devices
    for (let i = 0; i < netDevs.length; i++) {
      for (let j = i + 1; j < netDevs.length; j++) {
        if ((netDevs[i].zone || "") !== (netDevs[j].zone || "")) {
          addEdge(netDevs[i].id, netDevs[j].id, { animated: true, label: "Conduit", data: { connectionType: "ethernet", protocol: "TCP/IP", encrypted: true } });
        }
      }
    }

    const dfdData = { nodes, edges, generatedAt: new Date().toISOString(), hardwareCount: hardware.length };
    const dfdJson = JSON.stringify(dfdData);

    const findWhere = equipmentId ? { equipmentId } : { projectId, equipmentId: null };
    const existing = await prisma.dfdDiagram.findFirst({ where: findWhere });

    let dfdDiagram;
    if (existing) {
      dfdDiagram = await prisma.dfdDiagram.update({
        where: { id: existing.id },
        data: { data: dfdJson, source: "AI", version: { increment: 1 } },
      });
    } else {
      dfdDiagram = await prisma.dfdDiagram.create({
        data: { projectId, ...(equipmentId ? { equipmentId } : {}), data: dfdJson, source: "AI", version: 1 },
      });
    }

    await prisma.dfdLog.create({
      data: { diagramId: dfdDiagram.id, action: "AI_GENERATED", source: "AI", snapshot: dfdJson },
    });

    return {
      success: true,
      data: { nodes: nodes.length, edges: edges.length, diagramId: dfdDiagram.id },
      actionLabel: `DFD 생성됨 (노드 ${nodes.length}개, 연결 ${edges.length}개)`,
    };
  },

  async getAssessmentStatus(params) {
    const { projectId } = params;
    const denied = await checkProjectAccess(params);
    if (denied) return denied;
    const assessments = await prisma.assessment.groupBy({
      by: ["result"],
      where: { hardware: { projectId } },
      _count: { _all: true },
    });
    const total = assessments.reduce((s, a) => s + a._count._all, 0);
    const byResult: Record<string, number> = {};
    for (const a of assessments) {
      byResult[a.result] = a._count._all;
    }
    return { success: true, data: { total, byResult } };
  },

  async setAssessmentResult(params) {
    const { hardwareId, checkId, result, evidence } = params;
    const denied = await checkProjectAccess(params);
    if (denied) return denied;
    const assessment = await prisma.assessment.upsert({
      where: { hardwareId_checkId: { hardwareId, checkId } },
      create: {
        hardwareId,
        checkId,
        standard: "E27",
        result: result as "PASS" | "FAIL" | "PARTIAL" | "NOT_APPLICABLE" | "NOT_CHECKED",
        evidence: evidence || undefined,
      },
      update: {
        result: result as "PASS" | "FAIL" | "PARTIAL" | "NOT_APPLICABLE" | "NOT_CHECKED",
        evidence: evidence || undefined,
      },
    });
    return {
      success: true,
      data: { id: assessment.id, checkId, result },
      actionLabel: `평가 설정: ${checkId} → ${result}`,
    };
  },

  async generateDocument(params) {
    const { projectId, docCode } = params;
    const denied = await checkProjectAccess(params);
    if (denied) return denied;
    // Document title mapping
    const DOC_TITLES: Record<string, string> = {
      "E27-CBS": "E27 Cyber Security Management System",
      "E27-SBOM": "E27 Software Bill of Materials",
      "E27-AUD": "E27 Security Audit Report",
      "E27-TOP": "E27 Network Topology",
      "E27-VUL": "E27 Vulnerability Assessment",
      "E27-ACC": "E27 Access Control Policy",
      "E27-MON": "E27 Monitoring & Logging",
      "E26-ZCD": "E26 Zone & Conduit Design",
      "E26-INV": "E26 Asset Inventory",
      "E26-CRA": "E26 Cyber Risk Assessment",
    };

    const title = DOC_TITLES[docCode] || docCode;

    // Find or create a submission for this project
    let submission = await prisma.submission.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
    if (!submission) {
      submission = await prisma.submission.create({
        data: { projectId, phase: "INVENTORY", status: "DRAFT" },
      });
    }

    // Check if document already exists
    const existing = await prisma.document.findFirst({
      where: { submissionId: submission.id, docType: docCode },
    });

    if (existing) {
      const updated = await prisma.document.update({
        where: { id: existing.id },
        data: { version: { increment: 1 }, status: "GENERATED", generatedAt: new Date() },
      });
      return {
        success: true,
        data: { docCode, documentId: updated.id, version: updated.version },
        actionLabel: `문서 재생성: ${docCode} (v${updated.version})`,
      };
    }

    const document = await prisma.document.create({
      data: {
        submissionId: submission.id,
        docType: docCode,
        title,
        format: "docx",
        status: "GENERATED",
        generatedAt: new Date(),
      },
    });

    return {
      success: true,
      data: { docCode, documentId: document.id },
      actionLabel: `문서 생성: ${docCode}`,
    };
  },

  async getReadiness(params) {
    const { projectId } = params;
    const denied = await checkProjectAccess(params);
    if (denied) return denied;
    const [hwCount, swCount, dfdCount, assessCount, docCount, eqCount] = await Promise.all([
      prisma.hardware.count({ where: { projectId } }),
      prisma.software.count({ where: { projectId } }),
      prisma.dfdDiagram.count({ where: { projectId } }),
      prisma.assessment.count({ where: { hardware: { projectId } } }),
      prisma.document.count({ where: { submission: { projectId } } }),
      prisma.equipment.count({ where: { projectId } }),
    ]);
    const checks = {
      equipment: eqCount > 0,
      hardware: hwCount > 0,
      software: swCount > 0,
      dfd: dfdCount > 0,
      assessment: assessCount > 0,
      document: docCount > 0,
    };
    const ready = Object.values(checks).every(Boolean);
    return {
      success: true,
      data: { checks, ready, counts: { equipment: eqCount, hardware: hwCount, software: swCount, dfd: dfdCount, assessments: assessCount, documents: docCount } },
    };
  },

  async getVendorEquipmentStatus({ projectId, _userRole, _userId, _shipyardId }) {
    let where: Record<string, unknown> = {};
    if (projectId && projectId.trim()) {
      where = { projectId };
    } else if (_userRole === "SHIPYARD" && _shipyardId) {
      where = { project: { shipyardId: _shipyardId } };
    } else if (_userRole === "VENDOR" && _userId) {
      where = { OR: [{ vendorId: _userId }, { vendors: { some: { id: _userId } } }] };
    }
    const equipments = await prisma.equipment.findMany({
      where,
      select: {
        id: true,
        name: true,
        status: true,
        vendor: { select: { id: true, name: true, company: true } },
        project: { select: { id: true, vesselName: true } },
        _count: { select: { hardware: true, software: true } },
        dfdDiagram: { select: { id: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Group by vendor
    const vendorMap: Record<string, {
      vendorName: string;
      company: string | null;
      equipments: { name: string; status: string; hwCount: number; swCount: number; hasDfd: boolean; project: string }[];
    }> = {};

    for (const eq of equipments) {
      const vId = eq.vendor?.id || "unknown";
      if (!vendorMap[vId]) {
        vendorMap[vId] = {
          vendorName: eq.vendor?.name || "Unknown",
          company: eq.vendor?.company || null,
          equipments: [],
        };
      }
      vendorMap[vId].equipments.push({
        name: eq.name,
        status: eq.status,
        hwCount: eq._count.hardware,
        swCount: eq._count.software,
        hasDfd: !!eq.dfdDiagram,
        project: eq.project?.vesselName || "",
      });
    }

    return {
      success: true,
      data: {
        totalEquipments: equipments.length,
        vendors: Object.values(vendorMap),
      },
      actionLabel: "벤더별 기자재 현황 조회",
    };
  },

  async getProjectList({ _userRole, _userId, _shipyardId }) {
    let where: Record<string, unknown> = {};
    if (_userRole === "SHIPYARD" && _shipyardId) {
      where = { shipyardId: _shipyardId };
    } else if (_userRole === "VENDOR" && _userId) {
      where = { equipments: { some: { OR: [{ vendorId: _userId }, { vendors: { some: { id: _userId } } }] } } };
    }

    const projects = await prisma.project.findMany({
      where,
      select: {
        id: true,
        vesselName: true,
        classification: true,
        status: true,
        _count: { select: { equipments: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return {
      success: true,
      data: projects.map((p) => ({
        id: p.id,
        vesselName: p.vesselName,
        classification: p.classification,
        status: p.status,
        equipmentCount: p._count.equipments,
      })),
      actionLabel: "프로젝트 목록 조회",
    };
  },
};

// ── Execute a tool by name ──────────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  params: Record<string, string>,
): Promise<ToolResult> {
  const executor = executors[toolName];
  if (!executor) {
    return { success: false, error: `Unknown tool: ${toolName}` };
  }
  try {
    return await executor(params);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Tool execution failed" };
  }
}
