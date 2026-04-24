// Re-export from audit-e27 so there is a single source of truth for E27
// hardening checks (Windows + Linux dispatch). This file historically held a
// duplicate Windows-only copy; keeping the same export surface avoids
// touching the call sites that still do `await import("@/lib/e27-check")`.
export { buildE27 } from "./audit-e27";
export type { E27Item, E27Result } from "./audit-e27";
