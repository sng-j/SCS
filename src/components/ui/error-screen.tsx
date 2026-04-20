"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface ErrorAction {
  label: { en: string; ko: string; ja: string };
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "outline";
}

export interface ErrorScreenProps {
  /** Status code shown in the hero (e.g. "404", "500", "ERR") */
  code: string;
  /** Short ERR_* constant-style key (e.g. "ERR_NOT_FOUND"). Optional. */
  errKey?: string;
  /** Translated title keyed by locale */
  title: { en: string; ko: string; ja: string };
  /** Translated description */
  description: { en: string; ko: string; ja: string };
  /** Reference identifier for support (e.g. error.digest). Safe to show — it's a hashed ID. */
  referenceId?: string;
  /** Additional structured metadata rows (key/value). Only shown when provided. */
  meta?: { label: string; value: string }[];
  /** Optional raw error for development-only inspection. NEVER shown in production. */
  debug?: { message?: string; stack?: string };
  /** 1-2 actions */
  actions: ErrorAction[];
  /** Full-screen vs embedded (e.g. inside dashboard layout) */
  variant?: "fullscreen" | "embedded";
}

/**
 * Unified error presentation used by all error boundaries and 404 pages.
 * Information hiding is the priority:
 *   - `error.message` and stack traces are never shown in production.
 *   - The distinction between 404/403/500 is preserved (industry standard)
 *     but no route path, DB name, or internal detail leaks.
 *   - A short reference ID (from error.digest) is shown so users can cite
 *     it when contacting support.
 */
export function ErrorScreen({
  code,
  errKey,
  title,
  description,
  referenceId,
  meta,
  debug,
  actions,
  variant = "fullscreen",
}: ErrorScreenProps) {
  const { locale } = useLocaleStore();
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    // Timestamp rendered only client-side to avoid hydration mismatch
    const d = new Date();
    setNow(d.toISOString().replace("T", " ").slice(0, 19) + " UTC");
  }, []);

  const isDev = process.env.NODE_ENV === "development";

  const copyRef = () => {
    if (!referenceId) return;
    navigator.clipboard?.writeText(referenceId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };

  const containerClass = variant === "fullscreen"
    ? "flex min-h-screen items-center justify-center px-6 py-12 bg-surface-page relative overflow-hidden"
    : "flex min-h-[60vh] items-center justify-center px-6 py-12 relative";

  return (
    <div className={containerClass}>
      {/* Subtle diagnostic grid backdrop — only on fullscreen variants */}
      {variant === "fullscreen" && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-[0.35]"
          style={{
            backgroundImage: `
              linear-gradient(to right, color-mix(in srgb, var(--color-brand) 6%, transparent) 1px, transparent 1px),
              linear-gradient(to bottom, color-mix(in srgb, var(--color-brand) 6%, transparent) 1px, transparent 1px)
            `,
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(circle at center, black 0%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(circle at center, black 0%, transparent 75%)",
          }}
        />
      )}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 max-w-[560px] w-full"
      >
        {/* ERR_* constant label */}
        {errKey && (
          <div className="flex items-center gap-2 mb-6">
            <span className="font-mono text-[11px] font-semibold text-brand tracking-[0.18em] uppercase">
              {errKey}
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>
        )}

        {/* Hero code */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
          className="flex items-baseline gap-4 mb-1"
        >
          <span
            className="font-mono font-light text-text/15 tabular-nums leading-none select-none"
            style={{ fontSize: "clamp(96px, 14vw, 156px)", letterSpacing: "-0.04em" }}
          >
            {code}
          </span>
        </motion.div>

        {/* Horizontal rule */}
        <div className="h-px bg-border mb-6" />

        {/* Title + description */}
        <h1 className="text-h4 font-extrabold text-text mb-2">
          {title[locale as "en" | "ko" | "ja"] || title.en}
        </h1>
        <p className="text-body-sm text-text-secondary leading-relaxed">
          {description[locale as "en" | "ko" | "ja"] || description.en}
        </p>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 mt-8">
          {actions.map((action, i) => {
            const label = action.label[locale as "en" | "ko" | "ja"] || action.label.en;
            const v = action.variant || (i === 0 ? "primary" : "outline");
            if (action.href) {
              return (
                <Link key={i} href={action.href}>
                  <Button variant={v}>{label}</Button>
                </Link>
              );
            }
            return (
              <Button key={i} variant={v} onClick={action.onClick}>
                {label}
              </Button>
            );
          })}
        </div>

        {/* Metadata row — reference, time, extra */}
        {(referenceId || meta?.length || now) && (
          <div className="mt-12 pt-5 border-t border-border">
            <dl className="font-mono text-[11px] text-text-tertiary space-y-1.5">
              {referenceId && (
                <div className="flex gap-4">
                  <dt className="min-w-[64px]">ref.</dt>
                  <dd className="flex-1 flex items-center gap-2">
                    <code className="text-text-secondary">{referenceId}</code>
                    <button
                      onClick={copyRef}
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded border transition-colors",
                        copied
                          ? "border-brand/40 text-brand bg-brand-lighter"
                          : "border-border text-text-tertiary hover:text-text hover:border-border-strong"
                      )}
                      title={tx(locale, "Copy reference", "참조 번호 복사", "参照番号コピー")}
                    >
                      {copied
                        ? tx(locale, "copied", "복사됨", "コピー済み")
                        : tx(locale, "copy", "복사", "コピー")}
                    </button>
                  </dd>
                </div>
              )}
              {now && (
                <div className="flex gap-4">
                  <dt className="min-w-[64px]">time</dt>
                  <dd className="flex-1 text-text-secondary">{now}</dd>
                </div>
              )}
              {meta?.map((m, i) => (
                <div key={i} className="flex gap-4">
                  <dt className="min-w-[64px]">{m.label}</dt>
                  <dd className="flex-1 text-text-secondary">{m.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* Development-only debug box */}
        {isDev && debug?.message && (
          <details className="mt-6 border border-safety-high/20 bg-risk-bg/40 rounded-md text-[11px] font-mono">
            <summary className="px-3 py-2 cursor-pointer text-safety-high font-semibold tracking-wider uppercase text-[10px]">
              DEV · Raw error (hidden in production)
            </summary>
            <div className="px-3 pb-3 space-y-2 text-text-secondary">
              <p className="font-sans text-text-secondary">{debug.message}</p>
              {debug.stack && (
                <pre className="text-[10px] leading-relaxed overflow-x-auto whitespace-pre">
                  {debug.stack}
                </pre>
              )}
            </div>
          </details>
        )}
      </motion.div>
    </div>
  );
}
