"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import AutocompleteInput from "@/components/ui/autocomplete-input";
import { useLocaleStore } from "@/stores/locale-store";
import { tx, formError } from "@/lib/i18n";
import { useChatStore } from "@/stores/chat-store";
import { cn } from "@/lib/utils";
import { type Hardware, type Software, type SwForm, swSchema, SW_TYPES } from "./inventory-types";

interface SwDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: SwForm) => Promise<void>;
  editing: Software | null;
  hardwareList: Hardware[];
  preSelectedHardwareId?: string;
  projectId?: string;
}

export function SwDialog({ open, onClose, onSave, editing, hardwareList, preSelectedHardwareId, projectId }: SwDialogProps) {
  const { locale } = useLocaleStore();
  const [saving, setSaving] = useState(false);
  const [showExtra, setShowExtra] = useState(false);

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<SwForm>({
    resolver: zodResolver(swSchema),
  });

  const setPageFormData = useChatStore((s) => s.setPageFormData);
  const watchedValues = useWatch({ control });
  useEffect(() => {
    if (open) {
      const { name, version, vendor, swType } = watchedValues;
      if (name || version || vendor) {
        setPageFormData({ formType: "software", name, version, vendor, swType });
      }
    } else {
      setPageFormData({});
    }
  }, [open, watchedValues, setPageFormData]);

  useEffect(() => {
    if (open) {
      reset(editing ? {
        name: editing.name,
        vendor: editing.vendor || "",
        modelName: editing.modelName || "",
        purpose: editing.purpose || "",
        version: editing.version || "",
        osVersion: (editing as unknown as Record<string, unknown>).osVersion as string || "",
        firmwareVersion: (editing as unknown as Record<string, unknown>).firmwareVersion as string || "",
        hardwareId: editing.hardwareId || "",
        updateLog: (editing as unknown as Record<string, unknown>).updateLog as string || "",
        swType: editing.swType,
        cpe: editing.cpe || "",
        brand: editing.brand || "",
        listeningPort: editing.listeningPort || "",
      } : {
        name: "", vendor: "", modelName: "", purpose: "",
        version: "", osVersion: "", firmwareVersion: "",
        hardwareId: preSelectedHardwareId || "",
        updateLog: "", swType: "APPLICATION",
        cpe: "", brand: "", listeningPort: "",
      });
      setShowExtra(false);
    }
  }, [open, editing, reset, preSelectedHardwareId]);

  // Find selected HW name for context
  const selectedHwName = useMemo(() => {
    const hwId = watchedValues.hardwareId;
    if (!hwId) return "";
    return hardwareList.find((h) => h.id === hwId)?.name || "";
  }, [watchedValues.hardwareId, hardwareList]);

  const acContext = useMemo(() => ({
    swType: watchedValues.swType || "APPLICATION",
    hardwareName: selectedHwName,
    name: watchedValues.name || "",
  }), [watchedValues.swType, selectedHwName, watchedValues.name]);

  const onSubmit = async (data: SwForm) => {
    setSaving(true);
    try { await onSave(data); } finally { setSaving(false); }
  };

  const pid = projectId || "";

  return (
    <Dialog open={open} onClose={onClose} title={editing ? tx(locale, "Edit Software", "소프트웨어 수정", "ソフトウェア編集") : tx(locale, "Add Software", "소프트웨어 추가", "ソフトウェア追加")} maxWidth="max-w-xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

        {/* ── E27 Required Fields ── */}
        <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">{tx(locale, "E27 Required Fields", "E27 필수 항목", "E27 必須項目")}</p>

        <div className="grid grid-cols-2 gap-3">
          <Field label={tx(locale, "Name", "이름", "名前")} required error={formError(locale, errors.name?.message)}>
            {pid ? (
              <Controller name="name" control={control} render={({ field: f }) => (
                <AutocompleteInput value={f.value} onChange={f.onChange} projectId={pid} field="name" kind="sw" context={acContext}
                  placeholder="e.g. Windows Server 2019" className={inputCls(!!errors.name)} />
              )} />
            ) : (
              <input placeholder="e.g. Windows Server 2019" className={inputCls(!!errors.name)} {...register("name")} />
            )}
          </Field>
          <Field label={tx(locale, "Type", "유형", "タイプ")}>
            <select className={selectCls} {...register("swType")}>
              {SW_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={tx(locale, "Brand / Manufacturer", "브랜드/제조사", "ブランド/メーカー")} required error={formError(locale, errors.vendor?.message)}>
            {pid ? (
              <Controller name="vendor" control={control} render={({ field: f }) => (
                <AutocompleteInput value={f.value} onChange={f.onChange} projectId={pid} field="vendor" kind="sw" context={acContext}
                  placeholder="e.g. Microsoft" className={inputCls(!!errors.vendor)} />
              )} />
            ) : (
              <input placeholder="e.g. Microsoft" className={inputCls(!!errors.vendor)} {...register("vendor")} />
            )}
          </Field>
          <Field label={tx(locale, "Software Version", "소프트웨어 버전", "ソフトウェアバージョン")} required error={formError(locale, errors.version?.message)}>
            {pid ? (
              <Controller name="version" control={control} render={({ field: f }) => (
                <AutocompleteInput value={f.value} onChange={f.onChange} projectId={pid} field="version" kind="sw" context={acContext}
                  placeholder="e.g. 10.0.17763" className={inputCls(!!errors.version)} />
              )} />
            ) : (
              <input placeholder="e.g. 10.0.17763" className={inputCls(!!errors.version)} {...register("version")} />
            )}
          </Field>
        </div>

        <Field
          label={tx(locale, "Description of Functionality / Purpose", "기능/목적 설명", "機能/目的の説明")}
          required
          error={formError(locale, errors.purpose?.message)}
        >
          <input placeholder={tx(locale, "Brief description", "기능 및 용도에 대한 간략한 설명", "簡単な説明")} className={inputCls(!!errors.purpose)} {...register("purpose")} />
        </Field>

        <Field label={tx(locale, "Installed Location (HW)", "설치 위치 (하드웨어)", "インストール場所（HW）")} required error={formError(locale, errors.hardwareId?.message)}>
          <select className={cn(selectCls, errors.hardwareId && errBorder)} {...register("hardwareId")}>
            <option value="">{tx(locale, "Select", "선택", "選択")}</option>
            {hardwareList.map((hw) => <option key={hw.id} value={hw.id}>{hw.name}</option>)}
          </select>
          <p className="text-[10px] text-text-tertiary mt-1">
            {tx(
              locale,
              "For PLC modular configurations, register one SW per CPU module — I/O modules don't need separate entries.",
              "PLC 모듈형 구성: CPU 모듈 기준으로 SW 등록 — I/O 모듈은 별도 등록 불필요",
              "PLCモジュール構成: CPUモジュール基準でSW登録 — I/Oモジュールは登録不要",
            )}
          </p>
        </Field>

        {/* ── E27 Recommended (벤더가 모를 수 있는 항목) ── */}
        <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/40 p-3 space-y-3">
          <div className="flex items-start gap-2">
            <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider flex-1">
              {tx(locale, "E27 Recommended", "E27 권장", "E27推奨")}
            </p>
            <p className="text-[10px] text-amber-700 italic">
              {tx(locale, "Leave blank for embedded SW without model name", "임베디드 SW로 모델명 없으면 비워두기", "モデル名がない組込SWなら空欄")}
            </p>
          </div>

          <Field
            label={tx(locale, "Model / Type", "모델/타입", "モデル/タイプ")}
            recommended
          >
            <input placeholder={tx(locale, "e.g. Enterprise Edition — blank if N/A", "예: Enterprise — 해당 없으면 비우기", "例: Enterprise — 該当なしなら空欄")} className={inputCls(false)} {...register("modelName")} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={tx(locale, "OS Version", "OS 버전", "OSバージョン")}>
              <input placeholder={tx(locale, "OS type only", "OS 타입만 해당", "OSタイプのみ")} className={inputCls(false)} {...register("osVersion")} />
            </Field>
            <Field label={tx(locale, "Firmware Version", "펌웨어 버전", "ファームウェアバージョン")}>
              <input placeholder={tx(locale, "FW type only", "FW 타입만 해당", "FWタイプのみ")} className={inputCls(false)} {...register("firmwareVersion")} />
            </Field>
          </div>
        </div>

        {/* ── Optional: Updated Log ── */}
        <Field label={tx(locale, "Updated Log", "업데이트 로그", "更新ログ")}>
          <textarea placeholder={tx(locale, "Date, changes, version, author", "업데이트 날짜, 변경사항, 버전정보, 수행자", "日付、変更内容、バージョン、実行者")}
            className={cn(inputCls(false), "h-16 resize-y py-2")} {...register("updateLog")} />
        </Field>

        {/* ── Extra fields ── */}
        <button type="button" onClick={() => setShowExtra(!showExtra)}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-brand hover:text-brand-active transition-colors">
          <ChevronDown size={14} className={cn("transition-transform", showExtra && "rotate-180")} />
          {tx(locale, "Additional Info (optional)", "추가 정보 (선택)", "追加情報（任意）")}
        </button>

        {showExtra && (
          <div className="space-y-3 rounded-xl border border-border bg-surface-secondary/30 p-4">
            <Field label="CPE">
              <input placeholder="cpe:2.3:o:microsoft:windows_server_2019:*" className={cn(inputCls(false), "font-mono text-[11px]")} {...register("cpe")} />
              <p className="text-[10px] text-text-tertiary mt-1">{tx(locale, "Used for CVE matching", "CVE 자동 매칭에 사용됩니다", "CVE自動マッチングに使用されます")}</p>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={tx(locale, "Brand", "브랜드", "ブランド")}>
                <input className={inputCls(false)} {...register("brand")} />
              </Field>
              <Field label={tx(locale, "Listening Port", "리스닝 포트", "リスニングポート")}>
                {pid ? (
                  <Controller name="listeningPort" control={control} render={({ field: f }) => (
                    <AutocompleteInput value={f.value || ""} onChange={f.onChange} projectId={pid} field="listeningPort" kind="sw" context={acContext}
                      placeholder="443, 8080" className={cn(inputCls(false), "font-mono")} />
                  )} />
                ) : (
                  <input placeholder="443, 8080" className={cn(inputCls(false), "font-mono")} {...register("listeningPort")} />
                )}
              </Field>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>{tx(locale, "Cancel", "취소", "キャンセル")}</Button>
          <Button type="submit" size="sm" loading={saving}>{tx(locale, "Save", "저장", "保存")}</Button>
        </div>
      </form>
    </Dialog>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Field({ label, required, recommended, error, hint, children }: {
  label: string;
  required?: boolean;       // HARD: 빨간 별표, 검증 차단
  recommended?: boolean;    // SOFT: 주황 별표, 검증 통과 (E27 권장)
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold text-text-secondary flex items-center gap-1">
        <span>{label}</span>
        {required && <span className="text-safety-high">*</span>}
        {/* recommended: 별표 없이 amber 테두리만 */}
      </label>
      {children}
      {error && <p className="text-[10px] text-safety-high">{error}</p>}
      {hint && !error && <p className="text-[10px] text-text-tertiary">{hint}</p>}
    </div>
  );
}

const baseInput = "h-9 w-full rounded-[var(--radius-sm)] border px-3 text-[12px] text-text placeholder:text-border-strong transition-all duration-200 focus:outline-none focus:ring-2 focus:border-transparent";
const errBorder = "border-safety-high bg-risk-bg/50 focus:ring-safety-high/30";

function inputCls(hasError: boolean) {
  return cn(baseInput, hasError ? errBorder : "border-border bg-white hover:border-border-strong focus:ring-brand/30");
}

const selectCls = cn(baseInput,
  "border-border bg-white hover:border-border-strong focus:ring-brand/30 appearance-none",
  "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%238D8D8D%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-10",
);
