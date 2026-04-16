"use client";

import { type ReactNode, type ElementType } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Breadcrumb ─────────────────────────────────────────────────────────────

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center gap-1 text-body-xs", className)}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} className="text-text-tertiary" />}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="text-text-tertiary hover:text-brand transition-colors duration-150"
              >
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "text-text font-medium" : "text-text-tertiary"}>
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

// ─── Page Header ────────────────────────────────────────────────────────────

interface PageHeaderProps {
  icon?: ElementType<Record<string, unknown>>;
  iconColor?: string;
  iconBg?: string;
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  icon: Icon,
  iconColor = "text-brand",
  iconBg = "bg-brand-lighter",
  title,
  subtitle,
  breadcrumbs,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-3 animate-[fadeSlideUp_0.3s_ease-out]", className)}>
      {breadcrumbs && <Breadcrumb items={breadcrumbs} />}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {Icon && (
            <div
              className={cn(
                "flex items-center justify-center h-10 w-10 rounded-[var(--radius-md)] shrink-0",
                "transition-transform duration-200",
                iconBg,
              )}
            >
              <Icon size={20} className={iconColor} />
            </div>
          )}
          <div>
            <h1 className="text-h4 text-text tracking-tight">{title}</h1>
            {subtitle && (
              <p className="text-body-sm text-text-tertiary mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
    </div>
  );
}
