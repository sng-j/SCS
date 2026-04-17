"use client";

import { useState, useMemo, useEffect, useRef, useCallback, Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, FolderOpen, BookOpen, Settings,
  Package, ClipboardCheck, FileText, Send, Shield,
  ChevronRight, LogOut, UserCog, Headphones, Bot,
  Ship, Building2, MessageSquare, Menu, X, Globe,
  Bell, CheckCircle, Users, Inbox, Activity, Search,
  AlertTriangle, Zap, User, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/stores/locale-store";
import { tx, translateNotif } from "@/lib/i18n";
import ChatWidget from "@/components/ai/chat-widget";
import { QnAWidget } from "@/components/qna/qna-widget";
import { PageTransition } from "@/components/ui/page-transition";

// ─── Types ──────────────────────────────────────────────────────────────────

interface NavItem {
  labelEn: string;
  labelKo: string;
  labelJa: string;
  icon: React.ElementType<{ size?: number; className?: string }>;
  href: string;
  badge?: number;
  children?: NavChild[];
}

interface NavChild {
  labelEn: string;
  labelKo: string;
  labelJa: string;
  href: string;
}

interface NavSection {
  labelEn: string;
  labelKo: string;
  labelJa: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

function nl(item: { labelEn: string; labelKo: string; labelJa: string }, locale: string) {
  if (locale === "ko") return item.labelKo;
  if (locale === "ja") return item.labelJa;
  return item.labelEn;
}

// ─── Nav configs per role ───────────────────────────────────────────────────

function getNavSections(role: string): NavSection[] {
  if (role === "ADMIN") {
    return [
      {
        labelEn: "Menu", labelKo: "메뉴", labelJa: "メニュー", defaultOpen: true, items: [
          { labelEn: "Dashboard", labelKo: "대시보드", labelJa: "ダッシュボード", icon: LayoutDashboard, href: "/" },
        ]
      },
      {
        labelEn: "Management", labelKo: "관리", labelJa: "管理", defaultOpen: true, items: [
          {
            labelEn: "Admin Panel", labelKo: "관리자 패널", labelJa: "管理パネル", icon: UserCog, href: "/admin", children: [
              { labelEn: "Users", labelKo: "사용자", labelJa: "ユーザー", href: "/admin?tab=users" },
              { labelEn: "Signups", labelKo: "가입 신청", labelJa: "申請", href: "/admin?tab=signups" },
              { labelEn: "Shipyards", labelKo: "조선소", labelJa: "造船所", href: "/admin?tab=shipyards" },
              { labelEn: "Projects", labelKo: "프로젝트", labelJa: "プロジェクト", href: "/admin?tab=projects" },
              { labelEn: "Submissions", labelKo: "제출물", labelJa: "提出物", href: "/admin?tab=submissions" },
              { labelEn: "FAQ", labelKo: "FAQ", labelJa: "FAQ", href: "/admin?tab=faq" },
              { labelEn: "Q&A", labelKo: "Q&A", labelJa: "Q&A", href: "/admin?tab=qna" },
              { labelEn: "Settings", labelKo: "설정", labelJa: "設定", href: "/admin?tab=settings" },
              { labelEn: "Security Logs", labelKo: "보안 이력", labelJa: "セキュリティログ", href: "/admin?tab=logs" },
              { labelEn: "AI Dataset", labelKo: "AI 데이터셋", labelJa: "AIデータセット", href: "/admin?tab=dataset" },
            ]
          },
          { labelEn: "CVE", labelKo: "CVE 관리", labelJa: "CVE管理", icon: Search, href: "/admin/cve" },
        ]
      },
      {
        labelEn: "Support", labelKo: "지원", labelJa: "サポート", defaultOpen: false, items: [
          { labelEn: "Q&A", labelKo: "Q&A", labelJa: "Q&A", icon: MessageSquare, href: "/qna" },
          { labelEn: "FAQ", labelKo: "FAQ", labelJa: "FAQ", icon: Headphones, href: "/faq" },
        ]
      },
      {
        labelEn: "Guide", labelKo: "가이드", labelJa: "ガイド", defaultOpen: false, items: [
          {
            labelEn: "Guidance", labelKo: "가이드라인", labelJa: "ガイダンス", icon: BookOpen, href: "/guidance", children: [
              { labelEn: "Overview", labelKo: "개요", labelJa: "概要", href: "/guidance?tab=overview" },
              { labelEn: "SC Checks", labelKo: "SC 점검", labelJa: "SCチェック", href: "/guidance?tab=sc-checks" },
            ]
          },
        ]
      },
    ];
  }

  if (role === "SHIPYARD") {
    return [
      {
        labelEn: "Menu", labelKo: "메뉴", labelJa: "メニュー", defaultOpen: true, items: [
          { labelEn: "Dashboard", labelKo: "대시보드", labelJa: "ダッシュボード", icon: LayoutDashboard, href: "/" },
          { labelEn: "Projects", labelKo: "프로젝트", labelJa: "プロジェクト", icon: FolderOpen, href: "/project" },
          { labelEn: "Vessels", labelKo: "선박 현황", labelJa: "船舶一覧", icon: Ship, href: "/fleet" },
        ]
      },
      {
        labelEn: "Management", labelKo: "관리", labelJa: "管理", defaultOpen: false, items: [
          { labelEn: "Vendor Management", labelKo: "벤더 관리", labelJa: "ベンダー管理", icon: Users, href: "/shipyard" },
        ]
      },
      {
        labelEn: "Support", labelKo: "지원", labelJa: "サポート", defaultOpen: false, items: [
          { labelEn: "Q&A", labelKo: "Q&A", labelJa: "Q&A", icon: MessageSquare, href: "/qna" },
          { labelEn: "FAQ", labelKo: "FAQ", labelJa: "FAQ", icon: Headphones, href: "/faq" },
        ]
      },
      {
        labelEn: "Guide", labelKo: "가이드", labelJa: "ガイド", defaultOpen: false, items: [
          {
            labelEn: "Guidance", labelKo: "가이드라인", labelJa: "ガイダンス", icon: BookOpen, href: "/guidance", children: [
              { labelEn: "Overview", labelKo: "개요", labelJa: "概要", href: "/guidance?tab=overview" },
              { labelEn: "SC Checks", labelKo: "SC 점검", labelJa: "SCチェック", href: "/guidance?tab=sc-checks" },
            ]
          },
        ]
      },
    ];
  }

  // VENDOR
  return [
    {
      labelEn: "Menu", labelKo: "메뉴", labelJa: "メニュー", defaultOpen: true, items: [
        { labelEn: "Dashboard", labelKo: "대시보드", labelJa: "ダッシュボード", icon: LayoutDashboard, href: "/" },
        { labelEn: "Equipment", labelKo: "기자재 관리", labelJa: "機材管理", icon: Package, href: "/vendor" },
      ]
    },
    {
      labelEn: "Support", labelKo: "지원", labelJa: "サポート", defaultOpen: false, items: [
        { labelEn: "Q&A", labelKo: "Q&A", labelJa: "Q&A", icon: MessageSquare, href: "/qna" },
        { labelEn: "FAQ", labelKo: "FAQ", labelJa: "FAQ", icon: Headphones, href: "/faq" },
      ]
    },
    {
      labelEn: "Guide", labelKo: "가이드", labelJa: "ガイド", defaultOpen: false, items: [
        {
          labelEn: "Guidance", labelKo: "가이드라인", labelJa: "ガイダンス", icon: BookOpen, href: "/guidance", children: [
            { labelEn: "Overview", labelKo: "개요", labelJa: "概要", href: "/guidance?tab=overview" },
            { labelEn: "SC Checks", labelKo: "SC 점검", labelJa: "SCチェック", href: "/guidance?tab=sc-checks" },
          ]
        },
      ]
    },
  ];
}

// ─── E27 Workflow Steps ─────────────────────────────────────────────────────

const WORKFLOW_STEPS = [
  { labelEn: "1. Inventory", labelKo: "1. 자산 등록", labelJa: "1. 資産登録", segment: "inventory" },
  { labelEn: "2. DFD", labelKo: "2. DFD 생성", labelJa: "2. DFD生成", segment: "inventory?tab=dfd" },
  { labelEn: "3. Assessment", labelKo: "3. 보안 평가", labelJa: "3. セキュリティ評価", segment: "assess" },
  { labelEn: "4. Documents", labelKo: "4. 문서 생성", labelJa: "4. 文書生成", segment: "document" },
  { labelEn: "5. Submit", labelKo: "5. 제출", labelJa: "5. 提出", segment: "submit" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractProjectId(pathname: string): string | null {
  const match = /^\/project\/([^/]+)/.exec(pathname);
  if (!match || match[1] === "new") return null;
  return match[1];
}

// ─── Dropdown Hook ──────────────────────────────────────────────────────────

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return [open, setOpen, ref] as const;
}

// ─── Collapsible Nav Sections ───────────────────────────────────────────────

function NavSections({ sections, locale, pathname }: { sections: NavSection[]; locale: string; pathname: string }) {
  const sp = useSearchParams();
  const currentTab = sp.get("tab") || "";

  const [openSections, setOpenSections] = useState<Record<number, boolean>>(() => {
    const init: Record<number, boolean> = {};
    sections.forEach((s, i) => { init[i] = s.defaultOpen !== false; });
    return init;
  });
  const [openChildren, setOpenChildren] = useState<Record<string, boolean>>({});

  const toggleSection = (i: number) => setOpenSections((prev) => ({ ...prev, [i]: !prev[i] }));
  const toggleChild = (key: string) => setOpenChildren((prev) => ({ ...prev, [key]: !prev[key] }));

  function isChildActive(child: NavChild): boolean {
    const [childPath, childQuery] = child.href.split("?");
    if (!childQuery) return pathname === childPath;
    const expectedTab = new URLSearchParams(childQuery).get("tab");
    return pathname === childPath && currentTab === expectedTab;
  }

  // Auto-open section & children when pathname or tab changes
  useEffect(() => {
    sections.forEach((section, i) => {
      const hasActive = section.items.some((item) => {
        const base = item.href.split("?")[0];
        if (item.href === "/" ? pathname === "/" : pathname.startsWith(base)) return true;
        return item.children?.some((c) => isChildActive(c));
      });
      if (hasActive && !openSections[i]) {
        setOpenSections((prev) => ({ ...prev, [i]: true }));
      }
      section.items.forEach((item) => {
        if (item.children) {
          const base = item.href.split("?")[0];
          const parentActive = item.href === "/" ? pathname === "/" : pathname.startsWith(base);
          const childActive = item.children.some((c) => isChildActive(c));
          if ((childActive || parentActive) && !openChildren[item.href]) {
            setOpenChildren((prev) => ({ ...prev, [item.href]: true }));
          }
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, currentTab]);

  return (
    <>
      {sections.map((section, si) => {
        const isOpen = openSections[si] !== false;
        return (
          <div key={si} className="mb-0.5">
            <button
              onClick={() => toggleSection(si)}
              className="flex items-center justify-between w-full text-[10px] font-bold text-text-tertiary uppercase tracking-wider px-3 pt-4 pb-1.5 hover:text-text-secondary transition-colors"
            >
              <span>{nl(section, locale)}</span>
              <ChevronDown size={12} className={cn("transition-transform duration-200", isOpen ? "rotate-0" : "-rotate-90")} />
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="space-y-0.5">
                    {section.items.map((item) => {
                      const baseHref = item.href.split("?")[0];
                      const isActive = item.href === "/" ? pathname === "/"
                        : baseHref === "/admin" ? pathname === "/admin" || pathname.startsWith("/admin/")
                          : pathname.startsWith(baseHref);
                      const Icon = item.icon;
                      const hasChildren = item.children && item.children.length > 0;
                      const childrenOpen = openChildren[item.href] ?? isActive;

                      return (
                        <div key={item.href + item.labelEn}>
                          {/* Parent item */}
                          <div className="flex items-center">
                            <Link
                              href={item.href}
                              className={cn(
                                "flex-1 flex items-center gap-2.5 h-9 rounded-lg px-3 text-[13px] font-medium transition-all duration-150",
                                isActive
                                  ? "bg-white text-text shadow-xs border border-border/60"
                                  : "text-text-tertiary hover:text-text-secondary hover:bg-white/60",
                              )}
                            >
                              <Icon size={16} className={cn("shrink-0", isActive && "text-brand")} />
                              <span className="flex-1 truncate">{nl(item, locale)}</span>
                              {item.badge && (
                                <span className="px-1.5 py-0.5 rounded-md bg-safety-high text-white text-[9px] font-bold">{item.badge}</span>
                              )}
                            </Link>
                            {hasChildren && (
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleChild(item.href); }}
                                className="p-1 mr-1 rounded text-text-tertiary hover:text-text-secondary transition-colors"
                              >
                                <ChevronRight size={12} className={cn("transition-transform duration-200", childrenOpen && "rotate-90")} />
                              </button>
                            )}
                          </div>

                          {/* Children sub-items (default collapsed) */}
                          {hasChildren && (
                            <AnimatePresence initial={false}>
                              {childrenOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.12 }}
                                  className="overflow-hidden"
                                >
                                  <div className="ml-7 border-l border-border/50 pl-2 my-0.5 space-y-0.5">
                                    {item.children!.map((child) => {
                                      const active = isChildActive(child);
                                      return (
                                        <Link
                                          key={child.href}
                                          href={child.href}
                                          className={cn(
                                            "block px-2.5 py-1.5 rounded-md text-[12px] transition-all duration-150",
                                            active
                                              ? "text-brand font-semibold bg-brand-lighter/50"
                                              : "text-text-tertiary hover:text-text-secondary hover:bg-white/60",
                                          )}
                                        >
                                          {nl(child, locale)}
                                        </Link>
                                      );
                                    })}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </>
  );
}

// ─── Layout ─────────────────────────────────────────────────────────────────

import { ShipyardLayout } from "@/components/layout/shipyard-layout";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="h-6 w-6 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>}>
      <DashboardLayoutOuter>{children}</DashboardLayoutOuter>
    </Suspense>
  );
}

function DashboardLayoutOuter({ children }: { children: React.ReactNode }) {
  // All roles use the same sidebar layout for now
  // ShipyardLayout (top tabs) is available but disabled — enable later after confirmation
  return <DashboardLayoutInner>{children}</DashboardLayoutInner>;
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const equipmentId = searchParams.get("equipmentId");
  const { locale } = useLocaleStore();
  const { data: session } = useSession();

  useEffect(() => { requestAnimationFrame(() => setMobileOpen(false)); }, [pathname]);

  const userName = session?.user?.name || "User";
  const userEmail = session?.user?.email || "";
  const userRole = (session?.user as { role?: string })?.role || "VENDOR";
  const projectId = useMemo(() => extractProjectId(pathname), [pathname]);
  const navSections = useMemo(() => getNavSections(userRole), [userRole]);

  // Extract equipmentId from URL path (for /project/[id]/equipment/[eqId])
  const equipmentIdFromPath = useMemo(() => {
    const match = /\/project\/[^/]+\/equipment\/([^/]+)/.exec(pathname);
    return match?.[1] || null;
  }, [pathname]);
  const activeEquipmentId = equipmentId || equipmentIdFromPath;

  // Fetch project & equipment names for sidebar
  const [projectName, setProjectName] = useState("");
  const [equipmentName, setEquipmentName] = useState("");

  useEffect(() => {
    if (!projectId) { requestAnimationFrame(() => setProjectName("")); return; }
    fetch(`/api/projects/${projectId}`)
      .then(async (r) => { if (r.ok) { const d = await r.json(); setProjectName(d.vesselName || ""); } })
      .catch(() => { });
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !activeEquipmentId) { requestAnimationFrame(() => setEquipmentName("")); return; }
    fetch(`/api/projects/${projectId}/equipment`)
      .then(async (r) => {
        if (r.ok) {
          const list = await r.json();
          const eq = list.find((e: { id: string; name: string }) => e.id === activeEquipmentId);
          setEquipmentName(eq?.name || "");
        }
      })
      .catch(() => { });
  }, [projectId, activeEquipmentId]);

  const roleLabels: Record<string, Record<string, string>> = {
    ADMIN: { en: "Admin", ko: "관리자", ja: "管理者" },
    SHIPYARD: { en: "Shipyard", ko: "조선소", ja: "造船所" },
    VENDOR: { en: "Vendor", ko: "벤더", ja: "ベンダー" },
  };

  // ── Sidebar content ─────────────────────────────────────────────────────

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="px-5 pt-5 pb-4">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-brand to-brand-active flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105">
            <Shield size={17} className="text-white" />
          </div>
          <div>
            <p className="text-[15px] font-extrabold text-text tracking-tight">SCS</p>
            <p className="text-[10px] text-text-tertiary font-medium">Ship Equipment Cybersecurity Compliance Assessment System</p>
          </div>
        </Link>
      </div>

      {/* Project & Equipment context card */}
      {projectId && (
        <div className="mx-3 mb-2 p-3.5 rounded-xl bg-brand-lighter border border-brand/10 transition-colors duration-200">
          <Link href={`/project/${projectId}`} className="block group">
            <p className="text-[10px] font-bold text-brand uppercase tracking-wider">
              {tx(locale, "Project", "프로젝트", "プロジェクト")}
            </p>
            <p className="text-[13px] font-bold text-text mt-1 truncate group-hover:text-brand transition-colors">
              {projectName || "..."}
            </p>
          </Link>
          {activeEquipmentId && equipmentName && (
            <Link href={`/project/${projectId}/equipment/${activeEquipmentId}`} className="block mt-2 pt-2 border-t border-brand/10 group">
              <p className="text-[10px] font-bold text-brand/70 uppercase tracking-wider">
                {tx(locale, "Equipment", "기자재", "機器")}
              </p>
              <p className="text-[12px] font-bold text-brand mt-0.5 truncate group-hover:text-brand-hover transition-colors">
                {equipmentName}
              </p>
            </Link>
          )}
        </div>
      )}

      {/* Nav sections */}
      <nav className="flex-1 px-2 overflow-y-auto pb-4">
        <NavSections sections={navSections} locale={locale} pathname={pathname} />
      </nav>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Desktop Sidebar ─────────────────────────────────────────── */}
      <aside className="hidden lg:flex w-[260px] bg-surface-sidebar border-r border-border flex-col shrink-0 overflow-hidden">
        {sidebarContent}
      </aside>

      {/* ── Mobile Sidebar ──────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-surface-overlay z-40 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-y-0 left-0 w-[280px] bg-surface-sidebar border-r border-border z-50 flex flex-col lg:hidden"
            >
              <div className="absolute top-4 right-4 z-10">
                <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-md text-text-tertiary hover:text-text hover:bg-surface-secondary transition-colors">
                  <X size={18} />
                </button>
              </div>
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Main Area ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Header ────────────────────────────────────────────────── */}
        <header className="h-14 bg-white border-b border-border flex items-center justify-between px-4 lg:px-6 shrink-0">
          {/* Left: hamburger + breadcrumb */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-1.5 rounded-lg text-text-tertiary hover:bg-surface-secondary transition-colors"
            >
              <Menu size={20} />
            </button>
            <nav className="hidden sm:flex items-center gap-1 text-body-xs">
              <Link href="/" className="text-text-tertiary hover:text-brand transition-colors duration-150">
                {tx(locale, "Dashboard", "대시보드", "ダッシュボード")}
              </Link>
              {/* 프로젝트 */}
              {pathname.startsWith("/project") && (
                <>
                  <ChevronRight size={12} className="text-border-strong" />
                  <Link href="/project" className="text-text-tertiary hover:text-brand transition-colors duration-150">
                    {tx(locale, "Projects", "프로젝트", "プロジェクト")}
                  </Link>
                </>
              )}
              {projectId && (
                <>
                  <ChevronRight size={12} className="text-border-strong" />
                  <span className="text-text font-medium truncate max-w-[120px]">
                    {pathname.includes("/inventory") ? tx(locale, "Inventory", "자산 관리", "資産登録") :
                      pathname.includes("/assess") ? tx(locale, "Assessment", "보안 평가", "セキュリティ評価") :
                        pathname.includes("/document") ? tx(locale, "Documents", "문서", "文書生成") :
                          pathname.includes("/submit") ? tx(locale, "Submit", "제출", "提出") :
                            pathname.includes("/ai") ? "AI" :
                              pathname.includes("/equipment") ? tx(locale, "Equipment", "기자재", "機器") :
                                tx(locale, "Detail", "상세", "詳細")}
                  </span>
                </>
              )}
              {/* 선박 현황 */}
              {pathname.startsWith("/fleet") && (
                <>
                  <ChevronRight size={12} className="text-border-strong" />
                  <span className="text-text font-medium">{tx(locale, "Vessels", "선박 현황", "船舶一覧")}</span>
                </>
              )}
              {/* 벤더 관리 */}
              {pathname.startsWith("/shipyard") && (
                <>
                  <ChevronRight size={12} className="text-border-strong" />
                  <span className="text-text font-medium">{tx(locale, "Vendor Management", "벤더 관리", "ベンダー管理")}</span>
                </>
              )}
              {/* 기자재 관리 (벤더) */}
              {pathname.startsWith("/vendor") && (
                <>
                  <ChevronRight size={12} className="text-border-strong" />
                  <span className="text-text font-medium">{tx(locale, "Equipment", "기자재 관리", "機材管理")}</span>
                </>
              )}
              {/* 관리자 */}
              {pathname.startsWith("/admin") && (
                <>
                  <ChevronRight size={12} className="text-border-strong" />
                  <span className="text-text font-medium">{tx(locale, "Admin", "관리자", "管理者")}</span>
                </>
              )}
              {/* Q&A */}
              {pathname.startsWith("/qna") && (
                <>
                  <ChevronRight size={12} className="text-border-strong" />
                  <span className="text-text font-medium">Q&A</span>
                </>
              )}
              {/* FAQ */}
              {pathname.startsWith("/faq") && (
                <>
                  <ChevronRight size={12} className="text-border-strong" />
                  <span className="text-text font-medium">FAQ</span>
                </>
              )}
              {/* 가이드라인 */}
              {pathname.startsWith("/guidance") && (
                <>
                  <ChevronRight size={12} className="text-border-strong" />
                  <span className="text-text font-medium">{tx(locale, "Guidance", "가이드라인", "ガイダンス")}</span>
                </>
              )}
              {/* 설정 */}
              {pathname.startsWith("/settings") && (
                <>
                  <ChevronRight size={12} className="text-border-strong" />
                  <span className="text-text font-medium">{tx(locale, "Settings", "설정", "設定")}</span>
                </>
              )}
            </nav>
          </div>

          {/* Right: language + notifications + user */}
          <div className="flex items-center gap-2">
            <LanguageButton />
            <NotificationButton />
            <UserMenu
              userName={userName}
              userEmail={userEmail}
              userRole={roleLabels[userRole]?.[locale] || roleLabels[userRole]?.en || "User"}
              locale={locale}
            />
          </div>
        </header>

        {/* ── Page Content ──────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto bg-surface-page">
          <PageTransition>
            {children}
          </PageTransition>
        </main>
      </div>

      {/* ── AI Floating Chat Widget (hidden — 미완성, 나중에 활성화) ── */}
      {/* <ChatWidget /> */}

      {/* Q&A 플로팅 위젯 제거 — 지원 페이지에서 Q&A/FAQ 이용 안내 */}
      {/* <QnAWidget /> */}
    </div>
  );
}

// ─── Language Button ─────────────────────────────────────────────────────────

function LanguageButton() {
  const [ddOpen, setDdOpen, ddRef] = useDropdown();
  const { locale, setLocale } = useLocaleStore();
  const langs = [
    { value: "en" as const, flag: "🇺🇸", label: "English" },
    { value: "ko" as const, flag: "🇰🇷", label: "한국어" },
    { value: "ja" as const, flag: "🇯🇵", label: "日本語" },
  ];
  const current = langs.find((l) => l.value === locale) || langs[0];

  return (
    <div ref={ddRef} className="relative">
      <button
        onClick={() => setDdOpen(!ddOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-white text-[11px] font-medium text-text-secondary hover:text-text hover:bg-surface-secondary transition-all"
      >
        <Globe size={12} />
        {current.label}
      </button>
      <AnimatePresence>
        {ddOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1.5 w-40 bg-white border border-border rounded-lg shadow-xl z-50 py-1"
          >
            {langs.map((lang) => (
              <button key={lang.value}
                onClick={() => { setLocale(lang.value); setDdOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-left hover:bg-surface-secondary transition-colors"
              >
                <span className="text-[15px]">{lang.flag}</span>
                <span className={locale === lang.value ? "font-semibold text-brand" : "text-text-tertiary"}>{lang.label}</span>
                {locale === lang.value && <CheckCircle size={13} className="ml-auto text-brand" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Notification Button ────────────────────────────────────────────────────


function NotificationButton() {
  const [ddOpen, setDdOpen, ddRef] = useDropdown();
  const { locale } = useLocaleStore();
  const router = useRouter();

  interface DbNotif { id: string; type: string; title: string; message: string | null; link: string | null; read: boolean; createdAt: string; }
  const [notifications, setNotifications] = useState<DbNotif[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifs = useCallback(() => {
    fetch("/api/notifications")
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          setNotifications(data.notifications || []);
          setUnreadCount(data.unreadCount || 0);
        }
      })
      .catch(() => { });
  }, []);

  useEffect(() => { fetchNotifs(); }, [fetchNotifs]);
  // Poll every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchNotifs, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifs]);

  function handleClick(notif: DbNotif) {
    // Mark as read
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: notif.id, action: "read" }),
    }).then(() => fetchNotifs()).catch(() => { });

    if (notif.link) router.push(notif.link);
    setDdOpen(false);
  }

  function handleDismiss(e: React.MouseEvent, notifId: string) {
    e.stopPropagation();
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: notifId, action: "dismiss" }),
    }).then(() => fetchNotifs()).catch(() => { });
  }

  function handleReadAll() {
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read_all" }),
    }).then(() => fetchNotifs()).catch(() => { });
  }

  const iconMap: Record<string, { icon: React.ElementType<{ size?: number; className?: string }>; bg: string; color: string }> = {
    SIGNUP_REQUEST: { icon: Users, bg: "bg-brand-lighter", color: "text-brand" },
    EQUIPMENT_SUBMITTED: { icon: Send, bg: "bg-orange-50", color: "text-safety-elevated" },
    EQUIPMENT_APPROVED: { icon: CheckCircle, bg: "bg-green-50", color: "text-safety-low" },
    REVISION_REQUESTED: { icon: AlertTriangle, bg: "bg-risk-bg", color: "text-safety-high" },
  };

  return (
    <div ref={ddRef} className="relative">
      <button
        onClick={() => setDdOpen(!ddOpen)}
        className={cn(
          "relative p-2 rounded-lg transition-all duration-150",
          "text-text-tertiary hover:text-text-secondary hover:bg-surface-secondary",
          ddOpen && "bg-surface-secondary text-text-secondary",
        )}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-safety-high text-white text-[9px] font-bold flex items-center justify-center"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {ddOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1.5 w-80 bg-white rounded-xl border border-border shadow-lg overflow-hidden z-50"
          >
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <p className="text-[13px] font-bold text-text">{tx(locale, "Notifications", "알림", "通知")}</p>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <>
                    <span className="px-1.5 py-0.5 rounded-full bg-safety-high text-white text-[9px] font-bold">{unreadCount}</span>
                    <button onClick={handleReadAll} className="text-[10px] text-brand hover:text-brand-hover font-medium">
                      {tx(locale, "Read all", "모두 읽음", "すべて既読")}
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-6 text-center text-[12px] text-text-tertiary">
                  {tx(locale, "No notifications", "새로운 알림이 없습니다", "通知はありません")}
                </div>
              ) : notifications.map((notif) => {
                const cfg = iconMap[notif.type] || iconMap.SIGNUP_REQUEST;
                const NotifIcon = cfg.icon;
                return (
                  <div
                    key={notif.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleClick(notif)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(notif); }}
                    className={cn(
                      "w-full text-left px-4 py-3 border-b border-border last:border-b-0 hover:bg-surface-secondary/50 transition-colors group cursor-pointer",
                      !notif.read && "bg-brand-lighter/20",
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={cn("h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5", cfg.bg)}>
                        <NotifIcon size={12} className={cfg.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {!notif.read && <span className="h-1.5 w-1.5 rounded-full bg-brand shrink-0" />}
                          <p className={cn("text-[12px] font-semibold", notif.read ? "text-text-secondary" : "text-text")}>{translateNotif(locale, notif.title)}</p>
                        </div>
                        {notif.message && <p className="text-[11px] text-text-tertiary mt-0.5 truncate">{translateNotif(locale, notif.message)}</p>}
                        <p className="text-[10px] text-text-tertiary mt-1">
                          {new Date(notif.createdAt).toLocaleString(locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <button
                        onClick={(e) => handleDismiss(e, notif.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-text-tertiary hover:text-safety-high hover:bg-risk-bg transition-all shrink-0"
                        title={tx(locale, "Dismiss", "삭제", "削除")}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── User Menu ──────────────────────────────────────────────────────────────

function UserMenu({ userName, userEmail }: {
  userName: string; userEmail: string; userRole: string; locale: string;
}) {
  const [ddOpen, setDdOpen, ddRef] = useDropdown();
  const { locale } = useLocaleStore();

  return (
    <div ref={ddRef} className="relative">
      <button
        onClick={() => setDdOpen(!ddOpen)}
        className={cn(
          "h-8 pl-1 pr-1.5 rounded-lg flex items-center gap-1.5 transition-all duration-150",
          "hover:bg-surface-secondary/80",
          ddOpen && "bg-surface-secondary",
        )}
      >
        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
          {userName.charAt(0)}
        </div>
        <ChevronDown size={12} className={cn("text-text-tertiary/40 transition-transform duration-200", ddOpen && "rotate-180")} />
      </button>

      <AnimatePresence>
        {ddOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-lg border border-border shadow-xl ring-1 ring-black/5 overflow-hidden z-50"
          >
            {/* User info */}
            <div className="px-3 py-2.5">
              <p className="text-[13px] font-semibold text-text">{userName}</p>
              <p className="text-[11px] text-text-tertiary mt-0.5">{userEmail}</p>
            </div>

            <div className="h-px bg-border" />

            {/* Menu items */}
            <div className="py-1">
              <Link
                href="/settings"
                onClick={() => setDdOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-[12px] text-text-secondary hover:bg-surface-secondary transition-colors"
              >
                <Settings size={14} className="text-text-tertiary" />
                {tx(locale, "Settings", "설정", "設定")}
              </Link>
            </div>

            <div className="h-px bg-border" />

            {/* Sign out */}
            <div className="py-1">
              <button
                onClick={() => {
                  // Avoid 0.0.0.0 redirect: if current host is 0.0.0.0, rewrite to localhost
                  const host = typeof window !== "undefined" ? window.location.host : "";
                  const loginUrl = host.startsWith("0.0.0.0")
                    ? `${window.location.protocol}//localhost:${window.location.port}/login`
                    : "/login";
                  signOut({ callbackUrl: loginUrl });
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#DA1E28] hover:bg-[#FFF1F1] transition-colors"
              >
                <LogOut size={14} />
                {tx(locale, "Sign out", "로그아웃", "ログアウト")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
