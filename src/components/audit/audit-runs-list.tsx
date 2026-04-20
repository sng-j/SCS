"use client";

import { Shield, AlertCircle, CheckCircle2 } from "lucide-react";
import { AuditResultViewer } from "@/components/audit/audit-result-viewer";
import { buildE27 } from "@/lib/audit-e27";
import { tx } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface AuditRunItem {
  id: string;
  platform: string;
  results: Record<string, unknown>;
  createdAt: string;
  hardwareId: string | null;
}

export interface AuditRunsListViewerCve {
  name: string;
  version: string;
  cves: {
    cveId: string;
    severity: string | null;
    score: number | null;
    description: string;
  }[];
}

/**
 * Shared rendering for "the audit runs of an equipment".
 * Used by:
 *   - vessel-detail.tsx → SUPPORT/ADMIN review screen (assets tab, audit subtab)
 *   - inventory/page.tsx → VENDOR inventory page (audit subtab, slide panel)
 *
 * Groups runs by their target hardware so reviewers can see which device each
 * scsaudit file came from, and which devices have yet to be audited. A small
 * coverage bar at the top surfaces the audited / total ratio.
 *
 * Per-run CVE context is fed in as a Map keyed by hardwareId so the viewer's
 * Software/CVE tab shows matches that belong to the audited host.
 */
export function AuditRunsList({
  auditRuns,
  hwCveMatches,
  hardware,
  locale,
  emptyHintKo,
  emptyHintEn,
  emptyHintJa,
}: {
  auditRuns: AuditRunItem[];
  hwCveMatches: Map<string, AuditRunsListViewerCve[]>;
  hardware: Array<{ id: string; name: string }>;
  locale: string;
  emptyHintKo?: string;
  emptyHintEn?: string;
  emptyHintJa?: string;
}) {
  // Group runs by hardwareId; runs with no hardwareId (equipment-level) bucket separately.
  const runsByHw = new Map<string, AuditRunItem[]>();
  const equipmentLevelRuns: AuditRunItem[] = [];
  for (const run of auditRuns) {
    if (run.hardwareId) {
      if (!runsByHw.has(run.hardwareId)) runsByHw.set(run.hardwareId, []);
      runsByHw.get(run.hardwareId)!.push(run);
    } else {
      equipmentLevelRuns.push(run);
    }
  }

  const auditedCount = hardware.filter((h) => runsByHw.has(h.id)).length;
  const totalAuditable = hardware.length;
  const coveragePct = totalAuditable > 0 ? Math.round((auditedCount / totalAuditable) * 100) : 0;

  if (auditRuns.length === 0 && hardware.length === 0) {
    return (
      <div className="py-12 text-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
        <Shield size={28} className="mx-auto text-gray-300 mb-2" />
        <p className="text-[13px] text-gray-400">
          {tx(
            locale,
            emptyHintEn || "No audit runs uploaded",
            emptyHintKo || "업로드된 점검 결과 없음",
            emptyHintJa || "アップロードされた監査結果なし",
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Coverage bar */}
      <div className="rounded-xl border border-border bg-white px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Shield size={13} className="text-brand" />
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
              {tx(locale, "Audit coverage", "점검 커버리지", "監査カバレッジ")}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums">
            <span className={cn("font-bold", coveragePct === 100 ? "text-safety-low" : coveragePct > 0 ? "text-safety-elevated" : "text-text-tertiary")}>
              {auditedCount} / {totalAuditable}
            </span>
            <span className="text-text-tertiary">{tx(locale, "audited", "감사 완료", "監査済み")}</span>
            <span className={cn("font-bold text-[12px]", coveragePct === 100 ? "text-safety-low" : coveragePct > 0 ? "text-safety-elevated" : "text-text-tertiary")}>
              {coveragePct}%
            </span>
          </div>
        </div>
        <div className="h-1.5 w-full rounded-full bg-border/60 overflow-hidden">
          <div
            className={cn(
              "h-full transition-[width] duration-500 ease-out",
              coveragePct === 100 ? "bg-safety-low" : coveragePct > 0 ? "bg-safety-elevated" : "bg-border-strong",
            )}
            style={{ width: `${coveragePct}%` }}
          />
        </div>
      </div>

      {/* Per-HW groups */}
      {hardware.map((hw) => {
        const runs = runsByHw.get(hw.id) || [];
        const hasRuns = runs.length > 0;
        return (
          <div key={hw.id} className="rounded-xl border border-border bg-white overflow-hidden">
            <div className={cn(
              "px-4 py-2.5 border-b border-border flex items-center gap-2",
              hasRuns ? "bg-surface-secondary/30" : "bg-gray-50/50",
            )}>
              {hasRuns ? (
                <CheckCircle2 size={13} className="text-safety-low shrink-0" />
              ) : (
                <AlertCircle size={13} className="text-safety-elevated shrink-0" />
              )}
              <span className="text-[12px] font-bold text-text truncate">{hw.name}</span>
              <span className="ml-auto font-mono text-[10px] tabular-nums text-text-tertiary">
                {hasRuns
                  ? `${runs.length} ${tx(locale, "run(s)", "회", "回")}`
                  : tx(locale, "Not audited", "미감사", "未監査")}
              </span>
            </div>
            {hasRuns ? (
              <div className="p-3 space-y-3">
                {runs.map((run) => {
                  const e27 = buildE27(run.results);
                  const report = run.results as Parameters<typeof AuditResultViewer>[0]["report"];
                  const sysinfo = (report?.SystemInfo || {}) as Record<string, unknown>;
                  const deviceName = (sysinfo.ComputerName as string) || hw.name;
                  const runDate = new Date(run.createdAt).toLocaleString(
                    locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US",
                    { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" },
                  );
                  const cveForRun = hwCveMatches.get(hw.id) || [];
                  return (
                    <AuditResultViewer
                      key={run.id}
                      e27={e27}
                      report={report}
                      cveMatches={cveForRun}
                      deviceName={deviceName}
                      runDate={runDate}
                    />
                  );
                })}
              </div>
            ) : (
              <p className="px-4 py-3 text-[11px] text-text-tertiary italic">
                {tx(
                  locale,
                  "Upload a .scsaudit from this HW row to populate this section.",
                  "이 HW 행에서 .scsaudit 파일을 업로드하면 이 섹션이 채워집니다.",
                  "このHW行から.scsauditファイルをアップロードするとこのセクションが埋まります。",
                )}
              </p>
            )}
          </div>
        );
      })}

      {/* Equipment-level runs (no hardwareId) — rare but possible */}
      {equipmentLevelRuns.length > 0 && (
        <div className="rounded-xl border border-border bg-white overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-surface-secondary/30 flex items-center gap-2">
            <Shield size={13} className="text-text-tertiary shrink-0" />
            <span className="text-[12px] font-bold text-text">
              {tx(locale, "Equipment-level runs", "장비 단위 점검", "機器単位の監査")}
            </span>
            <span className="ml-auto font-mono text-[10px] tabular-nums text-text-tertiary">
              {equipmentLevelRuns.length} {tx(locale, "run(s)", "회", "回")}
            </span>
          </div>
          <div className="p-3 space-y-3">
            {equipmentLevelRuns.map((run) => {
              const e27 = buildE27(run.results);
              const report = run.results as Parameters<typeof AuditResultViewer>[0]["report"];
              const sysinfo = (report?.SystemInfo || {}) as Record<string, unknown>;
              const deviceName = (sysinfo.ComputerName as string) || tx(locale, "Unknown device", "기기 미확인", "デバイス不明");
              const runDate = new Date(run.createdAt).toLocaleString(
                locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US",
                { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" },
              );
              return (
                <AuditResultViewer
                  key={run.id}
                  e27={e27}
                  report={report}
                  cveMatches={[]}
                  deviceName={deviceName}
                  runDate={runDate}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
