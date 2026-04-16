"use client";

// Usage:
//   const steps = [
//     { id: "inventory",   label: "Inventory",   description: "Add equipment list",   status: "completed", icon: Package },
//     { id: "assessment",  label: "Assessment",  description: "Safety evaluation",    status: "current",   icon: ClipboardCheck },
//     { id: "documents",   label: "Documents",   description: "Upload certificates",  status: "upcoming",  icon: FileText },
//     { id: "submit",      label: "Submit",      description: "Send for review",      status: "upcoming",  icon: Send },
//   ];
//   <Stepper steps={steps} />

import { type ElementType } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type StepStatus = "completed" | "current" | "upcoming";

interface Step {
  id: string;
  label: string;
  description?: string;
  icon?: ElementType<Record<string, unknown>>;
  status: StepStatus;
  href?: string;
}

interface StepperProps {
  steps: Step[];
  className?: string;
}

// Pulse ring animation for the current step
const PulseRing = () => (
  <motion.span
    className="absolute inset-0 rounded-full border-2 border-brand"
    initial={{ scale: 1, opacity: 0.6 }}
    animate={{ scale: 1.45, opacity: 0 }}
    transition={{ duration: 1.4, ease: "easeOut", repeat: Infinity, repeatDelay: 0.4 }}
    aria-hidden="true"
  />
);

// Animated connector line that fills from left on completed segments
interface ConnectorProps {
  filled: boolean;
  vertical?: boolean;
}

function Connector({ filled, vertical = false }: ConnectorProps) {
  if (vertical) {
    return (
      <div className="relative mx-auto my-1 w-0.5 flex-1 min-h-[24px] bg-surface-tertiary rounded-full overflow-hidden">
        {filled && (
          <motion.div
            className="absolute top-0 left-0 right-0 bg-safety-low rounded-full"
            initial={{ height: "0%" }}
            animate={{ height: "100%" }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative flex-1 h-0.5 bg-surface-tertiary rounded-full overflow-hidden">
      {filled && (
        <motion.div
          className="absolute top-0 left-0 bottom-0 bg-safety-low rounded-full"
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        />
      )}
    </div>
  );
}

interface StepCircleProps {
  step: Step;
  index: number;
}

function StepCircle({ step, index }: StepCircleProps) {
  const Icon = step.icon;

  const circleBase =
    "relative flex h-9 w-9 items-center justify-center rounded-full text-body-sm font-semibold flex-shrink-0 transition-colors duration-200";

  if (step.status === "completed") {
    return (
      <span className={cn(circleBase, "bg-safety-low text-white shadow-xs")} aria-hidden="true">
        <Check size={16} strokeWidth={2.5} />
      </span>
    );
  }

  if (step.status === "current") {
    return (
      <span className={cn(circleBase, "bg-brand text-white shadow-sm")} aria-hidden="true">
        <PulseRing />
        {Icon ? <Icon size={16} className="relative z-10" /> : <span className="relative z-10">{index + 1}</span>}
      </span>
    );
  }

  // upcoming
  return (
    <span
      className={cn(
        circleBase,
        "bg-surface-secondary text-text-tertiary border border-border",
      )}
      aria-hidden="true"
    >
      {Icon ? <Icon size={16} /> : index + 1}
    </span>
  );
}

export function Stepper({ steps, className }: StepperProps) {
  const isClickable = (step: Step) =>
    step.href && (step.status === "completed" || step.status === "current");

  return (
    <nav aria-label="Workflow progress" className={cn(className)}>
      {/* ── Desktop: horizontal ── */}
      <ol className="hidden md:flex items-start gap-0">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          const lineIsFilled = step.status === "completed";
          const clickable = isClickable(step);

          return (
            <li key={step.id} className="flex flex-1 items-start">
              <div className="flex flex-col items-center w-full">
                {/* Circle + connector row */}
                <div className="flex w-full items-center">
                  {clickable ? (
                    <a href={step.href}>
                      <StepCircle step={step} index={i} />
                    </a>
                  ) : (
                    <StepCircle step={step} index={i} />
                  )}
                  {!isLast && (
                    <div className="flex-1 mx-2 mt-[18px] self-start">
                      <Connector filled={lineIsFilled} />
                    </div>
                  )}
                </div>

                {/* Labels below circle */}
                <div className="mt-2 text-center px-1">
                  <p
                    className={cn(
                      "text-body-xs font-medium leading-tight",
                      step.status === "completed" && "text-safety-low",
                      step.status === "current" && "text-brand",
                      step.status === "upcoming" && "text-text-tertiary",
                    )}
                  >
                    {step.label}
                  </p>
                  {step.description && (
                    <p className="mt-0.5 text-caption text-text-tertiary leading-snug">
                      {step.description}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* ── Mobile: vertical ── */}
      <ol className="flex md:hidden flex-col">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          const lineIsFilled = step.status === "completed";
          const clickable = isClickable(step);

          return (
            <li key={step.id} className="flex gap-3">
              {/* Left column: circle + vertical line */}
              <div className="flex flex-col items-center">
                {clickable ? (
                  <a href={step.href}>
                    <StepCircle step={step} index={i} />
                  </a>
                ) : (
                  <StepCircle step={step} index={i} />
                )}
                {!isLast && <Connector filled={lineIsFilled} vertical />}
              </div>

              {/* Right column: text */}
              <div className={cn("pb-6 pt-1.5 min-w-0", isLast && "pb-0")}>
                <p
                  className={cn(
                    "text-body-sm font-medium leading-tight",
                    step.status === "completed" && "text-safety-low",
                    step.status === "current" && "text-brand",
                    step.status === "upcoming" && "text-text-tertiary",
                  )}
                >
                  {step.label}
                </p>
                {step.description && (
                  <p className="mt-0.5 text-body-xs text-text-tertiary">
                    {step.description}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
