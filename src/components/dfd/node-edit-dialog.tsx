"use client";

import { useState, useEffect } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { MARITIME_ZONES } from "@/lib/constants";
import type { Node } from "@xyflow/react";

const HW_TYPES = [
  { value: "SERVER", label: "Server", labelKo: "서버", labelJa: "サーバー" },
  { value: "PLC", label: "PLC", labelKo: "PLC", labelJa: "PLC" },
  { value: "SENSOR", label: "Sensor", labelKo: "센서", labelJa: "センサー" },
  { value: "NETWORK_DEVICE", label: "Network Device", labelKo: "네트워크 장비", labelJa: "ネットワーク機器" },
  { value: "PC", label: "PC / HMI", labelKo: "PC / HMI", labelJa: "PC / HMI" },
  { value: "OTHER_DEVICE", label: "Other Device", labelKo: "기타 장비", labelJa: "その他" },
];

interface NodeEditDialogProps {
  node: Node | null;
  open: boolean;
  onClose: () => void;
  onSave: (nodeId: string, data: Record<string, unknown>) => void;
}

export function NodeEditDialog({ node, open, onClose, onSave }: NodeEditDialogProps) {
  const { locale } = useLocaleStore();

  const [label, setLabel] = useState("");
  const [hwType, setHwType] = useState("OTHER_DEVICE");
  const [zone, setZone] = useState("");
  const [ipAddress, setIpAddress] = useState("");

  useEffect(() => {
    if (node) {
      const d = node.data as Record<string, unknown>;
      const newLabel = (d.label as string) || "";
      const newHwType = (d.hwType as string) || "OTHER_DEVICE";
      const newZone = (d.zone as string) || "";
      const newIpAddress = (d.ipAddress as string) || "";
      queueMicrotask(() => {
        setLabel(newLabel);
        setHwType(newHwType);
        setZone(newZone);
        setIpAddress(newIpAddress);
      });
    }
  }, [node]);

  const handleSave = () => {
    if (!node) return;
    onSave(node.id, { ...node.data, label, hwType, zone, ipAddress });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={tx(locale, "Edit Node Properties", "노드 속성 편집", "ノードプロパティ編集")}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-body-xs font-medium text-text mb-1">
            {tx(locale, "Name", "이름", "名前")}
          </label>
          <Input
            value={label}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLabel(e.target.value)}
            placeholder={tx(locale, "Device name", "장비 이름", "デバイス名")}
          />
        </div>

        <div>
          <label className="block text-body-xs font-medium text-text mb-1">
            {tx(locale, "Device Type", "장비 유형", "デバイスタイプ")}
          </label>
          <select
            value={hwType}
            onChange={(e) => setHwType(e.target.value)}
            className="w-full h-9 px-3 rounded-[4px] border border-border bg-white text-body-sm text-text focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          >
            {HW_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {locale === "ko" ? t.labelKo : locale === "ja" ? t.labelJa : t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-body-xs font-medium text-text mb-1">
            {tx(locale, "Security Zone", "보안 구역", "セキュリティゾーン")}
          </label>
          <select
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            className="w-full h-9 px-3 rounded-[4px] border border-border bg-white text-body-sm text-text focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          >
            <option value="">{tx(locale, "Unassigned", "미지정", "未指定")}</option>
            {MARITIME_ZONES.map((z) => (
              <option key={z.id} value={z.id}>
                {locale === "ko" ? z.labelKo : locale === "ja" ? z.labelJa : z.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-body-xs font-medium text-text mb-1">
            {tx(locale, "IP Address", "IP 주소", "IPアドレス")}
          </label>
          <Input
            value={ipAddress}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIpAddress(e.target.value)}
            placeholder="192.168.1.1"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={onClose}>
            {tx(locale, "Cancel", "취소", "キャンセル")}
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={handleSave}
            disabled={!label.trim()}
          >
            {tx(locale, "Save", "저장", "保存")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
