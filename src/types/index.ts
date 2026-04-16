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
];

export const E26_DOC_TYPES: DocType[] = [
  // E26 — Data-driven from CBS inventory, DFD & assessments (ship-level aggregation)
  { code: "E26-ZCD", standard: "E26", title: "Zones & Conduits Diagram", titleKo: "구역 및 도관 다이어그램" },
  { code: "E26-INV", standard: "E26", title: "Vessel Asset Inventory", titleKo: "선박 자산 인벤토리" },
  { code: "E26-CRA", standard: "E26", title: "Cyber Risk Assessment", titleKo: "사이버 위험 평가서" },
];

export const ALL_DOC_TYPES = [
  ...E27_DOC_TYPES,
  ...E26_DOC_TYPES,
];

// Group by standard for UI tabs
export const DOC_STANDARDS = [
  { id: "E27", label: "IACS UR E27", labelKo: "IACS UR E27" },
  { id: "E26", label: "IACS UR E26", labelKo: "IACS UR E26" },
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
