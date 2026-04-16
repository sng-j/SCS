"use client";

import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface TooltipProps {
  content: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

const positionStyles = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

const motionVariants = {
  top: { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 } },
  bottom: { initial: { opacity: 0, y: -4 }, animate: { opacity: 1, y: 0 } },
  left: { initial: { opacity: 0, x: 4 }, animate: { opacity: 1, x: 0 } },
  right: { initial: { opacity: 0, x: -4 }, animate: { opacity: 1, x: 0 } },
};

export function Tooltip({ content, children, side = "top", className }: TooltipProps) {
  const [show, setShow] = useState(false);
  const variant = motionVariants[side];

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            role="tooltip"
            initial={variant.initial}
            animate={variant.animate}
            exit={variant.initial}
            transition={{ duration: 0.15 }}
            className={cn(
              "absolute z-50 px-2.5 py-1.5 rounded-[var(--radius-sm)]",
              "bg-surface-dark text-text-on-dark text-body-xs font-medium",
              "whitespace-nowrap pointer-events-none shadow-md",
              positionStyles[side],
              className,
            )}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
