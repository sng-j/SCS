"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  BookOpen,
  Settings,
  Package,
  ClipboardCheck,
  FileText,
  Send,
  Shield,
  ChevronLeft,
  ChevronRight,
  Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";

interface NavItem {
  href: string;
  icon: React.ElementType<Record<string, unknown>>;
  labelEn: string;
  labelKo: string;
  labelJa: string;
}

function navLabel(item: NavItem, locale: string) {
  if (locale === "ko") return item.labelKo;
  if (locale === "ja") return item.labelJa;
  return item.labelEn;
}

const mainNav: NavItem[] = [
  { href: "/", icon: LayoutDashboard, labelEn: "Dashboard", labelKo: "대시보드", labelJa: "ダッシュボード" },
  { href: "/project", icon: FolderOpen, labelEn: "Projects", labelKo: "프로젝트", labelJa: "プロジェクト" },
  { href: "/guidance", icon: BookOpen, labelEn: "Guidance", labelKo: "가이드라인", labelJa: "ガイダンス" },
  { href: "/settings", icon: Settings, labelEn: "Settings", labelKo: "설정", labelJa: "設定" },
];

const phaseNav: NavItem[] = [
  { href: "/inventory", icon: Package, labelEn: "Inventory", labelKo: "자산 수집", labelJa: "資産管理" },
  { href: "/assess", icon: ClipboardCheck, labelEn: "Assessment", labelKo: "보안 평가", labelJa: "セキュリティ評価" },
  { href: "/document", icon: FileText, labelEn: "Documents", labelKo: "문서 생성", labelJa: "文書生成" },
  { href: "/submit", icon: Send, labelEn: "Submissions", labelKo: "제출 현황", labelJa: "提出管理" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { locale } = useLocaleStore();
  const [collapsed, setCollapsed] = useState(false);

  // Detect project and equipment from URL
  const projectMatch = pathname.match(/\/project\/([^/]+)/);
  const projectId = projectMatch?.[1];
  const equipmentMatch = pathname.match(/\/project\/[^/]+\/equipment\/([^/]+)/);
  const equipmentId = equipmentMatch?.[1];

  // Fetch project & equipment names
  const [projectName, setProjectName] = useState<string>("");
  const [equipmentName, setEquipmentName] = useState<string>("");

  useEffect(() => {
    if (!projectId) {
      // Use microtask to avoid synchronous setState in effect body
      queueMicrotask(() => { setProjectName(""); setEquipmentName(""); });
      return;
    }
    fetch(`/api/projects/${projectId}`)
      .then(async (r) => { if (r.ok) { const d = await r.json(); setProjectName(d.vesselName || ""); } })
      .catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !equipmentId) {
      queueMicrotask(() => { setEquipmentName(""); });
      return;
    }
    fetch(`/api/projects/${projectId}/equipment`)
      .then(async (r) => {
        if (r.ok) {
          const list = await r.json();
          const eq = list.find((e: { id: string; name: string }) => e.id === equipmentId);
          setEquipmentName(eq?.name || "");
        }
      })
      .catch(() => {});
  }, [projectId, equipmentId]);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  function isPhaseActive(href: string) {
    if (!projectId) return false;
    return pathname.includes(`/project/${projectId}${href}`);
  }

  // Build phase links with equipmentId if on equipment page
  function phaseHref(basePath: string) {
    const base = `/project/${projectId}${basePath}`;
    return equipmentId ? `${base}?equipmentId=${equipmentId}` : base;
  }

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 bottom-0 z-40 flex flex-col border-r border-border bg-white transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] bg-brand">
          <Shield className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <span className="text-body-sm font-bold text-text tracking-tight">SCS</span>
        )}
      </div>

      {/* Main navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <div className="space-y-0.5">
          {mainNav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-[4px] px-3 py-2 text-body-sm transition-colors duration-150",
                  active
                    ? "bg-brand-lighter text-brand font-medium"
                    : "text-text-secondary hover:bg-surface-secondary hover:text-text",
                  collapsed && "justify-center px-0"
                )}
                title={collapsed ? (navLabel(item, locale)) : undefined}
              >
                <item.icon className={cn("h-4.5 w-4.5 shrink-0", active ? "text-brand" : "text-text-tertiary")} />
                {!collapsed && (
                  <span>{navLabel(item, locale)}</span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Project context + E27 Workflow (visible when inside a project) */}
        {projectId && (
          <>
            <div className={cn("my-3", collapsed ? "mx-2" : "mx-3")}>
              <div className="h-px bg-border" />
            </div>

            {/* Project & Equipment name */}
            {!collapsed && (
              <div className="px-3 mb-3">
                <Link href={`/project/${projectId}`} className="block group">
                  <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mb-1">
                    {tx(locale, "Project", "프로젝트", "プロジェクト")}
                  </p>
                  <p className="text-body-xs font-semibold text-text group-hover:text-brand transition-colors truncate">
                    {projectName || "..."}
                  </p>
                </Link>
                {equipmentId && equipmentName && (
                  <Link href={`/project/${projectId}/equipment/${equipmentId}`} className="block mt-1.5 group">
                    <div className="flex items-center gap-1.5">
                      <Cpu size={11} className="text-brand shrink-0" />
                      <p className="text-body-xs font-semibold text-brand group-hover:text-brand-hover transition-colors truncate">
                        {equipmentName}
                      </p>
                    </div>
                  </Link>
                )}
              </div>
            )}

            {!collapsed && (
              <p className="px-3 mb-1.5 text-label text-text-tertiary uppercase tracking-wider">
                E27 {tx(locale, "Workflow", "워크플로우", "ワークフロー")}
              </p>
            )}
            <div className="space-y-0.5">
              {phaseNav.map((item, idx) => {
                const active = isPhaseActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={phaseHref(item.href)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-[4px] px-3 py-2 text-body-sm transition-colors duration-150",
                      active
                        ? "bg-brand-lighter text-brand font-medium"
                        : "text-text-secondary hover:bg-surface-secondary hover:text-text",
                      collapsed && "justify-center px-0"
                    )}
                    title={collapsed ? (navLabel(item, locale)) : undefined}
                  >
                    <div className="flex items-center gap-2.5 shrink-0">
                      {!collapsed && (
                        <span className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                          active ? "bg-brand text-white" : "bg-surface-secondary text-text-tertiary"
                        )}>
                          {idx + 1}
                        </span>
                      )}
                      <item.icon className={cn("h-4 w-4", active ? "text-brand" : "text-text-tertiary")} />
                    </div>
                    {!collapsed && (
                      <span>{navLabel(item, locale)}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </nav>

      {/* Bottom — collapse + version */}
      <div className="border-t border-border px-2 py-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center gap-2.5 rounded-[4px] px-3 py-2 text-body-xs text-text-tertiary hover:bg-surface-secondary transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 mx-auto" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>v13.0</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
