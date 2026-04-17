"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package, Download, Upload, Cpu, CheckCircle, Clock,
  AlertCircle, Send, BookmarkPlus, Layers, Trash2,
  ArrowRight, Bookmark, Server, Radio, Network, Monitor, HardDrive,
  Plus, Search, Pencil,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCards } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface VendorEquipment {
  id: string;
  name: string;
  description: string | null;
  status: string;
  _count: { hardware: number; software: number };
  dfdDiagram: { id: string } | null;
  project?: { id: string; vesselName: string; shipyard?: { name: string } | null };
}

interface Template {
  id: string;
  name: string;
  data: string;
  createdAt: string;
}


interface ParsedTemplateData {
  hardware?: unknown[];
  software?: unknown[];
}

const STATUS_MAP: Record<string, { label: string; labelEn: string; labelJa: string; color: string; bg: string; icon: React.ElementType<Record<string, unknown>> }> = {
  PENDING:            { label: "대기",      labelEn: "Pending",       labelJa: "保留中",    color: "#8D8D8D", bg: "#F4F4F4",  icon: Clock },
  IN_PROGRESS:        { label: "진행 중",   labelEn: "In Progress",   labelJa: "進行中",   color: "#0F62FE", bg: "#EDF5FF",  icon: AlertCircle },
  SUBMITTED:          { label: "제출됨",    labelEn: "Submitted",     labelJa: "提出済み",  color: "#EB6200", bg: "#FFF3E0",  icon: Send },
  UNDER_REVIEW:       { label: "검토 중",   labelEn: "Under Review",  labelJa: "審査中",   color: "#EB6200", bg: "#FFF3E0",  icon: Clock },
  REVISION_REQUESTED: { label: "수정 요청", labelEn: "Revision",      labelJa: "修正依頼",  color: "#DA1E28", bg: "#FFF1F1",  icon: AlertCircle },
  APPROVED:           { label: "승인됨",    labelEn: "Approved",      labelJa: "承認済み",  color: "#24A148", bg: "#E6F7EF",  icon: CheckCircle },
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function VendorPage() {
  const { data: session, status } = useSession();
  const { locale } = useLocaleStore();
  const [tab, setTab] = useState<"equipment" | "library">("equipment");
  const [equipment, setEquipment] = useState<VendorEquipment[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [eqRes, tmplRes] = await Promise.all([
      fetch("/api/dashboard").then(async (r) => r.ok ? (await r.json()).equipment || [] : []),
      fetch("/api/vendor/templates").then(async (r) => r.ok ? await r.json() : []),
    ]);
    setEquipment(eqRes);
    setTemplates(tmplRes);
    setLoading(false);
  }, []);

  useEffect(() => { queueMicrotask(() => fetchAll()); }, [fetchAll]);

  if (status === "loading" || loading) {
    return <div className="max-w-[1200px] mx-auto px-6 py-8"><SkeletonCards count={3} /></div>;
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[18px] font-bold text-text">
          {tx(locale, "Equipment Management", "기자재 관리", "機器管理")}
        </h1>
        <p className="text-[12px] text-text-tertiary mt-0.5">
          {tx(locale, "Manage your equipment and reusable templates.", "기자재를 관리하고 재사용 가능한 템플릿을 활용하세요.", "機器を管理し、再利用可能なテンプレートを活用してください。")}
        </p>
      </div>

      {/* Tabs (underline style) */}
      <div className="flex gap-6 border-b border-border">
        {([
          { key: "equipment" as const, label: tx(locale, "My Equipment", "내 기자재", "マイ機器"), count: equipment.length },
          { key: "library" as const, label: tx(locale, "Template Library", "기자재 라이브러리", "テンプレートライブラリ"), count: templates.length },
        ]).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn("pb-2.5 text-[13px] font-semibold transition-all duration-200 flex items-center gap-1.5 border-b-2 -mb-px",
              tab === t.key ? "border-brand text-brand" : "border-transparent text-text-tertiary hover:text-text-secondary"
            )}>
            {t.key === "library" && <Layers size={14} />}
            {t.label}
            <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-bold min-w-[18px] text-center",
              tab === t.key ? "bg-brand text-white" : "bg-surface-secondary text-text-tertiary"
            )}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "equipment" ? (
        <EquipmentTab equipment={equipment} templates={templates} locale={locale} onRefresh={fetchAll} />
      ) : (
        <LibraryTab templates={templates} equipment={equipment} locale={locale} onRefresh={fetchAll} />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Equipment Tab
// ═════════════════════════════════════════════════════════════════════════════

function EquipmentTab({ equipment, templates, locale, onRefresh }: {
  equipment: VendorEquipment[]; templates: Template[]; locale: string; onRefresh: () => void;
}) {
  const [applyTarget, setApplyTarget] = useState<VendorEquipment | null>(null);
  const [saveTarget, setSaveTarget] = useState<VendorEquipment | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSaveTemplate = async () => {
    if (!saveTarget || !saveName.trim()) return;
    setSaving(true);
    const res = await fetch("/api/vendor/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: saveName.trim(), equipmentId: saveTarget.id }),
    });
    if (res.ok) {
      showToast.success(tx(locale, "Template saved", "템플릿이 저장되었습니다", "テンプレートが保存されました"));
      onRefresh();
    } else {
      showToast.error(tx(locale, "Save failed", "저장 실패", "保存失敗"));
    }
    setSaving(false);
    setSaveTarget(null);
    setSaveName("");
  };

  return (
    <>
      {equipment.length === 0 ? (
        <EmptyState icon={Package}
          title={tx(locale, "No equipment assigned", "할당된 기자재가 없습니다", "割り当てられた機器がありません")}
          subtitle={tx(locale, "Equipment will appear here when assigned by a shipyard", "조선소에서 기자재를 할당하면 여기에 표시됩니다", "造船所から機器が割り当てられるとここに表示されます")}
        />
      ) : (
        <div className="space-y-2.5">
          {equipment.map((eq, i) => (
            <EquipmentRow key={eq.id} eq={eq} locale={locale} index={i}
              hasTemplates={templates.length > 0}
              onImportDone={onRefresh}
              onSaveTemplate={() => { setSaveTarget(eq); setSaveName(eq.name + " Template"); }}
              onApplyTemplate={() => setApplyTarget(eq)}
            />
          ))}
        </div>
      )}

      {/* Save as template dialog */}
      <Dialog open={!!saveTarget} onClose={() => { setSaveTarget(null); setSaveName(""); }} title={tx(locale, "Save as Template", "템플릿으로 저장", "テンプレートとして保存")}>
        <div className="p-6 max-w-sm mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-brand-lighter/50 flex items-center justify-center">
              <BookmarkPlus size={20} className="text-brand" />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-text">{tx(locale, "Save as Template", "템플릿으로 저장", "テンプレートとして保存")}</h3>
              <p className="text-[11px] text-text-tertiary">{saveTarget?.name} · HW {saveTarget?._count.hardware} · SW {saveTarget?._count.software}</p>
            </div>
          </div>
          <Input
            value={saveName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSaveName(e.target.value)}
            placeholder={tx(locale, "Template name", "템플릿 이름", "テンプレート名")}
            className="mb-4"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => { setSaveTarget(null); setSaveName(""); }}>
              {tx(locale, "Cancel", "취소", "キャンセル")}
            </Button>
            <Button size="sm" loading={saving} onClick={handleSaveTemplate} disabled={!saveName.trim()}>
              <BookmarkPlus size={13} /> {tx(locale, "Save Template", "템플릿 저장", "テンプレート保存")}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Apply template modal */}
      {applyTarget && (
        <ApplyTemplateModal
          equipment={applyTarget}
          templates={templates}
          locale={locale}
          onClose={() => setApplyTarget(null)}
          onApplied={onRefresh}
        />
      )}
    </>
  );
}

// ─── Equipment Row ───────────────────────────────────────────────────────────

function EquipmentRow({ eq, locale, index, hasTemplates, onImportDone, onSaveTemplate, onApplyTemplate }: {
  eq: VendorEquipment; locale: string; index: number; hasTemplates: boolean;
  onImportDone: () => void; onSaveTemplate: () => void; onApplyTemplate: () => void;
}) {
  const st = STATUS_MAP[eq.status] || STATUS_MAP.PENDING;
  const StatusIcon = st.icon;
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const isEmpty = eq._count.hardware === 0 && eq._count.software === 0;
  const canSaveTemplate = (eq._count.hardware > 0 || eq._count.software > 0);
  const canApplyTemplate = isEmpty && ["PENDING", "IN_PROGRESS"].includes(eq.status);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/vendor/export?equipmentId=${eq.id}`);
      if (!res.ok) { showToast.error(tx(locale, "Export failed", "내보내기 실패", "エクスポート失敗")); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${eq.name.replace(/\s+/g, "_")}_export.json`; a.click();
      URL.revokeObjectURL(url);
      showToast.success(tx(locale, "JSON downloaded", "JSON 다운로드 완료", "JSONダウンロード完了"));
    } finally { setExporting(false); }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      let json: unknown;
      try { json = JSON.parse(text); } catch { showToast.error("Invalid JSON"); return; }
      const res = await fetch("/api/vendor/export", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equipmentId: eq.id, data: json }),
      });
      if (res.ok) { showToast.success(tx(locale, "Data imported", "데이터 가져오기 완료", "インポート完了")); onImportDone(); }
      else { const d = await res.json(); showToast.error(d.error || "Import failed"); }
    } finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
      <div className={cn(
        "bg-white rounded-xl border p-4 transition-all hover:shadow-sm group",
        canApplyTemplate ? "border-dashed border-brand/30 bg-brand-lighter/5" : "border-border",
      )}>
        <div className="flex flex-wrap items-center gap-4">
          {/* Icon + Info */}
          <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: st.bg }}>
            <Cpu size={18} style={{ color: st.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-bold text-text truncate">{eq.name}</p>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0"
                style={{ background: st.bg, color: st.color }}>
                <StatusIcon size={10} />
                {locale === "ko" ? st.label : locale === "ja" ? st.labelJa : st.labelEn}
              </span>
            </div>
            <p className="text-[11px] text-text-tertiary mt-0.5">
              {eq.project?.vesselName || "—"} · {eq.project?.shipyard?.name || "—"} · HW {eq._count.hardware} · SW {eq._count.software}
            </p>
          </div>

          {/* Actions — wrap on narrow screens so buttons don't overflow */}
          <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
            {/* Apply template hint */}
            {canApplyTemplate && (
              <button onClick={onApplyTemplate}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-brand bg-brand-lighter/50 hover:bg-brand-lighter transition-colors border border-brand/20">
                <Layers size={12} />
                {tx(locale, "Apply Template", "템플릿 적용", "テンプレート適用")}
              </button>
            )}

            {/* Save as template */}
            {canSaveTemplate && (
              <button onClick={onSaveTemplate}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-text-tertiary hover:text-brand hover:bg-brand-lighter/30 transition-colors opacity-0 group-hover:opacity-100">
                <BookmarkPlus size={12} />
                {tx(locale, "Save Template", "템플릿 저장", "テンプレート保存")}
              </button>
            )}

            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
            <Button variant="outline" size="sm" loading={importing} onClick={() => fileRef.current?.click()}>
              <Upload size={13} /> {tx(locale, "Import", "가져오기", "インポート")}
            </Button>
            <Button variant="outline" size="sm" loading={exporting} onClick={handleExport}>
              <Download size={13} /> {tx(locale, "Export", "내보내기", "エクスポート")}
            </Button>
            <Link href={`/project/${eq.project?.id || ""}/equipment/${eq.id}`}>
              <Button size="sm">{tx(locale, "Work", "작업", "作業")} <ArrowRight size={12} /></Button>
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Library Tab
// ═════════════════════════════════════════════════════════════════════════════

function LibraryTab({ templates, equipment, locale, onRefresh }: {
  templates: Template[]; equipment: VendorEquipment[]; locale: string; onRefresh: () => void;
}) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<{ id: string; name: string } | null>(null);
  const [editName, setEditName] = useState("");
  const [updateTarget, setUpdateTarget] = useState<Template | null>(null);
  const [updating, setUpdating] = useState(false);
  const [search, setSearch] = useState("");

  const handleRename = async () => {
    if (!editTarget || !editName.trim()) return;
    // Update via API - PATCH the template name
    const res = await fetch("/api/vendor/templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editTarget.id, name: editName.trim() }),
    });
    if (res.ok) {
      showToast.success(tx(locale, "Template renamed", "템플릿 이름이 변경되었습니다", "テンプレート名が変更されました"));
      onRefresh();
    }
    setEditTarget(null);
    setEditName("");
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/vendor/templates?id=${deleteId}`, { method: "DELETE" });
    showToast.success(tx(locale, "Template deleted", "템플릿이 삭제되었습니다", "テンプレート削除完了"));
    setDeleteId(null);
    onRefresh();
  };

  const filteredTemplates = templates.filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* ── My templates (accordion list) ─────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-bold text-text flex items-center gap-2">
            <Bookmark size={15} className="text-brand" />
            {tx(locale, "My Templates", "내 템플릿", "マイテンプレート")}
            <span className="text-[11px] font-normal text-text-tertiary">{templates.length}</span>
          </h2>
          {templates.length > 3 && (
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={tx(locale, "Search...", "검색...", "検索...")}
                className="w-[160px] h-7 pl-7 pr-2 rounded-lg border border-border bg-white text-[11px] focus:outline-none focus:ring-1 focus:ring-brand/30" />
            </div>
          )}
        </div>

        {filteredTemplates.length === 0 ? (
          <div className="bg-white rounded-xl border-2 border-dashed border-border py-10 text-center">
            <Layers size={28} className="mx-auto text-text-tertiary mb-2" />
            <p className="text-[13px] font-semibold text-text mb-1">
              {tx(locale, "No templates yet", "저장된 템플릿이 없습니다", "テンプレートがありません")}
            </p>
            <p className="text-[11px] text-text-tertiary max-w-xs mx-auto">
              {tx(locale,
                "Save equipment as a template to reuse it across projects. Go to My Equipment tab and click 'Save Template' on any equipment with data.",
                "기자재를 템플릿으로 저장하면 다른 프로젝트에서 재사용할 수 있습니다. 내 기자재 탭에서 데이터가 있는 기자재의 '템플릿 저장'을 클릭하세요.",
                "機器をテンプレートとして保存すると、他のプロジェクトで再利用できます。"
              )}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-hidden divide-y divide-border">
            {filteredTemplates.map((tmpl) => {
              let hwCount = 0, swCount = 0;
              let hwList: { name: string; type?: string }[] = [];
              let swList: { name: string; version?: string }[] = [];
              try {
                const parsed: ParsedTemplateData = JSON.parse(tmpl.data);
                hwList = (parsed.hardware || []) as { name: string; type?: string }[];
                swList = (parsed.software || []) as { name: string; version?: string }[];
                hwCount = hwList.length;
                swCount = swList.length;
              } catch { /* ignore */ }

              const isExpanded = expandedId === tmpl.id;

              return (
                <div key={tmpl.id}>
                  {/* Accordion header */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : tmpl.id)}
                    className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left hover:bg-surface-page/50 transition-colors"
                  >
                    <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-brand-lighter to-brand-light/50 flex items-center justify-center shrink-0">
                      <Package size={16} className="text-brand" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-text">{tmpl.name}</p>
                      <p className="text-[10px] text-text-tertiary mt-0.5">
                        {new Date(tmpl.createdAt).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US")}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-text-tertiary shrink-0">
                      <span>HW <strong className="text-text tabular-nums">{hwCount}</strong></span>
                      <span>SW <strong className="text-text tabular-nums">{swCount}</strong></span>
                    </div>
                    <svg className={cn("h-4 w-4 text-text-tertiary transition-transform duration-200 shrink-0", isExpanded && "rotate-180")}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {/* Expanded content */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                        <div className="px-4 pb-4 pt-1 bg-surface-page/30">
                          {/* HW/SW preview */}
                          <div className="grid grid-cols-2 gap-3 mb-4">
                            {/* Hardware */}
                            <div>
                              <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mb-2">
                                Hardware ({hwCount})
                              </p>
                              <div className="space-y-1 max-h-[120px] overflow-y-auto">
                                {hwList.slice(0, 8).map((hw, i) => (
                                  <div key={i} className="flex items-center gap-2 text-[11px]">
                                    <Cpu size={10} className="text-text-tertiary shrink-0" />
                                    <span className="text-text truncate">{hw.name}</span>
                                    {hw.type && <span className="text-[9px] text-text-tertiary">{hw.type}</span>}
                                  </div>
                                ))}
                                {hwCount > 8 && <p className="text-[10px] text-text-tertiary">+{hwCount - 8} {tx(locale, "more", "더보기", "もっと")}</p>}
                              </div>
                            </div>
                            {/* Software */}
                            <div>
                              <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mb-2">
                                Software ({swCount})
                              </p>
                              <div className="space-y-1 max-h-[120px] overflow-y-auto">
                                {swList.slice(0, 8).map((sw, i) => (
                                  <div key={i} className="flex items-center gap-2 text-[11px]">
                                    <Monitor size={10} className="text-text-tertiary shrink-0" />
                                    <span className="text-text truncate">{sw.name}</span>
                                    {sw.version && <span className="text-[9px] text-text-tertiary">v{sw.version}</span>}
                                  </div>
                                ))}
                                {swCount > 8 && <p className="text-[10px] text-text-tertiary">+{swCount - 8} {tx(locale, "more", "더보기", "もっと")}</p>}
                              </div>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setUpdateTarget(tmpl)}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-brand hover:bg-brand-lighter/30 transition-colors border border-brand/20 flex items-center gap-1"
                            >
                              <Upload size={11} /> {tx(locale, "Update from Equipment", "기자재에서 업데이트", "機器から更新")}
                            </button>
                            <button
                              onClick={() => setEditTarget({ id: tmpl.id, name: tmpl.name })}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-text-secondary hover:text-brand hover:bg-brand-lighter/30 transition-colors border border-border flex items-center gap-1"
                            >
                              <Pencil size={11} /> {tx(locale, "Rename", "이름 변경", "名前変更")}
                            </button>
                            <button
                              onClick={() => setDeleteId(tmpl.id)}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-text-tertiary hover:text-[#DA1E28] hover:bg-[#FFF1F1] transition-colors border border-border flex items-center gap-1"
                            >
                              <Trash2 size={11} /> {tx(locale, "Delete", "삭제", "削除")}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </section>


      {/* Update from equipment modal */}
      {updateTarget && (
        <Dialog open onClose={() => setUpdateTarget(null)} title={tx(locale, "Update Template", "템플릿 업데이트", "テンプレート更新")}>
          <div className="p-6 max-w-lg mx-auto">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-9 w-9 rounded-lg bg-brand-lighter/50 flex items-center justify-center">
                <Upload size={16} className="text-brand" />
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-text">{updateTarget.name}</h3>
                <p className="text-[11px] text-text-tertiary">
                  {tx(locale, "Select equipment to update this template from", "이 템플릿을 업데이트할 기자재를 선택하세요", "更新元の機器を選択してください")}
                </p>
              </div>
            </div>

            <p className="text-[10px] text-[#EB6200] bg-[#FFF3E0] rounded-lg px-3 py-2 mb-4">
              {tx(locale, "This will replace the template's HW/SW data with the selected equipment's current data.", "선택한 기자재의 현재 HW/SW 데이터로 템플릿이 덮어쓰기됩니다.", "選択した機器の現在のデータでテンプレートが上書きされます。")}
            </p>

            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {equipment.filter((eq) => eq._count.hardware > 0 || eq._count.software > 0).map((eq) => (
                <button key={eq.id} disabled={updating}
                  onClick={async () => {
                    setUpdating(true);
                    // Delete old template and create new one with same name from this equipment
                    await fetch(`/api/vendor/templates?id=${updateTarget.id}`, { method: "DELETE" });
                    const res = await fetch("/api/vendor/templates", {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name: updateTarget.name, equipmentId: eq.id }),
                    });
                    if (res.ok) {
                      showToast.success(tx(locale, "Template updated!", "템플릿이 업데이트되었습니다!", "テンプレートが更新されました！"));
                      onRefresh();
                    }
                    setUpdating(false);
                    setUpdateTarget(null);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-white hover:border-brand/30 hover:shadow-sm transition-all text-left disabled:opacity-50"
                >
                  <Cpu size={14} className="text-text-tertiary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-text">{eq.name}</p>
                    <p className="text-[10px] text-text-tertiary">{eq.project?.vesselName} · HW {eq._count.hardware} · SW {eq._count.software}</p>
                  </div>
                  <ArrowRight size={14} className="text-text-tertiary" />
                </button>
              ))}
              {equipment.filter((eq) => eq._count.hardware > 0 || eq._count.software > 0).length === 0 && (
                <p className="text-center py-6 text-[12px] text-text-tertiary">
                  {tx(locale, "No equipment with data available", "데이터가 있는 기자재가 없습니다", "データのある機器がありません")}
                </p>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setUpdateTarget(null)}>{tx(locale, "Cancel", "취소", "キャンセル")}</Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Rename dialog */}
      <Dialog
        open={!!editTarget}
        onClose={() => { setEditTarget(null); setEditName(""); }}
        title={tx(locale, "Rename Template", "템플릿 이름 변경", "テンプレート名変更")}
      >
        <div className="p-6 max-w-sm mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-9 rounded-lg bg-brand-lighter/50 flex items-center justify-center">
              <Pencil size={16} className="text-brand" />
            </div>
            <p className="text-[13px] font-semibold text-text">{editTarget?.name}</p>
          </div>
          <Input
            value={editName || editTarget?.name || ""}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditName(e.target.value)}
            placeholder={tx(locale, "New name", "새 이름", "新しい名前")}
            className="mb-4"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => { setEditTarget(null); setEditName(""); }}>
              {tx(locale, "Cancel", "취소", "キャンセル")}
            </Button>
            <Button size="sm" onClick={handleRename} disabled={!editName.trim() || editName.trim() === editTarget?.name}>
              <Pencil size={12} /> {tx(locale, "Rename", "변경", "変更")}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title={tx(locale, "Delete Template", "템플릿 삭제", "テンプレート削除")}
        description={tx(locale, "Are you sure? This cannot be undone.", "정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.", "本当に削除しますか？元に戻せません。")}
      />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Apply Template Modal
// ═════════════════════════════════════════════════════════════════════════════

function ApplyTemplateModal({ equipment, templates, locale, onClose, onApplied }: {
  equipment: VendorEquipment; templates: Template[]; locale: string; onClose: () => void; onApplied: () => void;
}) {
  const [applying, setApplying] = useState(false);

  const handleApply = async (templateId: string) => {
    setApplying(true);
    const res = await fetch("/api/vendor/templates/apply", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId, equipmentId: equipment.id }),
    });
    if (res.ok) {
      showToast.success(tx(locale, "Template applied! HW/SW pre-filled.", "템플릿이 적용되었습니다! HW/SW가 자동 입력됩니다.", "テンプレートが適用されました！"));
      onApplied(); onClose();
    } else {
      const d = await res.json();
      showToast.error(d.error || "Failed");
    }
    setApplying(false);
  };

  return (
    <Dialog open onClose={onClose} title={tx(locale, "Apply Template", "템플릿 적용", "テンプレート適用")}>
      <div className="p-6 max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-10 w-10 rounded-xl bg-brand-lighter/50 flex items-center justify-center">
            <Layers size={20} className="text-brand" />
          </div>
          <div>
            <h3 className="text-[15px] font-bold text-text">{tx(locale, "Apply Template", "템플릿 적용", "テンプレート適用")}</h3>
            <p className="text-[11px] text-text-tertiary">{equipment.name} · {equipment.project?.vesselName}</p>
          </div>
        </div>

        {templates.length === 0 ? (
          <div className="py-8 text-center">
            <Layers size={24} className="mx-auto text-text-tertiary mb-2" />
            <p className="text-[12px] text-text-tertiary">
              {tx(locale, "No templates saved yet. Save an equipment as a template first.", "저장된 템플릿이 없습니다. 먼저 기자재를 템플릿으로 저장하세요.", "テンプレートがありません。")}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map((tmpl) => {
              let hwCount = 0, swCount = 0;
              try {
                const parsed: ParsedTemplateData = JSON.parse(tmpl.data);
                hwCount = parsed.hardware?.length || 0;
                swCount = parsed.software?.length || 0;
              } catch { /* ignore */ }

              return (
                <button key={tmpl.id} disabled={applying} onClick={() => handleApply(tmpl.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-white hover:border-brand/30 hover:shadow-sm transition-all text-left disabled:opacity-50">
                  <div className="h-8 w-8 rounded-lg bg-brand-lighter/50 flex items-center justify-center shrink-0">
                    <Bookmark size={14} className="text-brand" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-text">{tmpl.name}</p>
                    <p className="text-[10px] text-text-tertiary">HW {hwCount} · SW {swCount} · {new Date(tmpl.createdAt).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US")}</p>
                  </div>
                  <ArrowRight size={14} className="text-text-tertiary" />
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>{tx(locale, "Cancel", "취소", "キャンセル")}</Button>
        </div>
      </div>
    </Dialog>
  );
}
