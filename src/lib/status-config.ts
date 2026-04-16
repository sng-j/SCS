import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Send,
  Eye,
  AlertTriangle,
  CheckCircle,
  XCircle,
  MinusCircle,
  Circle,
  Edit3,
  Lock,
} from "lucide-react";
import type { ElementType } from "react";

// ─── Shared Types ─────────────────────────────────────────────────────────────

interface StatusEntry {
  labelKo: string;
  labelEn: string;
  icon: ElementType;
  color: string;
  bg: string;
}

// ─── Project Status ──────────────────────────────────────────────────────────

export const PROJECT_STATUS_CONFIG: Record<string, StatusEntry> = {
  ACTIVE:       { labelKo: "활성",    labelEn: "Active",       icon: CheckCircle2, color: "text-brand",           bg: "bg-brand-lighter" },
  SUBMITTED:    { labelKo: "제출됨",  labelEn: "Submitted",    icon: Send,         color: "text-orange-600",      bg: "bg-orange-50" },
  UNDER_REVIEW: { labelKo: "검토 중", labelEn: "Under Review", icon: Eye,          color: "text-purple-600",      bg: "bg-purple-50" },
  APPROVED:     { labelKo: "승인됨",  labelEn: "Approved",     icon: CheckCircle,  color: "text-safety-low",      bg: "bg-green-50" },
  CLOSED:       { labelKo: "종료",    labelEn: "Closed",       icon: Lock,         color: "text-text-tertiary",   bg: "bg-surface-secondary" },
};

// ─── Equipment Status ────────────────────────────────────────────────────────

export const EQUIPMENT_STATUS_CONFIG: Record<string, StatusEntry> = {
  PENDING:            { labelKo: "대기",     labelEn: "Pending",            icon: Clock,        color: "text-text-tertiary",   bg: "bg-surface-secondary" },
  IN_PROGRESS:        { labelKo: "진행 중",  labelEn: "In Progress",        icon: AlertCircle,  color: "text-blue-600",        bg: "bg-blue-50" },
  SUBMITTED:          { labelKo: "제출됨",   labelEn: "Submitted",          icon: CheckCircle2, color: "text-orange-600",      bg: "bg-orange-50" },
  UNDER_REVIEW:       { labelKo: "검토 중",  labelEn: "Under Review",       icon: Clock,        color: "text-purple-600",      bg: "bg-purple-50" },
  REVISION_REQUESTED: { labelKo: "수정 요청", labelEn: "Revision Requested", icon: AlertCircle,  color: "text-safety-high",     bg: "bg-risk-bg" },
  APPROVED:           { labelKo: "승인됨",   labelEn: "Approved",           icon: CheckCircle2, color: "text-safety-low",      bg: "bg-green-50" },
};

// ─── Submission Status ───────────────────────────────────────────────────────

export const SUBMISSION_STATUS_CONFIG: Record<string, StatusEntry> = {
  DRAFT:              { labelKo: "초안",     labelEn: "Draft",              icon: Clock,         color: "text-text-tertiary",   bg: "bg-surface-secondary" },
  SUBMITTED:          { labelKo: "제출됨",   labelEn: "Submitted",          icon: Send,          color: "text-brand",           bg: "bg-brand-lighter" },
  UNDER_REVIEW:       { labelKo: "검토 중",  labelEn: "Under Review",       icon: Eye,           color: "text-safety-elevated", bg: "bg-orange-50" },
  REVISION_REQUESTED: { labelKo: "수정 요청", labelEn: "Revision Requested", icon: AlertTriangle, color: "text-safety-elevated", bg: "bg-orange-50" },
  APPROVED:           { labelKo: "승인됨",   labelEn: "Approved",           icon: CheckCircle,   color: "text-safety-low",      bg: "bg-green-50" },
  REJECTED:           { labelKo: "거부됨",   labelEn: "Rejected",           icon: XCircle,       color: "text-safety-high",     bg: "bg-risk-bg" },
};

// ─── Document Status ─────────────────────────────────────────────────────────

export const DOC_STATUS_CONFIG: Record<string, Omit<StatusEntry, "labelKo" | "labelEn">> = {
  DRAFT:     { icon: Edit3,      color: "text-text-tertiary",   bg: "bg-surface-secondary" },
  GENERATED: { icon: CheckCircle, color: "text-brand",          bg: "bg-brand-lighter" },
  EDITED:    { icon: Edit3,      color: "text-safety-elevated", bg: "bg-orange-50" },
  FINALIZED: { icon: Lock,       color: "text-safety-low",      bg: "bg-green-50" },
};

// ─── Assessment Result ───────────────────────────────────────────────────────

export const ASSESS_RESULT_CONFIG: Record<string, StatusEntry> = {
  PASS:           { labelKo: "통과",     labelEn: "Pass",           icon: CheckCircle,   color: "text-safety-low",      bg: "bg-green-50" },
  FAIL:           { labelKo: "실패",     labelEn: "Fail",           icon: XCircle,       color: "text-safety-high",     bg: "bg-risk-bg" },
  PARTIAL:        { labelKo: "부분",     labelEn: "Partial",        icon: AlertTriangle, color: "text-safety-elevated", bg: "bg-orange-50" },
  NOT_APPLICABLE: { labelKo: "해당없음",  labelEn: "N/A",            icon: MinusCircle,   color: "text-text-tertiary",   bg: "bg-surface-secondary" },
  NOT_CHECKED:    { labelKo: "미확인",   labelEn: "Not Checked",    icon: Circle,        color: "text-text-tertiary",   bg: "bg-surface-secondary" },
};

// ─── Risk Status ─────────────────────────────────────────────────────────────

export const RISK_STATUS_CONFIG: Record<string, StatusEntry> = {
  OPEN:        { labelKo: "미처리",  labelEn: "Open",        icon: AlertCircle,  color: "text-text-tertiary",   bg: "bg-surface-secondary" },
  MITIGATED:   { labelKo: "완화됨",  labelEn: "Mitigated",   icon: CheckCircle,  color: "text-safety-low",      bg: "bg-green-50" },
  ACCEPTED:    { labelKo: "수용됨",  labelEn: "Accepted",    icon: CheckCircle2, color: "text-blue-600",        bg: "bg-blue-50" },
  TRANSFERRED: { labelKo: "이전됨",  labelEn: "Transferred", icon: Send,         color: "text-slate-600",       bg: "bg-slate-50" },
};
