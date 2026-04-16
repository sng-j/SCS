"use client";

import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, onFocus, onBlur, ...props }, ref) => {
    const [focused, setFocused] = useState(false);
    const inputId = id || (typeof label === "string" ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              "text-body-sm font-medium transition-colors duration-200",
              focused ? "text-brand" : "text-text-secondary",
            )}
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "h-10 w-full rounded-[var(--radius-sm)] border px-3 text-body-sm text-text",
            "placeholder:text-text-tertiary",
            "transition-all duration-200 ease-out",
            "focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand",
            "disabled:bg-surface-secondary disabled:text-text-tertiary disabled:cursor-not-allowed",
            error
              ? "border-safety-high bg-risk-bg/50 focus:ring-safety-high/30 focus:border-safety-high animate-[shake_0.4s_ease-in-out]"
              : "border-border bg-white hover:border-border-strong",
            className,
          )}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...props}
        />
        {error && (
          <p
            id={`${inputId}-error`}
            className="text-body-xs text-safety-high animate-[fadeSlideUp_0.2s_ease-out]"
            role="alert"
          >
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-body-xs text-text-tertiary">
            {hint}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
