"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, LayoutDashboard, FolderOpen, Settings,
  Bell, Search, Globe, ChevronRight, LogOut, User,
  Check,
} from "lucide-react";
import { useLocaleStore } from "@/stores/locale-store";
import { tx, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// ─── Tab configuration ──────────────────────────────────────────────────────

interface TabDef {
  id: string;
  href: string;
  labelEn: string;
  labelKo: string;
  labelJa: string;
  icon: typeof LayoutDashboard;
}

const SHIPYARD_TABS: TabDef[] = [
  { id: "dashboard", href: "/", labelEn: "Dashboard", labelKo: "대시보드", labelJa: "ダッシュボード", icon: LayoutDashboard },
  { id: "projects", href: "/project", labelEn: "Projects", labelKo: "프로젝트", labelJa: "プロジェクト", icon: FolderOpen },
  { id: "manage", href: "/shipyard", labelEn: "Management", labelKo: "관리", labelJa: "管理", icon: Settings },
];

// ─── Language options ────────────────────────────────────────────────────────

const LANGS: { value: Locale; label: string; flag: string }[] = [
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "ko", label: "한국어", flag: "🇰🇷" },
  { value: "ja", label: "日本語", flag: "🇯🇵" },
];

// ─── Main Layout ─────────────────────────────────────────────────────────────

export function ShipyardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { locale, setLocale } = useLocaleStore();
  const { data: session } = useSession();
  const userName = session?.user?.name || "User";

  const [profileOpen, setProfileOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  // Active tab detection
  const activeTab = useMemo(() => {
    if (pathname === "/") return "dashboard";
    if (pathname.startsWith("/project")) return "projects";
    if (pathname.startsWith("/shipyard") || pathname.startsWith("/settings")) return "manage";
    if (pathname.startsWith("/guidance")) return "manage";
    return "dashboard";
  }, [pathname]);

  // Breadcrumb
  const breadcrumb = useMemo(() => {
    const parts: { label: string; href?: string }[] = [
      { label: "SCS" },
    ];
    const tab = SHIPYARD_TABS.find((t) => t.id === activeTab);
    if (tab && tab.id !== "dashboard") {
      parts.push({ label: locale === "ko" ? tab.labelKo : locale === "ja" ? tab.labelJa : tab.labelEn, href: tab.href });
    }
    return parts;
  }, [activeTab, locale]);

  return (
    <div className="min-h-screen bg-surface-page">
      {/* ── Row 1: Header ──────────────────────────────────────────── */}
      <header className="h-14 bg-white border-b border-border flex items-center justify-between px-6 sticky top-0 z-40">
        {/* Left: Logo + Breadcrumb */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand to-brand-active flex items-center justify-center shrink-0 transition-transform group-hover:scale-105">
              <Shield size={15} className="text-white" />
            </div>
          </Link>
          <div className="flex items-center gap-1.5 text-[13px]">
            {breadcrumb.map((b, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight size={12} className="text-text-tertiary/50" />}
                {b.href ? (
                  <Link href={b.href} className="text-text-secondary hover:text-brand transition-colors font-medium">{b.label}</Link>
                ) : (
                  <span className="text-text-tertiary font-medium">{b.label}</span>
                )}
              </span>
            ))}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Language */}
          <div className="relative">
            <button
              onClick={() => { setLangOpen(!langOpen); setProfileOpen(false); setNotifOpen(false); }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-text-tertiary hover:text-text-secondary hover:bg-surface-secondary transition-all"
            >
              <Globe size={13} />
              {LANGS.find((l) => l.value === locale)?.label}
            </button>
            <AnimatePresence>
              {langOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                  className="absolute right-0 mt-1 w-36 bg-white border border-border rounded-lg shadow-lg z-50 py-1"
                >
                  {LANGS.map((lang) => (
                    <button key={lang.value} onClick={() => { setLocale(lang.value); setLangOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-surface-secondary transition-colors">
                      <span>{lang.flag}</span>
                      <span className={locale === lang.value ? "font-semibold text-brand" : "text-text-secondary"}>{lang.label}</span>
                      {locale === lang.value && <Check size={12} className="ml-auto text-brand" />}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Notifications */}
          <button
            onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); setLangOpen(false); }}
            className="relative p-2 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-secondary transition-all"
          >
            <Bell size={16} />
          </button>

          {/* Profile */}
          <div className="relative">
            <button
              onClick={() => { setProfileOpen(!profileOpen); setLangOpen(false); setNotifOpen(false); }}
              className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-surface-secondary transition-all"
            >
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-brand to-brand-active flex items-center justify-center text-[11px] font-bold text-white">
                {userName[0]?.toUpperCase()}
              </div>
              <span className="text-[12px] font-medium text-text-secondary hidden sm:block">{userName}</span>
            </button>
            <AnimatePresence>
              {profileOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                  className="absolute right-0 mt-1 w-48 bg-white border border-border rounded-lg shadow-lg z-50 py-1"
                >
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-[12px] font-semibold text-text">{userName}</p>
                    <p className="text-[10px] text-text-tertiary font-mono">{session?.user?.email}</p>
                    <span className="inline-block mt-1 text-[9px] font-bold text-brand bg-brand-lighter px-1.5 py-0.5 rounded">
                      {tx(locale, "Shipyard", "조선소", "造船所")}
                    </span>
                  </div>
                  <Link href="/settings" onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-[12px] text-text-secondary hover:bg-surface-secondary transition-colors">
                    <User size={13} /> {tx(locale, "Account Settings", "계정 설정", "アカウント設定")}
                  </Link>
                  <button onClick={() => signOut({ callbackUrl: "/login" })}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-safety-high hover:bg-risk-bg transition-colors">
                    <LogOut size={13} /> {tx(locale, "Sign out", "로그아웃", "ログアウト")}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* ── Row 2: Tab Bar ─────────────────────────────────────────── */}
      <nav className="bg-white border-b border-border px-6 sticky top-14 z-30">
        <div className="flex items-center gap-1">
          {SHIPYARD_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <Link key={tab.id} href={tab.href}>
                <button className={cn(
                  "relative flex items-center gap-2 px-5 py-3.5 text-[13px] font-medium transition-all",
                  isActive ? "text-brand" : "text-text-tertiary hover:text-text-secondary"
                )}>
                  <Icon size={15} className={isActive ? "text-brand" : ""} />
                  {locale === "ko" ? tab.labelKo : locale === "ja" ? tab.labelJa : tab.labelEn}
                  {isActive && (
                    <motion.div
                      layoutId="shipyard-tab-indicator"
                      className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand rounded-full"
                      transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    />
                  )}
                </button>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── Content ────────────────────────────────────────────────── */}
      <main className="min-h-[calc(100vh-112px)]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
