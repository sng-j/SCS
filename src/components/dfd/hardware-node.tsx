"use client";

import { memo, useMemo } from "react";
import { Handle, Position, type NodeProps, useEdges } from "@xyflow/react";
import {
  Server, Cpu, Radio, Network, Monitor, HardDrive,
  Shield, Wifi, Lock, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Device type config ─────────────────────────────────────────────────────

const HW_CONFIG: Record<string, { icon: React.ElementType<{ size?: number; style?: React.CSSProperties }>; gradient: string; iconColor: string; label: string }> = {
  SERVER:         { icon: Server,    gradient: "from-blue-500/15 to-blue-600/5",     iconColor: "#2563EB", label: "Server" },
  PLC:            { icon: Cpu,       gradient: "from-orange-500/15 to-orange-600/5",  iconColor: "#EA580C", label: "PLC" },
  SENSOR:         { icon: Radio,     gradient: "from-amber-500/15 to-amber-600/5",   iconColor: "#D97706", label: "Sensor" },
  NETWORK_DEVICE: { icon: Network,   gradient: "from-teal-500/15 to-teal-600/5",     iconColor: "#0D9488", label: "Network" },
  PC:             { icon: Monitor,   gradient: "from-indigo-500/15 to-indigo-600/5",  iconColor: "#6366F1", label: "PC/HMI" },
  OTHER_DEVICE:   { icon: HardDrive, gradient: "from-gray-400/15 to-gray-500/5",     iconColor: "#6B7280", label: "Device" },
};

const ZONE_COLORS: Record<string, { accent: string; ring: string }> = {
  navigation:    { accent: "#0F62FE", ring: "ring-blue-400/30" },
  propulsion:    { accent: "#DA1E28", ring: "ring-red-400/30" },
  safety:        { accent: "#EB6200", ring: "ring-orange-400/30" },
  cargo:         { accent: "#F1C21B", ring: "ring-yellow-400/30" },
  communication: { accent: "#24A148", ring: "ring-green-400/30" },
  admin:         { accent: "#8D8D8D", ring: "ring-gray-400/30" },
  shore:         { accent: "#393939", ring: "ring-gray-600/30" },
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface HardwareNodeData {
  label: string;
  hwType: string;
  zone?: string;
  ipAddress?: string;
  manufacturer?: string;
  model?: string;
  software?: { name: string; version: string | null }[];
  [key: string]: unknown;
}

// ─── Component ──────────────────────────────────────────────────────────────

function HardwareNodeComponent({ data, selected, id }: NodeProps) {
  const d = data as unknown as HardwareNodeData;
  const config = HW_CONFIG[d.hwType] || HW_CONFIG.OTHER_DEVICE;
  const Icon = config.icon;
  const zone = ZONE_COLORS[d.zone || ""];
  const swCount = d.software?.length || 0;

  // Count connected edges
  const edges = useEdges();
  const connectionCount = useMemo(() =>
    edges.filter((e) => e.source === id || e.target === id).length,
  [edges, id]);

  return (
    <>
      {/* Handles — subtle */}
      <Handle id="top" type="target" position={Position.Top}
        className="!w-2 !h-2 !bg-white !border-2 !border-brand/50 hover:!border-brand !transition-colors" />
      <Handle id="left" type="target" position={Position.Left}
        className="!w-2 !h-2 !bg-white !border-2 !border-brand/50 hover:!border-brand !transition-colors" />
      <Handle id="right" type="source" position={Position.Right}
        className="!w-2 !h-2 !bg-white !border-2 !border-brand/50 hover:!border-brand !transition-colors" />
      <Handle id="bottom" type="source" position={Position.Bottom}
        className="!w-2 !h-2 !bg-white !border-2 !border-brand/50 hover:!border-brand !transition-colors" />

      <div className={cn(
        "relative rounded-xl bg-white/95 backdrop-blur-sm border-2 min-w-[180px] max-w-[240px] transition-all duration-200 cursor-pointer",
        "shadow-[0_2px_8px_rgba(0,0,0,0.06)]",
        selected
          ? "border-brand shadow-[0_0_0_3px_rgba(15,98,254,0.15),0_4px_12px_rgba(0,0,0,0.1)] scale-[1.02]"
          : "border-white/80 hover:border-brand/30 hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:scale-[1.01]",
      )}>

        {/* Connection count badge (red, like CMDB) */}
        {connectionCount > 0 && (
          <div className="absolute -top-2 -right-2 h-5 min-w-[20px] px-1 rounded-full bg-[#DA1E28] text-white text-[9px] font-bold flex items-center justify-center shadow-sm z-10">
            {connectionCount}
          </div>
        )}

        {/* Main content */}
        <div className="px-3.5 py-3">
          {/* Icon + Name */}
          <div className="flex items-center gap-2.5">
            <div className={cn(
              "flex items-center justify-center h-9 w-9 rounded-lg shrink-0 bg-gradient-to-br transition-transform",
              config.gradient,
              selected && "scale-110",
            )}>
              <Icon size={18} style={{ color: config.iconColor }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-bold text-gray-900 leading-tight truncate">
                {d.label}
              </p>
              <p className="text-[9px] text-gray-400 uppercase tracking-wider font-semibold mt-0.5">
                {config.label}
              </p>
            </div>
          </div>

          {/* Info pills */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            {/* IP */}
            {d.ipAddress && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-mono text-gray-600 bg-gray-50 border border-gray-100">
                {d.ipAddress}
              </span>
            )}

            {/* Zone */}
            {d.zone && zone && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold"
                style={{ backgroundColor: `${zone.accent}12`, color: zone.accent }}>
                <Shield size={8} />
                {d.zone}
              </span>
            )}

            {/* SW count */}
            {swCount > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-blue-50 text-blue-600 border border-blue-100">
                SW {swCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export const HardwareNode = memo(HardwareNodeComponent);
