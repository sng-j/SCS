"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import {
  Users, Plus, Trash2, Upload,
  Mail, Phone, Building2, Package, UserPlus,
  Ship, Cpu,
} from "lucide-react";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonTable } from "@/components/ui/skeleton";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { showToast } from "@/lib/toast";
import { validatePassword, passwordRuleMessage } from "@/lib/password-policy";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface VendorEquipment {
  id: string;
  name: string;
  status: string;
  project: { id: string; vesselName: string };
  _count: { hardware: number; software: number };
}

interface Vendor {
  id: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  isActive: boolean;
  // Keep the relation name aligned with /api/shipyard/vendors — it returns
  // `_count.assignedEquipments` (the multi-vendor join). The old UI field
  // `vendorEquipments` pointed at a different Prisma relation and always
  // came back undefined, which is why the vendor list showed "기자재 0" for
  // every vendor even when equipment was actually assigned.
  _count?: { assignedEquipments: number };
}

const TABS = ["vendors"] as const;
type Tab = typeof TABS[number];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ShipyardPage() {
  const { data: session, status } = useSession();
  const { locale } = useLocaleStore();
  const [activeTab, setActiveTab] = useState<Tab>("vendors");

  const userRole = (session?.user as { role?: string })?.role;

  if (status === "loading") {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-4">
        <SkeletonTable rows={5} />
      </div>
    );
  }

  // Vendor management is write-heavy — only SUPPORT (replaces old SHIPYARD mgmt role) and ADMIN
  if (userRole !== "SUPPORT" && userRole !== "ADMIN") {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8">
        <EmptyState icon={Users} title={tx(locale, "Access denied", "접근 권한이 없습니다", "アクセスが拒否されました")} />
      </div>
    );
  }

  const tabLabels: Record<Tab, string> = {
    vendors: tx(locale, "Vendor Management", "벤더 관리", "ベンダー管理"),
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="max-w-5xl mx-auto px-6 py-8 space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-h4 font-extrabold text-text">
          {tx(locale, "Vendor Management", "벤더 관리", "ベンダー管理")}
        </h1>
        <p className="text-body-sm text-text-tertiary mt-1">
          {tx(locale, "Manage vendor accounts and equipment assignments", "벤더 계정 및 기자재 할당을 관리합니다", "ベンダーアカウントと機器割り当てを管理します")}
        </p>
      </div>

      {/* Tab Bar - hidden when single tab */}
      {TABS.length > 1 && <div className="flex gap-1 p-1 bg-surface-secondary rounded-[8px] w-fit">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 rounded-[6px] text-body-sm font-medium transition-all duration-200",
              activeTab === tab
                ? "bg-white text-text shadow-xs"
                : "text-text-tertiary hover:text-text-secondary",
            )}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>}

      {/* Tab Content */}
      <VendorsTab locale={locale} />
    </motion.div>
  );
}

// ─── Vendors Tab ──────────────────────────────────────────────────────────────

function VendorsTab({ locale }: { locale: string }) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", password: "" });
  const [saving, setSaving] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvUploading, setCsvUploading] = useState(false);

  /** Parse CSV text → vendor rows */
  function parseCsv(text: string) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    return lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = cols[i] || ""; });
      return { email: row.email || "", name: row.name || "", company: row.company || "", phone: row.phone || "", password: row.password || "" };
    }).filter((r) => r.email && r.name);
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvUploading(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        showToast.error(tx(locale, "No valid rows in CSV", "CSV에 유효한 행이 없습니다", "CSVに有効な行がありません"));
        return;
      }
      const res = await fetch("/api/shipyard/vendors/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendors: rows }),
      });
      if (res.ok) {
        const data = await res.json();
        showToast.success(
          tx(locale, `${data.created} vendors created`, `${data.created}명 등록 완료`, `${data.created}名登録完了`)
          + (data.errors?.length ? ` (${data.errors.length} ${tx(locale, "failed", "실패", "失敗")})` : "")
        );
        if (data.errors?.length) {
          console.table(data.errors);
        }
        fetchVendors();
      } else {
        const d = await res.json().catch(() => ({}));
        showToast.error((d as { error?: string }).error || "Upload failed");
      }
    } finally {
      setCsvUploading(false);
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
  }

  const fetchVendors = useCallback(() => {
    setLoading(true);
    fetch("/api/shipyard/vendors")
      .then(async (r) => { if (r.ok) { const d = await r.json(); setVendors(Array.isArray(d) ? d : []); }; })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchVendors(); }, [fetchVendors]);

  async function handleCreate() {
    if (!form.name || !form.email || !form.password) {
      showToast.error(tx(locale, "Name, email, and password are required", "이름, 이메일, 초기 비밀번호는 필수입니다", "名前、メール、初期パスワードは必須です"));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      showToast.error(tx(locale, "Invalid email format", "유효한 이메일 형식이 아닙니다", "有効なメール形式ではありません"));
      return;
    }
    // Match the server-side password policy (8+ chars, upper/lower/digit/special)
    const pw = validatePassword(form.password);
    if (!pw.valid) {
      showToast.error(passwordRuleMessage(pw.code, locale));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/shipyard/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        showToast.success(tx(locale, "Vendor registered", "벤더가 등록되었습니다", "ベンダーが登録されました"));
        setDialogOpen(false);
        setForm({ name: "", company: "", email: "", phone: "", password: "" });
        fetchVendors();
      } else {
        const d = await res.json();
        let errMsg: string;
        if (d.code?.startsWith?.("PWD_")) {
          errMsg = passwordRuleMessage(d.code.slice(4), locale);
        } else if (d.error === "Email already in use") {
          errMsg = tx(locale, "Email already in use", "이미 사용 중인 이메일입니다", "すでに使用中のメールアドレスです");
        } else {
          errMsg = d.error || tx(locale, "Registration failed", "등록 실패", "登録失敗");
        }
        showToast.error(errMsg);
      }
    } finally {
      setSaving(false);
    }
  }

  const [toggling, setToggling] = useState<string | null>(null);
  const [deleteVendor, setDeleteVendor] = useState<Vendor | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [vendorEquipments, setVendorEquipments] = useState<VendorEquipment[]>([]);
  const [eqLoading, setEqLoading] = useState(false);
  const router = useRouter();

  const handleVendorClick = async (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setEqLoading(true);
    try {
      // Fetch all projects, then filter equipment by vendor
      const res = await fetch("/api/projects");
      if (res.ok) {
        const projects = await res.json();
        const allEquipments: VendorEquipment[] = [];
        for (const p of (Array.isArray(projects) ? projects : [])) {
          const eqRes = await fetch(`/api/projects/${p.id}/equipment`);
          if (eqRes.ok) {
            const eqs = await eqRes.json();
            for (const eq of (Array.isArray(eqs) ? eqs : [])) {
              // Equipment carries a multi-vendor relation (`vendors[]`). The
              // old `eq.vendor?.id` check matched only the legacy single-
              // vendor foreign key, so newer multi-vendor assignments never
              // surfaced in the drawer and it always said "No equipment".
              const vendorIds: string[] = Array.isArray(eq.vendors)
                ? eq.vendors.map((v: { id: string }) => v.id)
                : [];
              if (vendorIds.includes(vendor.id) || eq.vendor?.id === vendor.id) {
                allEquipments.push({
                  id: eq.id,
                  name: eq.name,
                  status: eq.status,
                  project: { id: p.id, vesselName: p.vesselName },
                  _count: eq._count || { hardware: 0, software: 0 },
                });
              }
            }
          }
        }
        setVendorEquipments(allEquipments);
      }
    } finally { setEqLoading(false); }
  };

  const handleToggle = async (vendorId: string, currentActive: boolean) => {
    setToggling(vendorId);
    const res = await fetch("/api/shipyard/vendors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: vendorId, isActive: !currentActive }),
    });
    if (res.ok) {
      setVendors((prev) => prev.map((v) => v.id === vendorId ? { ...v, isActive: !currentActive } : v));
      showToast.success(!currentActive ? tx(locale, "Activated", "활성화됨", "有効化済み") : tx(locale, "Deactivated", "비활성화됨", "無効化済み"));
    }
    setToggling(null);
  };

  const handleDeleteVendor = async () => {
    if (!deleteVendor) return;
    const res = await fetch(`/api/shipyard/vendors?id=${deleteVendor.id}`, { method: "DELETE" });
    if (res.ok) {
      setVendors((prev) => prev.filter((v) => v.id !== deleteVendor.id));
      showToast.success(tx(locale, "Deleted", "삭제되었습니다", "削除されました"));
    } else {
      const d = await res.json().catch(() => ({}));
      showToast.error(d.error || (tx(locale, "Delete failed", "삭제 실패", "削除失敗")));
    }
    setDeleteVendor(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-body-sm font-bold text-text">
          {locale === "ko" ? `벤더 계정 (${vendors.length})` : locale === "ja" ? `ベンダーアカウント (${vendors.length})` : `Vendor Accounts (${vendors.length})`}
        </h2>
        <div className="flex gap-2">
          <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
          <Button size="sm" variant="outline" onClick={() => csvInputRef.current?.click()} loading={csvUploading}>
            <Upload size={14} /> CSV
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <UserPlus size={14} /> {tx(locale, "Register Vendor", "벤더 등록", "ベンダー登록")}
          </Button>
        </div>
      </div>

      <Card padding="none">
        {loading ? (
          <SkeletonTable rows={4} />
        ) : vendors.length === 0 ? (
          <EmptyState icon={Users} title={tx(locale, "No vendors registered", "등록된 벤더가 없습니다", "登録されたベンダーがありません")} subtitle={tx(locale, "Register a vendor to assign equipment", "벤더를 등록하면 기자재를 할당할 수 있습니다", "ベンダーを登録すると機器を割り当てられます")} />
        ) : (
          <>
            {/* Table Header */}
            <div className="divide-y divide-border">
              {vendors.map((v) => (
                <div key={v.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface-secondary/20 transition-colors cursor-pointer" onClick={() => handleVendorClick(v)}>
                  <div className="h-8 w-8 rounded-full bg-brand-lighter flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-bold text-brand">{v.name.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-semibold text-text">{v.name}</p>
                    <p className="text-body-xs text-text-tertiary">{v.email}{v.company ? ` · ${v.company}` : ""}</p>
                  </div>
                  <span className="text-body-xs text-text-tertiary hidden sm:block">{tx(locale, "Eq.", "기자재", "機器")} {v._count?.assignedEquipments ?? 0}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggle(v.id, v.isActive); }}
                    disabled={toggling === v.id}
                    className={cn(
                      "relative w-10 h-6 rounded-full transition-colors duration-200 shrink-0",
                      v.isActive ? "bg-safety-low" : "bg-border-strong",
                      toggling === v.id && "opacity-50",
                    )}
                  >
                    <span className={cn(
                      "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200",
                      v.isActive && "translate-x-4",
                    )} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteVendor(v); }}
                    className="p-1.5 rounded-md text-text-tertiary hover:text-safety-high hover:bg-risk-bg transition-colors shrink-0"
                    title={tx(locale, "Delete", "삭제", "削除")}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* Vendor Registration Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={tx(locale, "Register Vendor", "벤더 등록", "ベンダー登録")}
        description={tx(locale, "Create a new vendor account", "새 벤더 계정을 생성합니다", "新しいベンダーアカウントを作成します")}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <Input label={tx(locale, "Name *", "이름 *", "名前 *")} placeholder={tx(locale, "John Doe", "홍길동", "山田太郎")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label={tx(locale, "Company", "회사", "会社")} placeholder={tx(locale, "Company name", "회사명", "会社名")} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>
          <Input label={tx(locale, "Email *", "이메일 *", "メール *")} type="email" placeholder="vendor@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label={tx(locale, "Phone", "전화번호", "電話番号")} placeholder="010-0000-0000" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label={tx(locale, "Initial Password *", "초기 비밀번호 *", "初期パスワード *")} type="password" placeholder={tx(locale, "Initial password", "초기 비밀번호", "初期パスワード")} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{tx(locale, "Cancel", "취소", "キャンセル")}</Button>
            <Button onClick={handleCreate} loading={saving}>
              <UserPlus size={14} /> {tx(locale, "Register", "등록", "登録")}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Vendor Detail Dialog */}
      <Dialog
        open={!!selectedVendor}
        onClose={() => { setSelectedVendor(null); setVendorEquipments([]); }}
        title={selectedVendor?.name || ""}
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
        <VendorEditSection vendor={selectedVendor} locale={locale} onUpdate={(updated) => {
          setVendors((prev) => prev.map((v) => v.id === updated.id ? { ...v, ...updated } : v));
          setSelectedVendor((prev) => prev ? { ...prev, ...updated } : prev);
        }} />

          {/* Projects & Equipment */}
          {eqLoading ? (
            <div className="py-6 text-center text-[12px] text-text-tertiary">{tx(locale, "Loading...", "로딩 중...", "読み込み中...")}</div>
          ) : vendorEquipments.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-text-tertiary">{tx(locale, "No equipment assigned", "할당된 기자재가 없습니다", "割り当てられた機器がありません")}</div>
          ) : (
            <div className="space-y-3">
              {/* Group by project */}
              {Object.entries(
                vendorEquipments.reduce((acc, eq) => {
                  const key = eq.project.id;
                  if (!acc[key]) acc[key] = { vesselName: eq.project.vesselName, projectId: key, items: [] };
                  acc[key].items.push(eq);
                  return acc;
                }, {} as Record<string, { vesselName: string; projectId: string; items: VendorEquipment[] }>)
              ).map(([, group]) => (
                <div key={group.projectId} className="rounded-xl border border-border overflow-hidden">
                  {/* Project header */}
                  <button
                    onClick={() => { setSelectedVendor(null); router.push(`/project/${group.projectId}`); }}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-brand-lighter/50 hover:bg-brand-lighter transition-colors text-left"
                  >
                    <Ship size={15} className="text-brand shrink-0" />
                    <span className="text-[13px] font-bold text-text flex-1">{group.vesselName}</span>
                    <span className="text-[11px] text-brand font-semibold">{tx(locale, "Go →", "프로젝트 이동 →", "プロジェクトへ →")}</span>
                  </button>
                  {/* Equipment list */}
                  <div className="divide-y divide-border">
                    {group.items.map((eq) => {
                      const stMap: Record<string, { label: string; color: string; bg: string }> = {
                        PENDING: { label: tx(locale, "Pending", "대기", "保留中"), color: "#8D8D8D", bg: "#F4F4F4" },
                        IN_PROGRESS: { label: tx(locale, "In Progress", "진행 중", "進行中"), color: "#0F62FE", bg: "#EDF5FF" },
                        SUBMITTED: { label: tx(locale, "Submitted", "제출됨", "提出済み"), color: "#EB6200", bg: "#FFF3E0" },
                        APPROVED: { label: tx(locale, "Approved", "승인됨", "承認済み"), color: "#24A148", bg: "#E6F7EF" },
                        REVISION_REQUESTED: { label: tx(locale, "Revision", "수정 요청", "修正依頼"), color: "#DA1E28", bg: "#FFF1F1" },
                      };
                      const st = stMap[eq.status] || stMap.PENDING;
                      return (
                        <button
                          key={eq.id}
                          onClick={() => { setSelectedVendor(null); router.push(`/project/${group.projectId}/equipment/${eq.id}`); }}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-secondary/50 transition-colors text-left"
                        >
                          <Cpu size={14} className="text-text-tertiary shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-semibold text-text truncate">{eq.name}</p>
                            <p className="text-[10px] text-text-tertiary">HW {eq._count.hardware} · SW {eq._count.software}</p>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Dialog>

      {/* Delete vendor confirm */}
      <ConfirmDialog
        open={!!deleteVendor}
        onClose={() => setDeleteVendor(null)}
        onConfirm={handleDeleteVendor}
        title={tx(locale, "Delete Vendor", "벤더 삭제", "ベンダー削除")}
        description={locale === "ko" ? `"${deleteVendor?.name}" 벤더를 삭제하시겠습니까? 해당 벤더에 할당된 기자재도 영향을 받을 수 있습니다.` : locale === "ja" ? `ベンダー「${deleteVendor?.name}」を削除しますか？このベンダーに割り当てられた機器にも影響が出る場合があります。` : `Delete vendor "${deleteVendor?.name}"? Equipment assigned to this vendor may be affected.`}
      />
    </div>
  );
}

// ─── Vendor Edit Section (인라인 수정 폼) ───────────────────────────────────

function VendorEditSection({ vendor, locale, onUpdate }: {
  vendor: { id: string; name: string; email: string; company: string | null; phone: string | null } | null;
  locale: string;
  onUpdate: (updated: { id: string; name?: string; company?: string | null; phone?: string | null }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetIpOpen, setResetIpOpen] = useState(false);
  const [resettingIp, setResettingIp] = useState(false);

  useEffect(() => {
    if (vendor) {
      setName(vendor.name);
      setCompany(vendor.company || "");
      setPhone(vendor.phone || "");
      setPassword("");
      setEditing(false);
    }
  }, [vendor]);

  if (!vendor) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, string> = { id: vendor.id };
      if (name !== vendor.name) body.name = name;
      if (company !== (vendor.company || "")) body.company = company;
      if (phone !== (vendor.phone || "")) body.phone = phone;
      if (password.trim()) body.password = password;

      const res = await fetch("/api/shipyard/vendors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        onUpdate({ id: vendor.id, name, company: company || null, phone: phone || null });
        setEditing(false);
        setPassword("");
        showToast.success(tx(locale, "Updated", "수정되었습니다", "更新されました"));
      } else {
        const err = await res.json().catch(() => ({}));
        showToast.error((err as { error?: string }).error || tx(locale, "Update failed", "수정 실패", "更新失敗"));
      }
    } finally { setSaving(false); }
  };

  const inputCls = "h-9 w-full rounded-lg border border-border bg-white px-3 text-[12px] text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 pb-3 border-b border-border">
        <div className="h-10 w-10 rounded-full bg-brand-lighter flex items-center justify-center shrink-0">
          <span className="text-[13px] font-bold text-brand">{vendor.name.charAt(0)}</span>
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-bold text-text">{vendor.name}</p>
          <p className="text-[12px] text-text-tertiary">{vendor.email}{vendor.company ? ` · ${vendor.company}` : ""}</p>
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-brand border border-brand/20 hover:bg-brand-lighter transition-colors">
            {tx(locale, "Edit", "수정", "編集")}
          </button>
        )}
      </div>

      {editing && (
        <div className="space-y-3 p-3 rounded-xl border border-brand/10 bg-brand-lighter/30">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-text-tertiary">{tx(locale, "Name", "이름", "名前")}</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-text-tertiary">{tx(locale, "Company", "회사명", "会社名")}</label>
              <input value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-text-tertiary">{tx(locale, "Phone", "전화번호", "電話番号")}</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-text-tertiary">{tx(locale, "New Password", "새 비밀번호", "新パスワード")}</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={tx(locale, "Leave blank to keep", "변경 없으면 비워두기", "変更なしなら空欄")} className={inputCls} />
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => setResetIpOpen(true)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
            >
              {tx(locale, "Reset IP", "IP 초기화", "IPリセット")}
            </button>
            <div className="flex gap-2">
              <button onClick={() => { setEditing(false); setPassword(""); }} className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-text-tertiary hover:bg-surface-secondary transition-colors">
                {tx(locale, "Cancel", "취소", "キャンセル")}
              </button>
              <Button size="sm" loading={saving} onClick={handleSave}>
                {tx(locale, "Save", "저장", "保存")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* IP whitelist reset confirmation — replaces native browser confirm() */}
      <ConfirmDialog
        open={resetIpOpen}
        onClose={() => setResetIpOpen(false)}
        onConfirm={async () => {
          setResettingIp(true);
          try {
            const res = await fetch("/api/shipyard/vendors", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: vendor.id, resetIp: true }),
            });
            if (res.ok) showToast.success(tx(locale, "IP reset complete", "IP 초기화 완료", "IPリセット完了"));
            else showToast.error(tx(locale, "Failed", "실패", "失敗"));
          } finally {
            setResettingIp(false);
            setResetIpOpen(false);
          }
        }}
        title={tx(locale, "Reset IP whitelist?", "IP 화이트리스트 초기화", "IPホワイトリストをリセット")}
        description={tx(
          locale,
          `${vendor.name}'s registered IP list will be cleared. The vendor will be forced to re-login from their current network.`,
          `${vendor.name}의 등록된 IP 목록이 지워집니다. 벤더는 현재 네트워크에서 재로그인해야 합니다.`,
          `${vendor.name}の登録IPリストがクリアされます。現在のネットワークから再ログインが必要です。`,
        )}
        confirmLabel={tx(locale, "Reset", "초기화", "リセット")}
        cancelLabel={tx(locale, "Cancel", "취소", "キャンセル")}
        loading={resettingIp}
      />
    </div>
  );
}
