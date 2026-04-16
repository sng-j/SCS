"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

// ─── Card ────────────────────────────────────────────────────────────────────

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
  hover?: boolean;
  onClick?: () => void;
}

const paddingStyles = {
  none: "",
  sm: "p-3",
  md: "p-5",
  lg: "p-6",
};

export function Card({ children, className, padding = "none", hover, onClick }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] bg-white border border-border shadow-xs",
        "transition-all duration-200 ease-out",
        paddingStyles[padding],
        hover && "cursor-pointer hover:border-brand/40 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm",
        onClick && "cursor-pointer",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

// ─── Card Header ────────────────────────────────────────────────────────────

interface CardHeaderProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function CardHeader({ title, subtitle, actions, children, className }: CardHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between px-5 py-4 border-b border-border", className)}>
      {children ?? (
        <>
          <div>
            {title && <h3 className="text-body-sm font-semibold text-text">{title}</h3>}
            {subtitle && <p className="text-body-xs text-text-tertiary mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </>
      )}
    </div>
  );
}

// ─── Card Body ──────────────────────────────────────────────────────────────

interface CardBodyProps {
  children: ReactNode;
  className?: string;
}

export function CardBody({ children, className }: CardBodyProps) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

// ─── Card Footer ────────────────────────────────────────────────────────────

interface CardFooterProps {
  children: ReactNode;
  className?: string;
}

export function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div className={cn("flex items-center justify-between px-5 py-3 border-t border-border bg-surface-secondary/30", className)}>
      {children}
    </div>
  );
}
