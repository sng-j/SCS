// ── Role types ──
export type Role = "ADMIN" | "SHIPYARD" | "VENDOR";
export type Classification = "KR" | "LR" | "DNV" | "ABS" | "BV" | "CCS" | "NK";

// ── Phase workflow ──
export type Phase = "INVENTORY" | "ASSESS" | "DOCUMENT" | "SUBMIT";

// ── Asset types ──
export type HwType = "PLC" | "SERVER" | "SENSOR" | "NETWORK_DEVICE" | "PC" | "OTHER_DEVICE";
export type SwType = "OS" | "APPLICATION" | "FIRMWARE" | "DRIVER" | "LIBRARY" | "MIDDLEWARE";

// ── DFD types ──
export type DfdSource = "MANUAL" | "TEMPLATE" | "WIZARD" | "AI" | "PHOTO" | "IMPORT";

export interface DfdNode {
  id: string;
  type: HwType;
  label: string;
  position: { x: number; y: number };
  zone?: string;
  data: Record<string, unknown>;
}

export interface DfdEdge {
  id: string;
  source: string;
  target: string;
  type: "ethernet" | "wireless" | "serial";
  label?: string;
}

// ── Safety levels ──
export type SafetyLevel = "HIGH" | "ELEVATED" | "MODERATE" | "LOW";

// ── Assessment ──
export type AssessResult = "PASS" | "FAIL" | "PARTIAL" | "NOT_APPLICABLE" | "NOT_CHECKED";

// ── Document types ──
export interface DocType {
  code: string;
  standard: string;
  title: string;
  titleKo: string;
}

export const E27_DOC_TYPES: DocType[] = [
  // E27 Section 3 — Required (data-driven from CBS inventory & assessments)
  { code: "E27-CBS", standard: "E27", title: "CBS Equipment List & Hardware Details", titleKo: "CBS 장비 목록 및 하드웨어 상세" },
  { code: "E27-SBOM", standard: "E27", title: "Software Bill of Materials", titleKo: "소프트웨어 자재 명세서" },
  { code: "E27-AUD", standard: "E27", title: "Security Capability Assessment Report", titleKo: "보안 능력 평가 보고서" },
  { code: "E27-TOP", standard: "E27", title: "Network & Serial Flow Diagram", titleKo: "네트워크 및 시리얼 플로우 다이어그램" },
  // E27 Supplementary — data-driven from assessments & CVE
  { code: "E27-VUL", standard: "E27", title: "Vulnerability Assessment", titleKo: "취약점 평가서" },
  { code: "E27-ACC", standard: "E27", title: "Access Control Policy", titleKo: "접근 통제 정책서" },
  { code: "E27-MON", standard: "E27", title: "Audit Log & Monitoring Plan", titleKo: "감사 로그 및 모니터링 계획서" },
  { code: "E27-CFG", standard: "E27", title: "Security Configuration Guidelines", titleKo: "보안 구성 가이드라인" },
  { code: "E27-TST", standard: "E27", title: "Test Procedure for Security Capabilities", titleKo: "보안 능력 테스트 절차서" },
  { code: "E27-SDL", standard: "E27", title: "Secure Development Lifecycle", titleKo: "보안 개발 수명주기" },
  { code: "E27-MNT", standard: "E27", title: "Maintenance & Verification Plan", titleKo: "유지보수 및 검증 계획서" },
  { code: "E27-INC", standard: "E27", title: "Incident Response & Recovery Plan", titleKo: "사고 대응 및 복구 계획서" },
  { code: "E27-MOC", standard: "E27", title: "Management of Change Plan", titleKo: "변경 관리 계획서" },
];

export const E26_DOC_TYPES: DocType[] = [
  // E26 — Data-driven from CBS inventory, DFD & assessments (ship-level aggregation)
  { code: "E26-ZCD", standard: "E26", title: "Zones & Conduits Diagram", titleKo: "구역 및 도관 다이어그램" },
  { code: "E26-INV", standard: "E26", title: "Vessel Asset Inventory", titleKo: "선박 자산 인벤토리" },
  { code: "E26-CRA", standard: "E26", title: "Cyber Risk Assessment", titleKo: "사이버 위험 평가서" },
  { code: "E26-CSD", standard: "E26", title: "Cyber Security Design Description", titleKo: "사이버 보안 설계 기술서" },
  { code: "E26-CRP", standard: "E26", title: "Cyber Resilience Test Procedure", titleKo: "사이버 복원력 테스트 절차서" },
  { code: "E26-CMP", standard: "E26", title: "Cyber Security Management Plan", titleKo: "사이버 보안 관리 계획서" },
  { code: "E26-RAP", standard: "E26", title: "Remote Access Policy", titleKo: "원격 접근 정책서" },
  { code: "E26-SSL", standard: "E26", title: "Approved Service Supplier List", titleKo: "승인 서비스 공급자 목록" },
  { code: "E26-TRA", standard: "E26", title: "Crew Cyber Security Training Record", titleKo: "승무원 사이버 보안 교육 기록" },
];

export const IEC_DOC_TYPES: DocType[] = [
  { code: "IEC-SRA", standard: "IEC", title: "Security Risk Assessment", titleKo: "보안 위험 평가서" },
  { code: "IEC-SLR", standard: "IEC", title: "Security Level Report", titleKo: "보안 수준 보고서" },
  { code: "IEC-SCR", standard: "IEC", title: "Security Capability Requirements", titleKo: "보안 능력 요구사항" },
  { code: "IEC-CSR", standard: "IEC", title: "Component Security Requirements", titleKo: "구성요소 보안 요구사항" },
  { code: "IEC-ZNC", standard: "IEC", title: "Zone & Conduit Record", titleKo: "구역 및 도관 기록" },
];

export const NIST_DOC_TYPES: DocType[] = [
  { code: "NIST-CFG", standard: "NIST", title: "Baseline Configuration Document", titleKo: "기준 구성 문서" },
  { code: "NIST-IAM", standard: "NIST", title: "Identity & Access Management Policy", titleKo: "식별 및 접근 관리 정책서" },
  { code: "NIST-SUP", standard: "NIST", title: "Supply Chain Risk Management Plan", titleKo: "공급망 위험 관리 계획서" },
  { code: "NIST-SSA", standard: "NIST", title: "System Security Assessment", titleKo: "시스템 보안 평가서" },
];

export const ISO_DOC_TYPES: DocType[] = [
  { code: "ISO-SOA",   standard: "ISO", title: "Statement of Applicability", titleKo: "적용성 보고서" },
  { code: "ISO-RTP",   standard: "ISO", title: "Risk Treatment Plan", titleKo: "위험 처리 계획서" },
  { code: "ISO-ISMS",  standard: "ISO", title: "ISMS Scope and Policy", titleKo: "ISMS 범위 및 정책서" },
  { code: "ISO-A5",    standard: "ISO", title: "Organizational Controls (A.5)", titleKo: "조직 통제 (A.5)" },
  { code: "ISO-A7",    standard: "ISO", title: "People Controls (A.7)", titleKo: "인적 통제 (A.7)" },
  { code: "ISO-A8",    standard: "ISO", title: "Technology Controls (A.8)", titleKo: "기술 통제 (A.8)" },
  { code: "ISO-CLOUD", standard: "ISO", title: "Cloud Services Security Policy", titleKo: "클라우드 서비스 보안 정책서" },
  { code: "ISO-ICS",   standard: "ISO", title: "IEC 27019 OT/ICS Extension", titleKo: "IEC 27019 OT/ICS 확장" },
];

export const ALL_DOC_TYPES = [
  ...E27_DOC_TYPES,
  ...E26_DOC_TYPES,
  ...IEC_DOC_TYPES,
  ...NIST_DOC_TYPES,
  ...ISO_DOC_TYPES,
];

// Group by standard for UI tabs
export const DOC_STANDARDS = [
  { id: "E27",  label: "IACS UR E27",   labelKo: "IACS UR E27" },
  { id: "E26",  label: "IACS UR E26",   labelKo: "IACS UR E26" },
  { id: "IEC",  label: "IEC 62443",     labelKo: "IEC 62443" },
  { id: "NIST", label: "NIST SP 800",   labelKo: "NIST SP 800" },
  { id: "ISO",  label: "ISO 27001",     labelKo: "ISO 27001" },
];

// ── Classification society labels ──
export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  KR: "한국선급 (KR)",
  LR: "Lloyd's Register (LR)",
  DNV: "DNV",
  ABS: "American Bureau of Shipping (ABS)",
  BV: "Bureau Veritas (BV)",
  CCS: "China Classification Society (CCS)",
  NK: "日本海事協会 ClassNK (NK)",
};
