"use client";

/**
 * Dialog — enterprise-grade animated modal
 *
 * Usage:
 *   <Dialog open={isOpen} onClose={() => setIsOpen(false)} title="Edit Item">
 *     <p>Content goes here</p>
 *   </Dialog>
 *
 *   With optional description:
 *   <Dialog
 *     open={isOpen}
 *     onClose={() => setIsOpen(false)}
 *     title="Delete Project"
 *     description="This action cannot be undone."
 *     maxWidth="max-w-md"
 *   >
 *     <p>Content goes here</p>
 *   </Dialog>
 */

import { useEffect, useRef, useId, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Animation variants — transitions embedded per variant so framer-motion
// picks up the correct timing on both enter and exit.
// ---------------------------------------------------------------------------
const backdropVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.2, ease: "linear" as const },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.2, ease: "linear" as const },
  },
};

const panelVariants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.97,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    // Spring-like ease-out-expo for a polished enter
    transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
  },
  exit: {
    opacity: 0,
    y: 12,
    scale: 0.98,
    // Ease-in on exit feels snappy and intentional
    transition: { duration: 0.2, ease: [0.4, 0, 1, 1] as const },
  },
};

// ---------------------------------------------------------------------------

export function Dialog({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-lg",
  description,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Lock body scroll when dialog is open
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [open, onClose]);

  // Auto-focus first focusable element once the panel finishes entering
  const handlePanelAnimationComplete = (definition: unknown) => {
    if (definition !== "visible") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = panel.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable?.focus();
  };

  // Restore focus to the element that triggered the dialog
  const handleExitComplete = () => {
    previousFocusRef.current?.focus();
  };

  // Close only when clicking the backdrop overlay itself, not the panel
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <AnimatePresence onExitComplete={handleExitComplete}>
      {open && (
        // Backdrop — fixed inset-0 + flexbox centering (no transform/translate)
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={handleBackdropClick}
          aria-hidden="true"
        >
          {/* Content panel */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            className={cn(
              "relative flex flex-col",
              "w-full bg-surface",
              "rounded-[8px] border border-border",
              "shadow-lg",
              "max-h-[90vh]",
              maxWidth
            )}
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onAnimationComplete={handlePanelAnimationComplete}
            // Prevent clicks inside the panel from bubbling up to the backdrop
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border shrink-0">
              <div className="flex flex-col gap-0.5 min-w-0">
                <h2
                  id={titleId}
                  className="text-h5 text-text leading-snug truncate"
                >
                  {title}
                </h2>
                {description && (
                  <p
                    id={descriptionId}
                    className="text-body-sm text-text-tertiary leading-snug"
                  >
                    {description}
                  </p>
                )}
              </div>

              {/* X close button with subtle hover scale */}
              <motion.button
                type="button"
                onClick={onClose}
                className={cn(
                  "shrink-0 flex items-center justify-center",
                  "h-8 w-8 rounded-[4px]",
                  "text-text-tertiary",
                  "transition-colors duration-150",
                  "hover:text-text hover:bg-surface-secondary",
                  "active:bg-surface-tertiary",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                )}
                aria-label="Close dialog"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                transition={{ duration: 0.12 }}
              >
                <X size={16} aria-hidden="true" />
              </motion.button>
            </div>

            {/* Body — independently scrollable */}
            <div className="px-6 py-5 overflow-y-auto">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
