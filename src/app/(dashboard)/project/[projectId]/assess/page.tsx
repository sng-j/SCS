"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, ArrowLeft, ChevronDown, CheckCircle, XCircle,
  AlertTriangle, MinusCircle, Circle, Cpu, Eye, Save,
  BarChart3, History, ClipboardCheck, Server, Radio,
  Network, Monitor, HardDrive, Search, Plus, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkflowSteps } from "@/components/ui/workflow-steps";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardBody } from "@/components/ui/card";
import { SkeletonTable } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { E27_SC_CHECKS, type SCCheck, SOCIETY_CHECKLIST_EXTRA, type SocietyCheckItem, SOCIETY_DETAILS } from "@/lib/constants";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface HwItem { id: string; name: string; type: string; }
interface Assessment { hardwareId: string; checkId: string; standard: string; result: string; evidence: string | null; note: string | null; }

type Result = "PASS" | "FAIL" | "PARTIAL" | "NOT_APPLICABLE" | "NOT_CHECKED";

const RESULTS: { key: Result; labelKo: string; labelEn: string; labelJa: string; color: string; bg: string; icon: React.ElementType<Record<string, unknown>> }[] = [
  { key: "PASS",           labelKo: "통과",   labelEn: "PASS",    labelJa: "合格",     color: "#24A148", bg: "#E6F7EF", icon: CheckCircle },
  { key: "FAIL",           labelKo: "실패",   labelEn: "FAIL",    labelJa: "不合格",   color: "#DA1E28", bg: "#FFF1F1", icon: XCircle },
  { key: "PARTIAL",        labelKo: "부분",   labelEn: "PARTIAL", labelJa: "一部合格", color: "#EB6200", bg: "#FFF3E0", icon: AlertTriangle },
  { key: "NOT_APPLICABLE", labelKo: "해당없음", labelEn: "N/A",   labelJa: "該当なし", color: "#8D8D8D", bg: "#F4F4F4", icon: MinusCircle },
  { key: "NOT_CHECKED",    labelKo: "미확인", labelEn: "—",       labelJa: "未確認",   color: "#C6C6C6", bg: "#F4F4F4", icon: Circle },
];

type TabId = "sc" | "risk" | "society";

const HW_ICONS: Record<string, React.ElementType<Record<string, unknown>>> = {
  PLC: Cpu, SERVER: Server, SENSOR: Radio, NETWORK_DEVICE: Network, PC: Monitor, OTHER_DEVICE: HardDrive,
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AssessPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const equipmentId = searchParams.get("equipmentId");
  const { data: session } = useSession();
  const { locale } = useLocaleStore();
  const userRole = (session?.user as { role?: string })?.role || "VENDOR";

  // Check equipment lock status
  const [eqStatus, setEqStatus] = useState("");
  useEffect(() => {
    if (!equipmentId) return;
    fetch(`/api/projects/${projectId}/equipment`)
      .then(async (r) => { if (r.ok) { const list = await r.json(); const eq = list.find((e: { id: string; status: string }) => e.id === equipmentId); if (eq) setEqStatus(eq.status); } })
      .catch(() => {});
  }, [projectId, equipmentId]);
  const isLocked = userRole === "VENDOR" && ["SUBMITTED", "APPROVED"].includes(eqStatus);
  const canEdit = (userRole === "VENDOR" || userRole === "ADMIN") && !isLocked;

  const [tab, setTab] = useState<TabId>("sc");
  const [hardware, setHardware] = useState<HwItem[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [openHwId, setOpenHwId] = useState<string | null>(null);

  // SC Check filters
  const [scSearch, setScSearch] = useState("");

  useEffect(() => {
    const eqParam = equipmentId ? `?equipmentId=${equipmentId}` : "";
    Promise.all([
      fetch(`/api/projects/${projectId}/hardware${eqParam}`).then((r) => r.ok ? r.json() : []),
      fetch(`/api/projects/${projectId}/assessments`).then((r) => r.ok ? r.json() : []),
    ]).then(([hw, assess]) => {
      setHardware(hw);
      // Filter assessments to only this equipment's HW
      const hwIds = new Set(hw.map((h: HwItem) => h.id));
      setAssessments(assess.filter((a: Assessment) => hwIds.has(a.hardwareId)));
      if (hw.length > 0) setOpenHwId(hw[0].id);
    }).finally(() => setLoading(false));
  }, [projectId, equipmentId]);

  const getAssessment = useCallback((hwId: string, checkId: string): Assessment | undefined => {
    return assessments.find((a) => a.hardwareId === hwId && a.checkId === checkId);
  }, [assessments]);

  const saveRef = useRef<HTMLDivElement>(null);

  const handleSave = useCallback(async (hwId: string, checkId: string, field: string, value: string) => {
    // result 변경 → 해당 SC에 assessment가 존재하는 HW만 일괄 적용
    // (오딧 미업로드 HW에는 새로 만들지 않음)
    // evidence/note 변경 → 해당 HW만
    const targetHwIds = field === "result"
      ? [...new Set([hwId, ...assessments.filter((a) => a.checkId === checkId).map((a) => a.hardwareId)])]
      : [hwId];

    // Optimistic update
    setAssessments((prev) => {
      let updated = [...prev];
      for (const tid of targetHwIds) {
        const existing = updated.find((a) => a.hardwareId === tid && a.checkId === checkId);
        const body = {
          hardwareId: tid,
          checkId,
          standard: "E27",
          result: existing?.result || "NOT_CHECKED",
          evidence: existing?.evidence || "",
          note: existing?.note || "",
          [field]: value,
        } as Assessment;
        const idx = updated.findIndex((a) => a.hardwareId === tid && a.checkId === checkId);
        if (idx >= 0) updated = updated.map((a, i) => i === idx ? body : a);
        else updated = [...updated, body];
      }
      return updated;
    });

    // API: 모든 대상 HW에 저장
    const promises = targetHwIds.map((tid) => {
      const existing = getAssessment(tid, checkId);
      const body = {
        hardwareId: tid,
        checkId,
        standard: "E27",
        result: existing?.result || "NOT_CHECKED",
        evidence: existing?.evidence || "",
        note: existing?.note || "",
        [field]: value,
      };
      return fetch(`/api/projects/${projectId}/assessments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    });

    const results = await Promise.all(promises);
    if (results.some((r) => !r.ok)) showToast.error(tx(locale, "Save failed", "저장 실패", "保存失敗"));
  }, [projectId, getAssessment, locale, hardware]);

  const anchorHwId = hardware.length > 0 ? hardware[0].id : null;
  const hwIds = hardware.map((h: HwItem) => h.id);

  // ─── CBS 전체 종합 판정 (하나라도 FAIL이면 FAIL) ─────────────────────
  // SC별로 모든 HW의 assessment를 종합해서 CBS 단위 결과를 산출

  const getConsolidatedResult = useCallback((checkId: string): Result => {
    // 해당 SC에 대해 assessment가 존재하는 HW만 대상 (오딧 미업로드 HW는 제외)
    const scAssessments = assessments.filter((a) => a.checkId === checkId && hwIds.includes(a.hardwareId));
    if (scAssessments.length === 0) return "NOT_CHECKED";
    const results = scAssessments.map((a) => a.result);
    if (results.includes("FAIL")) return "FAIL";
    if (results.includes("PARTIAL")) return "PARTIAL";
    if (results.every((r) => r === "PASS")) return "PASS";
    if (results.every((r) => r === "NOT_APPLICABLE")) return "NOT_APPLICABLE";
    return "NOT_CHECKED";
  }, [assessments, hwIds]);

  // ─── Summary counts (CBS 종합 기준) ──────────────────────────────────

  const totalChecks = E27_SC_CHECKS.length;
  const counts = RESULTS.reduce((acc, r) => { acc[r.key] = 0; return acc; }, {} as Record<Result, number>);
  for (const check of E27_SC_CHECKS) {
    const r = getConsolidatedResult(check.id);
    counts[r] = (counts[r] || 0) + 1;
  }

  return (
    <div>
      <WorkflowSteps currentSegment="assess" projectId={projectId} equipmentId={equipmentId} />
    <div className="max-w-[1400px] mx-auto px-6 py-8" ref={saveRef}>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Link href={equipmentId ? `/project/${projectId}/equipment/${equipmentId}` : `/project/${projectId}`} className="inline-flex items-center gap-1 text-body-xs text-text-tertiary hover:text-brand transition-colors mb-6">
          <ArrowLeft size={14} /> {equipmentId ? (tx(locale, "Equipment", "기자재", "機器")) : (tx(locale, "Project", "프로젝트", "プロジェクト"))}
        </Link>

        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-orange-50 to-safety-elevated/10 border border-safety-elevated/15 flex items-center justify-center shadow-xs">
              <Shield size={22} className="text-safety-elevated" />
            </div>
            <div>
              <h1 className="text-h4 font-extrabold text-text tracking-tight">{tx(locale, "Security Assessment", "보안 평가", "セキュリティ評価")}</h1>
              <p className="text-body-sm text-text-tertiary mt-0.5">
                {canEdit
                  ? (tx(locale, "Assess SC-1 to SC-13 security checks", "SC-1~SC-13 보안 항목을 평가하세요", "SC-1〜SC-13セキュリティ項目を評価してください"))
                  : (tx(locale, "View security assessments (read-only)", "보안 평가 현황을 확인합니다 (읽기 전용)", "セキュリティ評価状況を確認します（読み取り専用）"))
                }
              </p>
            </div>
          </div>
          {!canEdit && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-secondary border border-border text-body-xs font-semibold text-text-tertiary">
              <Eye size={13} /> {tx(locale, "Read Only", "읽기 전용", "読み取り専用")}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 p-1 rounded-xl bg-surface-secondary border border-border w-fit mb-6 shadow-xs">
          {([
            { id: "sc" as TabId, icon: Shield, label: tx(locale, "SC Checks", "SC 체크", "SCチェック") },
            { id: "risk" as TabId, icon: BarChart3, label: tx(locale, "Risk", "리스크", "リスク") },
            { id: "society" as TabId, icon: ClipboardCheck, label: tx(locale, "Society", "선급", "船級") },
          ]).map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={cn(
              "px-4 py-2 rounded-lg text-[13px] font-semibold transition-all duration-200 flex items-center gap-2",
              tab === t.id
                ? "bg-white text-text shadow-sm border border-border/60"
                : "text-text-tertiary hover:text-text-secondary hover:bg-white/50",
            )}>
              <t.icon size={14} className={tab === t.id ? "text-brand" : ""} /> {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <Card padding="none"><CardBody><SkeletonTable rows={6} /></CardBody></Card>
        ) : tab === "sc" ? (
          <>
            {/* Summary bar */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-6 p-3 rounded-xl bg-surface-secondary/50 border border-border">
              {RESULTS.map((r) => (
                <div key={r.key} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-border/60 shadow-xs">
                  <div className="h-7 w-7 rounded-md flex items-center justify-center shrink-0" style={{ background: r.bg }}>
                    <r.icon size={13} style={{ color: r.color }} />
                  </div>
                  <div>
                    <p className="text-[15px] font-extrabold leading-none" style={{ color: r.color }}>{counts[r.key]}</p>
                    <p className="text-[10px] text-text-tertiary mt-0.5 font-medium">{locale === "ko" ? r.labelKo : locale === "ja" ? (r.labelJa || r.labelEn) : r.labelEn}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Search + Filter */}
            <div className="flex items-center gap-2 mb-6 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-[320px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                <input
                  value={scSearch}
                  onChange={(e) => setScSearch(e.target.value)}
                  placeholder={tx(locale, "Search checks...", "SC 항목 검색...", "SC項目を検索...")}
                  className="w-full h-9 pl-9 pr-3 rounded-lg border border-border text-[12px] text-text placeholder:text-border-strong focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                />
              </div>
            </div>

            {(() => {
              // Filter checks by search
              const filteredChecks = E27_SC_CHECKS.filter((check) => {
                if (!scSearch.trim()) return true;
                const q = scSearch.toLowerCase();
                return check.id.toLowerCase().includes(q)
                  || check.title.toLowerCase().includes(q)
                  || check.titleKo.toLowerCase().includes(q)
                  || check.description.toLowerCase().includes(q);
              });

              return !anchorHwId ? (
                <EmptyState icon={Cpu} title={tx(locale, "No equipment to assess", "평가할 기자재가 없습니다", "評価する機器がありません")} subtitle={tx(locale, "Register hardware in the inventory first", "먼저 인벤토리에서 하드웨어를 등록하세요", "まずインベントリにハードウェアを登録してください")} />
              ) : filteredChecks.length === 0 ? (
                <EmptyState icon={Search} title={tx(locale, "No results", "검색 결과가 없습니다", "検索結果がありません")} />
              ) : (
                <Card padding="none">
                  <div className="divide-y divide-border">
                    {filteredChecks.map((check) => {
                      const consolidated = getConsolidatedResult(check.id);
                      // 편집용: anchorHwId의 개별 결과 (버튼 활성 상태용)
                      const editAssessment = assessments.find((a) => a.hardwareId === anchorHwId && a.checkId === check.id);
                      return (
                        <ScCheckRow
                          key={check.id}
                          check={check}
                          assessment={editAssessment}
                          consolidatedResult={consolidated}
                          hwId={anchorHwId!}
                          canEdit={canEdit}
                          locale={locale}
                          onSave={handleSave}
                          hwCount={hardware.length}
                          scAssessments={assessments.filter((a) => a.checkId === check.id && hwIds.includes(a.hardwareId))}
                        />
                      );
                    })}
                  </div>
                </Card>
              );
            })()}
          </>
        ) : tab === "society" ? (
          <SocietyChecklistTab locale={locale} assessments={assessments} anchorHwId={anchorHwId} />
        ) : (
          <RiskTab projectId={projectId} canEdit={canEdit} locale={locale} />
        )}

      </motion.div>
    </div>
    </div>
  );
}

// ─── Hardware Accordion ─────────────────────────────────────────────────────

function HwAccordion({ hw, isOpen, onToggle, assessments, canEdit, locale, onSave }: {
  hw: HwItem; isOpen: boolean; onToggle: () => void; assessments: Assessment[];
  canEdit: boolean; locale: string;
  onSave: (hwId: string, checkId: string, field: string, value: string) => Promise<void>;
}) {
  const Icon = HW_ICONS[hw.type] || HardDrive;
  const checkedCount = assessments.filter((a) => a.result !== "NOT_CHECKED").length;
  const passCount = assessments.filter((a) => a.result === "PASS").length;
  const total = E27_SC_CHECKS.length;
  const pct = total > 0 ? Math.round((checkedCount / total) * 100) : 0;

  return (
    <Card padding="none">
      {/* Header */}
      <button onClick={onToggle} className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-surface-secondary/50 transition-colors">
        <div className="h-10 w-10 rounded-lg bg-brand-lighter flex items-center justify-center shrink-0">
          <Icon size={18} className="text-brand" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-text">{hw.name}</p>
          <p className="text-[11px] text-text-tertiary mt-0.5">
            {locale === "ko" ? `${checkedCount}/${total} 평가 완료` : locale === "ja" ? `${checkedCount}/${total} 評価完了` : `${checkedCount}/${total} assessed`} · {passCount} {tx(locale, "pass", "통과", "適合")}
          </p>
        </div>
        {/* Mini progress ring */}
        <div className="relative h-10 w-10 shrink-0">
          <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="14" fill="none" stroke="#E0E0E0" strokeWidth="3" />
            <circle cx="18" cy="18" r="14" fill="none" stroke={pct === 100 ? "#24A148" : "#0F62FE"} strokeWidth="3"
              strokeDasharray={`${pct * 0.88} 88`} strokeLinecap="round" className="transition-all duration-500" />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-text-secondary">
            {pct}%
          </span>
        </div>
        <ChevronDown size={16} className={cn("text-text-tertiary transition-transform duration-200 shrink-0", isOpen && "rotate-180")} />
      </button>

      {/* Content */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border divide-y divide-border">
              {E27_SC_CHECKS.map((check) => (
                <ScCheckRow
                  key={check.id}
                  check={check}
                  assessment={assessments.find((a) => a.checkId === check.id)}
                  hwId={hw.id}
                  canEdit={canEdit}
                  locale={locale}
                  onSave={onSave}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

// ─── SC Check Row ───────────────────────────────────────────────────────────

function ScCheckRow({ check, assessment, consolidatedResult, hwId, canEdit, locale, onSave, hwCount, scAssessments }: {
  check: SCCheck; assessment?: Assessment; hwId: string; canEdit: boolean; locale: string;
  onSave: (hwId: string, checkId: string, field: string, value: string) => Promise<void>;
  consolidatedResult?: Result;
  hwCount?: number;
  scAssessments?: Assessment[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [evidence, setEvidence] = useState(assessment?.evidence || "");
  const [note, setNote] = useState(assessment?.note || "");
  // 버튼 활성 상태: 해당 HW의 개별 결과
  const currentResult = (assessment?.result || "NOT_CHECKED") as Result;
  // 왼쪽 종합 아이콘: CBS 전체 종합 판정
  const displayResult = consolidatedResult || currentResult;
  const resultConfig = RESULTS.find((r) => r.key === displayResult) || RESULTS[4];
  // 장치별 통계
  const passHw = scAssessments?.filter((a) => a.result === "PASS").length ?? 0;
  const failHw = scAssessments?.filter((a) => a.result === "FAIL").length ?? 0;
  const partialHw = scAssessments?.filter((a) => a.result === "PARTIAL").length ?? 0;
  const checkedHw = scAssessments?.length ?? 0;
  const totalHw = hwCount ?? 0;
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounced save for text fields
  const debounceSave = (field: string, value: string) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => onSave(hwId, check.id, field, value), 800);
  };

  return (
    <div className="px-5 py-4">
      <div className="flex items-start gap-4">
        {/* Result indicator (CBS 종합) */}
        <div className="flex flex-col items-center shrink-0 mt-0.5 gap-0.5">
          <div className="h-8 w-8 rounded-full flex items-center justify-center" style={{ background: resultConfig.bg }}>
            <resultConfig.icon size={14} style={{ color: resultConfig.color }} />
          </div>
          <span className="text-[8px] font-bold" style={{ color: resultConfig.color }}>
            {locale === "ko" ? (RESULTS.find((r) => r.key === displayResult)?.labelKo || "") : (RESULTS.find((r) => r.key === displayResult)?.labelEn || "")}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          {/* Title */}
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[10px] font-bold text-brand bg-brand-lighter px-1.5 py-0.5 rounded">
              {check.id}
            </span>
            <p className="text-[13px] font-semibold text-text">
              {tx(locale, check.title, check.titleKo)}
            </p>
          </div>
          <p className="text-[12px] text-text-tertiary mb-2">
            {tx(locale, check.description, check.descriptionKo)}
          </p>

          {/* 장치별 종합 통계 (오딧 결과 있는 장치만) */}
          {checkedHw > 0 && (
            <div className="flex items-center gap-2 mb-3 text-[10px]">
              <span className="text-text-tertiary font-medium">{tx(locale, `${checkedHw} devices:`, `${checkedHw}개 장치:`, `${checkedHw}台:`)}</span>
              {passHw > 0 && <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-bold">{tx(locale, `${passHw} pass`, `${passHw} 통과`, `${passHw} 適合`)}</span>}
              {partialHw > 0 && <span className="px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 font-bold">{tx(locale, `${partialHw} partial`, `${partialHw} 부분`, `${partialHw} 一部`)}</span>}
              {failHw > 0 && <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-bold">{tx(locale, `${failHw} fail`, `${failHw} 실패`, `${failHw} 不適合`)}</span>}
            </div>
          )}

          {/* Result buttons */}
          {canEdit ? (
            <div className="flex gap-1.5 mb-3 flex-wrap">
              {RESULTS.map((r) => {
                const isActive = currentResult === r.key;
                return (
                  <button
                    key={r.key}
                    onClick={() => onSave(hwId, check.id, "result", r.key)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all duration-150 border",
                      isActive
                        ? "border-transparent text-white shadow-sm"
                        : "border-border text-text-tertiary bg-white hover:border-border-strong",
                    )}
                    style={isActive ? { background: r.color } : undefined}
                  >
                    <r.icon size={12} />
                    {locale === "ko" ? r.labelKo : locale === "ja" ? (r.labelJa || r.labelEn) : r.labelEn}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mb-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white" style={{ background: resultConfig.color }}>
                <resultConfig.icon size={12} /> {locale === "ko" ? resultConfig.labelKo : locale === "ja" ? (resultConfig.labelJa || resultConfig.labelEn) : resultConfig.labelEn}
              </span>
            </div>
          )}

          {/* Expandable details */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-brand hover:text-brand-hover transition-colors mb-2 px-2 py-1 rounded-md hover:bg-brand-lighter/50"
          >
            <ChevronDown size={12} className={cn("transition-transform duration-200", expanded && "rotate-180")} />
            {expanded ? (tx(locale, "Collapse", "접기", "折りたたむ")) : (tx(locale, "Show Details", "상세 보기", "詳細表示"))}
          </button>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                {/* Checklist items */}
                <div className="mb-3 space-y-1.5">
                  {((locale === "ko" ? check.passItemsKo : check.passItems) as string[]).map((item: string, i: number) => (
                    <label key={i} className="flex items-start gap-2 text-[12px] text-text-secondary cursor-default">
                      <input type="checkbox" className="mt-0.5 accent-brand rounded" disabled={!canEdit} />
                      <span>{item}</span>
                    </label>
                  ))}
                </div>

                {/* Evidence + Note */}
                {canEdit ? (
                  <div className="space-y-2">
                    <div>
                      <label className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">{tx(locale, "Evidence", "증거", "証拠")}</label>
                      <textarea
                        value={evidence}
                        onChange={(e) => { setEvidence(e.target.value); debounceSave("evidence", e.target.value); }}
                        placeholder={tx(locale, "Describe the evidence...", "증거 설명을 입력하세요...", "証拠の説明を入力してください...")}
                        rows={2}
                        className="mt-1 w-full rounded-[8px] border border-border px-3 py-2 text-[13px] text-text placeholder:text-border-strong resize-none focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">{tx(locale, "Note", "메모", "メモ")}</label>
                      <textarea
                        value={note}
                        onChange={(e) => { setNote(e.target.value); debounceSave("note", e.target.value); }}
                        placeholder={tx(locale, "Additional notes...", "추가 메모...", "追加メモ...")}
                        rows={2}
                        className="mt-1 w-full rounded-[8px] border border-border px-3 py-2 text-[13px] text-text placeholder:text-border-strong resize-none focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 text-[12px]">
                    {assessment?.evidence && (
                      <div><span className="font-semibold text-text-tertiary">{tx(locale, "Evidence:", "증거:", "証拠:")}</span> <span className="text-text-secondary">{assessment.evidence}</span></div>
                    )}
                    {assessment?.note && (
                      <div><span className="font-semibold text-text-tertiary">{tx(locale, "Note:", "메모:", "メモ:")}</span> <span className="text-text-secondary">{assessment.note}</span></div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ─── Change History Tab ─────────────────────────────────────────────────────

interface ChangeEvent {
  id: string;
  entityType: string;
  entityId: string;
  changeType: string;
  severity: string;
  reauditRequired: boolean;
  changedBy: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
}

function ChangeHistoryTab({ projectId, locale }: { projectId: string; locale: string }) {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role;
  // Write (resolve change events): only SUPPORT or ADMIN — viewer cannot
  const canResolve = userRole === "SUPPORT" || userRole === "ADMIN";

  const [changes, setChanges] = useState<ChangeEvent[]>([]);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"unresolved" | "resolved" | "all">("unresolved");
  const [resolveDialog, setResolveDialog] = useState<ChangeEvent | null>(null);
  const [resolveNote, setResolveNote] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchChanges = useCallback(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/changes?filter=${filter}&limit=100`)
      .then(async (r) => {
        if (r.ok) {
          const d = await r.json();
          setChanges(Array.isArray(d.changes) ? d.changes : []);
          setUnresolvedCount(d.unresolvedCount || 0);
        }
      })
      .finally(() => setLoading(false));
  }, [projectId, filter]);

  useEffect(() => { fetchChanges(); }, [fetchChanges]);

  const handleResolve = async () => {
    if (!resolveDialog) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/changes?id=${resolveDialog.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", resolutionNote: resolveNote }),
      });
      if (res.ok) {
        showToast.success(tx(locale, "Marked as resolved", "해결 처리되었습니다", "解決済みにしました"));
        setResolveDialog(null);
        setResolveNote("");
        fetchChanges();
      } else {
        showToast.error(tx(locale, "Failed", "처리 실패", "失敗"));
      }
    } finally { setSaving(false); }
  };

  const handleReopen = async (c: ChangeEvent) => {
    const res = await fetch(`/api/projects/${projectId}/changes?id=${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reopen" }),
    });
    if (res.ok) {
      showToast.success(tx(locale, "Reopened", "재개됨", "再開"));
      fetchChanges();
    }
  };

  const sevColors: Record<string, string> = {
    LOW: "bg-surface-secondary text-text-tertiary", MEDIUM: "bg-amber-50 text-amber-600",
    HIGH: "bg-orange-50 text-safety-elevated", CRITICAL: "bg-risk-bg text-safety-high",
  };
  const typeLabels: Record<string, string> = { CREATE: tx(locale, "Create", "생성", "作成"), UPDATE: tx(locale, "Update", "수정", "更新"), DELETE: tx(locale, "Delete", "삭제", "削除") };
  const entityLabels: Record<string, string> = { HARDWARE: "HW", SOFTWARE: "SW", ASSESSMENT: tx(locale, "Assess", "평가", "評価"), DFD: "DFD", DOCUMENT: tx(locale, "Doc", "문서", "文書") };

  const filterLabel = (f: typeof filter) => {
    if (f === "unresolved") return tx(locale, `Unresolved (${unresolvedCount})`, `미해결 (${unresolvedCount})`, `未解決 (${unresolvedCount})`);
    if (f === "resolved") return tx(locale, "Resolved", "해결됨", "解決済み");
    return tx(locale, "All", "전체", "全て");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-body-sm font-bold text-text">{tx(locale, "Change History", "변경 이력", "変更履歴")}</h2>
        <div className="flex gap-1 p-1 bg-surface-secondary rounded-[8px]">
          {(["unresolved", "resolved", "all"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn("px-3 py-1 rounded-[6px] text-[11px] font-medium transition-all",
                filter === f ? "bg-white text-text shadow-xs" : "text-text-tertiary hover:text-text-secondary")}>
              {filterLabel(f)}
            </button>
          ))}
        </div>
      </div>

      {loading ? <SkeletonTable rows={5} /> : changes.length === 0 ? (
        <EmptyState icon={History} title={
          filter === "unresolved"
            ? tx(locale, "No unresolved changes", "미해결 변경이 없습니다", "未解決の変更がありません")
            : tx(locale, "No changes", "변경 이력이 없습니다", "変更履歴がありません")
        } />
      ) : (
        <Card padding="none">
          <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
            {changes.map((c) => (
              <div key={c.id} className={cn("flex items-start gap-3 px-5 py-3.5 hover:bg-surface-secondary/30 transition-colors", c.resolvedAt && "opacity-60")}>
                <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 mt-0.5", sevColors[c.severity] || sevColors.LOW)}>{c.severity}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-[12px] flex-wrap">
                    <span className="font-semibold text-text">{entityLabels[c.entityType] || c.entityType}</span>
                    <span className="text-text-tertiary">·</span>
                    <span className="text-text-secondary">{typeLabels[c.changeType] || c.changeType}</span>
                    {c.reauditRequired && !c.resolvedAt && <span className="px-1.5 py-0.5 rounded-full bg-risk-bg text-safety-high text-[9px] font-bold">{tx(locale, "Re-audit", "재감사 필요", "再監査必要")}</span>}
                    {c.resolvedAt && <span className="px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 text-[9px] font-bold">✓ {tx(locale, "Resolved", "해결됨", "解決済み")}</span>}
                  </div>
                  <p className="text-[11px] text-text-tertiary mt-0.5">
                    {new Date(c.createdAt).toLocaleString(tx(locale, "en-US", "ko-KR", "ja-JP"))}
                    {c.resolvedAt && ` → ${tx(locale, "resolved", "해결", "解決")} ${new Date(c.resolvedAt).toLocaleDateString(tx(locale, "en-US", "ko-KR", "ja-JP"))} ${tx(locale, "by", "by", "by")} ${c.resolvedBy}`}
                  </p>
                  {c.resolutionNote && <p className="text-[11px] text-text-secondary mt-1 italic">&ldquo;{c.resolutionNote}&rdquo;</p>}
                </div>
                {canResolve && (
                  c.resolvedAt ? (
                    <button onClick={() => handleReopen(c)}
                      className="px-2 py-1 rounded-md text-[10px] font-semibold text-text-tertiary hover:text-brand hover:bg-brand-lighter transition-colors shrink-0">
                      {tx(locale, "Reopen", "재개", "再開")}
                    </button>
                  ) : (
                    <button onClick={() => { setResolveDialog(c); setResolveNote(""); }}
                      className="px-2.5 py-1 rounded-md text-[10px] font-bold text-green-700 bg-green-50 hover:bg-green-100 transition-colors shrink-0">
                      ✓ {tx(locale, "Resolve", "해결됨", "解決")}
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Resolve dialog */}
      <Dialog open={!!resolveDialog} onClose={() => setResolveDialog(null)}
        title={tx(locale, "Mark as Resolved", "해결 처리", "解決済みにする")}>
        <div className="space-y-3">
          <p className="text-[12px] text-text-secondary">
            {tx(locale, "Add a resolution note (optional) to record what action was taken:",
              "조치 완료 메모를 남겨주세요 (선택사항):",
              "対応完了メモを残してください（任意）:")}
          </p>
          <Textarea
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
            placeholder={tx(locale, "e.g., Re-audit completed on 2025-04-20, PASS verified",
              "예: 2025-04-20 재감사 완료, PASS 처리",
              "例: 2025-04-20 再監査完了、PASS確認")}
            rows={3}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setResolveDialog(null)}>{tx(locale, "Cancel", "취소", "キャンセル")}</Button>
            <Button onClick={handleResolve} loading={saving} className="bg-green-600 hover:bg-green-700">
              ✓ {tx(locale, "Mark Resolved", "해결 처리", "解決済みにする")}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

// ─── Risk Assessment Tab ────────────────────────────────────────────────────

interface RiskEntry {
  id: string; cveId?: string | null; threatId: string; assetRef: string | null;
  likelihood: number; impact: number; riskLevel: number;
  mitigation: string | null; status: string; createdAt: string;
}

const RISK_COLORS: Record<string, { bg: string; text: string }> = {
  CRITICAL: { bg: "#DA1E28", text: "#FFF" },
  HIGH:     { bg: "#EB6200", text: "#FFF" },
  MEDIUM:   { bg: "#F1C21B", text: "#0C0C0D" },
  LOW:      { bg: "#24A148", text: "#FFF" },
  NEGLIGIBLE: { bg: "#E0E0E0", text: "#8D8D8D" },
};

function getRiskLabel(score: number): string {
  if (score >= 20) return "CRITICAL";
  if (score >= 12) return "HIGH";
  if (score >= 6)  return "MEDIUM";
  if (score >= 2)  return "LOW";
  return "NEGLIGIBLE";
}

function RiskTab({ projectId, canEdit, locale }: { projectId: string; canEdit: boolean; locale: string }) {
  const [risks, setRisks] = useState<RiskEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ threatId: "", threatCategory: "", scenario: "", assetRef: "", likelihood: "3", impact: "3", mitigation: "", status: "OPEN", treatment: "Mitigate" });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RiskEntry | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const updateRisk = async (riskId: string, field: string, value: number | string) => {
    setUpdatingId(riskId);
    try {
      const res = await fetch(`/api/projects/${projectId}/risks/${riskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        const updated = await res.json();
        setRisks(prev => prev.map(r => r.id === riskId ? updated : r));
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const fetchRisks = useCallback(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/risks`)
      .then(async (r) => { if (r.ok) { const d = await r.json(); setRisks(Array.isArray(d) ? d : []); } })
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { fetchRisks(); }, [fetchRisks]);

  async function handleCreate() {
    if (!form.threatId.trim()) { showToast.error(tx(locale, "Threat ID required", "위협 ID를 입력하세요", "脅威IDを入力してください")); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/risks`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threatId: form.threatId.trim(), threatCategory: form.threatCategory || undefined, scenario: form.scenario || undefined, assetRef: form.assetRef.trim() || undefined, likelihood: parseInt(form.likelihood), impact: parseInt(form.impact), mitigation: form.mitigation.trim() || undefined, status: form.status, treatment: form.treatment }),
      });
      if (res.ok) { showToast.success(tx(locale, "Risk added", "리스크 추가됨", "リスク追加済み")); setAddOpen(false); setForm({ threatId: "", threatCategory: "", scenario: "", assetRef: "", likelihood: "3", impact: "3", mitigation: "", status: "OPEN", treatment: "Mitigate" }); fetchRisks(); }
      else { const d = await res.json(); showToast.error(d.error || "Failed"); }
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/projects/${projectId}/risks/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) { showToast.success(tx(locale, "Deleted", "삭제됨", "削除済み")); setDeleteTarget(null); fetchRisks(); }
  }

  // Build 5x5 matrix counts
  const matrix: number[][] = Array.from({ length: 5 }, () => Array(5).fill(0));
  risks.forEach((r) => { if (r.likelihood >= 1 && r.likelihood <= 5 && r.impact >= 1 && r.impact <= 5) matrix[5 - r.likelihood][r.impact - 1]++; });

  const statusLabels: Record<string, { ko: string; en: string; ja?: string; color: string }> = {
    OPEN: { ko: "미조치", en: "Open", ja: "未対応", color: "#DA1E28" },
    MITIGATED: { ko: "완화", en: "Mitigated", ja: "緩和", color: "#24A148" },
    ACCEPTED: { ko: "수용", en: "Accepted", ja: "受容", color: "#0F62FE" },
    TRANSFERRED: { ko: "이전", en: "Transferred", ja: "移転", color: "#8D8D8D" },
  };

  const summaryByCriticality = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  risks.forEach((r) => { const lbl = getRiskLabel(r.riskLevel); if (lbl in summaryByCriticality) summaryByCriticality[lbl as keyof typeof summaryByCriticality]++; });

  if (loading) return <SkeletonTable rows={5} />;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="flex gap-3 flex-wrap">
        {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((level) => {
          const rc = RISK_COLORS[level];
          return (
            <div key={level} className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{ background: rc.bg + "18" }}>
              <div className="h-3 w-3 rounded-full" style={{ background: rc.bg }} />
              <span className="text-[12px] font-bold" style={{ color: rc.bg }}>{level}</span>
              <span className="text-[14px] font-extrabold" style={{ color: rc.bg }}>{summaryByCriticality[level]}</span>
            </div>
          );
        })}
        {canEdit && (
          <Button size="sm" onClick={() => setAddOpen(true)} className="ml-auto">
            <Plus size={14} /> {tx(locale, "Add Risk", "리스크 추가", "リスク追加")}
          </Button>
        )}
      </div>

      {/* 5x5 Matrix */}
      <Card padding="none">
        <CardBody>
          <h3 className="text-[13px] font-bold text-text mb-4">{tx(locale, "Risk Matrix (5×5)", "리스크 매트릭스 (5×5)", "リスクマトリクス（5×5）")}</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[400px]">
              <thead>
                <tr>
                  <th className="w-20 p-2 text-[10px] text-text-tertiary" />
                  {[1, 2, 3, 4, 5].map((i) => (
                    <th key={i} className="p-2 text-[10px] font-bold text-center text-text-tertiary">{i}</th>
                  ))}
                </tr>
                <tr>
                  <th className="p-1" />
                  <th colSpan={5} className="text-[10px] text-center text-text-tertiary pb-2">{tx(locale, "Impact →", "영향도 →", "影響度 →")}</th>
                </tr>
              </thead>
              <tbody>
                {[5, 4, 3, 2, 1].map((likelihood, row) => (
                  <tr key={likelihood}>
                    <td className="p-2 text-[10px] font-bold text-right text-text-tertiary whitespace-nowrap">
                      {row === 2 && <span className="block text-[9px] mb-1">{tx(locale, "Likelihood ↑", "가능성 ↑", "可能性 ↑")}</span>}
                      {likelihood}
                    </td>
                    {[1, 2, 3, 4, 5].map((impact) => {
                      const score = likelihood * impact;
                      const label = getRiskLabel(score);
                      const rc = RISK_COLORS[label];
                      const count = matrix[5 - likelihood][impact - 1];
                      return (
                        <td key={impact} className="p-1">
                          <div className="h-12 rounded-md flex flex-col items-center justify-center text-[10px] font-bold transition-all" style={{ background: rc.bg + "30", color: rc.bg }}>
                            <span>{score}</span>
                            {count > 0 && <span className="text-[9px] mt-0.5 px-1.5 py-0.5 rounded-full text-white" style={{ background: rc.bg }}>{count}</span>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* Risk list */}
      {risks.length === 0 ? (
        <EmptyState icon={BarChart3} title={tx(locale, "No risks registered", "등록된 리스크가 없습니다", "登録されたリスクがありません")} subtitle={tx(locale, "Add risks to start assessment", "리스크를 추가하여 평가를 시작하세요", "リスクを追加して評価を開始してください")} />
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-surface-secondary/40">
                  <th className="text-left px-4 py-2.5 font-bold text-text-tertiary w-16">{tx(locale, "ID", "ID", "ID")}</th>
                  <th className="text-left px-4 py-2.5 font-bold text-text-tertiary">{tx(locale, "Threat / Asset", "위협 / 자산", "脅威/資産")}</th>
                  <th className="text-center px-3 py-2.5 font-bold text-text-tertiary w-28">{tx(locale, "Likelihood", "가능성", "可能性")}</th>
                  <th className="text-center px-3 py-2.5 font-bold text-text-tertiary w-28">{tx(locale, "Impact", "영향도", "影響度")}</th>
                  <th className="text-center px-3 py-2.5 font-bold text-text-tertiary w-16">{tx(locale, "Score", "점수", "スコア")}</th>
                  <th className="text-center px-3 py-2.5 font-bold text-text-tertiary w-24">{tx(locale, "Status", "상태", "状態")}</th>
                  {canEdit && <th className="w-10" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {risks.map((r) => {
                  const label = getRiskLabel(r.riskLevel);
                  const rc = RISK_COLORS[label];
                  const st = statusLabels[r.status] || statusLabels.OPEN;
                  const isUpdating = updatingId === r.id;
                  return (
                    <tr key={r.id} className={cn("hover:bg-surface-secondary/30 transition-colors", isUpdating && "opacity-60")}>
                      {/* Threat ID */}
                      <td className="px-4 py-3 align-top">
                        <span className="text-[12px] font-bold text-text">{r.threatId}</span>
                        {r.cveId && (
                          <a href={`https://nvd.nist.gov/vuln/detail/${r.cveId}`} target="_blank" rel="noopener noreferrer" className="block text-[9px] font-mono text-brand hover:underline mt-0.5">{r.cveId}</a>
                        )}
                      </td>
                      {/* Asset */}
                      <td className="px-4 py-3 align-top">
                        <p className="text-[12px] text-text-secondary">{r.assetRef || "—"}</p>
                        {r.mitigation && <p className="text-[10px] text-text-tertiary mt-0.5 line-clamp-1">{r.mitigation}</p>}
                      </td>
                      {/* Likelihood dropdown */}
                      <td className="px-3 py-3 text-center align-top">
                        {canEdit ? (
                          <select value={r.likelihood} onChange={(e) => updateRisk(r.id, "likelihood", parseInt(e.target.value))} className="rounded border border-border bg-white px-2 py-1 text-[12px] font-bold text-text text-center w-full focus:outline-none focus:border-brand">
                            {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        ) : <span className="font-bold">{r.likelihood}</span>}
                      </td>
                      {/* Impact dropdown */}
                      <td className="px-3 py-3 text-center align-top">
                        {canEdit ? (
                          <select value={r.impact} onChange={(e) => updateRisk(r.id, "impact", parseInt(e.target.value))} className="rounded border border-border bg-white px-2 py-1 text-[12px] font-bold text-text text-center w-full focus:outline-none focus:border-brand">
                            {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        ) : <span className="font-bold">{r.impact}</span>}
                      </td>
                      {/* Risk Score */}
                      <td className="px-3 py-3 text-center align-top">
                        <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-[10px] font-bold text-white" style={{ background: rc.bg }}>{r.riskLevel}</span>
                      </td>
                      {/* Status dropdown */}
                      <td className="px-3 py-3 text-center align-top">
                        {canEdit ? (
                          <select value={r.status} onChange={(e) => updateRisk(r.id, "status", e.target.value)} className="rounded border border-border bg-white px-2 py-1 text-[11px] font-bold text-center w-full focus:outline-none focus:border-brand" style={{ color: st.color }}>
                            {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{locale === "ko" ? v.ko : locale === "ja" ? (v.ja || v.en) : v.en}</option>)}
                          </select>
                        ) : <span className="text-[11px] font-bold" style={{ color: st.color }}>{locale === "ko" ? st.ko : st.en}</span>}
                      </td>
                      {/* Delete */}
                      {canEdit && (
                        <td className="px-2 py-3 align-top">
                          <button onClick={() => setDeleteTarget(r)} className="h-6 w-6 rounded flex items-center justify-center text-text-tertiary hover:text-safety-high hover:bg-risk-bg transition-colors">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Add Risk Dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title={tx(locale, "Add Security Risk", "보안 위험 평가 추가", "セキュリティリスク追加")} description={tx(locale, "IEC 62443 risk assessment with IACS Rec 171 impact scale", "IEC 62443 기반 위험 평가 (IACS Rec 171 영향도 척도)", "IEC 62443リスク評価（IACS Rec 171影響度尺度）")} maxWidth="max-w-2xl">
        <div className="space-y-4">
          {/* Row 1: Threat ID + Category */}
          <div className="grid grid-cols-2 gap-4">
            <Input label={tx(locale, "Threat ID *", "위협 ID *", "脅威ID *")} placeholder="T-001" value={form.threatId} onChange={(e) => setForm({ ...form, threatId: e.target.value })} />
            <Select label={tx(locale, "Threat Category *", "위협 분류 *", "脅威分類 *")} value={form.threatCategory} onChange={(e) => setForm({ ...form, threatCategory: e.target.value })} options={[
              { value: "", label: tx(locale, "Select category", "분류 선택", "分類選択") },
              { value: "MALWARE", label: tx(locale, "Malware Infection", "악성코드 감염", "マルウェア感染") },
              { value: "UNAUTHORIZED_ACCESS", label: tx(locale, "Unauthorized Access", "비인가 접근", "不正アクセス") },
              { value: "EAVESDROPPING", label: tx(locale, "Communication Eavesdropping", "통신 도청", "通信傍受") },
              { value: "DDOS", label: tx(locale, "DDoS / Service Disruption", "DDoS / 서비스 중단", "DDoS/サービス妨害") },
              { value: "DATA_MANIPULATION", label: tx(locale, "Data Manipulation", "데이터 변조", "データ改ざん") },
              { value: "INSIDER_THREAT", label: tx(locale, "Insider Threat", "내부자 위협", "内部脅威") },
              { value: "SUPPLY_CHAIN", label: tx(locale, "Supply Chain Attack", "공급망 공격", "サプライチェーン攻撃") },
              { value: "PHYSICAL", label: tx(locale, "Physical Tampering", "물리적 변조", "物理的改ざん") },
              { value: "OTHER", label: tx(locale, "Other", "기타", "その他") },
            ]} />
          </div>
          {/* Scenario */}
          <Textarea label={tx(locale, "Threat Scenario", "위협 시나리오", "脅威シナリオ")} placeholder={tx(locale, "Describe the specific threat scenario...", "구체적인 위협 발생 시나리오를 서술하세요...", "具体的な脅威シナリオを記述してください...")} rows={2} value={form.scenario} onChange={(e) => setForm({ ...form, scenario: e.target.value })} />
          {/* Asset Reference */}
          <Input label={tx(locale, "Asset / Zone Reference", "대상 자산/구역", "対象資産/ゾーン")} placeholder={tx(locale, "e.g. ECDIS, Bridge Zone", "예: ECDIS, 브릿지 구역", "例: ECDIS, ブリッジゾーン")} value={form.assetRef} onChange={(e) => setForm({ ...form, assetRef: e.target.value })} />
          {/* Likelihood + Impact */}
          <div className="grid grid-cols-2 gap-4">
            <Select label={tx(locale, "Likelihood (1-5) *", "발생 가능성 (1~5) *", "発生可能性 (1〜5) *")} value={form.likelihood} onChange={(e) => setForm({ ...form, likelihood: e.target.value })} options={[1,2,3,4,5].map((n) => ({ value: String(n), label: `${n} — ${[
              "", tx(locale, "Rare", "매우 낮음", "まれ"), tx(locale, "Unlikely", "낮음", "低い"),
              tx(locale, "Possible", "보통", "中"), tx(locale, "Likely", "높음", "高い"),
              tx(locale, "Frequent", "매우 높음", "頻繁"),
            ][n]}` }))} />
            <Select label={tx(locale, "Impact (1-5) * [IACS P1-P5]", "영향도 (1~5) * [IACS P1-P5]", "影響度 (1〜5) * [IACS P1-P5]")} value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })} options={[1,2,3,4,5].map((n) => ({ value: String(n), label: `${n} — ${[
              "", tx(locale, "Negligible", "영향 없음", "無視可能"),
              tx(locale, "Minor (service disruption)", "경미 (서비스 일시중단)", "軽微（サービス一時中断）"),
              tx(locale, "Moderate (function loss)", "보통 (기능 손실)", "中程度（機能損失）"),
              tx(locale, "Major (physical damage)", "심각 (물리적 손상)", "重大（物理的損傷）"),
              tx(locale, "Critical (vessel loss)", "치명 (선박 손실)", "致命的（船舶損失）"),
            ][n]}` }))} />
          </div>
          {/* Risk Score */}
          <div className="p-3 rounded-lg bg-surface-secondary text-center">
            <span className="text-[11px] text-text-tertiary">{tx(locale, "Risk Score:", "리스크 점수:", "リスクスコア:")} </span>
            <span className="text-[16px] font-extrabold" style={{ color: RISK_COLORS[getRiskLabel(parseInt(form.likelihood) * parseInt(form.impact))].bg }}>
              {parseInt(form.likelihood) * parseInt(form.impact)} ({getRiskLabel(parseInt(form.likelihood) * parseInt(form.impact))})
            </span>
          </div>
          {/* Treatment Strategy + Status */}
          <div className="grid grid-cols-2 gap-4">
            <Select label={tx(locale, "Treatment Strategy *", "위험 처리 전략 *", "リスク対応戦略 *")} value={form.treatment} onChange={(e) => setForm({ ...form, treatment: e.target.value })} options={[
              { value: "Mitigate", label: tx(locale, "Mitigate (apply controls)", "완화 (보안 조치 적용)", "緩和（管理策適用）") },
              { value: "Accept", label: tx(locale, "Accept (maintain current)", "수용 (현 상태 유지)", "受容（現状維持）") },
              { value: "Transfer", label: tx(locale, "Transfer (insurance etc.)", "전가 (보험 등)", "移転（保険等）") },
              { value: "Avoid", label: tx(locale, "Avoid (eliminate source)", "회피 (원천 차단)", "回避（発生源除去）") },
            ]} />
            <Select label={tx(locale, "Status", "상태", "ステータス")} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} options={Object.entries(statusLabels).map(([k, v]) => ({ value: k, label: locale === "ko" ? v.ko : locale === "ja" ? (v.ja || v.en) : v.en }))} />
          </div>
          {/* Mitigation */}
          <Textarea label={tx(locale, "Mitigation Measures", "구체적 완화 조치", "具体的緩和措置")} placeholder={tx(locale, "Describe specific measures to achieve the treatment strategy...", "위험 처리 전략을 달성하기 위한 구체적 조치를 서술하세요...", "リスク対応戦略を達成するための具体的措置を記述してください...")} rows={3} value={form.mitigation} onChange={(e) => setForm({ ...form, mitigation: e.target.value })} />
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setAddOpen(false)}>{tx(locale, "Cancel", "취소", "キャンセル")}</Button>
            <Button onClick={handleCreate} loading={saving}><Plus size={14} /> {tx(locale, "Add", "추가", "追加")}</Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title={tx(locale, "Delete Risk", "리스크 삭제", "リスク削除")} description={locale === "ko" ? `"${deleteTarget?.threatId}" 리스크를 삭제하시겠습니까?` : locale === "ja" ? `リスク「${deleteTarget?.threatId}」を削除しますか？` : `Delete risk "${deleteTarget?.threatId}"?`} />
    </div>
  );
}

// ─── Society Checklist Tab (with SC mapping) ───────────────────────────────

// Mapping: society checklist key → related SC check IDs
const SC_MAPPING: Record<string, string[]> = {
  access_control:    ["SC-1", "SC-2"],
  patch_management:  ["SC-13"],
  network_segment:   ["SC-5"],
  incident_response: ["SC-9"],
  backup_restore:    ["SC-9"],
  asset_inventory:   ["SC-3"],
  malware_protect:   ["SC-11"],
  physical_security: ["SC-12"],
  audit_logging:     ["SC-7"],
  remote_access:     ["SC-6"],
  // KR
  kr_risk_assessment:  ["SC-3"],
  kr_sw_mgmt:          ["SC-3", "SC-13"],
  kr_access_log:       ["SC-7"],
  kr_crypto:           ["SC-6", "SC-8"],
  kr_type_approval:    [],
  kr_vulnerability:    ["SC-11", "SC-13"],
  // LR
  lr_cyber_mgmt_plan:  [],
  lr_vsat:             ["SC-5", "SC-8"],
  lr_drills:           [],
  lr_sbom:             ["SC-3"],
  lr_shipright:        [],
  // DNV
  dnv_class_notation:    [],
  dnv_ot_baseline:       ["SC-4", "SC-5"],
  dnv_vuln_scan:         ["SC-11"],
  dnv_recovery_time:     ["SC-9"],
  dnv_network_diagram:   ["SC-5"],
  dnv_penetration_test:  [],
  // ABS
  abs_cyber_resilience:  [],
  abs_malware:           ["SC-11"],
  abs_remote_access:     ["SC-6"],
  abs_change_mgmt:       ["SC-3", "SC-13"],
  abs_crew_training:     [],
  // BV
  bv_risk_matrix:        [],
  bv_zone_conduit:       ["SC-5"],
  bv_training:           [],
  bv_supply_chain:       [],
  bv_continuous_monitor: ["SC-7"],
  // CCS
  ccs_classification:    [],
  ccs_audit:             ["SC-7"],
  ccs_supplier:          [],
  ccs_emergency_plan:    ["SC-9"],
  // NK
  nk_cyber_resilience:   [],
  nk_risk_assessment:    [],
  nk_type_approval:      [],
  nk_network_topology:   ["SC-5"],
};

function SocietyChecklistTab({ locale, assessments, anchorHwId }: { locale: string; assessments: Assessment[]; anchorHwId: string | null }) {
  const [selectedCls, setSelectedCls] = useState("KR");

  // Society-specific items only (common items already covered by SC checks)
  const items: SocietyCheckItem[] = SOCIETY_CHECKLIST_EXTRA[selectedCls] || [];

  // Group by category
  const cats = [...new Set(items.map((i) => i.cat))];

  // Get SC result for a checklist item
  function getScStatus(item: SocietyCheckItem): { status: "pass" | "fail" | "partial" | "none"; scIds: string[] } {
    const scIds = SC_MAPPING[item.key] || [];
    if (scIds.length === 0 || !anchorHwId) return { status: "none", scIds };

    const results = scIds.map((scId) => {
      const a = assessments.find((a) => a.hardwareId === anchorHwId && a.checkId === scId);
      return a?.result || "NOT_CHECKED";
    });

    if (results.every((r) => r === "PASS")) return { status: "pass", scIds };
    if (results.some((r) => r === "FAIL")) return { status: "fail", scIds };
    if (results.some((r) => r === "PASS" || r === "PARTIAL")) return { status: "partial", scIds };
    return { status: "none", scIds };
  }

  // Summary
  const total = items.length;
  const passCount = items.filter((i) => getScStatus(i).status === "pass").length;
  const failCount = items.filter((i) => getScStatus(i).status === "fail").length;
  const partialCount = items.filter((i) => getScStatus(i).status === "partial").length;
  const pct = total > 0 ? Math.round((passCount / total) * 100) : 0;

  const statusConfig = {
    pass:    { labelKo: "통과", labelEn: "PASS", labelJa: "合格", color: "#24A148", bg: "#E6F7EF", Icon: CheckCircle },
    fail:    { labelKo: "실패", labelEn: "FAIL", labelJa: "不合格", color: "#DA1E28", bg: "#FFF1F1", Icon: XCircle },
    partial: { labelKo: "부분", labelEn: "PARTIAL", labelJa: "一部合格", color: "#EB6200", bg: "#FFF3E0", Icon: AlertTriangle },
    none:    { labelKo: "미확인", labelEn: "—", labelJa: "未確認", color: "#C6C6C6", bg: "#F4F4F4", Icon: Circle },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-body-sm font-bold text-text">{tx(locale, "Society Checklist", "선급별 체크리스트", "船級別チェックリスト")}</h2>
        <div className="flex items-center gap-3 text-[12px]">
          <span className="font-bold" style={{ color: pct >= 80 ? "#24A148" : pct >= 50 ? "#EB6200" : "#DA1E28" }}>
            {pct}%
          </span>
          <span className="text-text-tertiary">{passCount} {tx(locale, "pass", "통과", "合格")} / {failCount} {tx(locale, "fail", "실패", "不合格")} / {total} {tx(locale, "total", "총", "合計")}</span>
        </div>
      </div>

      {/* Society selector */}
      <div className="flex gap-1.5 flex-wrap">
        {(Object.keys(SOCIETY_DETAILS) as (keyof typeof SOCIETY_DETAILS)[]).map((cls) => (
          <button key={cls} onClick={() => setSelectedCls(cls)}
            className={cn("px-3 py-1.5 rounded-[8px] text-[12px] font-bold transition-all",
              selectedCls === cls ? "bg-brand-hover text-white" : "bg-white border border-border text-text-tertiary hover:border-border-strong"
            )}>{cls}</button>
        ))}
      </div>

      {/* Society info card */}
      {(() => {
        const info = SOCIETY_DETAILS[selectedCls as keyof typeof SOCIETY_DETAILS];
        if (!info) return null;
        return (
          <div className="flex items-center gap-4 px-4 py-3 rounded-lg bg-brand-lighter border border-brand/10">
            <div>
              <p className="text-[13px] font-bold text-text">{tx(locale, info.name, info.nameKo)}</p>
              <p className="text-[11px] text-text-tertiary mt-0.5">{info.notation} · {info.guide}</p>
            </div>
          </div>
        );
      })()}

      {/* SC checks summary for this society */}
      <div className="rounded-lg border border-border p-4">
        <p className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider mb-2">
          {tx(locale, "E27 SC Check Status (Common Requirements)", "E27 SC 체크 현황 (공통 요건)", "E27 SCチェック状況（共通要件）")}
        </p>
        <div className="flex gap-2 flex-wrap">
          {E27_SC_CHECKS.map((sc) => {
            const a = anchorHwId ? assessments.find((a) => a.hardwareId === anchorHwId && a.checkId === sc.id) : undefined;
            const r = a?.result || "NOT_CHECKED";
            const rc = RESULTS.find((x) => x.key === r) || RESULTS[4];
            return (
              <span key={sc.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold" style={{ background: rc.bg, color: rc.color }}>
                <rc.icon size={10} /> {sc.id}
              </span>
            );
          })}
        </div>
      </div>

      {/* Progress bar for society-specific items */}
      {items.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-surface-tertiary overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{
              width: `${pct}%`,
              background: pct >= 80 ? "#24A148" : pct >= 50 ? "#EB6200" : "#DA1E28",
            }} />
          </div>
          <span className="text-[11px] font-bold shrink-0" style={{ color: pct >= 80 ? "#24A148" : pct >= 50 ? "#EB6200" : "#DA1E28" }}>
            {passCount}/{total}
          </span>
        </div>
      )}

      {/* Grouped checklist */}
      {cats.map((cat) => {
        const catItems = items.filter((i) => i.cat === cat);
        return (
          <Card key={cat} padding="none">
            <div className="px-5 py-3 bg-surface-secondary border-b border-border">
              <p className="text-[13px] font-bold text-text-secondary">{locale === "ko" ? (catItems[0]?.catKo || cat) : locale === "ja" ? ((catItems[0] as unknown as Record<string, string>)?.catJa || cat) : cat}</p>
            </div>
            <div className="divide-y divide-border">
              {catItems.map((item) => {
                const sc = getScStatus(item);
                const cfg = statusConfig[sc.status];
                return (
                  <div key={item.key} className="px-5 py-3.5 hover:bg-surface-secondary/30 transition-colors" style={{ background: sc.status !== "none" ? cfg.bg + "40" : undefined }}>
                    <div className="flex items-start gap-3">
                      {/* Status icon */}
                      <div className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: cfg.bg }}>
                        <cfg.Icon size={12} style={{ color: cfg.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-text font-medium">
                          {tx(locale, item.item, item.itemKo)}
                        </p>
                        {/* SC mapping badges */}
                        {sc.scIds.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {sc.scIds.map((scId) => {
                              const a = anchorHwId ? assessments.find((a) => a.hardwareId === anchorHwId && a.checkId === scId) : undefined;
                              const r = a?.result || "NOT_CHECKED";
                              const rc = RESULTS.find((x) => x.key === r) || RESULTS[4];
                              return (
                                <span key={scId} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: rc.bg, color: rc.color }}>
                                  <rc.icon size={9} /> {scId} {locale === "ko" ? rc.labelKo : locale === "ja" ? (rc.labelJa || rc.labelEn) : rc.labelEn}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      {/* Overall status label */}
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: cfg.bg, color: cfg.color }}>
                        {locale === "ko" ? cfg.labelKo : locale === "ja" ? (cfg.labelJa || cfg.labelEn) : cfg.labelEn}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
