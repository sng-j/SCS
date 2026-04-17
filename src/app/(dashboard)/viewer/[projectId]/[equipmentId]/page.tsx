"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Eye, Cpu, Package, FileText, Network, ClipboardCheck,
  ChevronDown, ChevronRight, Download,
  CheckCircle, XCircle, AlertCircle, MinusCircle, Clock,
  X as IconX,
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
}
interface Hardware {
  id: string; name: string; type: string; manufacturer: string | null; model: string | null;
  ipAddress: string | null; macAddress?: string | null; zone: string | null;
  location?: string | null; purpose?: string | null; category?: string | null;
  software?: { id: string; name: string; version: string | null }[];
  _count?: { cveMatches: number };
}
interface Software {
  id: string; name: string; version: string | null; vendor: string | null; swType: string;
  cpe?: string | null; listeningPort?: string | null; purpose?: string | null;
  hardware?: { id: string; name: string } | null;
  _count?: { cveMatches: number };
}
interface Assessment {
  id: string; hardwareId: string; checkId: string; result: string;
  evidence: string | null; note: string | null;
  hardware?: { id: string; name: string; type: string };
}
interface Doc {
  id: string; docType: string; title: string; standard: string;
  status: string; version: number; generatedAt: string | null; updatedAt: string;
}

const TABS = ["summary", "inventory", "assessment", "documents"] as const;
type Tab = typeof TABS[number];

const RESULT_META: Record<string, {
  icon: React.ElementType; color: string; bg: string;
  label: { en: string; ko: string; ja: string };
}> = {
  PASS:           { icon: CheckCircle, color: "#24A148", bg: "#E6F7EF", label: { en: "Pass",        ko: "합격",     ja: "合格" } },
  FAIL:           { icon: XCircle,     color: "#DA1E28", bg: "#FFF1F1", label: { en: "Fail",        ko: "불합격",    ja: "不合格" } },
  PARTIAL:        { icon: AlertCircle, color: "#EB6200", bg: "#FFF3E0", label: { en: "Partial",     ko: "일부",      ja: "一部" } },
  NOT_APPLICABLE: { icon: MinusCircle, color: "#8D8D8D", bg: "#F4F4F4", label: { en: "N/A",         ko: "해당없음",  ja: "N/A" } },
  NOT_CHECKED:    { icon: Clock,       color: "#A8A8A8", bg: "#F4F4F4", label: { en: "Not Checked", ko: "미점검",    ja: "未点検" } },
};

const STATUS_META: Record<string, {
  label: { en: string; ko: string; ja: string }; color: string; bg: string;
}> = {
  APPROVED:           { label: { en: "Approved",    ko: "승인됨",    ja: "承認済み" }, color: "#24A148", bg: "#E6F7EF" },
  SUBMITTED:          { label: { en: "Submitted",   ko: "제출됨",    ja: "提出済み" }, color: "#EB6200", bg: "#FFF3E0" },
  IN_PROGRESS:        { label: { en: "In Progress", ko: "진행 중",   ja: "進行中"   }, color: "#0F62FE", bg: "#EDF5FF" },
  REVISION_REQUESTED: { label: { en: "Revision",    ko: "수정 요청", ja: "修正依頼" }, color: "#DA1E28", bg: "#FFF1F1" },
  PENDING:            { label: { en: "Pending",     ko: "대기",      ja: "保留中"   }, color: "#8D8D8D", bg: "#F4F4F4" },
};

function signalColor(pct: number) {
  if (pct >= 80) return "var(--color-safety-low)";
  if (pct >= 50) return "var(--color-safety-elevated)";
  if (pct >= 20) return "var(--color-safety-moderate)";
  return "var(--color-safety-high)";
}

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
  const [expandedAssessment, setExpandedAssessment] = useState<string | null>(null);
  const [expandedHw, setExpandedHw] = useState<string | null>(null);
  const [expandedSw, setExpandedSw] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<Doc | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const openPreview = async (d: Doc) => {
    setPreviewDoc(d); setPreviewHtml(null); setPreviewLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/documents/${d.id}/preview`);
      if (res.ok) setPreviewHtml(await res.text());
      else setPreviewHtml(`<div style="padding:2rem;color:#666">Preview failed (${res.status})</div>`);
    } catch {
      setPreviewHtml(`<div style="padding:2rem;color:#666">Preview error</div>`);
    } finally { setPreviewLoading(false); }
  };
  const closePreview = () => { setPreviewDoc(null); setPreviewHtml(null); };

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
      <div className="max-w-2xl mx-auto px-6 py-8">
        <EmptyState icon={Package} title={tx(locale, "Equipment not found", "기자재를 찾을 수 없습니다", "機器が見つかりません")} />
      </div>
    );
  }

  const assessPass = assessments.filter((a) => a.result === "PASS").length;
  const assessFail = assessments.filter((a) => a.result === "FAIL" || a.result === "PARTIAL").length;
  const assessNA = assessments.filter((a) => a.result === "NOT_APPLICABLE").length;
  const assessUnchecked = assessments.filter((a) => a.result === "NOT_CHECKED").length;
  const judged = assessPass + assessFail;
  const assessPct = judged > 0 ? Math.round((assessPass / judged) * 100) : 0;

  const st = STATUS_META[equipment.status] || STATUS_META.PENDING;

  const tabLabels: Record<Tab, { en: string; ko: string; ja: string; icon: React.ElementType }> = {
    summary:    { en: "Summary",    ko: "요약",      ja: "サマリー", icon: Eye },
    inventory:  { en: "Inventory",  ko: "자산 목록", ja: "資産",    icon: Cpu },
    assessment: { en: "Assessment", ko: "보안 평가", ja: "評価",    icon: ClipboardCheck },
    documents:  { en: "Documents",  ko: "문서",      ja: "文書",    icon: FileText },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-[1200px] mx-auto px-6 py-8 space-y-5"
    >
      {/* Back link */}
      <Link
        href={`/viewer/${projectId}`}
        className="inline-flex items-center gap-1 text-body-xs text-text-tertiary hover:text-brand transition-colors"
      >
        <ArrowLeft size={14} /> {project?.vesselName || tx(locale, "Vessel", "선박", "船舶")}
      </Link>

      {/* Equipment header */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-surface text-text-tertiary text-[10px] font-bold uppercase tracking-wider">
            <Eye size={10} /> {tx(locale, "Viewer Mode", "뷰어 모드", "閲覧モード")}
          </span>
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold"
            style={{ backgroundColor: st.bg, color: st.color }}
          >
            {st.label[locale as "en" | "ko" | "ja"] || st.label.en}
          </span>
        </div>
        <h1 className="text-h4 font-extrabold text-text">{equipment.name}</h1>
        <p className="text-body-sm text-text-tertiary mt-1">
          {equipment.vendor?.company || equipment.vendor?.name || tx(locale, "No vendor", "벤더 미배정", "ベンダーなし")}
          {` · HW ${equipment._count.hardware} · SW ${equipment._count.software}`}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-surface-secondary rounded-[8px] w-full sm:w-fit overflow-x-auto scrollbar-none">
        {TABS.map((tab) => {
          const t = tabLabels[tab];
          const Icon = t.icon;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-3 py-1.5 rounded-[6px] text-body-sm font-medium transition-all inline-flex items-center gap-1.5",
                activeTab === tab ? "bg-white text-text shadow-xs" : "text-text-tertiary hover:text-text-secondary"
              )}
            >
              <Icon size={12} /> {t[locale as "en" | "ko" | "ja"] || t.en}
            </button>
          );
        })}
      </div>

      {/* ── SUMMARY ── */}
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
              <p className="text-[22px] font-extrabold tabular-nums" style={{ color: signalColor(assessPct) }}>
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

      {/* ── INVENTORY ── */}
      {activeTab === "inventory" && (
        <div className="space-y-4">
          {/* Hardware */}
          <div>
            <h3 className="text-body-sm font-bold text-text mb-2 px-1">
              {tx(locale, `Hardware (${hardware.length})`, `하드웨어 (${hardware.length}개)`, `ハードウェア (${hardware.length})`)}
            </h3>
            {hardware.length === 0 ? (
              <Card><CardBody><p className="text-body-xs text-text-tertiary text-center py-4">{tx(locale, "No hardware registered", "등록된 하드웨어가 없습니다", "なし")}</p></CardBody></Card>
            ) : (
              <Card padding="none">
                <div className="divide-y divide-border">
                  {hardware.map((hw) => {
                    const isExpanded = expandedHw === hw.id;
                    return (
                      <div key={hw.id}>
                        <button
                          onClick={() => setExpandedHw(isExpanded ? null : hw.id)}
                          className="w-full flex items-center gap-3 px-5 py-3 hover:bg-surface-secondary/30 transition-colors text-left"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-body-sm font-semibold text-text truncate">{hw.name}</p>
                              {hw.category && (
                                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-brand-lighter text-brand shrink-0">
                                  {hw.category}
                                </span>
                              )}
                              {(hw._count?.cveMatches ?? 0) > 0 && (
                                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-risk-bg text-safety-high shrink-0">
                                  {hw._count?.cveMatches} CVE
                                </span>
                              )}
                            </div>
                            <p className="text-body-xs text-text-tertiary mt-0.5">
                              {hw.type} · {[hw.manufacturer, hw.model].filter(Boolean).join(" ") || "—"}
                              {hw.ipAddress && ` · IP ${hw.ipAddress}`}
                              {hw.zone && ` · ${hw.zone}`}
                            </p>
                          </div>
                          {isExpanded ? <ChevronDown size={14} className="text-text-tertiary shrink-0" /> : <ChevronRight size={14} className="text-text-tertiary shrink-0" />}
                        </button>
                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="px-5 pb-4 bg-surface-secondary/30">
                                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] pt-3">
                                  <DetailRow label={tx(locale, "Type", "유형", "タイプ")} value={hw.type} />
                                  <DetailRow label={tx(locale, "Manufacturer", "제조사", "製造元")} value={hw.manufacturer} />
                                  <DetailRow label={tx(locale, "Model", "모델", "モデル")} value={hw.model} />
                                  <DetailRow label={tx(locale, "IP Address", "IP 주소", "IPアドレス")} value={hw.ipAddress} />
                                  <DetailRow label={tx(locale, "MAC Address", "MAC 주소", "MACアドレス")} value={hw.macAddress} />
                                  <DetailRow label={tx(locale, "Zone", "존", "ゾーン")} value={hw.zone} />
                                  <DetailRow label={tx(locale, "Location", "위치", "場所")} value={hw.location} />
                                  <DetailRow label={tx(locale, "Purpose", "용도", "用途")} value={hw.purpose} />
                                </dl>
                                {hw.software && hw.software.length > 0 && (
                                  <div className="mt-3 pt-3 border-t border-border">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-1.5">
                                      {tx(locale, "Installed Software", "설치된 소프트웨어", "インストール済み")}
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                      {hw.software.map((s) => (
                                        <span key={s.id} className="px-2 py-0.5 rounded-md text-[10px] bg-white border border-border text-text-secondary">
                                          {s.name}{s.version && ` v${s.version}`}
                                        </span>
                                      ))}
                                    </div>
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

          {/* Software */}
          <div>
            <h3 className="text-body-sm font-bold text-text mb-2 px-1">
              {tx(locale, `Software (${software.length})`, `소프트웨어 (${software.length}개)`, `ソフトウェア (${software.length})`)}
            </h3>
            {software.length === 0 ? (
              <Card><CardBody><p className="text-body-xs text-text-tertiary text-center py-4">{tx(locale, "No software registered", "등록된 소프트웨어가 없습니다", "なし")}</p></CardBody></Card>
            ) : (
              <Card padding="none">
                <div className="divide-y divide-border">
                  {software.map((sw) => {
                    const isExpanded = expandedSw === sw.id;
                    return (
                      <div key={sw.id}>
                        <button
                          onClick={() => setExpandedSw(isExpanded ? null : sw.id)}
                          className="w-full flex items-center gap-3 px-5 py-3 hover:bg-surface-secondary/30 transition-colors text-left"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-body-sm font-semibold text-text truncate">
                                {sw.name} {sw.version && <span className="text-body-xs font-normal text-text-tertiary">v{sw.version}</span>}
                              </p>
                              <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-surface-secondary text-text-secondary shrink-0">
                                {sw.swType}
                              </span>
                              {(sw._count?.cveMatches ?? 0) > 0 && (
                                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-risk-bg text-safety-high shrink-0">
                                  {sw._count?.cveMatches} CVE
                                </span>
                              )}
                            </div>
                            <p className="text-body-xs text-text-tertiary mt-0.5">
                              {sw.vendor || "—"}
                              {sw.hardware?.name && ` · ${tx(locale, "on", "에 설치", "に")} ${sw.hardware.name}`}
                              {sw.listeningPort && ` · port ${sw.listeningPort}`}
                            </p>
                          </div>
                          {isExpanded ? <ChevronDown size={14} className="text-text-tertiary shrink-0" /> : <ChevronRight size={14} className="text-text-tertiary shrink-0" />}
                        </button>
                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="px-5 pb-4 bg-surface-secondary/30">
                                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] pt-3">
                                  <DetailRow label={tx(locale, "Type", "유형", "タイプ")} value={sw.swType} />
                                  <DetailRow label={tx(locale, "Version", "버전", "バージョン")} value={sw.version} />
                                  <DetailRow label={tx(locale, "Vendor", "벤더", "ベンダー")} value={sw.vendor} />
                                  <DetailRow label="CPE" value={sw.cpe} />
                                  <DetailRow label={tx(locale, "Listening Port", "리스닝 포트", "待受ポート")} value={sw.listeningPort} />
                                  <DetailRow label={tx(locale, "Purpose", "용도", "用途")} value={sw.purpose} />
                                  <DetailRow label={tx(locale, "Installed On", "설치 장비", "インストール機器")} value={sw.hardware?.name} />
                                  <DetailRow label={tx(locale, "CVE Matches", "CVE 매칭", "CVE一致")} value={String(sw._count?.cveMatches ?? 0)} />
                                </dl>
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
        </div>
      )}

      {/* ── ASSESSMENT ── */}
      {activeTab === "assessment" && (
        <div>
          {assessments.length === 0 ? (
            <Card><CardBody><EmptyState icon={ClipboardCheck} title={tx(locale, "No assessments", "평가 결과가 없습니다", "評価がありません")} /></CardBody></Card>
          ) : (
            <Card padding="none">
              <div className="divide-y divide-border">
                {assessments.map((a) => {
                  const r = RESULT_META[a.result] || RESULT_META.NOT_CHECKED;
                  const Icon = r.icon;
                  const isExpanded = expandedAssessment === a.id;
                  const hasDetails = a.evidence || a.note;
                  return (
                    <div key={a.id}>
                      <button
                        onClick={() => hasDetails && setExpandedAssessment(isExpanded ? null : a.id)}
                        disabled={!hasDetails}
                        className={cn(
                          "w-full flex items-center gap-3 px-5 py-3 text-left transition-colors",
                          hasDetails ? "hover:bg-surface-secondary/30 cursor-pointer" : "cursor-default"
                        )}
                      >
                        <Icon size={16} style={{ color: r.color }} className="shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono font-bold text-text-tertiary">{a.checkId}</span>
                            <span className="text-body-sm font-semibold text-text truncate">{a.hardware?.name || "—"}</span>
                          </div>
                        </div>
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0"
                          style={{ backgroundColor: r.bg, color: r.color }}
                        >
                          {r.label[locale as "en" | "ko" | "ja"] || r.label.en}
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
                            <div className="px-5 pb-4 ml-7 space-y-2 bg-surface-secondary/30">
                              {a.evidence && (
                                <div className="pt-3">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-1">{tx(locale, "Evidence", "근거", "証拠")}</p>
                                  <p className="text-body-xs text-text-secondary whitespace-pre-wrap">{a.evidence}</p>
                                </div>
                              )}
                              {a.note && (
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-1">{tx(locale, "Note", "비고", "備考")}</p>
                                  <p className="text-body-xs text-text-secondary whitespace-pre-wrap">{a.note}</p>
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

      {/* ── DOCUMENTS ── */}
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
                    <button onClick={() => openPreview(d)} className="flex-1 min-w-0 text-left group">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-mono font-bold text-text-tertiary">{d.docType}</span>
                        <span className="text-body-sm font-semibold text-text truncate group-hover:text-brand transition-colors">{d.title}</span>
                        <span className="px-1.5 py-0.5 rounded bg-surface-secondary text-[9px] font-bold text-text-tertiary">v{d.version}</span>
                      </div>
                      <p className="text-body-xs text-text-tertiary mt-0.5">
                        {d.standard} · {d.status}
                        {d.generatedAt && ` · ${new Date(d.generatedAt).toLocaleDateString(tx(locale, "en-US", "ko-KR", "ja-JP"))}`}
                      </p>
                    </button>
                    <button
                      onClick={() => openPreview(d)}
                      className="p-1.5 rounded-md text-text-tertiary hover:text-brand hover:bg-brand-lighter transition-colors shrink-0"
                      title={tx(locale, "Preview", "미리보기", "プレビュー")}
                    >
                      <Eye size={14} />
                    </button>
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

      {/* Document Preview Modal */}
      <AnimatePresence>
        {previewDoc && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
            onClick={closePreview}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-surface-secondary/50">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={16} className="text-text-tertiary shrink-0" />
                  <span className="text-[11px] font-mono font-bold text-text-tertiary">{previewDoc.docType}</span>
                  <h2 className="text-body-sm font-bold text-text truncate">{previewDoc.title}</h2>
                  <span className="px-1.5 py-0.5 rounded bg-white border border-border text-[9px] font-bold text-text-tertiary">v{previewDoc.version}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={`/api/projects/${projectId}/documents/${previewDoc.id}/download`}
                    className="px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-brand hover:bg-brand-lighter transition-colors inline-flex items-center gap-1"
                  >
                    <Download size={12} /> {tx(locale, "Download", "다운로드", "ダウンロード")}
                  </a>
                  <button
                    onClick={closePreview}
                    className="p-1.5 rounded-md text-text-tertiary hover:text-text hover:bg-surface-secondary transition-colors"
                    title={tx(locale, "Close", "닫기", "閉じる")}
                  >
                    <IconX size={16} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto bg-surface-secondary/20">
                {previewLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-body-xs text-text-tertiary">{tx(locale, "Loading preview...", "미리보기 로딩 중...", "プレビュー読み込み中...")}</div>
                  </div>
                ) : previewHtml ? (
                  <div
                    className="bg-white mx-auto my-6 shadow-sm border border-border max-w-[794px] p-10"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <dt className="text-text-tertiary font-medium">{label}</dt>
      <dd className="text-text-secondary font-mono text-right truncate">{value || "—"}</dd>
    </>
  );
}
