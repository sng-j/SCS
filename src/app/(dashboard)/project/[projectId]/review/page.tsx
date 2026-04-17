"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Package, Shield, FileText, Network, ThumbsUp, MessageSquare,
  CheckCircle, XCircle, Cpu, Monitor, Server, Radio, HardDrive,
  ArrowLeft, AlertTriangle, Clock, Eye, Send, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCards } from "@/components/ui/skeleton";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface HwItem { id: string; name: string; type: string; manufacturer: string | null; model: string | null; ipAddress: string | null; zone: string | null; category: string | null; _count: { assessments: number } }
interface SwItem { id: string; name: string; version: string | null; swType: string; vendor: string | null }
interface DocItem { id: string; docType: string; title: string; version: number; status: string }
interface AssessItem { id: string; checkId: string; result: string; hardwareId: string }
interface DfdItem { id: string; source: string }

interface EqDetail {
  id: string; name: string; status: string; description: string | null;
  vendor?: { name: string; company: string | null };
  certificationInfo?: string | null;
  _count: { hardware: number; software: number };
  dfdDiagram: DfdItem | null;
}

const HW_ICONS: Record<string, React.ElementType<Record<string, unknown>>> = {
  PLC: Cpu, SERVER: Server, SENSOR: Radio, NETWORK_DEVICE: Network, PC: Monitor, OTHER_DEVICE: HardDrive,
};

const STATUS_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  PASS: { color: "#24A148", bg: "#E6F7EF", label: "Pass" },
  FAIL: { color: "#DA1E28", bg: "#FFF1F1", label: "Fail" },
  PARTIAL: { color: "#EB6200", bg: "#FFF3E0", label: "Partial" },
  NOT_APPLICABLE: { color: "#8D8D8D", bg: "#F4F4F4", label: "N/A" },
  NOT_CHECKED: { color: "#C6C6C6", bg: "#F4F4F4", label: "—" },
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const equipmentId = searchParams.get("equipmentId");
  const { data: session } = useSession();
  const { locale } = useLocaleStore();
  const userRole = (session?.user as { role?: string })?.role || "VENDOR";

  const [eq, setEq] = useState<EqDetail | null>(null);
  const [hardware, setHardware] = useState<HwItem[]>([]);
  const [software, setSoftware] = useState<SwItem[]>([]);
  const [assessments, setAssessments] = useState<AssessItem[]>([]);
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewNote, setReviewNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Write (approve/revise): only SUPPORT or ADMIN
  const canReview = (userRole === "SUPPORT" || userRole === "ADMIN") && eq?.status === "SUBMITTED";

  useEffect(() => {
    if (!equipmentId) { setLoading(false); return; }
    Promise.all([
      fetch(`/api/projects/${projectId}/equipment`).then(async (r) => r.ok ? r.json() : []),
      fetch(`/api/projects/${projectId}/hardware?equipmentId=${equipmentId}`).then(async (r) => r.ok ? r.json() : []),
      fetch(`/api/projects/${projectId}/software?equipmentId=${equipmentId}`).then(async (r) => r.ok ? r.json() : []),
      fetch(`/api/projects/${projectId}/assessments`).then(async (r) => r.ok ? r.json() : []),
      fetch(`/api/projects/${projectId}/documents?equipmentId=${equipmentId}`).then(async (r) => r.ok ? r.json() : []),
    ]).then(([eqList, hw, sw, assess, docs]) => {
      const found = (eqList as EqDetail[]).find((e) => e.id === equipmentId);
      if (found) setEq(found);
      setHardware(hw);
      setSoftware(sw);
      setAssessments(assess);
      setDocuments(Array.isArray(docs) ? docs : []);
    }).finally(() => setLoading(false));
  }, [projectId, equipmentId]);

  const handleReview = async (action: "APPROVED" | "REVISION_REQUESTED") => {
    if (!eq) return;
    setSubmitting(true);
    try {
      const certInfo = JSON.stringify({
        ...JSON.parse(eq.certificationInfo || "{}"),
        reviewComment: reviewNote,
        reviewedBy: session?.user?.name || "",
        reviewedAt: new Date().toISOString(),
      });
      const res = await fetch(`/api/projects/${projectId}/equipment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: eq.id, status: action, certificationInfo: certInfo }),
      });
      if (res.ok) {
        setEq({ ...eq, status: action, certificationInfo: certInfo });
        showToast.success(action === "APPROVED"
          ? tx(locale, "Approved!", "승인되었습니다!", "承認されました！")
          : tx(locale, "Revision requested", "수정 요청되었습니다", "修正依頼されました"));
      } else {
        showToast.error(tx(locale, "Action failed", "처리 실패", "処理に失敗しました"));
      }
    } finally { setSubmitting(false); }
  };

  if (!equipmentId) {
    return <div className="max-w-5xl mx-auto px-6 py-8"><EmptyState icon={Eye} title={tx(locale, "Select equipment to review", "검토할 기자재를 선택하세요", "審査する機器を選択してください")} /></div>;
  }

  if (loading) return <div className="max-w-5xl mx-auto px-6 py-8"><SkeletonCards count={4} /></div>;
  if (!eq) return <div className="max-w-5xl mx-auto px-6 py-8"><EmptyState icon={AlertTriangle} title={tx(locale, "Equipment not found", "기자재를 찾을 수 없습니다", "機器が見つかりません")} /></div>;

  const passCount = assessments.filter((a) => a.result === "PASS").length;
  const totalChecks = assessments.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-5xl mx-auto px-6 py-8 space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/project/${projectId}`} className="text-body-xs text-text-tertiary hover:text-brand mb-2 flex items-center gap-1">
            <ArrowLeft size={14} /> {tx(locale, "Back to Project", "프로젝트로 돌아가기", "プロジェクトに戻る")}
          </Link>
          <h1 className="text-h4 font-extrabold text-text">{tx(locale, "Equipment Review", "기자재 검토", "機器審査")}</h1>
          <p className="text-body-sm text-text-tertiary mt-1">{eq.name} · {eq.vendor?.company || eq.vendor?.name || "—"}</p>
        </div>
        <div className={cn("px-3 py-1.5 rounded-lg text-body-xs font-bold",
          eq.status === "APPROVED" ? "bg-green-50 text-green-700" :
          eq.status === "SUBMITTED" ? "bg-orange-50 text-orange-700" :
          "bg-gray-100 text-gray-600"
        )}>
          {eq.status}
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard icon={Package} label={tx(locale, "Hardware", "하드웨어", "ハードウェア")} value={`${hardware.length}`} color="text-brand" />
        <SummaryCard icon={FileText} label={tx(locale, "Software", "소프트웨어", "ソフトウェア")} value={`${software.length}`} color="text-indigo-600" />
        <SummaryCard icon={Shield} label={tx(locale, "Assessment", "보안평가", "セキュリティ評価")} value={`${passCount}/${totalChecks}`} color="text-orange-600" />
        <SummaryCard icon={FileText} label={tx(locale, "Documents", "문서", "文書")} value={`${documents.length}`} color="text-teal-600" />
      </div>

      {/* ── Hardware List ── */}
      <Card padding="none">
        <CardHeader title={tx(locale, "Hardware Assets", "하드웨어 자산", "ハードウェア資産")} subtitle={`${hardware.length} ${tx(locale, "devices", "개 장치", "台")}`} />
        <div className="divide-y divide-border">
          {hardware.length === 0 ? (
            <p className="px-5 py-4 text-body-xs text-text-tertiary italic">{tx(locale, "No hardware registered", "등록된 하드웨어가 없습니다", "ハードウェアがありません")}</p>
          ) : hardware.map((hw) => {
            const Icon = HW_ICONS[hw.type] || HardDrive;
            return (
              <div key={hw.id} className="px-5 py-3 flex items-center gap-3">
                <Icon size={16} className="text-text-tertiary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-body-sm font-semibold text-text truncate">{hw.name}</p>
                  <p className="text-body-xs text-text-tertiary">{hw.manufacturer} · {hw.model} {hw.ipAddress ? `· ${hw.ipAddress}` : ""}</p>
                </div>
                <span className="text-[10px] text-text-tertiary">{hw.zone || "—"}</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-600">Cat {hw.category || "—"}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── DFD Status ── */}
      <Card padding="md">
        <div className="flex items-center gap-3">
          <Network size={18} className={eq.dfdDiagram ? "text-green-600" : "text-gray-400"} />
          <div>
            <p className="text-body-sm font-bold text-text">DFD {tx(locale, "Diagram", "다이어그램", "ダイアグラム")}</p>
            <p className="text-body-xs text-text-tertiary">
              {eq.dfdDiagram
                ? `${tx(locale, "Generated", "생성됨", "生成済み")} (${eq.dfdDiagram.source})`
                : tx(locale, "Not created", "미생성", "未作成")}
            </p>
          </div>
        </div>
      </Card>

      {/* ── Assessment Summary ── */}
      <Card padding="none">
        <CardHeader title={tx(locale, "Security Assessment", "보안평가 결과", "セキュリティ評価結果")} subtitle={`${passCount}/${totalChecks} ${tx(locale, "passed", "통과", "合格")}`} />
        <CardBody>
          <div className="grid grid-cols-5 gap-2">
            {Object.entries(STATUS_COLORS).map(([key, cfg]) => {
              const count = assessments.filter((a) => a.result === key).length;
              return (
                <div key={key} className="text-center p-2 rounded-lg" style={{ background: cfg.bg }}>
                  <p className="text-[18px] font-bold" style={{ color: cfg.color }}>{count}</p>
                  <p className="text-[10px] font-semibold" style={{ color: cfg.color }}>{cfg.label}</p>
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* ── Documents ── */}
      <Card padding="none">
        <CardHeader title={tx(locale, "Generated Documents", "생성된 문서", "生成された文書")} subtitle={`${documents.length} ${tx(locale, "documents", "개 문서", "件")}`} />
        <div className="divide-y divide-border">
          {documents.length === 0 ? (
            <p className="px-5 py-4 text-body-xs text-text-tertiary italic">{tx(locale, "No documents generated", "생성된 문서가 없습니다", "文書がありません")}</p>
          ) : documents.map((doc) => (
            <div key={doc.id} className="px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-text-tertiary" />
                <span className="text-body-xs font-semibold text-text">{doc.title || doc.docType}</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-green-50 text-green-700">v{doc.version}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Review Panel ── */}
      {canReview && (
        <Card padding="none" className="border-brand/20 border-2">
          <CardHeader
            title={tx(locale, "Review Decision", "검토 결정", "審査決定")}
            subtitle={tx(locale, "Approve or request revision for this equipment", "이 기자재를 승인하거나 수정을 요청하세요", "この機器を承認するか修正を依頼してください")}
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
              <Button className="flex-1 h-11" loading={submitting} onClick={() => handleReview("APPROVED")}>
                <ThumbsUp size={16} /> {tx(locale, "Approve", "승인", "承認")}
              </Button>
              <Button variant="danger" className="flex-1 h-11" loading={submitting} onClick={() => handleReview("REVISION_REQUESTED")}>
                <MessageSquare size={16} /> {tx(locale, "Request Revision", "수정 요청", "修正依頼")}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Approved state */}
      {eq.status === "APPROVED" && (
        <Card padding="md" className="border-green-200 bg-green-50">
          <div className="flex items-center gap-3">
            <CheckCircle size={24} className="text-green-600" />
            <div>
              <p className="text-body-sm font-bold text-green-700">{tx(locale, "Approved", "승인 완료", "承認済み")}</p>
              <p className="text-body-xs text-green-600">{tx(locale, "This equipment has been approved and locked.", "이 기자재는 승인되어 잠겨 있습니다.", "この機器は承認され、ロックされています。")}</p>
            </div>
          </div>
        </Card>
      )}
    </motion.div>
  );
}

function SummaryCard({ icon: Icon, label, value, color }: { icon: React.ElementType<Record<string, unknown>>; label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-border p-4 flex items-center gap-3">
      <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center bg-gray-50", color)}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-[20px] font-bold text-text">{value}</p>
        <p className="text-body-xs text-text-tertiary">{label}</p>
      </div>
    </div>
  );
}
