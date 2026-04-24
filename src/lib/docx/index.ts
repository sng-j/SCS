/**
 * Document generator dispatcher — routes docType to the appropriate generator.
 */
import { Packer } from "docx";
import { prisma } from "@/lib/prisma";
import type { ProjectContext, HardwareRow, SoftwareRow, AssessmentRow, ConnectionRow, AuditRunRow, RiskEntryRow } from "./shared";
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
  connections: ConnectionRow[];
  auditRuns: AuditRunRow[];
  risks: RiskEntryRow[];
  /** DFD JSON payload (xyflow format) when scoped to a single equipment; null otherwise. */
  dfd: { nodes: unknown[]; edges: unknown[] } | null;
  equipmentId: string | null;
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

  // Risks are scoped to a specific equipment (see RiskEntry.equipmentId).
  // For equipment-level docs (E27, IEC-SCR/CSR) pull just that equipment's
  // risks — otherwise E27-VUL for one piece of equipment would leak risks
  // from unrelated equipments and break compliance claims.
  const riskFilter = equipmentId
    ? { projectId, equipmentId, deletedAt: null }
    : { projectId, deletedAt: null };

  const [project, hardware, software, assessments, connections, auditRuns, risks, dfdRow] = await Promise.all([
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
    prisma.networkConnection.findMany({
      // Scope connections to the equipment (either endpoint is enough) so
      // E27-TOP for one piece of equipment doesn't list flows from a
      // completely different equipment in the same vessel.
      where: equipmentId
        ? { projectId, OR: [{ fromHw: { equipmentId } }, { toHw: { equipmentId } }] }
        : { projectId },
      include: {
        fromHw: { select: { id: true, name: true } },
        toHw: { select: { id: true, name: true } },
      },
    }),
    prisma.auditRun.findMany({
      where: equipmentId ? { equipmentId } : { projectId },
      select: { id: true, hardwareId: true, platform: true, results: true, sbomData: true },
    }),
    prisma.riskEntry.findMany({
      where: riskFilter,
      select: {
        id: true, threatId: true, cveId: true, assetRef: true,
        likelihood: true, impact: true, riskLevel: true, status: true, mitigation: true,
      },
      orderBy: [{ riskLevel: "desc" }, { threatId: "asc" }],
    }),
    // DFD is equipment-scoped; project-level docs don't have a single
    // diagram and fall back to the connection matrix alone.
    equipmentId
      ? prisma.dfdDiagram.findUnique({ where: { equipmentId } })
      : Promise.resolve(null),
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
    connections: connections as ConnectionRow[],
    auditRuns: auditRuns as AuditRunRow[],
    risks: risks as RiskEntryRow[],
    dfd: (() => {
      if (!dfdRow) return null;
      try {
        const parsed = JSON.parse(dfdRow.data) as { nodes?: unknown[]; edges?: unknown[] };
        return { nodes: parsed.nodes ?? [], edges: parsed.edges ?? [] };
      } catch {
        return null;
      }
    })(),
    equipmentId: equipmentId ?? null,
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
  "E27-SEC": { title: "Description of Security Capabilities", focus: "security-capabilities" },
  "E27-PAT": { title: "Patch Management Procedure", focus: "patch-management" },
  // E26 — Ship-level aggregation of CBS data (호선 단위, 승인된 기자재 종합)
  "E26-ZCD": { title: "Zones & Conduits Diagram", focus: "zone-design" },
  "E26-INV": { title: "Vessel Asset Inventory", focus: "e26-inventory" },
  "E26-CRA": { title: "Cyber Risk Assessment", focus: "risk-assessment" },
  "E26-CSD": { title: "Cyber Security Design Description", focus: "e26-design" },
  "E26-CRP": { title: "Cyber Resilience Test Procedure", focus: "e26-test" },
  "E26-CMP": { title: "Cyber Security Management Plan", focus: "e26-management" },
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
  "NIST-IAM": { title: "Identity & Access Management Policy", focus: "nist-iam" },
  "NIST-SUP": { title: "Supply Chain Risk Management Plan", focus: "nist-supply-chain" },
  "NIST-SSA": { title: "System Security Assessment", focus: "nist-system-assessment" },
  // ISO 27001
  "ISO-SOA":   { title: "Statement of Applicability", focus: "iso-soa" },
  "ISO-RMP":   { title: "Risk Management Policy", focus: "risk-policy" },
  "ISO-RTP":   { title: "Risk Treatment Plan", focus: "risk-treatment" },
  "ISO-ISMS":  { title: "ISMS Scope and Policy", focus: "iso-isms" },
  "ISO-A5":    { title: "Organizational Controls (A.5)", focus: "iso-a5" },
  "ISO-A7":    { title: "People Controls (A.7)", focus: "iso-a7" },
  "ISO-A8":    { title: "Technology Controls (A.8)", focus: "iso-a8" },
  "ISO-CLOUD": { title: "Cloud Services Security Policy", focus: "iso-cloud" },
  "ISO-ICS":   { title: "IEC 27019 OT/ICS Extension", focus: "iso-ics" },
};

/**
 * Returns true when the given role is permitted to GENERATE (create /
 * regenerate / delete) a document of `docType`. Enforces the division of
 * labour between vendors (E27 only) and shipyard personnel / admins (all
 * standards). Read-only roles (SHIPYARD viewer) are not generators.
 */
export function canGenerateDocType(role: string, docType: string): boolean {
  if (role === "ADMIN" || role === "SUPPORT") return true;
  if (role === "VENDOR") return docType.startsWith("E27-");
  return false;
}

/**
 * Returns true when the given role may READ (preview / download) a document
 * of `docType`. Distinct from `canGenerateDocType` because the SHIPYARD
 * viewer is explicitly allowed to inspect every document in their yard's
 * scope, even though they cannot create any. Earlier revisions reused the
 * generate check here and accidentally blocked the viewer from reading
 * their own submission package.
 */
export function canViewDocType(role: string, docType: string): boolean {
  if (role === "ADMIN" || role === "SUPPORT" || role === "SHIPYARD") return true;
  if (role === "VENDOR") return docType.startsWith("E27-");
  return false;
}

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
