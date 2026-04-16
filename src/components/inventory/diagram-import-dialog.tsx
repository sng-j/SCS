"use client";

import { useState, useCallback, useRef } from "react";
import {
  FileImage, Upload, ArrowRight, ArrowLeft, CheckCircle2,
  Server, Monitor, Cpu, Network, HardDrive, AlertCircle, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DiagramDevice {
  name: string;
  id: string;
  zone: string;
  category: string;
  hwType: string;
  x: number;
  y: number;
}

interface DiagramImportDialogProps {
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

const TYPE_COLORS: Record<string, string> = {
  SERVER: "bg-blue-50 text-blue-700",
  PC: "bg-indigo-50 text-indigo-700",
  NETWORK_DEVICE: "bg-teal-50 text-teal-700",
  PLC: "bg-purple-50 text-purple-700",
  SENSOR: "bg-amber-50 text-amber-700",
  OTHER_DEVICE: "bg-surface-secondary text-text-secondary",
};

type Step = "upload" | "analyzing" | "preview" | "result";

// ─── Component ───────────────────────────────────────────────────────────────

export function DiagramImportDialog({ open, onClose, projectId, equipmentId, onComplete }: DiagramImportDialogProps) {
  const { locale } = useLocaleStore();

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [devices, setDevices] = useState<DiagramDevice[]>([]);
  const [connections, setConnections] = useState<{ from: string; to: string; type: string }[]>([]);
  const [stats, setStats] = useState<{ ocrItems: number; candidates: number; devices: number; connections: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ hardware: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzeProgress, setAnalyzeProgress] = useState("");
  const [analyzeStep, setAnalyzeStep] = useState(0); // 0=idle, 1=OCR, 2=cleanup, 3=connections, 4=done
  const [minimized, setMinimized] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    setStep("upload");
    setFile(null);
    setDevices([]);
    setConnections([]);
    setStats(null);
    setImporting(false);
    setImportResult(null);
    setError(null);
    setAnalyzeProgress("");
    onClose();
  }, [onClose]);

  // ── Upload & Analyze ─────────────────────────────────────────────────────

  const handleFile = useCallback((f: File) => {
    const ext = f.name.toLowerCase().split(".").pop();
    if (!["pdf", "png", "jpg", "jpeg", "bmp", "tiff"].includes(ext || "")) {
      setError(tx(locale, "Unsupported file type (use PDF, PNG, JPG)", "지원하지 않는 파일 형식입니다 (PDF, PNG, JPG 사용)", "サポートされていないファイル形式です（PDF、PNG、JPGを使用）"));
      return;
    }
    setFile(f);
    setError(null);
  }, [locale]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleAnalyze = useCallback(async () => {
    if (!file) return;
    setStep("analyzing");
    setError(null);
    setAnalyzeStep(1);
    setAnalyzeProgress(tx(locale, "Extracting text with OCR...", "OCR로 텍스트를 추출하고 있습니다...", "OCRでテキストを抽出しています..."));

    try {
      // Step 1: OCR (fast, ~2-5 sec)
      const formData = new FormData();
      formData.append("file", file);
      const res1 = await fetch(`/api/projects/${projectId}/import-diagram?action=step1_ocr`, {
        method: "POST",
        body: formData,
      });
      if (!res1.ok) throw new Error("OCR failed");
      const step1Data = await res1.json();

      setAnalyzeStep(2);
      setAnalyzeProgress(tx(locale, "AI is cleaning up device names...", "AI가 장치명을 정리하고 있습니다...", "AIがデバイス名を整理しています..."));

      // Step 2: LLM cleanup (~20-60 sec)
      const res2 = await fetch(`/api/projects/${projectId}/import-diagram?action=step2_cleanup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates: step1Data.candidates }),
      });
      if (!res2.ok) throw new Error("Device cleanup failed");
      const step2Data = await res2.json();

      setAnalyzeStep(3);
      setAnalyzeProgress(tx(locale, "Analyzing network connections...", "네트워크 연결을 분석하고 있습니다...", "ネットワーク接続を分析しています..."));

      // Step 3: LLM connections (~20-60 sec)
      const res3 = await fetch(`/api/projects/${projectId}/import-diagram?action=step3_connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devices: step2Data.devices, ocrItems: step1Data.ocrItems }),
      });
      if (!res3.ok) throw new Error("Connection analysis failed");
      const step3Data = await res3.json();

      setAnalyzeStep(4);
      setDevices(step2Data.devices || []);
      setConnections(step3Data.connections || []);
      setStats({
        ocrItems: step1Data.ocrItemCount,
        candidates: step1Data.candidateCount,
        devices: (step2Data.devices || []).length,
        connections: (step3Data.connections || []).length,
      });
      setStep("preview");
      setMinimized(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : tx(locale, "Analysis failed", "분석 실패", "分析失敗"));
      setStep("upload");
      setAnalyzeStep(0);
    }
  }, [file, projectId, locale]);

  // ── Device editing ───────────────────────────────────────────────────────

  const updateDevice = useCallback((idx: number, field: keyof DiagramDevice, value: string) => {
    setDevices((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  }, []);

  const removeDevice = useCallback((idx: number) => {
    setDevices((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const addDevice = useCallback(() => {
    setDevices((prev) => [...prev, {
      name: "",
      id: "",
      zone: prev.length > 0 ? prev[prev.length - 1].zone : "Lv1",
      category: "",
      hwType: "OTHER_DEVICE",
      x: 0,
      y: 0,
    }]);
  }, []);

  // ── Import ───────────────────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (devices.length === 0) return;
    setImporting(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/import-diagram?action=import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devices, connections, equipmentId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Import failed");
      }

      const data = await res.json();
      setImportResult({ hardware: data.created.hardware, skipped: data.skipped });
      setStep("result");
      showToast.success(
        tx(locale, `Created ${data.created.hardware} devices + DFD`, `${data.created.hardware}개 장치 + DFD 생성 완료`, `${data.created.hardware}台のデバイス + DFD作成完了`),
      );
      onComplete();
    } catch (err) {
      showToast.error(tx(locale, "Import failed", "임포트 실패", "インポート失敗"));
      console.error("[diagram-import]", err);
    } finally {
      setImporting(false);
    }
  }, [devices, projectId, equipmentId, locale, onComplete]);

  // ── Render ───────────────────────────────────────────────────────────────

  // Minimized floating progress bar
  if (minimized && step === "analyzing") {
    return (
      <div className="fixed bottom-4 left-[260px] z-50 bg-white border border-border rounded-xl shadow-lg px-4 py-3 flex items-center gap-3 min-w-[360px]">
        <Loader2 size={16} className="text-brand animate-spin shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-text truncate">{analyzeProgress}</p>
          <div className="w-full bg-surface-secondary rounded-full h-1.5 mt-1">
            <div className="bg-brand h-1.5 rounded-full transition-all duration-700" style={{ width: `${Math.min((analyzeStep / 4) * 100, 95)}%` }} />
          </div>
        </div>
        <button onClick={() => setMinimized(false)} className="text-[10px] font-semibold text-brand hover:underline shrink-0">
          {tx(locale, "Open", "열기", "開く")}
        </button>
      </div>
    );
  }

  return (
    <Dialog open={open && !minimized} onClose={step === "analyzing" ? () => setMinimized(true) : handleClose} title={tx(locale, "Import Network Diagram", "네트워크 도면 가져오기", "ネットワーク図面インポート")} maxWidth="max-w-5xl">

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div className="space-y-5">
          <div
            ref={dropRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className={cn(
              "border-2 border-dashed rounded-[var(--radius-md)] p-8 text-center transition-colors cursor-pointer",
              file ? "border-brand/40 bg-brand-lighter/20" : "border-border hover:border-brand/40 hover:bg-brand-lighter/10",
            )}
            onClick={() => document.getElementById("diagram-file-input")?.click()}
          >
            <input
              id="diagram-file-input"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.bmp,.tiff"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            {file ? (
              <>
                <CheckCircle2 size={32} className="mx-auto text-safety-low mb-3" />
                <p className="text-body-sm font-bold text-text">{file.name}</p>
                <p className="text-body-xs text-text-tertiary mt-1">
                  {(file.size / 1024).toFixed(0)} KB — {tx(locale, "Click to change", "클릭하여 변경", "クリックして変更")}
                </p>
              </>
            ) : (
              <>
                <FileImage size={32} className="mx-auto text-text-tertiary mb-3" />
                <p className="text-body-sm font-semibold text-text">
                  {tx(locale, "Select a network diagram file", "네트워크 도면 파일을 선택하세요", "ネットワーク図面ファイルを選択してください")}
                </p>
                <p className="text-body-xs text-text-tertiary mt-1">
                  PDF, PNG, JPG {tx(locale, "supported", "지원", "対応")}
                </p>
              </>
            )}
          </div>

          <div className="flex items-start gap-3 p-3 rounded-[var(--radius-md)] bg-brand-lighter/20 border border-brand/10">
            <FileImage size={16} className="text-brand shrink-0 mt-0.5" />
            <div className="text-body-xs text-text-secondary">
              <p className="font-semibold text-text mb-1">{tx(locale, "Auto-extracted data", "자동 추출 항목", "自動抽出データ")}</p>
              <p>{tx(locale,
                "Automatically extracts device names, types, zones (Lv1-4), and equipment IDs. Creates both inventory and DFD.",
                "도면에서 장치명, 유형, 존(Lv1~4), 장비ID를 자동으로 추출하고, 인벤토리와 DFD를 동시에 생성합니다.",
                "図面からデバイス名、タイプ、ゾーン(Lv1-4)、機器IDを自動抽出し、インベントリとDFDを同時に作成します。"
              )}</p>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] bg-risk-bg text-safety-high text-body-xs">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={handleClose}>
              {tx(locale, "Cancel", "취소", "キャンセル")}
            </Button>
            <Button size="sm" onClick={handleAnalyze} disabled={!file}>
              {tx(locale, "Start Analysis", "분석 시작", "分析開始")} <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Analyzing */}
      {step === "analyzing" && (
        <div className="py-8 px-4 space-y-6">
          <div className="text-center mb-4">
            <p className="text-body-sm font-bold text-text">
              {tx(locale, "Analyzing diagram", "도면을 분석하고 있습니다", "図面を分析しています")}
            </p>
            <p className="text-[11px] text-text-tertiary mt-1">{file?.name}</p>
          </div>

          {/* Step progress */}
          <div className="space-y-3">
            {[
              { step: 1, en: "OCR text extraction", ko: "OCR 텍스트 추출", ja: "OCRテキスト抽出", time: "~3s" },
              { step: 2, en: "AI device name cleanup", ko: "AI 장비명 정리", ja: "AIデバイス名整理", time: "~30s" },
              { step: 3, en: "Network connection analysis", ko: "네트워크 연결 분석", ja: "ネットワーク接続分析", time: "~30s" },
              { step: 4, en: "Preparing preview", ko: "미리보기 준비", ja: "プレビュー準備", time: "" },
            ].map((s) => {
              const isDone = analyzeStep > s.step;
              const isActive = analyzeStep === s.step;
              return (
                <div key={s.step} className={cn("flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all",
                  isDone ? "bg-green-50" : isActive ? "bg-brand-lighter/50" : "bg-surface-secondary/30"
                )}>
                  <div className={cn("h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold",
                    isDone ? "bg-safety-low text-white" : isActive ? "bg-brand text-white" : "bg-surface-tertiary/50 text-text-tertiary"
                  )}>
                    {isDone ? <CheckCircle2 size={14} /> : isActive ? <Loader2 size={14} className="animate-spin" /> : s.step}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-[12px] font-semibold", isDone ? "text-safety-low" : isActive ? "text-brand" : "text-text-tertiary")}>
                      {tx(locale, s.en, s.ko, s.ja)}
                    </p>
                  </div>
                  {isActive && s.time && (
                    <span className="text-[10px] text-text-tertiary shrink-0">{s.time}</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div className="w-full bg-surface-secondary rounded-full h-2">
            <div
              className="bg-brand h-2 rounded-full transition-all duration-700"
              style={{ width: `${Math.min((analyzeStep / 4) * 100, 95)}%` }}
            />
          </div>

          <div className="flex justify-center gap-3">
            <Button size="sm" variant="outline" onClick={() => setMinimized(true)}>
              {tx(locale, "Minimize", "최소화", "最小化")}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === "preview" && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-brand-lighter/30 border border-brand/10">
            <FileImage size={16} className="text-brand" />
            <p className="text-body-xs font-semibold text-text">
              {devices.length} {tx(locale, "devices extracted", "개 장치 추출됨", "台のデバイス抽出")}
              {stats && <span className="text-text-tertiary font-normal"> (OCR {stats.ocrItems} → {tx(locale, "candidates", "후보", "候補")} {stats.candidates} → {tx(locale, "cleaned", "정제", "整理")} {stats.devices}, {tx(locale, "connections", "연결", "接続")} {stats.connections || 0})</span>}
            </p>
            <div className="flex gap-1.5 ml-auto text-[10px] font-bold">
              {Object.entries(
                devices.reduce<Record<string, number>>((acc, d) => { acc[d.hwType] = (acc[d.hwType] || 0) + 1; return acc; }, {}),
              ).map(([type, count]) => (
                <span key={type} className={cn("px-1.5 py-0.5 rounded", TYPE_COLORS[type] || "bg-surface-secondary text-text-secondary")}>
                  {count}
                </span>
              ))}
            </div>
          </div>

          {/* Device table */}
          <div className="max-h-[400px] overflow-auto border border-border rounded-[var(--radius-md)]">
            <table className="w-full text-body-xs table-fixed">
              <thead>
                <tr className="bg-white border-b border-border sticky top-0 z-10 shadow-xs">
                  <th className="px-3 py-2 text-left font-bold text-text-tertiary whitespace-nowrap w-[80px]">{tx(locale, "Zone", "존", "ゾーン")}</th>
                  <th className="px-3 py-2 text-left font-bold text-text-tertiary whitespace-nowrap w-[120px]">{tx(locale, "Type", "유형", "タイプ")}</th>
                  <th className="px-3 py-2 text-left font-bold text-text-tertiary whitespace-nowrap">{tx(locale, "Device Name", "장치명", "デバイス名")}</th>
                  <th className="px-3 py-2 text-left font-bold text-text-tertiary whitespace-nowrap w-[100px]">ID</th>
                  <th className="px-3 py-2 text-left font-bold text-text-tertiary whitespace-nowrap w-[80px]">{tx(locale, "Cat.", "카테고리", "カテゴリ")}</th>
                  <th className="px-3 py-2 w-[40px]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {devices.map((dev, idx) => (
                  <tr key={idx} className="hover:bg-surface-secondary/30 transition-colors">
                    <td className="px-3 py-2">
                      <input
                        value={dev.zone}
                        onChange={(e) => updateDevice(idx, "zone", e.target.value)}
                        className="h-7 w-[70px] px-2 rounded border border-border text-[11px] font-semibold text-brand bg-white focus:outline-none focus:ring-1 focus:ring-brand/30"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={dev.hwType}
                        onChange={(e) => updateDevice(idx, "hwType", e.target.value)}
                        className="h-7 px-1.5 rounded border border-border text-[11px] font-semibold bg-white focus:outline-none focus:ring-1 focus:ring-brand/30"
                      >
                        {HW_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={dev.name}
                        onChange={(e) => updateDevice(idx, "name", e.target.value)}
                        className="h-7 w-full px-2 rounded border border-border text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-brand/30"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={dev.id}
                        onChange={(e) => updateDevice(idx, "id", e.target.value)}
                        className="h-7 w-full px-2 rounded border border-border font-mono text-[10px] bg-white focus:outline-none focus:ring-1 focus:ring-brand/30"
                        placeholder="—"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={dev.category}
                        onChange={(e) => updateDevice(idx, "category", e.target.value)}
                        className="h-7 w-full px-2 rounded border border-border text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-brand/30"
                        placeholder="—"
                      />
                    </td>
                    <td className="px-3 py-1">
                      <button
                        onClick={() => removeDevice(idx)}
                        className="p-1 rounded text-text-tertiary hover:text-safety-high hover:bg-risk-bg transition-colors"
                        title={tx(locale, "Remove", "제거", "削除")}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add device button */}
          <button
            type="button"
            onClick={addDevice}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-[var(--radius-sm)] border border-dashed border-border text-body-xs font-medium text-text-tertiary hover:text-brand hover:border-brand/30 hover:bg-brand-lighter/20 transition-all"
          >
            + {tx(locale, "Add Device", "장치 추가", "デバイス追加")}
          </button>

          <div className="flex justify-between pt-2">
            <Button variant="outline" size="sm" onClick={() => { setStep("upload"); setDevices([]); }}>
              <ArrowLeft size={14} /> {tx(locale, "Re-analyze", "다시 분석", "再分析")}
            </Button>
            <Button size="sm" onClick={handleImport} loading={importing}>
              {tx(locale, `Create ${devices.length} devices + DFD`, `${devices.length}개 장치 + DFD 생성`, `${devices.length}台のデバイス + DFD作成`)}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Result */}
      {step === "result" && importResult && (
        <div className="text-center py-6 space-y-4">
          <div className="mx-auto h-14 w-14 rounded-full bg-green-50 flex items-center justify-center">
            <CheckCircle2 size={28} className="text-safety-low" />
          </div>
          <div>
            <p className="text-body-sm font-bold text-text">
              {tx(locale, "Diagram Import Complete", "도면 임포트 완료", "図面インポート完了")}
            </p>
            <p className="text-body-xs text-text-tertiary mt-1">
              {tx(locale,
                `Created ${importResult.hardware} hardware + DFD diagram`,
                `하드웨어 ${importResult.hardware}개 + DFD 다이어그램 생성됨`,
                `ハードウェア${importResult.hardware}件 + DFDダイアグラム作成`)}
              {importResult.skipped > 0 && (
                <span className="text-safety-elevated ml-1">
                  ({importResult.skipped} {tx(locale, "skipped", "건 중복 건너뜀", "件スキップ")})
                </span>
              )}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleClose}>
            {tx(locale, "Close", "닫기", "閉じる")}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
