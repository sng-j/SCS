"use client";

import { tx } from "@/lib/i18n";

/**
 * Reasoning payload stored in RiskEntry.reasoning. Produced by scoreRisk()
 * in @/lib/risk-scoring and optionally annotated with a userOverride block
 * by the PATCH route when reviewers adjust L/I manually.
 */
export interface ReasoningPayload {
  summary?: string;
  rules?: Array<{ rule: string; effect: string }>;
  inputs?: {
    baseScore: number | null;
    baseSeverity: string | null;
    cvssVector: string | null;
    kevKnown: boolean;
    hwCategory: string | null;
    metrics: { AV?: string; AC?: string; PR?: string; UI?: string };
  };
  userOverride?: {
    previousLikelihood: number;
    previousImpact: number;
    newLikelihood: number;
    newImpact: number;
    at: string;
    by: string;
  };
}

/**
 * Parse a stored reasoning JSON safely. Returns null if empty/invalid so
 * callers can skip rendering the hover entirely.
 */
export function parseReasoning(raw: string | null | undefined): ReasoningPayload | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ReasoningPayload;
  } catch {
    return null;
  }
}

/**
 * Determines whether the current role should see the reasoning hover.
 * Vendors and read-only viewers see only the final numbers; SUPPORT/ADMIN
 * get the full audit trail.
 */
export function canSeeRiskReasoning(role: string | null | undefined): boolean {
  return role === "SUPPORT" || role === "ADMIN";
}

/**
 * Hover tooltip content — rendered inside a group-hover container by the caller.
 * Positions itself next to the wrapping element with fixed width + shadow.
 */
export function RiskReasoningHover({
  reasoning,
  locale,
}: {
  reasoning: ReasoningPayload;
  locale: string;
}) {
  const hasAuto = !!reasoning.summary && !!reasoning.rules?.length;
  const override = reasoning.userOverride;
  return (
    <div className="absolute z-50 left-full top-0 ml-2 w-80 rounded-lg border border-border bg-white shadow-lg p-3 text-left pointer-events-none">
      {override && (
        <div className="mb-2 rounded-md border border-safety-elevated/30 bg-orange-50 px-2 py-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-safety-elevated">
            {tx(locale, "Manually adjusted", "수동 조정됨", "手動調整済み")}
          </p>
          <p className="text-[10px] text-text-secondary mt-0.5">
            L {override.previousLikelihood} → {override.newLikelihood} · I{" "}
            {override.previousImpact} → {override.newImpact}
          </p>
          <p className="text-[9px] text-text-tertiary mt-0.5 font-mono">{override.by}</p>
        </div>
      )}
      {hasAuto && (
        <>
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-tertiary mb-1.5">
            {tx(locale, "Auto-calculation", "자동 산출 근거", "自動算出根拠")}
          </p>
          <p className="font-mono text-[11px] text-text mb-2 break-words">{reasoning.summary}</p>
          <div className="space-y-1 border-t border-border/60 pt-2">
            {reasoning.rules!.map((r, i) =>
              r.effect ? (
                <div key={i} className="flex items-start gap-2 text-[10px] leading-tight">
                  <span className="font-mono text-text-secondary shrink-0">{r.rule}</span>
                  <span className="text-text-tertiary flex-1">{r.effect}</span>
                </div>
              ) : (
                <div
                  key={i}
                  className="text-[9px] font-bold text-text-tertiary uppercase tracking-wider pt-1"
                >
                  {r.rule}
                </div>
              ),
            )}
          </div>
          {reasoning.inputs?.cvssVector && (
            <p className="mt-2 pt-2 border-t border-border/60 font-mono text-[9px] text-text-tertiary break-all">
              {reasoning.inputs.cvssVector}
            </p>
          )}
        </>
      )}
      {!hasAuto && !override && (
        <p className="text-[10px] text-text-tertiary italic">
          {tx(
            locale,
            "Manually entered risk — no auto-calculation data",
            "수동 입력 리스크 — 자동 산출 데이터 없음",
            "手動入力リスク — 自動算出データなし",
          )}
        </p>
      )}
    </div>
  );
}
