"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cpu, Monitor, Plus, Pencil, Trash2, Network, Package,
  Upload, Download, ArrowLeft, ArrowRight, FileText, Shield, ChevronDown,
  Server, Radio, HardDrive, AlertCircle, Eye, Radar, CheckSquare, ListPlus, X, CheckCircle, Save, Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkflowSteps } from "@/components/ui/workflow-steps";
import { SkeletonTable } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SimpleSetup } from "@/components/inventory/simple-setup";
import { InlineEditor } from "@/components/inventory/inline-editor";
import { HwDialog } from "@/components/inventory/hw-dialog";
import { SwDialog } from "@/components/inventory/sw-dialog";
import { DfdEditor } from "@/components/dfd/dfd-editor";
// DFD viewer uses ReactFlow editor directly
import { ScanImportDialog } from "@/components/inventory/scan-import-dialog";
import { DiagramImportDialog } from "@/components/inventory/diagram-import-dialog";
import { CveBadge, CveMeter, emptySeverity, addToSeverity, type SeverityCounts } from "@/components/inventory/cve-badge";
import { CveSidebar } from "@/components/inventory/cve-sidebar";
import { AuditResultViewer } from "@/components/audit/audit-result-viewer";
import { AuditRunsList } from "@/components/audit/audit-runs-list";
import { buildE27 } from "@/lib/audit-e27";
import { type Hardware, type Software, type HwForm, type SwForm, HW_TYPES, SW_TYPES, isHwComplete, DEVICE_FIELD_CONFIG, isFieldVisible, getMissingRequiredHw, isValidIp, isValidMac } from "@/components/inventory/inventory-types";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { showToast } from "@/lib/toast";
import { SHIP_LOCATIONS, ACCESS_CONTROL_LEVELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import Link from "next/link";

// ─── Constants ──────────────────────────────────────────────────────────────

type MainTab = "basic" | "dfd";
type AssetTab = "hardware" | "software" | "sbom" | "audit";
type ViewMode = "simple" | "inline" | "table";

const HW_TYPE_COLORS: Record<string, string> = {
  PLC: "bg-purple-50 text-purple-700", SERVER: "bg-blue-50 text-blue-700",
  SENSOR: "bg-amber-50 text-amber-700", NETWORK_DEVICE: "bg-teal-50 text-teal-700",
  PC: "bg-indigo-50 text-indigo-700", OTHER_DEVICE: "bg-gray-100 text-gray-600",
};

const SW_TYPE_COLORS: Record<string, string> = {
  OS: "bg-blue-50 text-blue-700", APPLICATION: "bg-green-50 text-green-700",
  FIRMWARE: "bg-orange-50 text-orange-700", DRIVER: "bg-purple-50 text-purple-700",
  LIBRARY: "bg-gray-100 text-gray-600", MIDDLEWARE: "bg-teal-50 text-teal-700",
};

const HW_ICONS: Record<string, React.ElementType<Record<string, unknown>>> = {
  PLC: Cpu, SERVER: Server, SENSOR: Radio, NETWORK_DEVICE: Network, PC: Monitor, OTHER_DEVICE: HardDrive,
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { locale } = useLocaleStore();

  const userRole = (session?.user as { role?: string })?.role || "VENDOR";
  // Both SUPPORT and SHIPYARD (viewer) see inventory as read-only;
  // HW/SW registration is the vendor's responsibility.
  const isReadOnly = userRole === "SHIPYARD" || userRole === "SUPPORT";

  const tabParam = searchParams.get("tab");
  const equipmentId = searchParams.get("equipmentId");

  // Check if equipment is locked (SUBMITTED/APPROVED → no edits for vendor)
  const [eqStatus, setEqStatus] = useState("");
  useEffect(() => {
    if (!equipmentId) return;
    fetch(`/api/projects/${projectId}/equipment`)
      .then(async (r) => { if (r.ok) { const list = await r.json(); const eq = list.find((e: { id: string; status: string }) => e.id === equipmentId); if (eq) setEqStatus(eq.status); } })
      .catch(() => { });
  }, [projectId, equipmentId]);
  const isLocked = userRole === "VENDOR" && ["SUBMITTED", "APPROVED"].includes(eqStatus);
  const canEdit = (userRole === "VENDOR" || userRole === "ADMIN") && !isLocked;

  const [mainTab, setMainTab] = useState<MainTab>(tabParam === "dfd" ? "dfd" : "basic");
  const [assetTab, setAssetTab] = useState<AssetTab>("hardware");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [editPanelHwId, setEditPanelHwId] = useState<string | null>(null);

  // Sync tab from URL when searchParams change (e.g. sidebar DFD click)
  useEffect(() => {
    setMainTab(tabParam === "dfd" ? "dfd" : "basic");
  }, [tabParam]);

  const [hardware, setHardware] = useState<Hardware[]>([]);
  const [software, setSoftware] = useState<Software[]>([]);
  const [cveBySwId, setCveBySwId] = useState<Map<string, SeverityCounts>>(new Map());
  const [cveByHwId, setCveByHwId] = useState<Map<string, SeverityCounts>>(new Map());
  // Audit runs for the current equipment scope + per-HW CVE match list that
  // feeds the AuditResultViewer's Software/CVE tab. Fetched alongside the
  // primary inventory so the audit sub-tab is responsive on first click.
  const [auditRuns, setAuditRuns] = useState<Array<{ id: string; platform: string; results: Record<string, unknown>; createdAt: string; hardwareId: string | null }>>([]);
  const [hwCveMatches, setHwCveMatches] = useState<Map<string, Array<{ name: string; version: string; cves: { cveId: string; severity: string | null; score: number | null; description: string }[] }>>>(new Map());
  const [loading, setLoading] = useState(true);

  const [hwDialogOpen, setHwDialogOpen] = useState(false);
  const [swDialogOpen, setSwDialogOpen] = useState(false);
  const [editHw, setEditHw] = useState<Hardware | null>(null);
  const [editSw, setEditSw] = useState<Software | null>(null);
  const [preSelectedHwId, setPreSelectedHwId] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<{ type: "hw" | "sw"; item: Hardware | Software } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [dfdKey, setDfdKey] = useState(0);
  const [dfdGenerating, setDfdGenerating] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvImporting, setCsvImporting] = useState(false);
  const [scanImportOpen, setScanImportOpen] = useState(false);
  const [diagramImportOpen, setDiagramImportOpen] = useState(false);
  const [addMethodOpen, setAddMethodOpen] = useState(false);
  const [simpleInitialView, setSimpleInitialView] = useState<"choose" | "manual-count">("choose");
  const [cveHwId, setCveHwId] = useState<string | null>(null);

  const handleRegenerateDfd = async () => {
    setDfdGenerating(true);
    try {
      await fetch(`/api/projects/${projectId}/ai/generate-dfd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(equipmentId ? { equipmentId } : {}),
      });
      setDfdKey((k) => k + 1);
      showToast.success(tx(locale, "DFD regenerated", "DFD가 재생성되었습니다", "DFDが再生成されました"));
    } catch {
      showToast.error(tx(locale, "DFD generation failed", "DFD 생성 실패", "DFD生成失敗"));
    }
    setDfdGenerating(false);
  };

  // ─── Data fetching ────────────────────────────────────────────────────

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const eqParam = equipmentId ? `?equipmentId=${equipmentId}` : "";
      // Use allSettled-style wrapping so a transient network failure on one
      // endpoint does not reject the whole batch and surface as an unhandled
      // "TypeError: Failed to fetch" in the browser console.
      const safeFetch = (url: string) =>
        fetch(url).catch((err) => {
          console.warn(`[inventory] fetch failed: ${url}`, err);
          return null;
        });
      const [hwRes, swRes, cveRes, auditRes] = await Promise.all([
        safeFetch(`/api/projects/${projectId}/hardware${eqParam}`),
        safeFetch(`/api/projects/${projectId}/software${eqParam}`),
        safeFetch(`/api/projects/${projectId}/cve-matches`),
        equipmentId
          ? safeFetch(`/api/vendor/audit-tools/upload?equipmentId=${equipmentId}`)
          : Promise.resolve(null),
      ]);
      const hwList: Hardware[] = hwRes?.ok ? await hwRes.json() : [];
      setHardware(hwList);
      const swList: Software[] = swRes?.ok ? await swRes.json() : [];
      setSoftware(swList);

      // Build severity maps + per-HW viewer-ready CVE match list
      if (cveRes?.ok) {
        const matches = await cveRes.json() as Array<{
          cveId: string;
          softwareId: string | null;
          hardwareId: string | null;
          software: { id: string; name: string; version: string | null } | null;
          cveDetail: { description: string | null; baseScore: number | null; baseSeverity: string | null } | null;
        }>;
        const sw = new Map<string, SeverityCounts>();
        const hw = new Map<string, SeverityCounts>();
        for (const m of matches) {
          const sev = m.cveDetail?.baseSeverity;
          if (m.softwareId) {
            if (!sw.has(m.softwareId)) sw.set(m.softwareId, emptySeverity());
            addToSeverity(sw.get(m.softwareId)!, sev);
          }
          if (m.hardwareId) {
            if (!hw.has(m.hardwareId)) hw.set(m.hardwareId, emptySeverity());
            addToSeverity(hw.get(m.hardwareId)!, sev);
          }
        }
        setCveBySwId(sw);
        setCveByHwId(hw);

        // Per-HW grouped CVE matches for feeding into AuditResultViewer
        const swIdToHwId = new Map<string, string>();
        for (const s of swList) if (s.hardwareId) swIdToHwId.set(s.id, s.hardwareId);
        const perHw = new Map<string, Array<{ name: string; version: string; cves: { cveId: string; severity: string | null; score: number | null; description: string }[] }>>();
        for (const m of matches) {
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

      // Audit runs for the equipment (only when equipmentId is known)
      if (auditRes?.ok) {
        const raw = await auditRes.json();
        const list = Array.isArray(raw) ? raw : (raw.runs ?? []);
        type RawRun = { id: string; platform?: string; results?: string | object; createdAt: string; hardwareId?: string | null };
        setAuditRuns(
          list.map((r: RawRun) => ({
            id: r.id,
            platform: r.platform || "UNKNOWN",
            results: typeof r.results === "string"
              ? (() => { try { return JSON.parse(r.results as string); } catch { return {}; } })()
              : ((r.results as Record<string, unknown>) ?? {}),
            createdAt: r.createdAt,
            hardwareId: r.hardwareId ?? null,
          })),
        );
      } else {
        setAuditRuns([]);
      }
    } finally { setLoading(false); }
  }, [projectId, equipmentId]);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);


  // Auto-detect: HW/SW가 하나라도 있으면 table, 완전히 비어있고 편집 가능할 때만 simple
  useEffect(() => {
    if (!loading) {
      const hasData = hardware.length > 0 || software.length > 0;
      setViewMode(hasData ? "table" : canEdit ? "simple" : "table");
    }
  }, [loading, hardware.length, software.length, canEdit]);

  // ─── CRUD (only for canEdit) ──────────────────────────────────────────

  const handleSaveHw = async (data: HwForm) => {
    const url = editHw ? `/api/projects/${projectId}/hardware/${editHw.id}` : `/api/projects/${projectId}/hardware`;
    const body = equipmentId ? { ...data, equipmentId } : data;
    const res = await fetch(url, { method: editHw ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) {
      showToast.success(tx(locale, "Saved", "저장 완료", "保存完了")); setHwDialogOpen(false); setEditHw(null);
      await fetchAssets();
    }
    else showToast.error(tx(locale, "Save failed", "저장 실패", "保存失敗"));
  };

  const handleSaveSw = async (data: SwForm) => {
    const url = editSw ? `/api/projects/${projectId}/software/${editSw.id}` : `/api/projects/${projectId}/software`;
    const body = equipmentId ? { ...data, equipmentId } : data;
    const res = await fetch(url, { method: editSw ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) {
      showToast.success(tx(locale, "Saved", "저장 완료", "保存完了")); setSwDialogOpen(false); setEditSw(null);
      await fetchAssets();
    }
    else showToast.error(tx(locale, "Save failed", "저장 실패", "保存失敗"));
  };

  const handleCsvImport = async () => {
    if (!csvText.trim()) return;
    setCsvImporting(true);
    try {
      const lines = csvText.trim().split("\n").filter((l) => l.trim());
      let created = 0;
      for (const line of lines) {
        const parts = line.split(/[,\t]/).map((p) => p.trim());
        if (parts.length < 1 || !parts[0]) continue;
        const [name, version, vendor, swType] = parts;
        const body: Record<string, string> = { name };
        if (version) body.version = version;
        if (vendor) body.vendor = vendor;
        if (swType && ["OS", "APPLICATION", "FIRMWARE", "DRIVER", "LIBRARY", "MIDDLEWARE"].includes(swType.toUpperCase())) body.swType = swType.toUpperCase();
        if (equipmentId) body.equipmentId = equipmentId;
        const res = await fetch(`/api/projects/${projectId}/software`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (res.ok) created++;
      }
      showToast.success(tx(locale, `${created} software items added`, `${created}개 소프트웨어 등록됨`, `${created}件のソフトウェアを登録`));
      setCsvOpen(false);
      setCsvText("");
      await fetchAssets();
    } finally { setCsvImporting(false); }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const { type, item } = deleteTarget;
    const url = type === "hw"
      ? `/api/projects/${projectId}/hardware/${item.id}`
      : `/api/projects/${projectId}/software/${item.id}`;
    const res = await fetch(url, { method: "DELETE" });
    if (res.ok) { showToast.success(tx(locale, "Deleted", "삭제 완료", "削除完了")); await fetchAssets(); }
    setDeleteTarget(null);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append("file", file); if (equipmentId) fd.append("equipmentId", equipmentId);

    // Try bulk import first, fallback to simple import
    const fd2 = new FormData();
    fd2.append("file", file);
    if (equipmentId) fd2.append("equipmentId", equipmentId);

    // Try bulk endpoint first (it will return error if format doesn't match)
    let res = await fetch(`/api/projects/${projectId}/inventory/import-bulk`, { method: "POST", body: fd2 });

    if (!res.ok) {
      // Fallback to simple import
      const fd3 = new FormData();
      fd3.append("file", file);
      if (equipmentId) fd3.append("equipmentId", equipmentId);
      res = await fetch(`/api/projects/${projectId}/inventory/import`, { method: "POST", body: fd3 });
    }
    if (res.ok) {
      const r = await res.json();
      const hwCount = r.created?.hardware || 0;
      const swCount = r.created?.software || 0;
      const connCount = r.created?.connections || 0;
      showToast.success(
        connCount > 0
          ? `HW ${hwCount}, SW ${swCount}, ${tx(locale, "Conn", "연결", "接続")} ${connCount}`
          : `HW ${hwCount}, SW ${swCount}`
      );
      await fetchAssets();
    } else {
      showToast.error(tx(locale, "Import failed", "가져오기 실패", "インポート失敗"));
    }
    if (importRef.current) importRef.current.value = "";
  };

  const handleExport = () => {
    window.location.href = `/api/projects/${projectId}/inventory/export?format=xlsx${equipmentId ? `&equipmentId=${equipmentId}` : ""}`;
  };

  // ─── 자산 필수값 충족 여부 → DFD 탭 잠금 ────────────────────────────

  const allHwComplete = hardware.length > 0 && hardware.every((hw) => isHwComplete(hw));
  // DFD는 자산 필수값 미충족 시 잠금. 보안평가/문서생성은 테스트 기능으로 항상 진입 가능.
  const lockedSteps = !allHwComplete ? ["dfd", "assess", "document", "submit"] : [];

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div>
      <WorkflowSteps currentSegment={mainTab === "dfd" ? "dfd" : "inventory"} projectId={projectId} equipmentId={equipmentId} lockedSteps={lockedSteps} />
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Link href={equipmentId ? `/project/${projectId}/equipment/${equipmentId}` : `/project/${projectId}`} className="inline-flex items-center gap-1 text-body-xs text-text-tertiary hover:text-brand transition-colors mb-6">
            <ArrowLeft size={14} /> {equipmentId ? tx(locale, "Equipment", "기자재", "機材") : tx(locale, "Project", "프로젝트", "プロジェクト")}
          </Link>

          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-h4 font-extrabold text-text tracking-tight">{tx(locale, "Inventory", "자산 관리", "資産管理")}</h1>
              <p className="text-body-sm text-text-tertiary mt-1">
                {isReadOnly
                  ? tx(locale, "View asset inventory (read-only)", "자산 현황을 확인합니다 (읽기 전용)", "資産現況を確認します（読み取り専用）")
                  : tx(locale, "Register assets and define network topology", "하드웨어, 소프트웨어를 등록하고 네트워크 구성을 정의하세요", "ハードウェア、ソフトウェアを登録しネットワーク構成を定義してください")
                }
              </p>
            </div>
            {isReadOnly && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-secondary text-body-xs font-semibold text-text-tertiary">
                <Eye size={13} /> {tx(locale, "Read Only", "읽기 전용", "読み取り専用")}
              </span>
            )}
          </div>

          {/* ── Basic Info Tab ─────────────────────────────────────────── */}
          {mainTab === "basic" && (
            <>
              {loading ? (
                <Card padding="none"><CardBody><SkeletonTable rows={5} /></CardBody></Card>
              ) : (
                <>
                  {/* ── Simple Mode: 데이터 없을 때 전체 편집 ──────────── */}
                  {viewMode === "simple" && canEdit && equipmentId && (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-brand/15 bg-brand-lighter/30 p-4 flex items-start gap-3">
                        <AlertCircle size={16} className="text-brand mt-0.5 shrink-0" />
                        <div>
                          <p className="text-body-sm font-semibold text-brand-active">
                            {hardware.length > 0
                              ? tx(locale, "Add more devices", "장치 추가", "デバイス追加")
                              : tx(locale, "No devices registered yet", "아직 등록된 장치가 없습니다", "まだ登録されたデバイスがありません")}
                          </p>
                          <p className="text-body-xs text-text-secondary mt-0.5">
                            {tx(locale, "Select the number of devices in your system below. You can add details later.", "아래에서 시스템에 포함된 장치 수량을 선택하세요. 상세 정보는 나중에 입력할 수 있습니다.", "以下でシステムに含まれるデバイス数を選択してください。詳細は後で入力できます。")}
                          </p>
                        </div>
                        {hardware.length > 0 && (
                          <button onClick={() => setViewMode("table")} className="ml-auto text-[11px] font-semibold text-brand hover:text-brand-active shrink-0">
                            {tx(locale, "Cancel", "취소", "キャンセル")}
                          </button>
                        )}
                      </div>
                      <SimpleSetup
                        projectId={projectId}
                        equipmentId={equipmentId}
                        onComplete={() => { setSimpleInitialView("choose"); fetchAssets(); }}
                        onStartDetail={() => { setSimpleInitialView("choose"); fetchAssets().then(() => setViewMode("inline")); }}
                        onOpenScanImport={() => setScanImportOpen(true)}
                        onOpenDiagramImport={() => setDiagramImportOpen(true)}
                        onOpenExcelImport={() => importRef.current?.click()}
                        initialView={simpleInitialView}
                      />
                    </div>
                  )}

                  {/* ── Inline Edit / Detail View Mode ─────────────── */}
                  {viewMode === "inline" && equipmentId && (
                    <InlineEditor
                      projectId={projectId}
                      equipmentId={equipmentId}
                      onComplete={() => { fetchAssets(); setViewMode("table"); }}
                      onSwitchToTable={() => { fetchAssets(); setViewMode("table"); }}
                      readOnly={!canEdit}
                    />
                  )}

                  {/* ── Table Mode ────────────────────────────────────── */}
                  {viewMode === "table" && (
                    <>
                      {/* Toolbar */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-1">
                          {(["hardware", "software", "sbom", "audit"] as const).map((t) => (
                            <button key={t} onClick={() => setAssetTab(t)}
                              className={cn("px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all",
                                assetTab === t ? "bg-brand text-white" : "text-text-tertiary hover:bg-surface-secondary"
                              )}>
                              {t === "hardware"
                                ? `HW (${hardware.length})`
                                : t === "software"
                                ? `SW (${software.length})`
                                : t === "sbom"
                                ? "SBOM"
                                : `${tx(locale, "Audit", "점검 결과", "監査結果")} (${auditRuns.length})`}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          {equipmentId && hardware.length > 0 && (
                            <Button size="sm" variant="outline" onClick={() => setViewMode("inline")}>
                              {canEdit
                                ? <><Pencil size={13} /> {tx(locale, "Full Edit", "전체 편집", "一括編集")}</>
                                : <><Eye size={13} /> {tx(locale, "Detail View", "상세 보기", "詳細表示")}</>
                              }
                            </Button>
                          )}
                          {canEdit && hardware.some((h) => ["PC", "SERVER", "OTHER_DEVICE"].includes(h.type)) && (
                            <SecurityCheckDownload projectId={projectId} equipmentId={equipmentId || undefined} locale={locale} />
                          )}
                          {canEdit && (
                            <Button size="sm" onClick={() => setAddMethodOpen(true)}>
                              <Plus size={14} /> {tx(locale, "Add", "추가", "追加")}
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={handleExport} aria-label={tx(locale, "Export inventory", "인벤토리 내보내기", "インベントリエクスポート")}><Download size={13} aria-hidden="true" /></Button>
                        </div>
                      </div>

                      {/* Asset tab content */}
                      {assetTab === "sbom" && (
                        <SbomView hardware={hardware} software={software} locale={locale} projectId={projectId} equipmentId={equipmentId} onRefresh={fetchAssets} cveBySwId={cveBySwId} cveByHwId={cveByHwId} />
                      )}

                      {assetTab === "hardware" && (<>
                        {/* Unified HW Table with click-to-edit panel — table stays full width,
                            the slide panel is fixed overlay that doesn't collide with primary actions */}
                        <div>
                          <HardwareTable hardware={hardware} locale={locale} canEdit={canEdit}
                            onEdit={(hw) => setEditPanelHwId(editPanelHwId === hw.id ? null : hw.id)}
                            onDelete={(hw) => setDeleteTarget({ type: "hw", item: hw })}
                            onAddSw={(hwId) => { setPreSelectedHwId(hwId); setEditSw(null); setSwDialogOpen(true); }}
                            projectId={projectId} equipmentId={equipmentId} onRefresh={fetchAssets}
                            activeHwId={editPanelHwId}
                            onCveClick={setCveHwId}
                            cveBySwId={cveBySwId}
                            cveByHwId={cveByHwId}
                            software={software}
                          />
                        </div>

                        {/* Slide Edit Panel */}
                        <AnimatePresence>
                          {editPanelHwId && (() => {
                            const panelHw = hardware.find((h) => h.id === editPanelHwId);
                            if (!panelHw) return null;
                            const panelSw = software.filter((s) => s.hardwareId === panelHw.id);
                            return (
                              <motion.div key={panelHw.id}
                                initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 20, opacity: 0 }}
                                transition={{ duration: 0.2, ease: "easeOut" }}
                                className="fixed right-0 top-0 bottom-0 w-[440px] bg-white border-l border-border shadow-[-8px_0_30px_rgba(0,0,0,0.07)] z-30 flex flex-col"
                              >
                                <HwSlidePanel
                                  hw={panelHw} swList={panelSw} locale={locale} canEdit={canEdit}
                                  projectId={projectId} equipmentId={equipmentId} onRefresh={fetchAssets}
                                  onClose={() => setEditPanelHwId(null)}
                                  onDelete={() => setDeleteTarget({ type: "hw", item: panelHw })}
                                  onAddSw={() => { setPreSelectedHwId(panelHw.id); setEditSw(null); setSwDialogOpen(true); }}
                                  onEditSw={(sw) => { setEditSw(sw); setSwDialogOpen(true); }}
                                  onDeleteSw={(sw) => setDeleteTarget({ type: "sw", item: sw })}
                                />
                              </motion.div>
                            );
                          })()}
                        </AnimatePresence>
                      </>)}

                      {assetTab === "software" && (
                        <SoftwareTable software={software} locale={locale} canEdit={canEdit}
                          onEdit={(sw) => { setEditSw(sw); setSwDialogOpen(true); }}
                          onDelete={(sw) => setDeleteTarget({ type: "sw", item: sw })}
                          projectId={projectId} equipmentId={equipmentId} onRefresh={fetchAssets}
                          cveBySwId={cveBySwId}
                        />
                      )}

                      {assetTab === "audit" && (
                        <AuditRunsList
                          auditRuns={auditRuns}
                          hwCveMatches={hwCveMatches}
                          hardware={hardware.map((h) => ({ id: h.id, name: h.name }))}
                          locale={locale}
                          emptyHintKo="업로드된 점검 결과가 없습니다. HW 행에서 .scsaudit 파일을 업로드하세요."
                          emptyHintEn="No audit runs. Upload .scsaudit files from the HW table."
                          emptyHintJa="監査結果なし。HW行から.scsauditファイルをアップロードしてください。"
                        />
                      )}
                    </>
                  )}

                  {/* Simple mode fallback: no equipmentId */}
                  {viewMode === "simple" && !equipmentId && (
                    <EmptyState
                      icon={Cpu}
                      title={tx(locale, "No assets registered", "등록된 자산이 없습니다", "登録された資産がありません")}
                      subtitle={tx(locale, "Register assets from the equipment detail page", "기자재 상세 페이지에서 자산을 등록하세요", "機器詳細ページで資産を登録してください")}
                    />
                  )}
                </>
              )}
            </>
          )}

          {/* ── DFD Tab ────────────────────────────────────────────────── */}
          {mainTab === "dfd" && (
            <div className="space-y-3">
              {!allHwComplete && (
                <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 flex items-start gap-3">
                  <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[13px] font-semibold text-red-700">
                      {tx(locale, "Complete required fields first", "자산 등록 필수값을 먼저 입력하세요", "必須項目を先に入力してください")}
                    </p>
                    <p className="text-[11px] text-red-600/70 mt-0.5">
                      {tx(locale,
                        `${hardware.filter((h) => !isHwComplete(h)).length} device(s) have missing required fields. Go back to Inventory to complete them.`,
                        `${hardware.filter((h) => !isHwComplete(h)).length}개 장치에 필수값이 누락되어 있습니다. 자산 등록으로 돌아가 입력을 완료하세요.`,
                        `${hardware.filter((h) => !isHwComplete(h)).length}台のデバイスに必須項目が不足しています。`
                      )}
                    </p>
                    <button onClick={() => setMainTab("basic")} className="mt-2 text-[11px] font-bold text-red-700 hover:text-red-900 underline underline-offset-2">
                      {tx(locale, "Go to Inventory", "자산 등록으로 이동", "資産登録へ")}
                    </button>
                  </div>
                </div>
              )}

              {/* DFD Toolbar */}
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-text-tertiary">
                  {tx(locale, "Edit layout and connections. Device add/delete is managed in Inventory.", "레이아웃과 연결을 편집하세요. 장비 추가/삭제는 자산 등록에서 관리합니다.", "レイアウトと接続を編集してください。デバイスの追加/削除は資産登録で管理します。")}
                </p>
                <Button size="sm" variant="outline" loading={dfdGenerating} onClick={handleRegenerateDfd}>
                  <Network size={13} /> {tx(locale, "Regenerate DFD", "DFD 재생성", "DFD再生成")}
                </Button>
              </div>

              <Card padding="none" className="overflow-hidden">
                <div className="h-[calc(100vh-320px)] min-h-[500px]">
                  {dfdGenerating ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                      <div className="h-8 w-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                      <p className="text-[13px] text-text-tertiary">{tx(locale, "Generating network diagram...", "네트워크 다이어그램을 생성하고 있습니다...", "ネットワークダイアグラムを生成中...")}</p>
                    </div>
                  ) : (
                    <DfdEditor key={dfdKey} projectId={projectId} hardware={hardware} equipmentId={equipmentId} noCreate />
                  )}
                </div>
              </Card>
            </div>
          )}
        </motion.div>

        {/* Hidden file input — always rendered */}
        <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />

        {/* CVE Sidebar — shared component; vendors can delete matches, reviewers see read-only */}
        <CveSidebar
          open={!!cveHwId}
          hwId={cveHwId}
          hwName={hardware.find((h) => h.id === cveHwId)?.name || ""}
          projectId={projectId}
          locale={locale}
          canDelete={canEdit}
          hardwareSoftwareIds={cveHwId ? (hardware.find((h) => h.id === cveHwId)?.software?.map((s) => s.id) || []) : []}
          onClose={() => setCveHwId(null)}
          onMutate={fetchAssets}
        />

        <ConfirmDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
          title={tx(locale, "Confirm Delete", "삭제 확인", "削除確認")}
          description={deleteTarget ? (locale === "ko" ? `"${deleteTarget.item.name}"을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.` : locale === "ja" ? `「${deleteTarget.item.name}」を削除しますか？この操作は元に戻せません。` : `Delete "${deleteTarget.item.name}"? This cannot be undone.`) : ""}
          confirmLabel={tx(locale, "Delete", "삭제", "削除")}
          cancelLabel={tx(locale, "Cancel", "취소", "キャンセル")}
        />

        {/* Dialogs */}
        {canEdit && (
          <>
            <HwDialog open={hwDialogOpen} onClose={() => { setHwDialogOpen(false); setEditHw(null); }} onSave={handleSaveHw} editing={editHw} projectId={projectId} />
            <SwDialog open={swDialogOpen} onClose={() => { setSwDialogOpen(false); setEditSw(null); setPreSelectedHwId(""); }} onSave={handleSaveSw} editing={editSw} hardwareList={hardware} preSelectedHardwareId={preSelectedHwId} projectId={projectId} />
            <ScanImportDialog open={scanImportOpen} onClose={() => setScanImportOpen(false)} projectId={projectId} equipmentId={equipmentId} onComplete={fetchAssets} />
            <DiagramImportDialog open={diagramImportOpen} onClose={() => setDiagramImportOpen(false)} projectId={projectId} equipmentId={equipmentId} onComplete={fetchAssets} />

            {/* Add Method Chooser */}
            <Dialog open={addMethodOpen} onClose={() => setAddMethodOpen(false)} title={tx(locale, "Add Assets", "자산 추가", "資産追加")} maxWidth="max-w-lg">
              <div className="space-y-2.5">
                {([
                  {
                    icon: ListPlus, titleEn: "Manual Input", titleKo: "수동 입력", titleJa: "手動入力", descEn: "Select quantities by type, then name", descKo: "장치 유형별 수량 선택 후 이름 지정", descJa: "タイプ別に数量を選択し名前を入力", color: "text-brand", bg: "bg-brand-lighter",
                    onClick: () => { setAddMethodOpen(false); setSimpleInitialView("manual-count"); setViewMode("simple"); }
                  },
                  {
                    icon: Radar, titleEn: "SC-P Scan", titleKo: "SC-P 스캔", titleJa: "SC-Pスキャン", descEn: "Auto-configure from SC-P scan results", descKo: "SC-P 스캔 결과에서 자동 구성", descJa: "SC-Pスキャン結果から自動構成", color: "text-safety-elevated", bg: "bg-orange-50",
                    onClick: () => { setAddMethodOpen(false); setScanImportOpen(true); }
                  },
                  {
                    icon: Upload, titleEn: "Excel Upload", titleKo: "엑셀 업로드", titleJa: "Excelアップロード", descEn: "Bulk import from Excel file", descKo: "CBS/HW/SW 엑셀 파일로 일괄 등록", descJa: "Excelファイルから一括インポート", color: "text-green-600", bg: "bg-green-50",
                    onClick: () => { setAddMethodOpen(false); importRef.current?.click(); }
                  },
                ] as const).map((m) => {
                  const Icon = m.icon;
                  return (
                    <button key={m.titleEn} type="button" onClick={m.onClick}
                      className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl border border-border bg-white hover:border-brand/30 hover:shadow-sm transition-all group text-left"
                    >
                      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105", m.bg)}>
                        <Icon size={18} className={m.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-body-sm font-bold text-text">{locale === "ko" ? m.titleKo : locale === "ja" ? (m.titleJa) : m.titleEn}</p>
                        <p className="text-[11px] text-text-tertiary mt-0.5">{locale === "ko" ? m.descKo : locale === "ja" ? (m.descJa) : m.descEn}</p>
                      </div>
                      <ArrowRight size={14} className="text-text-tertiary shrink-0 group-hover:text-brand transition-colors" />
                    </button>
                  );
                })}
              </div>
            </Dialog>

            {/* CSV Quick Import Dialog */}
            <Dialog open={csvOpen} onClose={() => setCsvOpen(false)} title={tx(locale, "Quick SW Import", "SW 빠른 입력", "SWクイックインポート")} description={tx(locale, "Enter one per line: Name, Version, Vendor, Type (comma or tab separated)", "이름, 버전, 벤더, 유형 순서로 한 줄에 하나씩 입력하세요 (콤마 또는 탭 구분)", "1行に1つずつ入力してください: 名前, バージョン, ベンダー, タイプ (カンマまたはタブ区切り)")}>
              <div className="space-y-3">
                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="Windows Server 2019, 10.0.17763, Microsoft, OS\nApache, 2.4.52, Apache, APPLICATION\nMySQL, 8.0.35, Oracle, APPLICATION"
                  rows={8}
                  className="w-full rounded-lg border border-border px-3 py-2 text-body-sm font-mono text-text placeholder:text-text-tertiary resize-none focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                />
                <p className="text-[11px] text-text-tertiary">
                  {locale === "ko" ? `${csvText.trim().split("\n").filter((l) => l.trim()).length}개 항목 감지됨 · 유형: OS, APPLICATION, FIRMWARE, DRIVER, LIBRARY, MIDDLEWARE` : locale === "ja" ? `${csvText.trim().split("\n").filter((l) => l.trim()).length}件検出 · タイプ: OS, APPLICATION, FIRMWARE, DRIVER, LIBRARY, MIDDLEWARE` : `${csvText.trim().split("\n").filter((l) => l.trim()).length} items detected · Types: OS, APPLICATION, FIRMWARE, DRIVER, LIBRARY, MIDDLEWARE`}
                </p>
                <div className="flex justify-end gap-3 pt-2 border-t border-border">
                  <Button variant="outline" onClick={() => setCsvOpen(false)}>{tx(locale, "Cancel", "취소", "キャンセル")}</Button>
                  <Button onClick={handleCsvImport} loading={csvImporting}><Plus size={14} /> {tx(locale, "Import", "등록", "インポート")}</Button>
                </div>
              </div>
            </Dialog>
          </>
        )}

      </div>
    </div>
  );
}

// ─── Hardware Table ─────────────────────────────────────────────────────────

function HardwareTable({ hardware, locale, canEdit, onEdit, onDelete, onAddSw, projectId, equipmentId, onRefresh, activeHwId, onCveClick, cveBySwId, cveByHwId, software }: {
  hardware: Hardware[]; locale: string; canEdit: boolean;
  onEdit: (hw: Hardware) => void; onDelete: (hw: Hardware) => void; onAddSw?: (hwId: string) => void;
  projectId: string; equipmentId?: string | null; onRefresh: () => void; activeHwId?: string | null;
  onCveClick?: (hwId: string) => void;
  cveBySwId: Map<string, SeverityCounts>;
  cveByHwId: Map<string, SeverityCounts>;
  software: Software[];
}) {
  if (hardware.length === 0) return <EmptyState icon={Cpu} title={tx(locale, "No hardware", "등록된 하드웨어가 없습니다", "ハードウェアがありません")} subtitle={tx(locale, "Use the buttons above to add hardware", "위 버튼으로 하드웨어를 등록하세요", "上のボタンでハードウェアを追加してください")} />;

  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className={cn("grid gap-2 px-4 py-2 bg-surface-secondary border-b border-border text-[10px] font-bold text-text-tertiary uppercase tracking-wider", canEdit ? "grid-cols-[1fr_90px_110px_100px_55px_50px_36px]" : "grid-cols-[1fr_90px_110px_100px_55px_50px]")}>
        <span>{tx(locale, "Device", "장치", "デバイス")}</span>
        <span>{tx(locale, "Mfr", "제조사", "メーカー")}</span>
        <span>IP</span>
        <span>Zone</span>
        <span className="text-center">SW</span>
        <span className="text-center">CVE</span>
        {canEdit && <span />}
      </div>
      {/* Rows */}
      {hardware.map((hw) => {
        const Icon = HW_ICONS[hw.type] || HardDrive;
        const colorCls = HW_TYPE_COLORS[hw.type] || "bg-gray-100 text-gray-600";
        const [bgCls, textCls] = colorCls.split(" ");
        const catLabel = hw.category === "1" ? "I" : hw.category === "2" ? "II" : hw.category === "3" ? "III" : "—";
        const catColor = hw.category === "1" ? "bg-red-50 text-red-700" : hw.category === "2" ? "bg-orange-50 text-orange-700" : hw.category === "3" ? "bg-blue-50 text-blue-700" : "bg-gray-50 text-gray-400";
        const swCount = hw.software?.length || 0;
        // Aggregate severity: HW-direct matches + every linked SW's matches.
        // Parent computes cveByHwId/cveBySwId from the cve-matches payload; re-using that
        // map keeps the HW pill color-aligned with the SbomView meter.
        const hwSev = ((): SeverityCounts => {
          const acc = { ...(cveByHwId.get(hw.id) || emptySeverity()) };
          for (const s of software.filter((sw) => sw.hardwareId === hw.id)) {
            const c = cveBySwId.get(s.id);
            if (!c) continue;
            acc.total += c.total;
            acc.critical += c.critical;
            acc.high += c.high;
            acc.medium += c.medium;
            acc.low += c.low;
            acc.unknown += c.unknown;
          }
          return acc;
        })();
        const cveCount = hwSev.total || (hw._count?.cveMatches || 0) + (hw.swCveCount || 0);
        const isActive = activeHwId === hw.id;
        const hasMissing = !isHwComplete(hw);

        return (
          <div key={hw.id}
            onClick={() => onEdit(hw)}
            className={cn(
              "grid gap-2 items-center px-4 py-2.5 border-b border-border/50 cursor-pointer transition-all duration-150 group",
              canEdit ? "grid-cols-[1fr_90px_110px_100px_55px_50px_36px]" : "grid-cols-[1fr_90px_110px_100px_55px_50px]",
              isActive ? "bg-brand-lighter/50 border-l-[3px] border-l-brand" : "hover:bg-surface-secondary/50 border-l-[3px] border-l-transparent",
            )}>
            {/* Device */}
            <div className="flex items-center gap-2 min-w-0">
              <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center shrink-0", bgCls)}>
                <Icon size={14} className={textCls} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-semibold text-text truncate">{hw.name}</span>
                  {hasMissing ? <AlertCircle size={10} className="text-red-400 shrink-0" /> : <CheckCircle size={10} className="text-green-500 shrink-0" />}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={cn("px-1 py-px rounded text-[8px] font-bold", catColor)}>Cat {catLabel}</span>
                  <span className="text-[10px] text-text-tertiary truncate">{hw.model || "—"}</span>
                </div>
              </div>
            </div>
            {/* Mfr */}
            <span className="text-[11px] text-text-secondary truncate">{hw.manufacturer || "—"}</span>
            {/* IP */}
            <span className="text-[10px] font-mono text-text-tertiary truncate">{hw.ipAddress || "—"}</span>
            {/* Zone */}
            <span className="text-[10px] text-text-tertiary truncate">{hw.zone || "—"}</span>
            {/* SW count */}
            <div className="flex justify-center">
              {swCount > 0 ? <span className="px-1.5 py-px rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold">{swCount}</span> : <span className="text-[10px] text-text-tertiary">—</span>}
            </div>
            {/* CVE — clickable CveBadge opens the detailed sidebar */}
            <div className="flex justify-center">
              {cveCount > 0 ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onCveClick?.(hw.id); }}
                  className="inline-flex items-center rounded-full transition-transform hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 cursor-pointer"
                  aria-label={tx(locale, "View CVE details", "CVE 상세 보기", "CVE詳細を表示")}
                >
                  <CveBadge counts={hwSev} />
                </button>
              ) : <span className="text-[10px] text-text-tertiary">—</span>}
            </div>
            {/* Delete */}
            {canEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(hw); }}
                className="p-1.5 rounded-md text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-safety-high hover:bg-risk-bg transition-all"
                title={tx(locale, "Delete", "삭제", "削除")}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        );
      })}
      {/* Footer */}
      <div className="px-4 py-2 border-t border-border bg-surface-secondary/30">
        <p className="text-[11px] text-text-tertiary">
          {locale === "ko" ? `총 ${hardware.length}개 장치` : locale === "ja" ? `合計${hardware.length}台` : `${hardware.length} device${hardware.length !== 1 ? "s" : ""} total`}
        </p>
      </div>
    </div>
  );
}

// ─── Security Check Download Button ─────────────────────────────────────────

function SecurityCheckDownload({ projectId, equipmentId, locale }: {
  projectId: string; equipmentId?: string; locale: string;
}) {
  const [downloading, setDownloading] = useState(false);
  const [platform, setPlatform] = useState<"windows" | "linux" | null>(null);

  const handleDownload = async (p: "windows" | "linux") => {
    setDownloading(true);
    setPlatform(p);
    try {
      const eqParam = equipmentId ? `&equipmentId=${equipmentId}` : "";
      const res = await fetch(`/api/vendor/audit-tools/download?platform=${p}${eqParam}`);
      if (!res.ok) { showToast.error(tx(locale, "Download failed", "다운로드 실패", "ダウンロード失敗")); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `security_check_${p}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      showToast.success(tx(locale, "Downloaded", "다운로드 완료", "ダウンロード完了"));
    } finally { setDownloading(false); setPlatform(null); }
  };

  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative">
      <Button size="sm" variant="outline" onClick={() => setMenuOpen(!menuOpen)}>
        <Shield size={13} /> {tx(locale, "Check Tool", "점검 도구", "検査ツール")} <ChevronDown size={11} />
      </Button>
      {menuOpen && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-border rounded-lg shadow-xl z-50 py-1">
          <button onClick={() => { handleDownload("windows"); setMenuOpen(false); }} disabled={downloading}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-left hover:bg-surface-secondary transition-colors disabled:opacity-50">
            <span className="text-[14px]">🪟</span>
            <span className="font-medium text-text">Windows</span>
            {downloading && platform === "windows" && <div className="ml-auto h-3 w-3 border-2 border-brand border-t-transparent rounded-full animate-spin" />}
          </button>
          <button onClick={() => { handleDownload("linux"); setMenuOpen(false); }} disabled={downloading}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-left hover:bg-surface-secondary transition-colors disabled:opacity-50">
            <span className="text-[14px]">🐧</span>
            <span className="font-medium text-text">Linux</span>
            {downloading && platform === "linux" && <div className="ml-auto h-3 w-3 border-2 border-brand border-t-transparent rounded-full animate-spin" />}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Security Check Cell (per-hardware) ─────────────────────────────────────

function AuditCell({ hwId, hwName, projectId, equipmentId, locale }: {
  hwId: string; hwName: string; projectId: string; equipmentId?: string; locale: string;
}) {
  const [count, setCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!equipmentId) return;
    fetch(`/api/vendor/audit-tools/upload?equipmentId=${equipmentId}&hardwareId=${hwId}`)
      .then(async (r) => { if (r.ok) { const d = await r.json(); const list = Array.isArray(d) ? d : (d.runs ?? []); setCount(list.length); } })
      .catch(() => { });
  }, [equipmentId]);

  const handleUpload = async (file: File) => {
    if (!equipmentId) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("projectId", projectId);
    formData.append("equipmentId", equipmentId);
    formData.append("hardwareId", hwId);
    formData.append("deviceName", hwName);

    const res = await fetch("/api/vendor/audit-tools/upload", { method: "POST", body: formData });
    if (res.ok) {
      showToast.success(tx(locale, "Check result uploaded", "보안 점검 결과 업로드 완료", "検査結果アップロード完了"));
      setCount((c) => c + 1);
    } else {
      showToast.error(tx(locale, "Upload failed", "업로드 실패", "アップロード失敗"));
    }
    setUploading(false);
  };

  return (
    <div className="flex items-center justify-center gap-1">
      <input ref={fileRef} type="file" accept=".scsaudit,.json" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />
      {count > 0 ? (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#E6F7EF] text-[#24A148]">
          ✓ {count}
        </span>
      ) : (
        <button onClick={() => fileRef.current?.click()} disabled={uploading || !equipmentId}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium text-brand bg-brand-lighter/50 hover:bg-brand-lighter transition-colors disabled:opacity-50">
          {uploading ? "..." : tx(locale, "Upload", "업로드", "アップ")}
        </button>
      )}
    </div>
  );
}

// ─── Software Table ─────────────────────────────────────────────────────────

function SoftwareTable({ software, locale, canEdit, onEdit, onDelete, projectId, equipmentId, onRefresh, cveBySwId }: {
  software: Software[]; locale: string; canEdit: boolean;
  onEdit: (sw: Software) => void; onDelete: (sw: Software) => void;
  projectId: string; equipmentId?: string | null; onRefresh: () => void;
  cveBySwId: Map<string, SeverityCounts>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const allSelected = software.length > 0 && selected.size === software.length;
  const someSelected = selected.size > 0;
  const indeterminate = someSelected && !allSelected;

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(software.map((s) => s.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      await Promise.all([...selected].map((id) =>
        fetch(`/api/projects/${projectId}/software/${id}`, { method: "DELETE" })
      ));
      showToast.success(locale === "ko" ? `${selected.size}개 삭제 완료` : locale === "ja" ? `${selected.size}件削除完了` : `Deleted ${selected.size} items`);
      setSelected(new Set());
      onRefresh();
    } finally {
      setDeleting(false);
    }
  };

  if (software.length === 0) return <EmptyState icon={Package} title={tx(locale, "No software", "등록된 소프트웨어가 없습니다", "ソフトウェアがありません")} subtitle={tx(locale, "Use the button above to add software", "위 버튼으로 등록하세요", "上のボタンでソフトウェアを追加してください")} />;

  return (
    <Card padding="none" className="overflow-hidden">
      {someSelected && canEdit && (
        <div className="flex items-center justify-between px-4 py-2 bg-brand-lighter border-b border-brand/15">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-full bg-brand flex items-center justify-center">
              <span className="text-[10px] font-bold text-white">{selected.size}</span>
            </div>
            <p className="text-body-xs font-semibold text-brand">
              {locale === "ko" ? "개 선택됨" : locale === "ja" ? "件選択中" : " selected"}
            </p>
          </div>
          <button
            onClick={handleBulkDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-body-xs font-semibold text-safety-high bg-white border border-safety-high/20 hover:bg-risk-bg hover:border-safety-high/40 transition-all disabled:opacity-50"
          >
            <Trash2 size={12} /> {tx(locale, "Delete", "삭제", "削除")}
          </button>
        </div>
      )}
      <div className="overflow-auto max-h-[calc(100vh-320px)]">
        <table className="w-full">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-white shadow-xs">
              {canEdit && (
                <th className="w-10 px-3 py-2.5">
                  <input type="checkbox" checked={allSelected || indeterminate} onChange={toggleAll}
                    className={cn("checkbox-cytur", indeterminate && "indeterminate")} />
                </th>
              )}
              {[
                { label: tx(locale, "Name / CPE", "이름 / CPE", "名前 / CPE"), cls: "text-left" },
                { label: tx(locale, "Ver.", "버전", "バージョン"), cls: "text-left w-[84px]" },
                { label: tx(locale, "Type", "유형", "タイプ"), cls: "text-left w-[80px]" },
                { label: "CVE", cls: "text-left w-[72px]" },
                { label: tx(locale, "Vendor", "벤더", "ベンダー"), cls: "text-left w-[90px] hidden md:table-cell" },
                { label: tx(locale, "HW", "연결 HW", "HW"), cls: "text-left w-[110px] hidden md:table-cell" },
                { label: tx(locale, "Purpose", "용도", "用途"), cls: "text-left hidden lg:table-cell" },
                ...(canEdit ? [{ label: "", cls: "text-right w-14" }] : []),
              ].map((h, i) => (
                <th key={i} className={cn("px-3 py-2.5 text-[10px] font-bold text-text-tertiary uppercase tracking-wider whitespace-nowrap", h.cls)}>{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {software.map((sw, idx) => {
              const isChecked = selected.has(sw.id);
              const cve = cveBySwId.get(sw.id);
              const hasCve = !!cve && cve.total > 0;
              return (
                <tr key={sw.id} className={cn("group hover:bg-brand-lighter/25 transition-colors duration-100", isChecked && "bg-brand-lighter/20", idx % 2 !== 0 && !isChecked && "bg-surface-secondary/15")}>
                  {canEdit && (
                    <td className="w-10 px-3 py-2.5">
                      <input type="checkbox" checked={isChecked} onChange={() => toggleOne(sw.id)}
                        className="checkbox-cytur" />
                    </td>
                  )}
                  <td className="px-3 py-2.5 max-w-0">
                    <p className="text-[12px] font-semibold text-text leading-tight truncate">{sw.name}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      {sw.cpe ? (
                        <span className="cpe-chip" title={sw.cpe}>{sw.cpe}</span>
                      ) : (
                        <span className="cpe-chip cpe-chip--missing" title={tx(locale, "CPE required for CVE matching", "CVE 매칭에 CPE 필요", "CVEマッチングにCPEが必要")}>
                          {tx(locale, "no CPE", "CPE 없음", "CPEなし")}
                        </span>
                      )}
                      {sw.modelName && <span className="text-[10px] text-text-tertiary truncate">{sw.modelName}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {sw.version
                      ? <span className="font-mono text-[10px] text-text bg-surface-secondary px-1.5 py-0.5 rounded border border-border">{sw.version}</span>
                      : <span className="text-border-strong text-[11px]">—</span>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold", SW_TYPE_COLORS[sw.swType] || "bg-gray-100 text-gray-600")}>
                      {SW_TYPES.find((t) => t.value === sw.swType)?.label || sw.swType}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {hasCve ? (
                      <CveBadge counts={cve!} />
                    ) : !sw.cpe ? (
                      <span className="text-[10px] text-text-tertiary font-mono italic">{tx(locale, "—", "대기", "—")}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-safety-low font-mono font-bold">
                        <CheckCircle size={9} strokeWidth={2.5} /> 0
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-text-secondary hidden md:table-cell truncate">{sw.vendor || <span className="text-border-strong">—</span>}</td>
                  <td className="px-3 py-2.5 hidden md:table-cell truncate">
                    {sw.hardware?.name
                      ? <span className="text-[11px] text-text-secondary">{sw.hardware.name}</span>
                      : <span className="text-border-strong text-[11px]">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-[10px] text-text-tertiary hidden lg:table-cell truncate">{sw.purpose || <span className="text-border-strong">—</span>}</td>
                  {canEdit && (
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-100">
                        <button onClick={() => onEdit(sw)} className="p-1.5 rounded-md text-text-tertiary hover:text-brand hover:bg-brand-lighter transition-colors" title={tx(locale, "Edit", "수정", "編集")}><Pencil size={13} /></button>
                        <button onClick={() => onDelete(sw)} className="p-1.5 rounded-md text-text-tertiary hover:text-safety-high hover:bg-risk-bg transition-colors" title={tx(locale, "Delete", "삭제", "削除")}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-border bg-surface-secondary/30 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-text-tertiary">
          {locale === "ko" ? `총 ${software.length}개 항목` : locale === "ja" ? `合計${software.length}件` : `${software.length} item${software.length !== 1 ? "s" : ""} total`}
        </p>
        {(() => {
          const agg = software.reduce((acc, s) => {
            const c = cveBySwId.get(s.id);
            if (c) {
              acc.total += c.total;
              acc.critical += c.critical;
              acc.high += c.high;
              acc.medium += c.medium;
              acc.low += c.low;
              acc.unknown += c.unknown;
            }
            return acc;
          }, emptySeverity());
          const missingCpe = software.filter((s) => !s.cpe).length;
          if (agg.total === 0 && missingCpe === 0) return null;
          return (
            <div className="flex items-center gap-3 text-[10px]">
              {agg.total > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-text-tertiary uppercase tracking-[0.08em] font-bold">
                    {tx(locale, "CVE", "CVE", "CVE")}
                  </span>
                  <CveBadge counts={agg} size="sm" />
                </div>
              )}
              {missingCpe > 0 && (
                <span className="inline-flex items-center gap-1 text-safety-elevated font-mono font-bold tabular-nums">
                  <AlertCircle size={10} strokeWidth={2.5} />
                  {missingCpe} {tx(locale, "without CPE", "CPE 누락", "CPE未登録")}
                </span>
              )}
            </div>
          );
        })()}
      </div>
    </Card>
  );
}

// ─── HW Slide Panel (편집용 사이드 패널) ─────────────────────────────────────

function HwSlidePanel({ hw, swList, locale, canEdit, onClose, onDelete, onAddSw, onEditSw, onDeleteSw, projectId, equipmentId, onRefresh }: {
  hw: Hardware; swList: Software[]; locale: string; canEdit: boolean;
  onClose: () => void; onDelete: () => void;
  onAddSw: () => void; onEditSw: (sw: Software) => void; onDeleteSw: (sw: Software) => void;
  projectId: string; equipmentId?: string | null; onRefresh: () => void;
}) {
  const Icon = HW_ICONS[hw.type] || HardDrive;
  const typeColor = HW_TYPE_COLORS[hw.type] || "bg-gray-100 text-gray-600";
  const [swOpen, setSwOpen] = useState(true);
  const [auditOpen, setAuditOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Known HW suggestions (grouped by category)
  const [mfrSuggestions, setMfrSuggestions] = useState<Record<string, Array<{ label: string; manufacturer: string; series: string; category: string; hwType: string }>>>({});
  const [showMfrSuggestions, setShowMfrSuggestions] = useState(false);
  // All HW items (flat) for model filtering
  const [allHwProducts, setAllHwProducts] = useState<Array<{ label: string; manufacturer: string; series: string; category: string; hwType: string }>>([]);
  const [showModelSuggestions, setShowModelSuggestions] = useState(false);
  // Known SW suggestions for sysSoftwareCategory
  const [swSuggestions, setSwSuggestions] = useState<Record<string, Array<{ label: string; vendor: string; product: string; cpePrefix: string; swType: string; category: string }>>>({});
  const [showSwSuggestions, setShowSwSuggestions] = useState(false);

  // Audit runs + CVE matches for this HW — feed into AuditResultViewer
  interface AuditRunSummary {
    id: string;
    platform: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    results: any;
    createdAt: string;
  }
  interface ViewerCveMatch {
    name: string;
    version: string;
    cves: { cveId: string; severity: string | null; score: number | null; description: string }[];
  }
  const [auditRuns, setAuditRuns] = useState<AuditRunSummary[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [hwCveMatches, setHwCveMatches] = useState<ViewerCveMatch[]>([]);

  useEffect(() => {
    if (!equipmentId) return;
    setAuditLoading(true);
    (async () => {
      const [runsRes, cveRes] = await Promise.all([
        fetch(`/api/vendor/audit-tools/upload?equipmentId=${equipmentId}&hardwareId=${hw.id}`).catch(() => null),
        fetch(`/api/projects/${projectId}/cve-matches`).catch(() => null),
      ]);
      if (runsRes?.ok) {
        const raw = await runsRes.json();
        const list = Array.isArray(raw) ? raw : (raw.runs ?? []);
        const parsed: AuditRunSummary[] = list.map((r: { id: string; platform?: string; results?: string | object; createdAt: string }) => ({
          id: r.id,
          platform: r.platform || "UNKNOWN",
          results: typeof r.results === "string" ? (() => { try { return JSON.parse(r.results as string); } catch { return {}; } })() : (r.results ?? {}),
          createdAt: r.createdAt,
        }));
        setAuditRuns(parsed);
      }
      if (cveRes?.ok) {
        const all = await cveRes.json() as Array<{
          cveId: string;
          softwareId: string | null;
          hardwareId: string | null;
          software: { id: string; name: string; version: string | null } | null;
          hardware: { id: string } | null;
          cveDetail: { description: string | null; baseScore: number | null; baseSeverity: string | null } | null;
        }>;
        const swIds = new Set(swList.map((s) => s.id));
        const grouped = new Map<string, ViewerCveMatch>();
        for (const m of all) {
          const belongs = (m.softwareId && swIds.has(m.softwareId)) || m.hardwareId === hw.id;
          if (!belongs) continue;
          const key = m.software ? `${m.software.name}::${m.software.version ?? ""}` : `${hw.name}::${hw.model ?? ""}`;
          const name = m.software?.name ?? hw.name;
          const version = m.software?.version ?? hw.model ?? "";
          if (!grouped.has(key)) grouped.set(key, { name, version, cves: [] });
          grouped.get(key)!.cves.push({
            cveId: m.cveId,
            severity: m.cveDetail?.baseSeverity ?? null,
            score: m.cveDetail?.baseScore ?? null,
            description: m.cveDetail?.description ?? "",
          });
        }
        setHwCveMatches([...grouped.values()]);
      }
      setAuditLoading(false);
    })();
  }, [equipmentId, hw.id, hw.name, hw.model, projectId, swList]);

  // Editable form — initialized from hw data
  const [f, setF] = useState({
    name: hw.name || "", manufacturer: hw.manufacturer || "", model: hw.model || "",
    category: hw.category || "", purpose: hw.purpose || "", location: hw.location || "",
    zone: hw.zone || "", sysSoftwareCategory: hw.sysSoftwareCategory || "",
    sysSoftwareVersion: hw.sysSoftwareVersion || "", ipAddress: hw.ipAddress || "",
    macAddress: hw.macAddress || "", physicalInterface: hw.physicalInterface || "",
    commProtocols: hw.commProtocols || "", protectionMethod: hw.protectionMethod || "",
    logicalLocation: hw.logicalLocation || "",
  });

  // Reset form when hw changes
  useEffect(() => {
    setF({
      name: hw.name || "", manufacturer: hw.manufacturer || "", model: hw.model || "",
      category: hw.category || "", purpose: hw.purpose || "", location: hw.location || "",
      zone: hw.zone || "", sysSoftwareCategory: hw.sysSoftwareCategory || "",
      sysSoftwareVersion: hw.sysSoftwareVersion || "", ipAddress: hw.ipAddress || "",
      macAddress: hw.macAddress || "", physicalInterface: hw.physicalInterface || "",
      commProtocols: hw.commProtocols || "", protectionMethod: hw.protectionMethod || "",
      logicalLocation: hw.logicalLocation || "",
    });
    setDirty(false);
  }, [hw.id, hw.name, hw.manufacturer, hw.model, hw.category, hw.purpose, hw.location, hw.zone, hw.sysSoftwareCategory, hw.sysSoftwareVersion, hw.ipAddress, hw.macAddress, hw.physicalInterface, hw.commProtocols, hw.protectionMethod, hw.logicalLocation]);

  const up = (k: string, v: string) => {
    setF((p) => ({ ...p, [k]: v })); setDirty(true);
    // Fetch HW suggestions
    if (k === "manufacturer") {
      fetch(`/api/cve/products?kind=hw&q=${encodeURIComponent(v)}`).then(async r => {
        if (r.ok) { const d = await r.json(); setMfrSuggestions(d.grouped || {}); setAllHwProducts(d.items || []); setShowMfrSuggestions(true); }
      }).catch(() => {});
    }
    // Fetch SW suggestions
    if (k === "sysSoftwareCategory") {
      fetch(`/api/cve/products?kind=sw&q=${encodeURIComponent(v)}`).then(async r => {
        if (r.ok) { const d = await r.json(); setSwSuggestions(d.grouped || {}); setShowSwSuggestions(true); }
      }).catch(() => {});
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/hardware/${hw.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      if (res.ok) { showToast.success(tx(locale, "Saved", "저장됨", "保存済み")); setDirty(false); onRefresh(); }
      else { showToast.error(tx(locale, "Save failed", "저장 실패", "保存失敗")); }
    } finally { setSaving(false); }
  };

  const catCls = f.category === "1" ? "bg-red-50 text-red-700" : f.category === "2" ? "bg-orange-50 text-orange-700" : f.category === "3" ? "bg-blue-50 text-blue-700" : "bg-gray-50 text-gray-400";
  const catLabel = f.category === "1" ? "Cat I" : f.category === "2" ? "Cat II" : f.category === "3" ? "Cat III" : "—";
  const hasMissing = !isHwComplete(f);

  const inputCls = "h-8 w-full rounded-md border border-border bg-white px-2.5 text-[12px] text-text placeholder:text-text-tertiary/50 focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand transition-all";
  const selCls = cn(inputCls, "appearance-none");
  const readOnlyInput = cn(inputCls, "bg-surface-secondary text-text-tertiary cursor-not-allowed");

  // EditField를 인라인 함수 대신 헬퍼로 직접 렌더 (리렌더 시 focus 유지)
  const renderField = (label: string, field: string, opts?: { placeholder?: string; mono?: boolean; required?: boolean; recommended?: boolean; hint?: string }) => {
    const val = (f as Record<string, string>)[field] || "";
    const hardEmpty = opts?.required && !val.trim();
    const softEmpty = opts?.recommended && !val.trim();
    return (
      <div className="space-y-1" key={field}>
        <label className={cn(
          "text-[10px] font-bold uppercase tracking-wider flex items-center gap-1",
          hardEmpty ? "text-red-500" : softEmpty ? "text-amber-600" : "text-text-tertiary",
        )}>
          <span>{label}</span>
          {opts?.required && <span className="text-red-500">*</span>}
        </label>
        <input value={val} onChange={(e) => up(field, e.target.value)} placeholder={opts?.placeholder}
          disabled={!canEdit}
          className={cn(
            canEdit ? inputCls : readOnlyInput,
            opts?.mono && "font-mono text-[11px]",
            hardEmpty && "border-red-300 bg-red-50/40",
            softEmpty && "border-amber-200 bg-amber-50/30",
          )} />
        {opts?.hint && <p className="text-[9px] text-text-tertiary mt-0.5">{opts.hint}</p>}
      </div>
    );
  };

  return (
    <>
      {/* Header */}
      <div className="border-b border-border px-5 pt-4 pb-3 flex items-center gap-3 shrink-0">
        <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", typeColor.split(" ")[0])}>
          <Icon size={18} className={typeColor.split(" ")[1]} />
        </div>
        <div className="flex-1 min-w-0">
          {canEdit ? (
            <input value={f.name} onChange={(e) => up("name", e.target.value)}
              className="text-[15px] font-bold text-text bg-transparent border-none outline-none w-full focus:bg-surface-secondary rounded px-1 -ml-1 transition-colors" />
          ) : (
            <p className="text-[15px] font-bold text-text truncate">{hw.name}</p>
          )}
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={cn("px-1.5 py-px rounded text-[9px] font-bold", catCls)}>{catLabel}</span>
            {hasMissing
              ? <span className="text-[9px] text-red-500 font-semibold flex items-center gap-0.5"><AlertCircle size={9} />{tx(locale, "Incomplete", "미완료", "未完了")}</span>
              : <span className="text-[9px] text-green-600 font-semibold flex items-center gap-0.5"><CheckCircle size={9} />{tx(locale, "Complete", "완료", "完了")}</span>}
            {dirty && <span className="text-[9px] text-brand font-semibold ml-1">{tx(locale, "Modified", "수정됨", "変更あり")}</span>}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label={tx(locale, "Close panel", "패널 닫기", "パネルを閉じる")}
          className="p-1.5 rounded-lg text-text-tertiary hover:text-text hover:bg-surface-secondary transition-colors"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Body — Inline Edit */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 py-4">
          <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mb-2.5">{tx(locale, "Basic Info", "기본 정보", "基本情報")}</p>
          <div className="grid grid-cols-2 gap-3">
            {/* Manufacturer with known product suggestions */}
            <div className="space-y-1 relative">
              <label className={cn("text-[10px] font-bold uppercase tracking-wider flex items-center gap-1", !f.manufacturer.trim() ? "text-red-500" : "text-text-tertiary")}>
                <span>{tx(locale, "Manufacturer", "제조사", "メーカー")}</span><span className="text-red-500">*</span>
              </label>
              <input value={f.manufacturer} onChange={(e) => up("manufacturer", e.target.value)}
                onFocus={() => { if (Object.keys(mfrSuggestions).length === 0) { fetch("/api/cve/products?kind=hw").then(async r => { if (r.ok) { const d = await r.json(); setMfrSuggestions(d.grouped || {}); } }).catch(() => {}); } setShowMfrSuggestions(true); }}
                onBlur={() => setTimeout(() => setShowMfrSuggestions(false), 200)}
                placeholder="e.g. Siemens" disabled={!canEdit}
                className={cn(canEdit ? inputCls : readOnlyInput, !f.manufacturer.trim() && "border-red-300 bg-red-50/40")} />
              {showMfrSuggestions && Object.keys(mfrSuggestions).length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-white shadow-lg">
                  {Object.entries(mfrSuggestions).map(([cat, items]) => (
                    <div key={cat}>
                      <div className="px-3 py-1.5 bg-surface-secondary/60 border-b border-border/50 sticky top-0">
                        <span className="text-[10px] font-bold text-text-tertiary uppercase">{cat}</span>
                      </div>
                      {items.map((s, i) => (
                        <button key={i} type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setF(p => ({ ...p, manufacturer: s.manufacturer, name: f.name || s.label }));
                            setDirty(true); setShowMfrSuggestions(false);
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-blue-50 transition-colors flex items-center gap-2 border-b border-border/30">
                          <span className="text-[12px] font-medium text-text">{s.label}</span>
                          <span className="text-[10px] text-text-tertiary ml-auto">{s.manufacturer}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Model with manufacturer-filtered suggestions */}
            <div className="space-y-1 relative">
              <label className={cn("text-[10px] font-bold uppercase tracking-wider flex items-center gap-1", !f.model.trim() ? "text-red-500" : "text-text-tertiary")}>
                <span>{tx(locale, "Model", "모델", "モデル")}</span><span className="text-red-500">*</span>
              </label>
              <input value={f.model} onChange={(e) => up("model", e.target.value)}
                onFocus={() => {
                  // Load all products if not loaded yet
                  if (allHwProducts.length === 0) {
                    fetch("/api/cve/products?kind=hw").then(async r => { if (r.ok) { const d = await r.json(); setAllHwProducts(d.items || []); } }).catch(() => {});
                  }
                  setShowModelSuggestions(true);
                }}
                onBlur={() => setTimeout(() => setShowModelSuggestions(false), 200)}
                placeholder="e.g. S7-1500, FortiGate-124G" disabled={!canEdit}
                className={cn(canEdit ? inputCls : readOnlyInput, !f.model.trim() && "border-red-300 bg-red-50/40")} />
              {showModelSuggestions && (() => {
                // Filter by current manufacturer
                const mfr = f.manufacturer.toLowerCase();
                const modelQuery = f.model.toLowerCase();
                const filtered = allHwProducts.filter(p => {
                  if (mfr && !p.manufacturer.toLowerCase().includes(mfr)) return false;
                  if (modelQuery && !p.label.toLowerCase().includes(modelQuery) && !p.series.includes(modelQuery)) return false;
                  return true;
                });
                if (filtered.length === 0) return null;
                // Group by category
                const grouped: Record<string, typeof filtered> = {};
                filtered.forEach(p => { if (!grouped[p.category]) grouped[p.category] = []; grouped[p.category].push(p); });
                return (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-white shadow-lg">
                    {Object.entries(grouped).map(([cat, items]) => (
                      <div key={cat}>
                        <div className="px-3 py-1.5 bg-surface-secondary/60 border-b border-border/50 sticky top-0">
                          <span className="text-[10px] font-bold text-text-tertiary uppercase">{cat}</span>
                        </div>
                        {items.map((s, i) => (
                          <button key={i} type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setF(p => ({ ...p, model: s.label.replace(s.manufacturer + " ", ""), manufacturer: s.manufacturer, name: f.name || s.label }));
                              setDirty(true); setShowModelSuggestions(false);
                            }}
                            className="w-full text-left px-3 py-1.5 hover:bg-blue-50 transition-colors flex items-center gap-2 border-b border-border/30">
                            <span className="text-[12px] font-medium text-text">{s.label}</span>
                            <span className="text-[10px] text-text-tertiary ml-auto">{s.manufacturer}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            {renderField(tx(locale, "Functionality", "기능", "機能"), "purpose", { placeholder: tx(locale, "System role", "시스템 역할", "システム役割"), required: true })}
            {renderField(tx(locale, "Location", "설치 위치", "設置場所"), "location", { placeholder: tx(locale, "e.g. Engine Room", "예: 기관실", "例: 機関室") })}
          </div>
          <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mt-4 mb-2.5">{tx(locale, "Shipyard Managed (Optional)", "조선소 관리 항목 (선택)", "造船所管理 (任意)")}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">{tx(locale, "Category", "카테고리", "カテゴリ")}</label>
              <select value={f.category} onChange={(e) => up("category", e.target.value)} disabled={!canEdit}
                className={canEdit ? selCls : readOnlyInput}>
                <option value="">{tx(locale, "Inherited from CBS", "CBS에서 상속", "CBSから継承")}</option>
                <option value="1">Cat I (Critical)</option>
                <option value="2">Cat II (Important)</option>
                <option value="3">Cat III (Other)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">{tx(locale, "Access Control", "접근통제", "アクセス制御")}</label>
              <select value={f.zone} onChange={(e) => up("zone", e.target.value)} disabled={!canEdit}
                className={canEdit ? selCls : readOnlyInput}>
                <option value="">{tx(locale, "Not set", "미설정", "未設定")}</option>
                {ACCESS_CONTROL_LEVELS.map((ac) => <option key={ac.id} value={ac.id}>{locale === "ko" ? ac.labelKo : locale === "ja" ? ac.labelJa : ac.label}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="h-px bg-border mx-5" />

        <div className="px-5 py-4">
          {/* 타입별 hidden 필드 제외 */}
          {(isFieldVisible(hw.type, "physicalInterface") || isFieldVisible(hw.type, "commProtocols")) && (
            <>
              <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mb-2.5">{tx(locale, "Technical (E27 Required)", "기술 사양 (E27 필수)", "技術仕様 (E27必須)")}</p>
              <div className="grid grid-cols-2 gap-3">
                {isFieldVisible(hw.type, "physicalInterface") &&
                  renderField(tx(locale, "Interface", "인터페이스", "IF"), "physicalInterface", { placeholder: "LAN, Serial", required: true })
                }
                {isFieldVisible(hw.type, "commProtocols") &&
                  renderField(tx(locale, "Protocol", "프로토콜", "プロトコル"), "commProtocols", { placeholder: "TCP/IP", required: true })
                }
              </div>
            </>
          )}

          {(isFieldVisible(hw.type, "sysSoftwareCategory") || isFieldVisible(hw.type, "sysSoftwareVersion")) && (
            <>
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mt-4 mb-2.5 flex items-center gap-1">
                {tx(locale, "System SW (E27 Recommended)", "시스템 SW (E27 권장)", "システムSW (E27推奨)")}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {isFieldVisible(hw.type, "sysSoftwareCategory") && (
                  <div className="space-y-1 relative">
                    <label className={cn("text-[10px] font-bold uppercase tracking-wider flex items-center gap-1", !f.sysSoftwareCategory.trim() ? "text-amber-600" : "text-text-tertiary")}>
                      <span>System SW</span>
                    </label>
                    <input value={f.sysSoftwareCategory} onChange={(e) => up("sysSoftwareCategory", e.target.value)}
                      onFocus={() => { if (Object.keys(swSuggestions).length === 0) { fetch("/api/cve/products?kind=sw").then(async r => { if (r.ok) { const d = await r.json(); setSwSuggestions(d.grouped || {}); } }).catch(() => {}); } setShowSwSuggestions(true); }}
                      onBlur={() => setTimeout(() => setShowSwSuggestions(false), 200)}
                      placeholder="Windows, IOS-XE, FortiOS" disabled={!canEdit}
                      className={cn(canEdit ? inputCls : readOnlyInput, !f.sysSoftwareCategory.trim() && "border-amber-200 bg-amber-50/30")} />
                    {showSwSuggestions && Object.keys(swSuggestions).length > 0 && (
                      <div className="absolute z-20 top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-white shadow-lg">
                        {Object.entries(swSuggestions).map(([cat, items]) => (
                          <div key={cat}>
                            <div className="px-3 py-1.5 bg-surface-secondary/60 border-b border-border/50 sticky top-0">
                              <span className="text-[10px] font-bold text-text-tertiary uppercase">{cat}</span>
                            </div>
                            {items.map((s, i) => (
                              <button key={i} type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setF(p => ({ ...p, sysSoftwareCategory: s.label }));
                                  setDirty(true); setShowSwSuggestions(false);
                                }}
                                className="w-full text-left px-3 py-1.5 hover:bg-violet-50 transition-colors flex items-center gap-2 border-b border-border/30">
                                <span className="text-[12px] font-medium text-text">{s.label}</span>
                                <span className="text-[10px] text-text-tertiary ml-auto">{s.vendor}</span>
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {isFieldVisible(hw.type, "sysSoftwareVersion") && renderField("SW Version", "sysSoftwareVersion", { placeholder: "v10.0", mono: true, recommended: true })}
              </div>
            </>
          )}

          <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mt-4 mb-2.5">{tx(locale, "Network (Optional)", "네트워크 (선택)", "ネットワーク (任意)")}</p>
          <div className="grid grid-cols-2 gap-3">
            {isFieldVisible(hw.type, "ipAddress") && renderField("IP Address", "ipAddress", { placeholder: "192.168.x.x", mono: true, hint: f.ipAddress && !isValidIp(f.ipAddress) ? "Invalid IPv4 format" : undefined })}
            {isFieldVisible(hw.type, "macAddress") && renderField("MAC Address", "macAddress", { placeholder: "AA:BB:CC:DD:EE:FF", mono: true, hint: f.macAddress && !isValidMac(f.macAddress) ? "XX:XX:XX:XX:XX:XX format" : undefined })}
          </div>
        </div>
        <div className="h-px bg-border mx-5" />

        {/* SW List — DEVICE_FIELD_CONFIG.showInstalledSw에 따라 조건부 */}
        {(DEVICE_FIELD_CONFIG[hw.type] || DEVICE_FIELD_CONFIG.OTHER_DEVICE).showInstalledSw && (
          <div className="px-5 py-4">
            <button onClick={() => setSwOpen(!swOpen)} className="flex items-center justify-between w-full">
              <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">
                {tx(locale, "Installed Software", "설치된 소프트웨어", "インストール済みSW")} ({swList.length})
              </p>
              <ChevronDown size={14} className={cn("text-text-tertiary transition-transform", swOpen && "rotate-180")} />
            </button>
            <AnimatePresence initial={false}>
              {swOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                  {swList.length === 0 ? (
                    <div className="py-5 text-center">
                      <Package size={18} className="mx-auto text-text-tertiary mb-1.5" />
                      <p className="text-[11px] text-text-tertiary">{tx(locale, "No software", "소프트웨어 없음", "ソフトウェアなし")}</p>
                    </div>
                  ) : (
                    <div className="mt-2.5 space-y-1.5">
                      {swList.map((sw) => {
                        const swTypeColor = SW_TYPE_COLORS[sw.swType] || "bg-gray-100 text-gray-600";
                        return (
                          <div key={sw.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-border-strong transition-colors group/sw">
                            <div className={cn("h-6 w-6 rounded flex items-center justify-center text-[9px] font-bold shrink-0", swTypeColor)}>
                              {(sw.swType || "SW").slice(0, 2)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-[12px] font-medium text-text">{sw.name}</span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] font-mono text-text-tertiary">{sw.version || "—"}</span>
                                <span className="text-[10px] text-text-tertiary">· {sw.vendor || "—"}</span>
                              </div>
                            </div>
                            {canEdit && (
                              <div className="flex gap-0.5 opacity-0 group-hover/sw:opacity-100 transition-opacity shrink-0">
                                <button onClick={() => onEditSw(sw)} className="p-1 rounded text-text-tertiary hover:text-brand hover:bg-brand-lighter transition-colors"><Pencil size={10} /></button>
                                <button onClick={() => onDeleteSw(sw)} className="p-1 rounded text-text-tertiary hover:text-safety-high hover:bg-risk-bg transition-colors"><Trash2 size={10} /></button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* SW 추가는 SBOM 탭에서 업로드 */}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ── Audit Runs (보안 점검 결과) ───────────────────────────── */}
        {equipmentId && (
          <>
            <div className="h-px bg-border mx-5" />
            <div className="px-5 py-4">
              <button onClick={() => setAuditOpen(!auditOpen)} className="flex items-center justify-between w-full">
                <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider flex items-center gap-1.5">
                  <Shield size={11} className="text-brand" />
                  {tx(locale, "Audit Runs", "보안 점검 결과", "セキュリティ監査結果")}
                  <span className="font-mono text-[10px] tabular-nums text-text-tertiary">({auditRuns.length})</span>
                </p>
                <ChevronDown size={14} className={cn("text-text-tertiary transition-transform", auditOpen && "rotate-180")} />
              </button>
              <AnimatePresence initial={false}>
                {auditOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                    {auditLoading ? (
                      <div className="py-4 flex items-center justify-center gap-2 text-[11px] text-text-tertiary">
                        <div className="h-3 w-3 border-[1.5px] border-border border-t-brand rounded-full animate-spin" />
                        {tx(locale, "Loading…", "불러오는 중…", "読み込み中…")}
                      </div>
                    ) : auditRuns.length === 0 ? (
                      <div className="py-5 text-center">
                        <Shield size={18} className="mx-auto text-text-tertiary mb-1.5" />
                        <p className="text-[11px] text-text-tertiary">
                          {tx(locale, "No audit runs", "업로드된 점검 결과 없음", "アップロードされた監査結果なし")}
                        </p>
                        <p className="text-[10px] text-text-tertiary/70 mt-0.5">
                          {tx(locale, "Upload .scsaudit from the HW table", "HW 테이블에서 .scsaudit 업로드", "HWテーブルから.scsauditをアップロード")}
                        </p>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {auditRuns.map((run) => {
                          const e27 = buildE27(run.results);
                          const report = run.results as Parameters<typeof AuditResultViewer>[0]["report"];
                          const sysinfo = report?.SystemInfo || {};
                          const deviceName = (sysinfo.ComputerName as string) || hw.name;
                          const runDate = new Date(run.createdAt).toLocaleString(locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US", {
                            year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
                          });
                          return (
                            <AuditResultViewer
                              key={run.id}
                              e27={e27}
                              report={report}
                              cveMatches={hwCveMatches}
                              deviceName={deviceName}
                              runDate={runDate}
                            />
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      {canEdit && (
        <div className="border-t border-border px-5 py-3 flex items-center gap-2 shrink-0 bg-white">
          <button onClick={handleSave} disabled={saving || !dirty}
            className={cn("flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-[12px] font-semibold transition-colors",
              dirty ? "bg-brand text-white hover:bg-brand-hover" : "bg-surface-secondary text-text-tertiary cursor-not-allowed")}>
            <Save size={13} /> {saving ? tx(locale, "Saving...", "저장 중...", "保存中...") : tx(locale, "Save", "저장", "保存")}
          </button>
          <button onClick={onDelete} className="h-9 w-9 rounded-lg border border-red-200 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </>
  );
}

// ─── SBOM View ──────────────────────────────────────────────────────────────

function SbomView({ hardware, software, locale, projectId: _projectId, equipmentId: _equipmentId, onRefresh: _onRefresh, cveBySwId, cveByHwId }: {
  hardware: Hardware[];
  software: Software[];
  locale: string;
  projectId?: string;
  equipmentId?: string | null;
  onRefresh?: () => void;
  cveBySwId: Map<string, SeverityCounts>;
  cveByHwId: Map<string, SeverityCounts>;
}) {
  const grouped = hardware.map((hw) => ({ hw, sw: software.filter((s) => s.hardwareId === hw.id) }));
  const unlinked = software.filter((s) => !s.hardwareId);

  // Aggregate SW-level CVE counts per HW when HW has no direct CVE match
  // (ensures the HW card header meter reflects software-side vulnerabilities too).
  const effectiveHwCve = (hw: Hardware, swList: Software[]): SeverityCounts => {
    const direct = cveByHwId.get(hw.id);
    const agg = direct ? { ...direct } : emptySeverity();
    for (const s of swList) {
      const c = cveBySwId.get(s.id);
      if (!c) continue;
      agg.total += c.total;
      agg.critical += c.critical;
      agg.high += c.high;
      agg.medium += c.medium;
      agg.low += c.low;
      agg.unknown += c.unknown;
    }
    return agg;
  };

  return (
    <div className="space-y-3">
      {hardware.length === 0 && software.length === 0 && (
        <EmptyState
          icon={Package}
          title={tx(locale, "No SBOM data", "SBOM 데이터가 없습니다", "SBOMデータがありません")}
          subtitle={tx(locale, "Software BOM information is displayed after asset registration.", "자산 등록 시 입력한 소프트웨어 구성목록이 표시됩니다.", "資産登録後、ソフトウェア構成リストが表示されます。")}
        />
      )}
      {grouped.map(({ hw, sw }, idx) => {
        const hwCve = effectiveHwCve(hw, sw);
        return (
          <motion.div
            key={hw.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: Math.min(idx * 0.03, 0.15) }}
          >
            <Card padding="none">
              <div className="px-4 py-3 border-b border-border bg-surface-secondary/30">
                <div className="flex items-center gap-2">
                  <Cpu size={14} className="text-brand" />
                  <p className="text-body-sm font-bold text-text truncate">{hw.name}</p>
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0", HW_TYPE_COLORS[hw.type] || "bg-gray-100 text-gray-600")}>
                    {HW_TYPES.find((t) => t.value === hw.type)?.label || hw.type}
                  </span>
                  <div className="ml-auto shrink-0">
                    <CveMeter counts={hwCve} locale={locale} />
                  </div>
                </div>
              </div>
              {sw.length === 0 ? (
                <div className="px-4 py-3 text-body-xs text-text-tertiary italic">{tx(locale, "No linked SW", "연결된 SW 없음", "リンクされたSWなし")}</div>
              ) : (
                <div className="divide-y divide-border/60">
                  {sw.map((s) => {
                    const swCve = cveBySwId.get(s.id);
                    return (
                      <div key={s.id} className="grid grid-cols-[1fr_auto] gap-x-3 items-center px-4 py-2.5 pl-10 group/row hover:bg-brand-lighter/20 transition-colors">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-body-sm text-text truncate">{s.name}</span>
                            {s.version && (
                              <span className="font-mono text-[10px] text-text bg-surface-secondary px-1.5 py-0.5 rounded border border-border/70 shrink-0">
                                {s.version}
                              </span>
                            )}
                            {s.vendor && <span className="text-[10px] text-text-tertiary truncate">· {s.vendor}</span>}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            {s.cpe ? (
                              <span className="cpe-chip" title={s.cpe}>{s.cpe}</span>
                            ) : (
                              <span className="cpe-chip cpe-chip--missing" title={tx(locale, "CPE required for CVE matching", "CVE 매칭에 CPE 필요", "CVEマッチングにCPEが必要")}>
                                {tx(locale, "no CPE", "CPE 없음", "CPEなし")}
                              </span>
                            )}
                            {s.listeningPort && (
                              <span className="font-mono text-[10px] text-text-tertiary">
                                <Globe size={9} className="inline mr-0.5 -mt-0.5" />{s.listeningPort}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {swCve && swCve.total > 0 && <CveBadge counts={swCve} />}
                          <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", SW_TYPE_COLORS[s.swType] || "bg-gray-100 text-gray-600")}>
                            {SW_TYPES.find((t) => t.value === s.swType)?.label || s.swType}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </motion.div>
        );
      })}
      {unlinked.length > 0 && (
        <Card padding="none">
          <div className="px-4 py-3 border-b border-border bg-surface-secondary/30 flex items-center gap-2">
            <AlertCircle size={13} className="text-safety-elevated" />
            <p className="text-body-sm font-bold text-text-tertiary">{tx(locale, "Unlinked SW", "미연결 SW", "未接続SW")}</p>
            <span className="font-mono text-[10px] text-text-tertiary tabular-nums">({unlinked.length})</span>
          </div>
          <div className="divide-y divide-border/60">
            {unlinked.map((s) => {
              const swCve = cveBySwId.get(s.id);
              return (
                <div key={s.id} className="grid grid-cols-[1fr_auto] gap-x-3 items-center px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-body-sm text-text truncate">{s.name}</span>
                      {s.version && <span className="font-mono text-[10px] text-text-tertiary">{s.version}</span>}
                    </div>
                    {s.cpe ? (
                      <span className="cpe-chip mt-1" title={s.cpe}>{s.cpe}</span>
                    ) : (
                      <span className="cpe-chip cpe-chip--missing mt-1">{tx(locale, "no CPE", "CPE 없음", "CPEなし")}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {swCve && swCve.total > 0 && <CveBadge counts={swCve} />}
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", SW_TYPE_COLORS[s.swType] || "bg-gray-100 text-gray-600")}>
                      {SW_TYPES.find((t) => t.value === s.swType)?.label || s.swType}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
