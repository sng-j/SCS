"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Upload, FileText, X, Plus, Trash2,
  ClipboardList, Cpu, ChevronDown, ChevronUp, Save,
  CheckCircle, FileCheck, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkflowSteps } from "@/components/ui/workflow-steps";
import { Card, CardBody } from "@/components/ui/card";
import { SkeletonTable } from "@/components/ui/skeleton";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface HwItem {
  id?: number;
  hwGroupId?: string | null;
  no: number;
  category: string;
  criteria: string;
  method: string;
}

interface HwGroup {
  id: string;
  label: string;
  hardwareIds: string; // JSON array
  hwItems: HwItem[];
}

interface FnItem {
  id?: number;
  softwareId?: string | null;
  softwareName?: string | null;
  section: string;
  no: number;
  category: string;
  criteria: string;
  method: string;
}

interface SwItem {
  id: string;
  name: string;
  version: string | null;
  swType: string;
}

interface TestProcedure {
  id: string;
  status: "MANUAL" | "UPLOADED";
  uploadedOrigName?: string | null;
  uploadedMimeType?: string | null;
  uploadedSize?: number | null;
  hwGroups: HwGroup[];
  hwItems: HwItem[];
  fnItems: FnItem[];
}

interface HwDevice {
  id: string;
  name: string;
  type: string;
}

// No default sections — user defines them

const ACCEPTED_MIME = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/pdf",
].join(",");

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TestProcPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const equipmentId = searchParams.get("equipmentId");
  const { data: session } = useSession();
  const { locale } = useLocaleStore();

  const userRole = (session?.user as { role?: string })?.role || "VENDOR";
  const canEdit = userRole === "VENDOR" || userRole === "ADMIN";

  const [tp, setTp] = useState<TestProcedure | null>(null);
  const [hardware, setHardware] = useState<HwDevice[]>([]);
  const [software, setSoftware] = useState<SwItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Local editable state
  const [hwGeneralItems, setHwGeneralItems] = useState<HwItem[]>([]);
  const [hwGroups, setHwGroups] = useState<HwGroup[]>([]);
  const [fnItems, setFnItems] = useState<FnItem[]>([]);

  const [activeSection, setActiveSection] = useState<"hw" | "fn">("hw");
  // HW group creation
  const [selectedHwIds, setSelectedHwIds] = useState<Set<string>>(new Set());
  const [activeHwType, setActiveHwType] = useState<string>("");
  const [newGroupLabel, setNewGroupLabel] = useState("");
  const [activeGroupId, setActiveGroupId] = useState<string>("");
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Persist the active group in the URL so a refresh keeps the same tab open
  // and users can bookmark / share a direct link to one group. Falls back to
  // the first group when nothing is selected yet so the detail panel is never
  // empty unless there really are no groups.
  useEffect(() => {
    if (activeGroupId) return;
    if (hwGroups.length === 0) return;
    const urlGroup = searchParams.get("group");
    const match = urlGroup ? hwGroups.find((g) => g.id === urlGroup) : null;
    setActiveGroupId(match ? match.id : hwGroups[0].id);
  }, [hwGroups, activeGroupId, searchParams]);

  // Keep the URL in sync with the selected tab. replaceState avoids polluting
  // the back-button stack — switching tabs shouldn't count as navigation.
  useEffect(() => {
    if (!activeGroupId) return;
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("group") !== activeGroupId) {
      params.set("group", activeGroupId);
      window.history.replaceState(null, "", `?${params.toString()}`);
    }
  }, [activeGroupId, searchParams]);
  // Per-SW sections: { swId: ["Section A", "Section B"] }
  const [fnSectionsMap, setFnSectionsMap] = useState<Record<string, string[]>>({});
  const [activeFnSection, setActiveFnSection] = useState<string>("");
  const [activeFnSwId, setActiveFnSwId] = useState<string>("");
  const [newSectionName, setNewSectionName] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Load data ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const eqParam = equipmentId ? `?equipmentId=${equipmentId}` : "";
      const [tpRes, hwRes, swRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/test-procedure${eqParam}`),
        fetch(`/api/projects/${projectId}/hardware${eqParam}`),
        fetch(`/api/projects/${projectId}/software${eqParam}`),
      ]);
      if (tpRes.ok) {
        const data: TestProcedure = await tpRes.json();
        setTp(data);
        setHwGroups(data.hwGroups || []);
        setHwGeneralItems(data.hwItems.filter(i => !i.hwGroupId));
        setFnItems(data.fnItems.length > 0 ? data.fnItems : []);
        // Build per-SW section map from saved items
        const map: Record<string, string[]> = {};
        data.fnItems.forEach(item => {
          const swKey = item.softwareId || "";
          if (!map[swKey]) map[swKey] = [];
          if (!map[swKey].includes(item.section)) map[swKey].push(item.section);
        });
        setFnSectionsMap(map);
      }
      if (hwRes.ok) setHardware(await hwRes.json());
      if (swRes.ok) setSoftware(await swRes.json());
    } finally {
      setLoading(false);
    }
  }, [projectId, equipmentId]);

  useEffect(() => { load(); }, [load]);

  // ── Upload ─────────────────────────────────────────────────────────────
  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (equipmentId) fd.append("equipmentId", equipmentId);
      const res = await fetch(`/api/projects/${projectId}/test-procedure/upload`, {
        method: "POST",
        body: fd,
      });
      if (res.ok) {
        showToast.success(tx(locale, "Document uploaded", "문서 업로드 완료", "文書アップロード完了"));
        await load();
      } else {
        showToast.error(tx(locale, "Upload failed", "업로드 실패", "アップロード失敗"));
      }
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleUpload(f);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleUpload(f);
  };

  const handleRemoveUpload = async () => {
    const eqParam = equipmentId ? `?equipmentId=${equipmentId}` : "";
    const res = await fetch(`/api/projects/${projectId}/test-procedure/upload${eqParam}`, {
      method: "DELETE",
    });
    if (res.ok) {
      showToast.success(tx(locale, "Removed", "파일 제거됨", "ファイル削除済み"));
      await load();
    }
  };

  // ── HW General (common) item helpers ─────────────────────────────────────
  const saveGeneralItems = async () => {
    if (!tp) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/test-procedure/hw-items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testProcId: tp.id, hwGroupId: "__general__", items: hwGeneralItems.map((item, i) => ({ ...item, sortOrder: i })) }),
      });
      if (res.ok) showToast.success(tx(locale, "Saved", "저장됨", "保存済み"));
      else showToast.error(tx(locale, "Save failed", "저장 실패", "保存失敗"));
    } finally {
      setSaving(false);
    }
  };

  const addGeneralRow = () => {
    setHwGeneralItems(prev => [...prev, { no: prev.length + 1, category: "", criteria: "", method: "" }]);
  };

  const updateGeneralItem = (idx: number, field: string, value: string) => {
    setHwGeneralItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const removeGeneralItem = (idx: number) => {
    setHwGeneralItems(prev => prev.filter((_, i) => i !== idx));
  };

  // ── HW Group helpers ────────────────────────────────────────────────────
  const createHwGroup = async () => {
    if (!tp || !newGroupLabel.trim() || selectedHwIds.size === 0) return;
    setCreatingGroup(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/test-procedure/hw-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testProcId: tp.id, label: newGroupLabel.trim(), hardwareIds: [...selectedHwIds] }),
      });
      if (res.ok) {
        const group: HwGroup = await res.json();
        setHwGroups(prev => [...prev, group]);
        setActiveGroupId(group.id);
        setNewGroupLabel("");
        setSelectedHwIds(new Set());
        showToast.success(tx(locale, "Group created", "그룹 생성됨", "グループ作成済み"));
      }
    } finally {
      setCreatingGroup(false);
    }
  };

  const deleteHwGroup = async (groupId: string) => {
    const res = await fetch(`/api/projects/${projectId}/test-procedure/hw-groups?groupId=${groupId}`, { method: "DELETE" });
    if (res.ok) {
      setHwGroups(prev => prev.filter(g => g.id !== groupId));
      if (activeGroupId === groupId) setActiveGroupId("");
      showToast.success(tx(locale, "Group deleted", "그룹 삭제됨", "グループ削除済み"));
    }
  };

  const saveGroupItems = async (groupId: string) => {
    if (!tp) return;
    const group = hwGroups.find(g => g.id === groupId);
    if (!group) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/test-procedure/hw-items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testProcId: tp.id, hwGroupId: groupId, items: group.hwItems.map((item, i) => ({ ...item, sortOrder: i })) }),
      });
      if (res.ok) showToast.success(tx(locale, "Saved", "저장됨", "保存済み"));
      else showToast.error(tx(locale, "Save failed", "저장 실패", "保存失敗"));
    } finally {
      setSaving(false);
    }
  };

  const addGroupHwRow = (groupId: string) => {
    setHwGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      return { ...g, hwItems: [...g.hwItems, { hwGroupId: groupId, no: g.hwItems.length + 1, category: "", criteria: "", method: "" }] };
    }));
  };

  const updateGroupHwItem = (groupId: string, idx: number, field: string, value: string) => {
    setHwGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      return { ...g, hwItems: g.hwItems.map((item, i) => i === idx ? { ...item, [field]: value } : item) };
    }));
  };

  const removeGroupHwItem = (groupId: string, idx: number) => {
    setHwGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      return { ...g, hwItems: g.hwItems.filter((_, i) => i !== idx) };
    }));
  };

  // ── Save FN items ──────────────────────────────────────────────────────
  const saveFnItems = async () => {
    if (!tp) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/test-procedure/fn-items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testProcId: tp.id, items: fnItems.map((item, i) => ({ ...item, sortOrder: i })) }),
      });
      if (res.ok) showToast.success(tx(locale, "Saved", "저장됨", "保存済み"));
      else showToast.error(tx(locale, "Save failed", "저장 실패", "保存失敗"));
    } finally {
      setSaving(false);
    }
  };

  // ── FN row helpers ─────────────────────────────────────────────────────
  const addFnRow = (section: string, swId?: string, swName?: string) => {
    const sectionItems = fnItems.filter(i => i.section === section && (swId ? i.softwareId === swId : !i.softwareId));
    setFnItems(prev => [...prev, {
      softwareId: swId ?? null,
      softwareName: swName ?? null,
      section,
      no: sectionItems.length + 1,
      category: "",
      criteria: "",
      method: "",
    }]);
  };

  const updateFnItem = (idx: number, field: keyof FnItem, value: string | number) => {
    setFnItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const removeFnItem = (idx: number) => {
    setFnItems(prev => prev.filter((_, i) => i !== idx));
  };

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) return (
    <div>
      <WorkflowSteps currentSegment="testproc" projectId={projectId} equipmentId={equipmentId} />
      <div className="max-w-[1400px] mx-auto px-6 py-8"><SkeletonTable rows={6} /></div>
    </div>
  );

  const isUploaded = tp?.status === "UPLOADED";

  // Active HW group
  const activeGroup = hwGroups.find(g => g.id === activeGroupId);
  // HW IDs already assigned to any group (to show in checkbox list)
  const assignedHwIds = new Set(hwGroups.flatMap(g => { try { return JSON.parse(g.hardwareIds) as string[]; } catch { return []; } }));

  // Current SW + sections for that SW
  const activeSw = software.find(s => s.id === activeFnSwId);
  const currentSwSections = activeFnSwId ? (fnSectionsMap[activeFnSwId] || []) : [];

  // Filtered fn items: current SW + current section
  const fnFilteredIndices = fnItems.reduce<number[]>((acc, item, idx) => {
    if (item.softwareId !== activeFnSwId) return acc;
    if (item.section !== activeFnSection) return acc;
    acc.push(idx);
    return acc;
  }, []);

  return (
    <div>
      <WorkflowSteps currentSegment="testproc" projectId={projectId} equipmentId={equipmentId} />
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>

          {/* Back */}
          <Link
            href={equipmentId ? `/project/${projectId}/equipment/${equipmentId}` : `/project/${projectId}`}
            className="inline-flex items-center gap-1 text-body-xs text-text-tertiary hover:text-brand transition-colors mb-6"
          >
            <ArrowLeft size={14} />
            {equipmentId ? tx(locale, "Equipment", "기자재", "機器") : tx(locale, "Project", "프로젝트", "プロジェクト")}
          </Link>

          {/* Header */}
          <div className="flex items-start justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-50 to-violet-100 border border-violet-200/60 flex items-center justify-center shadow-xs">
                <ClipboardList size={22} className="text-violet-600" />
              </div>
              <div>
                <h1 className="text-h4 font-extrabold text-text tracking-tight">
                  {tx(locale, "Test Procedure", "테스트 절차", "テスト手順")}
                </h1>
                <p className="text-body-sm text-text-tertiary mt-0.5">
                  {tx(locale,
                    "Upload an existing test document or enter test items manually",
                    "기존 테스트 문서를 업로드하거나 항목을 직접 입력하세요",
                    "既存のテスト文書をアップロードするか、項目を直接入力してください"
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* ── Upload Zone ─────────────────────────────────────────── */}
          <div className="mb-8">
            <p className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider mb-3">
              {tx(locale, "Document Upload (Optional)", "문서 업로드 (선택)", "文書アップロード（任意）")}
            </p>

            {isUploaded && tp ? (
              /* 업로드 완료 배너 */
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-4 p-4 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-purple-50/60"
              >
                <div className="h-12 w-12 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                  <FileCheck size={22} className="text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-violet-800 truncate">{tp.uploadedOrigName}</p>
                  <p className="text-[11px] text-violet-600 mt-0.5 flex items-center gap-2">
                    <CheckCircle size={11} />
                    {tx(locale, "Document uploaded — manual entry disabled", "문서 업로드 완료 — 직접 입력 비활성화", "文書アップロード済み — 手動入力無効")}
                    {tp.uploadedSize && <span>· {formatBytes(tp.uploadedSize)}</span>}
                  </p>
                </div>
                {canEdit && (
                  <button
                    onClick={handleRemoveUpload}
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-violet-400 hover:text-safety-high hover:bg-risk-bg transition-all"
                    title={tx(locale, "Remove file", "파일 제거", "ファイル削除")}
                  >
                    <X size={15} />
                  </button>
                )}
              </motion.div>
            ) : canEdit ? (
              /* 드래그 앤 드롭 업로드 존 */
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200",
                  isDragging
                    ? "border-violet-400 bg-violet-50 scale-[1.01]"
                    : "border-border hover:border-violet-300 hover:bg-violet-50/40"
                )}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPTED_MIME}
                  className="hidden"
                  onChange={handleFileChange}
                />
                {uploading ? (
                  <div className="h-8 w-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <div className="h-12 w-12 rounded-2xl bg-violet-50 border border-violet-200 flex items-center justify-center">
                    <Upload size={22} className="text-violet-500" />
                  </div>
                )}
                <div className="text-center">
                  <p className="text-[13px] font-semibold text-text">
                    {uploading
                      ? tx(locale, "Uploading...", "업로드 중...", "アップロード中...")
                      : tx(locale, "Drop file here or click to browse", "파일을 드래그하거나 클릭하여 업로드", "ファイルをドラッグするかクリックしてアップロード")
                    }
                  </p>
                  <p className="text-[11px] text-text-tertiary mt-1">
                    Word (.doc, .docx) · PowerPoint (.ppt, .pptx) · PDF
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-dashed border-border bg-surface-secondary/40 text-center">
                <p className="text-[12px] text-text-tertiary">
                  {tx(locale, "No document uploaded", "업로드된 문서 없음", "文書未アップロード")}
                </p>
              </div>
            )}
          </div>

          {/* ── Manual Entry (업로드 없을 때만) ─────────────────────── */}
          {!isUploaded && (
            <>
              {/* Section Tabs */}
              <div className="flex gap-0.5 p-1 rounded-xl bg-surface-secondary border border-border w-fit mb-6 shadow-xs">
                {[
                  { id: "hw" as const, icon: Cpu, label: tx(locale, "Hardware Inspection", "하드웨어 점검", "ハードウェア点検") },
                  { id: "fn" as const, icon: ClipboardList, label: tx(locale, "Function Inspection", "기능 점검", "機能点検") },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveSection(tab.id)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-[13px] font-semibold transition-all duration-200 flex items-center gap-2",
                      activeSection === tab.id
                        ? "bg-white text-text shadow-sm border border-border/60"
                        : "text-text-tertiary hover:text-text-secondary hover:bg-white/50"
                    )}
                  >
                    <tab.icon size={14} className={activeSection === tab.id ? "text-violet-500" : ""} />
                    {tab.label}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {/* ── Section 1: Hardware Inspection ─────────────── */}
                {activeSection === "hw" && (
                  <motion.div
                    key="hw"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-[15px] font-bold text-text">
                          {tx(locale, "Hardware Function & Operation Inspection", "하드웨어 기능 및 동작 점검", "ハードウェア機能・動作点検")}
                        </h2>
                        <p className="text-[12px] text-text-tertiary mt-0.5">
                          {tx(locale, "Select hardware to create a group, then enter inspection items", "하드웨어를 선택하여 그룹을 생성한 후 점검 항목을 입력하세요", "ハードウェアを選択してグループを作成し、点検項目を入力してください")}
                        </p>
                      </div>
                    </div>

                    {/* ── 그룹 생성: 2-column type picker ──────────── */}
                    {canEdit && hardware.length > 0 && (() => {
                      // Group hardware by type
                      const hwByType: Record<string, HwDevice[]> = {};
                      hardware.forEach(hw => {
                        if (!hwByType[hw.type]) hwByType[hw.type] = [];
                        hwByType[hw.type].push(hw);
                      });
                      const types = Object.keys(hwByType);
                      const currentType = activeHwType || types[0] || "";
                      const typeItems = hwByType[currentType] || [];

                      return (
                        <div className="mb-6 rounded-xl border border-border overflow-hidden shadow-xs">
                          {/* 2-column picker */}
                          <div className="flex" style={{ minHeight: 180 }}>
                            {/* 좌측: 타입 카테고리 */}
                            <div className="w-[180px] shrink-0 border-r border-border bg-surface-secondary/40 overflow-y-auto">
                              {types.map(type => {
                                const count = hwByType[type].length;
                                const selectedInType = hwByType[type].filter(h => selectedHwIds.has(h.id)).length;
                                return (
                                  <button
                                    key={type}
                                    onClick={() => setActiveHwType(type)}
                                    className={cn(
                                      "w-full text-left px-4 py-2.5 text-[13px] transition-all border-l-2 flex items-center justify-between",
                                      currentType === type
                                        ? "bg-white border-l-violet-600 text-violet-700 font-bold"
                                        : "border-l-transparent text-text-secondary hover:bg-white/60 hover:text-text"
                                    )}
                                  >
                                    <span>{type}</span>
                                    <span className="flex items-center gap-1">
                                      {selectedInType > 0 && (
                                        <span className="text-[10px] font-bold text-violet-600 bg-violet-100 rounded-full px-1.5">{selectedInType}</span>
                                      )}
                                      <span className="text-[11px] text-text-tertiary">({count})</span>
                                    </span>
                                  </button>
                                );
                              })}
                            </div>

                            {/* 우측: 해당 타입의 HW 목록 */}
                            <div className="flex-1 overflow-y-auto p-1">
                              <div className="grid grid-cols-2 lg:grid-cols-3 gap-0.5">
                                {typeItems.map(hw => {
                                  const checked = selectedHwIds.has(hw.id);
                                  const alreadyUsed = assignedHwIds.has(hw.id);
                                  return (
                                    <button
                                      key={hw.id}
                                      onClick={() => {
                                        setSelectedHwIds(prev => {
                                          const next = new Set(prev);
                                          if (next.has(hw.id)) next.delete(hw.id); else next.add(hw.id);
                                          return next;
                                        });
                                      }}
                                      className={cn(
                                        "text-left px-3 py-2 rounded-lg text-[13px] transition-all",
                                        checked
                                          ? "text-violet-700 font-bold bg-violet-50"
                                          : "text-text-secondary hover:bg-surface-secondary/60"
                                      )}
                                    >
                                      {hw.name}
                                      {alreadyUsed && !checked && (
                                        <span className="ml-1 text-[10px] text-text-tertiary">{tx(locale, "(grouped)", "(그룹)", "(グループ)")}</span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          {/* 하단: 선택된 태그 + 그룹명 입력 + 생성 버튼 */}
                          <div className="border-t border-border bg-surface-secondary/30 px-4 py-3">
                            {selectedHwIds.size === 0 ? (
                              <p className="text-[12px] text-text-tertiary">
                                {tx(locale, "Select hardware items to create a group", "그룹을 생성할 하드웨어를 선택하세요", "グループを作成するハードウェアを選択してください")}
                              </p>
                            ) : (
                              <>
                                {/* 선택된 항목 태그 */}
                                <div className="flex flex-wrap gap-1.5 mb-3">
                                  {[...selectedHwIds].map(id => {
                                    const hw = hardware.find(h => h.id === id);
                                    if (!hw) return null;
                                    return (
                                      <span
                                        key={id}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-violet-100 border border-violet-200 text-[12px] text-violet-700 font-medium"
                                      >
                                        {hw.type} &gt; {hw.name}
                                        <button
                                          onClick={() => setSelectedHwIds(prev => { const n = new Set(prev); n.delete(id); return n; })}
                                          className="ml-0.5 text-violet-400 hover:text-violet-700 transition-colors"
                                        >
                                          <X size={11} />
                                        </button>
                                      </span>
                                    );
                                  })}
                                </div>
                                {/* 그룹명 + 생성 */}
                                <div className="flex items-center gap-2">
                                  <input
                                    value={newGroupLabel}
                                    onChange={(e) => setNewGroupLabel(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") createHwGroup(); }}
                                    placeholder={tx(locale, "Group name (e.g. VoIP Group A)", "그룹 이름 (예: VoIP 그룹 A)", "グループ名")}
                                    className="flex-1 max-w-[280px] rounded-lg border border-border bg-white px-3 py-2 text-[13px] text-text placeholder:text-text-tertiary/50 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 transition-all"
                                  />
                                  <button
                                    onClick={() => { setSelectedHwIds(new Set()); setNewGroupLabel(""); }}
                                    className="px-3 py-2 rounded-lg text-[12px] text-text-tertiary hover:text-text border border-border hover:bg-white transition-all"
                                  >
                                    {tx(locale, "Reset", "초기화", "リセット")}
                                  </button>
                                  <button
                                    onClick={createHwGroup}
                                    disabled={!newGroupLabel.trim() || creatingGroup}
                                    className="px-5 py-2 rounded-lg bg-violet-600 text-white text-[13px] font-semibold hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs"
                                  >
                                    {tx(locale, "Create Group", "그룹 생성", "グループ作成")}
                                    <span className="ml-1 text-violet-200">({selectedHwIds.size})</span>
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {hardware.length === 0 && (
                      <Card padding="none">
                        <CardBody>
                          <div className="flex flex-col items-center gap-2 py-8 text-center">
                            <AlertCircle size={32} className="text-text-tertiary/40" />
                            <p className="text-[13px] text-text-tertiary">
                              {tx(locale, "No hardware registered. Add hardware in Inventory first.", "등록된 하드웨어가 없습니다. 인벤토리에서 먼저 등록하세요.", "ハードウェアが登録されていません。")}
                            </p>
                          </div>
                        </CardBody>
                      </Card>
                    )}

                    {/* ── 공통 테스트 항목 (항상 최상단) ────────────── */}
                    <Card padding="none" className="mb-6">
                      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-surface-secondary/50">
                        <FileText size={14} className="text-text-tertiary" />
                        <p className="text-[13px] font-bold text-text flex-1">
                          {tx(locale, "General Test Items", "공통 테스트 항목", "共通テスト項目")}
                        </p>
                        {canEdit && (
                          <Button size="sm" onClick={saveGeneralItems} loading={saving}>
                            <Save size={14} /> {tx(locale, "Save", "저장", "保存")}
                          </Button>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="border-b border-border bg-surface-secondary/30">
                              <th className="text-left px-4 py-2.5 font-bold text-text-tertiary w-12">NO</th>
                              <th className="text-left px-4 py-2.5 font-bold text-text-tertiary w-[22%]">{tx(locale, "CATEGORY", "분류", "カテゴリー")}</th>
                              <th className="text-left px-4 py-2.5 font-bold text-text-tertiary w-[30%]">{tx(locale, "CRITERIA", "기준", "基準")}</th>
                              <th className="text-left px-4 py-2.5 font-bold text-text-tertiary">{tx(locale, "METHOD", "방법", "方法")}</th>
                              {canEdit && <th className="w-10" />}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60">
                            {hwGeneralItems.length === 0 ? (
                              <tr>
                                <td colSpan={canEdit ? 5 : 4} className="px-4 py-5 text-center text-[12px] text-text-tertiary">
                                  {tx(locale, "No common items. Click + to add.", "공통 항목 없음. + 버튼으로 추가하세요.", "共通項目なし。")}
                                </td>
                              </tr>
                            ) : (
                              hwGeneralItems.map((row, i) => (
                                <tr key={i} className="group hover:bg-surface-secondary/30 transition-colors">
                                  <td className="px-4 py-2 text-text-tertiary font-mono text-[11px] align-top pt-3">{i + 1}</td>
                                  <td className="px-4 py-2 align-top">
                                    {canEdit ? (
                                      <input value={row.category} onChange={(e) => updateGeneralItem(i, "category", e.target.value)} placeholder={tx(locale, "e.g. imaging device", "예: 이미지 센서", "例: 撮像素子")} className="w-full rounded-md border border-transparent px-2 py-1.5 text-[12px] text-text placeholder:text-border-strong focus:outline-none focus:border-brand focus:bg-white focus:ring-1 focus:ring-brand/20 bg-transparent transition-all" />
                                    ) : <span className="text-text-secondary">{row.category || "—"}</span>}
                                  </td>
                                  <td className="px-4 py-2 align-top">
                                    {canEdit ? (
                                      <textarea value={row.criteria} onChange={(e) => updateGeneralItem(i, "criteria", e.target.value)} placeholder={tx(locale, "e.g. CMOS", "예: CMOS", "例: CMOS")} rows={2} className="w-full rounded-md border border-transparent px-2 py-1.5 text-[12px] text-text placeholder:text-border-strong focus:outline-none focus:border-brand focus:bg-white focus:ring-1 focus:ring-brand/20 bg-transparent resize-none transition-all" />
                                    ) : <span className="text-text-secondary whitespace-pre-wrap">{row.criteria || "—"}</span>}
                                  </td>
                                  <td className="px-4 py-2 align-top">
                                    {canEdit ? (
                                      <textarea value={row.method} onChange={(e) => updateGeneralItem(i, "method", e.target.value)} placeholder={tx(locale, "e.g. Manufacturer's Specifications", "예: 제조사 사양서", "例: 製造者仕様書")} rows={2} className="w-full rounded-md border border-transparent px-2 py-1.5 text-[12px] text-text placeholder:text-border-strong focus:outline-none focus:border-brand focus:bg-white focus:ring-1 focus:ring-brand/20 bg-transparent resize-none transition-all" />
                                    ) : <span className="text-text-secondary whitespace-pre-wrap">{row.method || "—"}</span>}
                                  </td>
                                  {canEdit && (
                                    <td className="px-2 py-2 align-top pt-3">
                                      <button onClick={() => removeGeneralItem(i)} className="h-6 w-6 rounded flex items-center justify-center text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-safety-high hover:bg-risk-bg transition-all"><Trash2 size={12} /></button>
                                    </td>
                                  )}
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                      {canEdit && (
                        <div className="border-t border-border/60 px-4 py-2">
                          <button onClick={addGeneralRow} className="flex items-center gap-1.5 text-[12px] font-semibold text-brand hover:text-brand-hover transition-colors px-2 py-1 rounded hover:bg-brand-lighter/50">
                            <Plus size={13} /> {tx(locale, "Add item", "항목 추가", "項目追加")}
                          </button>
                        </div>
                      )}
                    </Card>

                    {/* ── 생성된 그룹 목록 + 항목 입력 ─────────────── */}
                    {hwGroups.length > 0 && (
                      <>
                        {/* 그룹 탭 */}
                        <div className="flex gap-1.5 flex-wrap items-center mb-5">
                          {hwGroups.map((grp) => {
                            const memberIds: string[] = (() => { try { return JSON.parse(grp.hardwareIds); } catch { return []; } })();
                            const memberNames = hardware.filter(h => memberIds.includes(h.id)).map(h => h.name);
                            return (
                              <div key={grp.id} className="relative group/grp flex items-center">
                                <button
                                  onClick={() => setActiveGroupId(grp.id)}
                                  title={memberNames.length > 0 ? memberNames.join(", ") : undefined}
                                  className={cn(
                                    "px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all border",
                                    activeGroupId === grp.id
                                      ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                                      : "text-text-tertiary border-border hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50/50"
                                  )}
                                >
                                  {grp.label}
                                  <span className={cn(
                                    "ml-1.5 px-1.5 rounded-full text-[9px] font-bold",
                                    activeGroupId === grp.id ? "bg-white/20 text-white" : "bg-surface-secondary text-text-tertiary"
                                  )}>{memberIds.length}</span>
                                  {grp.hwItems.length > 0 && (
                                    <span className={cn(
                                      "ml-1 px-1.5 rounded-full text-[9px] font-bold",
                                      activeGroupId === grp.id ? "bg-white/30 text-white" : "bg-violet-100 text-violet-600"
                                    )}>{grp.hwItems.length}{tx(locale, " items", "건", "件")}</span>
                                  )}
                                </button>
                                {canEdit && (
                                  <button
                                    onClick={() => deleteHwGroup(grp.id)}
                                    className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-white border border-border shadow-xs flex items-center justify-center opacity-0 group-hover/grp:opacity-100 hover:bg-red-50 hover:border-red-300 transition-all z-10"
                                    title={tx(locale, "Delete group", "그룹 삭제", "グループ削除")}
                                  >
                                    <X size={8} className="text-text-tertiary hover:text-red-500" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* 선택된 그룹의 상세 + 항목 테이블 */}
                        {activeGroup && (() => {
                          const memberIds: string[] = (() => { try { return JSON.parse(activeGroup.hardwareIds); } catch { return []; } })();
                          const members = hardware.filter(h => memberIds.includes(h.id));
                          return (
                            <Card padding="none">
                              {/* 그룹 헤더 — 소속 기기 이름을 칩으로 노출해서 어느 HW가 묶였는지 한눈에 보이게 함.
                                  칩 개수가 많아지면 +N 처리하고, 전체 이름은 title 툴팁으로 폴백. */}
                              <div className="flex items-start gap-3 px-5 py-3 border-b border-border bg-surface-secondary/50">
                                <div className="h-7 w-7 rounded-md bg-violet-50 border border-violet-200 flex items-center justify-center shrink-0">
                                  <Cpu size={13} className="text-violet-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[13px] font-bold text-text">
                                    {activeGroup.label}
                                    <span className="ml-2 text-[11px] font-medium text-text-tertiary">
                                      {tx(locale, `${members.length} devices`, `${members.length}개 기기`, `${members.length}台`)}
                                    </span>
                                  </p>
                                  {members.length > 0 && (() => {
                                    const MAX_CHIPS = 3;
                                    const shown = members.slice(0, MAX_CHIPS);
                                    const hidden = members.slice(MAX_CHIPS);
                                    return (
                                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                                        {shown.map((m) => (
                                          <span
                                            key={m.id}
                                            title={m.name}
                                            className="inline-flex max-w-[220px] items-center rounded-md border border-violet-200 bg-white px-2 py-0.5 text-[11px] font-medium text-violet-700 truncate"
                                          >
                                            {m.name}
                                          </span>
                                        ))}
                                        {hidden.length > 0 && (
                                          <span
                                            title={hidden.map((m) => m.name).join(", ")}
                                            className="inline-flex items-center rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 cursor-help"
                                          >
                                            +{hidden.length}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                                {canEdit && (
                                  <Button size="sm" onClick={() => saveGroupItems(activeGroup.id)} loading={saving}>
                                    <Save size={14} /> {tx(locale, "Save", "저장", "保存")}
                                  </Button>
                                )}
                              </div>

                              {/* 항목 테이블 */}
                              <div className="overflow-x-auto">
                                <table className="w-full text-[12px]">
                                  <thead>
                                    <tr className="border-b border-border bg-surface-secondary/30">
                                      <th className="text-left px-4 py-2.5 font-bold text-text-tertiary w-12">NO</th>
                                      <th className="text-left px-4 py-2.5 font-bold text-text-tertiary w-[22%]">{tx(locale, "CATEGORY", "분류", "カテゴリー")}</th>
                                      <th className="text-left px-4 py-2.5 font-bold text-text-tertiary w-[30%]">{tx(locale, "CRITERIA", "기준", "基準")}</th>
                                      <th className="text-left px-4 py-2.5 font-bold text-text-tertiary">{tx(locale, "METHOD", "방법", "方法")}</th>
                                      {canEdit && <th className="w-10" />}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border/60">
                                    {activeGroup.hwItems.length === 0 ? (
                                      <tr>
                                        <td colSpan={canEdit ? 5 : 4} className="px-4 py-5 text-center text-[12px] text-text-tertiary">
                                          {tx(locale, "No items. Click + to add.", "항목 없음. + 버튼으로 추가하세요.", "項目なし。")}
                                        </td>
                                      </tr>
                                    ) : (
                                      activeGroup.hwItems.map((row, i) => (
                                        <tr key={i} className="group hover:bg-surface-secondary/30 transition-colors">
                                          <td className="px-4 py-2 text-text-tertiary font-mono text-[11px] align-top pt-3">{i + 1}</td>
                                          <td className="px-4 py-2 align-top">
                                            {canEdit ? (
                                              <input
                                                value={row.category}
                                                onChange={(e) => updateGroupHwItem(activeGroup.id, i, "category", e.target.value)}
                                                placeholder={tx(locale, "e.g. imaging device", "예: 이미지 센서", "例: 撮像素子")}
                                                className="w-full rounded-md border border-transparent px-2 py-1.5 text-[12px] text-text placeholder:text-border-strong focus:outline-none focus:border-brand focus:bg-white focus:ring-1 focus:ring-brand/20 bg-transparent transition-all"
                                              />
                                            ) : <span className="text-text-secondary">{row.category || "—"}</span>}
                                          </td>
                                          <td className="px-4 py-2 align-top">
                                            {canEdit ? (
                                              <textarea
                                                value={row.criteria}
                                                onChange={(e) => updateGroupHwItem(activeGroup.id, i, "criteria", e.target.value)}
                                                placeholder={tx(locale, "e.g. CMOS", "예: CMOS", "例: CMOS")}
                                                rows={2}
                                                className="w-full rounded-md border border-transparent px-2 py-1.5 text-[12px] text-text placeholder:text-border-strong focus:outline-none focus:border-brand focus:bg-white focus:ring-1 focus:ring-brand/20 bg-transparent resize-none transition-all"
                                              />
                                            ) : <span className="text-text-secondary whitespace-pre-wrap">{row.criteria || "—"}</span>}
                                          </td>
                                          <td className="px-4 py-2 align-top">
                                            {canEdit ? (
                                              <textarea
                                                value={row.method}
                                                onChange={(e) => updateGroupHwItem(activeGroup.id, i, "method", e.target.value)}
                                                placeholder={tx(locale, "e.g. Manufacturer's Specifications", "예: 제조사 사양서", "例: 製造者仕様書")}
                                                rows={2}
                                                className="w-full rounded-md border border-transparent px-2 py-1.5 text-[12px] text-text placeholder:text-border-strong focus:outline-none focus:border-brand focus:bg-white focus:ring-1 focus:ring-brand/20 bg-transparent resize-none transition-all"
                                              />
                                            ) : <span className="text-text-secondary whitespace-pre-wrap">{row.method || "—"}</span>}
                                          </td>
                                          {canEdit && (
                                            <td className="px-2 py-2 align-top pt-3">
                                              <button
                                                onClick={() => removeGroupHwItem(activeGroup.id, i)}
                                                className="h-6 w-6 rounded flex items-center justify-center text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-safety-high hover:bg-risk-bg transition-all"
                                              >
                                                <Trash2 size={12} />
                                              </button>
                                            </td>
                                          )}
                                        </tr>
                                      ))
                                    )}
                                  </tbody>
                                </table>
                              </div>
                              {canEdit && (
                                <div className="border-t border-border/60 px-4 py-2">
                                  <button
                                    onClick={() => addGroupHwRow(activeGroup.id)}
                                    className="flex items-center gap-1.5 text-[12px] font-semibold text-brand hover:text-brand-hover transition-colors px-2 py-1 rounded hover:bg-brand-lighter/50"
                                  >
                                    <Plus size={13} /> {tx(locale, "Add item", "항목 추가", "項目追加")}
                                  </button>
                                </div>
                              )}
                            </Card>
                          );
                        })()}
                      </>
                    )}

                    {hwGroups.length === 0 && hardware.length > 0 && (
                      <Card padding="none">
                        <CardBody>
                          <div className="flex flex-col items-center gap-3 py-10 text-center">
                            <Cpu size={28} className="text-text-tertiary/40" />
                            <p className="text-[13px] text-text-tertiary">
                              {tx(locale, "Select hardware above and create a group to start", "위에서 하드웨어를 선택하고 그룹을 생성하세요", "上でハードウェアを選択してグループを作成してください")}
                            </p>
                          </div>
                        </CardBody>
                      </Card>
                    )}
                  </motion.div>
                )}

                {/* ── Section 2: Function & Operation Inspection ──── */}
                {activeSection === "fn" && (
                  <motion.div
                    key="fn"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-[15px] font-bold text-text">
                          {tx(locale, "Function and Operation Inspection", "기능 및 동작 점검", "機能・動作点検")}
                        </h2>
                        <p className="text-[12px] text-text-tertiary mt-0.5">
                          {tx(locale, "Select software and enter inspection items per functional category", "소프트웨어를 선택하고 기능 카테고리별 점검 항목을 입력하세요", "ソフトウェアを選択し機能カテゴリごとに点検項目を入力してください")}
                        </p>
                      </div>
                      {canEdit && (
                        <Button size="sm" onClick={saveFnItems} loading={saving}>
                          <Save size={14} /> {tx(locale, "Save", "저장", "保存")}
                        </Button>
                      )}
                    </div>

                    {/* ── Step 1: SW 선택 ─────────────────────── */}
                    {software.length === 0 ? (
                      <Card padding="none">
                        <CardBody>
                          <div className="flex flex-col items-center gap-3 py-12 text-center">
                            <AlertCircle size={32} className="text-text-tertiary/40" />
                            <p className="text-[13px] text-text-tertiary">
                              {tx(locale, "No software registered. Add software in Inventory first.", "등록된 소프트웨어가 없습니다. 인벤토리에서 먼저 등록하세요.", "ソフトウェアが登録されていません。")}
                            </p>
                          </div>
                        </CardBody>
                      </Card>
                    ) : (
                    <>
                      <p className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider mb-2">
                        Step 1 — {tx(locale, "Select Software", "소프트웨어 선택", "ソフトウェア選択")}
                      </p>
                      <div className="flex items-center gap-3 mb-6">
                        <select
                          value={activeFnSwId}
                          onChange={(e) => {
                            const swId = e.target.value;
                            setActiveFnSwId(swId);
                            // 해당 SW의 첫 번째 섹션으로 이동
                            const sections = fnSectionsMap[swId] || [];
                            setActiveFnSection(sections[0] || "");
                          }}
                          className="rounded-lg border border-border bg-white px-3 py-2 text-[13px] text-text font-medium shadow-xs focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/20 transition-all min-w-[280px]"
                        >
                          <option value="">{tx(locale, "— Select software —", "— 소프트웨어 선택 —", "— ソフトウェア選択 —")}</option>
                          {software.map((sw) => {
                            const cnt = fnItems.filter(i => i.softwareId === sw.id).length;
                            return (
                              <option key={sw.id} value={sw.id}>
                                {sw.name}{sw.version ? ` (${sw.version})` : ""} — {sw.swType}{cnt > 0 ? ` [${cnt}]` : ""}
                              </option>
                            );
                          })}
                        </select>
                        {activeSw && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-violet-50 border border-violet-200 text-violet-700">
                            {activeSw.swType}
                          </span>
                        )}
                      </div>

                      {/* SW 미선택 안내 */}
                      {!activeFnSwId && (
                        <Card padding="none">
                          <CardBody>
                            <div className="flex flex-col items-center gap-3 py-10 text-center">
                              <div className="h-12 w-12 rounded-2xl bg-violet-50 border border-violet-200 flex items-center justify-center">
                                <ClipboardList size={22} className="text-violet-400" />
                              </div>
                              <p className="text-[13px] text-text-tertiary">
                                {tx(locale, "Select a software above to manage inspection sections and items", "위에서 소프트웨어를 선택하여 점검 섹션과 항목을 관리하세요", "上でソフトウェアを選択してセクションと項目を管理してください")}
                              </p>
                            </div>
                          </CardBody>
                        </Card>
                      )}

                      {/* ── Step 2: 섹션 관리 (SW 선택 후) ───────── */}
                      {activeFnSwId && (
                      <>
                        <p className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider mb-2">
                          Step 2 — {tx(locale, "Inspection Sections", "점검 섹션", "点検セクション")}
                          <span className="ml-2 text-violet-600 normal-case">{activeSw?.name}</span>
                        </p>

                        {/* 섹션 추가 입력 */}
                        {canEdit && (
                          <div className="flex items-center gap-2 mb-4">
                            <div className="relative flex-1 max-w-[320px]">
                              <input
                                value={newSectionName}
                                onChange={(e) => setNewSectionName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && newSectionName.trim()) {
                                    const name = newSectionName.trim();
                                    const existing = fnSectionsMap[activeFnSwId] || [];
                                    if (!existing.includes(name)) {
                                      setFnSectionsMap(prev => ({ ...prev, [activeFnSwId]: [...existing, name] }));
                                      setActiveFnSection(name);
                                    }
                                    setNewSectionName("");
                                  }
                                }}
                                placeholder={tx(locale, "Section name (e.g. System Access)", "섹션 이름 (예: System Access)", "セクション名（例: System Access）")}
                                className="w-full rounded-lg border border-violet-300 bg-white px-3 py-2 pl-9 text-[13px] text-text placeholder:text-text-tertiary/60 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 shadow-xs transition-all"
                              />
                              <Plus size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-400 pointer-events-none" />
                            </div>
                            <button
                              onClick={() => {
                                const name = newSectionName.trim();
                                const existing = fnSectionsMap[activeFnSwId] || [];
                                if (name && !existing.includes(name)) {
                                  setFnSectionsMap(prev => ({ ...prev, [activeFnSwId]: [...existing, name] }));
                                  setActiveFnSection(name);
                                  setNewSectionName("");
                                }
                              }}
                              disabled={!newSectionName.trim()}
                              className="px-4 py-2 rounded-lg bg-violet-600 text-white text-[13px] font-semibold hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs"
                            >
                              {tx(locale, "Add Section", "섹션 추가", "セクション追加")}
                            </button>
                          </div>
                        )}

                        {/* 섹션 탭 */}
                        {currentSwSections.length > 0 && (
                          <div className="flex gap-1.5 flex-wrap items-center mb-5">
                            {currentSwSections.map((sec, secIdx) => {
                              const cnt = fnItems.filter(i => i.softwareId === activeFnSwId && i.section === sec).length;
                              const hasItems = cnt > 0;
                              return (
                                <div key={sec} className="relative group/sec flex items-center">
                                  <button
                                    onClick={() => setActiveFnSection(sec)}
                                    className={cn(
                                      "px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all border",
                                      activeFnSection === sec
                                        ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                                        : "text-text-tertiary border-border hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50/50"
                                    )}
                                  >
                                    {sec}
                                    {cnt > 0 && (
                                      <span className={cn(
                                        "ml-1.5 px-1.5 rounded-full text-[9px] font-bold",
                                        activeFnSection === sec ? "bg-white/20 text-white" : "bg-surface-secondary text-text-tertiary"
                                      )}>{cnt}</span>
                                    )}
                                  </button>
                                  {canEdit && !hasItems && (
                                    <button
                                      onClick={() => {
                                        const updated = currentSwSections.filter(s => s !== sec);
                                        setFnSectionsMap(prev => ({ ...prev, [activeFnSwId]: updated }));
                                        if (activeFnSection === sec) setActiveFnSection(updated[0] || "");
                                      }}
                                      className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-white border border-border shadow-xs flex items-center justify-center opacity-0 group-hover/sec:opacity-100 hover:bg-red-50 hover:border-red-300 transition-all z-10"
                                      title={tx(locale, "Remove section", "섹션 삭제", "セクション削除")}
                                    >
                                      <X size={8} className="text-text-tertiary hover:text-red-500" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* 섹션 없을 때 빈 상태 */}
                        {currentSwSections.length === 0 && (
                          <Card padding="none">
                            <CardBody>
                              <div className="flex flex-col items-center gap-3 py-10 text-center">
                                <div className="h-12 w-12 rounded-2xl bg-violet-50 border border-violet-200 flex items-center justify-center">
                                  <ClipboardList size={22} className="text-violet-400" />
                                </div>
                                <p className="text-[13px] font-medium text-text">
                                  {tx(locale, "No sections yet for this software", "이 소프트웨어에 아직 섹션이 없습니다", "このソフトウェアにはまだセクションがありません")}
                                </p>
                                <p className="text-[12px] text-text-tertiary max-w-xs">
                                  {tx(locale,
                                    "Add a section above (e.g. System Access, Network Security, Patch Management)",
                                    "위에서 섹션을 추가하세요 (예: System Access, Network Security, Patch Management)",
                                    "上でセクションを追加してください"
                                  )}
                                </p>
                              </div>
                            </CardBody>
                          </Card>
                        )}

                        {/* ── Step 3: 테스트 항목 테이블 (섹션 선택 후) ── */}
                        {activeFnSection && currentSwSections.includes(activeFnSection) && (
                        <>
                          <p className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider mb-2">
                            Step 3 — {tx(locale, "Inspection Items", "점검 항목", "点検項目")}
                          </p>
                          <div className="mb-4">
                            <h3 className="text-[14px] font-bold text-text">
                              {activeFnSection}
                              <span className="ml-2 text-[12px] font-medium text-violet-600">— {activeSw?.name}</span>
                            </h3>
                          </div>

                          <Card padding="none">
                            <div className="overflow-x-auto">
                              <table className="w-full text-[12px]">
                                <thead>
                                  <tr className="border-b border-border bg-surface-secondary/40">
                                    <th className="text-left px-4 py-3 font-bold text-text-tertiary w-12">No</th>
                                    <th className="text-left px-4 py-3 font-bold text-text-tertiary w-[28%]">
                                      {tx(locale, "Category", "분류", "カテゴリー")}
                                    </th>
                                    <th className="text-left px-4 py-3 font-bold text-text-tertiary w-[32%]">
                                      {tx(locale, "Criteria", "기준", "基準")}
                                    </th>
                                    <th className="text-left px-4 py-3 font-bold text-text-tertiary">
                                      {tx(locale, "Method", "방법", "方法")}
                                    </th>
                                    {canEdit && <th className="w-10" />}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60">
                                  {fnFilteredIndices.length === 0 ? (
                                    <tr>
                                      <td colSpan={canEdit ? 5 : 4} className="px-4 py-8 text-center text-[12px] text-text-tertiary">
                                        {tx(locale, "No items. Click + to add.", "항목이 없습니다. + 버튼으로 추가하세요.", "項目なし。+で追加してください。")}
                                      </td>
                                    </tr>
                                  ) : (
                                    fnFilteredIndices.map((globalIdx, localI) => {
                                      const row = fnItems[globalIdx];
                                      return (
                                        <tr key={globalIdx} className="group hover:bg-surface-secondary/30 transition-colors">
                                          <td className="px-4 py-2.5 text-text-tertiary font-mono text-[11px] align-top pt-3.5">{localI + 1}</td>
                                          <td className="px-4 py-2.5 align-top">
                                            {canEdit ? (
                                              <textarea
                                                value={row.category}
                                                onChange={(e) => updateFnItem(globalIdx, "category", e.target.value)}
                                                placeholder={tx(locale, "e.g. Is login with a pre-assigned ID successful?", "예: 사전 지정된 ID로 로그인 성공 여부", "例: 事前割り当てIDでのログイン確認")}
                                                rows={2}
                                                className="w-full rounded-md border border-transparent px-2 py-1.5 text-[12px] text-text placeholder:text-border-strong focus:outline-none focus:border-brand focus:bg-white focus:ring-1 focus:ring-brand/20 bg-transparent resize-none transition-all"
                                              />
                                            ) : <span className="text-text-secondary whitespace-pre-wrap">{row.category || "—"}</span>}
                                          </td>
                                          <td className="px-4 py-2.5 align-top">
                                            {canEdit ? (
                                              <textarea
                                                value={row.criteria}
                                                onChange={(e) => updateFnItem(globalIdx, "criteria", e.target.value)}
                                                placeholder={tx(locale, "e.g. Description of Security Capabilities", "예: 보안 기능 설명", "例: セキュリティ機能説明")}
                                                rows={2}
                                                className="w-full rounded-md border border-transparent px-2 py-1.5 text-[12px] text-text placeholder:text-border-strong focus:outline-none focus:border-brand focus:bg-white focus:ring-1 focus:ring-brand/20 bg-transparent resize-none transition-all"
                                              />
                                            ) : <span className="text-text-secondary whitespace-pre-wrap">{row.criteria || "—"}</span>}
                                          </td>
                                          <td className="px-4 py-2.5 align-top">
                                            {canEdit ? (
                                              <input
                                                value={row.method}
                                                onChange={(e) => updateFnItem(globalIdx, "method", e.target.value)}
                                                placeholder={tx(locale, "e.g. Function Inspection", "예: 기능 점검", "例: 機能点検")}
                                                className="w-full rounded-md border border-transparent px-2 py-1.5 text-[12px] text-text placeholder:text-border-strong focus:outline-none focus:border-brand focus:bg-white focus:ring-1 focus:ring-brand/20 bg-transparent transition-all"
                                              />
                                            ) : <span className="text-text-secondary">{row.method || "—"}</span>}
                                          </td>
                                          {canEdit && (
                                            <td className="px-2 py-2.5 align-top pt-3.5">
                                              <button
                                                onClick={() => removeFnItem(globalIdx)}
                                                className="h-6 w-6 rounded flex items-center justify-center text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-safety-high hover:bg-risk-bg transition-all"
                                              >
                                                <Trash2 size={12} />
                                              </button>
                                            </td>
                                          )}
                                        </tr>
                                      );
                                    })
                                  )}
                                </tbody>
                              </table>
                            </div>

                            {canEdit && (
                              <div className="border-t border-border/60 px-4 py-2.5">
                                <button
                                  onClick={() => addFnRow(activeFnSection, activeFnSwId, activeSw?.name)}
                                  className="flex items-center gap-1.5 text-[12px] font-semibold text-brand hover:text-brand-hover transition-colors px-2 py-1 rounded hover:bg-brand-lighter/50"
                                >
                                  <Plus size={13} /> {tx(locale, "Add item", "항목 추가", "項目追加")}
                                </button>
                              </div>
                            )}
                          </Card>
                        </>
                        )}
                      </>
                      )}
                    </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

        </motion.div>
      </div>
    </div>
  );
}
