"use client";

import { forwardRef, useState, type TextareaHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, onFocus, onBlur, ...props }, ref) => {
    const [focused, setFocused] = useState(false);
    const textareaId = id || (typeof label === "string" ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className={cn(
              "text-body-sm font-medium transition-colors duration-200",
              focused ? "text-brand" : "text-text-secondary",
            )}
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={4}
          className={cn(
            "w-full rounded-[var(--radius-sm)] border px-3 py-2.5 text-body-sm text-text resize-y min-h-[80px]",
            "placeholder:text-text-tertiary",
            "transition-all duration-200 ease-out",
            "focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand",
            "disabled:bg-surface-secondary disabled:text-text-tertiary disabled:cursor-not-allowed",
            error
              ? "border-safety-high bg-risk-bg/50 focus:ring-safety-high/30 focus:border-safety-high"
              : "border-border bg-white hover:border-border-strong",
            className,
          )}
          aria-invalid={!!error}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          {...props}
        />
        {error && (
          <p className="text-body-xs text-safety-high animate-[fadeSlideUp_0.2s_ease-out]" role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <p className="text-body-xs text-text-tertiary">{hint}</p>
        )}
      </div>
    );
  },
);

Textarea.displayName = "Textarea";
