/**
 * Canonical 5×5 risk matrix → severity label mapping.
 *
 * Thresholds come from the E26/E27 review UI and match the RiskTab scale
 * (see `src/app/(dashboard)/project/[projectId]/assess/page.tsx`). This
 * module is the single source of truth so the same risk score never
 * renders as two different labels in different views (e.g. HIGH in the
 * SUPPORT review screen but MEDIUM in the viewer).
 */

export type RiskSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NEGLIGIBLE";

export const RISK_SEVERITY_COLORS: Record<RiskSeverity, string> = {
  CRITICAL:   "#DA1E28",
  HIGH:       "#EB6200",
  MEDIUM:     "#F1C21B",
  LOW:        "#24A148",
  NEGLIGIBLE: "#8D8D8D",
};

export function riskSeverity(score: number): RiskSeverity {
  if (score >= 20) return "CRITICAL";
  if (score >= 12) return "HIGH";
  if (score >= 6)  return "MEDIUM";
  if (score >= 2)  return "LOW";
  return "NEGLIGIBLE";
}
