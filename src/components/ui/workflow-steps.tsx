"use client";

import Link from "next/link";
import { CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const STEPS = [
  { segment: "inventory", ko: "자산 등록", en: "Inventory", ja: "資産登録" },
  { segment: "dfd", ko: "DFD 생성", en: "DFD", ja: "DFD生成" },
  { segment: "assess", ko: "보안 평가", en: "Assessment", ja: "セキュリティ評価" },
  { segment: "testproc", ko: "테스트 절차", en: "Test Procedure", ja: "テスト手順" },
  { segment: "document", ko: "문서 생성", en: "Documents", ja: "文書生成" },
  { segment: "submit", ko: "제출", en: "Submit", ja: "提出" },
];

interface WorkflowStepsProps {
  currentSegment: string;
  projectId: string;
  equipmentId?: string | null;
  equipmentName?: string;
  /** 잠금된 단계 segment 목록 — 필수값 미충족 등으로 진입 불가 */
  lockedSteps?: string[];
}

export function WorkflowSteps({ currentSegment, projectId, equipmentId, equipmentName, lockedSteps = [] }: WorkflowStepsProps) {
  const { locale } = useLocaleStore();
  const currentIdx = STEPS.findIndex((s) => s.segment === currentSegment);
  if (currentIdx < 0) return null;

  function buildHref(segment: string) {
    if (segment === "dfd") {
      const base = `/project/${projectId}/inventory`;
      return equipmentId ? `${base}?tab=dfd&equipmentId=${equipmentId}` : `${base}?tab=dfd`;
    }
    const base = `/project/${projectId}/${segment}`;
    return equipmentId ? `${base}?equipmentId=${equipmentId}` : base;
  }

  const label = (s: typeof STEPS[0]) => locale === "ko" ? s.ko : locale === "ja" ? s.ja : s.en;

  // Prev/Next navigation
  const prevHref = currentIdx === 0
    ? (equipmentId ? `/project/${projectId}/equipment/${equipmentId}` : `/`)
    : buildHref(STEPS[currentIdx - 1].segment);
  const prevLabel = currentIdx === 0
    ? tx(locale, "Back", "이전", "戻る")
    : label(STEPS[currentIdx - 1]);

  const nextHref = currentIdx < STEPS.length - 1
    ? buildHref(STEPS[currentIdx + 1].segment)
    : null;
  const nextLabel = currentIdx < STEPS.length - 1
    ? label(STEPS[currentIdx + 1])
    : null;

  return (
    <div className="bg-white border-b border-border sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 py-3">
        {/* Equipment context */}
        {equipmentName && (
          <p className="text-[11px] text-text-tertiary mb-2 text-center">
            {equipmentName}
          </p>
        )}

        {/* Steps with prev/next */}
        <div className="flex items-center gap-2">
          {/* Prev button */}
          <Link
            href={prevHref}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-text-tertiary hover:text-text hover:bg-surface-secondary transition-all shrink-0"
          >
            <ChevronLeft size={14} />
            <span className="hidden sm:inline">{prevLabel}</span>
          </Link>

          {/* Step indicators */}
          <div className="flex items-center justify-center flex-1">
            {STEPS.map((step, i) => {
              const isDone = i < currentIdx;
              const isCurrent = i === currentIdx;
              const isLocked = lockedSteps.includes(step.segment);

              const circle = (
                <div className={cn(
                  "h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all duration-200",
                  isDone && !isLocked ? "bg-[#24A148] text-white" :
                  isCurrent ? "bg-brand text-white ring-4 ring-brand/15" :
                  "bg-surface-secondary text-text-tertiary group-hover:bg-surface-tertiary"
                )}>
                  {isDone && !isLocked ? <CheckCircle2 size={14} /> : i + 1}
                </div>
              );
              const text = (
                <span className={cn(
                  "text-[11px] font-semibold whitespace-nowrap transition-colors hidden md:block",
                  isCurrent ? "text-brand" : isDone && !isLocked ? "text-[#24A148]/70" : "text-text-tertiary"
                )}>
                  {label(step)}
                </span>
              );

              return (
                <div key={step.segment} className="flex items-center">
                  {isLocked ? (
                    <div className="flex items-center gap-1.5 cursor-not-allowed opacity-40">
                      {circle}{text}
                    </div>
                  ) : (
                    <Link href={buildHref(step.segment)} className="flex items-center gap-1.5 group">
                      {circle}{text}
                    </Link>
                  )}
                  {i < STEPS.length - 1 && (
                    <div className={cn(
                      "h-0.5 w-4 sm:w-8 mx-1.5 rounded-full transition-all duration-300",
                      i < currentIdx ? "bg-[#24A148]" : "bg-border"
                    )} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Next button */}
          {nextHref && !lockedSteps.includes(STEPS[currentIdx + 1]?.segment) ? (
            <Link
              href={nextHref}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-brand hover:text-white hover:bg-brand transition-all shrink-0"
            >
              <span className="hidden sm:inline">{nextLabel}</span>
              <ChevronRight size={14} />
            </Link>
          ) : (
            <div className="w-[72px] shrink-0" /> /* spacer for alignment */
          )}
        </div>
      </div>
    </div>
  );
}
