/**
 * Objective risk scoring for CVE-derived RiskEntry rows.
 *
 * Replaces the old baseScore→likelihood mapping with inputs that reflect real
 * exploit accessibility, CISA KEV presence, and asset criticality. The same
 * logic is invoked from autoMatchCveForSoftware/Hardware (src/lib/cve-auto-match.ts)
 * and the /risks/generate-from-cve route, so reasoning stays consistent.
 */

export interface CvssMetrics {
  /** Attack Vector: Network / Adjacent / Local / Physical */
  AV?: "N" | "A" | "L" | "P";
  /** Attack Complexity: Low / High */
  AC?: "L" | "H";
  /** Privileges Required: None / Low / High */
  PR?: "N" | "L" | "H";
  /** User Interaction: None / Required */
  UI?: "N" | "R";
}

export interface ScoreInputs {
  baseScore: number | null;
  baseSeverity: string | null;
  cvssVector: string | null;
  /** True if the CVE is on the CISA Known Exploited Vulnerabilities catalog. */
  kevKnown: boolean;
  /** Hardware.category — "1" (CAT I essential), "2", "3" (non-critical), null */
  hwCategory: string | null;
}

export interface ScoreOutput {
  likelihood: number; // 1-5
  impact: number;     // 1-5
  riskLevel: number;  // likelihood × impact (1-25)
  reasoning: Reasoning;
}

export interface Reasoning {
  /** Human-readable one-line summary used as tooltip. Language-neutral tokens. */
  summary: string;
  /** Ordered list of rules that fired; each includes the delta applied. */
  rules: Array<{ rule: string; effect: string }>;
  /** Raw inputs for audit. */
  inputs: {
    baseScore: number | null;
    baseSeverity: string | null;
    cvssVector: string | null;
    kevKnown: boolean;
    hwCategory: string | null;
    metrics: CvssMetrics;
  };
}

// ─── CVSS vector parser ─────────────────────────────────────────────────────

/**
 * Parse a CVSS v3.x vector string into the subset of metrics we care about.
 * Malformed input returns {}; callers fall back to baseScore.
 */
export function parseCvssVector(vector: string | null | undefined): CvssMetrics {
  if (!vector) return {};
  const m: CvssMetrics = {};
  // Strip CVSS:3.1/ prefix and iterate metric:value pairs
  const body = vector.replace(/^CVSS:3\.[01]\//, "").replace(/^CVSS:2\.0\//, "");
  for (const pair of body.split("/")) {
    const [key, value] = pair.split(":");
    if (!key || !value) continue;
    if (key === "AV" && ["N", "A", "L", "P"].includes(value)) m.AV = value as CvssMetrics["AV"];
    if (key === "AC" && ["L", "H"].includes(value)) m.AC = value as CvssMetrics["AC"];
    if (key === "PR" && ["N", "L", "H"].includes(value)) m.PR = value as CvssMetrics["PR"];
    if (key === "UI" && ["N", "R"].includes(value)) m.UI = value as CvssMetrics["UI"];
  }
  return m;
}

// ─── Likelihood ─────────────────────────────────────────────────────────────

/**
 * Compute likelihood (1-5) from CVSS exploitability subscore components.
 *
 * Rationale: CVSS baseScore conflates technical severity with exploitability.
 * The sub-components below (AV/AC/PR/UI) are the accepted industry model of
 * "how reachable/easy is the exploit", which is what likelihood measures.
 *
 * Scoring:
 *   +2  Network attack vector (reachable remotely)
 *   +1  Adjacent (same L2 / VPN)
 *   +1  Low attack complexity
 *   +1  No privileges required
 *   +1  No user interaction
 *   +1  CISA KEV (actively exploited in the wild)
 *   Base: 1 — clamped to [1, 5]
 */
function computeLikelihood(m: CvssMetrics, kev: boolean, baseScore: number | null): { value: number; rules: Array<{ rule: string; effect: string }> } {
  const rules: Array<{ rule: string; effect: string }> = [];
  let score = 1;

  // If we have CVSS metrics, use them; otherwise fall back to baseScore tier
  if (m.AV || m.AC || m.PR || m.UI) {
    if (m.AV === "N") { score += 2; rules.push({ rule: "AV=Network", effect: "+2 (reachable remotely)" }); }
    else if (m.AV === "A") { score += 1; rules.push({ rule: "AV=Adjacent", effect: "+1 (same L2/VPN)" }); }
    else if (m.AV === "L") { rules.push({ rule: "AV=Local", effect: "+0 (local access required)" }); }
    else if (m.AV === "P") { rules.push({ rule: "AV=Physical", effect: "+0 (physical access required)" }); }

    if (m.AC === "L") { score += 1; rules.push({ rule: "AC=Low", effect: "+1 (simple attack)" }); }
    else if (m.AC === "H") { rules.push({ rule: "AC=High", effect: "+0 (complex attack)" }); }

    if (m.PR === "N") { score += 1; rules.push({ rule: "PR=None", effect: "+1 (unauthenticated)" }); }
    else if (m.PR === "L") { rules.push({ rule: "PR=Low", effect: "+0 (low privileges)" }); }
    else if (m.PR === "H") { rules.push({ rule: "PR=High", effect: "+0 (admin privileges)" }); }

    if (m.UI === "N") { score += 1; rules.push({ rule: "UI=None", effect: "+1 (no interaction)" }); }
    else if (m.UI === "R") { rules.push({ rule: "UI=Required", effect: "+0 (user interaction)" }); }
  } else if (baseScore != null) {
    // Fallback: coarse mapping from baseScore
    if (baseScore >= 9.0) { score = 4; rules.push({ rule: "Fallback: baseScore≥9.0", effect: "L=4 (no CVSS vector)" }); }
    else if (baseScore >= 7.0) { score = 3; rules.push({ rule: "Fallback: baseScore≥7.0", effect: "L=3 (no CVSS vector)" }); }
    else if (baseScore >= 4.0) { score = 2; rules.push({ rule: "Fallback: baseScore≥4.0", effect: "L=2 (no CVSS vector)" }); }
    else { rules.push({ rule: "Fallback: baseScore<4.0", effect: "L=1 (no CVSS vector)" }); }
  } else {
    rules.push({ rule: "No CVSS data", effect: "L=1 (default)" });
  }

  if (kev) {
    score = Math.max(score, 4) + 1;
    rules.push({ rule: "CISA KEV listed", effect: "+1 and floor to 4 (actively exploited)" });
  }

  const clamped = Math.max(1, Math.min(5, score));
  if (clamped !== score) rules.push({ rule: "Clamp", effect: `clamped from ${score} to ${clamped}` });

  return { value: clamped, rules };
}

// ─── Impact ─────────────────────────────────────────────────────────────────

/**
 * Compute impact (1-5) from CVSS baseSeverity weighted by hardware category.
 *
 * CAT I (essential safety systems) — full severity weight (1.0)
 * CAT II — reduced weight (0.8)
 * CAT III (non-critical) — further reduced (0.5)
 * No category / unknown — neutral weight (0.8)
 *
 * Rationale: IACS UR E27 treats CAT I assets as mission-critical; a Critical CVE
 * on a bridge PLC is materially different from the same CVE on a crew-info TV.
 */
function computeImpact(severity: string | null, hwCategory: string | null): { value: number; rules: Array<{ rule: string; effect: string }> } {
  const rules: Array<{ rule: string; effect: string }> = [];
  const baseImpact =
    severity?.toUpperCase() === "CRITICAL" ? 5 :
    severity?.toUpperCase() === "HIGH" ? 4 :
    severity?.toUpperCase() === "MEDIUM" ? 3 :
    severity?.toUpperCase() === "LOW" ? 2 : 1;
  rules.push({ rule: `Severity=${severity ?? "—"}`, effect: `base impact = ${baseImpact}` });

  const catWeight =
    hwCategory === "1" ? 1.0 :
    hwCategory === "2" ? 0.8 :
    hwCategory === "3" ? 0.5 :
    0.8;
  const catLabel =
    hwCategory === "1" ? "CAT I (essential)" :
    hwCategory === "2" ? "CAT II" :
    hwCategory === "3" ? "CAT III (non-critical)" :
    "uncategorized";
  rules.push({ rule: catLabel, effect: `× ${catWeight.toFixed(2)}` });

  const weighted = Math.round(baseImpact * catWeight);
  const clamped = Math.max(1, Math.min(5, weighted));
  if (clamped !== weighted) rules.push({ rule: "Clamp", effect: `clamped to ${clamped}` });
  return { value: clamped, rules };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Compute objective risk score with audit-quality reasoning trail.
 * Side-effect free; safe to call from server routes, scripts, or migrations.
 */
export function scoreRisk(inputs: ScoreInputs): ScoreOutput {
  const metrics = parseCvssVector(inputs.cvssVector);
  const L = computeLikelihood(metrics, inputs.kevKnown, inputs.baseScore);
  const I = computeImpact(inputs.baseSeverity, inputs.hwCategory);
  const riskLevel = L.value * I.value;

  const summary = [
    `L=${L.value} · I=${I.value} · score=${riskLevel}`,
    inputs.kevKnown && "CISA-KEV",
    metrics.AV && `AV:${metrics.AV}`,
    inputs.hwCategory && `CAT ${toRoman(inputs.hwCategory)}`,
  ].filter(Boolean).join(" · ");

  return {
    likelihood: L.value,
    impact: I.value,
    riskLevel,
    reasoning: {
      summary,
      rules: [
        { rule: "— Likelihood —", effect: "" },
        ...L.rules,
        { rule: "— Impact —", effect: "" },
        ...I.rules,
      ],
      inputs: {
        baseScore: inputs.baseScore,
        baseSeverity: inputs.baseSeverity,
        cvssVector: inputs.cvssVector,
        kevKnown: inputs.kevKnown,
        hwCategory: inputs.hwCategory,
        metrics,
      },
    },
  };
}

function toRoman(cat: string): string {
  return cat === "1" ? "I" : cat === "2" ? "II" : cat === "3" ? "III" : cat;
}

// ─── KEV lookup helper ──────────────────────────────────────────────────────

/**
 * Quickly check whether a CVE is on the CISA Known Exploited Vulnerabilities
 * catalog. Reads from the shared ExploitRef table (type="kev") to avoid an
 * extra column on CveLocal and to let advisors curate entries manually.
 */
export async function isCveOnKev(
  prismaLike: { exploitRef: { findFirst: (args: { where: { cveId: string; type: string } }) => Promise<{ id: number } | null> } },
  cveId: string,
): Promise<boolean> {
  const hit = await prismaLike.exploitRef.findFirst({
    where: { cveId, type: "kev" },
  });
  return !!hit;
}
