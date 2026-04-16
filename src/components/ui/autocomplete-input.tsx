"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  projectId: string;
  field: string;
  kind?: "hw" | "sw";
  context?: Record<string, string>;
  placeholder?: string;
  required?: boolean;
  className?: string;
  disabled?: boolean;
  label?: string;
}

export default function AutocompleteInput({
  value,
  onChange,
  projectId,
  field,
  kind = "hw",
  context = {},
  placeholder,
  required,
  className = "",
  disabled,
  label,
}: AutocompleteInputProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const fetchSuggestions = useCallback(
    async (query: string) => {
      try {
        const params = new URLSearchParams({
          field,
          kind,
          query,
          ...context,
        });
        const res = await fetch(
          `/api/projects/${projectId}/suggestions?${params}`
        );
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions || []);
        }
      } catch {
        // Silently fail
      }
    },
    [projectId, field, kind, context]
  );

  // Fetch on focus (empty query = show all static suggestions)
  const handleFocus = () => {
    setOpen(true);
    setHighlightIdx(-1);
    fetchSuggestions(value);
  };

  // Debounced fetch on input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    setOpen(true);
    setHighlightIdx(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 200);
  };

  const handleSelect = (s: string) => {
    onChange(s);
    setOpen(false);
    setSuggestions([]);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((prev) =>
        prev <= 0 ? suggestions.length - 1 : prev - 1
      );
    } else if (e.key === "Enter" && highlightIdx >= 0) {
      e.preventDefault();
      handleSelect(suggestions[highlightIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Re-fetch when context changes
  useEffect(() => {
    if (open) fetchSuggestions(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(context)]);

  const filtered = suggestions.filter(
    (s) => s.toLowerCase() !== value.toLowerCase()
  );

  return (
    <div ref={wrapRef} className="relative">
      {label && (
        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={`w-full px-3 py-2 border border-[var(--border-primary)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto backdrop-blur-none">
          {filtered.map((s, i) => (
            <li
              key={s}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(s);
              }}
              onMouseEnter={() => setHighlightIdx(i)}
              className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                i === highlightIdx
                  ? "bg-blue-500/10 text-blue-600"
                  : "text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
              }`}
            >
              {highlightMatch(s, value)}
            </li>
          ))}
          <li className="px-3 py-1.5 text-[10px] text-gray-400 border-t border-gray-100 bg-gray-50/50 select-none">
            ✏️ 직접 입력도 가능합니다
          </li>
        </ul>
      )}
    </div>
  );
}

/** Highlight matching substring */
function highlightMatch(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-semibold text-blue-600">
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}
