"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Ship, Shield, FileText, Package, Cpu, Server, Monitor, Radio, HardDrive, Network,
  CheckCircle, Clock, AlertTriangle, Eye, ThumbsUp, MessageSquare, X, ClipboardList,
  ChevronRight, ArrowLeft, Download, Plus, Edit2, ChevronDown, AlertCircle, Globe,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { DfdEditor } from "@/components/dfd/dfd-editor";
import { RiskReasoningHover, parseReasoning, canSeeRiskReasoning } from "@/components/risk/risk-reasoning-hover";
import {
  CveBadge,
  CveMeter,
  emptySeverity,
  addToSeverity,
  type SeverityCounts,
} from "@/components/inventory/cve-badge";
import { AuditRunsList } from "@/components/audit/audit-runs-list";
import { CveSidebar } from "@/components/inventory/cve-sidebar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Equipment {
  id: string; name: string; status: string; description: string | null;
  vendors: { id: string; name: string; company: string | null }[];
  _count: { hardware: number; software: number };
  dfdDiagram?: { id: string } | null;
  updatedAt?: string;
}

interface HwItem {
  id: string;
  name: string;
  type: string;
  manufacturer: string | null;
  model: string | null;
  ipAddress: string | null;
  zone: string | null;
  category: string | null;
  software: { id: string; name: string; version: string | null }[];
}
interface SwItem {
  id: string;
  name: string;
  version: string | null;
  vendor: string | null;
  swType: string;
  hardwareId: string | null;
  cpe: string | null;
  listeningPort: string | null;
  purpose: string | null;
  modelName: string | null;
}
interface AuditRunSummary {
  id: string;
  platform: string;
  results: Record<string, unknown>;
  createdAt: string;
  hardwareId: string | null;
}
interface ViewerCveMatch {
  name: string;
  version: string;
  cves: { cveId: string; severity: string | null; score: number | null; description: string }[];
}
interface AssessItem { id: string; checkId: string; result: string; hardwareId: string }
interface DocItem { id: string; docType: string; title: string; version: number; status: string }

interface Project { id: string; vesselName: string; shipowner: string | null; classification: string | null }

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType<{size?: number; className?: string}> }> = {
  APPROVED:           { label: "승인됨",    color: "#24A148", bg: "#E6F7EF", icon: CheckCircle },
  SUBMITTED:          { label: "검토 대기", color: "#EB6200", bg: "#FFF3E0", icon: Eye },
  IN_PROGRESS:        { label: "벤더 작업중", color: "#0F62FE", bg: "#EDF5FF", icon: Clock },
  PENDING:            { label: "미착수",    color: "#8D8D8D", bg: "#F4F4F4", icon: Clock },
  REVISION_REQUESTED: { label: "수정 요청", color: "#DA1E28", bg: "#FFF1F1", icon: AlertTriangle },
};

const SC_NAMES = ["사용자 식별 및 인증","사용 제어 및 권한","시스템 무결성 보호","데이터 기밀성 보호","네트워크 분리 및 데이터 흐름 제한","원격 접속 보안","보안 감사 로깅","통신 무결성 및 인증","백업, 복구 및 복원력","자동 세션 잠금","악성코드 방어 및 탐지","CBS의 물리적 보안","보안 패치 및 업데이트 관리"];

// ─── Vessel Detail View ─────────────────────────────────────────────────────

interface VendorOption { id: string; name: string; company: string | null; isActive: boolean }

export function ShipyardVesselDetail({ projectId, project, initialEqId }: { projectId: string; project: Project; initialEqId?: string | null }) {
  const { locale } = useLocaleStore();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEqId, setSelectedEqId] = useState<string | null>(initialEqId || null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [remindedIds, setRemindedIds] = useState<Set<string>>(new Set());
  const [e26Generated, setE26Generated] = useState(false);
  const [e26Generating, setE26Generating] = useState(false);

  // Equipment creation/edit
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [eqForm, setEqForm] = useState({ id: "", name: "", description: "", vendorIds: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [eqDeleteTarget, setEqDeleteTarget] = useState<Equipment | null>(null);

  useEffect(() => {
    if (!addOpen && !editOpen) return;
    fetch("/api/shipyard/vendors")
      .then(async (r) => { if (r.ok) { const d = await r.json(); setVendors(Array.isArray(d) ? d.filter((v: VendorOption) => v.isActive) : []); } })
      .catch(() => {});
  }, [addOpen, editOpen]);

  const handleSaveEquipment = async () => {
    if (!eqForm.name.trim()) { showToast.error(tx(locale, "Equipment name is required", "기자재 이름을 입력하세요", "機器名を入力してください")); return; }
    if (eqForm.vendorIds.length === 0) { showToast.error(tx(locale, "Please select at least one vendor", "최소 한 명의 벤더를 선택하세요", "少なくとも1つのベンダーを選択してください")); return; }
    setSaving(true);
    try {
      const isEdit = !!eqForm.id;
      const res = await fetch(`/api/projects/${projectId}/equipment`, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: eqForm.id || undefined,
          name: eqForm.name.trim(),
          description: eqForm.description.trim() || null,
          vendorIds: eqForm.vendorIds
        }),
      });
      if (res.ok) {
        showToast.success(isEdit 
          ? tx(locale, "Equipment updated", "기자재 정보가 수정되었습니다", "機器情報が修正されました")
          : tx(locale, "Equipment added", "기자재가 추가되었습니다", "機器が追加されました")
        );
        setAddOpen(false);
        setEditOpen(false);
        setEqForm({ id: "", name: "", description: "", vendorIds: [] });
        fetchEq();
      } else {
        const body = await res.json().catch(() => ({}));
        showToast.error(body.error || "Failed");
      }
    } finally { setSaving(false); }
  };

  const openEdit = (eq: Equipment) => {
    setEqForm({
      id: eq.id,
      name: eq.name,
      description: eq.description || "",
      vendorIds: eq.vendors.map(v => v.id)
    });
    setEditOpen(true);
  };

  const handleDeleteEquipment = async (id: string) => {
    // Confirmation is handled by the ConfirmDialog rendered at the bottom of
    // the component; this function is called only after the user confirms.
    setDeletingId(id);
    try {
      const res = await fetch(`/api/projects/${projectId}/equipment?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast.success(tx(locale, "Equipment deleted", "기자재가 삭제되었습니다", "機器が削除されました"));
        fetchEq();
      } else {
        const body = await res.json().catch(() => ({}));
        showToast.error(body.error || "Failed to delete");
      }
    } finally { setDeletingId(null); }
  };

  const fetchEq = useCallback(() => {
    fetch(`/api/projects/${projectId}/equipment`)
      .then(async (r) => { if (r.ok) setEquipment(await r.json()); })
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { fetchEq(); }, [fetchEq]);

  // Check E26 status
  useEffect(() => {
    fetch(`/api/projects/${projectId}/e26`)
      .then(async (r) => { if (r.ok) { const d = await r.json(); if (d.documents?.length > 0) setE26Generated(true); } })
      .catch(() => {});
  }, [projectId]);

  const handleRemind = async (eqId: string, eqProjectId: string) => {
    await fetch(`/api/projects/${eqProjectId}/equipment/${eqId}/remind`, { method: "POST" }).catch(() => {});
    setRemindedIds((p) => new Set(p).add(eqId));
    setTimeout(() => setRemindedIds((p) => { const n = new Set(p); n.delete(eqId); return n; }), 3000);
    showToast.success(tx(locale, "Reminder sent", "리마인드 전송됨", "リマインド 전송됨"));
  };

  const handleE26Generate = async () => {
    setE26Generating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/e26`, { method: "POST" });
      if (res.ok) { setE26Generated(true); showToast.success(tx(locale, "E26 documents generated", "E26 문서 생성 완료", "E26文書生成完了")); }
    } finally { setE26Generating(false); }
  };

  // Selected equipment → full review page
  const selectedEq = equipment.find((e) => e.id === selectedEqId);
  if (selectedEq) {
    return <EquipmentReviewView eq={selectedEq} project={project} projectId={projectId} locale={locale} onBack={() => { setSelectedEqId(null); fetchEq(); }} />;
  }

  const approved = equipment.filter((e) => e.status === "APPROVED").length;
  const submitted = equipment.filter((e) => e.status === "SUBMITTED").length;
  const revision = equipment.filter((e) => e.status === "REVISION_REQUESTED").length;
  const inProg = equipment.filter((e) => e.status === "IN_PROGRESS").length;
  const total = equipment.length;
  const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
  const allApproved = total > 0 && approved === total;

  const filtered = statusFilter === "ALL" ? equipment : equipment.filter((e) => e.status === statusFilter);

  if (loading) return <div className="py-20 text-center text-gray-400">Loading...</div>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-200">
          <Ship size={26} className="text-white" />
        </div>
        <div>
          <h1 className="text-[22px] font-extrabold text-gray-900 tracking-tight">{project.vesselName}</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">{project.shipowner || "—"} · {project.classification || "—"} · {total}{tx(locale, " equipment", "개 기자재", "機材")}</p>
        </div>
      </div>

      {/* Status overview */}
      <div className="grid grid-cols-5 gap-3 mb-8">
        <StatusCard label={tx(locale, "Progress", "인증 진행률", "進捗")} value={`${pct}%`} sub={`${approved}/${total}`} color={allApproved ? "#24A148" : "#0F62FE"} active={false} onClick={() => setStatusFilter("ALL")} />
        <StatusCard label={tx(locale, "Review Pending", "검토 대기", "レビュー待ち")} value={String(submitted)} sub={tx(locale, "vendor submitted", "벤더 제출 완료", "ベンダー提出済み")} color="#EB6200" active={statusFilter === "SUBMITTED"} onClick={() => setStatusFilter(statusFilter === "SUBMITTED" ? "ALL" : "SUBMITTED")} />
        <StatusCard label={tx(locale, "Revision", "수정 요청", "修正依頼")} value={String(revision)} sub={tx(locale, "needs fix", "보완 필요", "修正必要")} color="#DA1E28" active={statusFilter === "REVISION_REQUESTED"} onClick={() => setStatusFilter(statusFilter === "REVISION_REQUESTED" ? "ALL" : "REVISION_REQUESTED")} />
        <StatusCard label={tx(locale, "In Progress", "벤더 작업중", "ベンダー作業中")} value={String(inProg)} sub={tx(locale, "registering", "등록/평가 중", "登録中")} color="#0F62FE" active={statusFilter === "IN_PROGRESS"} onClick={() => setStatusFilter(statusFilter === "IN_PROGRESS" ? "ALL" : "IN_PROGRESS")} />
        <StatusCard label={tx(locale, "Approved", "승인 완료", "承認済み")} value={String(approved)} sub="E27" color="#24A148" active={statusFilter === "APPROVED"} onClick={() => setStatusFilter(statusFilter === "APPROVED" ? "ALL" : "APPROVED")} />
      </div>

      {/* Equipment list */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-bold text-gray-900">{tx(locale, "Equipment Status", "기자재 현황", "機器状況")}</h2>
          <div className="flex items-center gap-2">
            {statusFilter !== "ALL" && (
              <button onClick={() => setStatusFilter("ALL")} className="text-[11px] text-blue-600 font-semibold hover:underline">{tx(locale, "Clear filter", "필터 해제", "フィルタ解除")}</button>
            )}
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus size={14} /> {tx(locale, "Add Equipment", "기자재 추가", "機器追加")}
            </Button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
            <Package size={28} className="mx-auto text-gray-300 mb-2" />
            <p className="text-[13px] text-gray-400 mb-3">{tx(locale, "No equipment registered yet", "아직 등록된 기자재가 없습니다", "まだ登録された機器がありません")}</p>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus size={14} /> {tx(locale, "Register First Equipment", "첫 기자재 등록", "最初の機器を登録")}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((eq) => {
              const cfg = STATUS_CFG[eq.status] || STATUS_CFG.PENDING;
              const Icon = cfg.icon;
              return (
                <div key={eq.id} role="button" tabIndex={0} onClick={() => setSelectedEqId(eq.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedEqId(eq.id); }}
                  className="w-full bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-md transition-all text-left group cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: cfg.bg }}>
                      <Icon size={20} style={{ color: cfg.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[14px] font-bold text-gray-900">{eq.name}</span>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-gray-400">
                        <span className="font-medium text-gray-500 truncate max-w-[150px]">
                          {eq.vendors.length > 0 ? eq.vendors.map(v => v.company || v.name).join(", ") : "—"}
                        </span>
                        <span>HW {eq._count.hardware}</span>
                        <span>SW {eq._count.software}</span>
                        <span>DFD {eq.dfdDiagram ? "✅" : "—"}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {(eq.status === "PENDING" || eq.status === "IN_PROGRESS" || eq.status === "REVISION_REQUESTED") && (
                        <button onClick={(e) => { e.stopPropagation(); handleRemind(eq.id, projectId); }} disabled={remindedIds.has(eq.id)}
                          className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all",
                            remindedIds.has(eq.id) ? "bg-green-50 text-green-600 border border-green-200" : "bg-gray-100 text-gray-500 hover:bg-orange-50 hover:text-orange-600 border border-gray-200 hover:border-orange-200")}>
                          {remindedIds.has(eq.id) ? <><CheckCircle size={11} /> {tx(locale, "Sent", "전송됨", "送信済み")}</> : <><MessageSquare size={11} /> {tx(locale, "Remind", "리마인드", "リマインド")}</>}
                        </button>
                      )}
                      {eq.status === "SUBMITTED" && (
                        <span className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-orange-50 text-orange-600 border border-orange-200">
                          {tx(locale, "Review needed", "검토 필요", "レビュー必要")}
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(eq); }}
                        className="p-2 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                        title={tx(locale, "Edit", "수정", "編集")}
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEqDeleteTarget(eq); }}
                        disabled={deletingId === eq.id}
                        className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title={tx(locale, "Delete", "삭제", "削除")}
                      >
                        <X size={16} />
                      </button>
                      <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* E26 Section */}
      <div className={cn("rounded-xl border p-6", allApproved ? "border-green-200 bg-green-50/30" : "border-gray-200 bg-gray-50/30")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center", allApproved ? "bg-green-100" : "bg-gray-100")}>
              <FileText size={22} className={allApproved ? "text-green-600" : "text-gray-400"} />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-gray-900">E26 {tx(locale, "Ship Documents", "선박 문서", "船舶文書")}</h2>
              <p className="text-[12px] text-gray-500 mt-0.5">
                {e26Generated ? tx(locale, "Documents generated", "문서 생성 완료", "文書生成完了")
                  : allApproved ? tx(locale, "All equipment approved. Ready to generate.", "모든 기자재 승인 완료. 생성 가능합니다.", "全機器承認済み。生成可能です。")
                  : `${approved}/${total} ${tx(locale, "approved", "승인", "承認")}`}
              </p>
            </div>
          </div>
          {!e26Generated ? (
            <Button disabled={!allApproved} loading={e26Generating} onClick={handleE26Generate}
              className={cn(!allApproved && "opacity-50 cursor-not-allowed")}>
              <FileText size={14} /> E26 {tx(locale, "Generate", "문서 생성", "生成")}
            </Button>
          ) : (
            <Link href={`/project/${projectId}/document`}>
              <Button variant="outline">{tx(locale, "View Documents", "문서 확인", "文書確認")}</Button>
            </Link>
          )}
        </div>
        {!allApproved && !e26Generated && (
          <div className="mt-4 h-2 rounded-full bg-gray-200 overflow-hidden">
            <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      {/* Add/Edit Equipment Dialog */}
      {(addOpen || editOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setAddOpen(false); setEditOpen(false); setEqForm({ id: "", name: "", description: "", vendorIds: [] }); }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[16px] font-bold text-gray-900">
                {addOpen ? tx(locale, "Add Equipment", "기자재 추가", "機器追加") : tx(locale, "Edit Equipment", "기자재 수정", "機器編集")}
              </h3>
              <button onClick={() => { setAddOpen(false); setEditOpen(false); setEqForm({ id: "", name: "", description: "", vendorIds: [] }); }} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[13px] font-medium text-gray-700 mb-1 block">{tx(locale, "Equipment Name *", "기자재 이름 *", "機器名 *")}</label>
                <input
                  value={eqForm.name}
                  onChange={(e) => setEqForm({ ...eqForm, name: e.target.value })}
                  placeholder={tx(locale, "e.g. ECDIS, IAS, VDR", "예: ECDIS, IAS, VDR", "例: ECDIS, IAS, VDR")}
                  className="w-full h-10 px-3 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[13px] font-medium text-gray-700 mb-1 block">{tx(locale, "Description", "설명", "説明")}</label>
                <input
                  value={eqForm.description}
                  onChange={(e) => setEqForm({ ...eqForm, description: e.target.value })}
                  placeholder={tx(locale, "Brief description", "간단한 설명", "簡単な説明")}
                  className="w-full h-10 px-3 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[13px] font-medium text-gray-700 mb-2 block">{tx(locale, "Assign Vendors *", "벤더 할당 *", "ベンダー割当 *")}</label>
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1 bg-gray-50">
                  {vendors.map((v) => (
                    <label key={v.id} className="flex items-center gap-2 p-1.5 hover:bg-white rounded cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={eqForm.vendorIds.includes(v.id)}
                        onChange={(e) => {
                          const ids = e.target.checked 
                            ? [...eqForm.vendorIds, v.id]
                            : eqForm.vendorIds.filter(id => id !== v.id);
                          setEqForm({ ...eqForm, vendorIds: ids });
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                      />
                      <span className="text-[12px] text-gray-700">{v.name}{v.company ? ` (${v.company})` : ""}</span>
                    </label>
                  ))}
                  {vendors.length === 0 && (
                    <p className="text-[11px] text-gray-400 text-center py-2">{tx(locale, "No vendors registered.", "등록된 벤더가 없습니다.", "ベンダーなし")}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" size="sm" onClick={() => { setAddOpen(false); setEditOpen(false); setEqForm({ id: "", name: "", description: "", vendorIds: [] }); }}>{tx(locale, "Cancel", "취소", "キャンセル")}</Button>
              <Button size="sm" loading={saving} onClick={handleSaveEquipment}>
                {addOpen ? <><Plus size={14} /> {tx(locale, "Add", "추가", "追加")}</> : <><CheckCircle size={14} /> {tx(locale, "Save", "저장", "保存")}</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Equipment delete confirmation — replaces the native browser confirm() */}
      <ConfirmDialog
        open={!!eqDeleteTarget}
        onClose={() => setEqDeleteTarget(null)}
        onConfirm={() => {
          if (eqDeleteTarget) {
            handleDeleteEquipment(eqDeleteTarget.id);
            setEqDeleteTarget(null);
          }
        }}
        title={tx(locale, "Delete equipment?", "기자재 삭제", "機器削除")}
        description={tx(
          locale,
          `"${eqDeleteTarget?.name ?? ""}" and all of its hardware, software, assessments, and audit runs will be permanently removed. This cannot be undone.`,
          `"${eqDeleteTarget?.name ?? ""}" 및 관련된 모든 하드웨어, 소프트웨어, 보안평가, 감사 결과가 영구 삭제됩니다. 되돌릴 수 없습니다.`,
          `"${eqDeleteTarget?.name ?? ""}" および関連するすべてのハードウェア、ソフトウェア、評価、監査結果が削除されます。`,
        )}
        confirmLabel={tx(locale, "Delete", "삭제", "削除")}
        cancelLabel={tx(locale, "Cancel", "취소", "キャンセル")}
        loading={!!deletingId}
      />
    </div>
  );
}

// ─── Equipment Review View (풀 페이지) ──────────────────────────────────────

function EquipmentReviewView({ eq, project, projectId, locale, onBack }: {
  eq: Equipment; project: Project; projectId: string; locale: string; onBack: () => void;
}) {
  const cfg = STATUS_CFG[eq.status] || STATUS_CFG.PENDING;
  const Icon = cfg.icon;
  const [tab, setTab] = useState<"assets" | "assessment" | "dfd" | "testproc" | "documents" | "risk">("assets");
  const [hardware, setHardware] = useState<HwItem[]>([]);
  const [assessments, setAssessments] = useState<AssessItem[]>([]);
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [risks, setRisks] = useState<{
    id: string;
    threatId: string;
    likelihood: number;
    impact: number;
    riskLevel: number;
    status: string;
    mitigation: string | null;
    cveId?: string | null;
    assetRef?: string | null;
    reasoning?: string | null;
  }[]>([]);
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role;
  const canSeeReasoning = canSeeRiskReasoning(userRole);
  // SUPPORT and ADMIN act as reviewers for this project — they can edit SC
  // check results and tune risk scoring/mitigation even though other sections
  // (assets, DFD, docs, testproc) stay read-only. SHIPYARD viewer can't edit.
  const canReview = userRole === "SUPPORT" || userRole === "ADMIN";
  const [updatingAssessKey, setUpdatingAssessKey] = useState<string | null>(null);
  const [updatingRiskId, setUpdatingRiskId] = useState<string | null>(null);
  const [addRiskOpen, setAddRiskOpen] = useState(false);
  const [addRiskSaving, setAddRiskSaving] = useState(false);
  const [autoGenBusy, setAutoGenBusy] = useState(false);
  const [deletingRiskId, setDeletingRiskId] = useState<string | null>(null);

  // Next auto-incremented threat ID — convention is T-### zero-padded.
  const nextThreatId = () => {
    let max = 0;
    for (const r of risks) {
      const m = r.threatId.match(/^T-(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1]));
    }
    return `T-${String(max + 1).padStart(3, "0")}`;
  };

  const [riskForm, setRiskForm] = useState({
    threatId: "", assetRef: "", likelihood: 3, impact: 3, status: "OPEN", mitigation: "",
  });

  const openAddRisk = () => {
    setRiskForm({ threatId: nextThreatId(), assetRef: "", likelihood: 3, impact: 3, status: "OPEN", mitigation: "" });
    setAddRiskOpen(true);
  };

  const submitAddRisk = async () => {
    if (!riskForm.threatId.trim()) { showToast.error(tx(locale, "Threat ID is required", "위협 ID를 입력하세요", "脅威IDを入力してください")); return; }
    setAddRiskSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/risks`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threatId: riskForm.threatId.trim(),
          assetRef: riskForm.assetRef.trim() || undefined,
          likelihood: riskForm.likelihood,
          impact: riskForm.impact,
          status: riskForm.status,
          mitigation: riskForm.mitigation.trim() || undefined,
        }),
      });
      if (res.ok) {
        // Optimistic append — the POST returns the created record, so we
        // can update state synchronously without a second fetch (the earlier
        // GET-after-POST had a race where the row sometimes didn't show up
        // until a manual refresh).
        const created = await res.json();
        setRisks((prev) => [created, ...prev]);
        setAddRiskOpen(false);
        showToast.success(tx(locale, "Risk added", "리스크 추가됨", "リスク追加済み"));
      } else {
        const d = await res.json().catch(() => ({}));
        showToast.error(d.error || tx(locale, "Failed to create", "생성 실패", "作成失敗"));
      }
    } finally { setAddRiskSaving(false); }
  };

  const autoGenerateFromCve = async () => {
    setAutoGenBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/risks/generate-from-cve`, { method: "POST" });
      if (res.ok) {
        const out = await res.json();
        const r = await fetch(`/api/projects/${projectId}/risks`);
        if (r.ok) setRisks(await r.json());
        showToast.success(tx(locale,
          `Generated ${out.created ?? 0} risk(s) from CVE matches`,
          `CVE 매칭 기반 ${out.created ?? 0}건 생성됨`,
          `CVE一致から ${out.created ?? 0} 件生成`));
      } else {
        showToast.error(tx(locale, "Auto-generate failed", "자동 생성 실패", "自動生成失敗"));
      }
    } finally { setAutoGenBusy(false); }
  };

  // Risk deletion is confirmed via ConfirmDialog; this helper runs the actual
  // request once the user has accepted. Called from the dialog's onConfirm.
  const [riskDeleteTarget, setRiskDeleteTarget] = useState<string | null>(null);
  const confirmDeleteRisk = async () => {
    const riskId = riskDeleteTarget;
    if (!riskId) return;
    setDeletingRiskId(riskId);
    try {
      const res = await fetch(`/api/projects/${projectId}/risks/${riskId}`, { method: "DELETE" });
      if (res.ok) {
        setRisks((prev) => prev.filter((r) => r.id !== riskId));
        showToast.success(tx(locale, "Risk deleted", "리스크 삭제됨", "リスク削除済み"));
      } else {
        const d = await res.json().catch(() => ({}));
        showToast.error(d.error || tx(locale, "Delete failed", "삭제 실패", "削除失敗"));
      }
    } finally {
      setDeletingRiskId(null);
      setRiskDeleteTarget(null);
    }
  };

  // Upsert the same SC result against every HW in this equipment. The vendor
  // page tracks per-HW results for audit trail; the reviewer-facing view
  // collapses to one result per SC so the cell here fans the update out to
  // every HW to keep the two sides in sync.
  const updateScResult = async (checkId: string, result: string) => {
    if (hardware.length === 0) return;
    setUpdatingAssessKey(checkId);
    try {
      await Promise.all(
        hardware.map((hw) =>
          fetch(`/api/projects/${projectId}/assessments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hardwareId: hw.id, checkId, standard: "E27", result }),
          }),
        ),
      );
      // Refresh assessments
      const r = await fetch(`/api/projects/${projectId}/assessments`);
      if (r.ok) setAssessments(await r.json());
    } finally {
      setUpdatingAssessKey(null);
    }
  };

  // Patch a single risk field — the API recomputes riskLevel + reasoning
  // override when likelihood/impact changes.
  const updateRisk = async (riskId: string, field: "likelihood" | "impact" | "status" | "mitigation", value: number | string) => {
    setUpdatingRiskId(riskId);
    try {
      const res = await fetch(`/api/projects/${projectId}/risks/${riskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        const updated = await res.json();
        setRisks((prev) => prev.map((r) => (r.id === riskId ? { ...r, ...updated } : r)));
      }
    } finally {
      setUpdatingRiskId(null);
    }
  };
  const [testProc, setTestProc] = useState<{ status: string; hwGroups: { id: string; label: string; hardwareIds: string; hwItems: { no: number; category: string; criteria: string; method: string }[] }[]; fnItems: { softwareName: string | null; section: string; no: number; category: string; criteria: string; method: string }[] } | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Review-view enrichments (CVE / SBOM / audit)
  const [software, setSoftware] = useState<SwItem[]>([]);
  const [cveBySwId, setCveBySwId] = useState<Map<string, SeverityCounts>>(new Map());
  const [cveByHwId, setCveByHwId] = useState<Map<string, SeverityCounts>>(new Map());
  const [hwCveMatches, setHwCveMatches] = useState<Map<string, ViewerCveMatch[]>>(new Map());
  const [auditRuns, setAuditRuns] = useState<AuditRunSummary[]>([]);
  const [expandedHwId, setExpandedHwId] = useState<string | null>(null);
  const [assetsSubTab, setAssetsSubTab] = useState<"inventory" | "audit">("inventory");

  useEffect(() => {
    const safe = (p: Promise<Response>) => p.catch(() => null);
    Promise.all([
      safe(fetch(`/api/projects/${projectId}/hardware?equipmentId=${eq.id}`)),
      safe(fetch(`/api/projects/${projectId}/assessments`)),
      safe(fetch(`/api/projects/${projectId}/documents?equipmentId=${eq.id}`)),
      safe(fetch(`/api/projects/${projectId}/risks`)),
      safe(fetch(`/api/projects/${projectId}/test-procedure?equipmentId=${eq.id}`)),
      safe(fetch(`/api/projects/${projectId}/software?equipmentId=${eq.id}`)),
      safe(fetch(`/api/projects/${projectId}/cve-matches`)),
      safe(fetch(`/api/vendor/audit-tools/upload?equipmentId=${eq.id}`)),
    ]).then(async ([hwRes, assessRes, docsRes, riskRes, tpRes, swRes, cveRes, auditRes]) => {
      const hwList: HwItem[] = hwRes?.ok ? await hwRes.json() : [];
      setHardware(hwList);
      setAssessments(assessRes?.ok ? await assessRes.json() : []);
      const docs = docsRes?.ok ? await docsRes.json() : [];
      setDocuments(Array.isArray(docs) ? docs : []);
      const riskData = riskRes?.ok ? await riskRes.json() : [];
      setRisks(Array.isArray(riskData) ? riskData : []);
      setTestProc(tpRes?.ok ? await tpRes.json() : null);

      const swList: SwItem[] = swRes?.ok ? await swRes.json() : [];
      setSoftware(Array.isArray(swList) ? swList : []);

      // Build per-SW + per-HW severity maps and the viewer-ready CVE match list.
      if (cveRes?.ok) {
        const all = await cveRes.json() as Array<{
          cveId: string;
          softwareId: string | null;
          hardwareId: string | null;
          software: { id: string; name: string; version: string | null } | null;
          hardware: { id: string } | null;
          cveDetail: { description: string | null; baseScore: number | null; baseSeverity: string | null } | null;
        }>;
        const swMap = new Map<string, SeverityCounts>();
        const hwMap = new Map<string, SeverityCounts>();
        for (const m of all) {
          const sev = m.cveDetail?.baseSeverity;
          if (m.softwareId) {
            if (!swMap.has(m.softwareId)) swMap.set(m.softwareId, emptySeverity());
            addToSeverity(swMap.get(m.softwareId)!, sev);
          }
          if (m.hardwareId) {
            if (!hwMap.has(m.hardwareId)) hwMap.set(m.hardwareId, emptySeverity());
            addToSeverity(hwMap.get(m.hardwareId)!, sev);
          }
        }
        setCveBySwId(swMap);
        setCveByHwId(hwMap);

        // Per-HW viewer-ready CVE matches for the AuditResultViewer consumers
        const perHw = new Map<string, ViewerCveMatch[]>();
        const swIdToHwId = new Map<string, string>();
        for (const sw of swList) {
          if (sw.hardwareId) swIdToHwId.set(sw.id, sw.hardwareId);
        }
        for (const m of all) {
          const hwId = m.hardwareId ?? (m.softwareId ? swIdToHwId.get(m.softwareId) : undefined);
          if (!hwId) continue;
          const name = m.software?.name ?? "—";
          const version = m.software?.version ?? "";
          const key = `${name}::${version}`;
          if (!perHw.has(hwId)) perHw.set(hwId, []);
          const bucket = perHw.get(hwId)!;
          let entry = bucket.find((b) => `${b.name}::${b.version}` === key);
          if (!entry) {
            entry = { name, version, cves: [] };
            bucket.push(entry);
          }
          entry.cves.push({
            cveId: m.cveId,
            severity: m.cveDetail?.baseSeverity ?? null,
            score: m.cveDetail?.baseScore ?? null,
            description: m.cveDetail?.description ?? "",
          });
        }
        setHwCveMatches(perHw);
      }

      // Audit runs — already scoped to this equipment by the query param.
      if (auditRes?.ok) {
        const raw = await auditRes.json();
        const list = Array.isArray(raw) ? raw : (raw.runs ?? []);
        type RawRun = { id: string; platform?: string; results?: string | object; createdAt: string; hardwareId?: string | null };
        const parsed: AuditRunSummary[] = list.map((r: RawRun) => ({
          id: r.id,
          platform: r.platform || "UNKNOWN",
          results: typeof r.results === "string"
            ? (() => { try { return JSON.parse(r.results as string); } catch { return {}; } })()
            : ((r.results as Record<string, unknown>) ?? {}),
          createdAt: r.createdAt,
          hardwareId: r.hardwareId ?? null,
        }));
        setAuditRuns(parsed);
      }
    });
  }, [projectId, eq.id, eq.dfdDiagram]);

  const hwCount = hardware.length;
  const swCount = hardware.reduce((s, h) => s + (h.software?.length || 0), 0);
  const scPassed = assessments.filter((a) => a.result === "PASS").length;
  const scFailed = assessments.filter((a) => a.result === "FAIL").length;
  const scTotal = assessments.length || 13;

  const handleReview = async (action: "APPROVED" | "REVISION_REQUESTED") => {
    setSubmitting(true);
    try {
      const certInfo = JSON.stringify({ reviewComment: reviewNote, reviewedAt: new Date().toISOString() });
      const res = await fetch(`/api/projects/${projectId}/equipment`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: eq.id, status: action, certificationInfo: certInfo }),
      });
      if (res.ok) {
        showToast.success(action === "APPROVED" ? tx(locale, "Approved", "승인 완료", "承認完了") : tx(locale, "Revision requested", "수정 요청 완료", "修正依頼完了"));
        onBack();
      }
    } finally { setSubmitting(false); }
  };

  return (
    <div>
      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-blue-600 transition-colors mb-5">
        <ArrowLeft size={13} /> {project.vesselName} {tx(locale, "equipment list", "기자재 현황", "機器一覧")}
      </button>

      {/* Header + Action buttons */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ background: cfg.bg }}>
            <Icon size={24} style={{ color: cfg.color }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] font-extrabold text-gray-900">{eq.name}</h1>
              <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
            </div>
            <p className="text-[13px] text-gray-500 mt-0.5">
              {eq.vendors.length > 0 ? eq.vendors.map(v => v.company || v.name).join(", ") : "—"}
            </p>
          </div>
        </div>
        {eq.status === "SUBMITTED" && (
          <div className="flex items-center gap-2">
            <button disabled={submitting} onClick={() => handleReview("APPROVED")}
              className="h-9 px-4 rounded-lg bg-green-600 text-white text-[12px] font-semibold hover:bg-green-700 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50">
              <ThumbsUp size={14} /> {tx(locale, "Approve", "승인", "承認")}
            </button>
            <button disabled={submitting} onClick={() => setRevisionModalOpen(true)}
              className="h-9 px-4 rounded-lg bg-red-600 text-white text-[12px] font-semibold hover:bg-red-700 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50">
              <MessageSquare size={14} /> {tx(locale, "Reject", "반려", "差戻し")}
            </button>
          </div>
        )}
        {eq.status === "APPROVED" && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-50 border border-green-200">
            <CheckCircle size={16} className="text-green-600" />
            <span className="text-[13px] font-semibold text-green-700">{tx(locale, "Approved", "승인 완료", "承認済み")}</span>
          </div>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-6 gap-3 mb-6">
        <MiniStat label={tx(locale, "Hardware", "하드웨어", "HW")} value={hwCount} unit={tx(locale, "", "개", "")} ok={hwCount > 0} />
        <MiniStat label={tx(locale, "Software", "소프트웨어", "SW")} value={swCount} unit={tx(locale, "", "개", "")} ok={swCount > 0} />
        <MiniStat label="DFD" value={eq.dfdDiagram ? tx(locale, "Created", "생성됨", "作成済") : tx(locale, "None", "미생성", "未作成")} ok={!!eq.dfdDiagram} />
        <MiniStat label={tx(locale, "Assessment", "보안평가", "評価")} value={`${scPassed}/${scTotal}`} ok={scPassed === scTotal && scTotal > 0} warn={scFailed > 0} />
        <MiniStat label={tx(locale, "Test Proc.", "테스트절차", "テスト手順")} value={testProc ? `${(testProc.hwGroups?.reduce((s, g) => s + g.hwItems.length, 0) || 0) + (testProc.fnItems?.length || 0)}${tx(locale, "", "건", "件")}` : "—"} ok={!!testProc && ((testProc.hwGroups?.some(g => g.hwItems.length > 0)) || (testProc.fnItems?.length > 0))} />
        <MiniStat label={tx(locale, "Documents", "문서", "文書")} value={`${documents.length}${tx(locale, "", "건", "件")}`} ok={documents.length > 0} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 pb-px">
        {([
          { id: "assets" as const, label: tx(locale, "Assets", "자산 현황", "資産"), icon: Package },
          { id: "assessment" as const, label: tx(locale, "Assessment", "보안 평가", "評価"), icon: Shield },
          { id: "dfd" as const, label: "DFD", icon: Network },
          { id: "testproc" as const, label: tx(locale, "Test Procedure", "테스트 절차", "テスト手順"), icon: ClipboardList },
          { id: "documents" as const, label: tx(locale, "Documents", "벤더 제출 문서", "文書"), icon: FileText },
          { id: "risk" as const, label: tx(locale, "Risk", "리스크", "リスク"), icon: AlertTriangle },
        ]).map((t) => {
          const TIcon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-semibold border-b-2 -mb-px transition-colors",
                tab === t.id ? "border-blue-600 text-blue-700" : "border-transparent text-gray-400 hover:text-gray-600")}>
              <TIcon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="mb-8 min-h-[300px]">
        {tab === "assets" && (
          <div>
            {hardware.length === 0 ? (
              <EmptyTab icon={Cpu} text={tx(locale, "No assets registered by vendor", "벤더가 아직 자산을 등록하지 않았습니다", "ベンダー未登録")} />
            ) : (
              <AssetReviewPanel
                projectId={projectId}
                hardware={hardware}
                software={software}
                cveBySwId={cveBySwId}
                cveByHwId={cveByHwId}
                hwCveMatches={hwCveMatches}
                auditRuns={auditRuns}
                expandedHwId={expandedHwId}
                onToggleHw={(id) => setExpandedHwId((prev) => (prev === id ? null : id))}
                subTab={assetsSubTab}
                onSubTabChange={setAssetsSubTab}
                locale={locale}
              />
            )}
          </div>
        )}

        {tab === "assessment" && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {hardware.length === 0 ? (
              <EmptyTab icon={Shield} text={tx(locale, "Register hardware first to record SC results", "먼저 하드웨어를 등록하세요", "ハードウェア未登録")} />
            ) : (
              SC_NAMES.map((name, i) => {
                const checkId = `SC-${i + 1}`;
                const result = assessments.find((a) => a.checkId === checkId)?.result || "NOT_CHECKED";
                const isUpdating = updatingAssessKey === checkId;
                return (
                  <div key={i} className={cn("flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 transition-colors",
                    result === "FAIL" && "bg-red-50/50",
                    isUpdating && "opacity-60")}>
                    <div className={cn("h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                      result === "PASS" ? "bg-green-100 text-green-600" :
                      result === "FAIL" ? "bg-red-100 text-red-600" :
                      result === "PARTIAL" ? "bg-orange-100 text-orange-600" :
                      result === "NOT_APPLICABLE" ? "bg-gray-100 text-gray-400" :
                      "bg-gray-100 text-gray-400")}>
                      {result === "PASS" ? "✓" : result === "FAIL" ? "✗" : result === "PARTIAL" ? "!" : "—"}
                    </div>
                    <span className="text-[12px] font-semibold text-gray-600 w-12">{checkId}</span>
                    <span className="text-[12px] text-gray-700 flex-1">{name}</span>
                    {canReview ? (
                      <select
                        value={result}
                        onChange={(e) => updateScResult(checkId, e.target.value)}
                        disabled={isUpdating}
                        className={cn(
                          "rounded-md border px-2 py-1 text-[11px] font-bold focus:outline-none focus:ring-2 focus:ring-brand/20 cursor-pointer",
                          result === "PASS" ? "border-green-200 bg-green-50 text-green-700" :
                          result === "FAIL" ? "border-red-200 bg-red-50 text-red-700" :
                          result === "PARTIAL" ? "border-orange-200 bg-orange-50 text-orange-700" :
                          "border-gray-200 bg-white text-gray-400"
                        )}
                      >
                        <option value="NOT_CHECKED">{tx(locale, "Not checked", "미확인", "未確認")}</option>
                        <option value="PASS">{tx(locale, "PASS", "PASS", "合格")}</option>
                        <option value="FAIL">{tx(locale, "FAIL", "FAIL", "不合格")}</option>
                        <option value="PARTIAL">{tx(locale, "PARTIAL", "일부", "一部")}</option>
                        <option value="NOT_APPLICABLE">N/A</option>
                      </select>
                    ) : (
                      <span className={cn("text-[11px] font-bold",
                        result === "PASS" ? "text-green-600" :
                        result === "FAIL" ? "text-red-600" :
                        result === "PARTIAL" ? "text-orange-600" :
                        "text-gray-300")}>
                        {result === "PASS" ? "PASS" :
                         result === "FAIL" ? "FAIL" :
                         result === "PARTIAL" ? tx(locale, "PARTIAL", "일부", "一部") :
                         result === "NOT_APPLICABLE" ? "N/A" :
                         tx(locale, "Not checked", "미확인", "未確認")}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === "dfd" && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {!eq.dfdDiagram ? (
              <div className="p-6"><EmptyTab icon={Network} text={tx(locale, "DFD not created by vendor yet", "벤더가 아직 DFD를 생성하지 않았습니다", "DFD未作成")} /></div>
            ) : (
              <div className="h-[500px]">
                <DfdEditor projectId={projectId} hardware={hardware as never[]} equipmentId={eq.id} readOnly />
              </div>
            )}
          </div>
        )}

        {tab === "testproc" && (
          <div className="space-y-6">
            {!testProc || (testProc.hwGroups?.every(g => g.hwItems.length === 0) && (!testProc.fnItems || testProc.fnItems.length === 0)) ? (
              <EmptyTab icon={ClipboardList} text={tx(locale, "No test procedure items registered", "등록된 테스트 절차 항목이 없습니다", "テスト手順項目が登録されていません")} />
            ) : (
              <>
                {/* HW 그룹별 항목 */}
                {testProc.hwGroups?.filter(g => g.hwItems.length > 0).map(grp => (
                  <div key={grp.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
                      <Cpu size={14} className="text-violet-600" />
                      <span className="text-[13px] font-bold text-gray-900">{grp.label}</span>
                      <span className="text-[11px] text-gray-400">{(() => { try { return JSON.parse(grp.hardwareIds).length; } catch { return 0; } })()}{tx(locale, " devices", "개 기기", "台")}</span>
                    </div>
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/50">
                          <th className="text-left px-4 py-2 font-bold text-gray-400 w-10">NO</th>
                          <th className="text-left px-4 py-2 font-bold text-gray-400 w-[25%]">{tx(locale, "Category", "분류", "カテゴリー")}</th>
                          <th className="text-left px-4 py-2 font-bold text-gray-400 w-[35%]">{tx(locale, "Criteria", "기준", "基準")}</th>
                          <th className="text-left px-4 py-2 font-bold text-gray-400">{tx(locale, "Method", "방법", "方法")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {grp.hwItems.map((item, i) => (
                          <tr key={i}>
                            <td className="px-4 py-2 text-gray-400 font-mono">{i + 1}</td>
                            <td className="px-4 py-2 text-gray-700">{item.category || "—"}</td>
                            <td className="px-4 py-2 text-gray-700 whitespace-pre-wrap">{item.criteria || "—"}</td>
                            <td className="px-4 py-2 text-gray-700 whitespace-pre-wrap">{item.method || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}

                {/* FN 항목 (SW별 + 섹션별 그룹) */}
                {testProc.fnItems && testProc.fnItems.length > 0 && (() => {
                  const sections = [...new Set(testProc.fnItems.map(i => `${i.softwareName || "—"}:::${i.section}`))];
                  return sections.map(key => {
                    const [swName, section] = key.split(":::");
                    const items = testProc.fnItems.filter(i => (i.softwareName || "—") === swName && i.section === section);
                    return (
                      <div key={key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
                          <ClipboardList size={14} className="text-blue-600" />
                          <span className="text-[13px] font-bold text-gray-900">{section}</span>
                          <span className="text-[11px] text-gray-400">— {swName}</span>
                        </div>
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/50">
                              <th className="text-left px-4 py-2 font-bold text-gray-400 w-10">NO</th>
                              <th className="text-left px-4 py-2 font-bold text-gray-400 w-[25%]">{tx(locale, "Category", "분류", "カテゴリー")}</th>
                              <th className="text-left px-4 py-2 font-bold text-gray-400 w-[35%]">{tx(locale, "Criteria", "기준", "基準")}</th>
                              <th className="text-left px-4 py-2 font-bold text-gray-400">{tx(locale, "Method", "방법", "方法")}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {items.map((item, i) => (
                              <tr key={i}>
                                <td className="px-4 py-2 text-gray-400 font-mono">{i + 1}</td>
                                <td className="px-4 py-2 text-gray-700">{item.category || "—"}</td>
                                <td className="px-4 py-2 text-gray-700 whitespace-pre-wrap">{item.criteria || "—"}</td>
                                <td className="px-4 py-2 text-gray-700 whitespace-pre-wrap">{item.method || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  });
                })()}
              </>
            )}
          </div>
        )}

        {tab === "documents" && (
          <div className="space-y-2">
            {documents.length === 0 ? (
              <EmptyTab icon={FileText} text={tx(locale, "No documents generated by vendor", "벤더가 아직 문서를 생성하지 않았습니다", "文書未生成")} />
            ) : documents.map((doc) => (
              <div key={doc.id} className="flex items-center gap-4 bg-white rounded-xl border border-gray-200 px-4 py-3">
                <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                  <FileText size={16} className="text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900">{doc.title || doc.docType}</p>
                  <p className="text-[11px] text-gray-400">{doc.docType} · v{doc.version}</p>
                </div>
                <button onClick={() => window.open(`/api/projects/${projectId}/documents/${doc.id}/preview`, "_blank")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors">
                  <Eye size={12} /> {tx(locale, "Preview", "미리보기", "プレビュー")}
                </button>
                <button onClick={() => window.open(`/api/projects/${projectId}/documents/${doc.id}/download`, "_blank")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">
                  <Download size={12} /> {tx(locale, "Download", "다운로드", "DL")}
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === "risk" && (
          <div className="space-y-2">
            {canReview && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" onClick={openAddRisk}>
                  <Plus size={14} /> {tx(locale, "Add risk", "리스크 추가", "リスク追加")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={autoGenerateFromCve}
                  loading={autoGenBusy}
                  title={tx(locale,
                    "Generate risks automatically from CVE matches",
                    "CVE 매칭 기반으로 리스크 자동 생성",
                    "CVE一致からリスクを自動生成")}
                >
                  {!autoGenBusy && <Shield size={14} />}
                  {tx(locale, "Generate from CVE", "CVE 기반 자동 생성", "CVEから自動生成")}
                </Button>
              </div>
            )}

            {/* Inline create form — expands under the button row */}
            <AnimatePresence initial={false}>
              {canReview && addRiskOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                  className="overflow-hidden"
                >
                  <div className="bg-white rounded-xl border border-brand/20 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand">
                        {tx(locale, "New risk entry", "새 리스크 추가", "新しいリスク")}
                      </p>
                      <button
                        onClick={() => setAddRiskOpen(false)}
                        className="p-1 rounded hover:bg-surface-secondary text-text-tertiary hover:text-text transition-colors"
                        aria-label={tx(locale, "Close", "닫기", "閉じる")}
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-2.5">
                      <label className="md:col-span-2 flex flex-col gap-1">
                        <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-text-tertiary">{tx(locale, "Threat ID", "위협 ID", "脅威ID")}</span>
                        <input
                          value={riskForm.threatId}
                          onChange={(e) => setRiskForm({ ...riskForm, threatId: e.target.value })}
                          className="rounded-md border border-border bg-white px-2.5 py-1.5 text-[12px] font-mono focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                          placeholder="T-007"
                        />
                      </label>
                      <label className="md:col-span-4 flex flex-col gap-1">
                        <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-text-tertiary">{tx(locale, "Asset / Scenario", "자산 / 시나리오", "資産 / シナリオ")}</span>
                        <input
                          value={riskForm.assetRef}
                          onChange={(e) => setRiskForm({ ...riskForm, assetRef: e.target.value })}
                          className="rounded-md border border-border bg-white px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                          placeholder={tx(locale, "e.g. Bridge LAN — unauthorized access", "예: 브리지 LAN — 비인가 접근", "例: ブリッジLAN — 不正アクセス")}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-text-tertiary">{tx(locale, "Likelihood", "가능성", "可能性")}</span>
                        <select
                          value={riskForm.likelihood}
                          onChange={(e) => setRiskForm({ ...riskForm, likelihood: parseInt(e.target.value) })}
                          className="rounded-md border border-border bg-white px-2 py-1.5 text-[12px] font-bold focus:outline-none focus:border-brand"
                        >
                          {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-text-tertiary">{tx(locale, "Impact", "영향도", "影響度")}</span>
                        <select
                          value={riskForm.impact}
                          onChange={(e) => setRiskForm({ ...riskForm, impact: parseInt(e.target.value) })}
                          className="rounded-md border border-border bg-white px-2 py-1.5 text-[12px] font-bold focus:outline-none focus:border-brand"
                        >
                          {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </label>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-text-tertiary">{tx(locale, "Score", "점수", "スコア")}</span>
                        <div className="h-[34px] inline-flex items-center justify-center rounded-md border border-border bg-surface-secondary/40 px-2 font-mono text-[13px] font-bold tabular-nums"
                          style={{ color:
                            (riskForm.likelihood * riskForm.impact) >= 20 ? "#DA1E28" :
                            (riskForm.likelihood * riskForm.impact) >= 12 ? "#EB6200" :
                            (riskForm.likelihood * riskForm.impact) >= 6 ? "#9a6a00" : "#24A148" }}>
                          {riskForm.likelihood * riskForm.impact}
                        </div>
                      </div>
                      <label className="md:col-span-2 flex flex-col gap-1">
                        <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-text-tertiary">{tx(locale, "Status", "상태", "状態")}</span>
                        <select
                          value={riskForm.status}
                          onChange={(e) => setRiskForm({ ...riskForm, status: e.target.value })}
                          className="rounded-md border border-border bg-white px-2 py-1.5 text-[12px] font-bold focus:outline-none focus:border-brand"
                        >
                          <option value="OPEN">{tx(locale, "OPEN", "미조치", "未対応")}</option>
                          <option value="MITIGATED">{tx(locale, "MITIGATED", "완화", "緩和")}</option>
                          <option value="ACCEPTED">{tx(locale, "ACCEPTED", "수용", "受容")}</option>
                          <option value="TRANSFERRED">{tx(locale, "TRANSFERRED", "이전", "転嫁")}</option>
                        </select>
                      </label>
                      <label className="md:col-span-6 flex flex-col gap-1">
                        <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-text-tertiary">{tx(locale, "Mitigation", "완화 조치", "緩和策")}</span>
                        <textarea
                          value={riskForm.mitigation}
                          onChange={(e) => setRiskForm({ ...riskForm, mitigation: e.target.value })}
                          rows={2}
                          className="rounded-md border border-border bg-white px-2.5 py-1.5 text-[12px] resize-none focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                          placeholder={tx(locale, "Describe the control or mitigation plan", "완화 조치 / 통제 방안 설명", "緩和策 / 対策の説明")}
                        />
                      </label>
                    </div>
                    <div className="flex justify-end gap-2 mt-3">
                      <Button size="sm" variant="outline" onClick={() => setAddRiskOpen(false)} disabled={addRiskSaving}>
                        {tx(locale, "Cancel", "취소", "キャンセル")}
                      </Button>
                      <Button size="sm" onClick={submitAddRisk} loading={addRiskSaving}>
                        {tx(locale, "Save risk", "리스크 저장", "リスク保存")}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {risks.length === 0 ? (
              <EmptyTab icon={AlertTriangle} text={tx(locale, "No risk entries registered", "등록된 리스크가 없습니다", "リスクなし")} />
            ) : (
              <>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((level) => {
                    const count = risks.filter((r) => {
                      const score = r.riskLevel || r.likelihood * r.impact;
                      if (level === "CRITICAL") return score >= 20;
                      if (level === "HIGH") return score >= 10 && score < 20;
                      if (level === "MEDIUM") return score >= 5 && score < 10;
                      return score < 5;
                    }).length;
                    const colors = { CRITICAL: "#DA1E28", HIGH: "#EB6200", MEDIUM: "#F1C21B", LOW: "#24A148" };
                    return (
                      <div key={level} className="text-center px-3 py-2 rounded-lg border border-gray-200" style={{ background: `${colors[level]}08` }}>
                        <p className="text-[18px] font-bold" style={{ color: colors[level] }}>{count}</p>
                        <p className="text-[9px] font-bold" style={{ color: colors[level] }}>{level}</p>
                      </div>
                    );
                  })}
                </div>
                {risks.map((r) => {
                  const score = r.riskLevel || r.likelihood * r.impact;
                  const level = score >= 20 ? "CRITICAL" : score >= 10 ? "HIGH" : score >= 5 ? "MEDIUM" : "LOW";
                  const colors: Record<string, string> = { CRITICAL: "#DA1E28", HIGH: "#EB6200", MEDIUM: "#F1C21B", LOW: "#24A148" };
                  const statusColors: Record<string, string> = { OPEN: "#DA1E28", MITIGATED: "#24A148", ACCEPTED: "#0F62FE", TRANSFERRED: "#8D8D8D" };
                  const parsed = canSeeReasoning ? parseReasoning(r.reasoning) : null;
                  const showHover = !!parsed;
                  const isUpdating = updatingRiskId === r.id;
                  const isDeleting = deletingRiskId === r.id;
                  return (
                    <div key={r.id} className={cn("bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-start gap-3 transition-opacity group/risk", (isUpdating || isDeleting) && "opacity-60")}>
                      <span
                        className={cn("relative inline-block group/score shrink-0", showHover && "cursor-help")}
                        tabIndex={showHover ? 0 : -1}
                      >
                        <span
                          className="h-9 w-9 rounded-lg flex items-center justify-center text-[10px] font-bold text-white relative tabular-nums"
                          style={{ background: colors[level] }}
                        >
                          {score}
                          {showHover && parsed?.inputs?.kevKnown && (
                            <span
                              className="absolute -top-1 -right-1 h-2 w-2 rounded-full ring-2 ring-white"
                              style={{ background: colors.CRITICAL }}
                              title="CISA KEV"
                            />
                          )}
                        </span>
                        {showHover && parsed && (
                          <span className="invisible opacity-0 group-hover/score:visible group-hover/score:opacity-100 group-focus-within/score:visible group-focus-within/score:opacity-100 transition-opacity duration-100">
                            <RiskReasoningHover reasoning={parsed} locale={locale} />
                          </span>
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-bold text-gray-900">{r.threatId}</span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-[0.06em]" style={{ background: `${colors[level]}15`, color: colors[level] }}>{level}</span>
                          {r.cveId && (
                            <a
                              href={`https://nvd.nist.gov/vuln/detail/${r.cveId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-[9px] font-bold text-brand hover:underline"
                            >
                              {r.cveId}
                            </a>
                          )}
                        </div>
                        {r.assetRef && (
                          <p className="text-[11px] text-gray-600 mt-0.5 truncate">{r.assetRef}</p>
                        )}
                        {canReview ? (
                          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                            {/* Likelihood / Impact dropdowns */}
                            <label className="inline-flex items-center gap-1 text-[10px] font-mono text-text-tertiary">
                              <span>L</span>
                              <select
                                value={r.likelihood}
                                onChange={(e) => updateRisk(r.id, "likelihood", parseInt(e.target.value))}
                                disabled={isUpdating}
                                className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] font-bold text-gray-900 cursor-pointer focus:outline-none focus:border-brand"
                              >
                                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </label>
                            <span className="text-[10px] font-mono text-text-tertiary">×</span>
                            <label className="inline-flex items-center gap-1 text-[10px] font-mono text-text-tertiary">
                              <span>I</span>
                              <select
                                value={r.impact}
                                onChange={(e) => updateRisk(r.id, "impact", parseInt(e.target.value))}
                                disabled={isUpdating}
                                className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] font-bold text-gray-900 cursor-pointer focus:outline-none focus:border-brand"
                              >
                                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </label>
                            <span className="text-[10px] font-mono text-text-tertiary">=</span>
                            <span className="font-mono text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded" style={{ background: `${colors[level]}15`, color: colors[level] }}>{score}</span>
                            {/* Status dropdown */}
                            <select
                              value={r.status}
                              onChange={(e) => updateRisk(r.id, "status", e.target.value)}
                              disabled={isUpdating}
                              className="rounded border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-bold cursor-pointer focus:outline-none focus:border-brand ml-1"
                              style={{ color: statusColors[r.status] || "#8D8D8D" }}
                            >
                              <option value="OPEN">{tx(locale, "OPEN", "미조치", "未対応")}</option>
                              <option value="MITIGATED">{tx(locale, "MITIGATED", "완화", "緩和")}</option>
                              <option value="ACCEPTED">{tx(locale, "ACCEPTED", "수용", "受容")}</option>
                              <option value="TRANSFERRED">{tx(locale, "TRANSFERRED", "이전", "転嫁")}</option>
                            </select>
                          </div>
                        ) : (
                          <div className="mt-1 flex items-center gap-2">
                            <p className="text-[11px] text-gray-500 font-mono">L {r.likelihood} × I {r.impact} = <span className="font-bold" style={{ color: colors[level] }}>{score}</span></p>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: `${statusColors[r.status] || "#8D8D8D"}15`, color: statusColors[r.status] || "#8D8D8D" }}>{r.status}</span>
                          </div>
                        )}
                        {/* Mitigation — editable inline for reviewers */}
                        {canReview ? (
                          <MitigationEditor
                            value={r.mitigation || ""}
                            onSave={(v) => updateRisk(r.id, "mitigation", v)}
                            locale={locale}
                            disabled={isUpdating}
                          />
                        ) : (
                          r.mitigation && <p className="text-[11px] text-gray-500 mt-1">· {r.mitigation}</p>
                        )}
                      </div>
                      {canReview && (
                        <button
                          onClick={() => setRiskDeleteTarget(r.id)}
                          disabled={isDeleting}
                          className="self-start p-1.5 rounded-md text-text-tertiary opacity-0 group-hover/risk:opacity-100 hover:text-safety-high hover:bg-risk-bg transition-all shrink-0"
                          title={tx(locale, "Delete risk", "리스크 삭제", "リスク削除")}
                          aria-label={tx(locale, "Delete risk", "리스크 삭제", "リスク削除")}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>

      {/* Revision request modal */}
      {revisionModalOpen && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onMouseDown={(e) => { if (e.target === e.currentTarget) setRevisionModalOpen(false); }}>
          <div className="bg-white rounded-xl p-6 w-[480px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[16px] font-bold text-red-700 mb-1">{tx(locale, "Reject & Request Revision", "반려 사유 작성", "差戻し理由記入")}</h3>
            <p className="text-[12px] text-gray-500 mb-4">{tx(locale, "Please describe the reason for rejection", "반려 사유를 구체적으로 작성해주세요", "差戻し理由を具体적으로 記入してください")}</p>
            <textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)}
              placeholder={tx(locale, "e.g. SC-5 network segmentation FAIL, DFD missing...", "예: SC-5 네트워크 분리 FAIL, DFD 미생성...", "例: SC-5ネットワーク分離FAIL...")}
              rows={4} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-400 resize-none mb-4" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRevisionModalOpen(false)} className="px-4 py-2 text-[12px] text-gray-500 hover:bg-gray-100 rounded-lg">{tx(locale, "Cancel", "취소", "キャンセル")}</button>
              <button disabled={submitting || !reviewNote.trim()} onClick={() => { handleReview("REVISION_REQUESTED"); setRevisionModalOpen(false); }}
                className="px-5 py-2 rounded-lg bg-red-600 text-white text-[12px] font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5">
                <MessageSquare size={13} /> {tx(locale, "Submit Rejection", "반려", "差戻し")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Risk delete confirmation — replaces the native browser confirm() */}
      <ConfirmDialog
        open={!!riskDeleteTarget}
        onClose={() => setRiskDeleteTarget(null)}
        onConfirm={confirmDeleteRisk}
        title={tx(locale, "Delete risk?", "리스크 삭제", "リスク削除")}
        description={tx(
          locale,
          "This risk entry will be permanently removed. This cannot be undone.",
          "이 리스크가 영구 삭제됩니다. 되돌릴 수 없습니다.",
          "このリスクは完全に削除されます。取り消しできません。",
        )}
        confirmLabel={tx(locale, "Delete", "삭제", "削除")}
        cancelLabel={tx(locale, "Cancel", "취소", "キャンセル")}
        loading={!!deletingRiskId}
      />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatusCard({ label, value, sub, color, active, onClick }: {
  label: string; value: string; sub: string; color: string; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={cn("bg-white rounded-xl border p-4 text-left transition-all",
      active ? "border-blue-400 ring-2 ring-blue-100 shadow-sm" : "border-gray-200 hover:border-gray-300 hover:shadow-sm")}>
      <p className="text-[10px] text-gray-400">{label}</p>
      <p className="text-[22px] font-black tabular-nums leading-none mt-1" style={{ color }}>{value}</p>
      <p className="text-[10px] text-gray-400 mt-1.5">{sub}</p>
    </button>
  );
}

function MiniStat({ label, value, unit, ok, warn }: { label: string; value: string | number; unit?: string; ok: boolean; warn?: boolean }) {
  return (
    <div className={cn("px-4 py-3 rounded-lg border text-center",
      warn ? "bg-red-50/50 border-red-200" : ok ? "bg-green-50/50 border-green-200" : "bg-gray-50/50 border-gray-200")}>
      <p className="text-[10px] text-gray-400">{label}</p>
      <p className={cn("text-[16px] font-bold mt-0.5", warn ? "text-red-600" : ok ? "text-green-600" : "text-gray-400")}>{value}{unit || ""}</p>
    </div>
  );
}

function EmptyTab({ icon: Icon, text }: { icon: React.ElementType<{size?: number; className?: string}>; text: string }) {
  return (
    <div className="py-12 text-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
      <Icon size={28} className="mx-auto text-gray-300 mb-2" />
      <p className="text-[13px] text-gray-400">{text}</p>
    </div>
  );
}

// ─── Asset review panel (SUPPORT/ADMIN read-only view of HW + SW + audit runs) ─

const HW_ICON_MAP: Record<string, React.ElementType<{ size?: number; className?: string }>> = {
  PLC: Cpu,
  SERVER: Server,
  SENSOR: Radio,
  NETWORK_DEVICE: Network,
  PC: Monitor,
  OTHER_DEVICE: HardDrive,
};

const SW_TYPE_SHORT: Record<string, string> = {
  OS: "OS",
  APPLICATION: "APP",
  FIRMWARE: "FW",
  DRIVER: "DRV",
  LIBRARY: "LIB",
  MIDDLEWARE: "MW",
};

function AssetReviewPanel({
  projectId,
  hardware,
  software,
  cveBySwId,
  cveByHwId,
  hwCveMatches,
  auditRuns,
  expandedHwId,
  onToggleHw,
  subTab,
  onSubTabChange,
  locale,
}: {
  projectId: string;
  hardware: HwItem[];
  software: SwItem[];
  cveBySwId: Map<string, SeverityCounts>;
  cveByHwId: Map<string, SeverityCounts>;
  hwCveMatches: Map<string, ViewerCveMatch[]>;
  auditRuns: AuditRunSummary[];
  expandedHwId: string | null;
  onToggleHw: (id: string) => void;
  subTab: "inventory" | "audit";
  onSubTabChange: (v: "inventory" | "audit") => void;
  locale: string;
}) {
  // CVE detail sidebar — reviewer sees the same list the vendor sees, but
  // read-only (canDelete=false) so removing "not applicable" matches stays
  // scoped to vendors who own the submission.
  const [cveSidebarHwId, setCveSidebarHwId] = useState<string | null>(null);
  // Aggregated CVE footprint for the summary bar — scoped to this equipment.
  // The map is populated from the project-wide /cve-matches payload, so we
  // must filter by the local hardware/software IDs or the summary would
  // include CVE counts from other equipments in the same project.
  const aggregate = emptySeverity();
  for (const hw of hardware) {
    const c = cveByHwId.get(hw.id);
    if (!c) continue;
    aggregate.total += c.total;
    aggregate.critical += c.critical;
    aggregate.high += c.high;
    aggregate.medium += c.medium;
    aggregate.low += c.low;
    aggregate.unknown += c.unknown;
  }
  for (const sw of software) {
    const c = cveBySwId.get(sw.id);
    if (!c) continue;
    aggregate.total += c.total;
    aggregate.critical += c.critical;
    aggregate.high += c.high;
    aggregate.medium += c.medium;
    aggregate.low += c.low;
    aggregate.unknown += c.unknown;
  }

  // Per-HW effective severity (HW-direct + linked SW) for the row badge
  const effectiveHwCve = (hwId: string): SeverityCounts => {
    const acc = { ...(cveByHwId.get(hwId) || emptySeverity()) };
    for (const sw of software.filter((s) => s.hardwareId === hwId)) {
      const c = cveBySwId.get(sw.id);
      if (!c) continue;
      acc.total += c.total;
      acc.critical += c.critical;
      acc.high += c.high;
      acc.medium += c.medium;
      acc.low += c.low;
      acc.unknown += c.unknown;
    }
    return acc;
  };

  const unlinkedSw = software.filter((s) => !s.hardwareId);
  const missingCpe = software.filter((s) => !s.cpe).length;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <Cpu size={14} className="text-gray-400" />
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{tx(locale, "HW", "HW", "HW")}</span>
          <span className="text-[13px] font-bold text-gray-900">{hardware.length}</span>
        </div>
        <span className="h-4 w-px bg-gray-200" />
        <div className="flex items-center gap-2">
          <Package size={14} className="text-gray-400" />
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">SW</span>
          <span className="text-[13px] font-bold text-gray-900">{software.length}</span>
        </div>
        <span className="h-4 w-px bg-gray-200" />
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">CVE</span>
          {aggregate.total > 0 ? <CveBadge counts={aggregate} size="sm" /> : <span className="text-[11px] text-gray-300">—</span>}
        </div>
        {missingCpe > 0 && (
          <>
            <span className="h-4 w-px bg-gray-200" />
            <span className="inline-flex items-center gap-1 text-[10px] text-safety-elevated font-mono font-bold tabular-nums">
              <AlertCircle size={10} strokeWidth={2.5} />
              {missingCpe} {tx(locale, "without CPE", "CPE 누락", "CPE未登録")}
            </span>
          </>
        )}
        <span className="flex-1" />
        <div className="inline-flex items-center rounded-lg border border-gray-200 bg-surface-secondary/40 p-0.5 text-[11px] font-bold">
          <button
            onClick={() => onSubTabChange("inventory")}
            className={cn("px-3 py-1 rounded transition-colors", subTab === "inventory" ? "bg-white text-text shadow-sm" : "text-text-tertiary hover:text-text")}
          >
            {tx(locale, "Inventory", "자산 목록", "資産一覧")}
          </button>
          <button
            onClick={() => onSubTabChange("audit")}
            className={cn("px-3 py-1 rounded transition-colors inline-flex items-center gap-1.5", subTab === "audit" ? "bg-white text-text shadow-sm" : "text-text-tertiary hover:text-text")}
          >
            <Shield size={11} />
            {tx(locale, "Audit Runs", "점검 결과", "監査結果")}
            <span className="font-mono text-[9px] text-text-tertiary tabular-nums">({auditRuns.length})</span>
          </button>
        </div>
      </div>

      {subTab === "inventory" && (
        <div className="space-y-2">
          {hardware.map((hw) => {
            const hwSev = effectiveHwCve(hw.id);
            const HwIcon = HW_ICON_MAP[hw.type] || HardDrive;
            const swList = software.filter((s) => s.hardwareId === hw.id);
            const expanded = expandedHwId === hw.id;
            return (
              <div key={hw.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <button
                  onClick={() => onToggleHw(hw.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-secondary/40 transition-colors text-left"
                >
                  <div className="h-9 w-9 rounded-lg bg-brand-lighter flex items-center justify-center shrink-0">
                    <HwIcon size={15} className="text-brand" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-bold text-gray-900 truncate">{hw.name}</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-100 text-gray-600">{hw.type}</span>
                      {hw.zone && <span className="text-[10px] text-gray-400">· {hw.zone}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-gray-400">
                      {hw.manufacturer && <span>{hw.manufacturer}</span>}
                      {hw.model && <span className="font-mono">{hw.model}</span>}
                      {hw.ipAddress && <span className="font-mono">{hw.ipAddress}</span>}
                      <span>SW {swList.length}</span>
                    </div>
                  </div>
                  {hwSev.total > 0 ? (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); setCveSidebarHwId(hw.id); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          setCveSidebarHwId(hw.id);
                        }
                      }}
                      className="inline-flex items-center rounded-full hover:scale-105 active:scale-95 transition-transform cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                      title={tx(locale, "View CVE details", "CVE 상세 보기", "CVE詳細を表示")}
                    >
                      <CveBadge counts={hwSev} />
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-300">—</span>
                  )}
                  <ChevronDown size={14} className={cn("text-gray-400 transition-transform", expanded && "rotate-180")} />
                </button>
                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden border-t border-gray-100"
                    >
                      {swList.length === 0 ? (
                        <p className="px-4 py-3 text-[11px] text-gray-400 italic">
                          {tx(locale, "No linked SW", "연결된 SW 없음", "リンクされたSWなし")}
                        </p>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {swList.map((sw) => {
                            const swCve = cveBySwId.get(sw.id);
                            return (
                              <div key={sw.id} className="px-4 py-2.5 pl-14 flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[12px] font-semibold text-gray-800 truncate">{sw.name}</span>
                                    {sw.version && (
                                      <span className="font-mono text-[10px] text-gray-600 bg-surface-secondary/70 px-1.5 py-0.5 rounded border border-gray-200">{sw.version}</span>
                                    )}
                                    {sw.vendor && <span className="text-[10px] text-gray-400">· {sw.vendor}</span>}
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                    {sw.cpe ? (
                                      <span className="cpe-chip" title={sw.cpe}>{sw.cpe}</span>
                                    ) : (
                                      <span className="cpe-chip cpe-chip--missing">{tx(locale, "no CPE", "CPE 없음", "CPEなし")}</span>
                                    )}
                                    {sw.listeningPort && (
                                      <span className="font-mono text-[10px] text-gray-400 inline-flex items-center gap-0.5">
                                        <Globe size={9} />{sw.listeningPort}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 pt-0.5">
                                  {swCve && swCve.total > 0 && <CveBadge counts={swCve} />}
                                  <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-gray-100 text-gray-600">
                                    {SW_TYPE_SHORT[sw.swType] || sw.swType}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}

          {unlinkedSw.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 bg-surface-secondary/30 flex items-center gap-2">
                <AlertCircle size={12} className="text-safety-elevated" />
                <span className="text-[11px] font-bold text-gray-600">{tx(locale, "Unlinked SW", "미연결 SW", "未接続SW")}</span>
                <span className="font-mono text-[10px] text-gray-400">({unlinkedSw.length})</span>
              </div>
              <div className="divide-y divide-gray-100">
                {unlinkedSw.map((sw) => {
                  const swCve = cveBySwId.get(sw.id);
                  return (
                    <div key={sw.id} className="px-4 py-2 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="text-[12px] text-gray-800 truncate">{sw.name}</span>
                        {sw.version && <span className="ml-2 font-mono text-[10px] text-gray-400">{sw.version}</span>}
                      </div>
                      {swCve && swCve.total > 0 && <CveBadge counts={swCve} />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === "audit" && (
        <AuditRunsList
          auditRuns={auditRuns}
          hwCveMatches={hwCveMatches}
          hardware={hardware.map((h) => ({ id: h.id, name: h.name }))}
          locale={locale}
        />
      )}

      <CveSidebar
        open={!!cveSidebarHwId}
        hwId={cveSidebarHwId}
        hwName={hardware.find((h) => h.id === cveSidebarHwId)?.name || ""}
        projectId={projectId}
        locale={locale}
        canDelete={false}
        hardwareSoftwareIds={cveSidebarHwId ? software.filter((s) => s.hardwareId === cveSidebarHwId).map((s) => s.id) : []}
        onClose={() => setCveSidebarHwId(null)}
      />
    </div>
  );
}

// ─── Risk mitigation inline editor ──────────────────────────────────────────

/**
 * Inline mitigation editor — shows a plain text line with a pencil affordance,
 * morphs into a textarea on click, and patches the backend on blur or Enter.
 * Keeps the risk row compact by avoiding a modal dialog.
 */
function MitigationEditor({
  value, onSave, locale, disabled,
}: {
  value: string;
  onSave: (next: string) => void;
  locale: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  if (!editing) {
    return (
      <button
        onClick={() => !disabled && setEditing(true)}
        disabled={disabled}
        className="mt-1.5 block w-full text-left group/mit"
      >
        <p className="text-[11px] text-gray-500 leading-relaxed flex items-start gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-text-tertiary shrink-0 pt-px">
            {tx(locale, "Mitigation", "완화 조치", "緩和策")}
          </span>
          <span className={cn("flex-1", !value && "italic text-gray-400")}>
            {value || tx(locale, "Click to add mitigation…", "클릭하여 완화 조치 입력…", "クリックして対策を入力…")}
          </span>
          <Edit2 size={10} className="text-text-tertiary shrink-0 opacity-0 group-hover/mit:opacity-100 transition-opacity" />
        </p>
      </button>
    );
  }

  return (
    <div className="mt-1.5">
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
        }}
        rows={2}
        className="w-full rounded-lg border border-brand/40 bg-white px-2.5 py-1.5 text-[11px] text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-brand/20"
        placeholder={tx(locale, "Describe mitigation / controls applied", "완화 조치 / 통제 조치를 기입하세요", "緩和策 / 対策を記入")}
      />
      <p className="text-[9px] text-text-tertiary mt-0.5">
        {tx(locale, "⌘+Enter to save · Esc to cancel", "⌘+Enter 저장 · Esc 취소", "⌘+Enter 保存 · Esc キャンセル")}
      </p>
    </div>
  );
}
