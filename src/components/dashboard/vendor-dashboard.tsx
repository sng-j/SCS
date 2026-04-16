"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package, CheckCircle, ArrowRight, Clock, AlertCircle,
  Send, Cpu, Bell, Ship, ChevronDown,
  MessageSquare, AlertTriangle, FileText, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SkeletonCards } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface VendorEquipment {
  id: string;
  name: string;
  description: string | null;
  status: string;
  isTypeApproved?: boolean;
  _count: { hardware: number; software: number; certDocuments?: number };
  dfdDiagram: { id: string } | null;
  project?: { id: string; vesselName: string; shipyard?: { name: string } | null; classification?: string | null };
  updatedAt?: string;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  message?: string | null;
  link?: string | null;
  read: boolean;
  createdAt: string;
}

// ─── Status helpers ─────────────────────────────────────────────────────────

type StatusKey = "approved" | "submitted" | "inProgress" | "revision" | "notStarted";

const STATUS_META: Record<StatusKey, { en: string; ko: string; ja: string; color: string; bg: string; icon: React.ElementType }> = {
  approved:   { en: "Approved",  ko: "승인됨",   ja: "承認済み",  color: "#24A148", bg: "#E6F7EF",  icon: CheckCircle },
  submitted:  { en: "Submitted", ko: "제출됨",   ja: "提出済み",  color: "#EB6200", bg: "#FFF3E0",  icon: Send },
  inProgress: { en: "In Progress", ko: "진행 중", ja: "進行中",   color: "#4589FF", bg: "#EDF5FF",  icon: Clock },
  revision:   { en: "Revision",  ko: "수정 요청", ja: "修正依頼", color: "#DA1E28", bg: "#FFF1F1",  icon: AlertTriangle },
  notStarted: { en: "Pending",   ko: "대기",     ja: "保留中",   color: "#8D8D8D", bg: "#F4F4F4",  icon: AlertCircle },
};

function categorize(status: string, eq?: VendorEquipment): StatusKey {
  if (status === "APPROVED") return "approved";
  if (status === "SUBMITTED" || status === "UNDER_REVIEW") return "submitted";
  if (status === "REVISION_REQUESTED") return "revision";
  if (status === "IN_PROGRESS") return "inProgress";
  if (eq && ((eq._count?.hardware || 0) > 0 || (eq._count?.software || 0) > 0 || eq.dfdDiagram)) return "inProgress";
  return "notStarted";
}

function statusLabel(key: StatusKey, locale: string): string {
  const m = STATUS_META[key];
  return locale === "ko" ? m.ko : locale === "ja" ? m.ja : m.en;
}

/** Determine current step for equipment */
function currentStep(eq: VendorEquipment): { step: number; total: number; label: { en: string; ko: string; ja: string } } {
  const hw = eq._count?.hardware || 0;
  const hasDfd = !!eq.dfdDiagram;
  const hasAssets = hw > 0;

  if (!hasAssets) return { step: 1, total: 5, label: { en: "Asset Registration", ko: "자산 등록", ja: "資産登録" } };
  if (!hasDfd) return { step: 2, total: 5, label: { en: "DFD Diagram", ko: "DFD 다이어그램", ja: "DFDダイアグラム" } };
  if (eq.status === "PENDING" || eq.status === "IN_PROGRESS") return { step: 3, total: 5, label: { en: "Security Assessment", ko: "보안 평가", ja: "セキュリティ評価" } };
  if (["SUBMITTED", "UNDER_REVIEW", "REVISION_REQUESTED"].includes(eq.status)) return { step: 4, total: 5, label: { en: "Documents & Submit", ko: "문서/제출", ja: "文書/提出" } };
  return { step: 5, total: 5, label: { en: "Complete", ko: "완료", ja: "完了" } };
}

function daysAgo(dateStr?: string): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Component ──────────────────────────────────────────────────────────────

export function VendorDashboard() {
  const { data: session } = useSession();
  const { locale } = useLocaleStore();
  const userName = session?.user?.name || "User";

  const [equipment, setEquipment] = useState<VendorEquipment[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "action" | "review" | "done">("all");
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [dismissedAll, setDismissedAll] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard").then(async (r) => r.ok ? (await r.json()).equipment || [] : []),
      fetch("/api/notifications").then(async (r) => r.ok ? (await r.json()).notifications || [] : []),
    ]).then(([eq, notifs]) => {
      setEquipment(eq);
      setNotifications(notifs);
    }).finally(() => setLoading(false));
  }, []);

  // Auto-expand projects with action-needed items on first load
  const expandInitDone = useRef(false);
  useEffect(() => {
    if (!expandInitDone.current && equipment.length > 0) {
      const toExpand = new Set<string>();
      for (const eq of equipment) {
        const cat = categorize(eq.status, eq);
        if (cat !== "approved" && cat !== "submitted") {
          const pid = eq.project?.id || "__none__";
          toExpand.add(pid);
        }
      }
      // If nothing needs action, expand the first project
      if (toExpand.size === 0 && equipment.length > 0) {
        toExpand.add(equipment[0].project?.id || "__none__");
      }
      expandInitDone.current = true;
      queueMicrotask(() => setExpandedProjects(toExpand));
    }
  }, [equipment]);

  // Categorize equipment
  const groups = useMemo(() => {
    const action: VendorEquipment[] = [];
    const review: VendorEquipment[] = [];
    const done: VendorEquipment[] = [];
    for (const eq of equipment) {
      const cat = categorize(eq.status, eq);
      if (cat === "approved") done.push(eq);
      else if (cat === "submitted") review.push(eq);
      else action.push(eq);
    }
    // Sort action by revision first, then by stale
    action.sort((a, b) => {
      if (a.status === "REVISION_REQUESTED" && b.status !== "REVISION_REQUESTED") return -1;
      if (b.status === "REVISION_REQUESTED" && a.status !== "REVISION_REQUESTED") return 1;
      return daysAgo(b.updatedAt) - daysAgo(a.updatedAt);
    });
    return { action, review, done };
  }, [equipment]);

  // Recent shipyard notifications (last 10, relevant types only)
  const shipyardNotifs = useMemo(() =>
    notifications
      .filter((n) => ["REVISION_REQUESTED", "EQUIPMENT_APPROVED", "REMINDER"].includes(n.type))
      .filter((n) => !dismissedIds.has(n.id))
      .slice(0, 5),
  [notifications, dismissedIds]);

  // Group equipment by project
  const projectGroups = useMemo(() => {
    const filtered = filter === "action" ? groups.action
      : filter === "review" ? groups.review
      : filter === "done" ? groups.done
      : equipment;

    const map = new Map<string, { vesselName: string; classification?: string | null; shipyard?: string; projectId: string; items: VendorEquipment[] }>();
    for (const eq of filtered) {
      const pid = eq.project?.id || "__none__";
      if (!map.has(pid)) {
        map.set(pid, {
          vesselName: eq.project?.vesselName || "—",
          classification: eq.project?.classification,
          shipyard: eq.project?.shipyard?.name,
          projectId: pid,
          items: [],
        });
      }
      map.get(pid)!.items.push(eq);
    }
    return Array.from(map.values());
  }, [equipment, groups, filter]);

  const totalCount = equipment.length;
  const approvedCount = groups.done.length;
  const completedCount = approvedCount + groups.review.length; // 제출+승인 = 벤더 완료
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  if (loading) {
    return (
      <div className="w-full max-w-[1100px] mx-auto px-6 py-6">
        <div className="space-y-4"><SkeletonCards count={3} /></div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1100px] mx-auto px-6 py-6 space-y-5">

      {/* ── Header + Stats ─────────────────────────────────────── */}
      <div>
        <h1 className="text-[18px] font-bold text-text">
          {tx(locale, "My Equipment Status", "내 기자재 현황", "担当機器の状況")}
        </h1>
        <p className="text-[12px] text-text-tertiary mt-0.5">
          {tx(locale, "Check the certification progress of your assigned equipment at a glance.", "담당 기자재의 인증 진행 상황을 한눈에 확인합니다.", "担当機器の認証進捗を一目で確認します。")}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Package, value: totalCount, label: tx(locale, "Total Equipment", "전체 기자재", "全機器"), color: "text-brand" },
          { icon: CheckCircle, value: approvedCount, label: tx(locale, "Approved", "승인됨", "承認済み"), color: "text-[#24A148]" },
          { icon: Clock, value: groups.review.length, label: tx(locale, "Under Review", "검토 중", "審査中"), color: "text-[#EB6200]" },
          { icon: AlertCircle, value: groups.action.length, label: tx(locale, "Needs Work", "작업 필요", "作業必要"), color: "text-[#4589FF]" },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-xl border border-border p-4 flex items-center gap-3">
            <s.icon size={20} className={cn("shrink-0", s.color)} />
            <div>
              <p className="text-[22px] font-bold text-text leading-none">{s.value}</p>
              <p className="text-[11px] text-text-tertiary mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Overall progress ───────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-border p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-semibold text-text">
            {tx(locale, "Certification Progress", "기자재 인증 진행률", "認証進捗率")}
          </span>
          <span className="text-[13px] font-bold text-brand">{pct}%</span>
        </div>
        <div className="h-2 bg-surface-secondary rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center gap-4 mt-2">
          {[
            { color: "#24A148", label: tx(locale, "Approved", "승인", "承認"), count: groups.done.length },
            { color: "#EB6200", label: tx(locale, "Review", "검토", "審査"), count: groups.review.length },
            { color: "#4589FF", label: tx(locale, "Working", "작업", "作業"), count: groups.action.length },
          ].map((s, i) => (
            <span key={i} className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
              <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: s.color }} />
              {s.label} <strong className="text-text">{s.count}</strong>
            </span>
          ))}
        </div>
      </div>

      {/* ── Shipyard notifications ─────────────────────────────── */}
      {shipyardNotifs.length > 0 && !dismissedAll && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Bell size={14} className="text-brand" />
            <span className="text-[12px] font-bold text-text">
              {tx(locale, "From Shipyard", "조선소 알림", "造船所からの通知")}
            </span>
            <span className="text-[10px] font-bold text-brand bg-brand-lighter/50 px-1.5 py-0.5 rounded-full">{shipyardNotifs.length}</span>
            <button onClick={() => {
              shipyardNotifs.forEach((n) => fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: n.id, action: "dismiss" }) }));
              setDismissedAll(true);
            }} className="ml-auto text-[10px] text-text-tertiary hover:text-text-secondary transition-colors">
              {tx(locale, "Dismiss all", "모두 닫기", "全て閉じる")}
            </button>
          </div>
          <div className="divide-y divide-border/50">
            {shipyardNotifs.map((n) => {
              const isRevision = n.type === "REVISION_REQUESTED";
              const isApproval = n.type === "EQUIPMENT_APPROVED";
              return (
                <div key={n.id} className={cn("flex items-start gap-3 px-4 py-3 hover:bg-surface-page/50 transition-colors group",
                    !n.read && "bg-brand-lighter/10"
                  )}>
                  <Link href={n.link || "#"} className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                      isRevision ? "bg-[#FFF1F1]" : isApproval ? "bg-[#E6F7EF]" : "bg-[#EDF5FF]"
                    )}>
                      {isRevision ? <AlertTriangle size={13} className="text-[#DA1E28]" /> :
                       isApproval ? <CheckCircle size={13} className="text-[#24A148]" /> :
                       <MessageSquare size={13} className="text-brand" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-[12px] text-text truncate", !n.read && "font-semibold")}>{n.title}</p>
                      {n.message && <p className="text-[11px] text-text-tertiary truncate mt-0.5">{n.message}</p>}
                    </div>
                    <span className="text-[10px] text-text-tertiary shrink-0 mt-0.5">{daysAgo(n.createdAt) === 0 ? tx(locale, "today", "오늘", "今日") : `${daysAgo(n.createdAt)}${tx(locale, "d", "일 전", "日前")}`}</span>
                  </Link>
                  <button onClick={() => {
                    fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: n.id, action: "dismiss" }) });
                    setDismissedIds((p) => new Set(p).add(n.id));
                  }} className="p-1 rounded text-text-tertiary hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all shrink-0 mt-0.5">
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Filter tabs ────────────────────────────────────────── */}
      {equipment.length > 0 && (
        <div className="flex items-center gap-2">
          {([
            { key: "all" as const, label: tx(locale, "All", "전체", "すべて"), count: totalCount },
            { key: "action" as const, label: tx(locale, "Needs Work", "작업 필요", "作業必要"), count: groups.action.length },
            { key: "review" as const, label: tx(locale, "Under Review", "검토 중", "審査中"), count: groups.review.length },
            { key: "done" as const, label: tx(locale, "Completed", "완료", "完了"), count: groups.done.length },
          ]).map((tab) => (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              className={cn("h-8 px-3 rounded-lg text-[12px] font-medium transition-colors flex items-center gap-1.5",
                filter === tab.key ? "bg-brand text-white" : "bg-white border border-border text-text-tertiary hover:text-text hover:border-text-tertiary/30"
              )}>
              {tab.label}
              <span className={cn("text-[10px] font-bold", filter === tab.key ? "text-white/70" : "text-text-tertiary")}>{tab.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Equipment by project ───────────────────────────────── */}
      {equipment.length === 0 ? (
        <EmptyState
          icon={Package}
          title={tx(locale, "No equipment assigned", "할당된 기자재가 없습니다", "割り当てられた機器がありません")}
          subtitle={tx(locale, "Equipment will appear here when assigned by a shipyard", "조선소에서 기자재를 할당하면 여기에 표시됩니다", "造船所から機器が割り当てられるとここに表示されます")}
        />
      ) : (
        <div className="space-y-3">
          {projectGroups.map(({ vesselName, classification, shipyard, projectId, items }) => {
            const isExpanded = expandedProjects.has(projectId);
            const doneOrSubmitted = items.filter((eq) => { const c = categorize(eq.status, eq); return c === "approved" || c === "submitted"; }).length;
            const projPct = items.length > 0 ? Math.round((doneOrSubmitted / items.length) * 100) : 0;
            const hasAction = items.some((eq) => { const c = categorize(eq.status, eq); return c !== "approved" && c !== "submitted"; });

            return (
            <div key={projectId} className={cn("bg-white rounded-xl border border-border overflow-hidden transition-shadow", isExpanded && "shadow-sm ring-1 ring-brand/5")}>
              {/* Project accordion header */}
              <button
                onClick={() => setExpandedProjects((prev) => { const n = new Set(prev); if (n.has(projectId)) n.delete(projectId); else n.add(projectId); return n; })}
                className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-surface-secondary/20 transition-colors"
              >
                <div className="h-8 w-8 rounded-lg bg-brand-lighter/50 text-brand flex items-center justify-center shrink-0">
                  <Ship size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[14px] font-bold text-text">{vesselName}</h2>
                    {classification && (
                      <span className="text-[9px] font-black tracking-widest text-brand bg-brand-lighter/50 px-1.5 py-0.5 rounded">
                        {classification}
                      </span>
                    )}
                    <span className="text-[11px] text-text-tertiary">{items.length} {tx(locale, "equipment", "기자재", "機材")}</span>
                  </div>
                  <p className="text-[11px] text-text-tertiary mt-0.5">{shipyard || "—"}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-[13px] font-bold tabular-nums", projPct >= 100 ? "text-[#24A148]" : "text-brand")}>{projPct}%</span>
                    <div className="w-16 h-1.5 bg-surface-secondary rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${projPct}%`, backgroundColor: projPct >= 100 ? "#24A148" : "var(--color-brand)" }} />
                    </div>
                  </div>
                  <ChevronDown size={16} className={cn("text-text-tertiary transition-transform duration-200", isExpanded && "rotate-180")} />
                </div>
              </button>

              {/* Expanded: equipment cards */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    <div className="border-t border-border p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((eq) => {
                  const cat = categorize(eq.status, eq);
                  const meta = STATUS_META[cat];
                  const step = currentStep(eq);
                  const stepLabel = locale === "ko" ? step.label.ko : locale === "ja" ? step.label.ja : step.label.en;
                  const hwCount = eq._count?.hardware || 0;
                  const swCount = eq._count?.software || 0;
                  const isRevision = cat === "revision";
                  const isDone = cat === "approved";

                  return (
                    <motion.div key={eq.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                      <Link href={`/project/${eq.project?.id}/equipment/${eq.id}`}
                        className={cn(
                          "block bg-white rounded-xl border p-4 transition-all hover:shadow-md hover:-translate-y-0.5 group",
                          isRevision ? "border-[#DA1E28]/30 hover:border-[#DA1E28]/50" :
                          isDone ? "border-[#24A148]/20" :
                          "border-border hover:border-brand/20"
                        )}>
                        {/* Name + status */}
                        <div className="flex items-start justify-between mb-3">
                          <h3 className="text-[13px] font-bold text-text truncate group-hover:text-brand transition-colors flex-1 min-w-0">
                            {eq.name}
                          </h3>
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ml-2"
                            style={{ backgroundColor: meta.bg, color: meta.color }}>
                            {statusLabel(cat, locale)}
                          </span>
                        </div>

                        {/* Step progress */}
                        <div className="flex items-center gap-3 mb-3">
                          {/* Progress ring */}
                          <div className="relative w-12 h-12 shrink-0">
                            <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
                              <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" className="text-surface-secondary" />
                              <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3"
                                strokeDasharray={`${isDone ? 100 : Math.round(((step.step - 1) / step.total) * 100)} ${100 - (isDone ? 100 : Math.round(((step.step - 1) / step.total) * 100))}`}
                                strokeLinecap="round"
                                className={isDone ? "text-[#24A148]" : "text-brand"} />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-text">
                              {isDone ? "✓" : `${step.step}/${step.total}`}
                            </span>
                          </div>

                          {/* Step checklist */}
                          <div className="flex-1 space-y-1">
                            {[
                              { en: "Assets", ko: "자산", ja: "資産", done: (hwCount + swCount) > 0 },
                              { en: "Security", ko: "보안점검", ja: "セキュリティ", done: step.step > 3 || isDone || cat === "submitted" },
                              { en: "Submit", ko: "제출", ja: "提出", done: isDone || cat === "submitted" },
                            ].map((s, i) => (
                              <div key={i} className="flex items-center gap-1.5">
                                {s.done ? (
                                  <CheckCircle size={12} className="text-[#24A148] shrink-0" />
                                ) : (
                                  <div className="w-3 h-3 rounded-full border border-border shrink-0" />
                                )}
                                <span className={cn("text-[10px]", s.done ? "text-text" : "text-text-tertiary")}>
                                  {locale === "ko" ? s.ko : locale === "ja" ? s.ja : s.en}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center gap-3 pt-2.5 border-t border-border/50 text-[10px] text-text-tertiary">
                          <span>HW <strong className="text-text">{hwCount}</strong></span>
                          <span>SW <strong className="text-text">{swCount}</strong></span>
                          {hwCount === 0 && swCount === 0 && (cat === "notStarted" || cat === "inProgress") && (
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.location.href = "/vendor"; }}
                              className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-lighter/50 text-brand text-[10px] font-semibold hover:bg-brand-lighter transition-colors"
                            >
                              <FileText size={10} />
                              {tx(locale, "Apply Template", "템플릿 적용", "テンプレート適用")}
                            </button>
                          )}
                          <span className="ml-auto text-[11px] font-medium text-brand group-hover:text-brand-hover transition-colors">
                            {isDone ? `${tx(locale, "View", "보기", "表示")} →` :
                             cat === "submitted" ? `${tx(locale, "Waiting", "대기 중", "待機中")} →` :
                             isRevision ? `${tx(locale, "Fix now", "수정하기", "修正")} →` :
                             step.step === 1 ? `${tx(locale, "Start", "시작하기", "開始")} →` :
                             `${stepLabel} →`}
                          </span>
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
