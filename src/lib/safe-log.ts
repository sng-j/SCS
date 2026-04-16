/**
 * Production-safe error logging.
 * In production, logs only the error message (no stack trace or sensitive details).
 * In development, logs the full error for debugging.
 */

const IS_PROD = process.env.NODE_ENV === "production";

export function safeError(label: string, error: unknown): void {
  if (IS_PROD) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[${label}] ${message}`);
  } else {
    console.error(`[${label}]`, error);
  }
}
