"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Ship, Package, Shield, FileText, Send, ArrowRight, ArrowLeft,
  Cpu, Clock, AlertCircle, CheckCircle, Plus, Trash2, Users,
  Network, Zap, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody, CardFooter } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { SkeletonCards, SkeletonTable } from "@/components/ui/skeleton";
import { ShipyardVesselDetail as ShipyardVesselDetailComp } from "@/components/shipyard/vessel-detail";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  vesselName: string;
  classification: string | null;
  shipowner: string | null;
  status: string;
  complianceScore: number | null;
  _count: { hardware: number; software: number; submissions: number; equipments: number };
}

interface Equipment {
  id: string;
  name: string;
  status: string;
  _count: { hardware: number; software: number };
  dfdDiagram: { id: string } | null;
  vendor?: { id: string; name: string; company: string | null };
  securityCategory?: number | null;
  isTypeApproved?: boolean;
  manufacturerName?: string | null;
  productModelName?: string | null;
}

interface VendorOption {
  id: string;
  name: string;
  company: string | null;
  email: string;
}

const STATUS_MAP: Record<string, { label: string; labelEn: string; labelJa: string; color: string; bg: string }> = {
  PENDING:            { label: "대기",     labelEn: "Pending",      labelJa: "保留中",    color: "#8D8D8D", bg: "#F4F4F4" },
  IN_PROGRESS:        { label: "진행 중",  labelEn: "In Progress",  labelJa: "進行中",   color: "#0F62FE", bg: "#EDF5FF" },
  SUBMITTED:          { label: "제출됨",   labelEn: "Submitted",    labelJa: "提出済み",  color: "#EB6200", bg: "#FFF3E0" },
  UNDER_REVIEW:       { label: "검토 중",  labelEn: "Under Review", labelJa: "審査中",   color: "#EB6200", bg: "#FFF3E0" },
  REVISION_REQUESTED: { label: "수정 요청", labelEn: "Revision",    labelJa: "修正依頼",  color: "#DA1E28", bg: "#FFF1F1" },
  APPROVED:           { label: "승인됨",   labelEn: "Approved",     labelJa: "承認済み",  color: "#24A148", bg: "#E6F7EF" },
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const reviewEqId = searchParams.get("reviewEqId");
  const { data: session, status: sessionStatus } = useSession();
  const { locale } = useLocaleStore();
  const userRole = (session?.user as { role?: string })?.role || "VENDOR";

  const [project, setProject] = useState<Project | null>(null);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);

  // Equipment creation dialog
  const [addOpen, setAddOpen] = useState(false);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [eqForm, setEqForm] = useState({ name: "", description: "", vendorId: "" });
  const [saving, setSaving] = useState(false);

  const fetchEquipment = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/equipment`);
    if (res.ok) {
      const data = await res.json();
      setEquipment(Array.isArray(data) ? data : []);
    }
  }, [projectId]);

  useEffect(() => {
    async function load() {
      try {
        const [projRes, eqRes] = await Promise.all([
          fetch(`/api/projects/${projectId}`),
          fetch(`/api/projects/${projectId}/equipment`),
        ]);
        if (projRes.ok) setProject(await projRes.json());
        if (eqRes.ok) {
          const data = await eqRes.json();
          setEquipment(Array.isArray(data) ? data : []);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [projectId]);

  // Fetch vendors when dialog opens
  useEffect(() => {
    if (!addOpen) return;
    setVendorsLoading(true);
    fetch("/api/shipyard/vendors")
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          setVendors(Array.isArray(data) ? data.filter((v: { isActive: boolean }) => v.isActive) : []);
        }
      })
      .finally(() => setVendorsLoading(false));
  }, [addOpen]);

  async function handleCreateEquipment() {
    if (!eqForm.name.trim()) {
      showToast.error(tx(locale, "Equipment name is required", "기자재 이름을 입력하세요", "機器名を入力してください"));
      return;
    }
    if (!eqForm.vendorId) {
      showToast.error(tx(locale, "Please select a vendor", "벤더를 선택하세요", "ベンダーを選択してください"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/equipment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: eqForm.name.trim(),
          description: eqForm.description.trim() || undefined,
          vendorId: eqForm.vendorId,
        }),
      });
      if (res.ok) {
        showToast.success(tx(locale, "Equipment added", "기자재가 추가되었습니다", "機器が追加されました"));
        setAddOpen(false);
        setEqForm({ name: "", description: "", vendorId: "" });
        fetchEquipment();
        // Update project count
        const projRes = await fetch(`/api/projects/${projectId}`);
        if (projRes.ok) setProject(await projRes.json());
      } else {
        const d = await res.json();
        showToast.error(d.error || (tx(locale, "Failed to add", "추가 실패", "追加失敗")));
      }
    } finally {
      setSaving(false);
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

  if (!project) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-8 text-center text-body-sm text-text-tertiary">
        {tx(locale, "Project not found", "프로젝트를 찾을 수 없습니다", "プロジェクトが見つかりません")}
      </div>
    );
  }

  // SHIPYARD(viewer) / SUPPORT / ADMIN → 조선소 전용 호선 대시보드
  if (userRole === "SHIPYARD" || userRole === "SUPPORT" || userRole === "ADMIN") {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <Link href="/project" className="inline-flex items-center gap-1 text-body-xs text-text-tertiary hover:text-brand transition-colors mb-6">
          <ArrowLeft size={14} /> {tx(locale, "Projects", "프로젝트 목록", "プロジェクト一覧")}
        </Link>
        <ShipyardVesselDetailComp projectId={projectId} project={{ id: project.id, vesselName: project.vesselName, shipowner: project.shipowner, classification: project.classification }} initialEqId={reviewEqId} />
      </div>
    );
  }

  const canManage = false; // Vendor cannot manage

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {/* Back */}
        <Link href="/project" className="inline-flex items-center gap-1 text-body-xs text-text-tertiary hover:text-brand transition-colors mb-6">
          <ArrowLeft size={14} /> {tx(locale, "Projects", "프로젝트 목록", "プロジェクト一覧")}
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-brand-lighter flex items-center justify-center">
              <Ship size={20} className="text-brand" />
            </div>
            <div>
              <h1 className="text-h4 font-extrabold text-text tracking-tight">{project.vesselName}</h1>
              <p className="text-body-sm text-text-tertiary mt-0.5">
                {project.shipowner || "—"} · {project.classification || "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: tx(locale, "Equipment", "기자재", "機器"), value: project._count.equipments, icon: Package },
            { label: "Hardware", value: project._count.hardware, icon: Cpu },
            { label: "Software", value: project._count.software, icon: FileText },
            { label: tx(locale, "Approved", "승인 완료", "承認済み"), value: `${equipment.filter((e) => e.status === "APPROVED").length}/${equipment.length}`, icon: CheckCircle },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-white p-4 text-center">
              <s.icon size={16} className="text-brand mx-auto mb-2" />
              <p className="text-h5 font-bold text-text">{s.value}</p>
              <p className="text-body-xs text-text-tertiary mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>


        {/* Equipment list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-body-sm font-bold text-text flex items-center gap-2">
              <Package size={14} className="text-brand" />
              {tx(locale, "Equipment", "기자재 목록", "機器一覧")}
            </h2>
            {canManage && (
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus size={14} /> {tx(locale, "Add Equipment", "기자재 추가", "機器追加")}
              </Button>
            )}
          </div>

          <Card padding="none">
            {equipment.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <Package size={24} className="mx-auto mb-3 text-text-tertiary" />
                <p className="text-body-sm text-text-tertiary">
                  {tx(locale, "No equipment registered", "등록된 기자재가 없습니다", "登録された機器がありません")}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {equipment.map((eq) => {
                  const st = STATUS_MAP[eq.status] || STATUS_MAP.PENDING;
                  return (
                    <Link
                      key={eq.id}
                      href={`/project/${projectId}/equipment/${eq.id}`}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-brand-lighter/20 transition-colors group"
                    >
                      <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: st.bg }}>
                        <Cpu size={16} style={{ color: st.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-body-sm font-semibold text-text truncate">{eq.name}</p>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0" style={{ background: st.bg, color: st.color }}>
                            {locale === "ko" ? st.label : locale === "ja" ? st.labelJa : st.labelEn}
                          </span>
                          {eq.securityCategory && (
                            <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0",
                              eq.securityCategory === 1 ? "text-safety-high bg-risk-bg" :
                              eq.securityCategory === 2 ? "text-safety-elevated bg-orange-50" :
                              "text-brand bg-brand-lighter"
                            )}>Cat {eq.securityCategory === 1 ? "I" : eq.securityCategory === 2 ? "II" : "III"}</span>
                          )}
                          {eq.isTypeApproved && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold text-safety-low bg-green-50 shrink-0">TA ✓</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {eq.vendor && (
                            <span className="text-body-xs text-text-tertiary">
                              {eq.vendor.company || eq.vendor.name}
                            </span>
                          )}
                          {eq.manufacturerName && (
                            <span className="text-body-xs text-text-tertiary">· {eq.manufacturerName}</span>
                          )}
                          {!eq.securityCategory && (
                            <span className="flex items-center gap-1 text-[10px] text-safety-elevated font-semibold">
                              <AlertCircle size={10} /> {tx(locale, "CBS info missing", "CBS 정보 미입력", "CBS情報未入力")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 text-body-xs text-text-tertiary">
                        <span>HW <strong className="text-text">{eq._count.hardware}</strong></span>
                        <span>SW <strong className="text-text">{eq._count.software}</strong></span>
                        <span>DFD {eq.dfdDiagram ? <CheckCircle size={11} className="inline text-[#24A148]" /> : <span className="text-text-tertiary">—</span>}</span>
                        <ChevronRight size={14} className="text-text-tertiary group-hover:text-brand transition-colors" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* E26 Document Generation Banner — only SUPPORT/ADMIN can generate, viewer sees it too for info */}
        {(userRole === "SHIPYARD" || userRole === "SUPPORT" || userRole === "ADMIN") && equipment.length > 0 && (
          <E26Banner projectId={projectId} equipment={equipment} locale={locale} />
        )}
      </motion.div>

      {/* Add Equipment Dialog */}
      {canManage && (
        <Dialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          title={tx(locale, "Add Equipment", "기자재 추가", "機器追加")}
          description={tx(locale, "Register new equipment (CBS) and assign a vendor", "새 기자재(CBS)를 등록하고 벤더를 할당합니다", "新しい機器(CBS)を登録しベンダーを割り当てます")}
        >
          <div className="space-y-4">
            <Input
              label={tx(locale, "Equipment Name *", "기자재 이름 *", "機器名 *")}
              placeholder={tx(locale, "e.g. ECDIS, AIS Transponder", "예: ECDIS, AIS Transponder", "例: ECDIS, AIS Transponder")}
              value={eqForm.name}
              onChange={(e) => setEqForm({ ...eqForm, name: e.target.value })}
            />
            <Textarea
              label={tx(locale, "Description (optional)", "설명 (선택사항)", "説明（任意）")}
              placeholder={tx(locale, "Brief description of the equipment", "기자재에 대한 간단한 설명", "機器の簡単な説明")}
              rows={2}
              value={eqForm.description}
              onChange={(e) => setEqForm({ ...eqForm, description: e.target.value })}
            />
            <Select
              label={tx(locale, "Assigned Vendor *", "담당 벤더 *", "担当ベンダー *")}
              placeholder={vendorsLoading ? (tx(locale, "Loading...", "로딩 중...", "読み込み中...")) : (tx(locale, "Select a vendor", "벤더를 선택하세요", "ベンダーを選択してください"))}
              value={eqForm.vendorId}
              onChange={(e) => setEqForm({ ...eqForm, vendorId: e.target.value })}
              options={vendors.map((v) => ({
                value: v.id,
                label: `${v.name}${v.company ? ` (${v.company})` : ""}`,
              }))}
              disabled={vendorsLoading}
            />
            <div className="flex justify-end gap-3 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                {tx(locale, "Cancel", "취소", "キャンセル")}
              </Button>
              <Button onClick={handleCreateEquipment} loading={saving}>
                <Plus size={14} /> {tx(locale, "Add", "추가", "追加")}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

// ─── E26 Banner ─────────────────────────────────────────────────────────────

function E26Banner({ projectId, equipment, locale }: {
  projectId: string;
  equipment: { id: string; status: string }[];
  locale: string;
}) {
  const total = equipment.length;
  const approved = equipment.filter((e) => e.status === "APPROVED").length;
  const allApproved = total > 0 && approved === total;
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [docCount, setDocCount] = useState(0);

  // Check if E26 docs already exist
  useEffect(() => {
    fetch(`/api/projects/${projectId}/e26`)
      .then(async (r) => { if (r.ok) { const d = await r.json(); if (d.documents?.length > 0) { setGenerated(true); setDocCount(d.documents.length); } } })
      .catch(() => {});
  }, [projectId]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/e26`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setGenerated(true);
      }
    } finally { setGenerating(false); }
  };

  if (generated) {
    return (
      <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-5 flex items-center gap-4">
        <CheckCircle size={24} className="text-green-600 shrink-0" />
        <div className="flex-1">
          <p className="text-[14px] font-bold text-green-800">
            {locale === "ko" ? "E26 선박 문서 생성 완료" : "E26 Ship Documents Generated"}
          </p>
          <p className="text-[12px] text-green-700 mt-0.5">
            {locale === "ko"
              ? "Zones & Conduits, Vessel Asset Inventory, Cyber Risk Assessment, Design Description, Test Procedure"
              : "ZCD, INV, CRA, CSD, CRP documents created"}
          </p>
        </div>
        <Link href={`/project/${projectId}/document`} className="px-4 py-2 rounded-lg bg-green-600 text-white text-[12px] font-semibold hover:bg-green-700 transition-colors">
          {locale === "ko" ? "문서 확인" : "View Documents"}
        </Link>
      </div>
    );
  }

  return (
    <div className={cn(
      "mt-6 rounded-xl border p-5 flex items-center gap-4 transition-all",
      allApproved
        ? "border-brand/20 bg-brand-lighter/30"
        : "border-border bg-surface-secondary/30"
    )}>
      <div className={cn(
        "h-12 w-12 rounded-xl flex items-center justify-center shrink-0",
        allApproved ? "bg-brand/10" : "bg-surface-secondary"
      )}>
        <FileText size={22} className={allApproved ? "text-brand" : "text-text-tertiary"} />
      </div>
      <div className="flex-1">
        <p className={cn("text-[14px] font-bold", allApproved ? "text-brand" : "text-text-secondary")}>
          E26 {locale === "ko" ? "선박 문서" : "Ship Documents"}
        </p>
        <p className="text-[12px] text-text-tertiary mt-0.5">
          {allApproved
            ? (locale === "ko"
              ? `모든 기자재(${total}개)가 승인되었습니다. E26 선박 레벨 문서를 생성할 수 있습니다.`
              : `All ${total} equipment approved. Ready to generate E26 ship-level documents.`)
            : (locale === "ko"
              ? `${approved}/${total}개 기자재 승인됨. 모든 기자재가 승인되면 E26 문서를 생성할 수 있습니다.`
              : `${approved}/${total} equipment approved. All must be approved for E26 generation.`)
          }
        </p>
      </div>
      <Button
        disabled={!allApproved || generating}
        loading={generating}
        onClick={handleGenerate}
        className={cn(!allApproved && "opacity-50 cursor-not-allowed")}
      >
        <FileText size={14} />
        {locale === "ko" ? "E26 문서 생성" : "Generate E26"}
      </Button>
    </div>
  );
}
