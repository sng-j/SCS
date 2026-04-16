"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Home, CheckCircle2 } from "lucide-react";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";

const STEPS = [
  { segment: "inventory", labelKo: "자산 등록", labelEn: "Inventory", labelJa: "資産登録", step: 1 },
  { segment: "dfd", labelKo: "DFD 생성", labelEn: "DFD", labelJa: "DFD生成", step: 2 },
  { segment: "assess", labelKo: "보안 평가", labelEn: "Assessment", labelJa: "セキュリティ評価", step: 3 },
  { segment: "document", labelKo: "문서 생성", labelEn: "Documents", labelJa: "文書生成", step: 4 },
  { segment: "submit", labelKo: "제출", labelEn: "Submit", labelJa: "提出", step: 5 },
];

interface WorkflowNavProps {
  currentSegment: string;
  projectId: string;
  equipmentId?: string | null;
}

export function WorkflowNav({ currentSegment, projectId, equipmentId }: WorkflowNavProps) {
  const { locale } = useLocaleStore();
  const currentIdx = STEPS.findIndex((s) => s.segment === currentSegment);
  if (currentIdx < 0) return null;

  const prev = currentIdx > 0 ? STEPS[currentIdx - 1] : null;
  const next = currentIdx < STEPS.length - 1 ? STEPS[currentIdx + 1] : null;

  function buildHref(segment: string) {
    if (segment === "dfd") {
      const base = `/project/${projectId}/inventory`;
      return equipmentId ? `${base}?tab=dfd&equipmentId=${equipmentId}` : `${base}?tab=dfd`;
    }
    const base = `/project/${projectId}/${segment}`;
    return equipmentId ? `${base}?equipmentId=${equipmentId}` : base;
  }

  return (
    <div className="mt-10 pt-6 border-t border-border">
      {/* Step progress strip */}
      <div className="flex items-center justify-center gap-0 mb-6">
        {STEPS.map((step, i) => {
          const isDone = i < currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <div key={step.segment} className="flex items-center">
              <Link
                href={buildHref(step.segment)}
                className="flex flex-col items-center gap-1.5 group"
              >
                <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all duration-200 ${
                  isDone
                    ? "bg-brand text-white"
                    : isCurrent
                    ? "bg-brand text-white ring-4 ring-brand/20"
                    : "bg-surface-secondary text-text-tertiary group-hover:bg-surface-tertiary"
                }`}>
                  {isDone ? <CheckCircle2 size={14} /> : step.step}
                </div>
                <span className={`text-[10px] font-semibold whitespace-nowrap transition-colors hidden sm:block ${
                  isCurrent ? "text-brand" : isDone ? "text-brand/60" : "text-text-tertiary"
                }`}>
                  {locale === "ko" ? step.labelKo : locale === "ja" ? step.labelJa : step.labelEn}
                </span>
              </Link>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 w-8 sm:w-12 mx-1 rounded-full transition-all duration-300 ${
                  i < currentIdx ? "bg-brand" : "bg-border"
                }`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Prev / Next navigation */}
      <div className="flex items-center justify-between">
        {prev ? (
          <Link
            href={buildHref(prev.segment)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-body-sm font-medium text-text-tertiary hover:text-text hover:bg-surface-secondary transition-colors"
          >
            <ArrowLeft size={16} />
            <div className="text-left">
              <p className="text-[10px] text-text-tertiary">{tx(locale, "Previous", "이전", "前へ")}</p>
              <p className="text-body-sm font-semibold">{locale === "ko" ? prev.labelKo : locale === "ja" ? prev.labelJa : prev.labelEn}</p>
            </div>
          </Link>
        ) : equipmentId ? (
          <Link
            href={`/project/${projectId}/equipment/${equipmentId}`}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-body-sm font-medium text-text-tertiary hover:text-text hover:bg-surface-secondary transition-colors"
          >
            <ArrowLeft size={16} />
            <div className="text-left">
              <p className="text-[10px] text-text-tertiary">{tx(locale, "Back", "돌아가기", "戻る")}</p>
              <p className="text-body-sm font-semibold">{tx(locale, "Equipment", "기자재", "機器")}</p>
            </div>
          </Link>
        ) : <div />}

        {next ? (
          <Link
            href={buildHref(next.segment)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-body-sm font-medium text-brand hover:bg-brand-lighter transition-colors"
          >
            <div className="text-right">
              <p className="text-[10px] text-text-tertiary">{tx(locale, "Next", "다음", "次へ")}</p>
              <p className="text-body-sm font-semibold">{locale === "ko" ? next.labelKo : locale === "ja" ? next.labelJa : next.labelEn}</p>
            </div>
            <ArrowRight size={16} />
          </Link>
        ) : (
          <Link
            href="/"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-body-sm font-medium text-brand hover:bg-brand-lighter transition-colors"
          >
            <div className="text-right">
              <p className="text-[10px] text-text-tertiary">{tx(locale, "Done", "완료", "完了")}</p>
              <p className="text-body-sm font-semibold">{tx(locale, "Home", "홈", "ホーム")}</p>
            </div>
            <Home size={16} />
          </Link>
        )}
      </div>
    </div>
  );
}
