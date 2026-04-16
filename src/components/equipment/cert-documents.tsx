"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Upload, Trash2, Download, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface CertDoc {
  id: string;
  docType: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  note: string | null;
  createdAt: string;
  uploader?: { name: string };
}

interface Props {
  projectId: string;
  equipmentId: string;
  canEdit?: boolean;
}

const DOC_TYPES = [
  { value: "TA_CERT", en: "Type Approval Certificate", ko: "TA 인증서", ja: "型式承認証明書", color: "#0F62FE", bg: "#EDF5FF" },
  { value: "CBS_REPORT", en: "CBS Test Report", ko: "CBS 시험 보고서", ja: "CBS試験報告書", color: "#24A148", bg: "#E6F7EF" },
  { value: "TEST_REPORT", en: "Security Test Report", ko: "보안 시험 보고서", ja: "セキュリティ試験報告書", color: "#EB6200", bg: "#FFF3E0" },
  { value: "SECURITY_CONFIG", en: "Security Configuration Guide", ko: "보안 구성 가이드", ja: "セキュリティ構成ガイド", color: "#8A3FFC", bg: "#F6F2FF" },
  { value: "OTHER", en: "Other Document", ko: "기타 문서", ja: "その他文書", color: "#8D8D8D", bg: "#F4F4F4" },
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getDocTypeMeta(type: string) {
  return DOC_TYPES.find((d) => d.value === type) || DOC_TYPES[4];
}

function getFileIcon(mimeType: string) {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("image/")) return "IMG";
  if (mimeType.includes("word")) return "DOC";
  return "FILE";
}

export function CertDocuments({ projectId, equipmentId, canEdit = true }: Props) {
  const { locale } = useLocaleStore();
  const [docs, setDocs] = useState<CertDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState("TA_CERT");
  const [uploadNote, setUploadNote] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const apiBase = `/api/projects/${projectId}/equipment/${equipmentId}/cert-docs`;

  useEffect(() => {
    fetch(apiBase)
      .then(async (r) => { if (r.ok) setDocs(await r.json()); })
      .finally(() => setLoading(false));
  }, [apiBase]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("docType", uploadType);
      if (uploadNote) formData.append("note", uploadNote);

      const res = await fetch(apiBase, { method: "POST", body: formData });
      if (res.ok) {
        const doc = await res.json();
        setDocs((prev) => [doc, ...prev]);
        showToast.success(tx(locale, "Uploaded", "업로드 완료", "アップロード完了"));
        setShowUpload(false);
        setUploadNote("");
      } else {
        showToast.error(tx(locale, "Upload failed", "업로드 실패", "アップロード失敗"));
      }
    } finally { setUploading(false); }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(apiBase, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setDocs((prev) => prev.filter((d) => d.id !== id));
      showToast.success(tx(locale, "Deleted", "삭제됨", "削除済み"));
    }
  };

  return (
    <Card padding="none" className="overflow-hidden">
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpanded(!expanded); }}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-surface-secondary/20 transition-colors cursor-pointer"
      >
        <FileText size={16} className="text-brand shrink-0" />
        <div className="flex-1 text-left">
          <p className="text-[13px] font-bold text-text">
            {tx(locale, "Certification Documents", "인증 문서", "認証文書")}
          </p>
          <p className="text-[10px] text-text-tertiary mt-0.5">
            {docs.length} {tx(locale, "documents", "개 문서", "件の文書")}
          </p>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setShowUpload(!showUpload); setExpanded(true); }}>
            <Plus size={12} /> {tx(locale, "Upload", "업로드", "アップロード")}
          </Button>
        )}
        <ChevronDown size={14} className={cn("text-text-tertiary transition-transform", expanded && "rotate-180")} />
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="border-t border-border">

              {/* Upload form */}
              {showUpload && canEdit && (
                <div className="px-5 py-4 bg-brand-lighter/20 border-b border-border">
                  <div className="flex gap-3 items-end">
                    <div className="flex-1 space-y-2">
                      <label className="text-[10px] font-bold text-text-tertiary uppercase">{tx(locale, "Document Type", "문서 유형", "文書タイプ")}</label>
                      <select value={uploadType} onChange={(e) => setUploadType(e.target.value)}
                        className="h-8 w-full rounded-lg border border-border bg-white px-2.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-brand/30">
                        {DOC_TYPES.map((dt) => (
                          <option key={dt.value} value={dt.value}>{locale === "ko" ? dt.ko : locale === "ja" ? dt.ja : dt.en}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 space-y-2">
                      <label className="text-[10px] font-bold text-text-tertiary uppercase">{tx(locale, "Note (optional)", "메모 (선택)", "メモ（任意）")}</label>
                      <input value={uploadNote} onChange={(e) => setUploadNote(e.target.value)} placeholder={tx(locale, "e.g. Rev.2 updated", "예: Rev.2 수정본", "例: Rev.2更新版")}
                        className="h-8 w-full rounded-lg border border-border bg-white px-2.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-brand/30" />
                    </div>
                    <div>
                      <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.docx" className="hidden"
                        onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }} />
                      <Button size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
                        <Upload size={13} /> {tx(locale, "Select File", "파일 선택", "ファイル選択")}
                      </Button>
                    </div>
                  </div>
                  <p className="text-[10px] text-text-tertiary mt-2">PDF, PNG, JPG, DOCX · Max 50MB</p>
                </div>
              )}

              {/* Document cards */}
              {loading ? (
                <div className="px-5 py-6 text-center text-[12px] text-text-tertiary">{tx(locale, "Loading...", "로딩 중...", "読み込み中...")}</div>
              ) : docs.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <FileText size={24} className="mx-auto text-text-tertiary/50 mb-2" />
                  <p className="text-[12px] text-text-tertiary">{tx(locale, "No documents uploaded yet", "업로드된 문서가 없습니다", "まだ文書がありません")}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
                  {docs.map((doc) => {
                    const meta = getDocTypeMeta(doc.docType);
                    const icon = getFileIcon(doc.mimeType);
                    return (
                      <motion.div key={doc.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                        className="bg-white rounded-xl border border-border p-4 hover:shadow-sm transition-all group">
                        {/* Doc type badge */}
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ color: meta.color, backgroundColor: meta.bg }}>
                            {locale === "ko" ? meta.ko : locale === "ja" ? meta.ja : meta.en}
                          </span>
                          {canEdit && (
                            <button onClick={() => handleDelete(doc.id)}
                              className="p-1 rounded text-text-tertiary/0 group-hover:text-text-tertiary hover:text-safety-high hover:bg-risk-bg transition-all">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>

                        {/* File info */}
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black"
                            style={{ backgroundColor: meta.bg, color: meta.color }}>
                            {icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-semibold text-text truncate">{doc.originalName}</p>
                            <p className="text-[10px] text-text-tertiary mt-0.5">
                              {formatSize(doc.size)} · {doc.uploader?.name || "—"} · {new Date(doc.createdAt).toLocaleDateString(locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US", { month: "short", day: "numeric" })}
                            </p>
                            {doc.note && <p className="text-[10px] text-text-secondary mt-1 italic">{doc.note}</p>}
                          </div>
                        </div>

                        {/* Download */}
                        <div className="mt-3 pt-2 border-t border-border/50">
                          <a href={`/uploads/cert-docs/${doc.filename}`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-[11px] font-medium text-brand hover:text-brand-hover transition-colors">
                            <Download size={12} /> {tx(locale, "Download", "다운로드", "ダウンロード")}
                          </a>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
