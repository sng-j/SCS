"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Bell, User } from "lucide-react";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";

const pageLabels: Record<string, Record<string, string>> = {
  "/": { ko: "대시보드", en: "Dashboard", ja: "ダッシュボード" },
  project: { ko: "프로젝트", en: "Projects", ja: "プロジェクト" },
  guidance: { ko: "가이드라인", en: "Guidance", ja: "ガイダンス" },
  settings: { ko: "설정", en: "Settings", ja: "設定" },
  inventory: { ko: "자산 수집", en: "Inventory", ja: "資産管理" },
  assess: { ko: "보안 평가", en: "Assessment", ja: "セキュリティ評価" },
  document: { ko: "문서 생성", en: "Documents", ja: "文書生成" },
  submit: { ko: "제출 현황", en: "Submissions", ja: "提出" },
  equipment: { ko: "기자재", en: "Equipment", ja: "機材" },
};

export function Header() {
  const pathname = usePathname();
  const { locale } = useLocaleStore();

  function buildBreadcrumbs(): { label: string; href?: string }[] {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 0) return [{ label: tx(locale, "Dashboard", "대시보드", "ダッシュボード") }];

    const crumbs: { label: string; href?: string }[] = [];

    // /project/[projectId]/...
    if (segments[0] === "project") {
      crumbs.push({ label: tx(locale, "Project", "프로젝트", "プロジェクト"), href: "/project" });

      if (segments.length >= 2) {
        // segments[1] is projectId — skip showing raw ID
      }

      if (segments.length >= 3) {
        const page = segments[2]; // inventory, assess, document, submit, equipment
        const pageLabel = pageLabels[page]?.[locale] || page;

        if (page === "equipment" && segments.length >= 4) {
          // /project/[id]/equipment/[eqId] — show "기자재" as final
          crumbs.push({ label: tx(locale, "Equipment", "기자재", "機器") });
        } else {
          crumbs.push({ label: pageLabel });
        }
      }
    } else {
      // Non-project pages
      const page = segments[segments.length - 1];
      const label = pageLabels[page]?.[locale] || page;
      crumbs.push({ label });
    }

    return crumbs;
  }

  const crumbs = buildBreadcrumbs();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-white px-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5">
        {crumbs.map((crumb, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight size={12} className="text-text-tertiary" />}
            {crumb.href ? (
              <Link href={crumb.href} className="text-body-sm font-medium text-text-tertiary hover:text-brand transition-colors">
                {crumb.label}
              </Link>
            ) : (
              <span className="text-body-sm font-semibold text-text">{crumb.label}</span>
            )}
          </div>
        ))}
      </nav>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <LanguageToggle />
        <button className="relative flex h-9 w-9 items-center justify-center rounded-[4px] text-text-tertiary hover:bg-surface-secondary transition-colors">
          <Bell className="h-4 w-4" />
        </button>
        <button className="flex h-8 w-8 items-center justify-center rounded-full bg-avatar text-white text-body-xs font-bold">
          <User className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
