"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, ArrowLeft, Download, Eye, Zap, AlertCircle,
  CheckCircle, Clock, Edit3, Lock, RefreshCw, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkflowSteps } from "@/components/ui/workflow-steps";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonTable } from "@/components/ui/skeleton";
import { TabBar } from "@/components/ui/tab-bar";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/utils";
import {
  E27_DOC_TYPES,
  E26_DOC_TYPES,
  IEC_DOC_TYPES,
  NIST_DOC_TYPES,
  ISO_DOC_TYPES,
  DOC_STANDARDS,
  type DocType,
} from "@/types";

// ─── Types ──────────────────────────────────────────────────────────────────

type DocStatus = "DRAFT" | "GENERATED" | "EDITED" | "FINALIZED";

interface DocumentRecord {
  id: string;
  docType: string;
  standard: string;
  status: DocStatus;
  version: number;
  generatedAt: string | null;
  updatedAt: string;
}

interface Submission {
  id: string;
  phase: string;
  status: string;
  documents: DocumentRecord[];
}

// ─── Status config ───────────────────────────────────────────────────────────

const DOC_STATUS_CONFIG: Record<DocStatus, { label: string; labelEn: string; labelJa: string; color: string; bg: string; icon: React.ElementType<Record<string, unknown>> }> = {
  DRAFT:     { label: "초안",    labelEn: "Draft",     labelJa: "下書き",    color: "#8D8D8D", bg: "#F4F4F4",   icon: Clock },
  GENERATED: { label: "생성됨",  labelEn: "Generated", labelJa: "生成済み",  color: "#0F62FE", bg: "#EDF5FF",   icon: CheckCircle },
  EDITED:    { label: "편집됨",  labelEn: "Edited",    labelJa: "編集済み",  color: "#EB6200", bg: "#FFF3E0",   icon: Edit3 },
  FINALIZED: { label: "완료",    labelEn: "Finalized", labelJa: "完了",     color: "#24A148", bg: "#E6F7EF",   icon: CheckCircle },
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DocumentPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const eqParams = useSearchParams();
  const equipmentId = eqParams.get("equipmentId");
  const { data: session, status: sessionStatus } = useSession();
  const { locale } = useLocaleStore();

  const userRole = (session?.user as { role?: string })?.role || "VENDOR";

  // VENDOR and SUPPORT can generate/edit. SHIPYARD is read-only viewer.
  const canEdit = userRole === "VENDOR" || userRole === "SUPPORT" || userRole === "ADMIN";
  const isShipyardLike = userRole === "SHIPYARD" || userRole === "SUPPORT";

  // VENDOR: E27 only (장비 레벨)
  // SUPPORT/SHIPYARD: E26 + IEC + NIST + ISO (선박/조직 레벨)
  // ADMIN: all 5
  const visibleStandards = DOC_STANDARDS.filter((s) => {
    if (userRole === "ADMIN") return true;
    if (isShipyardLike) return s.id !== "E27";
    return s.id === "E27";
  });

  const [activeTab, setActiveTab] = useState<string>(visibleStandards[0]?.id ?? "E27");
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [bulkGenerating, setBulkGenerating] = useState(false);

  // Load submissions
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/projects/${projectId}/submissions`);
        if (res.ok) {
          const data: Submission[] = await res.json();
          // Use the most recent submission
          if (data.length > 0) setSubmission(data[data.length - 1]);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [projectId]);

  // Find a doc record for a given docType code
  const findDoc = useCallback(
    (code: string): DocumentRecord | undefined => {
      return submission?.documents.find((d) => d.docType === code);
    },
    [submission],
  );

  // Generate a single document
  const handleGenerate = useCallback(
    async (docType: DocType) => {
      const sub = submission || await ensureSubmission();
      if (!sub) return;
      setGenerating((prev) => ({ ...prev, [docType.code]: true }));
      try {
        const res = await fetch(`/api/projects/${projectId}/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            submissionId: sub.id,
            docType: docType.code,
            title: docType.title,
            standard: docType.standard,
            equipmentId: equipmentId || undefined,
          }),
        });
        if (res.ok) {
          const newDoc: DocumentRecord = await res.json();
          setSubmission((prev) =>
            prev
              ? {
                  ...prev,
                  documents: [
                    ...prev.documents.filter((d) => d.docType !== docType.code),
                    newDoc,
                  ],
                }
              : prev,
          );
          showToast.success(
            locale === "ko" ? `${docType.titleKo} 문서가 생성되었습니다` : locale === "ja" ? `${docType.title}が生成されました` : `${docType.title} generated`,
          );
        } else {
          showToast.error(tx(locale, "Failed to generate document", "문서 생성 실패", "文書生成失敗"));
        }
      } finally {
        setGenerating((prev) => ({ ...prev, [docType.code]: false }));
      }
    },
    [projectId, submission, locale],
  );

  // Ensure submission exists (auto-create if needed)
  const ensureSubmission = useCallback(async (): Promise<Submission | null> => {
    if (submission) return submission;
    try {
      const res = await fetch(`/api/projects/${projectId}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "DOCUMENT" }),
      });
      if (res.ok) {
        const created = await res.json();
        setSubmission(created);
        return created;
      }
    } catch { /* silent */ }
    return null;
  }, [submission, projectId]);

  // Bulk generate using server API
  const handleBulkGenerate = useCallback(async () => {
    const sub = await ensureSubmission();
    if (!sub) { showToast.error(tx(locale, "Failed to create submission", "제출 패키지 생성 실패", "提出パッケージ生成失敗")); return; }
    setBulkGenerating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/documents/generate-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: sub.id, standard: activeTab, equipmentId: equipmentId || undefined }),
      });
      if (res.ok) {
        const result = await res.json();
        showToast.success(locale === "ko" ? `${result.generated || 0}개 문서 생성 완료` : locale === "ja" ? `${result.generated || 0}件の文書を生成完了` : `${result.generated || 0} documents generated`);
        // Reload submission to get updated documents
        const subRes = await fetch(`/api/projects/${projectId}/submissions`);
        if (subRes.ok) {
          const subs: Submission[] = await subRes.json();
          if (subs.length > 0) setSubmission(subs[subs.length - 1]);
        }
      } else {
        showToast.error(tx(locale, "Generation failed", "문서 생성 실패", "文書生成失敗"));
      }
    } finally {
      setBulkGenerating(false);
    }
  }, [ensureSubmission, activeTab, projectId, locale]);

  // Download a document
  const handleDownload = useCallback(
    async (doc: DocumentRecord, title: string) => {
      const res = await fetch(
        `/api/projects/${projectId}/documents/${doc.id}/download`,
      );
      if (!res.ok) {
        showToast.error(tx(locale, "Download failed", "다운로드 실패", "ダウンロード失敗"));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title}-v${doc.version}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [projectId, locale],
  );

  // 조선소도 이제 메인 탭 뷰 사용 (E26 + IEC + NIST + ISO)


  // ─── Render ────────────────────────────────────────────────────────────────

  if (sessionStatus === "loading" || loading) {
    return (
      <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-4">
        <SkeletonTable rows={7} />
      </div>
    );
  }

  const DOC_TYPES_BY_STANDARD: Record<string, typeof E27_DOC_TYPES> = {
    E27: E27_DOC_TYPES,
    E26: E26_DOC_TYPES,
    IEC: IEC_DOC_TYPES,
    NIST: NIST_DOC_TYPES,
    ISO: ISO_DOC_TYPES,
  };

  const activeDocTypes = DOC_TYPES_BY_STANDARD[activeTab] ?? E27_DOC_TYPES;
  const generatedCount = activeDocTypes.filter((dt) => findDoc(dt.code)).length;

  const tabs = visibleStandards.map((s) => ({
    id: s.id,
    label: s.id,
    count: (DOC_TYPES_BY_STANDARD[s.id] ?? []).filter((dt) =>
      findDoc(dt.code),
    ).length,
  }));

  return (
    <div>
      <WorkflowSteps currentSegment="document" projectId={projectId} equipmentId={equipmentId} />
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Back */}
        <Link
          href={equipmentId ? `/project/${projectId}/equipment/${equipmentId}` : `/project/${projectId}`}
          className="inline-flex items-center gap-1 text-body-xs text-text-tertiary hover:text-brand transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          {equipmentId ? (tx(locale, "Equipment", "기자재", "機器")) : (tx(locale, "Project", "프로젝트", "プロジェクト"))}
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-brand-lighter to-brand/10 border border-brand/15 flex items-center justify-center shadow-xs">
              <FileText size={22} className="text-brand" />
            </div>
            <div>
              <h1 className="text-h4 font-extrabold text-text tracking-tight">
                {tx(locale, "Document Generation", "문서 생성", "文書生成")}
              </h1>
              <p className="text-body-sm text-text-tertiary mt-0.5">
                {tx(locale, "Auto-generate IACS UR E27/E26 compliance documents", "IACS UR E27/E26 준수 문서를 자동 생성합니다", "IACS UR E27/E26準拠文書を自動生成します")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isShipyard && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-secondary text-[12px] font-semibold text-text-tertiary">
                <Lock size={13} />
                {tx(locale, "Read Only", "읽기 전용", "読み取り専用")}
              </span>
            )}
            {submission && generatedCount > 0 && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const docs = activeDocTypes.map((dt) => findDoc(dt.code)).filter(Boolean);
                    if (docs.length === 0) return;
                    const win = window.open("", "_blank");
                    if (!win) { showToast.error(tx(locale, "Popup blocked", "팝업이 차단되었습니다", "ポップアップがブロックされました")); return; }
                    win.document.write(`<html><head><title>${tx(locale, "Preview All", "전체 미리보기", "全てプレビュー")}</title></head><body><p style="font-family:system-ui;text-align:center;padding:40px;color:#8D8D8D">${tx(locale, "Loading documents...", "문서를 불러오는 중...", "文書を読み込み中...")}</p></body></html>`);
                    // Fetch all preview HTML and combine
                    const htmlParts: string[] = [];
                    for (const doc of docs) {
                      if (!doc) continue;
                      try {
                        const res = await fetch(`/api/projects/${projectId}/documents/${doc.id}/preview`);
                        if (res.ok) {
                          let html = await res.text();
                          // Extract body content only (between <body> and </body>)
                          const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
                          if (bodyMatch) html = bodyMatch[1];
                          // Remove individual print buttons
                          html = html.replace(/<button[^>]*class="[^"]*print-btn[^"]*"[^>]*>[\s\S]*?<\/button>/gi, "");
                          htmlParts.push(html);
                        }
                      } catch { /* skip failed docs */ }
                    }
                    // Use the first doc's full preview page as base, then append others
                    // Fetch each doc's full preview HTML (same style as single preview)
                    const fullPages: string[] = [];
                    for (const doc of docs) {
                      if (!doc) continue;
                      try {
                        const res = await fetch(`/api/projects/${projectId}/documents/${doc.id}/preview`);
                        if (res.ok) fullPages.push(await res.text());
                      } catch { /* skip */ }
                    }
                    if (fullPages.length === 0) { win.close(); return; }

                    // Take the first page's full HTML as base (includes <head> styles)
                    const baseHtml = fullPages[0];
                    // Extract <head> content from first page
                    const headMatch = baseHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
                    const headContent = headMatch ? headMatch[1] : "";
                    // Extract <body> content from all pages
                    const bodies = fullPages.map((html) => {
                      const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
                      return bodyMatch ? bodyMatch[1] : html;
                    });

                    win.document.open();
                    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${activeTab} ${tx(locale, "Preview All", "전체 미리보기", "全てプレビュー")}</title>${headContent}
<style>.doc-divider{border:none;border-top:3px solid #0F62FE;margin:60px 0 40px;page-break-before:always}@media print{.doc-divider{margin:20px 0;border-top:1px solid #ccc}}</style>
</head><body>`);
                    bodies.forEach((body, i) => {
                      if (i > 0) win.document.write('<hr class="doc-divider">');
                      win.document.write(body);
                    });
                    win.document.write("</body></html>");
                    win.document.close();
                  }}
                >
                  <Eye size={14} />
                  {tx(locale, "Preview All", "전체 미리보기", "全てプレビュー")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    window.location.href = `/api/projects/${projectId}/documents/bundle?submissionId=${submission.id}`;
                  }}
                >
                  <Download size={14} />
                  {tx(locale, "Download All (ZIP)", "전체 다운로드 (ZIP)", "全てダウンロード (ZIP)")}
                </Button>
              </>
            )}
            {canEdit && (
              <Button
                size="sm"
                variant="primary"
                loading={bulkGenerating}
                onClick={handleBulkGenerate}
              >
                <Zap size={14} />
                {tx(locale, "Generate All", "일괄 생성", "一括生成")}
              </Button>
            )}
          </div>
        </div>

        {/* No submission guard */}
        {!submission ? (
          <EmptyState
            icon={AlertCircle}
            title={tx(locale, "No submission found", "제출 정보가 없습니다", "提出情報がありません")}
            subtitle={
              tx(locale, "Create a submission first before generating documents", "문서를 생성하려면 먼저 제출 정보를 등록하세요", "文書を生成するにはまず提出情報を登録してください")
            }
            action={
              <Link href={`/project/${projectId}/submit`}>
                <Button size="sm" variant="outline">
                  {tx(locale, "Go to Submit", "제출 페이지로 이동", "提出ページへ移動")}
                </Button>
              </Link>
            }
          />
        ) : (
          <>
            {/* Progress summary */}
            <div className="flex items-center gap-4 mb-6 p-4 rounded-xl bg-brand-lighter/40 border border-brand/10">
              <div className="h-10 w-10 rounded-xl bg-white border border-brand/15 flex items-center justify-center shrink-0 shadow-xs">
                <CheckCircle size={18} className={generatedCount === activeDocTypes.length && generatedCount > 0 ? "text-safety-low" : "text-brand"} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[13px] font-bold text-text">
                    {tx(locale, "Document Progress", "문서 생성 진행률", "文書生成進捗")}
                  </p>
                  <span className="text-[12px] font-bold text-brand">
                    {locale === "ko" ? `${generatedCount}/${activeDocTypes.length} 생성됨` : locale === "ja" ? `${generatedCount}/${activeDocTypes.length} 生成済み` : `${generatedCount}/${activeDocTypes.length} generated`}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/70 border border-brand/10 overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${generatedCount === activeDocTypes.length && generatedCount > 0 ? "bg-safety-low" : "bg-brand"}`}
                    initial={{ width: 0 }}
                    animate={{
                      width: `${activeDocTypes.length > 0 ? (generatedCount / activeDocTypes.length) * 100 : 0}%`,
                    }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
              </div>
            </div>

            {/* Standard tabs */}
            {tabs.length > 1 && (
              <TabBar
                tabs={tabs}
                activeTab={activeTab}
                onChange={setActiveTab}
                className="mb-5 w-fit"
              />
            )}

            {/* Document list */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                {activeDocTypes.map((docType) => {
                  const doc = findDoc(docType.code);
                  const isGenerating = generating[docType.code] ?? false;
                  const statusCfg = doc
                    ? (DOC_STATUS_CONFIG[doc.status] ?? DOC_STATUS_CONFIG.GENERATED)
                    : null;

                  return (
                    <Card key={docType.code} padding="none" className={cn(
                      "transition-all duration-200 hover:shadow-sm",
                      doc ? "border-border" : "border-dashed border-border/70 opacity-80 hover:opacity-100"
                    )}>
                      <div className="flex items-center gap-4 px-5 py-4">
                        {/* Status icon */}
                        <div
                          className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs"
                          style={{ background: statusCfg?.bg ?? "#F4F4F4" }}
                        >
                          {isGenerating
                            ? <div className="h-4 w-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                            : <FileText size={17} style={{ color: statusCfg?.color ?? "#C6C6C6" }} />
                          }
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="font-mono text-[9px] font-bold text-brand bg-brand-lighter px-1.5 py-0.5 rounded border border-brand/15">
                              {docType.code}
                            </span>
                            {statusCfg && (
                              <span
                                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0"
                                style={{ background: statusCfg.bg, color: statusCfg.color }}
                              >
                                <statusCfg.icon size={10} />
                                {locale === "ko" ? statusCfg.label : locale === "ja" ? statusCfg.labelEn : statusCfg.labelEn}
                              </span>
                            )}
                          </div>
                          <p className="text-[13px] font-semibold text-text truncate">
                            {tx(locale, docType.title, docType.titleKo)}
                          </p>
                          {doc && (
                            <p className="text-[11px] text-text-tertiary mt-0.5">
                              v{doc.version} · {doc.generatedAt
                                ? formatDateTime(doc.generatedAt, locale)
                                : formatDateTime(doc.updatedAt, locale)}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {doc ? (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  window.open(`/api/projects/${projectId}/documents/${doc.id}/preview`, "_blank")
                                }
                                title={tx(locale, "Preview", "미리보기", "プレビュー")}
                              >
                                <Eye size={14} />
                                <span className="hidden sm:inline">{tx(locale, "Preview", "미리보기", "プレビュー")}</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDownload(doc, tx(locale, docType.title, docType.titleKo))}
                              >
                                <Download size={14} />
                                <span className="hidden sm:inline">{tx(locale, "Download", "다운로드", "ダウンロード")}</span>
                              </Button>
                              {canEdit && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  loading={isGenerating}
                                  onClick={() => handleGenerate(docType)}
                                  title={tx(locale, "Regenerate", "재생성", "再生成")}
                                >
                                  <RefreshCw size={14} />
                                </Button>
                              )}
                            </>
                          ) : canEdit ? (
                            <Button
                              size="sm"
                              variant="primary"
                              loading={isGenerating}
                              onClick={() => handleGenerate(docType)}
                            >
                              <Zap size={14} />
                              {tx(locale, "Generate", "생성", "生成")}
                            </Button>
                          ) : (
                            <span className="text-[11px] text-text-tertiary italic px-2">
                              {tx(locale, "Not generated", "미생성", "未生成")}
                            </span>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </>
        )}

      </motion.div>
    </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 조선소 전용 E26 문서 뷰
// ═════════════════════════════════════════════════════════════════════════════

function ShipyardDocumentView({ projectId, locale }: { projectId: string; locale: string }) {
  const [project, setProject] = useState<{ vesselName: string; shipowner: string | null; classification: string | null } | null>(null);
  const [e26Data, setE26Data] = useState<{ ready: boolean; documents: { id: string; docType: string; version: number; status: string; createdAt: string }[]; equipmentStatus: { total: number; approved: number } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}`).then(async (r) => r.ok ? r.json() : null),
      fetch(`/api/projects/${projectId}/e26`).then(async (r) => r.ok ? r.json() : null),
    ]).then(([proj, e26]) => {
      setProject(proj);
      setE26Data(e26);
    }).finally(() => setLoading(false));
  }, [projectId]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/e26`, { method: "POST" });
      if (res.ok) {
        showToast.success(tx(locale, "E26 documents generated", "E26 문서 생성 완료", "E26文書生成完了"));
        // Refresh
        const e26 = await fetch(`/api/projects/${projectId}/e26`).then(async (r) => r.ok ? r.json() : null);
        setE26Data(e26);
      } else {
        showToast.error(tx(locale, "Generation failed", "생성 실패", "生成失敗"));
      }
    } finally { setGenerating(false); }
  };

  if (loading) return <div className="max-w-[1000px] mx-auto px-6 py-8"><SkeletonTable rows={5} /></div>;

  const docs = e26Data?.documents || [];
  const hasDocs = docs.length > 0;
  const ready = e26Data?.ready || false;
  const eqStatus = e26Data?.equipmentStatus || { total: 0, approved: 0 };

  const E26_DOC_INFO: Record<string, { title: string; desc: string }> = {
    "E26-ZCD": { title: "Zones & Conduits Diagram", desc: tx(locale, "Network zone/conduit mapping for the vessel", "선박 네트워크 존/도관 매핑", "ネットワークゾーン/コンジット") },
    "E26-INV": { title: "Vessel Asset Inventory", desc: tx(locale, "Complete HW/SW asset list across all equipment", "전체 기자재의 HW/SW 자산 통합 목록", "全機器HW/SW統合リスト") },
    "E26-CRA": { title: "Cyber Risk Assessment", desc: tx(locale, "Ship-level cyber risk assessment report", "선박 레벨 사이버 위험 평가 보고서", "船舶レベルリスク評価") },
    "E26-CSD": { title: "Cyber Security Design Description", desc: tx(locale, "Security architecture & design description", "보안 아키텍처 및 설계 기술서", "セキュリティ設計記述") },
    "E26-CRP": { title: "Cyber Resilience Test Procedure", desc: tx(locale, "Test procedures for cyber resilience verification", "사이버 복원력 검증 시험 절차서", "サイバーレジリエンス試験手順") },
  };

  return (
    <div className="max-w-[1000px] mx-auto px-6 py-8">
      {/* Back */}
      <Link href={`/project/${projectId}`} className="inline-flex items-center gap-1 text-[12px] text-gray-400 hover:text-blue-600 transition-colors mb-6">
        <ArrowLeft size={13} /> {project?.vesselName || "..."} {tx(locale, "overview", "호선 현황", "概要")}
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[22px] font-extrabold text-gray-900 tracking-tight">E26 {tx(locale, "Ship Documents", "선박 문서", "船舶文書")}</h1>
          <p className="text-[13px] text-gray-500 mt-1">
            {project?.vesselName} · {project?.shipowner || "—"} · {project?.classification || "—"}
          </p>
        </div>
        {!hasDocs && ready && (
          <Button loading={generating} onClick={handleGenerate} className="shadow-sm">
            <FileText size={14} /> E26 {tx(locale, "Generate All", "일괄 생성", "一括生成")}
          </Button>
        )}
      </div>

      {/* Status */}
      {!hasDocs && !ready && (
        <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center">
              <Lock size={20} className="text-gray-400" />
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-semibold text-gray-700">{tx(locale, "Not yet available", "아직 생성할 수 없습니다", "まだ生成できません")}</p>
              <p className="text-[12px] text-gray-500 mt-0.5">
                {tx(locale, "All equipment must be approved first.", "모든 기자재가 승인되어야 합니다.", "全機器の承認が必要です。")} ({eqStatus.approved}/{eqStatus.total})
              </p>
              <div className="mt-3 h-2 rounded-full bg-gray-200 overflow-hidden max-w-xs">
                <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${eqStatus.total > 0 ? (eqStatus.approved / eqStatus.total) * 100 : 0}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {!hasDocs && ready && (
        <div className="rounded-xl border border-green-200 bg-green-50/30 p-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-green-100 flex items-center justify-center">
              <CheckCircle size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-green-800">{tx(locale, "Ready to generate", "생성 준비 완료", "生成準備完了")}</p>
              <p className="text-[12px] text-green-600 mt-0.5">
                {tx(locale, "All equipment approved. Click 'Generate All' to create E26 documents.", "모든 기자재가 승인되었습니다. '일괄 생성'을 클릭하세요.", "全機器承認済み。一括生成をクリックしてください。")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Document list */}
      {hasDocs && (
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{tx(locale, "Generated Documents", "생성된 문서", "生成文書")} ({docs.length})</p>
            <Button size="sm" variant="outline" loading={generating} onClick={handleGenerate}>
              <RefreshCw size={12} /> {tx(locale, "Regenerate", "재생성", "再生成")}
            </Button>
          </div>

          {Object.entries(E26_DOC_INFO).map(([code, info]) => {
            const doc = docs.find((d) => d.docType === code);
            return (
              <div key={code} className={cn(
                "bg-white rounded-xl border p-5 transition-all",
                doc ? "border-green-200" : "border-gray-200 opacity-60",
              )}>
                <div className="flex items-center gap-4">
                  <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center shrink-0",
                    doc ? "bg-green-50" : "bg-gray-50")}>
                    <FileText size={20} className={doc ? "text-green-600" : "text-gray-400"} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{code}</span>
                      <h3 className="text-[14px] font-bold text-gray-900">{info.title}</h3>
                      {doc && <CheckCircle size={14} className="text-green-500" />}
                    </div>
                    <p className="text-[12px] text-gray-500 mt-0.5">{info.desc}</p>
                    {doc && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        v{doc.version} · {new Date(doc.createdAt).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US", { year: "numeric", month: "short", day: "numeric" })}
                      </p>
                    )}
                  </div>
                  {doc && (
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => {
                        window.open(`/api/projects/${projectId}/documents/${doc.id}/preview`, "_blank");
                      }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors">
                        <Eye size={13} /> {tx(locale, "Preview", "미리보기", "プレビュー")}
                      </button>
                      <button onClick={() => {
                        window.open(`/api/projects/${projectId}/documents/${doc.id}/download`, "_blank");
                      }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">
                        <Download size={13} /> {tx(locale, "Download", "다운로드", "DL")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-center text-[11px] text-gray-300">IACS UR E26 · Cyber Resilience of Ships</p>
    </div>
  );
}
