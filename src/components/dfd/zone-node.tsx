"use client";

import { memo } from "react";
import { type NodeProps, NodeResizer } from "@xyflow/react";
import { Shield, GripHorizontal } from "lucide-react";
import { MARITIME_ZONES, TRUST_LEVEL_CONFIG, type TrustLevel } from "@/lib/constants";

interface ZoneNodeData {
  label: string;
  trustLevel?: TrustLevel;
  [key: string]: unknown;
}

function ZoneNodeComponent({ data, selected }: NodeProps) {
  const d = data as unknown as ZoneNodeData;
  const zone = MARITIME_ZONES.find((z) => z.id === d.label);
  const color = zone?.color || "#94a3b8";
  const trustLevel = d.trustLevel || zone?.trustLevel || "trust";
  const trustConfig = TRUST_LEVEL_CONFIG[trustLevel];

  return (
    <div
      className="w-full h-full rounded-xl relative transition-all duration-200"
      style={{
        background: `linear-gradient(135deg, ${color}08 0%, ${color}04 100%)`,
        border: selected ? `2px solid ${color}` : `1.5px dashed ${color}40`,
        boxShadow: selected ? `0 0 0 4px ${color}15, inset 0 0 20px ${color}05` : `inset 0 0 20px ${color}03`,
      }}
    >
      {/* Resize handles — visible when selected */}
      <NodeResizer
        isVisible={!!selected}
        minWidth={200}
        minHeight={150}
        lineStyle={{ borderColor: color, borderWidth: 1.5 }}
        handleStyle={{ backgroundColor: color, width: 8, height: 8, borderRadius: 2, border: "2px solid white" }}
      />

      {/* Zone label — drag handle */}
      <div className="absolute top-2 left-3 flex items-center gap-2">
        <div
          className="zone-drag-handle flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold text-white select-none cursor-grab active:cursor-grabbing"
          style={{ backgroundColor: color, boxShadow: `0 2px 6px ${color}40` }}
        >
          <GripHorizontal size={10} className="opacity-60" />
          <Shield size={11} />
          {zone?.labelKo || d.label}
        </div>
      </div>

      {/* Trust level label — top right */}
      <div className="absolute top-2.5 right-3">
        <span
          className="text-[9px] font-semibold uppercase tracking-wider select-none"
          style={{ color: `${color}90` }}
        >
          {trustConfig.label}
        </span>
      </div>
    </div>
  );
}

export const ZoneNode = memo(ZoneNodeComponent);
