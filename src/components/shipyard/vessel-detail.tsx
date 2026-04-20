"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Ship, Shield, FileText, Package, Cpu, Server, Monitor, Radio, HardDrive, Network,
  CheckCircle, Clock, AlertTriangle, Eye, ThumbsUp, MessageSquare, X, ClipboardList,
  ChevronRight, ArrowLeft, Download, Plus, Edit2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { DfdEditor } from "@/components/dfd/dfd-editor";
import { InlineEditor } from "@/components/inventory/inline-editor";
import { RiskReasoningHover, parseReasoning, canSeeRiskReasoning } from "@/components/risk/risk-reasoning-hover";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Equipment {
  id: string; name: string; status: string; description: string | null;
  vendors: { id: string; name: string; company: string | null }[];
  _count: { hardware: number; software: number };
  dfdDiagram?: { id: string } | null;
  updatedAt?: string;
}

interface HwItem { id: string; name: string; type: string; manufacturer: string | null; model: string | null; ipAddress: string | null; zone: string | null; category: string | null; software: { id: string; name: string; version: string | null }[] }
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
    if (!confirm(tx(locale, "Are you sure you want to delete this equipment? All related hardware, software, and assessments will be permanently removed.", "정말 이 기자재를 삭제하시겠습니까? 관련된 모든 하드웨어, 소프트웨어, 보안평가 데이터가 영구 삭제됩니다.", "この機器を削除してもよろしいですか？"))) return;
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
                        onClick={(e) => { e.stopPropagation(); handleDeleteEquipment(eq.id); }}
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
  const [testProc, setTestProc] = useState<{ status: string; hwGroups: { id: string; label: string; hardwareIds: string; hwItems: { no: number; category: string; criteria: string; method: string }[] }[]; fnItems: { softwareName: string | null; section: string; no: number; category: string; criteria: string; method: string }[] } | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}/hardware?equipmentId=${eq.id}`).then(async (r) => r.ok ? r.json() : []),
      fetch(`/api/projects/${projectId}/assessments`).then(async (r) => r.ok ? r.json() : []),
      fetch(`/api/projects/${projectId}/documents?equipmentId=${eq.id}`).then(async (r) => r.ok ? r.json() : []),
      fetch(`/api/projects/${projectId}/risks`).then(async (r) => r.ok ? r.json() : []),
      fetch(`/api/projects/${projectId}/test-procedure?equipmentId=${eq.id}`).then(async (r) => r.ok ? r.json() : null),
    ]).then(([hw, assess, docs, riskData, tp]) => {
      setHardware(hw);
      setAssessments(assess);
      setDocuments(Array.isArray(docs) ? docs : []);
      setRisks(Array.isArray(riskData) ? riskData : []);
      setTestProc(tp);
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
              <InlineEditor
                projectId={projectId}
                equipmentId={eq.id}
                onComplete={() => {}}
                readOnly
              />
            )}
          </div>
        )}

        {tab === "assessment" && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {assessments.length === 0 ? (
              <EmptyTab icon={Shield} text={tx(locale, "No assessment data yet", "보안 평가 데이터가 없습니다", "評価データなし")} />
            ) : (
              SC_NAMES.map((name, i) => {
                const checkId = `SC-${i + 1}`;
                const result = assessments.find((a) => a.checkId === checkId)?.result || "NOT_CHECKED";
                return (
                  <div key={i} className={cn("flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0",
                    result === "FAIL" && "bg-red-50/50")}>
                    <div className={cn("h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                      result === "PASS" ? "bg-green-100 text-green-600" : result === "FAIL" ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-400")}>
                      {result === "PASS" ? "✓" : result === "FAIL" ? "✗" : "—"}
                    </div>
                    <span className="text-[12px] font-semibold text-gray-600 w-12">{checkId}</span>
                    <span className="text-[12px] text-gray-700 flex-1">{name}</span>
                    <span className={cn("text-[11px] font-bold",
                      result === "PASS" ? "text-green-600" : result === "FAIL" ? "text-red-600" : "text-gray-300")}>
                      {result === "PASS" ? "PASS" : result === "FAIL" ? "FAIL" : tx(locale, "Not checked", "미확인", "未確認")}
                    </span>
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
                  const parsed = canSeeReasoning ? parseReasoning(r.reasoning) : null;
                  const showHover = !!parsed;
                  return (
                    <div key={r.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
                      <span
                        className={cn("relative inline-block group/score shrink-0", showHover && "cursor-help")}
                        tabIndex={showHover ? 0 : -1}
                      >
                        <span
                          className="h-9 w-9 rounded-lg flex items-center justify-center text-[10px] font-bold text-white relative"
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
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: `${colors[level]}15`, color: colors[level] }}>{level}</span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-100 text-gray-500">{r.status}</span>
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
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          L={r.likelihood} × I={r.impact}
                          {r.mitigation && ` · ${r.mitigation}`}
                        </p>
                      </div>
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
