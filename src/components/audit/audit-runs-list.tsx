"use client";

import { Shield } from "lucide-react";
import { AuditResultViewer } from "@/components/audit/audit-result-viewer";
import { buildE27 } from "@/lib/audit-e27";
import { tx } from "@/lib/i18n";

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
  if (auditRuns.length === 0) {
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
    <div className="space-y-3">
      {auditRuns.map((run) => {
        const e27 = buildE27(run.results);
        const report = run.results as Parameters<typeof AuditResultViewer>[0]["report"];
        const sysinfo = (report?.SystemInfo || {}) as Record<string, unknown>;
        const matchedHw = run.hardwareId ? hardware.find((h) => h.id === run.hardwareId) : null;
        const deviceName =
          (sysinfo.ComputerName as string) ||
          matchedHw?.name ||
          tx(locale, "Unknown device", "기기 미확인", "デバイス不明");
        const runDate = new Date(run.createdAt).toLocaleString(
          locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US",
          { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" },
        );
        const cveForRun = run.hardwareId ? hwCveMatches.get(run.hardwareId) || [] : [];
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
  );
}
