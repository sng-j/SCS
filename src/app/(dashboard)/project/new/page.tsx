"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { Ship, ArrowLeft, ArrowRight, AlertCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const CLASSIFICATIONS = [
  { value: "KR", label: "KR — Korean Register" },
  { value: "LR", label: "LR — Lloyd's Register" },
  { value: "DNV", label: "DNV" },
  { value: "ABS", label: "ABS — American Bureau of Shipping" },
  { value: "BV", label: "BV — Bureau Veritas" },
  { value: "CCS", label: "CCS — China Classification Society" },
  { value: "NK", label: "NK — ClassNK" },
];

const schema = z.object({
  vesselName: z.string().min(1, "필수 항목입니다"),  // reused as project name
  classification: z.string().optional(),
  shipowner: z.string().optional(),
  description: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function NewProjectPage() {
  const router = useRouter();
  const { locale } = useLocaleStore();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<{ id: string; name: string; shipowner: string | null }[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");

  useEffect(() => {
    fetch("/api/project-groups")
      .then(async (r) => { if (r.ok) { const d = await r.json(); setGroups(Array.isArray(d) ? d : []); } })
      .catch(() => {});
  }, []);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setSaving(true);
    setError(null);
    try {
      // Create ProjectGroup (계약) only — 호선은 프로젝트 상세에서 추가
      const res = await fetch("/api/project-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.vesselName,
          shipowner: data.shipowner,
          description: data.description,
        }),
      });
      if (res.ok) {
        showToast.success(tx(locale, "Project created. Add vessels now.", "프로젝트가 생성되었습니다. 호선을 추가하세요.", "プロジェクトが作成されました。船舶を追加してください。"));
        router.push("/project");
      } else {
        const body = await res.json();
        setError(body.error || tx(locale, "Failed to create", "생성에 실패했습니다", "作成に失敗しました"));
      }
    } catch {
      setError(tx(locale, "Server error", "서버 오류", "サーバーエラー"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {/* Back link */}
        <Link href="/project" className="inline-flex items-center gap-1 text-body-xs text-text-tertiary hover:text-brand transition-colors mb-6">
          <ArrowLeft size={14} /> {tx(locale, "Projects", "프로젝트 목록", "プロジェクト一覧")}
        </Link>

        <h1 className="text-h4 font-extrabold text-text tracking-tight">
          {tx(locale, "New Project", "프로젝트 생성", "新規プロジェクト")}
        </h1>
        <p className="text-body-sm text-text-tertiary mt-1 mb-6">
          {tx(locale, "Create a contract-level project. Add vessels (hull numbers) after creation.", "계약 단위의 프로젝트를 생성합니다. 생성 후 호선을 추가하세요.", "契約単位のプロジェクトを作成します。作成後に船舶を追加してください。")}
        </p>

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-[4px] border border-safety-high/20 bg-risk-bg px-4 py-3" role="alert">
            <AlertCircle className="h-4 w-4 text-safety-high mt-0.5 shrink-0" />
            <p className="text-body-sm text-safety-high">{error}</p>
          </div>
        )}

        <Card padding="none">
          <CardBody>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {/* Project Name */}
              <div className="space-y-1.5">
                <label htmlFor="vesselName" className="flex items-center gap-1.5 text-body-sm font-medium text-text">
                  <Ship className="h-3.5 w-3.5 text-text-tertiary" />
                  {tx(locale, "Project Name", "프로젝트명", "プロジェクト名")} <span className="text-safety-high text-body-xs">*</span>
                </label>
                <input
                  id="vesselName"
                  placeholder={tx(locale, "e.g. Hyundai LNG Carrier 3 units", "예: 현대상선 유조선 3척", "例: 現代商船タンカー3隻")}
                  className={cn(
                    "h-11 w-full rounded-[4px] border px-3.5 text-body-sm text-text",
                    "placeholder:text-text-tertiary/60 transition-all duration-150",
                    "focus:outline-none focus:ring-2 focus:border-transparent",
                    errors.vesselName ? "border-safety-high bg-risk-bg/50 focus:ring-safety-high/40" : "border-border bg-white hover:border-border-strong focus:ring-brand/40",
                  )}
                  {...register("vesselName")}
                />
                {errors.vesselName && <p className="text-body-xs text-safety-high">{errors.vesselName.message}</p>}
              </div>


              {/* Classification */}
              <div className="space-y-1.5">
                <label htmlFor="classification" className="text-body-sm font-medium text-text">
                  {tx(locale, "Classification Society", "선급", "船級協会")}
                </label>
                <select
                  id="classification"
                  className="h-11 w-full rounded-[4px] border border-border bg-white px-3.5 text-body-sm text-text transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-transparent hover:border-border-strong appearance-none"
                  {...register("classification")}
                >
                  <option value="">{tx(locale, "Select classification", "선급 선택", "船級を選択")}</option>
                  {CLASSIFICATIONS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Shipowner */}
              <div className="space-y-1.5">
                <label htmlFor="shipowner" className="text-body-sm font-medium text-text">
                  {tx(locale, "Shipowner", "선주", "船主")}
                </label>
                <input
                  id="shipowner"
                  placeholder={tx(locale, "e.g. Hyundai Merchant Marine", "예: 현대상선", "例: 商船三井")}
                  className="h-11 w-full rounded-[4px] border border-border bg-white px-3.5 text-body-sm text-text placeholder:text-text-tertiary/60 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-transparent hover:border-border-strong"
                  {...register("shipowner")}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <Link href="/project">
                  <Button type="button" variant="outline" size="sm">
                    {tx(locale, "Cancel", "취소", "キャンセル")}
                  </Button>
                </Link>
                <Button type="submit" size="sm" loading={saving} className="group">
                  {tx(locale, "Create", "생성", "作成")}
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </motion.div>
    </div>
  );
}
