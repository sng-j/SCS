"use client";

import { type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: ElementType<Record<string, unknown>>;
  iconBg?: string;
  label: string;
  value: string | number;
  valueColor?: string;
  trend?: { value: string; positive?: boolean };
  progress?: { current: number; total: number; color?: string };
  footer?: ReactNode;
  align?: "left" | "center";
  className?: string;
}

export function StatCard({
  icon: Icon,
  iconBg = "bg-brand-lighter",
  label,
  value,
  valueColor,
  trend,
  progress,
  footer,
  align = "center",
  className,
}: StatCardProps) {
  const pct = progress ? Math.round((progress.current / Math.max(progress.total, 1)) * 100) : null;
  const isCenter = align === "center";

  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] bg-white border border-border p-5 shadow-xs",
        "transition-all duration-200 ease-out",
        "hover:shadow-sm hover:border-border-strong",
        isCenter && "text-center",
        className,
      )}
    >
      {/* Icon */}
      <div className={cn("mb-3", isCenter ? "flex justify-center" : "flex items-center justify-between")}>
        <div className={cn("flex items-center justify-center h-9 w-9 rounded-[var(--radius-sm)]", iconBg)}>
          <Icon size={18} className="text-brand" />
        </div>
        {!isCenter && trend && (
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full text-body-xs font-semibold",
              trend.positive ? "bg-green-50 text-safety-low" : "bg-risk-bg text-safety-high",
            )}
          >
            {trend.positive ? "+" : ""}{trend.value}
          </span>
        )}
      </div>

      {/* Value */}
      <p className={cn("text-h4 font-bold tracking-tight", valueColor || "text-text")}>{value}</p>

      {/* Label */}
      <p className="text-body-xs font-medium text-text-tertiary mt-1">{label}</p>

      {/* Trend (centered mode) */}
      {isCenter && trend && (
        <span
          className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-full text-body-xs font-semibold mt-2",
            trend.positive ? "bg-green-50 text-safety-low" : "bg-risk-bg text-safety-high",
          )}
        >
          {trend.positive ? "+" : ""}{trend.value}
        </span>
      )}

      {/* Progress bar */}
      {progress && pct !== null && (
        <div className="mt-3">
          <div className="h-1.5 rounded-full bg-surface-secondary overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-700 ease-out",
                progress.color || "bg-brand",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-body-xs text-text-tertiary mt-1.5">
            {progress.current}/{progress.total} ({pct}%)
          </p>
        </div>
      )}

      {/* Footer */}
      {footer && <div className="mt-3 pt-3 border-t border-border">{footer}</div>}
    </div>
  );
}
