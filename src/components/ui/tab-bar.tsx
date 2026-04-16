"use client";

// Usage:
//   <TabBar tabs={tabs} activeTab={active} onChange={setActive} />
//   <TabBar tabs={tabs} activeTab={active} onChange={setActive} mode="underline" />

import { type ElementType } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: ElementType<Record<string, unknown>>;
  iconColor?: string;
  count?: number;
}

interface TabBarProps<T extends string> {
  tabs: TabItem<T>[];
  activeTab: T;
  onChange: (tab: T) => void;
  mode?: "pills" | "underline";
  className?: string;
}

const SPRING = { type: "spring", stiffness: 500, damping: 30 } as const;

export function TabBar<T extends string>({
  tabs,
  activeTab,
  onChange,
  mode = "pills",
  className,
}: TabBarProps<T>) {
  if (mode === "underline") {
    return (
      <div
        className={cn(
          "flex items-end gap-0 border-b border-border",
          className,
        )}
        role="tablist"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={cn(
                "relative flex items-center gap-2 px-4 py-2.5 text-body-sm font-medium transition-colors duration-150",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                isActive
                  ? "text-brand"
                  : "text-text-tertiary hover:text-text",
              )}
            >
              {Icon && (
                <Icon
                  size={15}
                  className={isActive ? (tab.iconColor ?? "text-brand") : "text-text-tertiary"}
                  aria-hidden="true"
                />
              )}
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    "ml-0.5 px-1.5 py-0.5 rounded-[var(--radius-xs)] text-caption font-medium",
                    isActive
                      ? "bg-brand-lighter text-brand"
                      : "bg-surface-tertiary/50 text-text-tertiary",
                  )}
                >
                  {tab.count}
                </span>
              )}
              {/* Animated underline indicator */}
              {isActive && (
                <motion.span
                  layoutId="tab-underline-indicator"
                  className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-brand rounded-t-full"
                  transition={SPRING}
                />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // "pills" mode (default)
  return (
    <div
      className={cn(
        "relative flex items-center gap-1 p-1 rounded-[var(--radius-md)] bg-surface-secondary border border-border",
        className,
      )}
      role="tablist"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative flex-1 flex items-center justify-center gap-2 py-2 px-4",
              "rounded-[var(--radius-sm)] text-body-sm font-medium z-10",
              "transition-colors duration-150",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
              isActive
                ? "text-text"
                : "text-text-tertiary hover:text-text",
            )}
          >
            {/* Animated pill background */}
            {isActive && (
              <motion.span
                layoutId="tab-pill-indicator"
                className="absolute inset-0 rounded-[var(--radius-sm)] bg-white shadow-xs border border-border/50"
                transition={SPRING}
                aria-hidden="true"
              />
            )}
            {Icon && (
              <Icon
                size={15}
                className={cn(
                  "relative z-10",
                  isActive ? (tab.iconColor ?? "text-brand") : "text-text-tertiary",
                )}
                aria-hidden="true"
              />
            )}
            <span className="relative z-10">{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={cn(
                  "relative z-10 ml-0.5 px-1.5 py-0.5 rounded-[var(--radius-xs)] text-caption font-medium",
                  isActive
                    ? "bg-brand-lighter text-brand"
                    : "bg-surface-tertiary/50 text-text-tertiary",
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
