"use client";

import { useState, useEffect, useMemo } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { MEDIUM_PROTOCOLS } from "@/lib/constants";
import type { Edge } from "@xyflow/react";

const CONNECTION_TYPES = [
  { value: "ethernet", label: "Ethernet", labelKo: "이더넷", labelJa: "イーサネット" },
  { value: "wireless", label: "Wireless", labelKo: "무선", labelJa: "無線" },
  { value: "serial", label: "Serial (RS-232/485)", labelKo: "시리얼 (RS-232/485)", labelJa: "シリアル (RS-232/485)" },
  { value: "fiber", label: "Fiber Optic", labelKo: "광섬유", labelJa: "光ファイバー" },
  { value: "canbus", label: "CAN Bus", labelKo: "CAN 버스", labelJa: "CANバス" },
  { value: "modbus", label: "Modbus", labelKo: "Modbus", labelJa: "Modbus" },
];

interface EdgeEditDialogProps {
  edge: Edge | null;
  open: boolean;
  onClose: () => void;
  onSave: (edgeId: string, data: Record<string, unknown>) => void;
  onDelete: (edgeId: string) => void;
}

export function EdgeEditDialog({
  edge,
  open,
  onClose,
  onSave,
  onDelete,
}: EdgeEditDialogProps) {
  const { locale } = useLocaleStore();

  const [connectionType, setConnectionType] = useState("ethernet");
  const [protocol, setProtocol] = useState("");
  const [port, setPort] = useState("");
  const [encrypted, setEncrypted] = useState(false);
  const [label, setLabel] = useState("");

  const protocolOptions = useMemo(
    () => MEDIUM_PROTOCOLS[connectionType] || [],
    [connectionType],
  );

  useEffect(() => {
    if (edge) {
      const d = (edge.data || {}) as Record<string, unknown>;
      const newConnectionType = (d.connectionType as string) || "ethernet";
      const newProtocol = (d.protocol as string) || "";
      const newPort = (d.port as string) || "";
      const newEncrypted = (d.encrypted as boolean) || false;
      const newLabel = (edge.label as string) || "";
      queueMicrotask(() => {
        setConnectionType(newConnectionType);
        setProtocol(newProtocol);
        setPort(newPort);
        setEncrypted(newEncrypted);
        setLabel(newLabel);
      });
    }
  }, [edge]);

  // Medium 변경 시 프로토콜/포트 자동 리셋
  const handleMediumChange = (medium: string) => {
    setConnectionType(medium);
    const options = MEDIUM_PROTOCOLS[medium] || [];
    if (options.length > 0) {
      setProtocol(options[0].id);
      setPort(options[0].defaultPort || "");
      setEncrypted(options[0].encrypted || false);
    } else {
      setProtocol("");
      setPort("");
      setEncrypted(false);
    }
  };

  // 프로토콜 변경 시 기본 포트/암호화 자동 세팅
  const handleProtocolChange = (protocolId: string) => {
    setProtocol(protocolId);
    const info = protocolOptions.find((p) => p.id === protocolId);
    if (info) {
      setPort(info.defaultPort || "");
      setEncrypted(info.encrypted || false);
    }
  };

  const selectedProtocolInfo = useMemo(
    () => protocolOptions.find((p) => p.id === protocol),
    [protocolOptions, protocol],
  );

  const handleSave = () => {
    if (!edge) return;
    onSave(edge.id, { connectionType, protocol, port, encrypted, label });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={tx(locale, "Edit Connection Properties", "연결 속성 편집", "接続プロパティ編集")}
    >
      <div className="space-y-4">
        {/* Medium (연결 유형) */}
        <div>
          <label className="block text-body-xs font-medium text-text mb-1">
            {tx(locale, "Communication Medium", "통신 매체", "通信媒体")}
          </label>
          <select
            value={connectionType}
            onChange={(e) => handleMediumChange(e.target.value)}
            className="w-full h-9 px-3 rounded-[4px] border border-border bg-white text-body-sm text-text focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          >
            {CONNECTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {locale === "ko" ? t.labelKo : locale === "ja" ? t.labelJa : t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Protocol (프로토콜) — 드롭다운 + 자유입력 */}
        <div>
          <label className="block text-body-xs font-medium text-text mb-1">
            {tx(locale, "Protocol", "프로토콜", "プロトコル")}
          </label>
          {protocolOptions.length > 0 ? (
            <select
              value={protocol}
              onChange={(e) => handleProtocolChange(e.target.value)}
              className="w-full h-9 px-3 rounded-[4px] border border-border bg-white text-body-sm text-text focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            >
              <option value="">
                {tx(locale, "Select protocol...", "프로토콜 선택...", "プロトコル選択...")}
              </option>
              {protocolOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {locale === "ko" ? p.labelKo : locale === "ja" ? (p.label) : p.label}
                </option>
              ))}
            </select>
          ) : (
            <Input
              value={protocol}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setProtocol(e.target.value)
              }
              placeholder="e.g., TCP/IP, NMEA 0183"
            />
          )}
          {/* 서비스 힌트 표시 */}
          {selectedProtocolInfo?.service && (
            <p className="mt-1 text-body-xs text-text-secondary">
              {locale === "ko" ? selectedProtocolInfo.serviceKo : locale === "ja" ? (selectedProtocolInfo.service) : selectedProtocolInfo.service}
            </p>
          )}
        </div>

        {/* Port (포트) */}
        <div>
          <label className="block text-body-xs font-medium text-text mb-1">
            {tx(locale, "Port", "포트", "ポート")}
          </label>
          <Input
            value={port}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setPort(e.target.value)
            }
            placeholder={
              selectedProtocolInfo?.defaultPort
                ? `${tx(locale, "Default", "기본", "デフォルト")}: ${selectedProtocolInfo.defaultPort}`
                : "e.g., 502, 8080"
            }
          />
        </div>

        {/* Encrypted */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="edge-encrypted"
            checked={encrypted}
            onChange={(e) => setEncrypted(e.target.checked)}
            className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
          />
          <label htmlFor="edge-encrypted" className="text-body-sm text-text">
            {tx(locale, "Encrypted (TLS/IPSec)", "암호화됨 (TLS/IPSec)", "暗号化済み (TLS/IPSec)")}
          </label>
        </div>

        {/* Label */}
        <div>
          <label className="block text-body-xs font-medium text-text mb-1">
            {tx(locale, "Label", "레이블", "ラベル")}
          </label>
          <Input
            value={label}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setLabel(e.target.value)
            }
            placeholder={tx(locale, "Connection description", "연결 설명", "接続の説明")}
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (edge) onDelete(edge.id);
              onClose();
            }}
            className="text-safety-high border-safety-high/30 hover:bg-safety-high/10"
          >
            {tx(locale, "Delete", "삭제", "削除")}
          </Button>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onClose}>
              {tx(locale, "Cancel", "취소", "キャンセル")}
            </Button>
            <Button size="sm" variant="primary" onClick={handleSave}>
              {tx(locale, "Save", "저장", "保存")}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
