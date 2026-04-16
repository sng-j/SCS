"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import AutocompleteInput from "@/components/ui/autocomplete-input";
import { useLocaleStore } from "@/stores/locale-store";
import { SHIP_LOCATIONS, ACCESS_CONTROL_LEVELS } from "@/lib/constants";
import { tx, formError } from "@/lib/i18n";
import { useChatStore } from "@/stores/chat-store";
import { cn } from "@/lib/utils";
import { type Hardware, type HwForm, hwSchema, HW_TYPES, ZONE_OPTIONS, DEVICE_FIELD_CONFIG, type FieldConfig, isValidIp, isValidMac } from "./inventory-types";

interface HwDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: HwForm) => Promise<void>;
  editing: Hardware | null;
  projectId?: string;
}

export function HwDialog({ open, onClose, onSave, editing, projectId }: HwDialogProps) {
  const { locale } = useLocaleStore();
  const [saving, setSaving] = useState(false);
  const [showExtra, setShowExtra] = useState(false);

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<HwForm>({
    resolver: zodResolver(hwSchema),
    defaultValues: {
      name: "", type: "", manufacturer: "", model: "",
      purpose: "", physicalInterface: "", sysSoftwareCategory: "", sysSoftwareVersion: "",
      commProtocols: "", updateLog: "",
      ipAddress: "", macAddress: "", zone: "", location: "",
      brand: "", identifier: "", category: "", logicalLocation: "", protectionMethod: "",
    },
  });

  const setPageFormData = useChatStore((s) => s.setPageFormData);
  const watchedValues = useWatch({ control });
  useEffect(() => {
    if (open) {
      const { name, type, manufacturer, ipAddress, zone } = watchedValues;
      if (name || type || manufacturer || ipAddress) {
        setPageFormData({ formType: "hardware", name, type, manufacturer, ipAddress, zone });
      }
    } else {
      setPageFormData({});
    }
  }, [open, watchedValues, setPageFormData]);

  useEffect(() => {
    if (open) {
      reset(editing ? {
        name: editing.name, type: editing.type,
        manufacturer: editing.manufacturer || "", model: editing.model || "",
        purpose: editing.purpose || "",
        physicalInterface: editing.physicalInterface || "",
        sysSoftwareCategory: editing.sysSoftwareCategory || "",
        sysSoftwareVersion: editing.sysSoftwareVersion || "",
        commProtocols: editing.commProtocols || "",
        updateLog: (editing as unknown as Record<string, unknown>).updateLog as string || "",
        ipAddress: editing.ipAddress || "", macAddress: editing.macAddress || "",
        zone: editing.zone || "", location: editing.location || "",
        brand: editing.brand || "", identifier: editing.identifier || "",
        category: editing.category || "",
        logicalLocation: editing.logicalLocation || "",
        protectionMethod: editing.protectionMethod || "",
      } : {
        name: "", type: "", manufacturer: "", model: "",
        purpose: "", physicalInterface: "", sysSoftwareCategory: "", sysSoftwareVersion: "",
        commProtocols: "", updateLog: "",
        ipAddress: "", macAddress: "", zone: "", location: "",
        brand: "", identifier: "", category: "", logicalLocation: "", protectionMethod: "",
      });
      setShowExtra(false);
    }
  }, [open, editing, reset]);

  // Context for autocomplete (changes when user fills fields)
  const acContext = useMemo(() => ({
    type: watchedValues.type || "",
    name: watchedValues.name || "",
    manufacturer: watchedValues.manufacturer || "",
  }), [watchedValues.type, watchedValues.name, watchedValues.manufacturer]);

  // 선택된 타입에 따라 DEVICE_FIELD_CONFIG 참조 → hidden 필드 숨김
  const selectedType = watchedValues.type || "OTHER_DEVICE";
  const fc = DEVICE_FIELD_CONFIG[selectedType] || DEVICE_FIELD_CONFIG.OTHER_DEVICE;
  const isVis = (f: keyof FieldConfig) => fc[f] !== "hidden";

  const onSubmit = async (data: HwForm) => {
    setSaving(true);
    try { await onSave(data); } finally { setSaving(false); }
  };

  const pid = projectId || "";

  return (
    <Dialog open={open} onClose={onClose} title={editing ? tx(locale, "Edit Hardware", "하드웨어 수정", "ハードウェア編集") : tx(locale, "Add Hardware", "하드웨어 추가", "ハードウェア追加")} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

        {/* ── E27 Required Fields ── */}
        <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">{tx(locale, "E27 Required Fields", "E27 필수 항목", "E27 必須項目")}</p>

        <div className="grid grid-cols-2 gap-3">
          <Field label={tx(locale, "Name", "이름", "名前")} required error={formError(locale, errors.name?.message)}>
            <input placeholder="e.g. Main Server" className={inputCls(!!errors.name)} {...register("name")} />
          </Field>
          <Field label={tx(locale, "Type", "유형", "タイプ")} required error={formError(locale, errors.type?.message)}>
            <select className={cn(selectCls, errors.type && errBorder)} {...register("type")}>
              <option value="">{tx(locale, "Select", "선택", "選択")}</option>
              {HW_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={tx(locale, "Brand / Manufacturer", "브랜드/제조사", "ブランド/メーカー")} required error={formError(locale, errors.manufacturer?.message)}>
            {pid ? (
              <Controller name="manufacturer" control={control} render={({ field: f }) => (
                <AutocompleteInput value={f.value} onChange={f.onChange} projectId={pid} field="manufacturer" context={acContext}
                  placeholder="e.g. Siemens" className={inputCls(!!errors.manufacturer)} />
              )} />
            ) : (
              <input placeholder="e.g. Siemens" className={inputCls(!!errors.manufacturer)} {...register("manufacturer")} />
            )}
          </Field>
          <Field label={tx(locale, "Model / Type", "모델/타입", "モデル/タイプ")} required error={formError(locale, errors.model?.message)}>
            {pid ? (
              <Controller name="model" control={control} render={({ field: f }) => (
                <AutocompleteInput value={f.value} onChange={f.onChange} projectId={pid} field="model" context={acContext}
                  placeholder="e.g. S7-1500" className={inputCls(!!errors.model)} />
              )} />
            ) : (
              <input placeholder="e.g. S7-1500" className={inputCls(!!errors.model)} {...register("model")} />
            )}
          </Field>
        </div>

        <Field label={tx(locale, "Description of Functionality / Purpose", "기능/목적 설명", "機能/目的の説明")} required error={formError(locale, errors.purpose?.message)}>
          {pid ? (
            <Controller name="purpose" control={control} render={({ field: f }) => (
              <AutocompleteInput value={f.value} onChange={f.onChange} projectId={pid} field="purpose" context={acContext}
                placeholder={tx(locale, "Brief description of functionality", "기능 및 용도에 대한 간략한 설명", "機能と用途の簡単な説明")} className={inputCls(!!errors.purpose)} />
            )} />
          ) : (
            <input placeholder={tx(locale, "Brief description of functionality", "기능 및 용도에 대한 간략한 설명", "機能と用途の簡単な説明")} className={inputCls(!!errors.purpose)} {...register("purpose")} />
          )}
        </Field>

        {/* ── 조선소 입력 항목 (선택) ── */}
        <div className="rounded-lg border border-dashed border-border bg-surface-secondary/30 p-3 space-y-3">
          <div className="flex items-start gap-2">
            <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider flex-1">
              {tx(locale, "Shipyard Managed (Optional)", "조선소 관리 항목 (선택)", "造船所管理項目 (任意)")}
            </p>
            <p className="text-[10px] text-text-tertiary italic">
              {tx(locale, "Usually set by shipyard at CBS level", "보통 조선소가 CBS 레벨에서 설정", "通常は造船所がCBSレベルで設定")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tx(locale, "E27 Category", "E27 카테고리", "E27カテゴリ")} hint={tx(locale, "Inherited from CBS if empty", "비워두면 CBS에서 상속", "空ならCBSから継承")}>
              <select className={selectCls} {...register("category")}>
                <option value="">{tx(locale, "Inherited from CBS", "CBS에서 상속", "CBSから継承")}</option>
                <option value="1">Cat I — {tx(locale, "Nav & Comm", "항해/통신", "航海/通信")}</option>
                <option value="2">Cat II — {tx(locale, "Machinery", "기관/화물", "機関/貨物")}</option>
                <option value="3">Cat III — {tx(locale, "Other OT", "기타 OT", "その他OT")}</option>
              </select>
            </Field>
            <Field label={tx(locale, "Access Control", "접근통제", "アクセス制御")} hint={tx(locale, "Leave blank if unknown", "모르면 비워두세요", "不明なら空欄")}>
              <select className={selectCls} {...register("zone")}>
                <option value="">{tx(locale, "Not set", "미설정", "未設定")}</option>
                {ACCESS_CONTROL_LEVELS.map((ac) => (
                  <option key={ac.id} value={ac.id}>{locale === "ko" ? ac.labelKo : locale === "ja" ? ac.labelJa : ac.label}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        {/* ── E27 필수 (기술 사양) — 타입별 hidden 필드 숨김 ── */}
        {isVis("physicalInterface") && (
          <Field
            label={tx(locale, "Physical Interfaces", "물리적 인터페이스", "物理インターフェース")}
            required
            error={formError(locale, errors.physicalInterface?.message)}
            hint={tx(locale, "If none, enter \"None\" or \"-\"", "없으면 \"None\" 또는 \"-\" 입력", "ない場合は「None」または「-」")}
          >
            {pid ? (
              <Controller name="physicalInterface" control={control} render={({ field: f }) => (
                <AutocompleteInput value={f.value || ""} onChange={f.onChange} projectId={pid} field="physicalInterface" context={acContext}
                  placeholder="LAN, USB, Serial, RS-485" className={inputCls(!!errors.physicalInterface)} />
              )} />
            ) : (
              <input placeholder="LAN, USB, Serial, RS-485" className={inputCls(!!errors.physicalInterface)} {...register("physicalInterface")} />
            )}
          </Field>
        )}

        {isVis("commProtocols") && (
          <Field
            label={tx(locale, "Supported Communication Protocols", "지원 통신 프로토콜", "対応通信プロトコル")}
            required
            error={formError(locale, errors.commProtocols?.message)}
            hint={tx(locale, "If standalone (no communication), enter \"None\"", "standalone(통신 없음)인 경우 \"None\" 입력", "通信なしの場合は「None」")}
          >
            {pid ? (
              <Controller name="commProtocols" control={control} render={({ field: f }) => (
                <AutocompleteInput value={f.value || ""} onChange={f.onChange} projectId={pid} field="commProtocols" context={acContext}
                  placeholder="TCP/IP, Modbus RTU, NMEA 0183" className={inputCls(!!errors.commProtocols)} />
              )} />
            ) : (
              <input placeholder="TCP/IP, Modbus RTU, NMEA 0183" className={inputCls(!!errors.commProtocols)} {...register("commProtocols")} />
            )}
          </Field>
        )}

        {/* ── E27 권장 (벤더가 모를 수 있는 항목) — 타입별 hidden 필드 숨김 ── */}
        {(isVis("sysSoftwareCategory") || isVis("sysSoftwareVersion")) && (
          <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/40 p-3 space-y-3">
            <div className="flex items-start gap-2">
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider flex-1">
                {tx(locale, "E27 Recommended", "E27 권장", "E27推奨")}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {isVis("sysSoftwareCategory") && (
                <Field
                  label={tx(locale, "System Software Name/Type", "시스템 소프트웨어 종류", "システムソフトウェア名/タイプ")}
                  recommended
                >
                  {pid ? (
                    <Controller name="sysSoftwareCategory" control={control} render={({ field: f }) => (
                      <AutocompleteInput value={f.value || ""} onChange={f.onChange} projectId={pid} field="sysSoftwareCategory" context={acContext}
                        placeholder="Windows 10, Linux, RTOS" className={inputCls(false)} />
                    )} />
                  ) : (
                    <input placeholder="Windows 10, Linux, RTOS, Firmware" className={inputCls(false)} {...register("sysSoftwareCategory")} />
                  )}
                </Field>
              )}
              {isVis("sysSoftwareVersion") && (
                <Field
                  label={tx(locale, "SW Version & Patch Level", "SW 버전/패치 레벨", "SWバージョン＆パッチレベル")}
                  recommended
                >
                  <input placeholder="v10.0.19041, Build 1234" className={inputCls(false)} {...register("sysSoftwareVersion")} />
                </Field>
              )}
            </div>
          </div>
        )}

        {/* ── Optional: Updated Log ── */}
        <Field label={tx(locale, "Updated Log", "업데이트 로그", "更新ログ")}>
          <textarea placeholder={tx(locale, "Date, changes, version, author", "업데이트 날짜, 변경사항, 버전정보, 수행자", "日付、変更内容、バージョン、実行者")}
            className={cn(inputCls(false), "h-16 resize-y py-2")} {...register("updateLog")} />
        </Field>

        {/* ── Extra fields (collapsible) ── */}
        <button type="button" onClick={() => setShowExtra(!showExtra)}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-brand hover:text-brand-active transition-colors">
          <ChevronDown size={14} className={cn("transition-transform", showExtra && "rotate-180")} />
          {tx(locale, "Additional Info (optional)", "추가 정보 (선택)", "追加情報（任意）")}
        </button>

        {showExtra && (
          <div className="space-y-3 rounded-xl border border-border bg-surface-secondary/30 p-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="IP" error={watchedValues.ipAddress && !isValidIp(watchedValues.ipAddress) ? "Invalid IPv4 format" : undefined}>
                <input placeholder="192.168.x.x" className={cn(inputCls(!!watchedValues.ipAddress && !isValidIp(watchedValues.ipAddress)), "font-mono")} {...register("ipAddress")} />
              </Field>
              <Field label="MAC" error={watchedValues.macAddress && !isValidMac(watchedValues.macAddress) ? "Invalid MAC format (XX:XX:XX:XX:XX:XX)" : undefined}>
                <input placeholder="00:1A:2B:3C:4D:5E" className={cn(inputCls(!!watchedValues.macAddress && !isValidMac(watchedValues.macAddress)), "font-mono")} {...register("macAddress")} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={tx(locale, "Location", "설치 위치", "設置場所")}>
                <select className={inputCls(false)} {...register("location")}>
                  <option value="">{tx(locale, "Select", "선택", "選択")}</option>
                  {SHIP_LOCATIONS.map((loc) => (
                    <option key={loc.id} value={loc.id}>{locale === "ko" ? loc.labelKo : locale === "ja" ? loc.labelJa : loc.label}</option>
                  ))}
                </select>
              </Field>
              <Field label={tx(locale, "Identifier", "식별번호", "識別番号")}><input className={inputCls(false)} {...register("identifier")} /></Field>
            </div>
            {pid && (
              <>
                {isVis("logicalLocation") && (
                  <Field label={tx(locale, "Logical Location", "논리적 위치", "論理的位置")}>
                    <Controller name="logicalLocation" control={control} render={({ field: f }) => (
                      <AutocompleteInput value={f.value || ""} onChange={f.onChange} projectId={pid} field="logicalLocation" context={acContext}
                        placeholder="VLAN 10, OT Network" className={inputCls(false)} />
                    )} />
                  </Field>
                )}
                {isVis("protectionMethod") && (
                  <Field label={tx(locale, "Protection Method", "보호 방법", "保護方法")}>
                    <Controller name="protectionMethod" control={control} render={({ field: f }) => (
                      <AutocompleteInput value={f.value || ""} onChange={f.onChange} projectId={pid} field="protectionMethod" context={acContext}
                        placeholder="Firewall, VPN, ACL" className={inputCls(false)} />
                    )} />
                  </Field>
                )}
              </>
            )}
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
