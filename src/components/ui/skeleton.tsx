// No "use client" needed — pure CSS animation, zero JS overhead.

// Usage:
//   <Skeleton className="h-4 w-32" />
//   <SkeletonText lines={3} />
//   <SkeletonTable rows={6} />
//   <SkeletonCards count={4} />

import { cn } from "@/lib/utils";

// ── Base shimmer style ─────────────────────────────────────────────────────────
//
// Uses the existing @keyframes shimmer defined in globals.css:
//   0%   { background-position: -200% 0; }
//   100% { background-position:  200% 0; }
//
// The gradient moves a highlight band from left to right.
// background-size: 200% ensures the gradient spans wider than the element.

const shimmerClass =
  "animate-[shimmer_1.6s_linear_infinite] bg-[length:200%_100%]" +
  " bg-[linear-gradient(90deg,var(--color-surface-secondary)_25%,var(--color-surface-tertiary)_50%,var(--color-surface-secondary)_75%)]";

// ── Skeleton (base block) ──────────────────────────────────────────────────────

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cn(
        shimmerClass,
        "rounded-[var(--radius-sm)]",
        className,
      )}
    />
  );
}

// ── SkeletonText (paragraph lines) ────────────────────────────────────────────

interface SkeletonTextProps {
  /** Number of text lines to render */
  lines?: number;
  className?: string;
}

// Varying widths give a realistic paragraph feel
const LINE_WIDTHS = ["w-full", "w-[88%]", "w-[94%]", "w-[76%]", "w-[82%]", "w-[60%]"];

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cn("space-y-2", className)} role="presentation" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-3.5",
            // Last line is always shorter to mimic real paragraph end
            i === lines - 1 ? "w-2/5" : LINE_WIDTHS[i % LINE_WIDTHS.length],
          )}
        />
      ))}
    </div>
  );
}

// ── SkeletonTable (header + data rows) ────────────────────────────────────────

interface SkeletonTableProps {
  rows?: number;
  className?: string;
}

export function SkeletonTable({ rows = 5, className }: SkeletonTableProps) {
  return (
    <div
      className={cn("space-y-0", className)}
      role="presentation"
      aria-hidden="true"
    >
      {/* Header row */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-border">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20 ml-auto" />
      </div>

      {/* Data rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-b-0"
        >
          {/* Leading icon placeholder */}
          <Skeleton className="h-7 w-7 flex-shrink-0 rounded-[var(--radius-sm)]" />
          {/* Primary cell */}
          <Skeleton className={cn("h-3.5", i % 2 === 0 ? "w-40" : "w-32")} />
          {/* Secondary cell */}
          <Skeleton className="h-3 w-24" />
          {/* Tertiary cell */}
          <Skeleton className="h-3 w-16" />
          {/* Badge / action */}
          <Skeleton className="h-6 w-16 rounded-full ml-auto" />
        </div>
      ))}
    </div>
  );
}

// ── SkeletonCards (metric / stat cards grid) ───────────────────────────────────

interface SkeletonCardsProps {
  count?: number;
  className?: string;
}

export function SkeletonCards({ count = 4, className }: SkeletonCardsProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4",
        className,
      )}
      role="presentation"
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-[var(--radius-md)] border border-border bg-white p-5 space-y-3"
        >
          {/* Icon + label row */}
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-[var(--radius-sm)] flex-shrink-0" />
            <div className="space-y-1.5 flex-1 min-w-0">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-5 w-12" />
            </div>
          </div>
          {/* Progress bar */}
          <Skeleton className="h-1 w-full rounded-full" />
          {/* Footer note */}
          <Skeleton className="h-2.5 w-24" />
        </div>
      ))}
    </div>
  );
}
