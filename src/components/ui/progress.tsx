"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ProgressProps {
  value: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  color?: string;
  showLabel?: boolean;
  label?: string;
  className?: string;
}

const sizeStyles = {
  sm: "h-1",
  md: "h-2",
  lg: "h-3",
};

function getAutoColor(pct: number): string {
  if (pct >= 80) return "bg-safety-low";
  if (pct >= 50) return "bg-safety-elevated";
  if (pct >= 20) return "bg-safety-moderate";
  return "bg-text-tertiary";
}

export function Progress({
  value,
  max = 100,
  size = "md",
  color,
  showLabel,
  label,
  className,
}: ProgressProps) {
  const pct = Math.min(Math.round((value / Math.max(max, 1)) * 100), 100);
  const barColor = color || getAutoColor(pct);

  return (
    <div className={cn("w-full", className)}>
      {(showLabel || label) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && <span className="text-body-xs font-medium text-text-secondary">{label}</span>}
          {showLabel && <span className="text-body-xs font-medium text-text-tertiary">{pct}%</span>}
        </div>
      )}
      <div
        className={cn(
          "w-full rounded-full bg-surface-secondary overflow-hidden",
          sizeStyles[size],
        )}
      >
        <motion.div
          className={cn("h-full rounded-full", barColor)}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  );
}
