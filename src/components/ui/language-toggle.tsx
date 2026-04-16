"use client";

import { useState, useRef, useEffect } from "react";
import { useLocaleStore } from "@/stores/locale-store";
import { Globe, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";

const LANGS: { value: Locale; label: string; flag: string }[] = [
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "ko", label: "한국어", flag: "🇰🇷" },
  { value: "ja", label: "日本語", flag: "🇯🇵" },
];

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale } = useLocaleStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = LANGS.find((l) => l.value === locale) || LANGS[0];

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] border border-border bg-white text-body-xs font-medium text-text-tertiary hover:text-text-secondary hover:bg-surface-secondary transition-all"
      >
        <Globe size={12} />
        {current.label}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-1">
          {LANGS.map((lang) => (
            <button
              key={lang.value}
              onClick={() => { setLocale(lang.value); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left hover:bg-gray-50 transition-colors"
            >
              <span className="text-[15px]">{lang.flag}</span>
              <span className={locale === lang.value ? "font-semibold text-brand" : "text-text-secondary"}>
                {lang.label}
              </span>
              {locale === lang.value && <Check size={14} className="ml-auto text-brand" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
