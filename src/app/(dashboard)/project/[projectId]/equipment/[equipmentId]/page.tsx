"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Package, Shield, FileText, Send, ArrowRight, ArrowLeft,
  Cpu, AlertCircle, CheckCircle, Network,
  Save, ChevronDown,
  Zap, LayoutTemplate, Copy, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SkeletonCards, SkeletonTable } from "@/components/ui/skeleton";
import { CertDocuments } from "@/components/equipment/cert-documents";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CertInfo {
  reviewComment?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  auditPin?: string;
}

interface EquipmentDetail {
  id: string;
  name: string;
  description: string | null;
  status: string;
  certificationInfo?: CertInfo | string | null;
  _count: { hardware: number; software: number };
  dfdDiagram: { id: string } | null;
  vendor?: { id: string; name: string; company: string | null };
  project?: { id: string; vesselName: string; classification: string | null };
  // CBS fields
  securityCategory?: number | null;
  manufacturerName?: string | null;
  productModelName?: string | null;
  isTypeApproved?: boolean;
}

interface Template {
  id: string;
  name: string;
  data: { hardware?: unknown[]; software?: unknown[]; dfd?: unknown };
  createdAt: string;
}

function parseCertInfo(raw: CertInfo | string | null | undefined): CertInfo | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as CertInfo; } catch { return null; }
  }
  return raw;
}

const WORKFLOW_PHASES = [
  { icon: Package, labelEn: "Inventory", labelKo: "자산 등록", labelJa: "資産登録", descEn: "Register hardware & software", descKo: "HW/SW 목록 입력", descJa: "HW/SWの登録", segment: "inventory", color: "#0F62FE" },
  { icon: Network, labelEn: "DFD", labelKo: "DFD 생성", labelJa: "DFD生成", descEn: "Create data flow diagram", descKo: "데이터 흐름도 생성", descJa: "データフロー図の作成", segment: "inventory?tab=dfd", color: "#24A148" },
  { icon: Shield, labelEn: "Assessment", labelKo: "보안 평가", labelJa: "セキュリティ評価", descEn: "SC-1 to SC-13 checks", descKo: "SC-1~SC-13 체크", descJa: "SC-1〜SC-13チェック", segment: "assess", color: "#EB6200" },
  { icon: FileText, labelEn: "Documents", labelKo: "문서 생성", labelJa: "文書生成", descEn: "Generate certification docs", descKo: "인증 문서 생성", descJa: "認証文書の生成", segment: "document", color: "#DA1E28" },
  { icon: Send, labelEn: "Submit", labelKo: "제출", labelJa: "提出", descEn: "Submit to shipyard", descKo: "조선소에 제출", descJa: "造船所に提出", segment: "submit", color: "#8A3FFC" },
];

// ─── Page ───────────────────────────────────────────────────────────────────

export default function EquipmentDetailPage() {
  const { projectId, equipmentId } = useParams<{ projectId: string; equipmentId: string }>();
  const { data: session, status: sessionStatus } = useSession();
  const { locale } = useLocaleStore();
  const router = useRouter();
  const userRole = (session?.user as { role?: string })?.role || "VENDOR";

  // SHIPYARD → redirect to vessel detail (조선소는 호선 상세에서 검토)
  useEffect(() => {
    if (sessionStatus === "authenticated" && (userRole === "SHIPYARD")) {
      router.replace(`/project/${projectId}`);
    }
  }, [sessionStatus, userRole, projectId, router]);

  const [eq, setEq] = useState<EquipmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);

  // Template state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tplLoading, setTplLoading] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplSaving, setTplSaving] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  // Fetch equipment
  useEffect(() => {
    setErrorMsg(null);
    fetch(`/api/projects/${projectId}/equipment`)
      .then(async (res) => {
        if (res.ok) {
          const list = await res.json();
          const found = list.find((e: EquipmentDetail) => e.id === equipmentId);
          if (found) {
            setEq(found);
          } else {
            setErrorMsg(tx(locale, "Equipment not found or access denied", "기자재를 찾을 수 없거나 접근 권한이 없습니다", "機器が見つからないか、アクセス権限がありません"));
          }
        } else {
          if (res.status === 403) {
            setErrorMsg(tx(locale, "Access Denied", "접근 권한이 없습니다", "アクセス権限がありません"));
          } else {
            setErrorMsg(tx(locale, "Failed to load equipment", "기자재 정보를 불러오는데 실패했습니다", "機器情報の読み込みに失敗しました"));
          }
        }
      })
      .catch(() => {
        setErrorMsg(tx(locale, "Network error", "네트워크 오류가 발생했습니다", "ネットワークエラーが発生しました"));
      })
      .finally(() => setLoading(false));
  }, [projectId, equipmentId, locale]);

  // Fetch templates when section opens
  const fetchTemplates = useCallback(() => {
    setTplLoading(true);
    fetch("/api/vendor/templates")
      .then(async (r) => { if (r.ok) { const d = await r.json(); setTemplates((Array.isArray(d) ? d : []).map((t: Template & { data: unknown }) => ({ ...t, data: typeof t.data === "string" ? JSON.parse(t.data) : t.data }))); } })
      .finally(() => setTplLoading(false));
  }, []);
  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  // Template handlers
  async function handleSaveTemplate() {
    if (!tplName.trim()) { showToast.error(tx(locale, "Enter template name", "템플릿 이름을 입력하세요", "テンプレート名を入力してください")); return; }
    setTplSaving(true);
    try {
      const res = await fetch("/api/vendor/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tplName.trim(), equipmentId, projectId }),
      });
      if (res.ok) {
        showToast.success(tx(locale, "Template saved", "템플릿이 저장되었습니다", "テンプレートが保存されました"));
        setSaveDialogOpen(false);
        setTplName("");
        fetchTemplates();
      } else {
        const d = await res.json();
        showToast.error(d.error || (tx(locale, "Save failed", "저장 실패", "保存失敗")));
      }
    } finally { setTplSaving(false); }
  }

  async function handleApplyTemplate(templateId: string) {
    if (eq && ["SUBMITTED", "APPROVED"].includes(eq.status)) {
      showToast.error(tx(locale, "Cannot modify submitted/approved equipment", "제출/승인된 기자재는 수정할 수 없습니다", "提出/承認済みの機器は変更できません"));
      return;
    }
    setApplyingId(templateId);
    try {
      const res = await fetch("/api/vendor/templates/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, equipmentId }),
      });
      if (res.ok) {
        const d = await res.json();
        showToast.success(locale === "ko" ? `적용 완료: HW ${d.created?.hardware ?? 0}, SW ${d.created?.software ?? 0}` : locale === "ja" ? `適用完了: HW ${d.created?.hardware ?? 0}, SW ${d.created?.software ?? 0}` : `Applied: HW ${d.created?.hardware ?? 0}, SW ${d.created?.software ?? 0}`);
        // Refresh equipment to update counts
        const eqRes = await fetch(`/api/projects/${projectId}/equipment`);
        if (eqRes.ok) {
          const list = await eqRes.json();
          const found = list.find((e: EquipmentDetail) => e.id === equipmentId);
          if (found) setEq(found);
        }
      } else {
        const d = await res.json();
        const msg = d.error === "Cannot modify submitted/approved equipment"
          ? (tx(locale, "Cannot modify submitted/approved equipment", "제출/승인된 기자재는 수정할 수 없습니다", "提出/承認済みの機器は変更できません"))
          : (d.error || (tx(locale, "Apply failed", "적용 실패", "適用失敗")));
        showToast.error(msg);
      }
    } finally { setApplyingId(null); }
  }

  async function handleDeleteTemplate() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/vendor/templates?id=${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      showToast.success(tx(locale, "Deleted", "삭제되었습니다", "削除されました"));
      setDeleteTarget(null);
      fetchTemplates();
    }
  }

  function handleSubmit() {
    if (!eq) return;

    // Readiness check
    const hwOk = eq._count.hardware > 0;
    const swOk = eq._count.software > 0;
    const dfdOk = !!eq.dfdDiagram;
    if (!hwOk || !swOk || !dfdOk) {
      const missing: string[] = [];
      if (!hwOk) missing.push(tx(locale, "Hardware", "하드웨어", "ハードウェア"));
      if (!swOk) missing.push(tx(locale, "Software", "소프트웨어", "ソフトウェア"));
      if (!dfdOk) missing.push("DFD");
      showToast.error(locale === "ko" ? `제출 전 필요: ${missing.join(", ")}` : locale === "ja" ? `提出前に必要: ${missing.join(", ")}` : `Required before submit: ${missing.join(", ")}`);
      return;
    }

    setSubmitConfirmOpen(true);
  }

  async function doSubmit() {
    if (!eq) return;
    setSubmitting(true);
    try {
      await fetch(`/api/projects/${projectId}/compliance-package`, { method: "POST" }).catch(() => {});
      const res = await fetch(`/api/projects/${projectId}/equipment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: eq.id, status: "SUBMITTED" }),
      });
      if (res.ok) {
        showToast.success(tx(locale, "Submitted to shipyard", "조선소에 제출되었습니다", "造船所に提出されました"));
        setEq({ ...eq, status: "SUBMITTED" });
      } else {
        showToast.error(tx(locale, "Submit failed", "제출 실패", "提出失敗"));
      }
    } finally {
      setSubmitting(false);
      setSubmitConfirmOpen(false);
    }
  }

  if (sessionStatus === "loading" || loading) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-6">
        <SkeletonCards count={4} />
        <SkeletonTable rows={3} />
      </div>
    );
  }

  if (!eq) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-20 text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-surface-secondary flex items-center justify-center">
          <AlertCircle size={24} className="text-text-tertiary" />
        </div>
        <p className="text-body-sm text-text-tertiary">
          {errorMsg || tx(locale, "Equipment not found", "기자재를 찾을 수 없습니다", "機器が見つかりません")}
        </p>
        <Link href={`/project/${projectId}`}>
          <Button variant="outline" size="sm" className="mt-4">
            <ArrowLeft size={14} className="mr-2" /> {tx(locale, "Back to Project", "프로젝트로 돌아가기", "プロジェクトに戻る")}
          </Button>
        </Link>
      </div>
    );
  }

  const canSubmit = userRole === "VENDOR" && ["PENDING", "IN_PROGRESS", "REVISION_REQUESTED"].includes(eq.status);

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {/* Back */}
        <Link href={`/project/${projectId}`} className="inline-flex items-center gap-1 text-body-xs text-text-tertiary hover:text-brand transition-colors mb-6">
          <ArrowLeft size={14} /> {eq.project?.vesselName || (tx(locale, "Project", "프로젝트", "プロジェクト"))}
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-brand-lighter to-brand/10 border border-brand/15 flex items-center justify-center shadow-xs">
              <Cpu size={22} className="text-brand" />
            </div>
            <div>
              <h1 className="text-h4 font-extrabold text-text tracking-tight">{eq.name}</h1>
              <p className="text-body-sm text-text-tertiary mt-0.5 flex items-center gap-1.5">
                <span>{eq.project?.vesselName}</span>
                <span className="text-border-strong">·</span>
                <span>{eq.vendor?.company || eq.vendor?.name || "—"}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canSubmit && (
              <Button size="sm" loading={submitting} onClick={handleSubmit}>
                <Send size={14} /> {tx(locale, "Submit to Shipyard", "조선소에 제출", "造船所に提出")}
              </Button>
            )}
            {eq.status === "SUBMITTED" && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-50 border border-safety-elevated/20 text-[11px] font-bold text-safety-elevated">
                <Send size={12} /> {tx(locale, "Awaiting Review", "검토 대기 중", "審査待ち")}
              </span>
            )}
            {eq.status === "APPROVED" && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 border border-safety-low/20 text-[11px] font-bold text-safety-low">
                <CheckCircle size={12} /> {tx(locale, "Approved", "승인 완료", "承認済み")}
              </span>
            )}
          </div>
        </div>

        {/* Revision note */}
        {eq.status === "REVISION_REQUESTED" && (
          <div className="mb-6 p-4 rounded-xl bg-risk-bg border border-safety-high/15 flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-risk-bg-alt flex items-center justify-center shrink-0 mt-0.5">
              <AlertCircle size={16} className="text-safety-high" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-safety-high mb-1">
                {tx(locale, "Revision Requested", "수정 요청됨", "修正依頼済み")}
              </p>
              {parseCertInfo(eq.certificationInfo)?.reviewComment ? (
                <>
                  <p className="text-body-sm text-text whitespace-pre-wrap bg-white/60 rounded-lg px-3 py-2 border border-safety-high/10 mt-1">
                    {parseCertInfo(eq.certificationInfo)!.reviewComment}
                  </p>
                  {parseCertInfo(eq.certificationInfo)?.reviewedAt && (
                    <p className="text-[11px] text-text-tertiary mt-2">
                      {new Date(parseCertInfo(eq.certificationInfo)!.reviewedAt!).toLocaleDateString(locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US", { year: "numeric", month: "short", day: "numeric" })}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-body-sm text-text-secondary">
                  {tx(locale, "Review the feedback and resubmit.", "검토 의견을 확인하고 수정 후 다시 제출하세요.", "審査コメントを確認し修正後に再提出してください。")}
                </p>
              )}
            </div>
          </div>
        )}

        {/* E27 Workflow Cards — with completion status */}
        {(() => {
          const hasCbs = !!(eq.securityCategory && eq.manufacturerName);
          const hasAssets = eq._count.hardware > 0;
          const hasDfd = !!eq.dfdDiagram;
          const isSubmitted = ["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(eq.status);
          const isApproved = eq.status === "APPROVED";
          // Step completion: CBS info is prerequisite for everything
          // [inventory, DFD, assessment, documents, submit]
          const stepDone = [hasAssets, hasDfd, hasAssets && hasDfd, isSubmitted, isApproved];
          // Find current step (first incomplete)
          const currentStep = stepDone.findIndex((d) => !d);

          return (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap size={14} className="text-brand" />
              <h2 className="text-[14px] font-bold text-text">{tx(locale, "E27 Workflow", "E27 작업 단계", "E27ワークフロー")}</h2>
              <span className="text-[11px] text-text-tertiary">
                {stepDone.filter(Boolean).length}/{WORKFLOW_PHASES.length} {tx(locale, "completed", "완료", "完了")}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {WORKFLOW_PHASES.map((phase, i) => {
                const Icon = phase.icon;
                const done = stepDone[i];
                const isCurrent = i === currentStep;
                const isInventory = phase.segment === "inventory";
                const isDfdCard = phase.segment === "inventory?tab=dfd";
                let label = locale === "ko" ? phase.labelKo : locale === "ja" ? phase.labelJa : phase.labelEn;
                // Shipyard sees "Summary" instead of "Submit"
                if (phase.segment === "submit" && (userRole === "SHIPYARD" || userRole === "ADMIN")) {
                  label = tx(locale, "Summary", "종합 요약", "サマリー");
                }
                const linkTarget = phase.segment === "submit" && (userRole === "SHIPYARD" || userRole === "ADMIN")
                  ? `/project/${projectId}/review?equipmentId=${equipmentId}`
                  : `/project/${projectId}/${phase.segment}${phase.segment.includes("?") ? "&" : "?"}equipmentId=${equipmentId}`;
                const cbsBlocked = userRole === "VENDOR" && !hasCbs;

                return (
                  <Link key={phase.segment} href={cbsBlocked ? "#" : linkTarget}
                    onClick={cbsBlocked ? (e: React.MouseEvent) => { e.preventDefault(); showToast.error(tx(locale, "Fill CBS info first", "CBS 기자재 정보를 먼저 입력하세요", "先にCBS情報を入力")); } : undefined}
                    className={cn(cbsBlocked && "cursor-not-allowed opacity-40")}>
                    <div className={cn(
                      "relative rounded-xl border p-3 h-[110px] flex flex-col items-center justify-center text-center transition-all duration-200 cursor-pointer group",
                      done
                        ? "border-[#24A148]/20 bg-[#E6F7EF]/10 opacity-60 hover:opacity-100 hover:bg-[#E6F7EF]/25"
                        : isCurrent
                        ? "border-brand bg-white shadow-[0_2px_12px_rgba(15,98,254,0.12),inset_0_1px_0_rgba(15,98,254,0.08)]"
                        : "border-border bg-white hover:border-brand/20 hover:shadow-sm",
                    )}>
                      {/* Step badge */}
                      <div className={cn("absolute top-2 left-2 h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold",
                        done ? "bg-[#24A148] text-white" : isCurrent ? "bg-brand text-white" : "bg-surface-secondary text-text-tertiary"
                      )}>
                        {done ? <CheckCircle size={11} /> : i + 1}
                      </div>

                      {/* Icon */}
                      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center mb-1.5",
                        done ? "opacity-50" : ""
                      )} style={{ backgroundColor: done ? "#24A14810" : `${phase.color}10` }}>
                        <Icon size={17} style={{ color: done ? "#24A148" : phase.color }} />
                      </div>

                      {/* Label */}
                      <p className={cn("text-[11px] font-bold leading-tight",
                        done ? "text-[#24A148]/70" : isCurrent ? "text-brand" : "text-text"
                      )}>{label}</p>

                      {/* Current step CTA */}
                      {isCurrent && (
                        <div className="mt-1.5 flex items-center gap-0.5 text-[10px] font-semibold text-brand">
                          {tx(locale, "Continue", "진행하기", "続行")} <ArrowRight size={10} />
                        </div>
                      )}

                      {/* Stats for inventory/DFD */}
                      {!isCurrent && isInventory && (
                        <p className="text-[9px] text-text-tertiary mt-1">HW {eq._count.hardware} · SW {eq._count.software}</p>
                      )}
                      {!isCurrent && isDfdCard && (
                        <p className={cn("text-[9px] mt-1", done ? "text-[#24A148]/60" : "text-text-tertiary")}>{hasDfd ? "✓" : "—"}</p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
          );
        })()}

        {/* CBS 미입력 경고 */}
        {userRole === "VENDOR" && !(eq.securityCategory && eq.manufacturerName) && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-3">
            <AlertCircle size={18} className="text-red-500 shrink-0" />
            <div>
              <p className="text-[13px] font-bold text-red-800">{tx(locale, "CBS info required", "CBS 기자재 정보 필수 입력", "CBS情報の入力が必要です")}</p>
              <p className="text-[11px] text-red-600 mt-0.5">{tx(locale, "Please fill in the equipment info below before proceeding to asset registration.", "아래 기자재 기본 정보를 입력해야 다음 단계로 진행할 수 있습니다.", "下記の機器情報を入力してください。")}</p>
            </div>
          </div>
        )}

        {/* ── CBS Equipment Info + Certification Documents (통합) ── */}
        <div className={cn("bg-white rounded-xl border p-5 mb-6", userRole === "VENDOR" && !(eq.securityCategory && eq.manufacturerName) ? "border-red-300 ring-2 ring-red-100" : "border-border")}>
          <div className="flex items-center gap-2 mb-4">
            <Cpu size={15} className="text-brand" />
            <h2 className="text-[14px] font-bold text-text">{tx(locale, "Equipment Info", "기자재 기본 정보", "機器基本情報")}</h2>
            {!(eq.securityCategory && eq.manufacturerName) && (
              <span className="text-[9px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">{tx(locale, "Required", "필수", "必須")}</span>
            )}
          </div>
          <CbsInfoCard eq={eq} projectId={projectId} equipmentId={equipmentId} locale={locale} onUpdate={userRole === "VENDOR" ? (data) => setEq({ ...eq, ...data } as EquipmentDetail) : undefined} />
        </div>

        {/* Collapsible sections — Vendor only */}
        {userRole === "VENDOR" && (
          <div className="space-y-3">
            {/* ── Template section ── */}
            <Card padding="none">
              <button
                onClick={() => setTemplateOpen(!templateOpen)}
                className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-surface-secondary/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <LayoutTemplate size={15} className="text-brand" />
                  <span className="text-body-sm font-bold text-text">{tx(locale, "Templates", "템플릿", "テンプレート")}</span>
                  <span className="text-[10px] text-text-tertiary">({templates.length})</span>
                </div>
                <ChevronDown size={16} className={cn("text-text-tertiary transition-transform", templateOpen && "rotate-180")} />
              </button>
              {templateOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} transition={{ duration: 0.2 }}>
                  <div className="px-5 pb-4 space-y-3">
                    <p className="text-body-xs text-text-tertiary">
                      {tx(locale, "Save current equipment config as template or apply a saved one.", "현재 기자재 설정을 템플릿으로 저장하거나, 저장된 템플릿을 적용할 수 있습니다.", "現在の機器設定をテンプレートとして保存、または保存済みテンプレートを適用できます。")}
                    </p>
                    <Button size="sm" variant="outline" onClick={() => setSaveDialogOpen(true)}>
                      <Save size={14} /> {tx(locale, "Save Current", "현재 설정 저장", "現在の設定を保存")}
                    </Button>
                    {tplLoading ? (
                      <p className="text-body-xs text-text-tertiary py-3 text-center">{tx(locale, "Loading...", "로딩...", "読み込み中...")}</p>
                    ) : templates.length === 0 ? (
                      <p className="text-body-xs text-text-tertiary py-3 text-center">{tx(locale, "No saved templates", "저장된 템플릿이 없습니다", "保存済みテンプレートがありません")}</p>
                    ) : (
                      <div className="space-y-2">
                        {templates.map((tpl) => {
                          const hw = Array.isArray(tpl.data?.hardware) ? tpl.data.hardware.length : 0;
                          const sw = Array.isArray(tpl.data?.software) ? tpl.data.software.length : 0;
                          const hasDfd = !!tpl.data?.dfd;
                          return (
                            <div key={tpl.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-surface-secondary/20 hover:bg-surface-secondary/40 transition-colors">
                              <LayoutTemplate size={14} className="text-brand shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-body-xs font-semibold text-text truncate">{tpl.name}</p>
                                <p className="text-[10px] text-text-tertiary">HW {hw} · SW {sw}{hasDfd ? " · DFD ✅" : ""} · {new Date(tpl.createdAt).toLocaleDateString(locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US")}</p>
                              </div>
                              <div className="flex gap-1.5 shrink-0">
                                <Button size="sm" variant="outline" loading={applyingId === tpl.id} onClick={() => handleApplyTemplate(tpl.id)} className="h-7 text-[11px] px-2.5">
                                  <Copy size={12} /> {tx(locale, "Apply", "적용", "適用")}
                                </Button>
                                <button onClick={() => setDeleteTarget(tpl)} className="h-7 w-7 rounded flex items-center justify-center text-text-tertiary hover:text-safety-high hover:bg-risk-bg transition-colors">
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </Card>

          </div>
        )}
      </motion.div>

      {/* Save Template Dialog */}
      <Dialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        title={tx(locale, "Save as Template", "템플릿 저장", "テンプレート保存")}
        description={locale === "ko" ? `현재 기자재(${eq.name})의 HW/SW 설정을 템플릿으로 저장합니다` : locale === "ja" ? `現在の機器(${eq.name})のHW/SW設定をテンプレートとして保存します` : `Save HW/SW config from ${eq.name} as a reusable template`}
      >
        <div className="space-y-4">
          <Input
            label={tx(locale, "Template Name *", "템플릿 이름 *", "テンプレート名 *")}
            placeholder={tx(locale, "e.g. ECDIS Default Config", "예: ECDIS 기본 구성", "例: ECDIS基本構成")}
            value={tplName}
            onChange={(e) => setTplName(e.target.value)}
          />
          <p className="text-body-xs text-text-tertiary">
            {locale === "ko" ? `현재 등록된 HW ${eq._count.hardware}개, SW ${eq._count.software}개가 저장됩니다.` : locale === "ja" ? `HW ${eq._count.hardware}件、SW ${eq._count.software}件が保存されます。` : `Will save ${eq._count.hardware} HW and ${eq._count.software} SW items.`}
          </p>
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>{tx(locale, "Cancel", "취소", "キャンセル")}</Button>
            <Button onClick={handleSaveTemplate} loading={tplSaving}>
              <Save size={14} /> {tx(locale, "Save", "저장", "保存")}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Template Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteTemplate}
        title={tx(locale, "Delete Template", "템플릿 삭제", "テンプレート削除")}
        description={locale === "ko" ? `"${deleteTarget?.name}" 템플릿을 삭제하시겠습니까?` : locale === "ja" ? `テンプレート「${deleteTarget?.name}」を削除しますか？` : `Delete template "${deleteTarget?.name}"?`}
      />

      <ConfirmDialog
        open={submitConfirmOpen}
        onClose={() => setSubmitConfirmOpen(false)}
        onConfirm={doSubmit}
        title={tx(locale, "Submit to Shipyard", "조선소에 제출", "造船所に提出")}
        description={tx(locale, "This equipment will be submitted for shipyard review. Continue?", "이 기자재를 조선소 검토에 제출합니다. 계속하시겠습니까?", "この機器を造船所の審査に提出します。続行しますか？")}
        confirmLabel={tx(locale, "Submit", "제출", "提出")}
        cancelLabel={tx(locale, "Cancel", "취소", "キャンセル")}
        danger={false}
        loading={submitting}
      />

    </div>
  );
}

// ─── CBS Info Card (통합: 기자재 정보 + 인증문서) ─────────────────────────────

function CbsInfoCard({ eq, projectId, equipmentId, locale, onUpdate }: {
  eq: EquipmentDetail;
  projectId: string;
  equipmentId: string;
  locale: string;
  onUpdate?: (data: Partial<EquipmentDetail>) => void;
}) {
  const [saving, setSaving] = useState(false);
  const readOnly = !onUpdate;

  // CBS fields from Equipment
  const eqAny = eq as unknown as Record<string, unknown>;
  const secCat = eqAny.securityCategory as number | null;
  const isTA = eqAny.isTypeApproved as boolean;
  const mfr = eqAny.manufacturerName as string | null;
  const model = eqAny.productModelName as string | null;

  const [formCat, setFormCat] = useState(String(secCat || ""));
  const [formTA, setFormTA] = useState(isTA ? "1" : "0");
  const [formMfr, setFormMfr] = useState(mfr || "");
  const [formModel, setFormModel] = useState(model || "");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setFormCat(String(secCat || ""));
    setFormTA(isTA ? "1" : "0");
    setFormMfr(mfr || "");
    setFormModel(model || "");
    setDirty(false);
  }, [secCat, isTA, mfr, model]);

  const update = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setDirty(true); };

  const inputCls = cn("h-9 w-full rounded-lg border px-3 text-[12px] transition-all focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand",
    readOnly ? "border-border bg-gray-50 text-text-tertiary cursor-not-allowed" : "border-border bg-white text-text hover:border-border-strong");
  const selectCls = cn(inputCls, "appearance-none");

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/equipment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: eq.id,
          securityCategory: parseInt(formCat) || null,
          isTypeApproved: formTA === "1",
          manufacturerName: formMfr || null,
          productModelName: formModel || null,
        }),
      });
      if (res.ok) {
        onUpdate?.({
          securityCategory: parseInt(formCat) || null,
          isTypeApproved: formTA === "1",
          manufacturerName: formMfr || null,
          productModelName: formModel || null,
        } as Partial<EquipmentDetail>);
        setDirty(false);
        showToast.success(tx(locale, "Saved", "저장됨", "保存済み"));
      }
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      {/* CBS 기자재 정보 - 항상 펼침 */}
      <div>
        <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mb-3">{tx(locale, "CBS Equipment Info", "CBS 기자재 정보", "CBS機器情報")}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-text-tertiary">{tx(locale, "Manufacturer *", "제조사 *", "メーカー *")}</label>
            <input value={formMfr} onChange={(e) => update(setFormMfr)(e.target.value)} placeholder="e.g. Intellian"
              disabled={readOnly} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-text-tertiary">{tx(locale, "Model *", "모델명 *", "モデル名 *")}</label>
            <input value={formModel} onChange={(e) => update(setFormModel)(e.target.value)} placeholder="e.g. v100NX"
              disabled={readOnly} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-text-tertiary">{tx(locale, "Category *", "E27 카테고리 *", "E27カテゴリ *")}</label>
            <select value={formCat} onChange={(e) => update(setFormCat)(e.target.value)} disabled={readOnly} className={selectCls}>
              <option value="">{tx(locale, "Select", "선택", "選択")}</option>
              <option value="1">Cat I — {tx(locale, "Nav & Comm", "항해/통신", "航海/通信")}</option>
              <option value="2">Cat II — {tx(locale, "Machinery", "기관/화물", "機関/貨物")}</option>
              <option value="3">Cat III — {tx(locale, "Other OT", "기타 OT", "その他OT")}</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-text-tertiary">{tx(locale, "E27 Cybersecurity TA", "E27 사이버보안 TA 인증", "E27サイバーセキュリティTA認証")}</label>
            <select value={formTA} onChange={(e) => update(setFormTA)(e.target.value)} disabled={readOnly} className={selectCls}>
              <option value="0">{tx(locale, "Not Certified", "미인증", "未認証")}</option>
              <option value="1">{tx(locale, "Certified", "인증", "認証済み")}</option>
            </select>
          </div>
        </div>
        {!readOnly && dirty && (
          <div className="flex justify-end mt-3">
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-1.5 rounded-lg text-[11px] font-bold text-white bg-brand hover:bg-brand-hover disabled:opacity-50 transition-colors">
              <Save size={12} className="inline mr-1" />{tx(locale, "Save", "저장", "保存")}
            </button>
          </div>
        )}
      </div>

      {/* TA 인증 → 인증문서 업로드 */}
      {formTA === "1" && (
        <div className="pt-4 border-t border-border">
          <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mb-3">
            {tx(locale, "E27 TA Certification Documents", "E27 TA 인증 문서", "E27 TA認証文書")}
          </p>
          <CertDocuments projectId={projectId} equipmentId={equipmentId} canEdit={!readOnly} />
        </div>
      )}
    </div>
  );
}
