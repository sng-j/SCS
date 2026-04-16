import { forwardRef, useState, type SelectHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  error?: string;
  hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, hint, id, options, placeholder, onFocus, onBlur, ...props }, ref) => {
    const [focused, setFocused] = useState(false);
    const selectId = id || (typeof label === "string" ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className={cn(
              "text-body-sm font-medium transition-colors duration-200",
              focused ? "text-brand" : "text-text-secondary",
            )}
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={cn(
            "h-10 w-full rounded-[var(--radius-sm)] border px-3 text-body-sm text-text",
            "transition-all duration-200 ease-out appearance-none",
            "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%238D8D8D%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-10",
            "focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand",
            "disabled:bg-surface-secondary disabled:text-text-tertiary disabled:cursor-not-allowed",
            error
              ? "border-safety-high bg-risk-bg/50 focus:ring-safety-high/30 focus:border-safety-high"
              : "border-border bg-white hover:border-border-strong",
            className
          )}
          aria-invalid={!!error}
          aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && (
          <p id={`${selectId}-error`} className="text-body-xs text-safety-high" role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${selectId}-hint`} className="text-body-xs text-text-tertiary">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";
