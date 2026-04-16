import { type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  icon?: ElementType<Record<string, unknown>>;
  iconColor?: string;
  title: string;
  actions?: ReactNode;
  className?: string;
}

export function SectionHeader({ icon: Icon, iconColor = "text-brand", title, actions, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between mb-3", className)}>
      <h2 className="text-body-sm font-semibold text-text flex items-center gap-2">
        {Icon && <Icon size={15} className={iconColor} />}
        {title}
      </h2>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
