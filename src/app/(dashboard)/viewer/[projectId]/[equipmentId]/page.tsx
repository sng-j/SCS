"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Eye, Cpu, Package, FileText, Network, ClipboardCheck,
  ChevronDown, ChevronRight, Download, CheckCircle, XCircle, AlertCircle, MinusCircle, Clock
} from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { SkeletonTable } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Equipment {
  id: string; name: string; status: string;
  vendor: { id: string; name: string; company: string | null } | null;
  _count: { hardware: number; software: number };
  dfdDiagram: { id: string } | null;
  certificationInfo?: string;
}
interface Hardware { id: string; name: string; type: string; manufacturer: string | null; model: string | null; ipAddress: string | null; zone: string | null; }
interface Software { id: string; name: string; version: string | null; vendor: string | null; swType: string; }
interface Assessment { id: string; hardwareId: string; checkId: string; result: string; evidence: string | null; note: string | null; hardware?: { id: string; name: string; type: string }; }
interface Doc { id: string; docType: string; title: string; standard: string; status: string; version: number; generatedAt: string | null; updatedAt: string; }

const TABS = ["summary", "inventory", "assessment", "documents"] as const;
type Tab = typeof TABS[number];

const RESULT_ICONS: Record<string, { icon: React.ElementType; color: string; label: { en: string; ko: string; ja: string } }> = {
  PASS:           { icon: CheckCircle,  color: "#24A148", label: { en: "Pass",   ko: "합격",   ja: "合格" } },
  FAIL:           { icon: XCircle,      color: "#DA1E28", label: { en: "Fail",   ko: "불합격", ja: "不合格" } },
  PARTIAL:        { icon: AlertCircle,  color: "#EB6200", label: { en: "Partial",ko: "일부",   ja: "一部" } },
  NOT_APPLICABLE: { icon: MinusCircle,  color: "#8D8D8D", label: { en: "N/A",    ko: "해당없음",ja: "N/A" } },
  NOT_CHECKED:    { icon: Clock,        color: "#A8A8A8", label: { en: "Not Checked", ko: "미점검", ja: "未点検" } },
};

export default function ViewerEquipmentPage() {
  const { projectId, equipmentId } = useParams<{ projectId: string; equipmentId: string }>();
  const { locale } = useLocaleStore();
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [project, setProject] = useState<{ vesselName: string } | null>(null);
  const [hardware, setHardware] = useState<Hardware[]>([]);
  const [software, setSoftware] = useState<Software[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [loading, setLoading] = useState(true);
  // Level 3 — expansion state for specific rows
  const [expandedAssessment, setExpandedAssessment] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}`).then(async (r) => r.ok ? r.json() : null),
      fetch(`/api/projects/${projectId}/equipment`).then(async (r) => r.ok ? r.json() : []),
      fetch(`/api/projects/${projectId}/hardware?equipmentId=${equipmentId}`).then(async (r) => r.ok ? r.json() : []),
      fetch(`/api/projects/${projectId}/software?equipmentId=${equipmentId}`).then(async (r) => r.ok ? r.json() : []),
      fetch(`/api/projects/${projectId}/assessments?equipmentId=${equipmentId}`).then(async (r) => r.ok ? r.json() : []),
      fetch(`/api/projects/${projectId}/documents?equipmentId=${equipmentId}`).then(async (r) => r.ok ? r.json() : []),
    ]).then(([p, eqs, hw, sw, as, docs]) => {
      setProject(p);
      const list = Array.isArray(eqs) ? eqs : [];
      setEquipment(list.find((e: Equipment) => e.id === equipmentId) || null);
      setHardware(Array.isArray(hw) ? hw : []);
      setSoftware(Array.isArray(sw) ? sw : []);
      setAssessments(Array.isArray(as) ? as : []);
      setDocuments(Array.isArray(docs) ? docs : []);
    }).finally(() => setLoading(false));
  }, [projectId, equipmentId]);

  if (loading) {
    return <div className="max-w-[1200px] mx-auto px-6 py-8"><SkeletonTable rows={6} /></div>;
  }

  if (!equipment) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <EmptyState icon={Package} title={tx(locale, "Equipment not found", "기자재를 찾을 수 없습니다", "機器が見つかりません")} />
      </div>
    );
  }

  const assessPass = assessments.filter((a) => a.result === "PASS").length;
  const assessFail = assessments.filter((a) => a.result === "FAIL" || a.result === "PARTIAL").length;
  const assessNA = assessments.filter((a) => a.result === "NOT_APPLICABLE").length;
  const assessUnchecked = assessments.filter((a) => a.result === "NOT_CHECKED").length;
  const assessPct = assessments.length > 0 ? Math.round((assessPass / assessments.length) * 100) : 0;

  const tabLabels: Record<Tab, { en: string; ko: string; ja: string; icon: React.ElementType }> = {
    summary:    { en: "Summary",    ko: "요약",        ja: "サマリー",   icon: Eye },
    inventory:  { en: "Inventory",  ko: "자산 목록",   ja: "資産",      icon: Cpu },
    assessment: { en: "Assessment", ko: "보안 평가",   ja: "評価",      icon: ClipboardCheck },
    documents:  { en: "Documents",  ko: "문서",        ja: "文書",      icon: FileText },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-[1200px] mx-auto px-6 py-8 space-y-5"
    >
      {/* Back */}
      <Link href={`/viewer/${projectId}`} className="inline-flex items-center gap-1 text-[12px] text-text-tertiary hover:text-brand transition-colors">
        <ArrowLeft size={14} /> {project?.vesselName || tx(locale, "Vessel", "선박", "船舶")}
      </Link>

      {/* Equipment header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1">
            <Eye size={10} /> {tx(locale, "Viewer Mode", "뷰어 모드", "閲覧モード")}
          </span>
          <StatusBadge status={equipment.status} locale={locale} />
        </div>
        <h1 className="text-[24px] font-extrabold text-text">{equipment.name}</h1>
        <p className="text-[13px] text-text-tertiary mt-0.5">
          {equipment.vendor?.company || equipment.vendor?.name || tx(locale, "No vendor", "벤더 미배정", "ベンダーなし")}
          {` · HW ${equipment._count.hardware} · SW ${equipment._count.software}`}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-surface-secondary rounded-[8px] w-fit">
        {TABS.map((tab) => {
          const t = tabLabels[tab];
          const Icon = t.icon;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-all inline-flex items-center gap-1.5",
                activeTab === tab ? "bg-white text-text shadow-xs" : "text-text-tertiary hover:text-text-secondary"
              )}
            >
              <Icon size={12} /> {t[locale as keyof typeof t] || t.en}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "summary" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardBody>
              <div className="flex items-center gap-2 mb-2">
                <Cpu size={14} className="text-text-tertiary" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
                  {tx(locale, "Inventory", "자산 목록", "資産")}
                </p>
              </div>
              <p className="text-[22px] font-extrabold text-text tabular-nums">
                {hardware.length} <span className="text-[12px] font-medium text-text-tertiary">HW</span>
                {" · "}
                {software.length} <span className="text-[12px] font-medium text-text-tertiary">SW</span>
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="flex items-center gap-2 mb-2">
                <ClipboardCheck size={14} className="text-text-tertiary" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
                  {tx(locale, "Assessment Results", "보안 평가 결과", "評価結果")}
                </p>
              </div>
              <p className="text-[22px] font-extrabold tabular-nums" style={{ color: assessPct >= 80 ? "#24A148" : assessPct >= 50 ? "#EB6200" : "#DA1E28" }}>
                {assessPct}% <span className="text-[12px] font-medium text-text-tertiary">pass</span>
              </p>
              <p className="text-[11px] text-text-tertiary mt-1">
                ✓ {assessPass} · ✗ {assessFail} · N/A {assessNA} · {tx(locale, "unchecked", "미점검", "未点検")} {assessUnchecked}
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="flex items-center gap-2 mb-2">
                <FileText size={14} className="text-text-tertiary" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
                  {tx(locale, "Documents", "문서", "文書")}
                </p>
              </div>
              <p className="text-[22px] font-extrabold text-text tabular-nums">
                {documents.length}
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="flex items-center gap-2 mb-2">
                <Network size={14} className="text-text-tertiary" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
                  {tx(locale, "Data Flow Diagram", "DFD", "DFD")}
                </p>
              </div>
              <p className="text-[14px] font-bold text-text">
                {equipment.dfdDiagram
                  ? tx(locale, "Defined ✓", "정의됨 ✓", "定義済み ✓")
                  : tx(locale, "Not defined", "정의되지 않음", "未定義")}
              </p>
            </CardBody>
          </Card>
        </div>
      )}

      {activeTab === "inventory" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-[12px] font-bold text-text mb-2 px-1">{tx(locale, `Hardware (${hardware.length})`, `하드웨어 (${hardware.length}개)`, `ハードウェア (${hardware.length})`)}</h3>
            {hardware.length === 0 ? (
              <Card><CardBody><p className="text-[12px] text-text-tertiary text-center py-4">{tx(locale, "No hardware registered", "등록된 하드웨어가 없습니다", "なし")}</p></CardBody></Card>
            ) : (
              <Card padding="none">
                <div className="divide-y divide-border">
                  {hardware.map((hw) => (
                    <div key={hw.id} className="px-5 py-3">
                      <p className="text-[13px] font-semibold text-text">{hw.name}</p>
                      <p className="text-[11px] text-text-tertiary mt-0.5">
                        {hw.type} · {[hw.manufacturer, hw.model].filter(Boolean).join(" ") || "—"}
                        {hw.ipAddress && ` · IP ${hw.ipAddress}`}
                        {hw.zone && ` · ${hw.zone}`}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
          <div>
            <h3 className="text-[12px] font-bold text-text mb-2 px-1">{tx(locale, `Software (${software.length})`, `소프트웨어 (${software.length}개)`, `ソフトウェア (${software.length})`)}</h3>
            {software.length === 0 ? (
              <Card><CardBody><p className="text-[12px] text-text-tertiary text-center py-4">{tx(locale, "No software registered", "등록된 소프트웨어가 없습니다", "なし")}</p></CardBody></Card>
            ) : (
              <Card padding="none">
                <div className="divide-y divide-border">
                  {software.map((sw) => (
                    <div key={sw.id} className="px-5 py-3">
                      <p className="text-[13px] font-semibold text-text">
                        {sw.name} {sw.version && <span className="text-[11px] text-text-tertiary">v{sw.version}</span>}
                      </p>
                      <p className="text-[11px] text-text-tertiary mt-0.5">
                        {sw.swType}{sw.vendor && ` · ${sw.vendor}`}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {activeTab === "assessment" && (
        <div>
          {assessments.length === 0 ? (
            <Card><CardBody><EmptyState icon={ClipboardCheck} title={tx(locale, "No assessments", "평가 결과가 없습니다", "評価がありません")} /></CardBody></Card>
          ) : (
            <Card padding="none">
              <div className="divide-y divide-border">
                {assessments.map((a) => {
                  const r = RESULT_ICONS[a.result] || RESULT_ICONS.NOT_CHECKED;
                  const Icon = r.icon;
                  const isExpanded = expandedAssessment === a.id;
                  const hasDetails = a.evidence || a.note;
                  return (
                    <div key={a.id}>
                      <button
                        onClick={() => hasDetails && setExpandedAssessment(isExpanded ? null : a.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-5 py-3 text-left transition-colors",
                          hasDetails ? "hover:bg-surface-secondary/30 cursor-pointer" : "cursor-default"
                        )}
                      >
                        <Icon size={16} style={{ color: r.color }} className="shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono font-bold text-text-tertiary">{a.checkId}</span>
                            <span className="text-[13px] font-semibold text-text truncate">{a.hardware?.name || "—"}</span>
                          </div>
                        </div>
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0"
                          style={{ backgroundColor: `${r.color}15`, color: r.color }}
                        >
                          {r.label[locale as keyof typeof r.label] || r.label.en}
                        </span>
                        {hasDetails && (isExpanded ? <ChevronDown size={14} className="text-text-tertiary" /> : <ChevronRight size={14} className="text-text-tertiary" />)}
                      </button>
                      <AnimatePresence initial={false}>
                        {isExpanded && hasDetails && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="px-5 pb-3 ml-7 space-y-1.5">
                              {a.evidence && (
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">{tx(locale, "Evidence", "근거", "証拠")}</p>
                                  <p className="text-[12px] text-text-secondary whitespace-pre-wrap">{a.evidence}</p>
                                </div>
                              )}
                              {a.note && (
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">{tx(locale, "Note", "비고", "備考")}</p>
                                  <p className="text-[12px] text-text-secondary whitespace-pre-wrap">{a.note}</p>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      )}

      {activeTab === "documents" && (
        <div>
          {documents.length === 0 ? (
            <Card><CardBody><EmptyState icon={FileText} title={tx(locale, "No documents generated yet", "생성된 문서가 없습니다", "生成された文書がありません")} /></CardBody></Card>
          ) : (
            <Card padding="none">
              <div className="divide-y divide-border">
                {documents.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-secondary/30 transition-colors">
                    <FileText size={16} className="text-text-tertiary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono font-bold text-text-tertiary">{d.docType}</span>
                        <span className="text-[13px] font-semibold text-text truncate">{d.title}</span>
                        <span className="px-1.5 py-0.5 rounded bg-surface-secondary text-[9px] font-bold text-text-tertiary">v{d.version}</span>
                      </div>
                      <p className="text-[11px] text-text-tertiary mt-0.5">
                        {d.standard} · {d.status}
                        {d.generatedAt && ` · ${new Date(d.generatedAt).toLocaleDateString(tx(locale, "en-US", "ko-KR", "ja-JP"))}`}
                      </p>
                    </div>
                    <a
                      href={`/api/projects/${projectId}/documents/${d.id}/download`}
                      className="p-1.5 rounded-md text-text-tertiary hover:text-brand hover:bg-brand-lighter transition-colors shrink-0"
                      title={tx(locale, "Download", "다운로드", "ダウンロード")}
                    >
                      <Download size={14} />
                    </a>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </motion.div>
  );
}

function StatusBadge({ status, locale }: { status: string; locale: string }) {
  const map: Record<string, { bg: string; color: string; label: { en: string; ko: string; ja: string } }> = {
    APPROVED:           { bg: "#E6F7EF", color: "#24A148", label: { en: "Approved", ko: "승인됨", ja: "承認済み" } },
    SUBMITTED:          { bg: "#FFF3E0", color: "#EB6200", label: { en: "Submitted", ko: "제출됨", ja: "提出済み" } },
    IN_PROGRESS:        { bg: "#EDF5FF", color: "#0F62FE", label: { en: "In Progress", ko: "진행 중", ja: "進行中" } },
    REVISION_REQUESTED: { bg: "#FFF1F1", color: "#DA1E28", label: { en: "Revision", ko: "수정 요청", ja: "修正依頼" } },
    PENDING:            { bg: "#F4F4F4", color: "#8D8D8D", label: { en: "Pending", ko: "대기", ja: "保留中" } },
  };
  const s = map[status] || map.PENDING;
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: s.bg, color: s.color }}>
      {s.label[locale as keyof typeof s.label] || s.label.en}
    </span>
  );
}
