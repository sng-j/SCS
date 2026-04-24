"use client";

import { useState } from "react";
import { Shield, AlertCircle, CheckCircle2, MinusCircle, Ban, RotateCcw } from "lucide-react";
import { AuditResultViewer } from "@/components/audit/audit-result-viewer";
import { buildE27 } from "@/lib/audit-e27";
import { tx } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { showToast } from "@/lib/toast";

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
  projectId,
  canEdit = false,
  onExemptChanged,
  locale,
  emptyHintKo,
  emptyHintEn,
  emptyHintJa,
}: {
  auditRuns: AuditRunItem[];
  hwCveMatches: Map<string, AuditRunsListViewerCve[]>;
  hardware: Array<{ id: string; name: string; auditExempt?: boolean; auditExemptReason?: string | null }>;
  /** Required when canEdit=true — used for the PATCH URL */
  projectId?: string;
  /** When true the component renders a "mark exempt / unmark" action per HW. */
  canEdit?: boolean;
  /** Called after a successful exempt toggle so the caller can refetch. */
  onExemptChanged?: () => void;
  locale: string;
  emptyHintKo?: string;
  emptyHintEn?: string;
  emptyHintJa?: string;
}) {
  // State for the exempt-reason dialog
  const [exemptTarget, setExemptTarget] = useState<{ id: string; name: string } | null>(null);
  const [exemptReason, setExemptReason] = useState("");
  const [exemptSaving, setExemptSaving] = useState(false);

  const toggleExempt = async (hwId: string, next: boolean, reason?: string) => {
    if (!projectId) return;
    setExemptSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/hardware/${hwId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auditExempt: next,
          auditExemptReason: next ? (reason || null) : null,
        }),
      });
      if (res.ok) {
        showToast.success(tx(locale,
          next ? "Marked as audit-exempt" : "Exempt flag removed",
          next ? "비대상으로 표시됨" : "비대상 해제됨",
          next ? "監査対象外として設定" : "監査対象外を解除"));
        onExemptChanged?.();
      } else {
        showToast.error(tx(locale, "Failed to update", "업데이트 실패", "更新失敗"));
      }
    } finally {
      setExemptSaving(false);
      setExemptTarget(null);
      setExemptReason("");
    }
  };
  // Group runs by hardwareId; runs with no hardwareId (equipment-level)
  // bucket separately. Within each bucket we keep the list sorted newest-
  // first so the renderer can safely take `runs[0]` as the latest. (The
  // API already returns desc order but we re-sort defensively in case a
  // caller reorders.)
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
  const byDateDesc = (a: AuditRunItem, b: AuditRunItem) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  for (const arr of runsByHw.values()) arr.sort(byDateDesc);
  equipmentLevelRuns.sort(byDateDesc);

  const exemptCount = hardware.filter((h) => h.auditExempt).length;
  const auditedCount = hardware.filter((h) => !h.auditExempt && runsByHw.has(h.id)).length;
  const totalAuditable = hardware.length - exemptCount;
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
            {exemptCount > 0 && (
              <span className="ml-1 text-text-tertiary italic">
                · {tx(locale, `${exemptCount} exempt`, `비대상 ${exemptCount}`, `対象外 ${exemptCount}`)}
              </span>
            )}
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
        const isExempt = hw.auditExempt === true;
        return (
          <div key={hw.id} className={cn(
            "rounded-xl border overflow-hidden",
            isExempt ? "border-dashed border-border bg-gray-50/40" : "border-border bg-white",
          )}>
            <div className={cn(
              "px-4 py-2.5 border-b flex items-center gap-2",
              isExempt ? "border-border/60 bg-gray-50/60" : hasRuns ? "bg-surface-secondary/30 border-border" : "bg-gray-50/50 border-border",
            )}>
              {isExempt ? (
                <MinusCircle size={13} className="text-text-tertiary shrink-0" />
              ) : hasRuns ? (
                <CheckCircle2 size={13} className="text-safety-low shrink-0" />
              ) : (
                <AlertCircle size={13} className="text-safety-elevated shrink-0" />
              )}
              <span className={cn("text-[12px] font-bold truncate", isExempt ? "text-text-tertiary" : "text-text")}>{hw.name}</span>
              <span className="ml-auto font-mono text-[10px] tabular-nums text-text-tertiary">
                {isExempt
                  ? tx(locale, "Exempt", "비대상", "対象外")
                  : hasRuns
                    ? `${runs.length} ${tx(locale, "run(s)", "회", "回")}`
                    : tx(locale, "Not audited", "미감사", "未監査")}
              </span>
              {canEdit && (
                isExempt ? (
                  <button
                    onClick={() => toggleExempt(hw.id, false)}
                    disabled={exemptSaving}
                    className="flex items-center gap-1 rounded-md border border-border bg-white px-2 py-0.5 text-[10px] font-semibold text-text-secondary hover:bg-gray-50 disabled:opacity-50"
                    title={tx(locale, "Remove exempt flag", "비대상 해제", "対象外を解除")}
                  >
                    <RotateCcw size={10} />
                    {tx(locale, "Unmark", "해제", "解除")}
                  </button>
                ) : (
                  <button
                    onClick={() => { setExemptTarget({ id: hw.id, name: hw.name }); setExemptReason(""); }}
                    disabled={exemptSaving}
                    className="flex items-center gap-1 rounded-md border border-border bg-white px-2 py-0.5 text-[10px] font-semibold text-text-tertiary hover:text-text-secondary hover:bg-gray-50 disabled:opacity-50"
                    title={tx(locale, "Mark as audit-exempt", "비대상으로 표시", "監査対象外として設定")}
                  >
                    <Ban size={10} />
                    {tx(locale, "Mark exempt", "비대상", "対象外")}
                  </button>
                )
              )}
            </div>
            {isExempt ? (
              <p className="px-4 py-3 text-[11px] text-text-tertiary italic">
                {tx(locale,
                  "Marked as audit-exempt — excluded from coverage.",
                  "감사 비대상으로 표시됨 — 커버리지에서 제외됩니다.",
                  "監査対象外として設定 — カバレッジから除外されます。")}
                {hw.auditExemptReason && (
                  <span className="block mt-1 not-italic font-medium text-text-secondary">
                    {tx(locale, "Reason", "사유", "理由")}: {hw.auditExemptReason}
                  </span>
                )}
              </p>
            ) : hasRuns ? (
              <div className="p-3 space-y-3">
                {/* Only the most recent run is rendered. Older runs remain
                    in the database for history, but reviewers asked for a
                    single current snapshot — two cards at 52% side-by-side
                    was visual clutter without new information. */}
                {(() => {
                  const run = runs[0];
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
                })()}
                {runs.length > 1 && (
                  <p className="text-[10px] text-text-tertiary italic text-center">
                    {tx(locale,
                      `+${runs.length - 1} earlier run(s) retained in history`,
                      `이전 점검 ${runs.length - 1}회 · 이력에만 보관`,
                      `以前の監査 ${runs.length - 1} 回 · 履歴に保存`)}
                  </p>
                )}
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
            {(() => {
              const run = equipmentLevelRuns[0];
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
            })()}
            {equipmentLevelRuns.length > 1 && (
              <p className="text-[10px] text-text-tertiary italic text-center">
                {tx(locale,
                  `+${equipmentLevelRuns.length - 1} earlier run(s) retained in history`,
                  `이전 점검 ${equipmentLevelRuns.length - 1}회 · 이력에만 보관`,
                  `以前の監査 ${equipmentLevelRuns.length - 1} 回 · 履歴に保存`)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Exempt-reason dialog — lightweight inline modal so we don't drag in
          another Dialog dependency for this single flow. */}
      {exemptTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !exemptSaving && setExemptTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[14px] font-bold text-text mb-1">
              {tx(locale, "Mark as audit-exempt", "감사 비대상으로 표시", "監査対象外に設定")}
            </h3>
            <p className="text-[11px] text-text-tertiary mb-3">
              <strong className="text-text-secondary">{exemptTarget.name}</strong>{" "}
              {tx(locale,
                "will be excluded from the coverage ratio.",
                "은(는) 커버리지 계산에서 제외됩니다.",
                "はカバレッジ計算から除外されます。")}
            </p>
            <label className="block text-[11px] font-semibold text-text-secondary mb-1">
              {tx(locale, "Reason (recommended)", "사유 (권장)", "理由(推奨)")}
            </label>
            <textarea
              value={exemptReason}
              onChange={(e) => setExemptReason(e.target.value)}
              rows={3}
              placeholder={tx(locale,
                "e.g. Firmware-only device, vendor-locked appliance",
                "예: 펌웨어 전용 장비, 벤더 락 어플라이언스",
                "例: ファームウェア専用機器、ベンダーロック機器")}
              className="w-full rounded-md border border-border px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setExemptTarget(null)}
                disabled={exemptSaving}
                className="rounded-md border border-border bg-white px-3 py-1.5 text-[11px] font-semibold text-text-secondary hover:bg-gray-50 disabled:opacity-50"
              >
                {tx(locale, "Cancel", "취소", "キャンセル")}
              </button>
              <button
                onClick={() => toggleExempt(exemptTarget.id, true, exemptReason)}
                disabled={exemptSaving}
                className="rounded-md bg-brand px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
              >
                {exemptSaving
                  ? tx(locale, "Saving…", "저장 중…", "保存中…")
                  : tx(locale, "Mark exempt", "비대상으로 표시", "対象外に設定")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
