"use client";

import { type ElementType, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: ElementType<Record<string, unknown>>;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, subtitle, action, className }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "flex flex-col items-center justify-center py-16 text-center",
        className,
      )}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1, ease: "easeOut" }}
        className="flex items-center justify-center h-14 w-14 rounded-[var(--radius-md)] bg-brand-lighter mb-4"
      >
        <Icon size={24} className="text-brand" />
      </motion.div>
      <p className="text-body-sm font-semibold text-text">{title}</p>
      {subtitle && (
        <p className="text-body-xs text-text-tertiary mt-1.5 max-w-sm leading-relaxed">
          {subtitle}
        </p>
      )}
      {action && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="mt-5"
        >
          {action}
        </motion.div>
      )}
    </motion.div>
  );
}
