import { cn } from "@/lib/utils";
import type { SafetyLevel } from "@/types";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "brand" | "safety";
  safetyLevel?: SafetyLevel;
  className?: string;
}

const safetyColors: Record<SafetyLevel, string> = {
  HIGH: "bg-safety-high text-white",
  ELEVATED: "bg-safety-elevated text-white",
  MODERATE: "bg-safety-moderate text-text",
  LOW: "bg-safety-low text-white",
};

const safetyLabels: Record<SafetyLevel, string> = {
  HIGH: "높음",
  ELEVATED: "경고",
  MODERATE: "보통",
  LOW: "낮음",
};

export function Badge({ children, variant = "default", safetyLevel, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-[4px] px-2 py-0.5",
        "text-label font-medium whitespace-nowrap",
        variant === "default" && "bg-surface-secondary text-text-secondary",
        variant === "brand" && "bg-brand-light text-brand",
        variant === "safety" && safetyLevel && safetyColors[safetyLevel],
        className
      )}
    >
      {variant === "safety" && safetyLevel ? safetyLabels[safetyLevel] : children}
    </span>
  );
}

interface AlertBadgeProps {
  count: number;
  className?: string;
}

export function AlertBadge({ count, className }: AlertBadgeProps) {
  const display = count > 99 ? "99+" : String(count);
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-safety-high text-white",
        "min-w-[20px] h-5 px-1.5 text-body-xs font-medium",
        className
      )}
    >
      {display}
    </span>
  );
}
