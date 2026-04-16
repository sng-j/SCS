"use client";

import { forwardRef, useCallback, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { cn } from "@/lib/utils";

// Usage examples:
// <Button variant="primary" size="md">Save</Button>
// <Button variant="outline" size="sm" loading>Submitting…</Button>
// <Button variant="ghost" size="icon" aria-label="Close"><CloseIcon /></Button>
// <Button variant="danger" size="lg" onClick={handleDelete}>Delete</Button>

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: [
    "bg-brand text-white shadow-[0_1px_3px_rgba(15,98,254,0.3),0_1px_2px_rgba(0,0,0,0.06)]",
    "hover:bg-brand-hover hover:shadow-[0_2px_6px_rgba(15,98,254,0.35),0_1px_3px_rgba(0,0,0,0.08)]",
    "active:bg-brand-active active:shadow-none",
  ].join(" "),
  secondary: [
    "bg-[#1A1A2E] text-white shadow-[0_1px_3px_rgba(0,0,0,0.12)]",
    "hover:bg-[#252542] hover:shadow-[0_2px_6px_rgba(0,0,0,0.16)]",
    "active:bg-[#16162a]",
  ].join(" "),
  outline: [
    "border border-border bg-white text-text",
    "hover:bg-[#F8F9FA] hover:border-[#C6C6C6] hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)]",
    "active:bg-[#F0F0F0]",
  ].join(" "),
  ghost: [
    "text-text-secondary",
    "hover:bg-[#F4F5F6] hover:text-text",
    "active:bg-[#ECEDEF]",
  ].join(" "),
  danger: [
    "bg-[#DA1E28] text-white shadow-[0_1px_3px_rgba(218,30,40,0.3)]",
    "hover:bg-[#C41922] hover:shadow-[0_2px_6px_rgba(218,30,40,0.35)]",
    "active:bg-[#B0161F]",
  ].join(" "),
};

const sizeStyles: Record<ButtonSize, string> = {
  sm:   "h-8 px-3.5 text-[12px] rounded-lg gap-1.5",
  md:   "h-9 px-4 text-[13px] rounded-lg gap-2",
  lg:   "h-11 px-6 text-[14px] rounded-lg gap-2",
  icon: "h-9 w-9 rounded-lg",
};

function createRipple(event: MouseEvent<HTMLButtonElement>): void {
  const button = event.currentTarget;
  const existing = button.querySelector<HTMLSpanElement>(".btn-ripple");
  if (existing) existing.remove();

  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = event.clientX - rect.left - size / 2;
  const y = event.clientY - rect.top - size / 2;

  const ripple = document.createElement("span");
  ripple.className = "btn-ripple";
  ripple.style.cssText = [
    `width:${size}px`,
    `height:${size}px`,
    `left:${x}px`,
    `top:${y}px`,
    "position:absolute",
    "border-radius:50%",
    "background:currentColor",
    "opacity:0.15",
    "pointer-events:none",
    "animation:ripple 500ms ease-out forwards",
    "transform-origin:center",
  ].join(";");

  button.appendChild(ripple);
  ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      children,
      onClick,
      ...props
    },
    ref,
  ) => {
    const handleClick = useCallback(
      (event: MouseEvent<HTMLButtonElement>) => {
        createRipple(event);
        onClick?.(event);
      },
      [onClick],
    );

    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        className={cn(
          // Layout
          "relative overflow-hidden inline-flex items-center justify-center font-semibold",
          // Transitions — duration-200 ease-out for all interactive properties
          "transition-all duration-200 ease-out",
          // Active press-down micro-animation
          "active:scale-[0.98]",
          // Focus ring using CYTUR border-focus token
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2",
          // Disabled state
          "disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed",
          // Select none — prevents text selection on rapid clicks
          "select-none",
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        disabled={isDisabled}
        aria-busy={loading}
        aria-disabled={isDisabled}
        onClick={handleClick}
        {...props}
      >
        {loading && (
          <svg
            className="h-4 w-4 animate-spin shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
