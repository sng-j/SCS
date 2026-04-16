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
  "E27-CFG": { title: "Security Configuration Guidelines", focus: "hardening" },
  "E27-TST": { title: "Test Procedure for Security Capabilities", focus: "system-test" },
  "E27-SDL": { title: "Secure Development Lifecycle", focus: "sdl" },
  "E27-MNT": { title: "Maintenance & Verification Plan", focus: "maintenance" },
  "E27-INC": { title: "Incident Response & Recovery Plan", focus: "incident" },
  "E27-MOC": { title: "Management of Change Plan", focus: "change" },
  // E26 — Ship-level aggregation of CBS data (호선 단위, 승인된 기자재 종합)
  "E26-ZCD": { title: "Zones & Conduits Diagram", focus: "zone-design" },
  "E26-INV": { title: "Vessel Asset Inventory", focus: "e26-inventory" },
  "E26-CRA": { title: "Cyber Risk Assessment", focus: "risk-assessment" },
  "E26-CSD": { title: "Cyber Security Design Description", focus: "e26-design" },
  "E26-CRP": { title: "Cyber Resilience Test Procedure", focus: "e26-test" },
  "E26-CMP": { title: "Cyber Security Management Plan", focus: "e26-management-plan" },
  "E26-RAP": { title: "Remote Access Policy", focus: "e26-remote-access" },
  "E26-SSL": { title: "Approved Service Supplier List", focus: "supply" },
  "E26-TRA": { title: "Crew Cyber Security Training Record", focus: "e26-training" },
  // IEC 62443
  "IEC-SRA": { title: "Security Risk Assessment", focus: "iec-risk-assessment" },
  "IEC-SLR": { title: "Security Level Report", focus: "iec-security-level" },
  "IEC-SCR": { title: "Security Capability Requirements", focus: "iec-capability-req" },
  "IEC-CSR": { title: "Component Security Requirements", focus: "iec-component-req" },
  "IEC-ZNC": { title: "Zone & Conduit Record", focus: "iec-zone-conduit" },
  // NIST SP 800
  "NIST-CFG": { title: "Baseline Configuration Document", focus: "nist-baseline-config" },
  "NIST-IAM": { title: "Identity & Access Management Policy", focus: "nist-identity-access" },
  "NIST-SUP": { title: "Supply Chain Risk Management Plan", focus: "nist-supply-chain" },
  "NIST-SSA": { title: "System Security Assessment", focus: "nist-system-assessment" },
  // ISO 27001
  "ISO-SOA":   { title: "Statement of Applicability", focus: "iso-soa" },
  "ISO-RTP":   { title: "Risk Treatment Plan", focus: "risk-policy" },
  "ISO-ISMS":  { title: "ISMS Scope and Policy", focus: "iso-isms" },
  "ISO-A5":    { title: "Organizational Controls (A.5)", focus: "iso-a5" },
  "ISO-A7":    { title: "People Controls (A.7)", focus: "iso-a7" },
  "ISO-A8":    { title: "Technology Controls (A.8)", focus: "iso-a8" },
  "ISO-CLOUD": { title: "Cloud Services Security Policy", focus: "iso-cloud" },
  "ISO-ICS":   { title: "IEC 27019 OT/ICS Extension", focus: "iso-ics" },
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
  // E27 + IEC 장비 레벨(SCR/CSR)은 기자재(equipmentId)로 필터, 나머지는 전체 프로젝트
  const isEquipmentLevel = docType.startsWith("E27") || ["IEC-SCR", "IEC-CSR"].includes(docType);
  const data = await fetchDocumentData(projectId, isEquipmentLevel ? equipmentId : undefined);

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
