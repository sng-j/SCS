"use client";

import { useState, useCallback, useRef } from "react";
import {
  Radar, Upload, ArrowRight, ArrowLeft, CheckCircle2,
  Server, Monitor, Cpu, Network, HardDrive, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { showToast } from "@/lib/toast";
import { mergeAndClassify, type ScpScanResult, type ScpHost } from "@/lib/scan-parser";
import { parseNmapXml, isNmapXml } from "@/lib/nmap-parser";
import { cn } from "@/lib/utils";

// ─── Props ───────────────────────────────────────────────────────────────────

interface ScanImportDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  equipmentId?: string | null;
  onComplete: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const HW_TYPES = [
  { value: "SERVER", label: "Server" },
  { value: "PC", label: "PC" },
  { value: "NETWORK_DEVICE", label: "Network Device" },
  { value: "PLC", label: "PLC" },
  { value: "SENSOR", label: "Sensor" },
  { value: "OTHER_DEVICE", label: "Other" },
];

const TYPE_ICONS: Record<string, React.ElementType<Record<string, unknown>>> = {
  SERVER: Server, PC: Monitor, NETWORK_DEVICE: Network,
  PLC: Cpu, SENSOR: Cpu, OTHER_DEVICE: HardDrive,
};

const TYPE_COLORS: Record<string, string> = {
  SERVER: "bg-blue-50 text-blue-700",
  PC: "bg-indigo-50 text-indigo-700",
  NETWORK_DEVICE: "bg-teal-50 text-teal-700",
  PLC: "bg-purple-50 text-purple-700",
  SENSOR: "bg-amber-50 text-amber-700",
  OTHER_DEVICE: "bg-surface-secondary text-text-secondary",
};

type Step = "upload" | "preview" | "result";

// ─── Component ───────────────────────────────────────────────────────────────

export function ScanImportDialog({ open, onClose, projectId, equipmentId, onComplete }: ScanImportDialogProps) {
  const { locale } = useLocaleStore();

  const [step, setStep] = useState<Step>("upload");
  const [files, setFiles] = useState<{ asset: string | null; portDisc: string | null; portScan: string | null; pcap: File | null; scanXml: string | null }>({
    asset: null, portDisc: null, portScan: null, pcap: null, scanXml: null,
  });
  const [scanResult, setScanResult] = useState<ScpScanResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ hardware: number; software: number; skipped: number } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Reset on close
  const handleClose = useCallback(() => {
    setStep("upload");
    setFiles({ asset: null, portDisc: null, portScan: null, pcap: null, scanXml: null });
    setScanResult(null);
    setImporting(false);
    setImportResult(null);
    setParseError(null);
    onClose();
  }, [onClose]);

  // ── File reading ─────────────────────────────────────────────────────────

  const readFile = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  }, []);

  /** Auto-detect file type from filename */
  const detectFileType = useCallback((name: string): "asset" | "portDisc" | "portScan" | "pcap" | "xml" | null => {
    const lower = name.toLowerCase();
    if (lower.endsWith(".xml")) return "xml";
    if (lower.includes("asset_discovery")) return "asset";
    if (lower.includes("port_discovery")) return "portDisc";
    if (lower.includes("port_scan")) return "portScan";
    if (lower.endsWith(".pcap") || lower.includes("capture")) return "pcap";
    return null;
  }, []);

  /** Handle a single file — auto-detect and store */
  const handleFile = useCallback(async (file: File) => {
    const type = detectFileType(file.name);

    if (type === "xml") {
      const text = await readFile(file);
      // Verify it's a valid scan XML by content
      if (isNmapXml(text)) {
        setFiles((prev) => ({ ...prev, scanXml: text }));
        setParseError(null);
      } else {
        setParseError(tx(locale, "Unsupported XML format", "지원하지 않는 XML 형식입니다", "サポートされていないXML形式です"));
      }
    } else if (type === "pcap") {
      setFiles((prev) => ({ ...prev, pcap: file }));
    } else if (type) {
      const text = await readFile(file);
      setFiles((prev) => ({ ...prev, [type]: text }));
      setParseError(null);
    } else {
      // Unknown file — try to detect from content
      const text = await readFile(file);
      if (isNmapXml(text)) {
        setFiles((prev) => ({ ...prev, scanXml: text }));
        setParseError(null);
      } else if (text.includes("Asset Discovery") || text.includes("Discovered hosts")) {
        setFiles((prev) => ({ ...prev, asset: text }));
        setParseError(null);
      } else if (text.includes("Port Discovery") || text.includes("Scanned hosts")) {
        setFiles((prev) => ({ ...prev, portDisc: text }));
        setParseError(null);
      } else if (text.includes("Port Scan") || text.match(/^Host:\s*[\d.]+/m)) {
        setFiles((prev) => ({ ...prev, portScan: text }));
        setParseError(null);
      }
    }
  }, [detectFileType, readFile, locale]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    for (const file of droppedFiles) {
      await handleFile(file);
    }
  }, [handleFile]);

  // ── Parse ────────────────────────────────────────────────────────────────

  const handleParse = useCallback(() => {
    try {
      // XML scan takes priority (richer data)
      if (files.scanXml) {
        const result = parseNmapXml(files.scanXml);
        setScanResult(result);
      } else if (files.asset) {
        const result = mergeAndClassify(
          files.asset,
          files.portDisc || "",
          files.portScan || "",
        );
        setScanResult(result);
      } else {
        setParseError(tx(locale, "Please upload scan files", "스캔 파일을 업로드하세요", "スキャンファイルをアップロードしてください"));
        return;
      }
      setStep("preview");
      setParseError(null);
    } catch (err) {
      setParseError(tx(locale, "Error parsing scan files", "파일 파싱 중 오류가 발생했습니다", "ファイル解析中にエラーが発生しました"));
      console.error("[scan-parser]", err);
    }
  }, [files, locale]);

  // ── Host editing in preview ──────────────────────────────────────────────

  const updateHost = useCallback((idx: number, field: keyof ScpHost, value: string) => {
    if (!scanResult) return;
    const updated = { ...scanResult, hosts: [...scanResult.hosts] };
    updated.hosts[idx] = { ...updated.hosts[idx], [field]: value };
    setScanResult(updated);
  }, [scanResult]);

  // ── Import ───────────────────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (!scanResult) return;
    setImporting(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/import-scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanResult, equipmentId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Import failed");
      }

      const data = await res.json();
      setImportResult({ hardware: data.created.hardware, software: data.created.software, skipped: data.skipped });
      setStep("result");
      showToast.success(
        tx(locale, `Created ${data.created.hardware} hardware, ${data.created.software} software`, `${data.created.hardware}개 하드웨어, ${data.created.software}개 소프트웨어 생성됨`, `ハードウェア${data.created.hardware}件、ソフトウェア${data.created.software}件作成`),
      );
      onComplete();
    } catch (err) {
      showToast.error(tx(locale, "Import failed", "임포트 실패", "インポート失敗"));
      console.error("[import-scan]", err);
    } finally {
      setImporting(false);
    }
  }, [scanResult, projectId, equipmentId, locale, onComplete]);

  // ── File status ────────────────────────────────────────────────────────

  const fileSlots = [
    { key: "scanXml" as const, label: tx(locale, "Scan Result (XML)", "스캔 결과 (XML)", "スキャン結果 (XML)"), accept: ".xml", required: false },
    { key: "asset" as const, label: "Asset Discovery (.txt)", accept: ".txt", required: false },
    { key: "portDisc" as const, label: "Port Discovery (.txt)", accept: ".txt", required: false },
    { key: "portScan" as const, label: "Port Scan (.txt)", accept: ".txt", required: false },
    { key: "pcap" as const, label: "Packet Capture (.pcap)", accept: ".pcap", required: false },
  ];

  const loadedCount = [files.scanXml, files.asset, files.portDisc, files.portScan, files.pcap].filter(Boolean).length;
  const canAnalyze = !!files.scanXml || !!files.asset;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onClose={handleClose} title={tx(locale, "Import SC-P Scan", "SC-P 스캔 가져오기", "SC-Pスキャンインポート")} maxWidth="max-w-5xl">
      {/* Step 1: Upload */}
      {step === "upload" && (
        <div className="space-y-5">
          {/* Drop zone */}
          <div
            ref={dropRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-border rounded-[var(--radius-md)] p-6 text-center hover:border-brand/40 hover:bg-brand-lighter/20 transition-colors"
          >
            <Upload size={24} className="mx-auto text-text-tertiary mb-2" />
            <p className="text-body-sm font-semibold text-text">
              {tx(locale, "Drag scan files here", "스캔 파일을 드래그하세요", "スキャンファイルをドラッグしてください")}
            </p>
            <p className="text-body-xs text-text-tertiary mt-1">
              {tx(locale,
                "Supports SC-P text files and XML — auto-detected by filename or content",
                "SC-P 텍스트 파일 및 XML 지원 — 파일명/내용으로 자동 감지",
                "SC-Pテキストファイル・XML対応 — ファイル名/内容で自動検出")}
            </p>
          </div>

          {/* File slots */}
          <div className="space-y-3">
            {fileSlots.map(({ key, label, accept }) => {
              const isLoaded = key === "pcap" ? !!files.pcap : !!files[key];
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className={cn(
                    "h-8 w-8 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0",
                    isLoaded ? "bg-green-50 text-safety-low" : "bg-surface-secondary text-text-tertiary",
                  )}>
                    {isLoaded ? <CheckCircle2 size={14} /> : <Radar size={14} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-xs font-semibold text-text">{label}</p>
                    <p className="text-[10px] text-text-tertiary">
                      {isLoaded
                        ? tx(locale, "Loaded", "로드됨", "読み込み済み")
                        : key === "pcap"
                          ? tx(locale, "For traffic analysis", "통신 패턴 분석용", "トラフィック分析用")
                          : tx(locale, "Not selected", "미선택", "未選択")}
                    </p>
                  </div>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept={accept}
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (f) await handleFile(f);
                      }}
                    />
                    <span className="px-3 py-1.5 rounded-[var(--radius-sm)] border border-border text-body-xs font-medium text-text-secondary hover:bg-surface-secondary transition-colors">
                      {tx(locale, "Choose", "파일 선택", "ファイル選択")}
                    </span>
                  </label>
                </div>
              );
            })}
          </div>

          {/* Hint */}
          {loadedCount === 0 && (
            <p className="text-[10px] text-text-tertiary text-center">
              {tx(locale,
                "Upload at least one scan file (Asset Discovery or XML)",
                "최소 1개의 스캔 파일을 업로드하세요 (Asset Discovery 또는 XML)",
                "少なくとも1つのスキャンファイルをアップロードしてください")}
            </p>
          )}

          {parseError && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] bg-risk-bg text-safety-high text-body-xs">
              <AlertCircle size={14} />
              {parseError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={handleClose}>
              {tx(locale, "Cancel", "취소", "キャンセル")}
            </Button>
            <Button size="sm" onClick={handleParse} disabled={!canAnalyze}>
              {tx(locale, "Analyze", "분석", "分析")} <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Preview */}
      {step === "preview" && scanResult && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-brand-lighter/30 border border-brand/10">
            <Radar size={16} className="text-brand" />
            <p className="text-body-xs font-semibold text-text">
              {scanResult.meta.hostCount} {tx(locale, "hosts found", "개 호스트 발견", "ホスト検出")} — {scanResult.meta.subnet}
            </p>
            <div className="flex gap-2 ml-auto text-[10px] font-bold flex-wrap">
              {Object.entries(
                scanResult.hosts.reduce<Record<string, number>>((acc, h) => { acc[h.hwType] = (acc[h.hwType] || 0) + 1; return acc; }, {}),
              ).map(([type, count]) => (
                <span key={type} className={cn("px-1.5 py-0.5 rounded", TYPE_COLORS[type] || "bg-surface-secondary text-text-secondary")}>
                  {type.replace("_", " ")} {count}
                </span>
              ))}
            </div>
          </div>

          {/* Host table */}
          <div className="max-h-[400px] overflow-auto border border-border rounded-[var(--radius-md)]">
            <table className="w-full text-body-xs table-fixed">
              <thead>
                <tr className="bg-white border-b border-border sticky top-0 z-10 shadow-xs">
                  <th className="px-3 py-2 text-left font-bold text-text-tertiary whitespace-nowrap w-[120px]">IP</th>
                  <th className="px-3 py-2 text-left font-bold text-text-tertiary whitespace-nowrap w-[90px]">{tx(locale, "Vendor", "벤더", "ベンダー")}</th>
                  <th className="px-3 py-2 text-left font-bold text-text-tertiary whitespace-nowrap w-[110px]">{tx(locale, "Type", "유형", "タイプ")}</th>
                  <th className="px-3 py-2 text-left font-bold text-text-tertiary whitespace-nowrap">{tx(locale, "Name", "이름", "名前")}</th>
                  <th className="px-3 py-2 text-left font-bold text-text-tertiary whitespace-nowrap w-[130px]">OS</th>
                  <th className="px-3 py-2 text-center font-bold text-text-tertiary whitespace-nowrap w-[50px]">{tx(locale, "Ports", "포트", "ポート")}</th>
                  <th className="px-3 py-2 text-center font-bold text-text-tertiary whitespace-nowrap w-[40px]">SW</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {scanResult.hosts.map((host, idx) => (
                  <tr key={host.ip} className="hover:bg-surface-secondary/30 transition-colors">
                    <td className="px-3 py-2">
                      <span className="font-mono text-brand font-semibold text-[11px]">{host.ip}</span>
                    </td>
                    <td className="px-3 py-2">
                      {host.macVendor ? (
                        <span className="text-[10px] font-semibold text-text-secondary truncate block" title={`${host.macVendor} — ${host.mac}`}>
                          {host.macVendor}
                        </span>
                      ) : (
                        <span className="text-[10px] text-text-tertiary font-mono" title={host.mac}>
                          {host.mac && host.mac !== "00:00:00:00:00:00" ? host.mac.substring(0, 8) : "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={host.hwType}
                        onChange={(e) => updateHost(idx, "hwType", e.target.value)}
                        className="h-7 px-1.5 rounded border border-border text-[11px] font-semibold bg-white focus:outline-none focus:ring-1 focus:ring-brand/30"
                      >
                        {HW_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={host.hwName}
                        onChange={(e) => updateHost(idx, "hwName", e.target.value)}
                        className="h-7 w-full px-2 rounded border border-border text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-brand/30"
                      />
                    </td>
                    <td className="px-3 py-2 text-text-tertiary text-[11px]">
                      {host.os ? (
                        <span title={`${host.os.method} — ${host.os.confidence}%`}>
                          {host.os.name} <span className={cn("text-[9px] font-bold", host.os.confidence >= 80 ? "text-safety-low" : host.os.confidence >= 50 ? "text-safety-elevated" : "text-text-tertiary")}>{host.os.confidence}%</span>
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2 text-center font-semibold">{host.ports.length}</td>
                    <td className="px-3 py-2 text-center font-semibold">{host.software.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="outline" size="sm" onClick={() => setStep("upload")}>
              <ArrowLeft size={14} /> {tx(locale, "Back", "뒤로", "戻る")}
            </Button>
            <Button size="sm" onClick={handleImport} loading={importing}>
              {tx(locale, `Import ${scanResult.hosts.length} hosts`, `${scanResult.hosts.length}개 호스트 임포트`, `${scanResult.hosts.length}ホストをインポート`)}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Result */}
      {step === "result" && importResult && (
        <div className="text-center py-6 space-y-4">
          <div className="mx-auto h-14 w-14 rounded-full bg-green-50 flex items-center justify-center">
            <CheckCircle2 size={28} className="text-safety-low" />
          </div>
          <div>
            <p className="text-body-sm font-bold text-text">
              {tx(locale, "Import Complete", "임포트 완료", "インポート完了")}
            </p>
            <p className="text-body-xs text-text-tertiary mt-1">
              {tx(locale,
                `Created ${importResult.hardware} hardware, ${importResult.software} software`,
                `하드웨어 ${importResult.hardware}개, 소프트웨어 ${importResult.software}개 생성됨`,
                `ハードウェア${importResult.hardware}件、ソフトウェア${importResult.software}件作成`)}
              {importResult.skipped > 0 && (
                <span className="text-safety-elevated ml-1">
                  ({importResult.skipped} {tx(locale, "skipped (duplicate IP)", "건 중복 건너뜀", "件スキップ（重複IP）")})
                </span>
              )}
            </p>
          </div>
          <div className="flex justify-center gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={handleClose}>
              {tx(locale, "Close", "닫기", "閉じる")}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
