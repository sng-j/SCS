/**
 * Document generator dispatcher — routes docType to the appropriate generator.
 */
import { Packer } from "docx";
import { prisma } from "@/lib/prisma";
import type { ProjectContext, HardwareRow, SoftwareRow, AssessmentRow } from "./shared";
import { generateCBS } from "./gen-cbs";
import { generateSBOM } from "./gen-sbom";
import { generateAUD } from "./gen-aud";
import { generateTOP } from "./gen-top";
import { generateTemplate } from "./gen-template";

// ─── Data fetching ──────────────────────────────────────────────────────────

export interface DocumentData {
  project: ProjectContext;
  hardware: HardwareRow[];
  software: SoftwareRow[];
  assessments: AssessmentRow[];
}

async function fetchDocumentData(projectId: string, equipmentId?: string): Promise<DocumentData> {
  // E27 = 기자재 단위 → equipmentId로 필터
  // E26 = 선박 단위 → 전체 프로젝트 데이터
  const hwFilter = equipmentId
    ? { projectId, equipmentId }
    : { projectId };
  const swFilter = equipmentId
    ? { projectId, equipmentId }
    : { projectId };
  const assessFilter = equipmentId
    ? { hardware: { projectId, equipmentId } }
    : { hardware: { projectId } };

  const [project, hardware, software, assessments] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.hardware.findMany({
      where: hwFilter,
      include: {
        software: { select: { id: true, name: true, version: true } },
        _count: { select: { cveMatches: true, assessments: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.software.findMany({
      where: swFilter,
      include: {
        hardware: { select: { id: true, name: true } },
        _count: { select: { cveMatches: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.assessment.findMany({
      where: assessFilter,
      include: { hardware: { select: { id: true, name: true, type: true } } },
      orderBy: [{ hardware: { name: "asc" } }, { checkId: "asc" }],
    }),
  ]);

  if (!project) throw new Error("Project not found");

  return {
    project: {
      id: project.id,
      vesselName: project.vesselName,
      shipowner: project.shipowner,
      classification: project.classification,
      systemName: project.systemName,
    },
    hardware: hardware as HardwareRow[],
    software: software as SoftwareRow[],
    assessments: assessments as AssessmentRow[],
  };
}

// ─── Generator dispatch ─────────────────────────────────────────────────────

// Doc types that have specific generators
const GENERATORS: Record<string, (data: DocumentData) => ReturnType<typeof generateCBS>> = {
  "E27-CBS": (d) => generateCBS(d),
  "E27-SBOM": (d) => generateSBOM(d),
  "E27-AUD": (d) => generateAUD(d),
  "E27-TOP": (d) => generateTOP(d),
};

// Template-based doc types — only data-driven documents that use real CBS data
const TEMPLATE_DOCS: Record<string, { title: string; focus: string }> = {
  // E27 — Assessment & CVE data-driven
  "E27-VUL": { title: "Vulnerability Assessment", focus: "vulnerability" },
  "E27-ACC": { title: "Access Control Policy", focus: "access" },
  "E27-MON": { title: "Audit Log & Monitoring Plan", focus: "monitoring" },
  // E26 — Ship-level aggregation of CBS data (호선 단위, 승인된 기자재 종합)
  "E26-ZCD": { title: "Zones & Conduits Diagram", focus: "zone-design" },
  "E26-INV": { title: "Vessel Asset Inventory", focus: "e26-inventory" },
  "E26-CRA": { title: "Cyber Risk Assessment", focus: "risk-assessment" },
  "E26-CSD": { title: "Cyber Security Design Description", focus: "design-description" },
  "E26-CRP": { title: "Cyber Resilience Test Procedure", focus: "test-procedure" },
};

/** All supported document types with their titles */
export const ALL_DOC_TYPES: Record<string, string> = {
  // Specific generators
  "E27-CBS": "CBS Equipment List & Hardware Details",
  "E27-SBOM": "Software Bill of Materials",
  "E27-AUD": "Security Capability Assessment Report",
  "E27-TOP": "Network & Serial Flow Diagram",
  // Template-based
  ...Object.fromEntries(
    Object.entries(TEMPLATE_DOCS).map(([k, v]) => [k, v.title])
  ),
};

/**
 * Generate a .docx buffer for the given document type.
 */
export async function generateDocx(
  projectId: string,
  docType: string,
  equipmentId?: string,
): Promise<Buffer> {
  // E27 문서는 기자재(equipmentId)로 필터, E26은 전체 프로젝트
  const isE27 = docType.startsWith("E27");
  const data = await fetchDocumentData(projectId, isE27 ? equipmentId : undefined);

  const specificGenerator = GENERATORS[docType];
  if (specificGenerator) {
    const doc = specificGenerator(data);
    return Buffer.from(await Packer.toBuffer(doc));
  }

  const templateInfo = TEMPLATE_DOCS[docType];
  if (templateInfo) {
    const doc = generateTemplate(data, docType, templateInfo.title, templateInfo.focus);
    return Buffer.from(await Packer.toBuffer(doc));
  }

  throw new Error(`Unknown document type: ${docType}`);
}
