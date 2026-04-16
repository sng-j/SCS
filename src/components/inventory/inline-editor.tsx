"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Cpu, Monitor, Server, Radio, Network, Package,
  HardDrive, Save, Plus, Trash2, ChevronDown, Cable, Lock, Unlock, AlertCircle, CheckCircle, Shield, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import AutocompleteInput from "@/components/ui/autocomplete-input";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { MARITIME_ZONES, SHIP_LOCATIONS, ACCESS_CONTROL_LEVELS } from "@/lib/constants";
import { DEVICE_FIELD_CONFIG, HW_HARD_REQUIRED, HW_SOFT_REQUIRED, FUNCTIONALITY_PRESETS, SW_TYPES, getMissingRequiredHw, getMissingRecommendedHw, isValidIp, isValidMac } from "@/components/inventory/inventory-types";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SwRecord {
  id: string;
  name: string;
  swType: string;
  version: string | null;
  vendor: string | null;
}

interface HwRecord {
  id: string;
  name: string;
  type: string;
  ipAddress: string | null;
  macAddress: string | null;
  zone: string | null;
  manufacturer: string | null;
  model: string | null;
  purpose: string | null;
  location: string | null;
  brand: string | null;
  identifier: string | null;
  category: string | null;
  physicalInterface: string | null;
  commProtocols: string | null;
  logicalLocation: string | null;
  protectionMethod: string | null;
  sysSoftwareCategory: string | null;
  sysSoftwareVersion: string | null;
  software: SwRecord[];
}

interface InlineEditorProps {
  projectId: string;
  equipmentId: string;
  onComplete: () => void;
  onSwitchToTable?: () => void;
  readOnly?: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const HW_ICONS: Record<string, React.ElementType<Record<string, unknown>>> = {
  PLC: Cpu, SERVER: Server, SENSOR: Radio, NETWORK_DEVICE: Network, PC: Monitor, OTHER_DEVICE: HardDrive,
};

const TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  PLC: { color: "#16A34A", bg: "#F0FDF4" }, SERVER: { color: "#2563EB", bg: "#EFF6FF" },
  SENSOR: { color: "#D97706", bg: "#FFFBEB" }, NETWORK_DEVICE: { color: "#0891B2", bg: "#ECFEFF" },
  PC: { color: "#4F46E5", bg: "#EEF2FF" }, OTHER_DEVICE: { color: "#6B7280", bg: "#F9FAFB" },
};

const ZONE_OPTIONS = [
  { value: "", label: "미지정", labelEn: "None", labelJa: "未指定" },
  ...MARITIME_ZONES.map((z) => ({ value: z.id, label: z.labelKo, labelEn: z.label, labelJa: z.labelJa })),
];

// SW_TYPES imported from inventory-types.ts

interface Connection {
  id: string;
  fromId: string;
  toId: string;
  medium: string;
  protocol: string;
  encrypted: boolean;
}

const MEDIUM_OPTIONS = [
  { value: "ethernet", labelKo: "이더넷", labelEn: "Ethernet", labelJa: "イーサネット" },
  { value: "wireless", labelKo: "무선", labelEn: "Wireless", labelJa: "無線" },
  { value: "serial", labelKo: "시리얼", labelEn: "Serial", labelJa: "シリアル" },
  { value: "fiber", labelKo: "광섬유", labelEn: "Fiber", labelJa: "光ファイバー" },
  { value: "canbus", labelKo: "CAN Bus", labelEn: "CAN Bus", labelJa: "CANバス" },
];

// ─── Component ──────────────────────────────────────────────────────────────

export function InlineEditor({ projectId, equipmentId, onComplete, onSwitchToTable, readOnly }: InlineEditorProps) {
  const { locale } = useLocaleStore();

  const [hardware, setHardware] = useState<HwRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirtyHwIds, setDirtyHwIds] = useState<Set<string>>(new Set());
  const [dirtSwIds, setDirtySwIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}/hardware?equipmentId=${equipmentId}`).then((r) => r.ok ? r.json() : []),
      fetch(`/api/projects/${projectId}/connections`).then((r) => r.ok ? r.json() : []),
    ]).then(([hwData, connData]) => {
      setHardware(hwData);
      setConnections(connData);
      if (hwData.length > 0) setExpandedId(hwData[0].id);
    }).finally(() => setLoading(false));
  }, [projectId, equipmentId]);

  // ─── HW update ────────────────────────────────────────────────────────

  const updateHw = (id: string, field: keyof HwRecord, value: string) => {
    if (readOnly) return;
    setHardware((prev) => prev.map((h) => (h.id === id ? { ...h, [field]: value } : h)));
    setDirtyHwIds((prev) => new Set(prev).add(id));
  };

  // ─── SW handlers ──────────────────────────────────────────────────────

  const addSw = async (hwId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/software`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tx(locale, "New Software", "새 소프트웨어", "新規ソフトウェア"), swType: "APPLICATION", hardwareId: hwId, equipmentId }),
      });
      if (res.ok) {
        const created = await res.json();
        setHardware((prev) => prev.map((h) => h.id === hwId ? { ...h, software: [...h.software, created] } : h));
      }
    } catch { showToast.error(tx(locale, "Add failed", "추가 실패", "追加失敗")); }
  };

  const updateSw = (hwId: string, swId: string, field: string, value: string) => {
    if (readOnly) return;
    setHardware((prev) => prev.map((h) =>
      h.id === hwId ? { ...h, software: h.software.map((s) => s.id === swId ? { ...s, [field]: value } : s) } : h
    ));
    setDirtySwIds((prev) => new Set(prev).add(swId));
  };

  const deleteSw = async (hwId: string, swId: string) => {
    await fetch(`/api/projects/${projectId}/software/${swId}`, { method: "DELETE" });
    setHardware((prev) => prev.map((h) => h.id === hwId ? { ...h, software: h.software.filter((s) => s.id !== swId) } : h));
  };

  // ─── HW delete ────────────────────────────────────────────────────────

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const deleteHw = async (hwId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/hardware/${hwId}`, { method: "DELETE" });
      if (res.ok) {
        setHardware((prev) => prev.filter((h) => h.id !== hwId));
        setDeleteConfirmId(null);
        if (expandedId === hwId) setExpandedId(null);
        showToast.success(tx(locale, "Device deleted", "장치 삭제 완료", "デバイス削除完了"));
      } else {
        showToast.error(tx(locale, "Delete failed", "삭제 실패", "削除失敗"));
      }
    } catch { showToast.error(tx(locale, "Delete failed", "삭제 실패", "削除失敗")); }
  };

  // ─── Save all ─────────────────────────────────────────────────────────

  const totalDirty = dirtyHwIds.size + dirtSwIds.size;
  const [showDfdPrompt, setShowDfdPrompt] = useState(false);
  const [generatingDfd, setGeneratingDfd] = useState(false);

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const promises: Promise<Response>[] = [];

      hardware.filter((h) => dirtyHwIds.has(h.id)).forEach((hw) => {
        promises.push(fetch(`/api/projects/${projectId}/hardware/${hw.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: hw.name, ipAddress: hw.ipAddress || null, macAddress: hw.macAddress || null,
            zone: hw.zone || null, manufacturer: hw.manufacturer || null,
            model: hw.model || null, purpose: hw.purpose || null,
            location: hw.location || null, brand: hw.brand || null,
            identifier: hw.identifier || null, category: hw.category || null,
            physicalInterface: hw.physicalInterface || null, commProtocols: hw.commProtocols || null,
            logicalLocation: hw.logicalLocation || null, protectionMethod: hw.protectionMethod || null,
            sysSoftwareCategory: hw.sysSoftwareCategory || null, sysSoftwareVersion: hw.sysSoftwareVersion || null,
          }),
        }));
      });

      hardware.flatMap((h) => h.software).filter((s) => dirtSwIds.has(s.id)).forEach((sw) => {
        promises.push(fetch(`/api/projects/${projectId}/software/${sw.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: sw.name, version: sw.version || null, vendor: sw.vendor || null, swType: sw.swType }),
        }));
      });

      // Save connections to DB
      promises.push(fetch(`/api/projects/${projectId}/connections`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connections: connections.map((c) => ({ fromId: c.fromId, toId: c.toId, medium: c.medium, protocol: c.protocol, encrypted: c.encrypted })) }),
      }));

      await Promise.all(promises);
      setDirtyHwIds(new Set());
      setDirtySwIds(new Set());
      showToast.success(tx(locale, "Saved", "저장 완료", "保存完了"));
      setShowDfdPrompt(true);
    } catch {
      showToast.error(tx(locale, "Save failed", "저장 실패", "保存失敗"));
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateDfd = async () => {
    setGeneratingDfd(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/ai/generate-dfd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equipmentId }),
      });
      if (res.ok) {
        showToast.success(tx(locale, "DFD auto-generated", "DFD가 자동 생성되었습니다", "DFDが自動生成されました"));
        setShowDfdPrompt(false);
      } else {
        showToast.error(tx(locale, "DFD generation failed", "DFD 생성 실패", "DFD生成失敗"));
      }
    } finally {
      setGeneratingDfd(false);
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-4">
      {/* Guide */}
      <div className={cn("rounded-xl border p-4 flex items-start justify-between gap-4", readOnly ? "border-border bg-surface-secondary/50" : "border-brand/10 bg-brand-lighter/50")}>
        <div>
          <p className={cn("text-[13px] font-semibold", readOnly ? "text-text-secondary" : "text-brand-active")}>
            {readOnly
              ? tx(locale, "Asset Detail View (Read Only)", "자산 상세 보기 (읽기 전용)", "資産詳細表示（読み取り専用）")
              : tx(locale, "Enter device details and installed software", "각 장치의 상세 정보와 설치된 소프트웨어를 입력하세요", "各デバイスの詳細情報とインストール済みソフトウェアを入力してください")
            }
          </p>
          <p className="text-[12px] text-text-tertiary mt-1">
            {readOnly
              ? tx(locale, "Reviewing vendor's submitted asset inventory.", "벤더가 입력한 자산 인벤토리를 검토합니다.", "ベンダーが入力した資産インベントリを確認します。")
              : tx(locale, "Leave unknown fields empty. You can fill them in later from the table.", "모르는 항목은 비워두세요. 나중에 테이블에서도 입력할 수 있습니다.", "不明な項目は空欄のままにしてください。後でテーブルから入力できます。")
            }
          </p>
        </div>
        {onSwitchToTable && (
          <button
            onClick={onSwitchToTable}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white text-[11px] font-semibold text-text-secondary hover:text-brand hover:border-brand/20 transition-colors"
          >
            {tx(locale, "Table View", "테이블 보기", "テーブル表示")}
          </button>
        )}
      </div>

      {/* Device cards */}
      <div className="space-y-3">
        {hardware.map((hw, idx) => {
          const Icon = HW_ICONS[hw.type] || HardDrive;
          const tc = TYPE_COLORS[hw.type] || TYPE_COLORS.OTHER_DEVICE;
          const isExpanded = expandedId === hw.id;
          const isDirty = dirtyHwIds.has(hw.id) || hw.software.some((s) => dirtSwIds.has(s.id));
          const missingHard = getMissingRequiredHw(hw);
          const isComplete = missingHard.length === 0;

          // 카드 테두리: 초록(완료) / 주황(수정중) / 빨강(미입력)
          const cardRing = isComplete
            ? "ring-2 ring-green-400/30 border-green-200"
            : isDirty
            ? "ring-2 ring-amber-400/30 border-amber-200"
            : missingHard.length > 0
            ? "ring-2 ring-red-300/30 border-red-200"
            : "";

          return (
            <motion.div
              key={hw.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04, duration: 0.25 }}
            >
              <Card padding="none" className={cn(cardRing)}>
                {/* Device header — click to expand + delete */}
                <div className="flex items-center gap-0 group/header">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : hw.id)}
                    className="flex-1 flex items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-secondary/50 transition-colors"
                  >
                    <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: tc.bg }}>
                      <Icon size={17} style={{ color: tc.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-text truncate">{hw.name}</p>
                      <p className="text-[11px] text-text-tertiary">
                        {hw.manufacturer || "—"} · {hw.ipAddress || "IP 미입력"} · SW {hw.software.length}개
                      </p>
                    </div>
                    {isComplete
                      ? <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-[9px] font-bold shrink-0">{tx(locale, "Complete", "완료", "完了")}</span>
                      : isDirty
                      ? <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[9px] font-bold shrink-0">{tx(locale, "Editing", "수정중", "編集中")}</span>
                      : <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[9px] font-bold shrink-0">{tx(locale, `${missingHard.length} missing`, `${missingHard.length}개 미입력`, `${missingHard.length}件 未入力`)}</span>
                    }
                    <ChevronDown size={16} className={cn("text-text-tertiary transition-transform shrink-0", isExpanded && "rotate-180")} />
                  </button>
                  {/* HW 삭제 — readOnly 시 숨김 */}
                  {!readOnly && deleteConfirmId === hw.id ? (
                    <div className="flex items-center gap-1.5 px-3 shrink-0">
                      <button onClick={() => deleteHw(hw.id)}
                        className="px-3 py-1.5 rounded-md text-[10px] font-bold text-white bg-safety-high hover:bg-red-700 transition-colors">
                        {tx(locale, "Delete", "삭제", "削除")}
                      </button>
                      <button onClick={() => setDeleteConfirmId(null)}
                        className="px-2.5 py-1.5 rounded-md text-[10px] font-medium text-text-tertiary hover:bg-surface-secondary transition-colors">
                        {tx(locale, "Cancel", "취소", "取消")}
                      </button>
                    </div>
                  ) : !readOnly ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(hw.id); }}
                      className="p-2 mr-2 rounded-lg text-red-400 bg-red-50 hover:text-white hover:bg-safety-high transition-all shrink-0"
                      title={tx(locale, "Delete device", "장치 삭제", "デバイス削除")}
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    <div className={cn("px-5 pb-5 border-t border-border", readOnly && "[&_input]:pointer-events-none [&_input]:bg-surface-secondary [&_input]:text-text-secondary [&_select]:pointer-events-none [&_select]:bg-surface-secondary [&_select]:text-text-secondary [&_textarea]:pointer-events-none")}>
                      {/* PLC 모듈형 구성 안내 */}
                      {hw.type === "PLC" && (
                        <div className="mt-4 rounded-lg border border-dashed border-green-300 bg-green-50/50 px-3 py-2 flex items-start gap-2">
                          <AlertCircle size={12} className="text-green-700 mt-0.5 shrink-0" />
                          <p className="text-[10px] text-green-800 leading-relaxed">
                            {tx(locale,
                              "Modular PLC: enter values for the CPU module. Leave fields blank or \"-\" for I/O modules without their own info.",
                              "모듈형 PLC: CPU 모듈 기준으로 입력하세요. I/O 모듈처럼 해당 정보가 없는 항목은 비워두거나 \"-\" 입력 가능합니다.",
                              "モジュール型PLC: CPUモジュール基準で入力してください。I/Oモジュールなど該当情報がない項目は空欄または「-」で構いません。"
                            )}
                          </p>
                        </div>
                      )}

                      {/* ── Common Required Fields (E27 필수 9개) ── */}
                      <p className="text-[9px] font-bold text-text-tertiary uppercase tracking-wider mt-4 mb-2">{tx(locale, "Required (E27)", "필수 항목 (E27)", "必須項目 (E27)")}</p>
                      {(() => {
                        const fc = DEVICE_FIELD_CONFIG[hw.type] || DEVICE_FIELD_CONFIG.OTHER_DEVICE;
                        const isVis = (f: string) => (fc as unknown as Record<string, string>)[f] !== "hidden";
                        return (
                          <>
                            {/* Row 1: Name, Brand, Model */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                              <IField label={tx(locale, "Name *", "이름 *", "名前 *")} value={hw.name} onChange={(v) => updateHw(hw.id, "name", v)} />
                              <IAField label={tx(locale, "Brand/Mfr *", "브랜드/제조사 *", "ブランド/メーカー *")} value={hw.manufacturer || ""} onChange={(v) => updateHw(hw.id, "manufacturer", v)} placeholder="e.g. Siemens" projectId={projectId} field="manufacturer" context={{ type: hw.type, name: hw.name }} />
                              <IAField label={tx(locale, "Model/Type *", "모델/타입 *", "モデル/タイプ *")} value={hw.model || ""} onChange={(v) => updateHw(hw.id, "model", v)} placeholder="e.g. S7-1500" projectId={projectId} field="model" context={{ type: hw.type, name: hw.name, manufacturer: hw.manufacturer || "" }} />
                            </div>
                            {/* Row 2: Functionality, Location */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                              <IAField label={tx(locale, "Functionality *", "기능 *", "機能 *")} value={hw.purpose || ""} onChange={(v) => updateHw(hw.id, "purpose", v)} placeholder={tx(locale, "Select or type custom", "선택하거나 직접 입력", "選択または直接入力")} projectId={projectId} field="purpose" context={{ type: hw.type, name: hw.name }} />
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">{tx(locale, "Location", "설치 위치", "設置場所")}</label>
                                <LocationCombo value={hw.location || ""} onChange={(v) => updateHw(hw.id, "location", v)} locale={locale} />
                              </div>
                            </div>
                            {/* Row 3: 조선소 관리 항목 (선택) */}
                            <div className="grid grid-cols-2 gap-3 mt-3">
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">{tx(locale, "Category", "카테고리", "カテゴリ")}</label>
                                <select value={hw.category || ""} onChange={(e) => updateHw(hw.id, "category", e.target.value)} className={selectCls}>
                                  <option value="">{tx(locale, "Inherited from CBS", "CBS에서 상속", "CBSから継承")}</option>
                                  <option value="1">Cat I (Critical)</option>
                                  <option value="2">Cat II (Important)</option>
                                  <option value="3">Cat III (Other)</option>
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">{tx(locale, "Access Control", "접근통제", "アクセス制御")}</label>
                                <select value={hw.zone || ""} onChange={(e) => updateHw(hw.id, "zone", e.target.value)} className={selectCls}>
                                  <option value="">{tx(locale, "Not set", "미설정", "未設定")}</option>
                                  {ACCESS_CONTROL_LEVELS.map((ac) => (
                                    <option key={ac.id} value={ac.id}>{locale === "ko" ? ac.labelKo : locale === "ja" ? ac.labelJa : ac.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* ── E27 필수 (기술 사양) ── */}
                            <p className="text-[9px] font-bold text-text-tertiary uppercase tracking-wider mt-5 mb-2">{tx(locale, "Technical (E27 Required)", "기술 사양 (E27 필수)", "技術仕様 (E27必須)")}</p>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                              {isVis("physicalInterface") && <IAField label={tx(locale, "Physical Interfaces *", "물리적 인터페이스 *", "物理IF *")} value={hw.physicalInterface || ""} onChange={(v) => updateHw(hw.id, "physicalInterface", v)} placeholder={tx(locale, "LAN, USB, Serial — \"None\" if N/A", "LAN, USB, Serial — 없으면 \"None\"", "LAN等 — なしなら「None」")} projectId={projectId} field="physicalInterface" context={{ type: hw.type }} />}
                              {isVis("commProtocols") && <IAField label={tx(locale, "Comm Protocols *", "통신 프로토콜 *", "通信プロトコル *")} value={hw.commProtocols || ""} onChange={(v) => updateHw(hw.id, "commProtocols", v)} placeholder={tx(locale, "TCP/IP, Modbus — \"None\" if standalone", "TCP/IP, Modbus — 없으면 \"None\"", "TCP/IP等 — なしなら「None」")} projectId={projectId} field="commProtocols" context={{ type: hw.type }} />}
                            </div>

                            {/* ── E27 권장 (벤더가 모를 수 있는 항목) ── */}
                            {(isVis("sysSoftwareCategory") || isVis("sysSoftwareVersion")) && (
                              <>
                                <p className="text-[9px] font-bold text-amber-700 uppercase tracking-wider mt-5 mb-2 flex items-center gap-1">
                                  {tx(locale, "System Software (E27 Recommended)", "시스템 SW (E27 권장)", "システムSW (E27推奨)")}
                                </p>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                  {isVis("sysSoftwareCategory") && <IAField label={tx(locale, "System SW", "시스템 SW", "システムSW")} value={hw.sysSoftwareCategory || ""} onChange={(v) => updateHw(hw.id, "sysSoftwareCategory", v)} placeholder="Windows, RTOS, IOS-XE" projectId={projectId} field="sysSoftwareCategory" context={{ type: hw.type, name: hw.name }} recommended />}
                                  {isVis("sysSoftwareVersion") && <IField label={tx(locale, "SW Version", "SW 버전", "SWバージョン")} value={hw.sysSoftwareVersion || ""} onChange={(v) => updateHw(hw.id, "sysSoftwareVersion", v)} placeholder="v10.0.19041" recommended />}
                                </div>
                              </>
                            )}

                            {/* ── Optional ── */}
                            <p className="text-[9px] font-bold text-text-tertiary uppercase tracking-wider mt-5 mb-2">{tx(locale, "Additional (Optional)", "추가 정보 (선택)", "追加情報 (任意)")}</p>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                              {isVis("ipAddress") && <IField label={tx(locale, "IP Address", "IP 주소", "IPアドレス")} value={hw.ipAddress || ""} onChange={(v) => updateHw(hw.id, "ipAddress", v)} placeholder="192.168.1.100" mono error={hw.ipAddress && !isValidIp(hw.ipAddress) ? "Invalid IPv4" : undefined} />}
                              {isVis("macAddress") && <IField label={tx(locale, "MAC Address", "MAC 주소", "MACアドレス")} value={hw.macAddress || ""} onChange={(v) => updateHw(hw.id, "macAddress", v)} placeholder="AA:BB:CC:DD:EE:FF" mono error={hw.macAddress && !isValidMac(hw.macAddress) ? "XX:XX:XX:XX:XX:XX" : undefined} />}
                              {isVis("protectionMethod") && <IAField label={tx(locale, "Protection Method", "보호 방법", "保護方法")} value={hw.protectionMethod || ""} onChange={(v) => updateHw(hw.id, "protectionMethod", v)} placeholder="Firewall, ACL" projectId={projectId} field="protectionMethod" context={{ type: hw.type }} />}
                              {isVis("logicalLocation") && <IAField label={tx(locale, "Network Segment", "네트워크 구간", "ネットワーク区間")} value={hw.logicalLocation || ""} onChange={(v) => updateHw(hw.id, "logicalLocation", v)} placeholder="VLAN 10, 192.168.1.0/24" projectId={projectId} field="logicalLocation" context={{ type: hw.type }} />}
                            </div>

                            {/* Software section - hidden for NETWORK_DEVICE and SENSOR */}
                            {fc.showInstalledSw && (
                              <SwSection hw={hw} locale={locale} addSw={addSw} updateSw={updateSw} deleteSw={deleteSw} />
                            )}

                            {/* Audit tool — PC/SERVER/OTHER only */}
                            {["PC", "SERVER", "OTHER_DEVICE"].includes(hw.type) && (
                              <div className="mt-5 pt-4 border-t border-border">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-[12px] font-bold text-text-secondary flex items-center gap-1.5">
                                    <Shield size={13} className="text-brand" />
                                    {tx(locale, "Security Check", "보안 점검", "セキュリティ検査")}
                                  </p>
                                </div>
                                <AuditToolSection hwId={hw.id} hwName={hw.name} projectId={projectId} equipmentId={equipmentId} locale={locale} />
                              </div>
                            )}

                            {/* ── Connections (이 장치 기준) ── */}
                            {hardware.length >= 2 && (
                              <DeviceConnectionsInline
                                hwId={hw.id}
                                hwName={hw.name}
                                allHardware={hardware}
                                connections={connections}
                                setConnections={setConnections}
                                locale={locale}
                              />
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </motion.div>
                )}
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Connections section removed — now inline per device card */}

      {/* DFD auto-generate prompt */}
      {showDfdPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-safety-low/15 bg-green-50/50 p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <Network size={18} className="text-safety-low shrink-0" />
            <div>
              <p className="text-[13px] font-semibold text-text">
                {tx(locale, "Auto-generate network diagram (DFD)?", "네트워크 다이어그램(DFD)을 자동으로 생성하시겠습니까?", "ネットワークダイアグラム(DFD)を自動生成しますか？")}
              </p>
              <p className="text-[11px] text-text-tertiary mt-0.5">
                {tx(locale, "Connections will be auto-generated based on devices and zones", "등록된 장치와 보안 구역을 기반으로 자동 연결됩니다", "デバイスとゾーンに基づいて自動接続されます")}
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0 ml-4">
            <Button variant="outline" size="sm" onClick={() => setShowDfdPrompt(false)}>
              {tx(locale, "Later", "나중에", "後で")}
            </Button>
            <Button size="sm" loading={generatingDfd} onClick={handleGenerateDfd}>
              <Network size={13} /> {tx(locale, "Generate", "DFD 생성", "生成")}
            </Button>
          </div>
        </motion.div>
      )}

      {/* ── Sticky Action Bar (readOnly 시 숨김) ── */}
      {!readOnly && (() => {
        // Per-device validation — single source of truth.
        // 진행률은 HARD(9개) + SOFT(2개) 합산. SOFT는 빈값이어도 저장은 가능하지만 100%는 미달.
        const deviceStats = hardware.map((hw) => {
          const total = HW_HARD_REQUIRED.length + HW_SOFT_REQUIRED.length;
          const missingHard = getMissingRequiredHw(hw).length;
          const missingSoft = getMissingRecommendedHw(hw).length;
          const filled = total - missingHard - missingSoft;
          return {
            name: hw.name,
            type: hw.type,
            filled,
            total,
            complete: missingHard === 0,           // 저장 가능 여부 (HARD 기준)
            fullyCompliant: missingHard + missingSoft === 0, // 100% (HARD+SOFT)
          };
        });
        const totalFields = deviceStats.reduce((s, d) => s + d.total, 0);
        const filledFields = deviceStats.reduce((s, d) => s + d.filled, 0);
        // 입력완료 기준: HARD required만 충족이면 OK (SOFT/권장은 없어도 저장 가능)
        const allHardComplete = deviceStats.every((d) => d.complete);
        const allValid = hardware.length > 0 && allHardComplete;
        const pct = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;

        return (
          <div className="sticky bottom-0 -mx-1 mt-4">
            <div className="bg-white/95 backdrop-blur-md border-t border-border rounded-b-xl shadow-[0_-4px_20px_rgba(0,0,0,0.06)] px-5 py-4">
              {/* Progress overview */}
              {hardware.length > 0 && (
                <div className="mb-3">
                  {/* Overall bar */}
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <motion.div
                        className={cn("h-full rounded-full transition-colors", allValid ? "bg-green-500" : pct >= 80 ? "bg-amber-400" : pct > 50 ? "bg-brand" : "bg-red-400")}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                      />
                    </div>
                    <span className={cn("text-[12px] font-bold tabular-nums min-w-[3rem] text-right", allValid ? "text-green-600" : "text-text-secondary")}>
                      {pct}%
                    </span>
                  </div>
                  {/* Per-device chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {deviceStats.map((d, i) => {
                      const Icon = HW_ICONS[d.type] || HardDrive;
                      return (
                        <div
                          key={i}
                          className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-colors",
                            d.fullyCompliant
                              ? "bg-green-50 text-green-700 border-green-200"
                              : d.complete
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-red-50 text-red-700 border-red-200",
                          )}
                        >
                          <Icon size={11} />
                          <span className="truncate max-w-[100px]">{d.name}</span>
                          <span className="tabular-nums opacity-70">{d.filled}/{d.total}</span>
                          {d.fullyCompliant && <CheckCircle size={10} className="text-green-600" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-text-tertiary">
                  {totalDirty > 0
                    ? <span className="text-brand font-medium">{tx(locale, `${totalDirty} modified`, `${totalDirty}개 수정됨`, `${totalDirty}件変更`)}</span>
                    : tx(locale, "No changes", "변경 없음", "変更なし")
                  }
                </p>
                <div className="flex gap-2">
                  {totalDirty > 0 && (
                    <Button variant="outline" size="sm" loading={saving} onClick={handleSaveAll}>
                      <Save size={14} /> {tx(locale, "Save Draft", "임시저장", "下書き保存")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    disabled={!allValid}
                    onClick={() => { if (totalDirty > 0) { handleSaveAll().then(() => onComplete?.()); } else { onComplete?.(); } }}
                    className={cn(allValid && "bg-green-600 hover:bg-green-700")}
                  >
                    {allValid
                      ? <><CheckCircle size={14} /> {tx(locale, "Complete", "입력완료", "入力完了")}</>
                      : <>{tx(locale, "Complete", "입력완료", "入力完了")} <span className="opacity-60 text-[10px] ml-1">({filledFields}/{totalFields})</span></>
                    }
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Shared styles ──────────────────────────────────────────────────────────

const selectCls = "h-9 w-full rounded-lg border border-border bg-white px-2.5 text-[12px] text-text focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand appearance-none transition-all";

// ─── SW Section (접기 + 스크롤 + 검색) ─────────────────────────────────────

const SW_PREVIEW_COUNT = 5;
const swInputCls2 = "h-8 w-full rounded-md border border-border bg-surface-sidebar px-2 text-[11px] text-text placeholder:text-border-strong focus:outline-none focus:ring-1 focus:ring-brand/20 focus:border-brand transition-all";

function SwSection({ hw, locale, addSw, updateSw, deleteSw }: {
  hw: HwRecord; locale: string;
  addSw: (hwId: string) => void;
  updateSw: (hwId: string, swId: string, field: string, value: string) => void;
  deleteSw: (hwId: string, swId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const total = hw.software.length;

  // 유형별 통계
  const typeCounts: Record<string, number> = {};
  for (const sw of hw.software) {
    typeCounts[sw.swType] = (typeCounts[sw.swType] || 0) + 1;
  }

  // 검색 필터
  const filtered = search.trim()
    ? hw.software.filter((sw) => sw.name.toLowerCase().includes(search.toLowerCase()) || (sw.vendor || "").toLowerCase().includes(search.toLowerCase()))
    : hw.software;

  // 미리보기 vs 전체
  const displayList = expanded ? filtered : filtered.slice(0, SW_PREVIEW_COUNT);
  const hasMore = filtered.length > SW_PREVIEW_COUNT;

  return (
    <div className="mt-5 pt-4 border-t border-border">
      {/* 헤더: 카운트 + 유형 칩 + 추가 버튼 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[12px] font-bold text-text-secondary">
            {tx(locale, "Installed Software", "설치된 소프트웨어", "インストール済みSW")}
          </p>
          <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold">{total}</span>
          {Object.entries(typeCounts).map(([type, cnt]) => (
            <span key={type} className="px-1.5 py-0.5 rounded bg-surface-secondary text-[9px] font-semibold text-text-tertiary">
              {type} {cnt}
            </span>
          ))}
        </div>
        <button
          onClick={() => addSw(hw.id)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-brand hover:bg-brand-lighter transition-colors shrink-0"
        >
          <Plus size={12} /> {tx(locale, "Add SW", "SW 추가", "SW追加")}
        </button>
      </div>

      {total === 0 ? (
        <p className="text-[11px] text-border-strong italic py-2">
          {tx(locale, "No software registered.", "등록된 소프트웨어가 없습니다.", "ソフトウェアがありません。")}
        </p>
      ) : (
        <>
          {/* 검색 (10개 이상일 때만) */}
          {total >= 10 && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tx(locale, "Search software...", "소프트웨어 검색...", "ソフトウェア検索...")}
              className="w-full h-8 mb-2 rounded-lg border border-border bg-white px-3 text-[11px] text-text placeholder:text-border-strong focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
            />
          )}

          {/* SW 목록 (전체보기 시 스크롤) */}
          <div className={cn("space-y-1.5", expanded && hasMore && "max-h-[300px] overflow-y-auto pr-1")}>
            {displayList.map((sw) => (
              <div key={sw.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-white">
                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-2">
                  <input value={sw.name} onChange={(e) => updateSw(hw.id, sw.id, "name", e.target.value)}
                    placeholder={tx(locale, "Name", "이름", "名前")} className={swInputCls2} />
                  <input value={sw.version || ""} onChange={(e) => updateSw(hw.id, sw.id, "version", e.target.value)}
                    placeholder={tx(locale, "Version", "버전", "バージョン")} className={cn(swInputCls2, "font-mono")} />
                  <select value={sw.swType} onChange={(e) => updateSw(hw.id, sw.id, "swType", e.target.value)} className={swInputCls2}>
                    {SW_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <input value={sw.vendor || ""} onChange={(e) => updateSw(hw.id, sw.id, "vendor", e.target.value)}
                    placeholder={tx(locale, "Vendor", "벤더", "ベンダー")} className={swInputCls2} />
                </div>
                <button onClick={() => deleteSw(hw.id, sw.id)} className="p-1 rounded text-border-strong hover:text-safety-high hover:bg-risk-bg transition-colors shrink-0">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>

          {/* 더 보기 / 접기 */}
          {hasMore && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 w-full flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-semibold text-brand hover:bg-brand-lighter transition-colors"
            >
              <ChevronDown size={13} className={cn("transition-transform", expanded && "rotate-180")} />
              {expanded
                ? tx(locale, "Collapse", "접기", "閉じる")
                : tx(locale, `Show all ${filtered.length}`, `전체 ${filtered.length}개 보기`, `全${filtered.length}件表示`)
              }
            </button>
          )}

          {/* 검색 결과 없음 */}
          {search.trim() && filtered.length === 0 && (
            <p className="text-[11px] text-text-tertiary italic py-2 text-center">
              {tx(locale, "No matching software", "일치하는 소프트웨어 없음", "該当するソフトウェアなし")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

const swInputCls = "h-8 w-full rounded-md border border-border bg-surface-sidebar px-2 text-[11px] text-text placeholder:text-border-strong focus:outline-none focus:ring-1 focus:ring-brand/20 focus:border-brand transition-all";

function E27ExtendedFields({ hw, locale, onUpdate }: { hw: HwRecord; locale: string; onUpdate: (field: string, value: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-brand hover:text-brand-active transition-colors"
      >
        <ChevronDown size={13} className={cn("transition-transform", open && "rotate-180")} />
        {tx(locale, "Additional Info (optional)", "추가 정보 (선택)", "追加情報（任意）")}
      </button>

      {open && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} transition={{ duration: 0.2 }} className="overflow-hidden">
          <div className="mt-3 p-4 rounded-xl border border-border bg-surface-secondary/30 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <IField label="IP" value={hw.ipAddress || ""} onChange={(v) => onUpdate("ipAddress", v)} placeholder="192.168.x.x" mono />
              <IField label="MAC" value={hw.macAddress || ""} onChange={(v) => onUpdate("macAddress", v)} placeholder="00:1A:2B:..." mono />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <IField label={tx(locale, "Location", "위치", "位置")} value={hw.location || ""} onChange={(v) => onUpdate("location", v)} placeholder="Engine Room" />
              <IField label={tx(locale, "Identifier", "식별번호", "識別番号")} value={hw.identifier || ""} onChange={(v) => onUpdate("identifier", v)} placeholder="SN-12345" />
              <IField label={tx(locale, "Network Segment", "네트워크 구간", "ネットワークセグメント")} value={hw.logicalLocation || ""} onChange={(v) => onUpdate("logicalLocation", v)} placeholder="VLAN 10" />
            </div>
            <IField label={tx(locale, "Protection Method", "보호 방법", "保護方法")} value={hw.protectionMethod || ""} onChange={(v) => onUpdate("protectionMethod", v)} placeholder={tx(locale, "Firewall, VPN, ACL", "방화벽, VPN, 접근제어", "ファイアウォール、VPN、ACL")} />
            <IField label={tx(locale, "Update Log", "업데이트 로그", "更新ログ")} value={(hw as unknown as Record<string, string>).updateLog || ""} onChange={(v) => onUpdate("updateLog", v)} placeholder={tx(locale, "Date, changes, version, author", "날짜, 변경사항, 버전, 수행자", "日付、変更内容、バージョン、実行者")} />
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ─── Location ComboBox (기존 목록 + 직접 입력) ───────────────────────────────

function LocationCombo({ value, onChange, locale }: { value: string; onChange: (v: string) => void; locale: string }) {
  const isCustom = value && !SHIP_LOCATIONS.some((l) => l.id === value);
  const [customMode, setCustomMode] = useState(isCustom);

  return customMode ? (
    <div className="flex gap-1">
      <input
        type="text" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={tx(locale, "Type location name", "위치 직접 입력", "場所名を入力")}
        className="flex-1 h-9 rounded-lg border border-border bg-white px-2.5 text-[12px] text-text placeholder:text-border-strong focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
      />
      <button type="button" onClick={() => { setCustomMode(false); onChange(""); }}
        className="shrink-0 h-9 px-2 rounded-lg border border-border text-[10px] text-text-tertiary hover:bg-surface-secondary transition-colors">
        {tx(locale, "List", "목록", "一覧")}
      </button>
    </div>
  ) : (
    <div className="flex gap-1">
      <select value={value} onChange={(e) => { if (e.target.value === "__custom") { setCustomMode(true); onChange(""); } else onChange(e.target.value); }}
        className="flex-1 h-9 rounded-lg border border-border bg-white px-2.5 text-[12px] text-text focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all appearance-none">
        <option value="">{tx(locale, "Select location", "설치 위치 선택", "設置場所を選択")}</option>
        {SHIP_LOCATIONS.map((loc) => (
          <option key={loc.id} value={loc.id}>{locale === "ko" ? loc.labelKo : locale === "ja" ? loc.labelJa : loc.label}</option>
        ))}
        <option value="__custom">✏️ {tx(locale, "Type custom...", "직접 입력...", "直接入力...")}</option>
      </select>
    </div>
  );
}

function IField({ label, value, onChange, placeholder, mono, recommended, error }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean;
  recommended?: boolean;
  error?: string;  // 외부 검증 에러 메시지
}) {
  const isRequired = label.includes("*");
  const isHardEmpty = isRequired && !value.trim();
  const isSoftEmpty = recommended && !value.trim();
  const hasError = !!error;
  return (
    <div className="space-y-1">
      <label className={cn(
        "text-[10px] font-bold uppercase tracking-wider flex items-center gap-1",
        hasError || isHardEmpty ? "text-red-500" : isSoftEmpty ? "text-amber-600" : "text-text-tertiary",
      )}>
        <span>{label}</span>
        {/* recommended: 별표 없이 amber 테두리만 */}
      </label>
      <input
        type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className={cn(
          "h-9 w-full rounded-lg border bg-white px-2.5 text-[12px] text-text placeholder:text-border-strong",
          "focus:outline-none focus:ring-2 transition-all",
          mono && "font-mono",
          hasError || isHardEmpty
            ? "border-red-300 bg-red-50/40 focus:ring-red-200 focus:border-red-400"
            : isSoftEmpty
            ? "border-amber-200 bg-amber-50/30 focus:ring-amber-200 focus:border-amber-400"
            : "border-border focus:ring-brand/20 focus:border-brand",
        )}
      />
      {error && <p className="text-[9px] text-red-500">{error}</p>}
    </div>
  );
}

// ─── Audit Tool Section (보안 점검 다운로드/업로드) ──────────────────────────

interface AuditE27Item { cat: string; item: string; detail: string; pass: boolean }
interface AuditRunResult { id: string; platform: string; createdAt: string; e27?: { pass: number; fail: number; total: number; items: AuditE27Item[] } }

function AuditToolSection({ hwId, hwName, projectId, equipmentId, locale }: {
  hwId: string; hwName: string; projectId: string; equipmentId: string; locale: string;
}) {
  const [runs, setRuns] = useState<AuditRunResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchRuns = () => {
    if (!equipmentId) return;
    fetch(`/api/vendor/audit-tools/upload?equipmentId=${equipmentId}&hardwareId=${hwId}`)
      .then(async (r) => {
        if (r.ok) {
          const d = await r.json();
          const list = Array.isArray(d) ? d : (d.runs ?? []);
          setRuns(list);
        }
      })
      .catch(() => {});
  };
  useEffect(fetchRuns, [equipmentId, hwId]);

  const handleDownload = async (platform: "windows" | "linux") => {
    setDownloading(true);
    try {
      const eqParam = equipmentId ? `&equipmentId=${equipmentId}` : "";
      const res = await fetch(`/api/vendor/audit-tools/download?platform=${platform}${eqParam}`);
      if (!res.ok) { showToast.error(tx(locale, "Download failed", "다운로드 실패", "ダウンロード失敗")); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `security_check_${platform}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally { setDownloading(false); }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("projectId", projectId);
    if (equipmentId) formData.append("equipmentId", equipmentId);
    formData.append("hardwareId", hwId);
    formData.append("deviceName", hwName);
    const res = await fetch("/api/vendor/audit-tools/upload", { method: "POST", body: formData });
    if (res.ok) {
      showToast.success(tx(locale, "Uploaded", "업로드 완료", "アップロード完了"));
      fetchRuns();
    } else {
      const err = await res.json().catch(() => ({ error: "Unknown" }));
      showToast.error(`${tx(locale, "Upload failed", "업로드 실패", "アップロード失敗")}: ${err.error || ""}`);
    }
    setUploading(false);
  };

  return (
    <div className="space-y-2">
      <input ref={fileRef} type="file" accept=".scsaudit,.json" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />

      {/* 최신 결과 1건만 표시 */}
      {runs.length > 0 && (() => {
        const run = runs[0]; // API가 createdAt desc로 정렬
        const isOpen = expandedRunId === run.id;
        const e27 = run.e27;
        const passCount = e27?.pass ?? 0;
        const totalCount = e27?.total ?? 0;
        const failCount = totalCount - passCount;
        const allPass = totalCount > 0 && failCount === 0;
        return (
          <div className={cn("rounded-lg border overflow-hidden", allPass ? "border-green-200 bg-green-50/50" : "border-amber-200 bg-amber-50/50")}>
            <button onClick={() => setExpandedRunId(isOpen ? null : run.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/50 transition-colors">
              {allPass
                ? <CheckCircle size={12} className="text-green-600 shrink-0" />
                : <AlertCircle size={12} className="text-amber-600 shrink-0" />
              }
              <span className={cn("text-[11px] font-semibold flex-1", allPass ? "text-green-700" : "text-amber-700")}>
                {run.platform} — {e27
                  ? tx(locale, `${passCount}/${totalCount} satisfied (${failCount} non-compliant)`, `${passCount}/${totalCount} 만족 (${failCount}건 부적합)`, `${passCount}/${totalCount} 適合 (${failCount}件 不適合)`)
                  : tx(locale, "Result uploaded", "결과 업로드됨", "結果アップロード済み")}
              </span>
              <span className="text-[9px] text-text-tertiary shrink-0">{new Date(run.createdAt).toLocaleDateString()}</span>
              <ChevronDown size={12} className={cn("text-text-tertiary transition-transform shrink-0", isOpen && "rotate-180")} />
            </button>
            {isOpen && e27 && e27.items.length > 0 && (
              <div className="border-t border-border/50 px-3 py-2 space-y-1 max-h-[200px] overflow-y-auto">
                {e27.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    <span className={cn("shrink-0 px-1.5 py-px rounded text-[8px] font-bold",
                      item.pass ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    )}>
                      {item.pass ? tx(locale, "OK", "만족", "適合") : tx(locale, "NG", "부적합", "不適合")}
                    </span>
                    <span className="font-bold text-text-secondary w-10 shrink-0">{item.cat}</span>
                    <span className="text-text flex-1 truncate">{item.item}</span>
                    <span className="text-text-tertiary font-mono shrink-0">{item.detail}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Actions */}
      <div className="flex gap-2">
        <div className="flex-1 flex gap-1">
          <button onClick={() => handleDownload("windows")} disabled={downloading}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-border text-[10px] font-semibold text-text-secondary hover:bg-surface-secondary transition-colors disabled:opacity-50">
            <span>🪟</span> {tx(locale, "Windows", "Windows", "Windows")}
          </button>
          <button onClick={() => handleDownload("linux")} disabled={downloading}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-border text-[10px] font-semibold text-text-secondary hover:bg-surface-secondary transition-colors disabled:opacity-50">
            <span>🐧</span> {tx(locale, "Linux", "Linux", "Linux")}
          </button>
        </div>
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-[10px] font-semibold hover:bg-brand-hover transition-colors disabled:opacity-50">
          <Upload size={12} /> {uploading ? "..." : tx(locale, "Upload", "업로드", "アップ")}
        </button>
      </div>
    </div>
  );
}

function IAField({ label, value, onChange, placeholder, projectId, field, kind, context, recommended }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  projectId: string; field: string; kind?: "hw" | "sw"; context?: Record<string, string>;
  recommended?: boolean;  // E27 권장 (벤더가 모를 수 있어 빈값 허용) — amber 표시
}) {
  const isRequired = label.includes("*");
  const isHardEmpty = isRequired && !value.trim();
  const isSoftEmpty = recommended && !value.trim();
  return (
    <div className="space-y-1">
      <label className={cn(
        "text-[10px] font-bold uppercase tracking-wider flex items-center gap-1",
        isHardEmpty ? "text-red-500" : isSoftEmpty ? "text-amber-600" : "text-text-tertiary",
      )}>
        <span>{label}</span>
        {/* recommended: 별표 없이 amber 테두리만 */}
      </label>
      <AutocompleteInput
        value={value} onChange={onChange} projectId={projectId} field={field}
        kind={kind || "hw"} context={context || {}} placeholder={placeholder}
        className={cn(
          "h-9 w-full rounded-lg border bg-white px-2.5 text-[12px] text-text placeholder:text-border-strong focus:outline-none focus:ring-2 transition-all",
          isHardEmpty
            ? "border-red-300 bg-red-50/40 focus:ring-red-200 focus:border-red-400"
            : isSoftEmpty
            ? "border-amber-200 bg-amber-50/30 focus:ring-amber-200 focus:border-amber-400"
            : "border-border focus:ring-brand/20 focus:border-brand",
        )}
      />
    </div>
  );
}

// ─── Add Connection Form ────────────────────────────────────────────────────

// ─── Per-device connection chips + inline add ───────────────────────────────

const MEDIUM_ICONS: Record<string, { icon: string; color: string; bg: string }> = {
  ethernet: { icon: "E", color: "#2563EB", bg: "#EFF6FF" },
  wireless: { icon: "W", color: "#7C3AED", bg: "#F5F3FF" },
  serial:   { icon: "S", color: "#D97706", bg: "#FFFBEB" },
  fiber:    { icon: "F", color: "#059669", bg: "#ECFDF5" },
  canbus:   { icon: "C", color: "#DC2626", bg: "#FEF2F2" },
};

function DeviceConnectionsInline({ hwId, hwName, allHardware, connections, setConnections, locale }: {
  hwId: string;
  hwName: string;
  allHardware: HwRecord[];
  connections: Connection[];
  setConnections: React.Dispatch<React.SetStateAction<Connection[]>>;
  locale: string;
}) {
  const [targetId, setTargetId] = useState("");
  const [medium, setMedium] = useState("ethernet");
  const [encrypted, setEncrypted] = useState(false);

  // All connections involving this device (bidirectional)
  const myConns = connections.filter((c) => c.fromId === hwId || c.toId === hwId);

  // Devices already connected
  const connectedIds = new Set(myConns.map((c) => c.fromId === hwId ? c.toId : c.fromId));

  // Available targets (not self, not already connected)
  const availableTargets = allHardware.filter((h) => h.id !== hwId && !connectedIds.has(h.id));

  const handleAdd = () => {
    if (!targetId) return;
    setConnections((prev) => [...prev, {
      id: `conn-${Date.now()}`,
      fromId: hwId,
      toId: targetId,
      medium,
      protocol: "",
      encrypted,
    }]);
    setTargetId("");
    setMedium("ethernet");
    setEncrypted(false);
  };

  const handleRemove = (connId: string) => {
    setConnections((prev) => prev.filter((c) => c.id !== connId));
  };

  return (
    <div className="mt-5 pt-4 border-t border-border">
      <p className="text-[12px] font-bold text-text-secondary flex items-center gap-1.5 mb-3">
        <Cable size={13} className="text-teal-600" />
        {tx(locale, "Connected Devices", "연결된 장치", "接続デバイス")}
        {myConns.length > 0 && (
          <span className="ml-0.5 px-1.5 py-px rounded-full bg-teal-50 text-teal-700 text-[9px] font-bold">{myConns.length}</span>
        )}
        {myConns.length === 0 && (
          <span className="ml-0.5 text-[10px] font-normal text-text-tertiary">— {tx(locale, "none", "없음", "なし")}</span>
        )}
      </p>

      {/* Connection chips */}
      {myConns.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {myConns.map((conn) => {
            const otherId = conn.fromId === hwId ? conn.toId : conn.fromId;
            const otherHw = allHardware.find((h) => h.id === otherId);
            const mi = MEDIUM_ICONS[conn.medium] || MEDIUM_ICONS.ethernet;
            const mediumLabel = MEDIUM_OPTIONS.find((m) => m.value === conn.medium);
            const OtherIcon = HW_ICONS[otherHw?.type || ""] || HardDrive;

            return (
              <div
                key={conn.id}
                className="group/chip flex items-center gap-1.5 pl-1.5 pr-1 py-1 rounded-lg border border-border bg-white hover:border-teal-300 transition-colors"
              >
                <div className="h-5 w-5 rounded flex items-center justify-center shrink-0" style={{ background: TYPE_COLORS[otherHw?.type || ""]?.bg || "#F9FAFB" }}>
                  <OtherIcon size={11} style={{ color: TYPE_COLORS[otherHw?.type || ""]?.color || "#6B7280" }} />
                </div>
                <span className="text-[11px] font-semibold text-text truncate max-w-[100px]">{otherHw?.name || "?"}</span>
                <span className="px-1.5 py-px rounded text-[8px] font-bold shrink-0" style={{ background: mi.bg, color: mi.color }}>
                  {locale === "ko" ? mediumLabel?.labelKo : locale === "ja" ? mediumLabel?.labelJa : mediumLabel?.labelEn}
                </span>
                {conn.encrypted && <Lock size={9} className="text-green-600 shrink-0" />}
                <button
                  onClick={() => handleRemove(conn.id)}
                  className="p-0.5 rounded text-border-strong opacity-0 group-hover/chip:opacity-100 hover:text-safety-high hover:bg-risk-bg transition-all shrink-0"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 항상 노출되는 인라인 추가 폼 — 연결할 장치가 남아있을 때만 */}
      {availableTargets.length > 0 && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-surface-secondary/60 border border-border/50">
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="h-8 flex-1 min-w-0 rounded-md border border-border bg-white px-2 text-[11px] text-text focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-400 appearance-none transition-all"
          >
            <option value="">{tx(locale, "Connect to...", "연결 대상 선택...", "接続先を選択...")}</option>
            {availableTargets.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
          <select
            value={medium}
            onChange={(e) => setMedium(e.target.value)}
            className="h-8 w-[88px] rounded-md border border-border bg-white px-2 text-[11px] text-text focus:outline-none focus:ring-2 focus:ring-teal-300 appearance-none transition-all shrink-0"
          >
            {MEDIUM_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{locale === "ko" ? m.labelKo : locale === "ja" ? m.labelJa : m.labelEn}</option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-[10px] text-text-secondary cursor-pointer shrink-0 select-none" title={tx(locale, "Encrypted", "암호화", "暗号化")}>
            <input type="checkbox" checked={encrypted} onChange={(e) => setEncrypted(e.target.checked)} className="accent-teal-600 rounded" />
            <Lock size={10} />
          </label>
          <button
            onClick={handleAdd}
            disabled={!targetId}
            className="h-8 w-8 rounded-md bg-teal-600 text-white flex items-center justify-center disabled:opacity-20 hover:bg-teal-700 transition-all shrink-0"
          >
            <Plus size={14} />
          </button>
        </div>
      )}

      {/* 모든 장치가 이미 연결된 경우 */}
      {availableTargets.length === 0 && myConns.length > 0 && (
        <p className="text-[10px] text-teal-600 italic">
          {tx(locale, "All devices connected", "모든 장치가 연결됨", "全デバイス接続済み")}
        </p>
      )}
    </div>
  );
}

// ─── Legacy AddConnectionForm (kept for backward compat) ────────────────────

function AddConnectionForm({ hardware, locale, onAdd }: {
  hardware: HwRecord[];
  locale: string;
  onAdd: (conn: Omit<Connection, "id">) => void;
}) {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [medium, setMedium] = useState("ethernet");
  const [protocol, setProtocol] = useState("");
  const [encrypted, setEncrypted] = useState(false);

  const canAdd = fromId && toId && fromId !== toId;

  const handleAdd = () => {
    if (!canAdd) return;
    onAdd({ fromId, toId, medium, protocol, encrypted });
    setFromId("");
    setToId("");
    setProtocol("");
    setEncrypted(false);
  };

  const selectCls = "h-9 w-full rounded-lg border border-border bg-white px-2.5 text-[12px] text-text focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand appearance-none transition-all";

  return (
    <div className="p-4 rounded-xl bg-surface-secondary/50 border border-border">
      <p className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider mb-3">
        {tx(locale, "Add Connection", "연결 추가", "接続追加")}
      </p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
        {/* From */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-text-tertiary">{tx(locale, "From", "출발", "送信元")}</label>
          <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={selectCls}>
            <option value="">{tx(locale, "Select", "선택", "選択")}</option>
            {hardware.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
        {/* To */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-text-tertiary">{tx(locale, "To", "도착", "送信先")}</label>
          <select value={toId} onChange={(e) => setToId(e.target.value)} className={selectCls}>
            <option value="">{tx(locale, "Select", "선택", "選択")}</option>
            {hardware.filter((h) => h.id !== fromId).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
        {/* Medium */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-text-tertiary">{tx(locale, "Medium", "매체", "媒体")}</label>
          <select value={medium} onChange={(e) => setMedium(e.target.value)} className={selectCls}>
            {MEDIUM_OPTIONS.map((m) => <option key={m.value} value={m.value}>{locale === "ko" ? m.labelKo : locale === "ja" ? m.labelJa : m.labelEn}</option>)}
          </select>
        </div>
        {/* Protocol */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-text-tertiary">{tx(locale, "Protocol", "프로토콜", "プロトコル")}</label>
          <input
            value={protocol}
            onChange={(e) => setProtocol(e.target.value)}
            placeholder="TCP/IP, Modbus..."
            className="h-9 w-full rounded-lg border border-border bg-white px-2.5 text-[12px] text-text placeholder:text-border-strong focus:outline-none focus:ring-2 focus:ring-brand/20 transition-all"
          />
        </div>
        {/* Add button */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-text-secondary cursor-pointer shrink-0">
            <input type="checkbox" checked={encrypted} onChange={(e) => setEncrypted(e.target.checked)} className="accent-brand rounded" />
            {tx(locale, "Encrypted", "암호화", "暗号化")}
          </label>
          <button
            onClick={handleAdd}
            disabled={!canAdd}
            className="h-9 px-3 rounded-lg bg-brand-hover text-white text-[12px] font-bold disabled:opacity-30 hover:bg-brand-active transition-all shrink-0"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
