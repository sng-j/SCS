import { type ElementType } from "react";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  label: string;
  color: string;
  bg: string;
  icon?: ElementType<Record<string, unknown>>;
  className?: string;
}

export function StatusBadge({ label, color, bg, icon: Icon, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-body-xs font-medium",
        bg,
        color,
        className,
      )}
    >
      {Icon && <Icon size={11} />}
      {label}
    </span>
  );
}

/** Predefined status color configs for reuse across pages */
export const STATUS_STYLES = {
  // Project status
  ACTIVE: { color: "text-brand", bg: "bg-brand-lighter" },
  COMPLETED: { color: "text-safety-low", bg: "bg-green-50" },
  ARCHIVED: { color: "text-text-tertiary", bg: "bg-surface-secondary" },

  // Equipment workflow
  PENDING: { color: "text-text-tertiary", bg: "bg-surface-secondary" },
  IN_PROGRESS: { color: "text-blue-600", bg: "bg-blue-50" },
  SUBMITTED: { color: "text-orange-600", bg: "bg-orange-50" },
  UNDER_REVIEW: { color: "text-purple-600", bg: "bg-purple-50" },
  REVISION_REQUESTED: { color: "text-safety-high", bg: "bg-risk-bg" },
  APPROVED: { color: "text-safety-low", bg: "bg-green-50" },

  // Assessment
  PASS: { color: "text-safety-low", bg: "bg-green-50" },
  FAIL: { color: "text-safety-high", bg: "bg-risk-bg" },
  PARTIAL: { color: "text-safety-elevated", bg: "bg-orange-50" },
  NOT_APPLICABLE: { color: "text-text-tertiary", bg: "bg-surface-secondary" },
  NOT_CHECKED: { color: "text-text-tertiary", bg: "bg-surface-secondary" },

  // Submission
  DRAFT: { color: "text-text-tertiary", bg: "bg-surface-secondary" },
  REJECTED: { color: "text-safety-high", bg: "bg-risk-bg" },

  // Risk
  OPEN: { color: "text-safety-high", bg: "bg-risk-bg" },
  MITIGATED: { color: "text-safety-low", bg: "bg-green-50" },
  ACCEPTED: { color: "text-blue-600", bg: "bg-blue-50" },
  TRANSFERRED: { color: "text-slate-600", bg: "bg-slate-50" },
} as const;
