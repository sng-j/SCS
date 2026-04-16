"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Server,
  Cpu,
  Radio,
  Network,
  Monitor,
  HardDrive,
  Trash2,
  Cable,
  Package,
  Lock,
  Unlock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { MARITIME_ZONES, TRUST_LEVEL_CONFIG, type TrustLevel } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Node, Edge } from "@xyflow/react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DfdSidebarProps {
  node: Node;
  edges: Edge[];
  nodes: Node[];
  onClose: () => void;
  onUpdateNode: (nodeId: string, data: Record<string, unknown>) => void;
  onDeleteNode: (nodeId: string) => void;
  onCommitHistory: () => void;
  hideDelete?: boolean;
}

interface NodeData {
  label: string;
  hwType: string;
  zone?: string;
  trustLevel?: TrustLevel;
  ipAddress?: string;
  software?: { name: string; version: string | null }[];
  [key: string]: unknown;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const HW_ICONS: Record<string, React.ElementType<Record<string, unknown>>> = {
  SERVER: Server,
  PLC: Cpu,
  SENSOR: Radio,
  NETWORK_DEVICE: Network,
  PC: Monitor,
  OTHER_DEVICE: HardDrive,
};

const HW_TYPES = [
  { value: "SERVER", label: "Server", labelKo: "서버", labelJa: "サーバー" },
  { value: "PLC", label: "PLC", labelKo: "PLC", labelJa: "PLC" },
  { value: "SENSOR", label: "Sensor", labelKo: "센서", labelJa: "センサー" },
  { value: "NETWORK_DEVICE", label: "Network Device", labelKo: "네트워크 장비", labelJa: "ネットワーク機器" },
  { value: "PC", label: "PC / HMI", labelKo: "PC / HMI", labelJa: "PC / HMI" },
  { value: "OTHER_DEVICE", label: "Other Device", labelKo: "기타 장비", labelJa: "その他" },
];

const CONN_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  ethernet: { label: "Ethernet", color: "bg-blue-100 text-blue-700" },
  wireless: { label: "Wireless", color: "bg-green-100 text-green-700" },
  serial: { label: "Serial", color: "bg-red-100 text-red-700" },
  fiber: { label: "Fiber", color: "bg-purple-100 text-purple-700" },
  canbus: { label: "CAN Bus", color: "bg-orange-100 text-orange-700" },
  modbus: { label: "Modbus", color: "bg-amber-100 text-amber-700" },
};

const SW_TYPE_COLORS: Record<string, string> = {
  OS: "bg-blue-100 text-blue-700",
  FIRMWARE: "bg-orange-100 text-orange-700",
  APPLICATION: "bg-green-100 text-green-700",
  DRIVER: "bg-purple-100 text-purple-700",
  MIDDLEWARE: "bg-slate-100 text-slate-600",
};

// ═════════════════════════════════════════════════════════════════════════════

export function DfdSidebar({
  node,
  edges,
  nodes,
  onClose,
  onUpdateNode,
  onDeleteNode,
  hideDelete,
  onCommitHistory,
}: DfdSidebarProps) {
  const { locale } = useLocaleStore();
  const d = node.data as unknown as NodeData;

  // ─── Local state (synced from node) ──────────────────────────────────
  const [name, setName] = useState(d.label || "");
  const [hwType, setHwType] = useState(d.hwType || "OTHER_DEVICE");
  const [zone, setZone] = useState(d.zone || "");
  const [trustLevel, setTrustLevel] = useState<TrustLevel>(d.trustLevel || MARITIME_ZONES.find((z) => z.id === d.zone)?.trustLevel || "trust");
  const [ipAddress, setIpAddress] = useState(d.ipAddress || "");

  const commitRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nodeIdRef = useRef(node.id);

  // Re-sync when a different node is selected
  useEffect(() => {
    if (node.id !== nodeIdRef.current) {
      nodeIdRef.current = node.id;
      const nd = node.data as unknown as NodeData;
      const newName = nd.label || "";
      const newHwType = nd.hwType || "OTHER_DEVICE";
      const newZone = nd.zone || "";
      const newTrustLevel = nd.trustLevel || MARITIME_ZONES.find((z) => z.id === nd.zone)?.trustLevel || "trust";
      const newIpAddress = nd.ipAddress || "";
      queueMicrotask(() => {
        setName(newName);
        setHwType(newHwType);
        setZone(newZone);
        setTrustLevel(newTrustLevel);
        setIpAddress(newIpAddress);
      });
    }
  }, [node.id, node.data]);

  // ─── Debounced update ────────────────────────────────────────────────

  const pushUpdate = useCallback(
    (updates: Partial<NodeData>) => {
      const merged = { ...node.data, ...updates };
      onUpdateNode(node.id, merged as Record<string, unknown>);

      // Debounce history commit
      if (commitRef.current) clearTimeout(commitRef.current);
      commitRef.current = setTimeout(onCommitHistory, 800);
    },
    [node.id, node.data, onUpdateNode, onCommitHistory],
  );

  // ─── Field handlers ──────────────────────────────────────────────────

  const handleNameChange = (v: string) => {
    setName(v);
    pushUpdate({ label: v });
  };
  const handleTypeChange = (v: string) => {
    setHwType(v);
    pushUpdate({ hwType: v });
  };
  const handleZoneChange = (v: string) => {
    setZone(v);
    const defaultTrust = MARITIME_ZONES.find((z) => z.id === v)?.trustLevel || "trust";
    setTrustLevel(defaultTrust);
    pushUpdate({ zone: v, trustLevel: defaultTrust });
  };
  const handleTrustLevelChange = (v: TrustLevel) => {
    setTrustLevel(v);
    pushUpdate({ trustLevel: v });
  };
  const handleIpChange = (v: string) => {
    setIpAddress(v);
    pushUpdate({ ipAddress: v });
  };

  // ─── Derived data ────────────────────────────────────────────────────

  const connections = edges
    .filter((e) => e.source === node.id || e.target === node.id)
    .map((e) => {
      const peerId = e.source === node.id ? e.target : e.source;
      const peer = nodes.find((n) => n.id === peerId);
      const ed = (e.data || {}) as Record<string, unknown>;
      return {
        edgeId: e.id,
        peerName: (peer?.data as NodeData)?.label || peerId,
        peerType: (peer?.data as NodeData)?.hwType || "OTHER_DEVICE",
        connectionType: (ed.connectionType as string) || "ethernet",
        protocol: (ed.protocol as string) || "",
        encrypted: (ed.encrypted as boolean) || false,
      };
    });

  const software = d.software || [];
  const Icon = HW_ICONS[hwType] || HardDrive;
  const zoneInfo = MARITIME_ZONES.find((z) => z.id === zone);
  const typeLabel = HW_TYPES.find((t) => t.value === hwType);

  // ─── Cleanup ─────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (commitRef.current) clearTimeout(commitRef.current);
    };
  }, []);

  return (
    <div className="h-full flex flex-col bg-white">
      {/* ─── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <div
          className="flex items-center justify-center h-10 w-10 rounded-[8px] shrink-0"
          style={{ backgroundColor: zoneInfo ? `${zoneInfo.color}18` : "#F4F4F4" }}
        >
          <Icon size={22} style={{ color: zoneInfo?.color || "#525252" }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-text truncate">
            {node.type === "zone"
              ? (MARITIME_ZONES.find((z) => z.id === name)?.labelKo || name || "—")
              : (name || "—")}
          </p>
          <p className="text-[11px] text-text-tertiary uppercase tracking-wide">
            {node.type === "zone" ? tx(locale, "Security Zone", "보안 구역", "セキュリティゾーン") : (locale === "ko" ? typeLabel?.labelKo : locale === "ja" ? typeLabel?.labelJa : typeLabel?.label)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center h-7 w-7 rounded-[4px] text-text-tertiary hover:text-text hover:bg-surface-secondary transition-colors shrink-0"
        >
          <X size={15} />
        </button>
      </div>

      {/* ─── Fields ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-3 space-y-3">

          {node.type === "zone" ? (
            /* ─── Zone Fields ──────────────────────────────────────── */
            <>
              {/* Zone Type */}
              <FieldRow label={tx(locale, "Zone Type", "구역 유형", "ゾーンタイプ")}>
                <select
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-[4px] border border-border bg-white text-body-sm text-text focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                >
                  <option value="">{tx(locale, "Custom", "직접 입력", "カスタム")}</option>
                  {MARITIME_ZONES.map((z) => (
                    <option key={z.id} value={z.id}>
                      {locale === "ko" ? z.labelKo : locale === "ja" ? (z.labelJa) : z.label}
                    </option>
                  ))}
                </select>
              </FieldRow>

              {/* Custom name if not standard zone */}
              {!MARITIME_ZONES.find((z) => z.id === name) && (
                <FieldRow label={tx(locale, "Zone Name", "구역 이름", "ゾーン名")}>
                  <Input
                    value={name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleNameChange(e.target.value)}
                    placeholder={tx(locale, "Zone name", "구역 이름 입력", "ゾーン名を入力")}
                    className="h-8 text-body-sm"
                  />
                </FieldRow>
              )}

              {/* Trust Level */}
              <FieldRow label={tx(locale, "Trust Level (IEC 62443)", "신뢰 수준 (IEC 62443)", "信頼レベル (IEC 62443)")}>
                <div className="flex gap-1.5">
                  {(Object.keys(TRUST_LEVEL_CONFIG) as TrustLevel[]).map((level) => {
                    const cfg = TRUST_LEVEL_CONFIG[level];
                    const isActive = trustLevel === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => handleTrustLevelChange(level)}
                        className={cn(
                          "flex-1 px-2 py-1.5 rounded-[4px] text-[11px] font-semibold border transition-colors",
                          isActive ? "text-white" : "bg-white text-text-secondary hover:bg-surface-secondary",
                        )}
                        style={isActive ? { backgroundColor: cfg.borderColor, borderColor: cfg.borderColor } : { borderColor: `${cfg.borderColor}30` }}
                      >
                        {locale === "ko" ? cfg.labelKo : locale === "ja" ? (cfg.labelJa || cfg.label) : cfg.label}
                      </button>
                    );
                  })}
                </div>
              </FieldRow>
            </>
          ) : (
            /* ─── Hardware Fields ───────────────────────────────────── */
            <>
              {/* Name */}
              <FieldRow label={tx(locale, "Node Name", "노드 이름", "ノード名")}>
                <Input
                  value={name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleNameChange(e.target.value)}
                  className="h-8 text-body-sm"
                />
              </FieldRow>

              {/* Device Type */}
              <FieldRow label={tx(locale, "Device Type", "장비 유형", "デバイスタイプ")}>
                <select
                  value={hwType}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-[4px] border border-border bg-white text-body-sm text-text focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                >
                  {HW_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {locale === "ko" ? t.labelKo : locale === "ja" ? t.labelJa : t.label}
                    </option>
                  ))}
                </select>
              </FieldRow>

              {/* IP Address */}
              <FieldRow label={tx(locale, "IP Address", "IP 주소", "IPアドレス")}>
                <Input
                  value={ipAddress}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleIpChange(e.target.value)}
                  placeholder="192.168.x.x"
                  className="h-8 text-body-sm font-mono"
                />
              </FieldRow>

              {/* Zone */}
              <FieldRow label={tx(locale, "Security Zone", "보안 구역", "セキュリティゾーン")}>
                <select
                  value={zone}
                  onChange={(e) => handleZoneChange(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-[4px] border border-border bg-white text-body-sm text-text focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                >
                  <option value="">{tx(locale, "Unassigned", "미지정", "未指定")}</option>
                  {MARITIME_ZONES.map((z) => (
                    <option key={z.id} value={z.id}>
                      {locale === "ko" ? z.labelKo : locale === "ja" ? (z.labelJa) : z.label}
                    </option>
                  ))}
                </select>
              </FieldRow>
            </>
          )}
        </div>

        {/* ─── Connections (HW only) ────────────────────────────────── */}
        {node.type !== "zone" && (
        <div className="border-t border-border">
          <div className="flex items-center gap-2 px-4 py-2.5">
            <Cable size={13} className="text-text-tertiary" />
            <span className="text-[12px] font-semibold text-text">
              {tx(locale, "Connections", "연결", "接続")}
            </span>
            <span className="text-[11px] text-text-tertiary">
              ({connections.length})
            </span>
          </div>
          {connections.length === 0 ? (
            <p className="px-4 pb-3 text-[11px] text-text-tertiary italic">
              {tx(locale,
                "No connections. Drag from a handle to connect.",
                "연결된 장비가 없습니다. 핸들을 드래그하여 연결하세요.",
                "接続がありません。ハンドルをドラッグして接続してください。")}
            </p>
          ) : (
            <div className="px-4 pb-3 space-y-1.5">
              {connections.map((conn) => {
                const PeerIcon = HW_ICONS[conn.peerType] || HardDrive;
                const ct = CONN_TYPE_LABELS[conn.connectionType] || CONN_TYPE_LABELS.ethernet;
                return (
                  <div
                    key={conn.edgeId}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-[4px] bg-surface-secondary/60 text-[11px]"
                  >
                    <PeerIcon size={13} className="text-text-tertiary shrink-0" />
                    <span className="text-text font-medium truncate flex-1">
                      {conn.peerName}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0",
                        ct.color,
                      )}
                    >
                      {ct.label}
                    </span>
                    {conn.encrypted && (
                      <Lock size={10} className="text-green-600 shrink-0" />
                    )}
                    {!conn.encrypted && conn.connectionType !== "serial" && (
                      <Unlock size={10} className="text-text-tertiary shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        )}

        {/* ─── Software (HW only) ──────────────────────────────────── */}
        {node.type !== "zone" && (
        <div className="border-t border-border">
          <div className="flex items-center gap-2 px-4 py-2.5">
            <Package size={13} className="text-text-tertiary" />
            <span className="text-[12px] font-semibold text-text">
              {tx(locale, "Software", "소프트웨어", "ソフトウェア")}
            </span>
            <span className="text-[11px] text-text-tertiary">
              ({software.length})
            </span>
          </div>
          {software.length === 0 ? (
            <p className="px-4 pb-3 text-[11px] text-text-tertiary italic">
              {tx(locale,
                "No software registered for this device.",
                "등록된 소프트웨어가 없습니다.",
                "このデバイスにソフトウェアが登録されていません。")}
            </p>
          ) : (
            <div className="px-4 pb-3 space-y-1.5">
              {software.map((sw, i) => {
                const swType = (sw as Record<string, unknown>).swType as string;
                const typeColor = SW_TYPE_COLORS[swType] || SW_TYPE_COLORS.APPLICATION;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-[4px] bg-surface-secondary/60 text-[11px]"
                  >
                    <span className="text-text font-medium truncate flex-1">
                      {sw.name}
                      {sw.version && (
                        <span className="text-text-tertiary ml-1">{sw.version}</span>
                      )}
                    </span>
                    {swType && (
                      <span
                        className={cn(
                          "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0",
                          typeColor,
                        )}
                      >
                        {swType}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}
      </div>

      {/* ─── Actions ─────────────────────────────────────────────────── */}
      {!hideDelete && (
        <div className="px-4 py-3 border-t border-border shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="w-full text-safety-high border-safety-high/30 hover:bg-safety-high/10"
            onClick={() => {
              onDeleteNode(node.id);
              onClose();
            }}
          >
            <Trash2 size={13} />
            {node.type === "zone" ? tx(locale, "Delete Zone", "구역 삭제", "ゾーン削除") : tx(locale, "Delete Node", "노드 삭제", "ノード削除")}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-text-secondary mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
