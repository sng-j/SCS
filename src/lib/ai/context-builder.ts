// ─── Context Builder — URL → DB query → context text ────────────────────────
import { prisma } from "@/lib/prisma";

export interface PageContext {
  path: string;
  projectId?: string;
  equipmentId?: string;
  pageType: string;
  pageFormData?: Record<string, unknown>;
  userRole?: string;
  userId?: string;
  shipyardId?: string | null;
}

interface ContextResult {
  summary: string;
  bannerKo: string;
  bannerEn: string;
  pageType: string;
}

function detectPageType(path: string): string {
  if (/\/project\/[^/]+\/inventory/.test(path)) return "inventory";
  if (/\/project\/[^/]+\/assess/.test(path)) return "assess";
  if (/\/project\/[^/]+\/document/.test(path)) return "document";
  if (/\/project\/[^/]+\/submit/.test(path)) return "submit";
  if (/\/project\/[^/]+\/equipment\/[^/]+/.test(path)) return "equipment-detail";
  if (/\/project\/[^/]+/.test(path)) return "project-overview";
  if (/\/vendor/.test(path)) return "vendor";
  if (/\/shipyard/.test(path)) return "shipyard";
  if (/\/admin/.test(path)) return "admin";
  if (path === "/" || path === "") return "dashboard";
  return "default";
}

export async function buildContext(ctx: PageContext): Promise<ContextResult> {
  const pageType = ctx.pageType || detectPageType(ctx.path);
  const lines: string[] = [];
  let bannerKo = "";
  let bannerEn = "";

  try {
    if (ctx.projectId) {
      const project = await prisma.project.findUnique({
        where: { id: ctx.projectId },
        select: {
          vesselName: true,
          classification: true,
          status: true,
          _count: {
            select: { equipments: true },
          },
        },
      });

      if (project) {
        lines.push(`프로젝트: ${project.vesselName}`);
        lines.push(`선급: ${project.classification || "N/A"}, 상태: ${project.status}`);
        lines.push(`기자재 수: ${project._count.equipments}개`);
      }

      // Page-specific context
      if (pageType === "inventory" || pageType === "project-overview") {
        const [hwCount, swCount, dfdCount] = await Promise.all([
          prisma.hardware.count({ where: { projectId: ctx.projectId } }),
          prisma.software.count({ where: { projectId: ctx.projectId } }),
          prisma.dfdDiagram.count({ where: { projectId: ctx.projectId } }),
        ]);
        lines.push(`하드웨어: ${hwCount}개, 소프트웨어: ${swCount}개, DFD: ${dfdCount}개`);
        bannerKo = `📍 인벤토리 · HW ${hwCount}개, SW ${swCount}개`;
        bannerEn = `📍 Inventory · ${hwCount} HW, ${swCount} SW`;
      }

      if (pageType === "dfd") {
        // DFD 페이지: 장비별 DFD 상세 정보 조회
        const eqFilter = ctx.equipmentId ? { equipmentId: ctx.equipmentId } : { projectId: ctx.projectId };
        const dfds = await prisma.dfdDiagram.findMany({
          where: eqFilter,
          select: {
            id: true,
            data: true,
            source: true,
            version: true,
            equipment: { select: { name: true } },
          },
        });

        lines.push("");
        lines.push("[현재 DFD 네트워크 구성 페이지]");
        lines.push(`DFD 다이어그램: ${dfds.length}개`);

        for (const dfd of dfds) {
          const eqName = dfd.equipment?.name || "프로젝트 전체";
          try {
            const parsed = typeof dfd.data === "string" ? JSON.parse(dfd.data) : dfd.data;
            const nodeCount = parsed.nodes?.length || 0;
            const edgeCount = parsed.edges?.length || 0;
            lines.push(`  - ${eqName}: 노드 ${nodeCount}개, 연결 ${edgeCount}개 (소스: ${dfd.source}, v${dfd.version})`);

            // 노드 상세 (장비명, 타입)
            if (parsed.nodes && parsed.nodes.length > 0) {
              const nodeDetails = parsed.nodes.map((n: { data?: { label?: string; hwType?: string } }) =>
                `${n.data?.label || "Unknown"}(${n.data?.hwType || "?"})`
              ).join(", ");
              lines.push(`    노드: ${nodeDetails}`);
            }
            // 연결 상세 (프로토콜)
            if (parsed.edges && parsed.edges.length > 0) {
              const edgeDetails = parsed.edges.map((e: { data?: { protocol?: string; connectionType?: string } }) =>
                `${e.data?.protocol || "?"}/${e.data?.connectionType || "?"}`
              ).join(", ");
              lines.push(`    연결: ${edgeDetails}`);
            }
          } catch {
            lines.push(`  - ${eqName}: 데이터 파싱 불가`);
          }
        }

        lines.push("");
        lines.push("사용자는 DFD 페이지에 있습니다. 네트워크 토폴로지, 데이터 흐름, 프로토콜, 보안 관점의 분석을 중심으로 답변하세요.");

        bannerKo = `📍 DFD · ${dfds.length}개 다이어그램`;
        bannerEn = `📍 DFD · ${dfds.length} diagrams`;
      }

      if (pageType === "assess") {
        const assessments = await prisma.assessment.groupBy({
          by: ["result"],
          where: { hardware: { projectId: ctx.projectId } },
          _count: { _all: true },
        });
        const total = assessments.reduce((s, a) => s + a._count._all, 0);
        const pass = assessments.find((a) => a.result === "PASS")?._count._all || 0;
        const fail = assessments.find((a) => a.result === "FAIL")?._count._all || 0;
        lines.push(`평가 현황: 총 ${total}건 (PASS: ${pass}, FAIL: ${fail})`);
        bannerKo = `📍 보안 평가 · ${total}건 중 ${pass}건 통과`;
        bannerEn = `📍 Assessment · ${pass}/${total} passed`;
      }

      if (pageType === "document") {
        const docs = await prisma.document.count({ where: { submission: { projectId: ctx.projectId } } });
        lines.push(`생성된 문서: ${docs}건`);
        bannerKo = `📍 문서 · ${docs}건 생성됨`;
        bannerEn = `📍 Documents · ${docs} generated`;
      }

      if (pageType === "submit") {
        const [hwCount, swCount, dfdCount, docCount, assessCount] = await Promise.all([
          prisma.hardware.count({ where: { projectId: ctx.projectId } }),
          prisma.software.count({ where: { projectId: ctx.projectId } }),
          prisma.dfdDiagram.count({ where: { projectId: ctx.projectId } }),
          prisma.document.count({ where: { submission: { projectId: ctx.projectId } } }),
          prisma.assessment.count({ where: { hardware: { projectId: ctx.projectId } } }),
        ]);
        lines.push(`제출 체크: HW(${hwCount}) SW(${swCount}) DFD(${dfdCount}) 문서(${docCount}) 평가(${assessCount})`);
        bannerKo = `📍 제출 준비`;
        bannerEn = `📍 Submit readiness`;
      }

      if (pageType === "equipment-detail" && ctx.equipmentId) {
        const eq = await prisma.equipment.findUnique({
          where: { id: ctx.equipmentId },
          select: {
            name: true,
            status: true,
            _count: { select: { hardware: true, software: true } },
          },
        });
        if (eq) {
          lines.push("");
          lines.push(`[현재 보고 있는 기자재]`);
          lines.push(`기자재명: ${eq.name}`);
          lines.push(`상태: ${eq.status}`);
          lines.push(`HW: ${eq._count.hardware}개, SW: ${eq._count.software}개`);

          // DFD count for this equipment
          const dfdCount = await prisma.dfdDiagram.count({ where: { equipmentId: ctx.equipmentId } });
          lines.push(`DFD: ${dfdCount}개`);

          // Assessment stats for this equipment's hardware
          const assessments = await prisma.assessment.groupBy({
            by: ["result"],
            where: { hardware: { equipmentId: ctx.equipmentId } },
            _count: { _all: true },
          });
          if (assessments.length > 0) {
            const total = assessments.reduce((s, a) => s + a._count._all, 0);
            const pass = assessments.find((a) => a.result === "PASS")?._count._all || 0;
            const fail = assessments.find((a) => a.result === "FAIL")?._count._all || 0;
            const partial = assessments.find((a) => a.result === "PARTIAL")?._count._all || 0;
            lines.push(`보안 평가: 총 ${total}건 (PASS: ${pass}, FAIL: ${fail}, PARTIAL: ${partial})`);
          }

          lines.push("");
          lines.push("사용자는 이 기자재 상세 페이지에 있습니다. 프로젝트 전체가 아닌 이 기자재에 대해 답변하세요.");

          bannerKo = `📍 ${eq.name} · HW ${eq._count.hardware}개`;
          bannerEn = `📍 ${eq.name} · ${eq._count.hardware} HW`;
        }
      }
    }

    // Non-project pages — provide role-specific context
    const role = ctx.userRole || "VENDOR";
    const shipyardId = ctx.shipyardId;

    if (pageType === "dashboard" || pageType === "default" || pageType === "vendor" || pageType === "shipyard" || pageType === "admin") {
      // Set banner
      if (pageType === "dashboard" || pageType === "default") { bannerKo = "📍 대시보드"; bannerEn = "📍 Dashboard"; }
      else if (pageType === "vendor") { bannerKo = "📍 벤더 기자재 관리"; bannerEn = "📍 Vendor Equipment"; }
      else if (pageType === "shipyard") { bannerKo = "📍 조선소 관리"; bannerEn = "📍 Shipyard Management"; }
      else if (pageType === "admin") { bannerKo = "📍 시스템 관리"; bannerEn = "📍 System Admin"; }

      // Build project filter by role
      let projectWhere: Record<string, unknown> = {};
      if (role === "SHIPYARD" || role === "SUPPORT") {
        projectWhere = shipyardId ? { shipyardId } : { id: "__none__" };
      } else if (role === "VENDOR" && ctx.userId) {
        projectWhere = { equipments: { some: { OR: [{ vendorId: ctx.userId }, { vendors: { some: { id: ctx.userId } } }] } } };
      }
      // ADMIN: no filter

      const projects = await prisma.project.findMany({
        where: projectWhere,
        select: {
          id: true, vesselName: true, status: true,
          equipments: {
            select: { id: true, name: true, status: true, vendor: { select: { name: true, company: true } }, _count: { select: { hardware: true, software: true } } },
          },
        },
        take: 10,
      });

      lines.push("");
      lines.push(`[사용자 역할: ${role}]`);

      if (projects.length === 0) {
        lines.push("프로젝트: 없음");
      } else {
        for (const p of projects) {
          lines.push(`프로젝트: ${p.vesselName} (ID:${p.id})`);
          for (const eq of p.equipments) {
            lines.push(`  기자재: ${eq.name} (상태:${eq.status}, HW:${eq._count.hardware}, SW:${eq._count.software}, 벤더:${eq.vendor?.company || eq.vendor?.name || "미배정"})`);
          }
        }
      }

      if (role === "SUPPORT") {
        lines.push("");
        lines.push("사용자는 조선소 담당자(SUPPORT)입니다. 프로젝트/벤더/기자재 현황 질문에는 getVendorEquipmentStatus를 호출하세요.");
      } else if (role === "SHIPYARD") {
        lines.push("");
        lines.push("사용자는 조선소 뷰어(읽기 전용)입니다. 데이터 조회만 가능하며, 편집/승인/생성 작업은 안내하지 마세요.");
      } else if (role === "ADMIN") {
        lines.push("");
        lines.push("사용자는 시스템 관리자입니다. 전체 프로젝트/벤더 현황에 접근할 수 있습니다.");
      } else if (role === "VENDOR") {
        lines.push("");
        lines.push("사용자는 벤더입니다. 할당된 기자재의 자산등록/평가/문서/제출 작업을 도와주세요.");
      }
    }

    // Include form data context if present
    if (ctx.pageFormData && Object.keys(ctx.pageFormData).length > 0) {
      lines.push("");
      lines.push("현재 사용자가 입력 중인 폼 데이터:");
      for (const [key, value] of Object.entries(ctx.pageFormData)) {
        if (value !== null && value !== undefined && value !== "") {
          lines.push(`  - ${key}: ${String(value)}`);
        }
      }
    }
  } catch (err) {
    lines.push(`(컨텍스트 조회 오류: ${err instanceof Error ? err.message : "unknown"})`);
  }

  return {
    summary: lines.join("\n"),
    bannerKo: bannerKo || "📍 SCS",
    bannerEn: bannerEn || "📍 SCS",
    pageType,
  };
}

// ─── Page-specific suggestion prompts ───────────────────────────────────────

interface Suggestion {
  ko: string;
  en: string;
}

const SUGGESTIONS: Record<string, Suggestion[]> = {
  inventory: [
    { ko: "하드웨어 3대 추가해줘", en: "Add 3 hardware devices" },
    { ko: "현재 등록된 자산 요약해줘", en: "Summarize registered assets" },
    { ko: "DFD 자동 생성해줘", en: "Auto-generate DFD" },
  ],
  assess: [
    { ko: "평가 현황 알려줘", en: "Show assessment status" },
    { ko: "SC-1 요구사항 설명해줘", en: "Explain SC-1 requirements" },
    { ko: "미완료 평가 항목 알려줘", en: "Show incomplete assessments" },
  ],
  document: [
    { ko: "미생성 문서 전부 만들어줘", en: "Generate all missing documents" },
    { ko: "문서 준비 상태 확인해줘", en: "Check document readiness" },
  ],
  submit: [
    { ko: "제출 준비 상태 확인해줘", en: "Check submission readiness" },
    { ko: "다음에 뭘 해야 해?", en: "What should I do next?" },
  ],
  "equipment-detail": [
    { ko: "이 기자재 현황 요약해줘", en: "Summarize this equipment" },
    { ko: "소프트웨어 추가해줘", en: "Add software" },
  ],
  "project-overview": [
    { ko: "프로젝트 현황 요약해줘", en: "Summarize project status" },
    { ko: "다음에 뭘 해야 해?", en: "What should I do next?" },
  ],
  default: [
    { ko: "다음에 뭘 해야 해?", en: "What should I do next?" },
    { ko: "E27 인증 절차 설명해줘", en: "Explain E27 certification process" },
    { ko: "프로젝트 현황 알려줘", en: "Show project status" },
  ],
};

export function getSuggestions(pageType: string): Suggestion[] {
  return SUGGESTIONS[pageType] || SUGGESTIONS.default;
}
