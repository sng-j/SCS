"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Cpu, Monitor, Server, Radio, Network, Package,
  Plus, Minus, ArrowRight, ArrowLeft, Save, Radar, FileImage, ListPlus, FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

// ─── Device types ───────────────────────────────────────────────────────────

const DEVICE_TYPES = [
  { type: "SERVER",         labelKo: "서버",              labelEn: "Server",         labelJa: "サーバー",          icon: Server,  color: "#2563EB", bg: "#EFF6FF" },
  { type: "PC",             labelKo: "PC / 워크스테이션",  labelEn: "PC / Workstation", labelJa: "PC / ワークステーション", icon: Monitor, color: "#4F46E5", bg: "#EEF2FF" },
  { type: "NETWORK_DEVICE", labelKo: "네트워크 장비",     labelEn: "Network Device",  labelJa: "ネットワーク機器",   icon: Network, color: "#0891B2", bg: "#ECFEFF" },
  { type: "PLC",            labelKo: "PLC / 컨트롤러",    labelEn: "PLC / Controller", labelJa: "PLC / コントローラー", icon: Cpu,    color: "#16A34A", bg: "#F0FDF4" },
  { type: "SENSOR",         labelKo: "센서",              labelEn: "Sensor",          labelJa: "センサー",          icon: Radio,   color: "#D97706", bg: "#FFFBEB" },
  { type: "OTHER_DEVICE",   labelKo: "기타 장치",         labelEn: "Other Device",    labelJa: "その他",            icon: Package, color: "#6B7280", bg: "#F9FAFB" },
];

const DEFAULT_NAMES: Record<string, { ko: string; en: string; ja: string }> = {
  SERVER: { ko: "서버", en: "Server", ja: "サーバー" },
  PC: { ko: "워크스테이션", en: "Workstation", ja: "ワークステーション" },
  NETWORK_DEVICE: { ko: "스위치", en: "Switch", ja: "スイッチ" },
  PLC: { ko: "PLC", en: "PLC", ja: "PLC" },
  SENSOR: { ko: "센서", en: "Sensor", ja: "センサー" },
  OTHER_DEVICE: { ko: "장치", en: "Device", ja: "デバイス" },
};

// ─── Props ──────────────────────────────────────────────────────────────────

interface SimpleSetupProps {
  projectId: string;
  equipmentId: string;
  onComplete: () => void;
  onStartDetail?: () => void;
  onOpenScanImport?: () => void;
  onOpenDiagramImport?: () => void;
  onOpenExcelImport?: () => void;
  initialView?: "choose" | "manual-count";
}

// ─── Component ──────────────────────────────────────────────────────────────

type View = "choose" | "manual-count" | "manual-name";

export function SimpleSetup({ projectId, equipmentId, onComplete, onStartDetail, onOpenScanImport, onOpenDiagramImport, onOpenExcelImport, initialView }: SimpleSetupProps) {
  const { locale } = useLocaleStore();

  const [view, setView] = useState<View>(initialView || "choose");
  const [saving, setSaving] = useState(false);

  const [counts, setCounts] = useState<Record<string, number>>({
    SERVER: 0, PC: 0, NETWORK_DEVICE: 0, PLC: 0, SENSOR: 0, OTHER_DEVICE: 0,
  });
  const [names, setNames] = useState<{ type: string; name: string }[]>([]);

  const totalDevices = Object.values(counts).reduce((a, b) => a + b, 0);

  const adjustCount = (type: string, delta: number) => {
    setCounts((prev) => ({ ...prev, [type]: Math.max(0, (prev[type] || 0) + delta) }));
  };

  const goToNameStep = () => {
    const newNames: { type: string; name: string }[] = [];
    for (const [type, count] of Object.entries(counts)) {
      const names_entry = DEFAULT_NAMES[type] as { ko: string; en: string; ja?: string } | undefined;
      const base = locale === "ko" ? names_entry?.ko : locale === "ja" ? names_entry?.ja : names_entry?.en;
      for (let i = 0; i < count; i++) {
        newNames.push({ type, name: count > 1 ? `${base} #${i + 1}` : base || type });
      }
    }
    setNames(newNames);
    setView("manual-name");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/hardware/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: names, equipmentId }),
      });
      if (res.ok) {
        showToast.success(tx(locale, `${names.length} devices registered`, `${names.length}개 장치 등록 완료`, `${names.length}台のデバイスを登録完了`));
        onComplete();
        onStartDetail?.();
      } else {
        showToast.error(tx(locale, "Registration failed", "등록 실패", "登録失敗"));
      }
    } finally {
      setSaving(false);
    }
  };

  // ─── View: Choose method ──────────────────────────────────────────────

  if (view === "choose") {
    const methods = [
      {
        key: "manual",
        icon: ListPlus,
        titleKo: "수동 입력", titleEn: "Manual Input", titleJa: "手動入力",
        descKo: "장치 유형별 수량을 선택하고 이름을 지정합니다",
        descEn: "Select device quantities by type and assign names",
        descJa: "デバイスタイプ別に数量を選択し、名前を入力します",
        color: "text-brand", bg: "bg-brand-lighter",
        onClick: () => setView("manual-count"),
      },
      {
        key: "scan",
        icon: Radar,
        titleKo: "SC-P 스캔 가져오기", titleEn: "Import SC-P Scan", titleJa: "SC-Pスキャンインポート",
        descKo: "SC-P 스캔 결과에서 장치, 소프트웨어, 네트워크를 자동 구성합니다",
        descEn: "Auto-configure devices, software, and network from SC-P scan results",
        descJa: "SC-Pスキャン結果からデバイス、ソフトウェア、ネットワークを自動構成します",
        color: "text-safety-elevated", bg: "bg-orange-50",
        onClick: onOpenScanImport,
      },
      {
        key: "excel",
        icon: FileSpreadsheet,
        titleKo: "엑셀 벌크 업로드", titleEn: "Excel Bulk Upload", titleJa: "Excelバルクアップロード",
        descKo: "CBS/HW/SW/Connect 시트가 포함된 엑셀 파일로 일괄 등록합니다",
        descEn: "Bulk import from Excel with CBS, HW, SW, and Connect sheets",
        descJa: "CBS/HW/SW/Connectシートを含むExcelファイルから一括登録します",
        color: "text-green-600", bg: "bg-green-50",
        onClick: onOpenExcelImport,
      },
    ];

    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Card padding="none">
          <CardBody>
            <div className="mb-5">
              <h3 className="text-[15px] font-bold text-text">
                {tx(locale, "Choose how to register assets", "자산 등록 방법을 선택하세요", "資産登録方法を選択してください")}
              </h3>
              <p className="text-[12px] text-text-tertiary mt-1">
                {tx(locale, "Enter devices manually, or auto-import from scan/diagram data", "장치를 직접 입력하거나, 스캔/도면 데이터에서 자동으로 가져올 수 있습니다", "デバイスを手動入力するか、スキャン/図面データから自動インポートできます")}
              </p>
            </div>

            <div className="space-y-3">
              {methods.map((m) => {
                if (!m.onClick) return null;
                const Icon = m.icon;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={m.onClick}
                    className="w-full flex items-center gap-4 px-4 py-4 rounded-xl border border-border bg-white hover:border-brand/30 hover:shadow-sm transition-all group text-left"
                  >
                    <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105", m.bg)}>
                      <Icon size={20} className={m.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-text">
                        {locale === "ko" ? m.titleKo : locale === "ja" ? m.titleJa : m.titleEn}
                      </p>
                      <p className="text-[11px] text-text-tertiary mt-0.5 leading-relaxed">
                        {locale === "ko" ? m.descKo : locale === "ja" ? m.descJa : m.descEn}
                      </p>
                    </div>
                    <ArrowRight size={16} className="text-text-tertiary shrink-0 group-hover:text-brand transition-colors" />
                  </button>
                );
              })}
            </div>
          </CardBody>
        </Card>
      </motion.div>
    );
  }

  // ─── View: Manual count ───────────────────────────────────────────────

  if (view === "manual-count") {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Card padding="none">
          <CardBody>
            <div className="mb-5">
              <h3 className="text-[15px] font-bold text-text">
                {tx(locale, "What devices are in your system?", "시스템에 어떤 장치들이 있나요?", "システムにはどのようなデバイスがありますか？")}
              </h3>
              <p className="text-[12px] text-text-tertiary mt-1">
                {tx(locale, "Select quantity per device type. Details can be added later.", "장치 유형별 수량을 선택하세요. 상세 정보는 나중에 입력할 수 있습니다.", "デバイスタイプ別の数量を選択してください。詳細は後で入力できます。")}
              </p>
            </div>

            <div className="space-y-2">
              {DEVICE_TYPES.map((dt) => {
                const Icon = dt.icon;
                const count = counts[dt.type] || 0;
                return (
                  <div
                    key={dt.type}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200",
                      count > 0
                        ? "border-brand/20 bg-brand-lighter/50"
                        : "border-border bg-white hover:border-border-strong",
                    )}
                  >
                    <div className="flex items-center justify-center h-9 w-9 rounded-lg shrink-0" style={{ background: dt.bg }}>
                      <Icon size={17} style={{ color: dt.color }} />
                    </div>
                    <span className="flex-1 text-[13px] font-semibold text-text">
                      {locale === "ko" ? dt.labelKo : locale === "ja" ? dt.labelJa : dt.labelEn}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => adjustCount(dt.type, -1)}
                        disabled={count === 0}
                        className="flex items-center justify-center h-8 w-8 rounded-lg border border-border bg-white text-text-secondary hover:bg-surface-secondary disabled:opacity-30 transition-all"
                      >
                        <Minus size={14} />
                      </button>
                      <span className={cn(
                        "w-8 text-center text-[14px] font-bold tabular-nums",
                        count > 0 ? "text-brand" : "text-border-strong",
                      )}>
                        {count}
                      </span>
                      <button
                        type="button"
                        onClick={() => adjustCount(dt.type, 1)}
                        className="flex items-center justify-center h-8 w-8 rounded-lg border border-border bg-white text-text-secondary hover:bg-surface-secondary transition-all"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalDevices > 0 && (
              <div className="mt-4 flex items-center gap-2 flex-wrap px-3 py-2.5 rounded-lg bg-surface-secondary text-[12px] text-text-secondary">
                <span className="font-semibold">{tx(locale, "To add:", "추가 예정:", "追加予定:")}</span>
                {Object.entries(counts).filter(([, c]) => c > 0).map(([type, c]) => {
                  const dt = DEVICE_TYPES.find((d) => d.type === type);
                  return (
                    <span key={type} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-border/50 text-[11px] font-medium">
                      {locale === "ko" ? dt?.labelKo : locale === "ja" ? dt?.labelJa : dt?.labelEn} x{c}
                    </span>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between pt-4 mt-4 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setView("choose")}>
                <ArrowLeft size={14} /> {tx(locale, "Back", "뒤로", "戻る")}
              </Button>
              <Button disabled={totalDevices === 0} onClick={goToNameStep}>
                {tx(locale, "Next: Name Devices", "다음: 이름 입력", "次へ: デバイス名入力")} <ArrowRight size={14} />
              </Button>
            </div>
          </CardBody>
        </Card>
      </motion.div>
    );
  }

  // ─── View: Manual name ────────────────────────────────────────────────

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card padding="none">
        <CardBody>
          <div className="mb-5">
            <h3 className="text-[15px] font-bold text-text">
              {tx(locale, "Name each device", "각 장치의 이름을 입력하세요", "各デバイスの名前を入力してください")}
            </h3>
            <p className="text-[12px] text-text-tertiary mt-1">
              {tx(locale, "Default names are pre-filled. Edit as needed.", "기본 이름이 설정되어 있습니다. 필요하면 수정하세요.", "デフォルト名が設定されています。必要に応じて編集してください。")}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {names.map((entry, idx) => {
              const dt = DEVICE_TYPES.find((d) => d.type === entry.type);
              const Icon = dt?.icon || Package;
              return (
                <div key={idx} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border bg-white hover:border-border-strong transition-colors">
                  <div className="flex items-center justify-center h-8 w-8 rounded-lg shrink-0" style={{ background: dt?.bg || "#F9FAFB" }}>
                    <Icon size={15} style={{ color: dt?.color || "#6B7280" }} />
                  </div>
                  <input
                    type="text"
                    value={entry.name}
                    onChange={(e) => {
                      const updated = [...names];
                      updated[idx] = { ...updated[idx], name: e.target.value };
                      setNames(updated);
                    }}
                    className="flex-1 h-8 px-2 text-[13px] text-text bg-transparent border-none outline-none focus:ring-0 placeholder:text-border-strong"
                    placeholder={tx(locale, "Device name", "장치 이름", "デバイス名")}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-5 mt-5 border-t border-border">
            <Button variant="outline" onClick={() => setView("manual-count")}>
              <ArrowLeft size={14} /> {tx(locale, "Back", "이전", "戻る")}
            </Button>
            <Button onClick={handleSave} loading={saving}>
              <Save size={14} /> {tx(locale, `Register ${names.length} Devices`, `${names.length}개 장치 등록`, `${names.length}台のデバイスを登録`)}
            </Button>
          </div>
        </CardBody>
      </Card>
    </motion.div>
  );
}
