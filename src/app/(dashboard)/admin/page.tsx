"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { Users, Building2, UserCog, HelpCircle, Settings, Shield, CheckCircle, XCircle, Plus, Pencil, Trash2, Activity, Send, Package, Cpu, FileText, ChevronRight, Ship, MessageSquare, Download, AlertCircle, Upload, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonTable } from "@/components/ui/skeleton";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { validatePassword, passwordRuleMessage } from "@/lib/password-policy";

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserRow    { id: string; name: string; email: string; role: string; isActive: boolean; company?: string | null; shipyardId?: string | null; shipyard?: { id: string; name: string } | null; registeredIps?: string[]; lastLoginAt?: string | null; lastLoginIp?: string | null; }
interface VendorEquipment { id: string; name: string; status: string; project: { id: string; vesselName: string }; _count: { hardware: number; software: number }; }
interface SignupRow  { id: string; name: string; email: string; company: string | null; phone: string | null; status: string; createdAt: string; }
interface ShipyardRow { id: string; name: string; address: string | null; phone: string | null; contact: string | null; isActive: boolean; _count?: { projects: number; users: number }; }
interface FaqRow     { id: number; question: string; answer: string; category: string; sortOrder: number; }
interface SettingRow { key: string; value: string; description: string | null; }
interface LogRow     { id: string; event: string; userEmail: string | null; level: string; detail: string | null; createdAt: string; }

// ─── Bulk upload (Excel paste) helpers ───────────────────────────────────────

function CsvUploadButton({ locale, endpoint, payloadKey, columns, label, onDone }: {
  locale: string;
  endpoint: string;
  payloadKey: string;
  columns: string[];
  label: string;
  onDone: () => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, string>[]>(() =>
    Array.from({ length: 5 }, () => Object.fromEntries(columns.map((c) => [c, ""])))
  );
  const [uploading, setUploading] = useState(false);

  const resetGrid = () => {
    setRows(Array.from({ length: 5 }, () => Object.fromEntries(columns.map((c) => [c, ""]))));
  };

  const nonEmptyRows = rows.filter((r) => Object.values(r).some((v) => v && v.trim().length > 0));

  const updateCell = (rowIdx: number, col: string, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[rowIdx] = { ...next[rowIdx], [col]: value };
      return next;
    });
  };

  const addRow = () => {
    setRows((prev) => [...prev, Object.fromEntries(columns.map((c) => [c, ""]))]);
  };

  const removeRow = (idx: number) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  };

  /** Handle paste from Excel — fills a rectangular range of cells */
  const handleCellPaste = (e: React.ClipboardEvent, startRow: number, startCol: string) => {
    const text = e.clipboardData.getData("text");
    if (!text) return;
    if (!text.includes("\t") && !text.includes("\n")) return; // single cell — default paste

    e.preventDefault();
    let cleaned = text;
    if (cleaned.charCodeAt(0) === 0xFEFF) cleaned = cleaned.slice(1);
    const lines = cleaned.split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length === 0) return;

    // Auto-detect header row (first row with any column name)
    const firstCells = lines[0].split("\t").map((c) => c.trim().toLowerCase());
    const colsLower = columns.map((c) => c.toLowerCase());
    const hasHeader = firstCells.some((c) => colsLower.includes(c));
    const dataLines = hasHeader ? lines.slice(1) : lines;

    const startColIdx = columns.indexOf(startCol);
    setRows((prev) => {
      const next = [...prev];
      dataLines.forEach((line, lineIdx) => {
        const targetRow = startRow + lineIdx;
        while (next.length <= targetRow) next.push(Object.fromEntries(columns.map((c) => [c, ""])));
        const cells = line.split("\t");
        cells.forEach((cell, cellIdx) => {
          const targetCol = columns[startColIdx + cellIdx];
          if (targetCol) {
            next[targetRow] = { ...next[targetRow], [targetCol]: cell.trim() };
          }
        });
      });
      return next;
    });
  };

  const handleSubmit = async () => {
    if (nonEmptyRows.length === 0) {
      showToast.error(tx(locale, "No rows to import", "등록할 행이 없습니다", "登録する行がありません"));
      return;
    }
    setUploading(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [payloadKey]: nonEmptyRows }),
      });
      if (res.ok) {
        const data = await res.json();
        const errCount = data.errors?.length || 0;
        showToast.success(
          tx(locale, `${data.created} created`, `${data.created}건 등록 완료`, `${data.created}件登録完了`)
          + (errCount ? ` · ${errCount} ${tx(locale, "failed (check console)", "실패 (콘솔 확인)", "失敗 (コンソール確認)")}` : "")
        );
        if (errCount) console.table(data.errors);
        setDialogOpen(false);
        resetGrid();
        onDone();
      } else {
        const d = await res.json().catch(() => ({}));
        showToast.error((d as { error?: string }).error || "Upload failed");
      }
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setDialogOpen(false);
    resetGrid();
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
        <Upload size={13} /> {label}
      </Button>
      <Dialog open={dialogOpen} onClose={handleClose} title={label} maxWidth="max-w-5xl">
        <div className="space-y-3">
          <p className="text-[11px] text-text-secondary">
            {tx(locale,
              "Click a cell and paste from Excel (Ctrl+V) to fill multiple rows/columns at once. Or type directly into cells.",
              "셀을 클릭하고 엑셀 데이터를 붙여넣기(Ctrl+V)하면 여러 행/열이 한번에 채워집니다. 직접 입력도 가능합니다.",
              "セルをクリックしてExcelデータを貼り付け(Ctrl+V)すると複数行/列が一度に入力されます。直接入力も可能です。")}
          </p>

          {/* Spreadsheet grid */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="max-h-[440px] overflow-auto">
              <table className="border-collapse w-full">
                <thead className="bg-surface-secondary sticky top-0 z-10">
                  <tr>
                    <th className="w-10 border border-border px-2 py-1.5 text-[10px] font-bold text-text-tertiary">#</th>
                    {columns.map((c) => (
                      <th key={c} className="border border-border px-2 py-1.5 text-left text-[11px] font-bold text-text whitespace-nowrap min-w-[140px]">
                        {c}
                      </th>
                    ))}
                    <th className="w-8 border border-border bg-surface-secondary"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIdx) => (
                    <tr key={rowIdx} className="group">
                      <td className="border border-border bg-surface-secondary/30 px-2 py-0.5 text-center text-[10px] text-text-tertiary tabular-nums">
                        {rowIdx + 1}
                      </td>
                      {columns.map((c) => (
                        <td key={c} className="border border-border p-0">
                          <input
                            type="text"
                            value={row[c] || ""}
                            onChange={(e) => updateCell(rowIdx, c, e.target.value)}
                            onPaste={(e) => handleCellPaste(e, rowIdx, c)}
                            className="w-full px-2 py-1 text-[11px] text-text bg-transparent outline-none focus:bg-brand-lighter/40 focus:ring-1 focus:ring-inset focus:ring-brand/40"
                          />
                        </td>
                      ))}
                      <td className="border border-border bg-surface-secondary/30 text-center">
                        <button
                          onClick={() => removeRow(rowIdx)}
                          className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-safety-high transition-opacity p-0.5"
                          title={tx(locale, "Remove row", "행 삭제", "行削除")}
                          disabled={rows.length <= 1}
                        >
                          <X size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-3 py-2 border-t border-border bg-surface-secondary/30 flex items-center justify-between">
              <button
                onClick={addRow}
                className="text-[11px] font-medium text-brand hover:text-brand/80 transition-colors inline-flex items-center gap-1"
              >
                <Plus size={12} /> {tx(locale, "Add row", "행 추가", "行追加")}
              </button>
              <span className="text-[11px] text-text-tertiary">
                {tx(locale, `${nonEmptyRows.length} row(s) ready`, `${nonEmptyRows.length}행 준비됨`, `${nonEmptyRows.length}行準備完了`)}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button variant="outline" onClick={handleClose}>
              {tx(locale, "Cancel", "취소", "キャンセル")}
            </Button>
            <Button onClick={handleSubmit} loading={uploading} disabled={nonEmptyRows.length === 0}>
              {tx(locale, `Import ${nonEmptyRows.length} row(s)`, `${nonEmptyRows.length}건 등록`, `${nonEmptyRows.length}件登録`)}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

const TABS = ["users", "signups", "shipyards", "projects", "submissions", "faq", "qna", "settings", "logs", "dataset", "data-health", "doc-formats", "society-kb"] as const;
type Tab = typeof TABS[number];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { data: session, status } = useSession();
  const { locale } = useLocaleStore();
  const router = useRouter();
  const sp = useSearchParams();
  const tabFromUrl = sp.get("tab") as Tab | null;
  const [activeTab, setActiveTab] = useState<Tab>(tabFromUrl && TABS.includes(tabFromUrl) ? tabFromUrl : "users");
  const userRole = (session?.user as { role?: string })?.role;

  // Sync tab from URL changes (sidebar click → page)
  useEffect(() => {
    if (tabFromUrl && TABS.includes(tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabFromUrl]);

  // Change tab and update URL
  const changeTab = (tab: Tab) => {
    setActiveTab(tab);
    router.replace(`/admin?tab=${tab}`, { scroll: false });
  };

  if (status === "loading") return <div className="max-w-5xl mx-auto px-6 py-8"><SkeletonTable rows={5} /></div>;

  if (userRole !== "ADMIN") {
    return <div className="max-w-5xl mx-auto px-6 py-8"><EmptyState icon={Shield} title={tx(locale, "Admin access required", "관리자 권한이 필요합니다", "管理者権限が必要です")} /></div>;
  }

  const tabLabels: Record<Tab, string> = {
    users: tx(locale, "Users", "사용자", "ユーザー"),
    signups: tx(locale, "Signups", "가입 신청", "サインアップ申請"),
    shipyards: tx(locale, "Shipyards", "조선소", "造船所"),
    projects: tx(locale, "Projects", "프로젝트", "プロジェクト"),
    submissions: tx(locale, "Submissions", "제출물", "提出物"),
    faq: "FAQ",
    qna: "Q&A",
    settings: tx(locale, "Settings", "설정", "設定"),
    logs: tx(locale, "Security Logs", "보안 이력", "セキュリティログ"),
    dataset: tx(locale, "AI Dataset", "AI 데이터셋", "AIデータセット"),
    "data-health": tx(locale, "Data Health", "데이터 정합성", "データ整合性"),
    "doc-formats": tx(locale, "Doc Formats", "문서 포맷", "ドキュメント形式"),
    "society-kb": tx(locale, "Society KB", "선급 가이드", "船級ガイド"),
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="max-w-5xl mx-auto px-6 py-8 space-y-6"
    >
      <div>
        <h1 className="text-h4 font-extrabold text-text">{tx(locale, "Admin Panel", "관리자 패널", "管理者パネル")}</h1>
        <p className="text-body-sm text-text-tertiary mt-1">{tx(locale, "Manage the entire system", "시스템 전체를 관리합니다", "システム全体を管理します")}</p>
      </div>

      {/* Tab Bar */}
      <div className="flex flex-wrap gap-1 p-1 bg-surface-secondary rounded-[8px] w-fit">
        {TABS.map((tab) => (
          <button key={tab} onClick={() => changeTab(tab)}
            className={cn("px-3 py-1.5 rounded-[6px] text-body-sm font-medium transition-all duration-200",
              activeTab === tab ? "bg-white text-text shadow-xs" : "text-text-tertiary hover:text-text-secondary"
            )}>
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      {activeTab === "users"       && <UsersTab locale={locale} />}
      {activeTab === "signups"     && <SignupsTab locale={locale} />}
      {activeTab === "shipyards"   && <ShipyardsTab locale={locale} />}
      {activeTab === "projects"    && <ProjectsTab locale={locale} />}
      {activeTab === "submissions" && <SubmissionsTab locale={locale} />}
      {activeTab === "faq"         && <FaqTab locale={locale} />}
      {activeTab === "qna"         && <QnaAdminTab locale={locale} />}
      {activeTab === "settings"    && <SettingsTab locale={locale} />}
      {activeTab === "logs"        && <LogsTab locale={locale} />}
      {activeTab === "dataset"     && <DatasetTab locale={locale} />}
      {activeTab === "data-health" && <DataHealthTab locale={locale} />}
      {activeTab === "doc-formats" && <DocFormatsTab locale={locale} />}
      {activeTab === "society-kb"  && <SocietyKbTab locale={locale} />}
    </motion.div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab({ locale }: { locale: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", company: "", newPassword: "", shipyardId: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [shipyards, setShipyards] = useState<{ id: string; name: string }[]>([]);
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<UserRow | null>(null);
  const [vendorEquipments, setVendorEquipments] = useState<VendorEquipment[]>([]);
  const [selectedShipyard, setSelectedShipyard] = useState<UserRow | null>(null);
  const [shipyardProjects, setShipyardProjects] = useState<{ id: string; vesselName: string; classification: string | null; status: string; _count: { equipments: number; hardware: number; software: number } }[]>([]);
  const [eqLoading, setEqLoading] = useState(false);
  const [ipResetOpen, setIpResetOpen] = useState(false);
  const [ipResetting, setIpResetting] = useState(false);
  const router = useRouter();

  const loadUsers = () => {
    fetch("/api/admin/users")
      .then(async (r) => { if (r.ok) { const d = await r.json(); setUsers(Array.isArray(d) ? d : []); } })
      .finally(() => setLoading(false));
  };

  useEffect(loadUsers, []);
  useEffect(() => {
    fetch("/api/admin/shipyards").then(async (r) => { if (r.ok) { const d = await r.json(); setShipyards(Array.isArray(d) ? d : []); } });
  }, []);

  const openEditUser = (u: UserRow) => {
    setEditUser(u);
    // Initialize the form with the actual shipyardId — the previous code
    // mistakenly stored the shipyard name here, which made the select field
    // never preselect anything and silently dropped the value on save.
    setEditForm({
      name: u.name,
      email: u.email,
      company: u.company || "",
      newPassword: "",
      shipyardId: u.shipyardId || "",
    });
  };

  const handleEditSave = async () => {
    if (!editUser) return;
    setEditSaving(true);
    const body: Record<string, string | boolean | null> = { userId: editUser.id };
    if (editForm.name !== editUser.name) body.name = editForm.name;
    if (editForm.email !== editUser.email) body.email = editForm.email;
    if (editForm.company !== (editUser.company || "")) body.company = editForm.company;
    if (editForm.newPassword) body.newPassword = editForm.newPassword;
    // Only send shipyardId for SHIPYARD/VENDOR users and only if it changed.
    if (
      (editUser.role === "SHIPYARD" || editUser.role === "VENDOR") &&
      editForm.shipyardId !== (editUser.shipyardId || "")
    ) {
      body.shipyardId = editForm.shipyardId || null;
    }

    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setEditSaving(false);
    if (res.ok) {
      showToast.success(tx(locale, "Saved", "저장 완료", "保存完了"));
      setEditUser(null);
      loadUsers();
    } else {
      const d = await res.json().catch(() => ({}));
      showToast.error(d.error || tx(locale, "Failed", "저장 실패", "保存失敗"));
    }
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    setToggling(userId);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, isActive: !currentActive }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, isActive: !currentActive } : u));
      showToast.success(!currentActive ? tx(locale, "Activated", "활성화됨", "有効化済み") : tx(locale, "Deactivated", "비활성화됨", "無効化済み"));
    } else {
      showToast.error(tx(locale, "Failed", "변경 실패", "変更失敗"));
    }
    setToggling(null);
  };

  const handleRoleChange = async (userId: string, role: string) => {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role } : u));
      showToast.success(tx(locale, "Role changed", "역할 변경됨", "役割が変更されました"));
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUser) return;
    if (deleteUser.role === "ADMIN") {
      showToast.error(tx(locale, "Cannot delete admin accounts", "관리자 계정은 삭제할 수 없습니다", "管理者アカウントは削除できません"));
      setDeleteUser(null);
      return;
    }
    const res = await fetch(`/api/admin/users?userId=${deleteUser.id}`, { method: "DELETE" });
    if (res.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== deleteUser.id));
      showToast.success(tx(locale, "Deleted", "삭제되었습니다", "削除されました"));
    } else {
      const d = await res.json().catch(() => ({}));
      const msg = d.error === "Cannot delete admin accounts"
        ? (tx(locale, "Cannot delete admin accounts", "관리자 계정은 삭제할 수 없습니다", "管理者アカウントは削除できません"))
        : (tx(locale, "Delete failed", "삭제 실패", "削除失敗"));
      showToast.error(msg);
    }
    setDeleteUser(null);
  };

  const handleVendorClick = async (vendor: UserRow) => {
    setSelectedVendor(vendor);
    setEqLoading(true);
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const projects = await res.json();
        const allEquipments: VendorEquipment[] = [];
        for (const p of (Array.isArray(projects) ? projects : [])) {
          const eqRes = await fetch(`/api/projects/${p.id}/equipment`);
          if (eqRes.ok) {
            const eqs = await eqRes.json();
            for (const eq of (Array.isArray(eqs) ? eqs : [])) {
              if (eq.vendor?.id === vendor.id) {
                allEquipments.push({
                  id: eq.id, name: eq.name, status: eq.status,
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

  const handleShipyardClick = async (user: UserRow) => {
    setSelectedShipyard(user);
    setEqLoading(true);
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const projects = await res.json();
        // Filter projects by shipyardId matching the user's shipyard
        const targetShipyardId = user.shipyardId || user.shipyard?.id;
        const filtered = (Array.isArray(projects) ? projects : []).filter(
          (p: { shipyardId?: string | null }) => targetShipyardId && p.shipyardId === targetShipyardId
        );
        setShipyardProjects(filtered.map((p: { id: string; vesselName: string; classification: string | null; status: string; _count: { equipments: number; hardware: number; software: number } }) => ({
          id: p.id, vesselName: p.vesselName, classification: p.classification, status: p.status, _count: p._count,
        })));
      }
    } finally { setEqLoading(false); }
  };

  const [createOpen, setCreateOpen] = useState(false);
  const [createRole, setCreateRole] = useState<"ADMIN" | "SHIPYARD" | "VENDOR">("SHIPYARD");
  const [createForm, setCreateForm] = useState({ name: "", email: "", password: "", company: "" });
  // For SHIPYARD users: "join" attaches to an existing shipyard, "new" creates one.
  // This is the structural fix for data-mismatch bugs — the operator must make
  // an explicit choice instead of relying on a fragile name-match.
  const [createShipyardMode, setCreateShipyardMode] = useState<"join" | "new">("join");
  const [createShipyardId, setCreateShipyardId] = useState<string>("");
  const [createSaving, setCreateSaving] = useState(false);

  const handleCreateUser = async () => {
    if (!createForm.name || !createForm.email || !createForm.password) {
      showToast.error(tx(locale, "Name, email, and password are required", "이름, 이메일, 비밀번호는 필수입니다", "名前、メール、パスワードは必須です"));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.email)) {
      showToast.error(tx(locale, "Invalid email format", "유효한 이메일 형식이 아닙니다", "有効なメール形式ではありません"));
      return;
    }
    // Password policy is enforced server-side (currently 6+ chars).
    const pw = validatePassword(createForm.password);
    if (!pw.valid) {
      showToast.error(passwordRuleMessage(pw.code, locale));
      return;
    }
    // Validate shipyard selection for SHIPYARD users
    if (createRole === "SHIPYARD") {
      if (createShipyardMode === "join" && !createShipyardId) {
        showToast.error(tx(locale, "Select a shipyard to join", "합류할 조선소를 선택하세요", "参加する造船所を選択してください"));
        return;
      }
      if (createShipyardMode === "new" && !createForm.company.trim()) {
        showToast.error(tx(locale, "Enter the new shipyard name (Company)", "새 조선소 이름(회사명)을 입력하세요", "新しい造船所名(会社名)を入力してください"));
        return;
      }
    }
    // VENDOR must be assigned to a shipyard
    if (createRole === "VENDOR") {
      if (!createShipyardId) {
        showToast.error(tx(locale, "Select a shipyard for this vendor", "벤더를 배정할 조선소를 선택하세요", "ベンダーを配属する造船所を選択してください"));
        return;
      }
    }
    setCreateSaving(true);
    try {
      let res: Response;

      if (createRole === "VENDOR") {
        // Use the shipyard/vendors API (supports admin calling with explicit shipyardId)
        res = await fetch("/api/shipyard/vendors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: createForm.name,
            email: createForm.email,
            password: createForm.password,
            company: createForm.company,
            phone: "",
            shipyardId: createShipyardId,
          }),
        });
      } else {
        // ADMIN / SHIPYARD — use admin/users API
        const payload: Record<string, string> = {
          name: createForm.name,
          email: createForm.email,
          password: createForm.password,
          company: createForm.company,
          role: createRole,
        };
        if (createRole === "SHIPYARD" && createShipyardMode === "join") {
          payload.shipyardId = createShipyardId;
        }
        res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        showToast.success(tx(locale, "Account created", "계정이 생성되었습니다", "アカウントが作成されました"));
        setCreateOpen(false);
        setCreateForm({ name: "", email: "", password: "", company: "" });
        setCreateShipyardId("");
        setCreateShipyardMode("join");
        loadUsers();
        fetch("/api/admin/shipyards").then(async (r) => { if (r.ok) { const d = await r.json(); setShipyards(Array.isArray(d) ? d : []); } });
      } else {
        const d = await res.json().catch(() => ({}));
        if (d.code?.startsWith?.("PWD_")) {
          showToast.error(passwordRuleMessage(d.code.slice(4), locale));
        } else if (d.error === "Email already in use") {
          showToast.error(tx(locale, "Email already in use", "이미 사용 중인 이메일입니다", "すでに使用中のメールアドレスです"));
        } else {
          showToast.error(d.error || tx(locale, "Failed to create", "생성 실패", "作成失敗"));
        }
      }
    } finally { setCreateSaving(false); }
  };

  const shipyardUsers = users.filter((u) => u.role === "SHIPYARD");
  const vendorUsers = users.filter((u) => u.role === "VENDOR");
  const adminUsers = users.filter((u) => u.role === "ADMIN");

  if (loading) return <SkeletonTable rows={5} />;

  function UserSection({ title, list, onRowClick, hideDelete }: { title: string; list: UserRow[]; onRowClick?: (u: UserRow) => void; hideDelete?: boolean }) {
    return (
      <div className="space-y-2">
        <h3 className="text-body-xs font-bold text-text-tertiary uppercase tracking-wide">{title} ({list.length})</h3>
        <Card padding="none">
          {list.length === 0 ? (
            <div className="px-5 py-6 text-center text-body-xs text-text-tertiary">{tx(locale, "None", "없음", "なし")}</div>
          ) : (
            <div className="divide-y divide-border">
              {list.map((u) => (
                <div key={u.id} onClick={() => onRowClick?.(u)} className={cn("flex items-center gap-4 px-5 py-3.5 hover:bg-surface-secondary/20 transition-colors", onRowClick && "cursor-pointer")}>
                  <div className="h-8 w-8 rounded-full bg-brand-lighter flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-bold text-brand">{u.name.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-semibold text-text">{u.name}</p>
                    <p className="text-body-xs text-text-tertiary">{u.email}{u.company ? ` · ${u.company}` : ""}{u.shipyard ? ` · ${u.shipyard.name}` : ""}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {u.registeredIps && u.registeredIps.length > 0 && (
                        <span className="font-mono text-[9px] text-text-tertiary bg-surface-secondary px-1.5 py-0.5 rounded">
                          IP: {u.registeredIps.join(", ")}
                        </span>
                      )}
                      {u.lastLoginAt && (
                        <span className="text-[9px] text-text-tertiary">
                          {tx(locale, "Last", "최근 접속", "最終アクセス")}: {new Date(u.lastLoginAt).toLocaleDateString(locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          {u.lastLoginIp ? ` (${u.lastLoginIp})` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Role badge (read-only) */}
                  <span className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-semibold",
                    u.role === "ADMIN" ? "bg-brand-lighter text-brand" :
                    u.role === "SHIPYARD" ? "bg-blue-50 text-blue-700" :
                    "bg-gray-100 text-gray-600"
                  )}>
                    {u.role}
                  </span>
                  {/* Edit button */}
                  <button onClick={(e) => { e.stopPropagation(); openEditUser(u); }} className="p-1.5 rounded-md text-text-tertiary hover:text-brand hover:bg-brand-lighter transition-colors shrink-0" title={tx(locale, "Edit", "편집", "編集")}>
                    <Pencil size={13} />
                  </button>
                  {/* Delete button */}
                  {!hideDelete && (
                    <button onClick={(e) => { e.stopPropagation(); setDeleteUser(u); }} className="p-1.5 rounded-md text-text-tertiary hover:text-safety-high hover:bg-risk-bg transition-colors shrink-0" title={tx(locale, "Delete", "삭제", "削除")}>
                      <Trash2 size={13} />
                    </button>
                  )}
                  {/* Active toggle */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggleActive(u.id, u.isActive); }}
                    disabled={toggling === u.id}
                    className={cn(
                      "relative w-10 h-6 rounded-full transition-colors duration-200 shrink-0",
                      u.isActive ? "bg-safety-low" : "bg-border-strong",
                      toggling === u.id && "opacity-50",
                    )}
                  >
                    <span className={cn(
                      "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200",
                      u.isActive && "translate-x-4",
                    )} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Create account buttons */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2">
          <Button size="sm" onClick={() => { setCreateRole("ADMIN"); setCreateOpen(true); }}>
            <Plus size={14} /> {tx(locale, "Add Admin", "관리자 추가", "管理者追加")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setCreateRole("SHIPYARD"); setCreateShipyardMode(shipyards.length > 0 ? "join" : "new"); setCreateShipyardId(""); setCreateOpen(true); }}>
            <Plus size={14} /> {tx(locale, "Add Shipyard", "조선소 추가", "造船所追加")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setCreateRole("VENDOR"); setCreateShipyardId(""); setCreateOpen(true); }}>
            <Plus size={14} /> {tx(locale, "Add Vendor", "벤더 추가", "ベンダー追加")}
          </Button>
        </div>
        <CsvUploadButton
          locale={locale}
          endpoint="/api/admin/users/bulk"
          payloadKey="users"
          label={tx(locale, "Bulk Upload", "엑셀 붙여넣기 등록", "Excel貼り付け登録")}
          columns={["email", "name", "role", "company", "phone", "password", "shipyard"]}
          onDone={loadUsers}
        />
      </div>

      <UserSection title={tx(locale, "Admins", "관리자", "管理者")} list={adminUsers} hideDelete />
      <UserSection title={tx(locale, "Shipyard Accounts", "조선소 계정", "造船所アカウント")} list={shipyardUsers} onRowClick={handleShipyardClick} />
      <UserSection title={tx(locale, "Vendor Accounts", "벤더 계정", "ベンダーアカウント")} list={vendorUsers} onRowClick={handleVendorClick} />

      {/* Create user dialog */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={
          createRole === "ADMIN" ? tx(locale, "Create Admin", "관리자 계정 생성", "管理者アカウント作成") :
          createRole === "VENDOR" ? tx(locale, "Create Vendor", "벤더 계정 생성", "ベンダーアカウント作成") :
          tx(locale, "Create Shipyard", "조선소 계정 생성", "造船所アカウント作成")
        }
        description={
          createRole === "ADMIN" ? tx(locale, "Create an account with system admin privileges", "시스템 관리 권한을 가진 계정을 생성합니다", "システム管理権限を持つアカウントを作成します") :
          createRole === "VENDOR" ? tx(locale, "Create a vendor account assigned to a shipyard", "조선소에 배정된 벤더 계정을 생성합니다", "造船所に配属されたベンダーアカウントを作成します") :
          tx(locale, "Create a shipyard account to manage projects and vendors", "프로젝트와 벤더를 관리할 조선소 계정을 생성합니다", "プロジェクトとベンダーを管理する造船所アカウントを作成します")
        }
      >
        <div className="space-y-4">
          <Input label={tx(locale, "Name *", "이름 *", "名前 *")} placeholder={tx(locale, "Name", "이름", "名前")} value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
          <Input label={tx(locale, "Email *", "이메일 *", "メール *")} type="email" placeholder="user@example.com" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
          <Input label={tx(locale, "Password *", "비밀번호 *", "パスワード *")} type="password" placeholder={tx(locale, "6+ characters", "6자 이상", "6文字以上")} value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />

          {/* Shipyard selector — only for SHIPYARD role */}
          {createRole === "SHIPYARD" && (
            <div className="space-y-2">
              <label className="text-body-xs font-semibold text-text-secondary">
                {tx(locale, "Shipyard *", "조선소 *", "造船所 *")}
              </label>
              {shipyards.length > 0 ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateShipyardMode("join")}
                    className={cn(
                      "flex-1 px-3 py-2 rounded-lg text-body-xs font-semibold border transition-colors",
                      createShipyardMode === "join"
                        ? "bg-brand-lighter border-brand text-brand"
                        : "bg-surface border-border text-text-tertiary hover:bg-surface-secondary",
                    )}
                  >
                    {tx(locale, "Join existing", "기존 조선소 합류", "既存に参加")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateShipyardMode("new")}
                    className={cn(
                      "flex-1 px-3 py-2 rounded-lg text-body-xs font-semibold border transition-colors",
                      createShipyardMode === "new"
                        ? "bg-brand-lighter border-brand text-brand"
                        : "bg-surface border-border text-text-tertiary hover:bg-surface-secondary",
                    )}
                  >
                    {tx(locale, "Create new", "새 조선소 생성", "新規作成")}
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-text-tertiary">
                  {tx(locale,
                    "No shipyards exist yet — a new one will be created.",
                    "등록된 조선소가 없습니다 — 새로 생성됩니다.",
                    "造船所がまだありません — 新規作成されます。",
                  )}
                </p>
              )}
              {createShipyardMode === "join" ? (
                <select
                  value={createShipyardId}
                  onChange={(e) => setCreateShipyardId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-body-sm focus:outline-none focus:border-brand"
                >
                  <option value="">{tx(locale, "Select a shipyard…", "조선소 선택…", "造船所を選択…")}</option>
                  {shipyards.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              ) : (
                <Input
                  label={tx(locale, "New shipyard name *", "새 조선소 이름 *", "新造船所名 *")}
                  placeholder={tx(locale, "e.g. Hyundai Heavy Industries", "예: 현대중공업", "例: 現代重工業")}
                  value={createForm.company}
                  onChange={(e) => setCreateForm({ ...createForm, company: e.target.value })}
                />
              )}
              <p className="text-[11px] text-text-tertiary">
                {createShipyardMode === "join"
                  ? tx(locale,
                      "This account will share projects and vendors with other users in the selected shipyard.",
                      "이 계정은 선택한 조선소의 프로젝트와 벤더를 다른 사용자들과 함께 사용합니다.",
                      "このアカウントは選択した造船所のプロジェクトとベンダーを他のユーザーと共有します。",
                    )
                  : tx(locale,
                      "A new shipyard will be created and this account will be its first member.",
                      "새 조선소가 생성되고 이 계정이 첫 멤버가 됩니다.",
                      "新しい造船所が作成され、このアカウントが最初のメンバーになります。",
                    )}
              </p>
            </div>
          )}

          {/* VENDOR: shipyard selector (required) + company name */}
          {createRole === "VENDOR" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold text-text-secondary">
                  {tx(locale, "Assigned Shipyard *", "소속 조선소 *", "配属造船所 *")}
                </label>
                {shipyards.length > 0 ? (
                  <select
                    value={createShipyardId}
                    onChange={(e) => setCreateShipyardId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-body-sm focus:outline-none focus:border-brand"
                  >
                    <option value="">{tx(locale, "Select a shipyard…", "조선소 선택…", "造船所を選択…")}</option>
                    {shipyards.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-[11px] text-text-tertiary">
                    {tx(locale, "No shipyards exist. Create a shipyard first.", "등록된 조선소가 없습니다. 조선소를 먼저 생성하세요.", "造船所がありません。先に造船所を作成してください。")}
                  </p>
                )}
              </div>
              <Input label={tx(locale, "Company", "회사명", "会社名")} placeholder={tx(locale, "Vendor company name", "벤더 회사명", "ベンダー会社名")} value={createForm.company} onChange={(e) => setCreateForm({ ...createForm, company: e.target.value })} />
            </div>
          )}

          {createRole === "ADMIN" && (
            <Input label={tx(locale, "Company", "회사명", "会社名")} placeholder={tx(locale, "Company (optional)", "회사명 (선택)", "会社名（任意）")} value={createForm.company} onChange={(e) => setCreateForm({ ...createForm, company: e.target.value })} />
          )}
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{tx(locale, "Cancel", "취소", "キャンセル")}</Button>
            <Button onClick={handleCreateUser} loading={createSaving}><Plus size={14} /> {tx(locale, "Create", "생성", "作成")}</Button>
          </div>
        </div>
      </Dialog>

      {/* Delete user confirm */}
      <ConfirmDialog
        open={!!deleteUser}
        onClose={() => setDeleteUser(null)}
        onConfirm={handleDeleteUser}
        title={tx(locale, "Delete User", "사용자 삭제", "ユーザー削除")}
        description={locale === "ko" ? `"${deleteUser?.name}" (${deleteUser?.email}) 계정을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.` : locale === "ja" ? `「${deleteUser?.name}」(${deleteUser?.email})のアカウントを削除しますか？この操作は元に戻せません。` : `Delete "${deleteUser?.name}" (${deleteUser?.email})? This cannot be undone.`}
      />

      {/* Shipyard detail dialog */}
      <Dialog
        open={!!selectedShipyard}
        onClose={() => { setSelectedShipyard(null); setShipyardProjects([]); }}
        title={selectedShipyard?.name || ""}
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-border">
            <div className="h-10 w-10 rounded-full bg-brand-lighter flex items-center justify-center shrink-0">
              <Building2 size={18} className="text-brand" />
            </div>
            <div>
              <p className="text-[14px] font-bold text-text">{selectedShipyard?.name}</p>
              <p className="text-[12px] text-text-tertiary">{selectedShipyard?.email}{selectedShipyard?.shipyard ? ` · ${selectedShipyard.shipyard.name}` : ""}</p>
            </div>
          </div>

          {eqLoading ? (
            <div className="py-6 text-center text-[12px] text-text-tertiary">{tx(locale, "Loading...", "로딩 중...", "読み込み中...")}</div>
          ) : shipyardProjects.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-text-tertiary">{tx(locale, "No projects", "소속 프로젝트가 없습니다", "所属プロジェクトがありません")}</div>
          ) : (
            <div className="space-y-3">
              {shipyardProjects.map((p) => {
                const stMap: Record<string, { label: string; color: string; bg: string }> = {
                  ACTIVE: { label: tx(locale, "Active", "진행 중", "進行中"), color: "#0F62FE", bg: "#EDF5FF" },
                  SUBMITTED: { label: tx(locale, "Submitted", "제출됨", "提出済み"), color: "#EB6200", bg: "#FFF3E0" },
                  UNDER_REVIEW: { label: tx(locale, "Under Review", "검토 중", "審査中"), color: "#EB6200", bg: "#FFF3E0" },
                  APPROVED: { label: tx(locale, "Approved", "승인됨", "承認済み"), color: "#24A148", bg: "#E6F7EF" },
                  CLOSED: { label: tx(locale, "Closed", "완료", "完了"), color: "#8D8D8D", bg: "#F4F4F4" },
                };
                const st = stMap[p.status] || stMap.ACTIVE;
                return (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedShipyard(null); router.push(`/project/${p.id}`); }}
                    className="w-full rounded-xl border border-border flex items-center gap-3 px-4 py-3.5 hover:bg-brand-lighter/30 transition-colors text-left"
                  >
                    <Ship size={16} className="text-brand shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-bold text-text truncate">{p.vesselName}</p>
                        {p.classification && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-brand-lighter text-brand">{p.classification}</span>}
                      </div>
                      <p className="text-[10px] text-text-tertiary mt-0.5">
                        {tx(locale, "Eq", "기자재", "機器")} {p._count.equipments} · HW {p._count.hardware} · SW {p._count.software}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                    <ChevronRight size={14} className="text-border-strong shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Dialog>

      {/* Vendor detail dialog */}
      <Dialog
        open={!!selectedVendor}
        onClose={() => { setSelectedVendor(null); setVendorEquipments([]); }}
        title={selectedVendor?.name || ""}
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-border">
            <div className="h-10 w-10 rounded-full bg-brand-lighter flex items-center justify-center shrink-0">
              <span className="text-[13px] font-bold text-brand">{selectedVendor?.name.charAt(0)}</span>
            </div>
            <div>
              <p className="text-[14px] font-bold text-text">{selectedVendor?.name}</p>
              <p className="text-[12px] text-text-tertiary">{selectedVendor?.email}{selectedVendor?.company ? ` · ${selectedVendor.company}` : ""}{selectedVendor?.shipyard ? ` · ${selectedVendor.shipyard.name}` : ""}</p>
            </div>
          </div>

          {eqLoading ? (
            <div className="py-6 text-center text-[12px] text-text-tertiary">{tx(locale, "Loading...", "로딩 중...", "読み込み中...")}</div>
          ) : vendorEquipments.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-text-tertiary">{tx(locale, "No equipment assigned", "할당된 기자재가 없습니다", "割り当てられた機器がありません")}</div>
          ) : (
            <div className="space-y-3">
              {Object.entries(
                vendorEquipments.reduce((acc, eq) => {
                  const key = eq.project.id;
                  if (!acc[key]) acc[key] = { vesselName: eq.project.vesselName, projectId: key, items: [] };
                  acc[key].items.push(eq);
                  return acc;
                }, {} as Record<string, { vesselName: string; projectId: string; items: VendorEquipment[] }>)
              ).map(([, group]) => (
                <div key={group.projectId} className="rounded-xl border border-border overflow-hidden">
                  <button
                    onClick={() => { setSelectedVendor(null); router.push(`/project/${group.projectId}`); }}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-brand-lighter/50 hover:bg-brand-lighter transition-colors text-left"
                  >
                    <Ship size={15} className="text-brand shrink-0" />
                    <span className="text-[13px] font-bold text-text flex-1">{group.vesselName}</span>
                    <span className="text-[11px] text-brand font-semibold">{tx(locale, "Go →", "프로젝트 이동 →", "プロジェクトへ →")}</span>
                  </button>
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

      {/* Edit user dialog */}
      <Dialog open={!!editUser} onClose={() => setEditUser(null)} title={tx(locale, "Edit User", "사용자 편집", "ユーザー編集")}>
        <div className="space-y-4">
          <Input label={tx(locale, "Name", "이름", "名前")} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          <Input label={tx(locale, "Email", "이메일", "メール")} value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
          <Input label={tx(locale, "Company", "회사명", "会社名")} value={editForm.company} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })} />
          {/* Shipyard reassignment — only meaningful for SHIPYARD/VENDOR users.
              ADMIN accounts have no shipyard. */}
          {editUser && editUser.role !== "ADMIN" && (
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-text-secondary">{tx(locale, "Shipyard", "소속 조선소", "所属造船所")}</label>
              <select
                value={editForm.shipyardId}
                onChange={(e) => setEditForm({ ...editForm, shipyardId: e.target.value })}
                className="h-10 w-full rounded-[8px] border border-border bg-white px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand/20 appearance-none"
              >
                <option value="">{tx(locale, "None", "없음", "なし")}</option>
                {shipyards.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <p className="text-[11px] text-text-tertiary">
                {tx(locale,
                  "Moving a user to another shipyard changes which projects and vendors they can see.",
                  "사용자의 소속 조선소를 바꾸면 접근 가능한 프로젝트와 벤더가 바뀝니다.",
                  "ユーザーの所属造船所を変更すると、表示できるプロジェクトとベンダーが変わります。",
                )}
              </p>
            </div>
          )}
          <div className="pt-3 border-t border-border">
            <Input
              label={tx(locale, "Reset Password (enter to change)", "비밀번호 초기화 (입력 시 변경됨)", "パスワードリセット（入力すると変更されます）")}
              type="password"
              value={editForm.newPassword}
              onChange={(e) => setEditForm({ ...editForm, newPassword: e.target.value })}
              placeholder={tx(locale, "New password", "새 비밀번호 입력", "新しいパスワードを入力")}
            />
          </div>
          <div className="pt-3 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-semibold text-text-secondary">{tx(locale, "Registered IP", "등록된 IP", "登録済みIP")}</p>
                {editUser?.registeredIps && editUser.registeredIps.length > 0 ? (
                  <p className="font-mono text-[10px] text-text mt-0.5">{editUser.registeredIps.join(", ")}</p>
                ) : (
                  <p className="text-[10px] text-text-tertiary mt-0.5">{tx(locale, "No IP registered — auto-registers on next login", "등록된 IP 없음 — 다음 로그인 시 자동 등록", "IP未登録 — 次回ログイン時に自動登録")}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIpResetOpen(true)}
                className="px-3 py-1.5 rounded-[var(--radius-sm)] text-[11px] font-semibold text-safety-elevated border border-safety-elevated/20 hover:bg-orange-50 transition-colors"
              >
                {tx(locale, "Reset IP", "IP 초기화", "IPリセット")}
              </button>
              <ConfirmDialog
                open={ipResetOpen}
                onClose={() => setIpResetOpen(false)}
                title={tx(locale, "Reset IP Whitelist", "IP 화이트리스트 초기화", "IPホワイトリストリセット")}
                description={tx(locale, "This user's registered IPs will be cleared. A new IP will be auto-registered on their next login.", "이 사용자의 등록된 IP가 초기화됩니다. 다음 로그인 시 새 IP가 자동 등록됩니다.", "このユーザーの登録済みIPがリセットされます。次回ログイン時に新しいIPが自動登録されます。")}
                confirmLabel={tx(locale, "Reset", "초기화", "リセット")}
                cancelLabel={tx(locale, "Cancel", "취소", "キャンセル")}
                loading={ipResetting}
                onConfirm={async () => {
                  if (!editUser) return;
                  setIpResetting(true);
                  const res = await fetch("/api/admin/ip-whitelist/reset", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId: editUser.id }),
                  });
                  setIpResetting(false);
                  if (res.ok) showToast.success(tx(locale, "IP reset", "IP 초기화 완료", "IPリセット完了"));
                  else showToast.error(tx(locale, "IP reset failed", "IP 초기화 실패", "IPリセット失敗"));
                }}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setEditUser(null)}>{tx(locale, "Cancel", "취소", "キャンセル")}</Button>
            <Button size="sm" loading={editSaving} onClick={handleEditSave}>{tx(locale, "Save", "저장", "保存")}</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

// ─── Signups Tab ──────────────────────────────────────────────────────────────

function SignupsTab({ locale }: { locale: string }) {
  const [signups, setSignups] = useState<SignupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchSignups = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/signup-requests")
      .then(async (r) => { if (r.ok) { const d = await r.json(); setSignups(Array.isArray(d) ? d : []); } })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchSignups(); }, [fetchSignups]);

  async function handleAction(id: string, action: "APPROVED" | "REJECTED") {
    setProcessing(id);
    // Optimistic: remove from list immediately
    setSignups((prev) => prev.filter((s) => String(s.id) !== String(id)));
    try {
      const res = await fetch("/api/admin/signup-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: id, action }),
      });
      if (res.ok) {
        showToast.success(action === "APPROVED" ? (tx(locale, "Approved", "승인되었습니다", "承認されました")) : (tx(locale, "Rejected", "거절되었습니다", "拒否されました")));
      } else {
        // Revert on failure
        fetchSignups();
        showToast.error(tx(locale, "Action failed", "처리 실패", "処理失敗"));
      }
    } finally {
      setProcessing(null);
    }
  }

  if (loading) return <SkeletonTable rows={4} />;

  return (
    <div className="space-y-4">
      <h2 className="text-body-sm font-bold text-text">{locale === "ko" ? `가입 신청 대기 (${signups.length})` : locale === "ja" ? `承認待ち (${signups.length})` : `Pending Signups (${signups.length})`}</h2>
      {signups.length === 0 ? (
        <EmptyState icon={UserCog} title={tx(locale, "No pending signups", "처리할 가입 신청이 없습니다", "処理するサインアップ申請がありません")} />
      ) : (
        <Card padding="none">
          <div className="divide-y divide-border">
            {signups.map((s) => (
              <div key={s.id} className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <p className="text-body-sm font-semibold text-text">{s.name}</p>
                  <p className="text-body-xs text-text-tertiary">{s.email} · {s.company || "—"}</p>
                  <p className="text-[11px] text-text-tertiary mt-0.5">{new Date(s.createdAt).toLocaleDateString(locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US")}</p>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-lighter text-brand font-semibold">{s.status}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" loading={processing === s.id} onClick={() => handleAction(s.id, "REJECTED")} className="text-safety-high border-safety-high/30">
                    <XCircle size={13} /> {tx(locale, "Reject", "거절", "拒否")}
                  </Button>
                  <Button size="sm" loading={processing === s.id} onClick={() => handleAction(s.id, "APPROVED")} className="bg-safety-low hover:opacity-90">
                    <CheckCircle size={13} /> {tx(locale, "Approve", "승인", "承認")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Shipyards Tab ────────────────────────────────────────────────────────────

function ShipyardsTab({ locale }: { locale: string }) {
  const [shipyards, setShipyards] = useState<ShipyardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ShipyardRow | null>(null);
  const [form, setForm] = useState({ name: "", address: "", phone: "", contact: "" });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ShipyardRow | null>(null);
  const [selectedShipyard, setSelectedShipyard] = useState<ShipyardRow | null>(null);
  const [shipyardUsers, setShipyardUsers] = useState<{ id: string; name: string; email: string; role: string; isActive: boolean }[]>([]);
  const [shipyardProjects, setShipyardProjects] = useState<{ id: string; vesselName: string; status: string; _count?: { equipments: number } }[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState("");

  const fetchShipyards = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/shipyards")
      .then(async (r) => { if (r.ok) { const d = await r.json(); setShipyards(Array.isArray(d) ? d : []); } })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchShipyards(); }, [fetchShipyards]);

  function openCreate() { setEditTarget(null); setForm({ name: "", address: "", phone: "", contact: "" }); setDialogOpen(true); }
  function openEdit(s: ShipyardRow) { setEditTarget(s); setForm({ name: s.name, address: s.address || "", phone: s.phone || "", contact: s.contact || "" }); setDialogOpen(true); }

  async function handleSave() {
    if (!form.name) { showToast.error(tx(locale, "Name required", "이름은 필수입니다", "名前は必須です")); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/shipyards", {
        method: editTarget ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editTarget ? { id: editTarget.id, ...form } : form),
      });
      if (res.ok) {
        showToast.success(tx(locale, "Saved", "저장되었습니다", "保存されました"));
        setDialogOpen(false);
        fetchShipyards();
      } else {
        showToast.error(tx(locale, "Save failed", "저장 실패", "保存失敗"));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSelectShipyard(s: ShipyardRow) {
    if (selectedShipyard?.id === s.id) { setSelectedShipyard(null); return; }
    setSelectedShipyard(s);
    setDetailLoading(true);
    try {
      const [usersRes, projRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/projects"),
      ]);
      if (usersRes.ok) {
        const users = await usersRes.json();
        setShipyardUsers((users || []).filter((u: { shipyardId?: string }) => u.shipyardId === s.id));
      }
      if (projRes.ok) {
        const projects = await projRes.json();
        setShipyardProjects((projects || []).filter((p: { shipyardId?: string }) => p.shipyardId === s.id));
      }
    } finally { setDetailLoading(false); }
  }

  async function handleDeleteShipyard() {
    if (!deleteTarget) return;
    try {
      const res = await fetch("/api/admin/shipyards", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      if (res.ok) {
        showToast.success(tx(locale, "Deleted", "삭제되었습니다", "削除されました"));
        setDeleteTarget(null);
        setSelectedShipyard(null);
        fetchShipyards();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast.error(err.error || tx(locale, "Delete failed", "삭제 실패", "削除失敗"));
      }
    } catch {
      showToast.error(tx(locale, "Delete failed", "삭제 실패", "削除失敗"));
    }
  }

  if (loading) return <SkeletonTable rows={4} />;

  const filtered = shipyards.filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.address || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h2 className="text-body-sm font-bold text-text">{tx(locale, "Shipyards", "조선소", "造船所")}</h2>
          <p className="text-[11px] text-text-tertiary mt-0.5">{filtered.length} / {shipyards.length}</p>
        </div>
        <div className="relative">
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={tx(locale, "Search...", "검색...", "検索...")}
            className="w-[220px] h-8 pl-8 pr-3 rounded-lg border border-border bg-white text-[12px] text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
          />
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
        </div>
        <Button size="sm" onClick={openCreate}><Plus size={14} /> {tx(locale, "Add", "추가", "追加")}</Button>
        <CsvUploadButton
          locale={locale}
          endpoint="/api/admin/shipyards/bulk"
          payloadKey="shipyards"
          label={tx(locale, "Bulk Upload", "엑셀 붙여넣기 등록", "Excel貼り付け登録")}
          columns={["name", "address", "phone", "contact"]}
          onDone={fetchShipyards}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Building2} title={search ? tx(locale, "No results", "검색 결과 없음", "結果なし") : tx(locale, "No shipyards", "등록된 조선소가 없습니다", "登録された造船所がありません")} />
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const isSelected = selectedShipyard?.id === s.id;
            return (
              <Card key={s.id} padding="none" className={cn("overflow-hidden transition-all duration-200", isSelected && "ring-1 ring-brand/30 shadow-md")}>
                {/* Shipyard row */}
                <div
                  className={cn("flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors", isSelected ? "bg-brand-lighter/20" : "hover:bg-surface-secondary/30")}
                  onClick={() => handleSelectShipyard(s)}
                >
                  <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-colors", isSelected ? "bg-brand text-white" : "bg-brand-lighter text-brand")}>
                    <Building2 size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-text">{s.name}</p>
                    <p className="text-[11px] text-text-tertiary mt-0.5">{[s.address, s.contact, s.phone].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-center">
                      <p className="text-[16px] font-black text-text">{s._count?.projects ?? 0}</p>
                      <p className="text-[9px] text-text-tertiary font-medium uppercase">{tx(locale, "Projects", "프로젝트", "プロジェクト")}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[16px] font-black text-text">{s._count?.users ?? 0}</p>
                      <p className="text-[9px] text-text-tertiary font-medium uppercase">{tx(locale, "Users", "사용자", "ユーザー")}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button onClick={(e) => { e.stopPropagation(); openEdit(s); }} className="p-1.5 rounded-md text-text-tertiary hover:text-brand hover:bg-brand-lighter transition-colors" title={tx(locale, "Edit", "수정", "編集")}><Pencil size={13} /></button>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(s); }} className="p-1.5 rounded-md text-text-tertiary hover:text-safety-high hover:bg-risk-bg transition-colors" title={tx(locale, "Delete", "삭제", "削除")}><Trash2 size={13} /></button>
                    </div>
                    <ChevronRight size={16} className={cn("text-text-tertiary transition-transform duration-200", isSelected && "rotate-90 text-brand")} />
                  </div>
                </div>

                {/* Expanded detail */}
                {isSelected && (
                  <div className="border-t border-border bg-surface-page">
                    {detailLoading ? (
                      <div className="flex items-center justify-center py-8 gap-2">
                        <div className="h-4 w-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                        <p className="text-[12px] text-text-tertiary">{tx(locale, "Loading...", "로딩 중...", "読み込み中...")}</p>
                      </div>
                    ) : (
                      <div className="p-5">
                        <div className="grid grid-cols-2 gap-5">
                          {/* Accounts column */}
                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              <Users size={13} className="text-brand" />
                              <p className="text-[11px] font-bold text-text uppercase tracking-wider">
                                {tx(locale, "Accounts", "소속 계정", "所属アカウント")}
                              </p>
                              <span className="ml-auto text-[10px] font-bold text-brand bg-brand-lighter px-2 py-0.5 rounded-full">{shipyardUsers.length}</span>
                            </div>
                            {shipyardUsers.length === 0 ? (
                              <div className="rounded-lg border border-dashed border-border py-6 text-center">
                                <p className="text-[11px] text-text-tertiary">{tx(locale, "No accounts", "계정 없음", "アカウントなし")}</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {shipyardUsers.map((u) => (
                                  <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white border border-border/80 hover:border-brand/20 hover:shadow-xs transition-all">
                                    <div className={cn("h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0", u.isActive ? "bg-brand-hover" : "bg-surface-tertiary")}>
                                      {u.name?.[0]?.toUpperCase() || "?"}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <p className="text-[12px] font-semibold text-text truncate">{u.name}</p>
                                        {!u.isActive && <span className="text-[8px] font-bold text-safety-high bg-risk-bg px-1 py-0.5 rounded">OFF</span>}
                                      </div>
                                      <p className="text-[10px] text-text-tertiary font-mono truncate">{u.email}</p>
                                    </div>
                                    <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full",
                                      u.role === "ADMIN" ? "bg-brand-lighter text-brand" :
                                      u.role === "SHIPYARD" ? "bg-green-50 text-green-700" :
                                      "bg-surface-secondary text-text-tertiary"
                                    )}>{u.role}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Projects column */}
                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              <Ship size={13} className="text-brand" />
                              <p className="text-[11px] font-bold text-text uppercase tracking-wider">
                                {tx(locale, "Projects", "프로젝트", "プロジェクト")}
                              </p>
                              <span className="ml-auto text-[10px] font-bold text-brand bg-brand-lighter px-2 py-0.5 rounded-full">{shipyardProjects.length}</span>
                            </div>
                            {shipyardProjects.length === 0 ? (
                              <div className="rounded-lg border border-dashed border-border py-6 text-center">
                                <p className="text-[11px] text-text-tertiary">{tx(locale, "No projects", "프로젝트 없음", "プロジェクトなし")}</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {shipyardProjects.map((p) => (
                                  <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white border border-border/80 hover:border-brand/20 hover:shadow-xs transition-all">
                                    <div className="h-7 w-7 rounded-lg bg-brand-lighter flex items-center justify-center shrink-0">
                                      <Ship size={13} className="text-brand" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[12px] font-semibold text-text truncate">{p.vesselName}</p>
                                      <p className="text-[10px] text-text-tertiary">{p._count?.equipments ?? 0} {tx(locale, "equipment", "기자재", "機材")}</p>
                                    </div>
                                    <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full",
                                      p.status === "APPROVED" ? "bg-green-50 text-green-700" :
                                      p.status === "SUBMITTED" ? "bg-orange-50 text-orange-700" :
                                      "bg-surface-secondary text-text-tertiary"
                                    )}>{p.status}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editTarget ? (tx(locale, "Edit Shipyard", "조선소 수정", "造船所編集")) : (tx(locale, "Add Shipyard", "조선소 추가", "造船所追加"))}>
        <div className="space-y-4">
          <Input label={tx(locale, "Name *", "이름 *", "名前 *")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label={tx(locale, "Address", "주소", "住所")} placeholder={tx(locale, "Address", "부산시 영도구", "東京都港区")} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Input label={tx(locale, "Phone", "연락처", "電話番号")} placeholder="051-000-0000" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label={tx(locale, "Contact", "담당자", "担当者")} placeholder={tx(locale, "Contact person", "홍길동", "担当者名")} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{tx(locale, "Cancel", "취소", "キャンセル")}</Button>
            <Button onClick={handleSave} loading={saving}>{tx(locale, "Save", "저장", "保存")}</Button>
          </div>
        </div>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={tx(locale, "Delete Shipyard", "조선소 삭제", "造船所削除")}>
        <div className="space-y-4">
          <p className="text-body-sm text-text-secondary">
            {tx(locale, `Delete "${deleteTarget?.name}"? This will also remove all associated projects and data. This cannot be undone.`,
              `"${deleteTarget?.name}"을(를) 삭제하시겠습니까? 관련된 프로젝트와 데이터도 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`,
              `「${deleteTarget?.name}」を削除しますか？関連するプロジェクトとデータもすべて削除されます。この操作は取り消せません。`)}
          </p>
          {(deleteTarget?._count?.projects ?? 0) > 0 && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-risk-bg border border-safety-high/20">
              <AlertCircle size={14} className="text-safety-high mt-0.5 shrink-0" />
              <p className="text-[11px] text-safety-high font-semibold">
                {tx(locale, `This shipyard has ${deleteTarget?._count?.projects} project(s)`,
                  `이 조선소에 ${deleteTarget?._count?.projects}개의 프로젝트가 있습니다`,
                  `この造船所には${deleteTarget?._count?.projects}件のプロジェクトがあります`)}
              </p>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{tx(locale, "Cancel", "취소", "キャンセル")}</Button>
            <Button onClick={handleDeleteShipyard} className="bg-safety-high hover:opacity-90">{tx(locale, "Delete", "삭제", "削除")}</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

// ─── Submissions Tab ─────────────────────────────────────────────────────────

interface SubmissionRow {
  id: string; projectId: string; vesselName: string; phase: string; status: string;
  createdAt: string; hwCount: number; swCount: number; eqCount: number;
}

function SubmissionsTab({ locale }: { locale: string }) {
  const [data, setData] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      try {
        const projRes = await fetch("/api/projects");
        if (!projRes.ok) return;
        const projects = await projRes.json();
        const rows: SubmissionRow[] = [];
        for (const p of (Array.isArray(projects) ? projects : [])) {
          const subRes = await fetch(`/api/projects/${p.id}/submissions`);
          if (!subRes.ok) continue;
          const subs = await subRes.json();
          for (const s of (Array.isArray(subs) ? subs : [])) {
            rows.push({
              id: s.id, projectId: p.id, vesselName: p.vesselName, phase: s.phase, status: s.status,
              createdAt: s.createdAt, hwCount: p._count?.hardware ?? 0, swCount: p._count?.software ?? 0, eqCount: p._count?.equipments ?? 0,
            });
          }
        }
        setData(rows);
      } finally { setLoading(false); }
    })();
  }, []);

  const STATUS_META: Record<string, { label: string; ko: string; ja: string; bg: string; color: string }> = {
    DRAFT:        { label: "Draft",        ko: "미착수",   ja: "下書き",     bg: "#F4F4F4", color: "#8D8D8D" },
    SUBMITTED:    { label: "Submitted",    ko: "제출됨",   ja: "提出済み",   bg: "#EDF5FF", color: "#0F62FE" },
    UNDER_REVIEW: { label: "Under Review", ko: "검토 중",  ja: "審査中",     bg: "#FFF3E0", color: "#EB6200" },
    APPROVED:     { label: "Approved",     ko: "승인됨",   ja: "承認済み",   bg: "#E6F7EF", color: "#24A148" },
    REJECTED:     { label: "Rejected",     ko: "반려됨",   ja: "却下",       bg: "#FFF1F1", color: "#DA1E28" },
  };

  const statusLabel = (status: string) => {
    const m = STATUS_META[status] || STATUS_META.DRAFT;
    return locale === "ko" ? m.ko : locale === "ja" ? m.ja : m.label;
  };

  // Counts
  const counts = { all: data.length, SUBMITTED: 0, UNDER_REVIEW: 0, APPROVED: 0, DRAFT: 0, REJECTED: 0 };
  for (const s of data) { if (s.status in counts) (counts as Record<string, number>)[s.status]++; }

  const filtered = filter === "all" ? data : data.filter((s) => s.status === filter);

  if (loading) return <SkeletonTable rows={5} />;

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex items-center gap-1.5">
        {[
          { key: "all", label: tx(locale, "All", "전체", "すべて"), count: counts.all },
          { key: "SUBMITTED", label: tx(locale, "Submitted", "제출됨", "提出済み"), count: counts.SUBMITTED },
          { key: "UNDER_REVIEW", label: tx(locale, "Under Review", "검토 중", "審査中"), count: counts.UNDER_REVIEW },
          { key: "APPROVED", label: tx(locale, "Approved", "승인됨", "承認済み"), count: counts.APPROVED },
          { key: "REJECTED", label: tx(locale, "Rejected", "반려됨", "却下"), count: counts.REJECTED },
          { key: "DRAFT", label: tx(locale, "Draft", "미착수", "下書き"), count: counts.DRAFT },
        ].filter((t) => t.key === "all" || t.count > 0).map((tab) => (
          <button key={tab.key} onClick={() => setFilter(tab.key)}
            className={cn("px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all border",
              filter === tab.key ? "bg-brand text-white border-transparent" : "bg-white border-border text-text-tertiary hover:border-border-strong"
            )}>
            {tab.label} {tab.count > 0 && <span className={cn("ml-1", filter === tab.key ? "text-white/70" : "text-text-tertiary")}>{tab.count}</span>}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Send} title={tx(locale, "No submissions", "제출물이 없습니다", "提出物がありません")} />
      ) : (
        <Card padding="none">
          <div className="divide-y divide-border">
            {filtered.map((s) => {
              const sc = STATUS_META[s.status] || STATUS_META.DRAFT;
              return (
                <a key={s.id} href={`/project/${s.projectId}/submit`}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface-secondary/20 transition-colors">
                  <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: sc.bg }}>
                    <Send size={15} style={{ color: sc.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-semibold text-text truncate">{s.vesselName}</p>
                    <p className="text-[11px] text-text-tertiary">
                      {new Date(s.createdAt).toLocaleDateString(locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US")} · {tx(locale, "Eq", "기자재", "機器")} {s.eqCount} · HW {s.hwCount} · SW {s.swCount}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0" style={{ background: sc.bg, color: sc.color }}>
                    {statusLabel(s.status)}
                  </span>
                  <ChevronRight size={14} className="text-text-tertiary shrink-0" />
                </a>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── FAQ Tab ──────────────────────────────────────────────────────────────────

function FaqTab({ locale }: { locale: string }) {
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<FaqRow | null>(null);
  const [form, setForm] = useState({ question: "", answer: "", category: "general" });
  const [saving, setSaving] = useState(false);

  const fetchFaqs = useCallback(() => {
    setLoading(true);
    fetch("/api/faq")
      .then(async (r) => { if (r.ok) { const d = await r.json(); setFaqs(Array.isArray(d) ? d : []); } })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchFaqs(); }, [fetchFaqs]);

  function openCreate() { setEditTarget(null); setForm({ question: "", answer: "", category: "general" }); setDialogOpen(true); }
  function openEdit(f: FaqRow) { setEditTarget(f); setForm({ question: f.question, answer: f.answer, category: f.category }); setDialogOpen(true); }

  async function handleSave() {
    if (!form.question || !form.answer) { showToast.error(tx(locale, "Question and answer required", "질문과 답변은 필수입니다", "質問と回答は必須です")); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/faq", {
        method: editTarget ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editTarget ? { id: editTarget.id, ...form } : form),
      });
      if (res.ok) { showToast.success(tx(locale, "Saved", "저장되었습니다", "保存されました")); setDialogOpen(false); fetchFaqs(); }
      else showToast.error(tx(locale, "Save failed", "저장 실패", "保存失敗"));
    } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    const res = await fetch("/api/faq", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (res.ok) { showToast.success(tx(locale, "Deleted", "삭제되었습니다", "削除されました")); fetchFaqs(); }
    else showToast.error(tx(locale, "Delete failed", "삭제 실패", "削除失敗"));
  }

  if (loading) return <SkeletonTable rows={4} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-body-sm font-bold text-text">{`FAQ (${faqs.length})`}</h2>
        <Button size="sm" onClick={openCreate}><Plus size={14} /> {tx(locale, "Add", "추가", "追加")}</Button>
      </div>
      {faqs.length === 0 ? (
        <EmptyState icon={HelpCircle} title={tx(locale, "No FAQ entries", "FAQ가 없습니다", "FAQがありません")} />
      ) : (
        <Card padding="none">
          <div className="divide-y divide-border">
            {faqs.map((f) => (
              <div key={f.id} className="flex items-start gap-4 px-5 py-4 hover:bg-surface-secondary/20 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-body-sm font-semibold text-text">{f.question}</p>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-surface-secondary text-text-tertiary">{f.category}</span>
                  </div>
                  <p className="text-body-xs text-text-tertiary line-clamp-2">{f.answer}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(f)}><Pencil size={13} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(f.id)} className="text-safety-high hover:bg-risk-bg"><Trash2 size={13} /></Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editTarget ? (tx(locale, "Edit FAQ", "FAQ 수정", "FAQ編集")) : (tx(locale, "Add FAQ", "FAQ 추가", "FAQ追加"))} maxWidth="max-w-2xl">
        <div className="space-y-4">
          <Input label={tx(locale, "Question *", "질문 *", "質問 *")} value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} />
          <Textarea label={tx(locale, "Answer *", "답변 *", "回答 *")} rows={3} value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} />
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-text-secondary">{tx(locale, "Category", "카테고리", "カテゴリ")}</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="h-10 w-full rounded-[8px] border border-border bg-white px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand/20">
              <option value="general">{tx(locale, "General", "일반", "一般")}</option>
              <option value="assessment">{tx(locale, "Assessment", "보안평가", "セキュリティ評価")}</option>
              <option value="document">{tx(locale, "Document", "문서", "文書")}</option>
              <option value="submission">{tx(locale, "Submission", "제출", "提出")}</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{tx(locale, "Cancel", "취소", "キャンセル")}</Button>
            <Button onClick={handleSave} loading={saving}>{tx(locale, "Save", "저장", "保存")}</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

const SETTING_LABELS: Record<string, { ko: string; en: string; unit?: string }> = {
  maintenance_mode: { ko: "유지보수 모드", en: "Maintenance Mode" },
  session_timeout: { ko: "세션 유지 시간", en: "Session Timeout", unit: "분" },
};

function SettingsTab({ locale }: { locale: string }) {
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          const arr = Array.isArray(data)
            ? data
            : Object.entries(data).map(([key, value]) => ({ key, value: String(value), description: null }));
          // 필요한 설정만 필터
          setSettings(arr.filter((s: SettingRow) => s.key in SETTING_LABELS));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleToggleMaintenance() {
    const current = settings.find((s) => s.key === "maintenance_mode");
    if (!current) return;
    const newVal = current.value === "true" ? "false" : "true";
    setSaving(true);
    const res = await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "maintenance_mode", value: newVal }) });
    setSaving(false);
    if (res.ok) {
      showToast.success(tx(locale, "Saved", "저장 완료", "保存完了"));
      setSettings((p) => p.map((s) => s.key === "maintenance_mode" ? { ...s, value: newVal } : s));
    }
  }

  async function handleSessionChange(val: string) {
    setSaving(true);
    const res = await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "session_timeout", value: val }) });
    setSaving(false);
    if (res.ok) {
      showToast.success(tx(locale, "Saved", "저장 완료", "保存完了"));
      setSettings((p) => p.map((s) => s.key === "session_timeout" ? { ...s, value: val } : s));
    }
  }

  if (loading) return <SkeletonTable rows={2} />;

  const maintenance = settings.find((s) => s.key === "maintenance_mode");
  const session = settings.find((s) => s.key === "session_timeout");

  return (
    <div className="space-y-4">
      <h2 className="text-body-sm font-bold text-text">{tx(locale, "System Settings", "시스템 설정", "システム設定")}</h2>
      <Card padding="none">
        <div className="divide-y divide-border">
          {/* Maintenance mode toggle */}
          {maintenance && (
            <div className="flex items-center justify-between px-5 py-5">
              <div>
                <p className="text-[14px] font-semibold text-text">{tx(locale, "Maintenance Mode", "유지보수 모드", "メンテナンスモード")}</p>
                <p className="text-[12px] text-text-tertiary mt-0.5">
                  {tx(locale, "When enabled, non-admin access is blocked", "활성화하면 관리자 외 접근이 차단됩니다", "有効にすると管理者以外のアクセスがブロックされます")}
                </p>
              </div>
              <button
                onClick={handleToggleMaintenance}
                disabled={saving}
                className={cn(
                  "relative w-12 h-7 rounded-full transition-colors duration-200",
                  maintenance.value === "true" ? "bg-safety-high" : "bg-border-strong",
                )}
              >
                <span className={cn(
                  "absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200",
                  maintenance.value === "true" && "translate-x-5",
                )} />
              </button>
            </div>
          )}

          {/* Session timeout */}
          {session && (
            <div className="flex items-center justify-between px-5 py-5">
              <div>
                <p className="text-[14px] font-semibold text-text">{tx(locale, "Session Timeout", "세션 유지 시간", "セッションタイムアウト")}</p>
                <p className="text-[12px] text-text-tertiary mt-0.5">
                  {tx(locale, "Auto-logout after this duration", "로그인 후 자동 로그아웃까지의 시간", "この時間経過後に自動ログアウト")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={session.value}
                  onChange={(e) => handleSessionChange(e.target.value)}
                  disabled={saving}
                  className="h-9 px-3 rounded-[8px] border border-border bg-white text-[13px] text-text focus:outline-none focus:ring-2 focus:ring-brand/20 appearance-none"
                >
                  {[15, 30, 60, 120].map((m) => (
                    <option key={m} value={String(m)}>{m}{tx(locale, "min", "분", "分")}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── Logs Tab ─────────────────────────────────────────────────────────────────

const LOG_LEVEL_STYLES: Record<string, string> = {
  INFO:     "bg-brand-lighter text-brand",
  WARNING:  "bg-orange-50 text-safety-elevated",
  ERROR:    "bg-risk-bg text-safety-high",
  CRITICAL: "bg-risk-bg text-safety-high font-bold",
};

function LogsTab({ locale }: { locale: string }) {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");

  useEffect(() => {
    fetch("/api/admin/security-logs")
      .then(async (r) => { if (r.ok) { const d = await r.json(); setLogs(Array.isArray(d) ? d : d.logs || []); } })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <SkeletonTable rows={6} />;

  const filters = [
    { key: "ALL", labelKo: "전체", labelEn: "All", labelJa: "すべて" },
    { key: "LOGIN", labelKo: "로그인", labelEn: "Login", labelJa: "ログイン" },
    { key: "SIGNUP", labelKo: "가입", labelEn: "Signup", labelJa: "登録" },
    { key: "WARN", labelKo: "경고", labelEn: "Warning", labelJa: "警告" },
  ];

  const filtered = filter === "ALL" ? logs : logs.filter((l) => {
    if (filter === "LOGIN") return l.event.includes("LOGIN");
    if (filter === "SIGNUP") return l.event.includes("SIGNUP");
    if (filter === "WARN") return l.level === "WARN" || l.level === "ERROR";
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-body-sm font-bold text-text">{locale === "ko" ? `보안 이력 (${filtered.length})` : locale === "ja" ? `セキュリティログ (${filtered.length})` : `Security Logs (${filtered.length})`}</h2>
        <div className="flex gap-1">
          {filters.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={cn("px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all border",
                filter === f.key ? "bg-brand text-white border-transparent" : "bg-white border-border text-text-tertiary hover:border-border-strong"
              )}>
              {locale === "ko" ? f.labelKo : locale === "ja" ? ((f as Record<string, string>).labelJa || f.labelEn) : f.labelEn}
            </button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={Activity} title={tx(locale, "No matching logs", "해당 이력이 없습니다", "該当するログがありません")} />
      ) : (
        <Card padding="none">
          <div className="divide-y divide-border max-h-[560px] overflow-y-auto">
            {filtered.map((log) => (
              <div key={log.id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-surface-secondary/20 transition-colors">
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5", LOG_LEVEL_STYLES[log.level] || LOG_LEVEL_STYLES.INFO)}>
                  {log.level}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-body-sm font-semibold text-text">{log.event}</p>
                  {log.detail && <p className="text-body-xs text-text-tertiary mt-0.5 truncate">{log.detail}</p>}
                  {log.userEmail && <p className="text-[11px] text-text-tertiary mt-0.5">{log.userEmail}</p>}
                </div>
                <span className="text-[11px] text-text-tertiary shrink-0">
                  {new Date(log.createdAt).toLocaleString(tx(locale, "en-US", "ko-KR", "ja-JP"), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Q&A Admin Tab ───────────────────────────────────────────────────────────

interface QnaRow {
  id: string;
  title: string;
  content: string;
  answer: string | null;
  status: string;
  targetType: string;
  user: { id: string; name: string; email: string };
  createdAt: string;
}

function QnaAdminTab({ locale }: { locale: string }) {
  const [qnas, setQnas] = useState<QnaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [answerTarget, setAnswerTarget] = useState<QnaRow | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QnaRow | null>(null);

  const fetchQnas = useCallback(() => {
    setLoading(true);
    fetch("/api/qna?all=true")
      .then(async (r) => { if (r.ok) { const d = await r.json(); setQnas(Array.isArray(d) ? d : []); } })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchQnas(); }, [fetchQnas]);

  async function handleAnswer() {
    if (!answerTarget || !answerText.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/qna/${answerTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: answerText.trim(), status: "ANSWERED" }),
      });
      if (res.ok) {
        showToast.success(tx(locale, "Answered", "답변 완료", "回答済み"));
        setAnswerTarget(null);
        setAnswerText("");
        fetchQnas();
      }
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/qna/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      showToast.success(tx(locale, "Deleted", "삭제됨", "削除済み"));
      setDeleteTarget(null);
      fetchQnas();
    }
  }

  const statusStyles: Record<string, { label: string; bg: string; color: string }> = {
    OPEN: { label: tx(locale, "Open", "미답변", "未回答"), bg: "#FFF3E0", color: "#EB6200" },
    ANSWERED: { label: tx(locale, "Answered", "답변완료", "回答済み"), bg: "#E6F7EF", color: "#24A148" },
    CLOSED: { label: tx(locale, "Closed", "종료", "終了"), bg: "#F4F4F4", color: "#8D8D8D" },
  };

  if (loading) return <SkeletonTable rows={4} />;

  return (
    <div className="space-y-4">
      <h2 className="text-body-sm font-bold text-text">
        {locale === "ko" ? `Q&A 관리 (${qnas.length})` : locale === "ja" ? `Q&A管理 (${qnas.length})` : `Q&A Management (${qnas.length})`}
      </h2>

      {qnas.length === 0 ? (
        <EmptyState icon={MessageSquare} title={tx(locale, "No Q&A", "Q&A가 없습니다", "Q&Aがありません")} />
      ) : (
        <Card padding="none">
          <div className="divide-y divide-border">
            {qnas.map((q) => {
              const st = statusStyles[q.status] || statusStyles.OPEN;
              return (
                <div key={q.id} className="px-5 py-4 hover:bg-surface-secondary/20 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="h-7 w-7 rounded-full bg-brand-lighter flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[11px] font-bold text-brand">Q</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-body-sm font-semibold text-text">{q.title}</p>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                      </div>
                      <p className="text-body-xs text-text-tertiary line-clamp-2">{q.content}</p>
                      <p className="text-[11px] text-text-tertiary mt-1">
                        {q.user.name} ({q.user.email}) · {new Date(q.createdAt).toLocaleDateString(locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US")}
                      </p>
                      {q.answer && (
                        <div className="mt-2 p-2.5 rounded-lg bg-green-50 border border-green-200">
                          <p className="text-[11px] font-semibold text-green-700 mb-1">A:</p>
                          <p className="text-body-xs text-green-800">{q.answer}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {q.status === "OPEN" && (
                        <Button size="sm" variant="outline" onClick={() => { setAnswerTarget(q); setAnswerText(q.answer || ""); }}>
                          <Pencil size={13} /> {tx(locale, "Answer", "답변", "回答")}
                        </Button>
                      )}
                      {q.status === "ANSWERED" && (
                        <Button size="sm" variant="ghost" onClick={() => { setAnswerTarget(q); setAnswerText(q.answer || ""); }}>
                          <Pencil size={13} />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(q)} className="text-safety-high hover:bg-risk-bg">
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Answer Dialog */}
      <Dialog open={!!answerTarget} onClose={() => setAnswerTarget(null)} title={tx(locale, "Answer Q&A", "Q&A 답변", "Q&A回答")}>
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-surface-secondary">
            <p className="text-body-sm font-semibold text-text">{answerTarget?.title}</p>
            <p className="text-body-xs text-text-tertiary mt-1">{answerTarget?.content}</p>
          </div>
          <Textarea
            label={tx(locale, "Answer *", "답변 *", "回答 *")}
            rows={4}
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            placeholder={tx(locale, "Write your answer", "답변을 작성하세요", "回答を記入してください")}
          />
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setAnswerTarget(null)}>{tx(locale, "Cancel", "취소", "キャンセル")}</Button>
            <Button onClick={handleAnswer} loading={saving}>{tx(locale, "Submit Answer", "답변 등록", "回答登録")}</Button>
          </div>
        </div>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={tx(locale, "Delete Q&A", "Q&A 삭제", "Q&A削除")}>
        <div className="space-y-4">
          <p className="text-body-sm text-text-secondary">
            {locale === "ko" ? `"${deleteTarget?.title}" 질문을 삭제하시겠습니까?` : locale === "ja" ? `「${deleteTarget?.title}」を削除しますか？` : `Delete "${deleteTarget?.title}"?`}
          </p>
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{tx(locale, "Cancel", "취소", "キャンセル")}</Button>
            <Button onClick={handleDelete} className="bg-safety-high hover:opacity-90">{tx(locale, "Delete", "삭제", "削除")}</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

// ─── Dataset Tab ─────────────────────────────────────────────────────────────

type DatasetType = "conversations" | "feedback" | "actions" | "nlp";

function DatasetTab({ locale }: { locale: string }) {
  const [stats, setStats] = useState<{ conversations: number; feedback: number; actions: number; nlp: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [activeType, setActiveType] = useState<DatasetType | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown>[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/dataset", { method: "POST" })
      .then(async (r) => { if (r.ok) setStats(await r.json()); })
      .finally(() => setLoading(false));
  }, []);

  const loadDetail = async (type: DatasetType) => {
    if (activeType === type) { setActiveType(null); setDetail(null); return; }
    setActiveType(type);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/dataset?type=${type}`);
      if (res.ok) {
        const data = await res.json();
        setDetail(data[type] || []);
      }
    } finally { setDetailLoading(false); }
  };

  const handleExport = async (format: "json" | "ndjson") => {
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/dataset?type=all&format=${format}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `scs-dataset-${new Date().toISOString().slice(0, 10)}.${format === "ndjson" ? "ndjson" : "json"}`;
        a.click();
        URL.revokeObjectURL(url);
        showToast.success(tx(locale, "Downloaded", "다운로드 완료", "ダウンロード完了"));
      }
    } finally { setExporting(false); }
  };

  if (loading) return <SkeletonTable rows={3} />;

  const items: { key: DatasetType; label: string; count: number; desc: string; icon: typeof Shield }[] = [
    { key: "conversations", label: tx(locale, "AI Conversations", "AI 대화", "AI会話"), count: stats?.conversations || 0, desc: tx(locale, "Chat messages between users and AI", "사용자와 AI 간 대화 메시지", "ユーザーとAI間のチャットメッセージ"), icon: MessageSquare },
    { key: "feedback", label: tx(locale, "Feedback", "피드백", "フィードバック"), count: stats?.feedback || 0, desc: tx(locale, "Thumbs up/down on AI responses", "AI 응답에 대한 👍/👎 평가", "AI応答への👍/👎評価"), icon: Activity },
    { key: "actions", label: tx(locale, "User Actions", "사용자 행동", "ユーザーアクション"), count: stats?.actions || 0, desc: tx(locale, "HW/SW creation, imports, assessments", "HW/SW 생성, 임포트, 평가 등", "HW/SW作成、インポート、評価など"), icon: Cpu },
    { key: "nlp", label: tx(locale, "NLP Logs", "NLP 로그", "NLPログ"), count: stats?.nlp || 0, desc: tx(locale, "Intent classification results", "의도 분류 결과", "インテント分類結果"), icon: FileText },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-body-sm font-bold text-text">{tx(locale, "AI Training Dataset", "AI 학습 데이터셋", "AI学習データセット")}</h2>
          <p className="text-body-xs text-text-tertiary mt-0.5">{tx(locale, "Collected data for AI model training and improvement", "AI 모델 학습 및 개선을 위한 수집 데이터", "AIモデルの学習と改善のための収集データ")}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" loading={exporting} onClick={() => handleExport("json")}>
            <Download size={14} /> JSON
          </Button>
          <Button size="sm" variant="outline" loading={exporting} onClick={() => handleExport("ndjson")}>
            <Download size={14} /> NDJSON
          </Button>
        </div>
      </div>

      {/* Stats cards — clickable */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeType === item.key;
          return (
            <button key={item.key} onClick={() => loadDetail(item.key)} className="text-left">
              <Card padding="none" className={cn("transition-all hover:shadow-md cursor-pointer", isActive && "ring-2 ring-brand")}>
                <div className="px-4 py-4">
                  <div className="flex items-center justify-between mb-1">
                    <Icon size={16} className={isActive ? "text-brand" : "text-text-tertiary"} />
                    <ChevronRight size={14} className={cn("text-text-tertiary transition-transform", isActive && "rotate-90")} />
                  </div>
                  <p className="text-[22px] font-extrabold text-text">{item.count.toLocaleString()}</p>
                  <p className="text-[12px] font-bold text-text-secondary mt-1">{item.label}</p>
                  <p className="text-[10px] text-text-tertiary mt-0.5">{item.desc}</p>
                </div>
              </Card>
            </button>
          );
        })}
      </div>

      {/* Detail panel */}
      {activeType && (
        <Card padding="none">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="text-[13px] font-bold text-text">
              {items.find((i) => i.key === activeType)?.label} — {tx(locale, "Recent Records", "최근 기록", "最近のレコード")}
            </p>
            <button onClick={() => { setActiveType(null); setDetail(null); }} className="text-[11px] text-text-tertiary hover:text-text">✕</button>
          </div>
          {detailLoading ? (
            <div className="px-4 py-8 text-center text-[12px] text-text-tertiary">{tx(locale, "Loading...", "로딩 중...", "読み込み中...")}</div>
          ) : detail && detail.length > 0 ? (
            <div className="max-h-[400px] overflow-y-auto divide-y divide-border">
              {detail.slice(0, 50).map((row, i) => (
                <DatasetRow key={i} row={row} type={activeType} locale={locale} />
              ))}
              {detail.length > 50 && (
                <div className="px-4 py-2 text-[11px] text-text-tertiary text-center">
                  {tx(locale, "Showing 50 of", "50개 표시 중 /", "50件表示中 /")} {detail.length}
                </div>
              )}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-[12px] text-text-tertiary">{tx(locale, "No data", "데이터 없음", "データなし")}</div>
          )}
        </Card>
      )}

      {/* Total */}
      <Card padding="md">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-bold text-text">{tx(locale, "Total Records", "전체 레코드", "全レコード")}</p>
            <p className="text-[11px] text-text-tertiary">{tx(locale, "All collected training data", "수집된 모든 학습 데이터", "収集されたすべての学習データ")}</p>
          </div>
          <p className="text-[28px] font-black text-brand">{(stats?.total || 0).toLocaleString()}</p>
        </div>
      </Card>
    </div>
  );
}

function DatasetRow({ row, type, locale }: { row: Record<string, unknown>; type: DatasetType; locale: string }) {
  const time = row.createdAt ? new Date(row.createdAt as string).toLocaleString(locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

  if (type === "conversations") {
    return (
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold", (row.role as string) === "user" ? "bg-brand-lighter text-brand" : "bg-green-50 text-green-700")}>{(row.role as string) || "?"}</span>
          {row.intent ? <span className="px-1.5 py-0.5 rounded bg-surface-secondary text-[9px] font-mono text-text-tertiary">{String(row.intent)}</span> : null}
          <span className="text-[9px] text-text-tertiary ml-auto">{time}</span>
        </div>
        <p className="text-[12px] text-text leading-relaxed line-clamp-2">{row.content as string}</p>
      </div>
    );
  }

  if (type === "feedback") {
    return (
      <div className="px-4 py-3 flex items-center gap-3">
        <span className="text-[18px]">{(row.rating as number) === 1 ? "👍" : "👎"}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-mono text-text-tertiary truncate">{row.conversationId as string}</p>
          <p className="text-[10px] text-text-tertiary">{row.userRole as string} · {time}</p>
        </div>
      </div>
    );
  }

  if (type === "actions") {
    const data = row.data as Record<string, unknown> | null;
    return (
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-1.5 py-0.5 rounded bg-brand-lighter text-brand text-[9px] font-bold">{row.action as string}</span>
          {row.entity ? <span className="text-[10px] text-text-tertiary">{String(row.entity)}</span> : null}
          <span className="text-[9px] text-text-tertiary ml-auto">{time}</span>
        </div>
        {data && (
          <p className="text-[11px] text-text-secondary font-mono truncate">
            {Object.entries(data).map(([k, v]) => `${k}: ${v}`).join(" · ")}
          </p>
        )}
      </div>
    );
  }

  // nlp
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 text-[9px] font-bold">{row.intent as string}</span>
        <span className="text-[10px] text-text-tertiary">{((row.confidence as number) * 100).toFixed(1)}%</span>
        <span className="text-[10px] text-text-tertiary">{row.latencyMs as number}ms</span>
        <span className="text-[9px] text-text-tertiary ml-auto">{time}</span>
      </div>
      <p className="text-[11px] text-text-secondary truncate">{row.input as string}</p>
    </div>
  );
}

// ─── Projects Tab (프로젝트/기자재 관리) ─────────────────────────────────────

interface ProjectRow {
  id: string; vesselName: string; classification: string | null; status: string; shipowner: string | null;
  updatedAt: string; _count: { equipments: number; hardware: number; software: number };
  equipments?: { id: string; name: string; status: string; vendor: { name: string; company: string | null } | null }[];
}

function ProjectsTab({ locale }: { locale: string }) {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "project" | "equipment"; id: string; projectId?: string; name: string } | null>(null);

  const loadProjects = useCallback(async () => {
    const res = await fetch("/api/admin/projects");
    if (res.ok) setProjects(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { queueMicrotask(() => loadProjects()); }, [loadProjects]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "project") {
      await fetch(`/api/projects/${deleteTarget.id}`, { method: "DELETE" });
      showToast.success(tx(locale, "Project deleted", "프로젝트가 삭제되었습니다", "プロジェクトが削除されました"));
    } else if (deleteTarget.projectId) {
      await fetch(`/api/projects/${deleteTarget.projectId}/equipment?id=${deleteTarget.id}`, { method: "DELETE" });
      showToast.success(tx(locale, "Equipment deleted", "기자재가 삭제되었습니다", "機器が削除されました"));
    }
    setDeleteTarget(null);
    loadProjects();
  };

  if (loading) return <SkeletonTable rows={5} />;

  return (
    <div className="space-y-3">
      {projects.length === 0 ? (
        <EmptyState icon={Ship} title={tx(locale, "No projects", "프로젝트가 없습니다", "プロジェクトがありません")} />
      ) : projects.map((p) => {
        const isExpanded = expandedId === p.id;
        return (
          <Card key={p.id} padding="none">
            <div className="flex items-center gap-4 px-4 py-3 hover:bg-surface-secondary/20 transition-colors">
              <button onClick={() => setExpandedId(isExpanded ? null : p.id)} className="shrink-0">
                <ChevronRight size={14} className={cn("text-text-tertiary transition-transform", isExpanded && "rotate-90")} />
              </button>
              <Ship size={16} className="text-brand shrink-0" />
              <div className="flex-1 min-w-0">
                <a href={`/project/${p.id}`} className="text-[13px] font-semibold text-text hover:text-brand transition-colors">
                  {p.vesselName}
                </a>
                <p className="text-[11px] text-text-tertiary">
                  {p.classification || "—"} · {tx(locale, "Equipment", "기자재", "機器")} {p._count.equipments} · HW {p._count.hardware} · SW {p._count.software}
                </p>
              </div>
              <a href={`/project/${p.id}`} className="h-7 px-2.5 rounded-md text-[11px] font-medium text-text-tertiary hover:text-brand hover:bg-brand-lighter/30 transition-colors flex items-center gap-1">
                {tx(locale, "View", "보기", "表示")} <ChevronRight size={12} />
              </a>
              <button
                onClick={() => setDeleteTarget({ type: "project", id: p.id, name: p.vesselName })}
                className="h-7 px-2 rounded-md text-[11px] font-medium text-text-tertiary hover:text-[#DA1E28] hover:bg-[#FFF1F1] transition-colors flex items-center gap-1"
              >
                <Trash2 size={12} /> {tx(locale, "Delete", "삭제", "削除")}
              </button>
            </div>

            {isExpanded && p.equipments && p.equipments.length > 0 && (
              <div className="border-t border-border">
                <div className="px-4 py-2 bg-surface-page/50">
                  <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">{tx(locale, "Equipment List", "기자재 목록", "機器リスト")}</p>
                </div>
                <div className="divide-y divide-border/40">
                  {p.equipments.map((eq) => (
                    <div key={eq.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-page/30 transition-colors group">
                      <Cpu size={13} className="text-text-tertiary shrink-0" />
                      <a href={`/project/${p.id}/equipment/${eq.id}`} className="text-[12px] text-text hover:text-brand transition-colors flex-1 truncate">
                        {eq.name}
                      </a>
                      <span className="text-[10px] text-text-tertiary">{eq.vendor?.company || eq.vendor?.name || "—"}</span>
                      <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full",
                        eq.status === "APPROVED" ? "bg-[#E6F7EF] text-[#24A148]" :
                        eq.status === "SUBMITTED" ? "bg-[#FFF3E0] text-[#EB6200]" :
                        "bg-[#F4F4F4] text-[#8D8D8D]"
                      )}>{eq.status}</span>
                      <button
                        onClick={() => setDeleteTarget({ type: "equipment", id: eq.id, projectId: p.id, name: eq.name })}
                        className="opacity-0 group-hover:opacity-100 h-6 w-6 rounded flex items-center justify-center text-text-tertiary hover:text-[#DA1E28] hover:bg-[#FFF1F1] transition-all shrink-0"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {isExpanded && (!p.equipments || p.equipments.length === 0) && (
              <div className="border-t border-border px-4 py-4 text-center text-[11px] text-text-tertiary">
                {tx(locale, "No equipment in this project", "이 프로젝트에 기자재가 없습니다", "このプロジェクトに機器がありません")}
              </div>
            )}
          </Card>
        );
      })}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={deleteTarget?.type === "project" ? tx(locale, "Delete Project", "프로젝트 삭제", "プロジェクト削除") : tx(locale, "Delete Equipment", "기자재 삭제", "機器削除")}
        description={
          locale === "ko"
            ? `"${deleteTarget?.name || ""}"을(를) 삭제하시겠습니까? 관련된 모든 데이터가 영구 삭제됩니다.`
            : `Are you sure you want to delete "${deleteTarget?.name || ""}"? All related data will be permanently deleted.`
        }
      />
    </div>
  );
}

// ─── Data Health Tab ─────────────────────────────────────────────────────────

interface HealthIssue { type: string; [key: string]: unknown; }
interface FixItem { type: string; description: string; reason?: string; }

function DataHealthTab({ locale }: { locale: string }) {
  const [issues, setIssues] = useState<HealthIssue[]>([]);
  const [summary, setSummary] = useState<{ total: number; byType: Record<string, number> }>({ total: 0, byType: {} });
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState<{ applied: FixItem[]; skipped: FixItem[] } | null>(null);
  const [aggressive, setAggressive] = useState(false);

  const scan = useCallback(async () => {
    setLoading(true);
    setFixResult(null);
    try {
      const res = await fetch("/api/admin/data-health");
      if (res.ok) {
        const data = await res.json();
        setIssues(data.issues || []);
        setSummary(data.summary || { total: 0, byType: {} });
        setScanned(true);
      } else {
        showToast.error(tx(locale, "Scan failed", "진단 실패", "診断失敗"));
      }
    } finally { setLoading(false); }
  }, [locale]);

  const fix = async () => {
    setFixing(true);
    try {
      const res = await fetch("/api/admin/data-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auto-fix", aggressive }),
      });
      if (res.ok) {
        const data = await res.json();
        setFixResult(data);
        showToast.success(tx(locale, `Fixed ${data.applied?.length || 0} issues`, `${data.applied?.length || 0}건 수정 완료`, `${data.applied?.length || 0}件修正完了`));
        scan();
      } else {
        showToast.error(tx(locale, "Fix failed", "수정 실패", "修正失敗"));
      }
    } finally { setFixing(false); }
  };

  const TYPE_LABELS: Record<string, { en: string; ko: string }> = {
    orphan_shipyard: { en: "Orphan Shipyard", ko: "고아 조선소" },
    duplicate_shipyards: { en: "Duplicate Shipyards", ko: "중복 조선소" },
    empty_shipyard_user: { en: "User Without Shipyard", ko: "조선소 미배정 사용자" },
    vendor_equipment_mismatch: { en: "Vendor-Equipment Mismatch", ko: "벤더-기자재 불일치" },
    orphan_project: { en: "Orphan Project", ko: "고아 프로젝트" },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-body-sm font-bold text-text">
          {tx(locale, "Data Health Diagnosis", "데이터 정합성 진단", "データ整合性診断")}
        </h2>
        <div className="flex items-center gap-2">
          {scanned && summary.total > 0 && (
            <>
              <label className="flex items-center gap-1.5 text-[11px] text-text-tertiary cursor-pointer">
                <input type="checkbox" checked={aggressive} onChange={(e) => setAggressive(e.target.checked)} className="rounded" />
                {tx(locale, "Aggressive", "적극 수정", "積極修正")}
              </label>
              <Button size="sm" variant="outline" onClick={fix} loading={fixing}>
                {tx(locale, "Auto Fix", "자동 수정", "自動修正")}
              </Button>
            </>
          )}
          <Button size="sm" onClick={scan} loading={loading}>
            <Activity size={14} /> {tx(locale, "Scan", "진단", "診断")}
          </Button>
        </div>
      </div>

      {!scanned ? (
        <Card>
          <CardBody>
            <EmptyState icon={Activity} title={tx(locale, "Run a scan to check data health", "진단을 실행하여 데이터 정합성을 확인하세요", "診断を実行してデータ整合性を確認してください")} />
          </CardBody>
        </Card>
      ) : summary.total === 0 ? (
        <Card>
          <CardBody>
            <EmptyState icon={CheckCircle} title={tx(locale, "All data is healthy", "모든 데이터가 정상입니다", "すべてのデータは正常です")} />
          </CardBody>
        </Card>
      ) : (
        <>
          {/* Summary badges */}
          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-risk-bg text-safety-high">
              {tx(locale, `${summary.total} issues found`, `${summary.total}건 발견`, `${summary.total}件発見`)}
            </span>
            {Object.entries(summary.byType).map(([type, count]) => (
              <span key={type} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-surface-secondary text-text-secondary">
                {(locale === "ko" ? TYPE_LABELS[type]?.ko : TYPE_LABELS[type]?.en) || type} ({count})
              </span>
            ))}
          </div>

          {/* Issues list */}
          <Card padding="none">
            <div className="divide-y divide-border max-h-[480px] overflow-y-auto">
              {issues.map((issue, i) => (
                <div key={i} className="px-5 py-3.5 text-body-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle size={14} className="text-safety-high shrink-0" />
                    <span className="font-semibold text-text">
                      {(locale === "ko" ? TYPE_LABELS[issue.type]?.ko : TYPE_LABELS[issue.type]?.en) || issue.type}
                    </span>
                  </div>
                  <pre className="text-[11px] text-text-tertiary whitespace-pre-wrap ml-5">
                    {JSON.stringify(Object.fromEntries(Object.entries(issue).filter(([k]) => k !== "type")), null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* Fix results */}
      {fixResult && (
        <div className="space-y-3">
          {fixResult.applied.length > 0 && (
            <Card>
              <CardHeader title={tx(locale, `Applied (${fixResult.applied.length})`, `수정됨 (${fixResult.applied.length})`, `適用済み (${fixResult.applied.length})`)} />
              <CardBody>
                <ul className="space-y-1">
                  {fixResult.applied.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-body-sm">
                      <CheckCircle size={14} className="text-safety-low shrink-0 mt-0.5" />
                      <span className="text-text-secondary">{item.description}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
          {fixResult.skipped.length > 0 && (
            <Card>
              <CardHeader title={tx(locale, `Skipped (${fixResult.skipped.length})`, `건너뜀 (${fixResult.skipped.length})`, `スキップ (${fixResult.skipped.length})`)} />
              <CardBody>
                <ul className="space-y-1">
                  {fixResult.skipped.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-body-sm">
                      <AlertCircle size={14} className="text-text-tertiary shrink-0 mt-0.5" />
                      <span className="text-text-tertiary">{item.description} — {item.reason}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Doc Formats Tab ─────────────────────────────────────────────────────────

interface DocFormatRow { id: number; code: string; standard: string; title: string; titleKo: string | null; sections: string; isActive: boolean; }

function DocFormatsTab({ locale }: { locale: string }) {
  const [formats, setFormats] = useState<DocFormatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<DocFormatRow | null>(null);
  const [form, setForm] = useState({ code: "", standard: "E27", title: "", titleKo: "", sections: "[]", isActive: true });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DocFormatRow | null>(null);

  const fetchFormats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/doc-formats");
      if (res.ok) setFormats(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchFormats(); }, [fetchFormats]);

  const openCreate = () => {
    setEditItem(null);
    setForm({ code: "", standard: "E27", title: "", titleKo: "", sections: "[]", isActive: true });
    setDialogOpen(true);
  };

  const openEdit = (item: DocFormatRow) => {
    setEditItem(item);
    const sec = typeof item.sections === "string" ? item.sections : JSON.stringify(item.sections, null, 2);
    setForm({ code: item.code, standard: item.standard, title: item.title, titleKo: item.titleKo || "", sections: sec, isActive: item.isActive });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.code || !form.standard || !form.title) {
      showToast.error(tx(locale, "Code, standard, title are required", "코드, 표준, 제목은 필수입니다", "コード、標準、タイトルは必須です"));
      return;
    }
    try { JSON.parse(form.sections); } catch { showToast.error("sections JSON invalid"); return; }

    setSaving(true);
    try {
      const body = editItem
        ? { id: editItem.id, ...form, sections: JSON.parse(form.sections) }
        : { ...form, sections: JSON.parse(form.sections) };
      const res = await fetch("/api/admin/doc-formats", {
        method: editItem ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        showToast.success(tx(locale, "Saved", "저장되었습니다", "保存されました"));
        setDialogOpen(false);
        fetchFormats();
      } else {
        const d = await res.json().catch(() => ({}));
        showToast.error((d as { error?: string }).error || "Failed");
      }
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/admin/doc-formats?id=${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      showToast.success(tx(locale, "Deleted", "삭제되었습니다", "削除されました"));
      fetchFormats();
    }
    setDeleteTarget(null);
  };

  const handleToggle = async (item: DocFormatRow) => {
    await fetch("/api/admin/doc-formats", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, isActive: !item.isActive }),
    });
    setFormats((prev) => prev.map((f) => f.id === item.id ? { ...f, isActive: !f.isActive } : f));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-body-sm font-bold text-text">
          {tx(locale, `Document Formats (${formats.length})`, `문서 포맷 (${formats.length})`, `ドキュメント形式 (${formats.length})`)}
        </h2>
        <Button size="sm" onClick={openCreate}><Plus size={14} /> {tx(locale, "Add Format", "포맷 추가", "形式追加")}</Button>
      </div>

      {loading ? <SkeletonTable rows={4} /> : formats.length === 0 ? (
        <Card><CardBody><EmptyState icon={FileText} title={tx(locale, "No document formats", "문서 포맷이 없습니다", "ドキュメント形式がありません")} /></CardBody></Card>
      ) : (
        <Card padding="none">
          <div className="divide-y divide-border">
            {formats.map((f) => (
              <div key={f.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface-secondary/20 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-body-sm font-semibold text-text">{f.code}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-lighter text-brand">{f.standard}</span>
                    {!f.isActive && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-secondary text-text-tertiary">{tx(locale, "Inactive", "비활성", "無効")}</span>}
                  </div>
                  <p className="text-body-xs text-text-tertiary mt-0.5">{f.title}{f.titleKo ? ` / ${f.titleKo}` : ""}</p>
                </div>
                <button onClick={() => handleToggle(f)}
                  className={cn("relative w-10 h-6 rounded-full transition-colors duration-200 shrink-0", f.isActive ? "bg-safety-low" : "bg-border-strong")}>
                  <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200", f.isActive && "translate-x-4")} />
                </button>
                <button onClick={() => openEdit(f)} className="p-1.5 rounded-md text-text-tertiary hover:text-brand hover:bg-brand-lighter transition-colors"><Pencil size={13} /></button>
                <button onClick={() => setDeleteTarget(f)} className="p-1.5 rounded-md text-text-tertiary hover:text-safety-high hover:bg-risk-bg transition-colors"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}
        title={editItem ? tx(locale, "Edit Format", "포맷 수정", "形式編集") : tx(locale, "Add Format", "포맷 추가", "形式追加")}
        maxWidth="max-w-lg">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Code *" placeholder="E27-CBS" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={!!editItem} />
            <Input label="Standard *" placeholder="E27" value={form.standard} onChange={(e) => setForm({ ...form, standard: e.target.value })} />
          </div>
          <Input label="Title (EN) *" placeholder="CBS Report" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Input label={tx(locale, "Title (KO)", "제목 (한국어)", "タイトル (韓国語)")} placeholder="" value={form.titleKo} onChange={(e) => setForm({ ...form, titleKo: e.target.value })} />
          <div>
            <label className="block text-[11px] font-bold text-text-tertiary mb-1">Sections (JSON)</label>
            <textarea
              value={form.sections}
              onChange={(e) => setForm({ ...form, sections: e.target.value })}
              rows={8}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-[12px] font-mono text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{tx(locale, "Cancel", "취소", "キャンセル")}</Button>
            <Button onClick={handleSave} loading={saving}>{tx(locale, "Save", "저장", "保存")}</Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title={tx(locale, "Delete Format", "포맷 삭제", "形式削除")}
        description={tx(locale, `Delete "${deleteTarget?.code}"? This cannot be undone.`, `"${deleteTarget?.code}" 포맷을 삭제하시겠습니까?`, `「${deleteTarget?.code}」を削除しますか？`)} />
    </div>
  );
}

// ─── Society KB Tab ──────────────────────────────────────────────────────────

interface SocietyKbRow { id: number; classification: string; checkId: string; category: string; question: string; questionKo: string | null; guidance: string | null; isRequired: boolean; }

const SOCIETIES = ["KR", "LR", "DNV", "ABS", "BV", "CCS", "NK"];

function SocietyKbTab({ locale }: { locale: string }) {
  const [items, setItems] = useState<SocietyKbRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [society, setSociety] = useState<string>("KR");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<SocietyKbRow | null>(null);
  const [form, setForm] = useState({ classification: "KR", checkId: "", category: "", question: "", questionKo: "", guidance: "", isRequired: true });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SocietyKbRow | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/society-checklist?classification=${society}`);
      if (res.ok) setItems(await res.json());
    } finally { setLoading(false); }
  }, [society]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openCreate = () => {
    setEditItem(null);
    setForm({ classification: society, checkId: "", category: "", question: "", questionKo: "", guidance: "", isRequired: true });
    setDialogOpen(true);
  };

  const openEdit = (item: SocietyKbRow) => {
    setEditItem(item);
    setForm({
      classification: item.classification, checkId: item.checkId, category: item.category,
      question: item.question, questionKo: item.questionKo || "", guidance: item.guidance || "",
      isRequired: item.isRequired,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.classification || !form.checkId || !form.category || !form.question) {
      showToast.error(tx(locale, "All required fields must be filled", "필수 항목을 모두 입력하세요", "必須項目を入力してください"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/society-checklist", {
        method: editItem ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editItem ? { id: editItem.id, ...form } : form),
      });
      if (res.ok) {
        showToast.success(tx(locale, "Saved", "저장되었습니다", "保存されました"));
        setDialogOpen(false);
        fetchItems();
      } else {
        const d = await res.json().catch(() => ({}));
        showToast.error((d as { error?: string }).error || "Failed");
      }
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/society-checklist?id=${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      showToast.success(tx(locale, "Deleted", "삭제되었습니다", "削除されました"));
      fetchItems();
    }
    setDeleteTarget(null);
  };

  const byCategory = new Map<string, SocietyKbRow[]>();
  items.forEach((it) => {
    if (!byCategory.has(it.category)) byCategory.set(it.category, []);
    byCategory.get(it.category)!.push(it);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-body-sm font-bold text-text">
          {tx(locale, `Society Checklist KB (${items.length})`, `선급 체크리스트 가이드 (${items.length})`, `船級チェックリスト (${items.length})`)}
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 p-1 bg-surface-secondary rounded-[8px]">
            {SOCIETIES.map((s) => (
              <button key={s} onClick={() => setSociety(s)}
                className={cn("px-3 py-1 rounded-[6px] text-[11px] font-medium transition-all",
                  society === s ? "bg-white text-text shadow-xs" : "text-text-tertiary")}>
                {s}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={openCreate}><Plus size={14} /> {tx(locale, "Add", "추가", "追加")}</Button>
        </div>
      </div>

      {loading ? <SkeletonTable rows={5} /> : items.length === 0 ? (
        <Card><CardBody><EmptyState icon={FileText} title={tx(locale, `No items for ${society}`, `${society} 체크리스트 항목이 없습니다`, `${society}チェックリスト項目がありません`)} /></CardBody></Card>
      ) : (
        <div className="space-y-6">
          {[...byCategory.entries()].map(([cat, group]) => (
            <div key={cat}>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary mb-2 px-1">
                {cat} <span className="text-text-tertiary font-normal">· {group.length}</span>
              </h3>
              <Card padding="none">
                <div className="divide-y divide-border">
                  {group.map((item) => (
                    <div key={item.id} className="group px-5 py-4 hover:bg-surface-secondary/20 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                          <span className="text-[10px] font-mono font-bold text-text-tertiary tabular-nums">{item.checkId}</span>
                          {!item.isRequired && (
                            <span className="text-[9px] text-text-tertiary">{tx(locale, "opt", "선택", "任意")}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-2">
                          <div>
                            <p className="text-[13px] font-semibold text-text leading-snug">{item.question}</p>
                            {item.questionKo && (
                              <p className="text-[11px] text-text-tertiary mt-0.5">{item.questionKo}</p>
                            )}
                          </div>
                          {item.guidance && (
                            <p className="text-[12px] text-text-secondary leading-relaxed whitespace-pre-wrap">
                              {item.guidance}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(item)} className="p-1.5 rounded-md text-text-tertiary hover:text-text hover:bg-surface-secondary transition-colors"><Pencil size={13} /></button>
                          <button onClick={() => setDeleteTarget(item)} className="p-1.5 rounded-md text-text-tertiary hover:text-safety-high hover:bg-risk-bg transition-colors"><Trash2 size={13} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}
        title={editItem ? tx(locale, "Edit Item", "항목 수정", "項目編集") : tx(locale, "Add Item", "항목 추가", "項目追加")}
        maxWidth="max-w-lg">
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-text-tertiary mb-1">Society *</label>
              <select value={form.classification} onChange={(e) => setForm({ ...form, classification: e.target.value })}
                className="w-full h-9 rounded-lg border border-border bg-white px-3 text-[12px] text-text">
                {SOCIETIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <Input label="Check ID *" placeholder="CYB-01" value={form.checkId} onChange={(e) => setForm({ ...form, checkId: e.target.value })} disabled={!!editItem} />
            <Input label="Category *" placeholder="Access Control" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </div>
          <Input label="Question (EN) *" value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} />
          <Input label={tx(locale, "Question (KO)", "질문 (한국어)", "質問 (韓国語)")} value={form.questionKo} onChange={(e) => setForm({ ...form, questionKo: e.target.value })} />
          <div>
            <label className="block text-[11px] font-bold text-text-tertiary mb-1">
              {tx(locale, "Guidance (how to comply)", "가이드 (컴플라이언스 방법)", "ガイド")}
            </label>
            <textarea value={form.guidance} onChange={(e) => setForm({ ...form, guidance: e.target.value })} rows={4}
              placeholder={tx(locale, "e.g., Implement RBAC with min 8-char password policy. Reference E27 SC-1.",
                "예: RBAC 구현, 최소 8자 비밀번호 정책 적용. E27 SC-1 참조.",
                "例: RBACを実装、最小8文字のパスワードポリシー。E27 SC-1参照。")}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-[12px] text-text focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all" />
          </div>
          <label className="flex items-center gap-2 text-[12px] text-text-secondary">
            <input type="checkbox" checked={form.isRequired} onChange={(e) => setForm({ ...form, isRequired: e.target.checked })} className="rounded" />
            {tx(locale, "Required (not optional)", "필수 항목", "必須項目")}
          </label>
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{tx(locale, "Cancel", "취소", "キャンセル")}</Button>
            <Button onClick={handleSave} loading={saving}>{tx(locale, "Save", "저장", "保存")}</Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title={tx(locale, "Delete Item", "항목 삭제", "項目削除")}
        description={tx(locale, `Delete "${deleteTarget?.checkId}"?`, `"${deleteTarget?.checkId}" 항목을 삭제하시겠습니까?`, `「${deleteTarget?.checkId}」を削除しますか？`)} />
    </div>
  );
}
