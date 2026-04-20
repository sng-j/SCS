"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Send, ArrowLeft, CheckCircle, XCircle, Clock, Eye,
  ThumbsUp, AlertTriangle, Cpu, ChevronRight, Home,
  MessageSquare, Package, Shield, FileText, Network, ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { WorkflowSteps } from "@/components/ui/workflow-steps";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonTable } from "@/components/ui/skeleton";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EquipmentSummary {
  id: string;
  name: string;
  status: string;
  vendor?: { name: string; company: string | null };
  _count: { hardware: number; software: number };
  dfdDiagram: { id: string } | null;
  certificationInfo?: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; labelEn: string; labelJa: string; color: string; bg: string; icon: React.ElementType<Record<string, unknown>> }> = {
  PENDING:            { label: "대기",     labelEn: "Pending",    labelJa: "保留中",    color: "#8D8D8D", bg: "#F4F4F4", icon: Clock },
  IN_PROGRESS:        { label: "진행 중",  labelEn: "In Progress", labelJa: "進行中",   color: "#0F62FE", bg: "#EDF5FF", icon: Cpu },
  SUBMITTED:          { label: "제출됨",   labelEn: "Submitted",  labelJa: "提出済み",  color: "#EB6200", bg: "#FFF3E0", icon: Send },
  UNDER_REVIEW:       { label: "검토 중",  labelEn: "Reviewing",  labelJa: "審査中",   color: "#EB6200", bg: "#FFF3E0", icon: Eye },
  REVISION_REQUESTED: { label: "수정 요청", labelEn: "Revision",  labelJa: "修正依頼",  color: "#DA1E28", bg: "#FFF1F1", icon: AlertTriangle },
  APPROVED:           { label: "승인",     labelEn: "Approved",   labelJa: "承認済み",  color: "#24A148", bg: "#E6F7EF", icon: ThumbsUp },
  REJECTED:           { label: "반려",     labelEn: "Rejected",   labelJa: "却下",     color: "#DA1E28", bg: "#FFF1F1", icon: XCircle },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SubmitPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const eqParams = useSearchParams();
  const equipmentId = eqParams.get("equipmentId");
  const { data: session, status: sessionStatus } = useSession();
  const { locale } = useLocaleStore();
  const userRole = (session?.user as { role?: string })?.role || "VENDOR";

  if (sessionStatus === "loading") {
    return <div className="max-w-[1400px] mx-auto px-6 py-8"><SkeletonTable rows={4} /></div>;
  }

  // equipmentId가 있으면 → 해당 기자재 제출 화면
  // 없으면 → 전체 현황 대시보드
  return equipmentId
    ? <EquipmentSubmitView projectId={projectId} equipmentId={equipmentId} locale={locale} userRole={userRole} />
    : <OverviewDashboard projectId={projectId} locale={locale} userRole={userRole} session={session} />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── Equipment Submit View (벤더: 단일 기자재 제출)
// ═══════════════════════════════════════════════════════════════════════════════

function EquipmentSubmitView({ projectId, equipmentId, locale, userRole }: {
  projectId: string; equipmentId: string; locale: string; userRole: string;
}) {
  // Write (approve/revise): only SUPPORT or ADMIN. SHIPYARD is read-only viewer.
  const canReview = userRole === "SUPPORT" || userRole === "ADMIN";
  const [eq, setEq] = useState<EquipmentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [assessCount, setAssessCount] = useState({ total: 0, passed: 0 });
  const [reviewNote, setReviewNote] = useState("");
  const [reviewAction, setReviewAction] = useState<"APPROVED" | "REVISION_REQUESTED" | null>(null);

  useEffect(() => {
    const eqParam = equipmentId ? `?equipmentId=${equipmentId}` : "";
    Promise.all([
      fetch(`/api/projects/${projectId}/equipment`).then(async (r) => r.ok ? r.json() : []),
      fetch(`/api/projects/${projectId}/assessments`).then(async (r) => r.ok ? r.json() : []),
      fetch(`/api/projects/${projectId}/hardware${eqParam}`).then(async (r) => r.ok ? r.json() : []),
    ]).then(([eqList, allAssessments, hwList]) => {
      const found = eqList.find((e: EquipmentSummary) => e.id === equipmentId);
      if (found) setEq(found);

      // CBS 종합 판정: SC별로 모든 HW의 결과를 종합
      const hwIds = new Set(hwList.map((h: { id: string }) => h.id));
      const eqAssessments = allAssessments.filter((a: { hardwareId: string }) => hwIds.has(a.hardwareId));
      const scIds = [...new Set(eqAssessments.map((a: { checkId: string }) => a.checkId))] as string[];

      // SC 13개 기준으로 종합
      let passCount = 0;
      for (const sc of scIds) {
        const scResults = eqAssessments.filter((a: { checkId: string }) => a.checkId === sc).map((a: { result: string }) => a.result);
        if (scResults.includes("FAIL")) continue; // 하나라도 실패 → 미통과
        if (scResults.includes("PARTIAL")) continue;
        if (scResults.every((r: string) => r === "PASS")) passCount++;
      }
      setAssessCount({ total: 13, passed: passCount });
    }).finally(() => setLoading(false));
  }, [projectId, equipmentId]);

  const canSubmit = userRole === "VENDOR" && eq && ["PENDING", "IN_PROGRESS", "REVISION_REQUESTED"].includes(eq.status);

  const checks = eq ? [
    { id: "hw", icon: Cpu, label: tx(locale, "Hardware", "하드웨어 등록", "ハードウェア登録"), pass: eq._count.hardware > 0, detail: `${eq._count.hardware}` },
    { id: "sw", icon: Package, label: tx(locale, "Software", "소프트웨어 등록", "ソフトウェア登録"), pass: eq._count.software > 0, detail: `${eq._count.software}` },
    { id: "dfd", icon: Network, label: "DFD", pass: !!eq.dfdDiagram, detail: eq.dfdDiagram ? "✅" : "—" },
    { id: "assess", icon: Shield, label: tx(locale, "Assessment", "보안 평가", "セキュリティ評価"), pass: true, detail: `${assessCount.passed}/13 SC ${tx(locale, "pass", "통과", "適合")}` },
    { id: "testproc", icon: ClipboardList, label: tx(locale, "Test Procedure", "테스트 절차", "テスト手順"), pass: true, detail: "—" },
    { id: "doc", icon: FileText, label: tx(locale, "Documents", "문서 생성", "文書生成"), pass: true, detail: "—" },
  ] : [];

  const allReady = checks.filter((c) => c.id !== "doc" && c.id !== "sw").every((c) => c.pass);

  async function handleSubmit() {
    if (!eq) return;
    setSubmitting(true);
    setConfirmOpen(false);
    try {
      // Generate compliance package
      await fetch(`/api/projects/${projectId}/compliance-package`, { method: "POST" }).catch(() => {});

      // Update equipment status
      const res = await fetch(`/api/projects/${projectId}/equipment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: eq.id, status: "SUBMITTED" }),
      });
      if (res.ok) {
        setEq({ ...eq, status: "SUBMITTED" });
        showToast.success(tx(locale, "Submitted to shipyard!", "조선소에 제출되었습니다!", "造船所に提出されました！"));
      } else {
        showToast.error(tx(locale, "Submit failed", "제출 실패", "提出失敗"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReview(action: "APPROVED" | "REVISION_REQUESTED") {
    if (!eq) return;
    if (action === "REVISION_REQUESTED" && !reviewNote.trim()) {
      showToast.error(tx(locale, "Please provide revision feedback", "수정 요청 사유를 입력하세요", "修正依頼の理由を入力してください"));
      return;
    }
    setSubmitting(true);
    try {
      const certInfo = eq.certificationInfo ? JSON.parse(eq.certificationInfo) : {};
      const updatedCert = {
        ...certInfo,
        reviewedAt: new Date().toISOString(),
        reviewComment: reviewNote.trim() || undefined,
      };
      const res = await fetch(`/api/projects/${projectId}/equipment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: eq.id, status: action, certificationInfo: JSON.stringify(updatedCert) }),
      });
      if (res.ok) {
        setEq({ ...eq, status: action });
        setReviewAction(null);
        setReviewNote("");
        showToast.success(action === "APPROVED"
          ? (tx(locale, "Approved", "승인되었습니다", "承認されました"))
          : (tx(locale, "Revision requested", "수정 요청을 보냈습니다", "修正依頼を送信しました")));
      } else {
        showToast.error(tx(locale, "Failed", "처리 실패", "処理失敗"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="max-w-[1400px] mx-auto px-6 py-8"><SkeletonTable rows={4} /></div>;
  if (!eq) return <div className="max-w-[1400px] mx-auto px-6 py-8 text-center text-text-tertiary">{tx(locale, "Equipment not found", "기자재를 찾을 수 없습니다", "機器が見つかりません")}</div>;

  const statusCfg = STATUS_CONFIG[eq.status] || STATUS_CONFIG.PENDING;
  const isSubmitted = ["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(eq.status);

  return (
    <div>
      <WorkflowSteps currentSegment="submit" projectId={projectId} equipmentId={equipmentId} />
    <div className="max-w-[1000px] mx-auto px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Link href={`/project/${projectId}/equipment/${equipmentId}`} className="inline-flex items-center gap-1 text-body-xs text-text-tertiary hover:text-brand transition-colors mb-6">
          <ArrowLeft size={14} /> {tx(locale, "Equipment", "기자재", "機器")}
        </Link>

        {/* ── Header: 제출 상태 + 기자재명 통합 ── */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold" style={{ background: statusCfg.bg, color: statusCfg.color }}>
              {locale === "ko" ? statusCfg.label : locale === "ja" ? statusCfg.labelJa : statusCfg.labelEn}
            </span>
            {allReady && !isSubmitted && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-green-50 text-green-700">
                {tx(locale, "Ready to submit", "제출 가능", "提出可能")}
              </span>
            )}
          </div>
          <h1 className="text-[22px] font-extrabold text-text tracking-tight leading-tight">{eq.name}</h1>
          <p className="text-[13px] text-text-tertiary mt-1">
            {tx(locale, "E27 Cybersecurity Certification Submission", "E27 사이버보안 인증 제출", "E27サイバーセキュリティ認証提出")}
          </p>
        </div>

        {/* Status banner */}
        {isSubmitted && !canReview && (
          <div className="rounded-[var(--radius-md)] border" style={{ borderColor: statusCfg.color + "30", background: statusCfg.bg }}><Card padding="md" className="mb-6 border-0 bg-transparent">
            <div className="flex items-center gap-3">
              <statusCfg.icon size={24} style={{ color: statusCfg.color }} />
              <div>
                <p className="text-body-sm font-bold" style={{ color: statusCfg.color }}>
                  {locale === "ko" ? statusCfg.label : locale === "ja" ? statusCfg.labelJa : statusCfg.labelEn}
                </p>
                <p className="text-body-xs text-text-secondary mt-0.5">
                  {eq.status === "SUBMITTED" && (tx(locale, "Under review by shipyard. Please wait for the result.", "조선소에서 검토 중입니다. 결과를 기다려주세요.", "造船所で審査中です。結果をお待ちください。"))}
                  {eq.status === "APPROVED" && (tx(locale, "E27 certification for this equipment has been approved.", "이 기자재의 E27 인증이 승인되었습니다.", "この機器のE27認証が承認されました。"))}
                  {eq.status === "UNDER_REVIEW" && (tx(locale, "Shipyard reviewer is evaluating.", "조선소 담당자가 검토 중입니다.", "造船所担当者が審査中です。"))}
                </p>
              </div>
            </div>
          </Card></div>
        )}

        {/* Shipyard review panel */}
        {canReview && eq.status === "SUBMITTED" && (
          <Card padding="none" className="mb-6 border-brand/20">
            <CardHeader
              title={tx(locale, "Review & Approve", "검토 및 승인", "審査・承認")}
              subtitle={tx(locale, "Review the vendor's submission", "벤더가 제출한 기자재를 검토합니다", "ベンダーが提出した機器を審査します")}
            />
            <CardBody className="space-y-4">
              <div>
                <label className="text-body-xs font-semibold text-text-tertiary mb-1.5 block">
                  {tx(locale, "Review Comment", "검토 의견", "審査コメント")}
                </label>
                <textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder={tx(locale, "Enter review comments...", "검토 의견을 입력하세요...", "審査コメントを入力してください...")}
                  rows={3}
                  className="w-full rounded-lg border border-border px-3 py-2 text-body-sm text-text placeholder:text-text-tertiary/60 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none"
                />
              </div>
              <div className="flex gap-3">
                <Button
                  className="flex-1 h-11"
                  loading={submitting && reviewAction === "APPROVED"}
                  onClick={() => { setReviewAction("APPROVED"); handleReview("APPROVED"); }}
                >
                  <ThumbsUp size={16} /> {tx(locale, "Approve", "승인", "承認")}
                </Button>
                <Button
                  variant="danger"
                  className="flex-1 h-11"
                  loading={submitting && reviewAction === "REVISION_REQUESTED"}
                  onClick={() => { setReviewAction("REVISION_REQUESTED"); handleReview("REVISION_REQUESTED"); }}
                >
                  <MessageSquare size={16} /> {tx(locale, "Request Revision", "수정 요청", "修正依頼")}
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Approved status + unlock button for reviewer */}
        {eq.status === "APPROVED" && (
          <Card padding="md" className="mb-6 border-safety-low/20 bg-green-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle size={24} className="text-safety-low" />
                <div>
                  <p className="text-body-sm font-bold text-safety-low">{tx(locale, "Approved", "승인 완료", "承認済み")}</p>
                  <p className="text-body-xs text-text-secondary mt-0.5">
                    {tx(locale, "This equipment is locked", "이 기자재는 잠겨 있습니다", "この機器はロックされています")}
                  </p>
                </div>
              </div>
              {canReview && (
                <Button
                  size="sm"
                  variant="outline"
                  loading={submitting}
                  onClick={async () => {
                    setSubmitting(true);
                    const res = await fetch(`/api/projects/${projectId}/equipment`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: eq.id, status: "REVISION_REQUESTED", certificationInfo: JSON.stringify({ ...JSON.parse(eq.certificationInfo || "{}"), reviewComment: tx(locale, "Modification allowed", "수정이 허용되었습니다", "修正が許可されました"), reviewedAt: new Date().toISOString() }) }),
                    });
                    if (res.ok) {
                      setEq({ ...eq, status: "REVISION_REQUESTED" });
                      showToast.success(tx(locale, "Modification allowed", "수정이 허용되었습니다", "修正が許可されました"));
                    }
                    setSubmitting(false);
                  }}
                >
                  {tx(locale, "Unlock for Edit", "수정 허용", "編集許可")}
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* Revision requested */}
        {eq.status === "REVISION_REQUESTED" && (
          <Card padding="md" className="mb-6 border-safety-high/20 bg-risk-bg">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-safety-high shrink-0 mt-0.5" />
              <div>
                <p className="text-body-sm font-bold text-safety-high">{tx(locale, "Revision Requested", "수정 요청", "修正依頼")}</p>
                <p className="text-body-xs text-text-secondary mt-1">
                  {tx(locale, "The shipyard has requested revisions. Please review and resubmit.", "조선소에서 수정을 요청했습니다. 내용을 확인하고 수정 후 다시 제출하세요.", "造船所から修正が依頼されました。内容を確認し修正後に再提出してください。")}
                </p>
                {(() => {
                  try {
                    const ci = eq.certificationInfo ? JSON.parse(eq.certificationInfo) : null;
                    return ci?.reviewComment ? (
                      <p className="text-body-xs text-text mt-2 p-2 rounded bg-white border border-border">{ci.reviewComment}</p>
                    ) : null;
                  } catch { return null; }
                })()}
              </div>
            </div>
          </Card>
        )}

        {/* Readiness checklist — 진행률 바 + 항목 카드 */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[13px] font-bold text-text">
              {tx(locale, "Submission Checklist", "제출 체크리스트", "提出チェックリスト")}
            </p>
            <span className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold",
              allReady ? "bg-green-50 text-green-700 border border-green-200" : "bg-amber-50 text-amber-700 border border-amber-200"
            )}>
              {checks.filter((c) => c.pass).length}/{checks.length}
            </span>
          </div>

          {/* 진행률 바 */}
          <div className="h-1.5 rounded-full bg-gray-100 mb-5 overflow-hidden">
            <motion.div
              className={cn("h-full rounded-full", allReady ? "bg-green-500" : "bg-brand")}
              initial={{ width: 0 }}
              animate={{ width: `${(checks.filter((c) => c.pass).length / checks.length) * 100}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>

          {/* 항목 그리드 */}
          <div className="grid grid-cols-5 gap-2">
            {checks.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.25 }}
                className={cn(
                  "relative rounded-xl border p-3 text-center transition-all",
                  c.pass
                    ? "border-green-200 bg-green-50/60"
                    : "border-border bg-white"
                )}
              >
                <div className={cn(
                  "h-9 w-9 rounded-lg flex items-center justify-center mx-auto mb-2",
                  c.pass ? "bg-green-100" : "bg-surface-secondary"
                )}>
                  <c.icon size={16} className={c.pass ? "text-green-700" : "text-text-tertiary"} />
                </div>
                <p className={cn("text-[11px] font-semibold mb-1", c.pass ? "text-green-800" : "text-text-secondary")}>
                  {c.label}
                </p>
                <p className={cn("text-[13px] font-extrabold", c.pass ? "text-green-700" : "text-text-tertiary")}>
                  {c.detail}
                </p>
                {/* 상태 도트 */}
                <div className={cn(
                  "absolute top-2 right-2 h-2 w-2 rounded-full",
                  c.pass ? "bg-green-500" : "bg-gray-300"
                )} />
              </motion.div>
            ))}
          </div>
        </div>

        {/* 조선소 검토는 vessel-detail의 EquipmentReviewView에서 처리 */}

        {/* Submit button */}
        {canSubmit && (
          <div className={cn("rounded-xl p-1", allReady ? "bg-gradient-to-r from-brand to-brand-hover p-px" : "")}>
            <Button
              className={cn(
                "w-full h-12 text-body-sm font-bold rounded-xl",
                allReady ? "bg-white text-brand hover:bg-brand hover:text-white transition-all duration-200" : ""
              )}
              loading={submitting}
              disabled={!allReady}
              onClick={() => setConfirmOpen(true)}
            >
              <Send size={16} />
              {tx(locale, "Submit to Shipyard", "조선소에 제출하기", "造船所に提出する")}
            </Button>
          </div>
        )}


      </motion.div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleSubmit}
        title={tx(locale, "Submit to Shipyard", "조선소에 제출", "造船所に提出")}
        description={locale === "ko" ? `${eq.name}의 E27 인증 자료를 조선소에 제출합니다. 제출 후에는 조선소 검토가 완료될 때까지 수정이 제한됩니다.` : locale === "ja" ? `${eq.name}のE27認証資料を造船所に提出します。提出後は造船所の審査が完了するまで修正が制限されます。` : `Submit E27 certification materials for ${eq.name} to the shipyard. Modifications will be restricted until review is complete.`}
      />
    </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── Overview Dashboard (조선소: 전체 기자재 현황 + 검토)
// ═══════════════════════════════════════════════════════════════════════════════

function OverviewDashboard({ projectId, locale, userRole, session }: {
  projectId: string; locale: string; userRole: string; session: ReturnType<typeof useSession>["data"];
}) {
  // Write (approve/revise): only SUPPORT or ADMIN. SHIPYARD is read-only viewer.
  const canReview = userRole === "SUPPORT" || userRole === "ADMIN";
  const [equipments, setEquipments] = useState<EquipmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewTarget, setReviewTarget] = useState<EquipmentSummary | null>(null);
  const [reviewAction, setReviewAction] = useState<"APPROVED" | "REVISION_REQUESTED" | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchEquipments = useCallback(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/equipment`)
      .then(async (r) => { if (r.ok) setEquipments(await r.json()); })
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { fetchEquipments(); }, [fetchEquipments]);

  async function handleReview() {
    if (!reviewTarget || !reviewAction) return;
    setSaving(true);
    try {
      const certInfo = reviewTarget.certificationInfo
        ? JSON.parse(reviewTarget.certificationInfo)
        : {};
      const updatedCert = {
        ...certInfo,
        reviewedBy: (session?.user as { name?: string })?.name || "",
        reviewedAt: new Date().toISOString(),
        reviewComment: reviewNote.trim() || undefined,
      };
      const res = await fetch(`/api/projects/${projectId}/equipment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reviewTarget.id, status: reviewAction, certificationInfo: JSON.stringify(updatedCert) }),
      });
      if (res.ok) {
        showToast.success(reviewAction === "APPROVED"
          ? tx(locale, "Approved", "승인되었습니다", "承認されました")
          : tx(locale, "Revision requested", "수정 요청을 보냈습니다", "修正依頼を送信しました"));
        setReviewTarget(null); setReviewAction(null); setReviewNote("");
        fetchEquipments();
      }
    } finally { setSaving(false); }
  }

  const submitted = equipments.filter((e) => e.status === "SUBMITTED" || e.status === "UNDER_REVIEW").length;
  const approved = equipments.filter((e) => e.status === "APPROVED").length;

  if (loading) return <div className="max-w-[1400px] mx-auto px-6 py-8"><SkeletonTable rows={4} /></div>;

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Link href={`/project/${projectId}`} className="inline-flex items-center gap-1 text-body-xs text-text-tertiary hover:text-brand transition-colors mb-6">
          <ArrowLeft size={14} /> {tx(locale, "Project", "프로젝트", "プロジェクト")}
        </Link>

        <div className="mb-6">
          <h1 className="text-h4 font-extrabold text-text tracking-tight">{tx(locale, "Submission Status", "제출 현황", "提出状況")}</h1>
          <p className="text-body-sm text-text-tertiary mt-1">
            {canReview
              ? (tx(locale, "Review and approve/reject vendor submissions", "벤더가 제출한 기자재를 검토하고 승인/반려합니다", "ベンダーが提出した機器を審査し承認/却下します"))
              : (tx(locale, "View submission status per equipment", "기자재별 제출 현황을 확인합니다", "機器別の提出状況を確認します"))}
          </p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="rounded-xl border border-border bg-white p-4 text-center shadow-xs hover:shadow-sm transition-shadow">
            <p className="text-[28px] font-extrabold text-text leading-none">{equipments.length}</p>
            <p className="text-[11px] font-medium text-text-tertiary mt-1.5">{tx(locale, "Total", "전체 기자재", "全機器")}</p>
          </div>
          <div className="rounded-xl border border-safety-elevated/20 bg-orange-50/50 p-4 text-center shadow-xs hover:shadow-sm transition-shadow">
            <p className="text-[28px] font-extrabold text-safety-elevated leading-none">{submitted}</p>
            <p className="text-[11px] font-medium text-text-tertiary mt-1.5">{tx(locale, "Pending Review", "검토 대기", "審査待ち")}</p>
          </div>
          <div className="rounded-xl border border-safety-low/20 bg-green-50/50 p-4 text-center shadow-xs hover:shadow-sm transition-shadow">
            <p className="text-[28px] font-extrabold text-safety-low leading-none">{approved}</p>
            <p className="text-[11px] font-medium text-text-tertiary mt-1.5">{tx(locale, "Approved", "승인 완료", "承認済み")}</p>
          </div>
        </div>

        {/* Equipment list */}
        <Card padding="none">
          <CardHeader title={tx(locale, "Equipment Status", "기자재별 현황", "機器別状況")} />
          {equipments.length === 0 ? (
            <EmptyState icon={Cpu} title={tx(locale, "No equipment", "기자재가 없습니다", "機器がありません")} />
          ) : (
            <div className="divide-y divide-border/60">
              {equipments.map((eq, idx) => {
                const cfg = STATUS_CONFIG[eq.status] || STATUS_CONFIG.PENDING;
                const isSubmittedEq = eq.status === "SUBMITTED";
                return (
                  <div key={eq.id} className={cn(
                    "px-5 py-4 hover:bg-surface-secondary/40 transition-colors group",
                    idx % 2 !== 0 && "bg-surface-secondary/15"
                  )}>
                    <div className="flex items-center gap-4">
                      <Link href={`/project/${projectId}/submit?equipmentId=${eq.id}`} className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs hover:scale-105 transition-transform" style={{ background: cfg.bg }}>
                        <cfg.icon size={17} style={{ color: cfg.color }} />
                      </Link>
                      <Link href={`/project/${projectId}/submit?equipmentId=${eq.id}`} className="flex-1 min-w-0 hover:opacity-80 transition-opacity">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[13px] font-semibold text-text">{eq.name}</p>
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: cfg.bg, color: cfg.color }}>
                            <cfg.icon size={9} />
                            {locale === "ko" ? cfg.label : locale === "ja" ? cfg.labelJa : cfg.labelEn}
                          </span>
                        </div>
                        <p className="text-[11px] text-text-tertiary mt-0.5 flex items-center gap-1.5">
                          <span>{eq.vendor?.company || eq.vendor?.name || "—"}</span>
                          <span className="text-border-strong">·</span>
                          <span>HW {eq._count.hardware}</span>
                          <span className="text-border-strong">·</span>
                          <span>SW {eq._count.software}</span>
                          <span className="text-border-strong">·</span>
                          <span>DFD {eq.dfdDiagram ? <span className="text-safety-low">✓</span> : "—"}</span>
                        </p>
                      </Link>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Link href={`/project/${projectId}/inventory?equipmentId=${eq.id}`}
                          className="h-7 px-2 rounded-md text-[10px] font-semibold text-text-tertiary border border-border hover:text-brand hover:border-brand/30 transition-all flex items-center gap-1">
                          <Cpu size={10} /> {tx(locale, "Assets", "자산", "資産")}
                        </Link>
                        <Link href={`/project/${projectId}/assess?equipmentId=${eq.id}`}
                          className="h-7 px-2 rounded-md text-[10px] font-semibold text-text-tertiary border border-border hover:text-brand hover:border-brand/30 transition-all flex items-center gap-1">
                          <Shield size={10} /> {tx(locale, "Assess", "평가", "評価")}
                        </Link>
                        {canReview && isSubmittedEq && (
                          <>
                            <Button size="sm" onClick={() => { setReviewTarget(eq); setReviewAction("APPROVED"); }} className="h-7 text-[11px] px-2.5">
                              <ThumbsUp size={12} /> {tx(locale, "Approve", "승인", "承認")}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setReviewTarget(eq); setReviewAction("REVISION_REQUESTED"); }} className="h-7 text-[11px] px-2.5">
                              <MessageSquare size={12} /> {tx(locale, "Revise", "수정", "修正")}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </motion.div>

      {/* Review dialog */}
      <Dialog
        open={!!reviewTarget && !!reviewAction}
        onClose={() => { setReviewTarget(null); setReviewAction(null); setReviewNote(""); }}
        title={reviewAction === "APPROVED" ? (tx(locale, "Approve", "기자재 승인", "機器承認")) : (tx(locale, "Request Revision", "수정 요청", "修正依頼"))}
        description={`${reviewTarget?.name} — ${reviewTarget?.vendor?.company || ""}`}
      >
        <div className="space-y-4">
          <Textarea
            label={tx(locale, "Review Comment", "검토 의견", "審査コメント")}
            placeholder={reviewAction === "APPROVED" ? (tx(locale, "Comment (optional)", "승인 의견 (선택)", "コメント（任意）")) : (tx(locale, "Describe revisions needed", "수정 사항을 입력하세요", "修正事項を入力してください"))}
            rows={4} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)}
          />
          {reviewAction === "REVISION_REQUESTED" && !reviewNote.trim() && (
            <p className="text-[11px] text-safety-high">{tx(locale, "Please provide feedback", "수정 요청 시 의견을 입력해주세요", "修正依頼時にコメントを入力してください")}</p>
          )}
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => { setReviewTarget(null); setReviewAction(null); }}>{tx(locale, "Cancel", "취소", "キャンセル")}</Button>
            <Button
              variant={reviewAction === "APPROVED" ? "primary" : "danger"}
              loading={saving}
              disabled={reviewAction === "REVISION_REQUESTED" && !reviewNote.trim()}
              onClick={handleReview}
            >
              {reviewAction === "APPROVED" ? (tx(locale, "Approve", "승인", "承認")) : (tx(locale, "Request Revision", "수정 요청", "修正依頼"))}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
