import { z } from "zod";
import { MARITIME_ZONES } from "@/lib/constants";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Hardware {
  id: string;
  name: string;
  type: string;
  subType: string | null;
  manufacturer: string | null;
  model: string | null;
  ipAddress: string | null;
  macAddress: string | null;
  zone: string | null;
  location: string | null;
  brand: string | null;
  identifier: string | null;
  category: string | null;
  physicalInterface: string | null;
  commProtocols: string | null;
  logicalLocation: string | null;
  purpose: string | null;
  protectionMethod: string | null;
  sysSoftwareCategory: string | null;
  sysSoftwareVersion: string | null;
  additionalIps: string | null;
  resetPeriodDay: number | null;
  auditExempt?: boolean;
  auditExemptReason?: string | null;
  software: { id: string; name: string; version: string | null }[];
  _count: { cveMatches: number; assessments: number };
  swCveCount?: number;
}

export interface Software {
  id: string;
  name: string;
  version: string | null;
  vendor: string | null;
  swType: string;
  hardwareId: string | null;
  cpe: string | null;
  brand: string | null;
  listeningPort: string | null;
  purpose: string | null;
  modelName: string | null;
  uniqueIdentifier: string | null;
  hardware: { id: string; name: string } | null;
  _count: { cveMatches: number };
}

export interface AssetFile {
  id: number;
  hardwareId: string | null;
  softwareId: string | null;
  filename: string;
  path: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface TemplateInfo {
  id: string;
  name: string;
  nameKo: string;
  description: string;
  descriptionKo: string;
  category: string;
  hwCount: number;
  swCount: number;
}

// ─── Schemas ───────────────────────────────────────────────────────────────────

// ── E27 표준 + 벤더 입력 편의성 트레이드오프 ──
// 출처: docs/archive/E27_field_mapping.md (HW 11개 필수, SW 6개 필수)
//
// 2단계 필수 시스템:
//   - HARD required: 벤더가 본인 제품 기준으로 알 수 있는 E27 필수 항목 → zod로 막음
//   - SOFT required: E27 필수이지만 벤더(비전문가)가 모를 수 있는 항목
//                    → zod는 통과하되 UI에서 별표(주황) + "(E27 권장)" 라벨 + "모르면 비워두거나 - 입력" 안내

export const hwSchema = z.object({
  // ── HARD required (모든 타입 공통) ──
  name: z.string().min(1, "required"),                    // 1. 이름
  type: z.string().min(1, "required"),                    // 2. 유형
  manufacturer: z.string().min(1, "required"),            // 3. 브랜드/제조사
  model: z.string().min(1, "required"),                   // 4. 모델/타입
  purpose: z.string().min(1, "required"),                 // 5. 기능/목적
  // ── Optional (CBS에서 상속 / 조선소가 입력) ──
  category: z.string().optional(),                        // CBS에서 상속 — 벤더가 모름
  zone: z.string().optional(),                            // 접근통제 — 조선소가 결정
  // ── 타입별 HARD (SENSOR 등 hidden일 수 있어 zod에선 optional, UI에서 조건부 필수) ──
  physicalInterface: z.string().optional(),               // 6. 물리적 인터페이스
  commProtocols: z.string().optional(),                   // 9. 통신 프로토콜
  // ── SOFT required (E27 필수이지만 벤더가 모를 수 있음) ──
  sysSoftwareCategory: z.string().optional(),             // 7. 시스템 SW 종류
  sysSoftwareVersion: z.string().optional(),              // 8. SW 버전/패치
  // ── Optional ──
  updateLog: z.string().optional(),
  ipAddress: z.string().optional(),
  macAddress: z.string().optional(),
  location: z.string().optional(),
  brand: z.string().optional(),
  identifier: z.string().optional(),
  logicalLocation: z.string().optional(),
  protectionMethod: z.string().optional(),
});

export const swSchema = z.object({
  // ── HARD required 5개 (E27 필수 + 벤더가 알 수 있음) ──
  name: z.string().min(1, "required"),                    // 1. 이름
  vendor: z.string().min(1, "required"),                  // 2. 브랜드/제조사
  purpose: z.string().min(1, "required"),                 // 4. 기능/목적
  version: z.string().min(1, "required"),                 // 5. 버전
  hardwareId: z.string().min(1, "required"),              // 6. 설치 위치(HW)
  // ── SOFT required 1개 (E27 필수, 임베디드 SW는 없을 수 있음) ──
  modelName: z.string().optional(),                       // 3. 모델/타입
  // ── Optional ──
  osVersion: z.string().optional(),                       // OS 타입만
  firmwareVersion: z.string().optional(),                 // FW 타입만
  updateLog: z.string().optional(),
  swType: z.string().optional(),
  cpe: z.string().optional(),
  brand: z.string().optional(),
  listeningPort: z.string().optional(),
});

export type HwForm = z.infer<typeof hwSchema>;
export type SwForm = z.infer<typeof swSchema>;

// ─── Constants ─────────────────────────────────────────────────────────────────

export const HW_TYPES = [
  { value: "PLC", label: "PLC" },
  { value: "SERVER", label: "Server" },
  { value: "SENSOR", label: "Sensor" },
  { value: "NETWORK_DEVICE", label: "Network Device" },
  { value: "PC", label: "PC / Workstation" },
  { value: "OTHER_DEVICE", label: "Other" },
];

export const SW_TYPES = [
  { value: "OS", label: "Operating System" },
  { value: "APPLICATION", label: "Application" },
  { value: "FIRMWARE", label: "Firmware" },
  { value: "DRIVER", label: "Driver" },
  { value: "LIBRARY", label: "Library" },
  { value: "MIDDLEWARE", label: "Middleware" },
];

export const CATEGORY_OPTIONS = [
  { value: "", label: "Select" },
  { value: "trust", label: "Trust Zone" },
  { value: "untrust", label: "Untrust Zone" },
  { value: "external", label: "External" },
  { value: "dmz", label: "DMZ" },
];

export const ZONE_OPTIONS = MARITIME_ZONES.map((z) => ({
  value: z.id,
  label: z.label,
  labelKo: z.labelKo,
  labelJa: z.labelJa,
}));

export const TEMPLATE_CATEGORY_COLORS: Record<string, string> = {
  automation: "bg-blue-100 text-blue-700",
  navigation: "bg-green-100 text-green-700",
  propulsion: "bg-orange-100 text-orange-700",
};

// ─── Device Type Field Configuration ──────────────────────────────────────────
// Defines which fields are required/optional/hidden per hardware type.
// Fields not listed default to "optional".

export type FieldVisibility = "required" | "optional" | "hidden" | "conditional";

export interface FieldConfig {
  // E27 common required (always shown)
  // name, manufacturer, model, category, purpose, location, zone — always required

  // Type-specific fields
  sysSoftwareCategory: FieldVisibility;
  sysSoftwareVersion: FieldVisibility;
  ipAddress: FieldVisibility;
  macAddress: FieldVisibility;
  physicalInterface: FieldVisibility;
  commProtocols: FieldVisibility;
  protectionMethod: FieldVisibility;
  logicalLocation: FieldVisibility;  // network_segment
  showInstalledSw: boolean;
  showSmartSensor?: boolean;  // Sensor only: checkbox to reveal IT fields
}

// 모든 기술 필드를 "optional"로 완화 — 벤더가 모르거나 해당 없으면 비우기 가능.
// "hidden"은 유지(타입과 무관한 필드 숨김 UX).
export const DEVICE_FIELD_CONFIG: Record<string, FieldConfig> = {
  SERVER: {
    sysSoftwareCategory: "optional",
    sysSoftwareVersion: "optional",
    ipAddress: "optional",
    macAddress: "optional",
    physicalInterface: "optional",
    commProtocols: "optional",
    protectionMethod: "optional",
    logicalLocation: "optional",
    showInstalledSw: true,
  },
  PC: {
    sysSoftwareCategory: "optional",
    sysSoftwareVersion: "optional",
    ipAddress: "optional",
    macAddress: "optional",
    physicalInterface: "optional",
    commProtocols: "optional",
    protectionMethod: "optional",
    logicalLocation: "optional",
    showInstalledSw: true,
  },
  NETWORK_DEVICE: {
    sysSoftwareCategory: "optional",  // firmware
    sysSoftwareVersion: "optional",
    ipAddress: "optional",
    macAddress: "optional",
    physicalInterface: "optional",
    commProtocols: "optional",
    protectionMethod: "optional",
    logicalLocation: "optional",
    showInstalledSw: false,
  },
  PLC: {
    sysSoftwareCategory: "optional",  // 모듈형은 CPU 펌웨어만 해당
    sysSoftwareVersion: "optional",
    ipAddress: "optional",
    macAddress: "optional",
    physicalInterface: "optional",
    commProtocols: "optional",        // standalone PLC도 있음
    protectionMethod: "optional",
    logicalLocation: "optional",
    showInstalledSw: true,
  },
  SENSOR: {
    sysSoftwareCategory: "optional",
    sysSoftwareVersion: "optional",
    ipAddress: "optional",
    macAddress: "optional",
    physicalInterface: "optional",
    commProtocols: "hidden",          // 센서는 통상 통신 프로토콜 무관
    protectionMethod: "hidden",
    logicalLocation: "hidden",
    showInstalledSw: false,
    showSmartSensor: true,
  },
  OTHER_DEVICE: {
    sysSoftwareCategory: "optional",
    sysSoftwareVersion: "optional",
    ipAddress: "optional",
    macAddress: "optional",
    physicalInterface: "optional",
    commProtocols: "optional",
    protectionMethod: "optional",
    logicalLocation: "optional",
    showInstalledSw: true,
  },
};

// ─── E27 필수 필드 분류 (단일 진실 공급원) ──────────────────────────────────
//
// HARD: 입력 안하면 저장 차단 (zod required)
// SOFT: E27 권장이지만 벤더가 모를 수 있어 빈값 허용 (zod optional, UI 별표 표시만)
//
// 모든 입력 모드(SimpleSetup / InlineEditor / HwDialog / HwSlidePanel / HardwareTable)
// 가 동일한 분류를 사용. 진행률·미완료 표시·검증 모두 이 상수 기준.

// 모든 타입에 공통인 HARD required (벤더가 본인 제품 기준으로 알 수 있는 항목만)
// category: CBS에서 상속 (벤더가 모름) → 제외
// zone: 접근통제는 조선소가 결정 → 제외
export const HW_ALWAYS_REQUIRED = ["name", "type", "manufacturer", "model", "purpose"] as const;
// 타입에 따라 hidden일 수 있는 HARD (hidden이면 제외, visible이면 필수)
export const HW_TYPE_DEPENDENT = ["physicalInterface", "commProtocols"] as const;
export const HW_SOFT_REQUIRED = ["sysSoftwareCategory", "sysSoftwareVersion"] as const;

export const SW_HARD_REQUIRED = ["name", "vendor", "version", "hardwareId", "purpose"] as const;
export const SW_SOFT_REQUIRED = ["modelName"] as const;

// ── 하위 호환 ──
export const HW_HARD_REQUIRED = [...HW_ALWAYS_REQUIRED, ...HW_TYPE_DEPENDENT] as const;
export const COMMON_REQUIRED_FIELDS = HW_HARD_REQUIRED;

// ─── Visibility helper ──────────────────────────────────────────────────────

/** DEVICE_FIELD_CONFIG에서 해당 타입의 필드가 hidden이 아닌지 확인 */
export function isFieldVisible(hwType: string, field: string): boolean {
  const fc = DEVICE_FIELD_CONFIG[hwType] || DEVICE_FIELD_CONFIG.OTHER_DEVICE;
  return (fc as unknown as Record<string, string>)[field] !== "hidden";
}

/** 해당 타입에서 HARD required인 필드 목록 반환 (hidden 제외) */
export function getHardRequiredForType(hwType: string): string[] {
  const base = [...HW_ALWAYS_REQUIRED] as string[];
  for (const f of HW_TYPE_DEPENDENT) {
    if (isFieldVisible(hwType, f)) base.push(f);
  }
  return base;
}

/** 해당 타입에서 SOFT required이고 visible인 필드 목록 반환 */
export function getSoftRequiredForType(hwType: string): string[] {
  return HW_SOFT_REQUIRED.filter((f) => isFieldVisible(hwType, f)) as string[];
}

// ─── Validation helpers ──────────────────────────────────────────────────────

interface HwLike {
  name?: string | null;
  type?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  purpose?: string | null;
  physicalInterface?: string | null;
  sysSoftwareCategory?: string | null;
  sysSoftwareVersion?: string | null;
  commProtocols?: string | null;
  category?: string | null;
  zone?: string | null;
}

interface SwLike {
  name?: string | null;
  vendor?: string | null;
  version?: string | null;
  hardwareId?: string | null;
  purpose?: string | null;
  modelName?: string | null;
}

/** HARD 미입력 필드 키 목록 — hidden 필드 자동 제외 */
export function getMissingRequiredHw(hw: HwLike): string[] {
  const required = getHardRequiredForType(hw.type || "OTHER_DEVICE");
  return required.filter((k) => !((hw as Record<string, string | null | undefined>)[k] ?? "").toString().trim());
}

/** SOFT 미입력 필드 키 목록 — hidden 필드 자동 제외 */
export function getMissingRecommendedHw(hw: HwLike): string[] {
  const soft = getSoftRequiredForType(hw.type || "OTHER_DEVICE");
  return soft.filter((k) => !((hw as Record<string, string | null | undefined>)[k] ?? "").toString().trim());
}

// ─── IP / MAC validation ─────────────────────────────────────────────────────

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
const MAC_RE = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

/** IPv4 형식 검사 (빈값은 통과) */
export function isValidIp(v: string | null | undefined): boolean {
  if (!v?.trim()) return true;
  return IPV4_RE.test(v.trim());
}

/** MAC 주소 형식 검사 (빈값은 통과) */
export function isValidMac(v: string | null | undefined): boolean {
  if (!v?.trim()) return true;
  return MAC_RE.test(v.trim());
}

/** HARD 필수값이 모두 채워졌는지 — 저장 가능 여부 */
export function isHwComplete(hw: HwLike): boolean {
  return getMissingRequiredHw(hw).length === 0;
}

/** HARD + SOFT 모두 채워졌는지 — E27 100% 준수 여부 */
export function isHwFullyCompliant(hw: HwLike): boolean {
  return isHwComplete(hw) && getMissingRecommendedHw(hw).length === 0;
}

/** SW HARD 미입력 필드 */
export function getMissingRequiredSw(sw: SwLike): string[] {
  return SW_HARD_REQUIRED.filter((k) => !((sw as Record<string, string | null | undefined>)[k] ?? "").toString().trim());
}

export function isSwComplete(sw: SwLike): boolean {
  return getMissingRequiredSw(sw).length === 0;
}

// Functionality presets for combo-box
export const FUNCTIONALITY_PRESETS = [
  "System management",
  "Navigation",
  "Hosting",
  "Communication",
  "Monitoring",
  "Data logging",
  "Propulsion control",
  "Cargo management",
  "Safety system",
  "Network switching",
  "Firewall / Access control",
  "Sensor data acquisition",
  "Display / HMI",
  "Power management",
];
