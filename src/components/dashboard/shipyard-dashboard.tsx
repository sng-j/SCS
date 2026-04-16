"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Ship, ArrowRight, ChevronDown, Search, Plus, AlertTriangle,
  MessageSquare, FileText, Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Equipment {
  id: string;
  name: string;
  status: string;
  isTypeApproved?: boolean;
  vendor?: { id: string; name: string; company: string; email?: string } | null;
  project?: { id: string; vesselName: string } | null;
  _count?: { hardware: number; software: number; certDocuments?: number };
  dfdDiagram?: { id: string } | null;
  updatedAt?: string;
}

interface Project {
  id: string;
  vesselName: string;
  status: string;
  hwCount: number;
  swCount: number;
  projectGroup?: { id: string; name: string; shipowner: string | null } | null;
}

interface DashboardData {
  equipment?: Equipment[];
  recentProjects?: Project[];
  pendingReviews?: number;
}

// ─── Status helpers ─────────────────────────────────────────────────────────

type StatusKey = "approved" | "submitted" | "inProgress" | "notStarted";

const STATUS_META: Record<StatusKey, { color: string; bg: string; dot: string }> = {
  approved:   { color: "text-[#24A148]", bg: "bg-[#E6F7EF]", dot: "#24A148" },
  submitted:  { color: "text-[#EB6200]", bg: "bg-[#FFF3E0]", dot: "#EB6200" },
  inProgress: { color: "text-[#4589FF]", bg: "bg-[#EDF5FF]", dot: "#4589FF" },
  notStarted: { color: "text-[#C6C6C6]", bg: "bg-[#F4F4F4]", dot: "#C6C6C6" },
};

function categorize(status: string, _eq?: Equipment): StatusKey {
  if (status === "APPROVED") return "approved";
  if (status === "SUBMITTED" || status === "UNDER_REVIEW") return "submitted";
  if (status === "IN_PROGRESS" || status === "REVISION_REQUESTED") return "inProgress";
  return "notStarted";
}

function statusLabel(key: StatusKey, locale: string): string {
  const m: Record<StatusKey, { en: string; ko: string; ja: string }> = {
    approved: { en: "Approved", ko: "승인됨", ja: "承認済み" },
    submitted: { en: "Submitted", ko: "제출됨", ja: "提出済み" },
    inProgress: { en: "In Progress", ko: "진행 중", ja: "進行中" },
    notStarted: { en: "Not Started", ko: "미착수", ja: "未着手" },
  };
  return locale === "ko" ? m[key].ko : locale === "ja" ? m[key].ja : m[key].en;
}

// ─── Urgency helpers ────────────────────────────────────────────────────────

function daysAgo(dateStr?: string): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function daysAgoLabel(days: number, locale: string): string {
  if (days === 0) return tx(locale, "today", "오늘", "今日");
  if (days === 1) return tx(locale, "1d ago", "1일 전", "1日前");
  return `${days}${tx(locale, "d ago", "일 전", "日前")}`;
}

/** Who needs to act? */
function ballInCourt(cat: StatusKey, locale: string): { label: string; isShipyard: boolean } {
  if (cat === "submitted") return { label: tx(locale, "Awaiting Review", "검토 대기", "レビュー待ち"), isShipyard: true };
  if (cat === "approved") return { label: tx(locale, "Done", "완료", "完了"), isShipyard: false };
  return { label: tx(locale, "Vendor", "벤더 작업중", "ベンダー作業中"), isShipyard: false };
}

/** Risk level of a project based on vendor status */
function projectRisk(counts: Record<StatusKey, number>, eqs: Equipment[]): "critical" | "warn" | "ok" {
  const staleNotStarted = eqs.filter((eq) => categorize(eq.status, eq) === "notStarted" && daysAgo(eq.updatedAt) > 14).length;
  if (staleNotStarted > 0 || counts.notStarted > 2) return "critical";
  if (counts.notStarted > 0 || counts.submitted > 1) return "warn";
  return "ok";
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ShipyardDashboard() {
  const { locale } = useLocaleStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [expandedContracts, setExpandedContracts] = useState<Set<string>>(new Set(["__all__"]));
  const [filter, setFilter] = useState<StatusKey | "all">("all");
  const [search, setSearch] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [remindedIds, setRemindedIds] = useState<Set<string>>(new Set());
  const [showAllVendors, setShowAllVendors] = useState(false);

  const toggleContract = (id: string) => {
    setExpandedContracts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };


  useEffect(() => {
    fetch("/api/dashboard")
      .then(async (res) => { if (res.ok) setData(await res.json()); })
      .finally(() => setLoading(false));
  }, []);

  const equipment = (data?.equipment || []) as Equipment[];
  const projects = data?.recentProjects || [];

  // Group equipment by project (vessel)
  const vesselGroups = useMemo(() => {
    const map = new Map<string, { project: Project; items: Equipment[] }>();
    for (const p of projects) map.set(p.id, { project: p, items: [] });
    for (const eq of equipment) {
      const pid = eq.project?.id;
      if (pid && map.has(pid)) map.get(pid)!.items.push(eq);
    }
    return Array.from(map.values());
  }, [projects, equipment]);

  // Group vessels by contract (ProjectGroup)
  const contractGroups = useMemo(() => {
    const grouped: { contract: { id: string; name: string; shipowner: string | null } | null; vessels: typeof vesselGroups }[] = [];
    const contractMap = new Map<string, typeof vesselGroups>();
    const ungrouped: typeof vesselGroups = [];
    for (const vg of vesselGroups) {
      const pg = vg.project.projectGroup;
      if (pg) {
        if (!contractMap.has(pg.id)) contractMap.set(pg.id, []);
        contractMap.get(pg.id)!.push(vg);
      } else {
        ungrouped.push(vg);
      }
    }
    contractMap.forEach((vessels, id) => {
      const pg = vessels[0].project.projectGroup!;
      grouped.push({ contract: pg, vessels });
    });
    if (ungrouped.length > 0) grouped.push({ contract: null, vessels: ungrouped });
    return grouped;
  }, [vesselGroups]);

  // Auto-expand all contracts only on first load
  const dashInitDone = useRef(false);
  useEffect(() => {
    if (!dashInitDone.current && contractGroups.length > 0) {
      dashInitDone.current = true;
      const newSet = new Set(contractGroups.map((c) => c.contract?.id || "ungrouped"));
      queueMicrotask(() => setExpandedContracts(newSet));
    }
  }, [contractGroups]); // eslint-disable-line react-hooks/exhaustive-deps

  // Overall stats
  const overall = useMemo(() => {
    const counts: Record<StatusKey, number> = { approved: 0, submitted: 0, inProgress: 0, notStarted: 0 };
    for (const eq of equipment) counts[categorize(eq.status, eq)]++;
    const total = equipment.length;
    return { ...counts, total, pct: total > 0 ? Math.round((counts.approved / total) * 100) : 0 };
  }, [equipment]);

  // Submitted items needing review
  const reviewItems = equipment.filter((e) => categorize(e.status, e) === "submitted");

  if (loading) {
    return (
      <div className="w-full px-8 py-6">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-surface-secondary/50 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-6 py-6 space-y-5">

      {/* ── Top stats row ─────────────────────────────────────────── */}
      <div className="flex gap-3">
        {/* Progress ring - compact */}
        <div className="bg-white rounded-xl border border-border px-5 py-4 flex items-center gap-4 shrink-0">
          <div className="relative" style={{ width: 56, height: 56 }}>
            <svg width="56" height="56" className="-rotate-90">
              <circle cx="28" cy="28" r="24" fill="none" stroke="var(--color-surface-tertiary)" strokeWidth="5" />
              <circle cx="28" cy="28" r="24" fill="none" stroke="var(--color-brand)" strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 24}
                strokeDashoffset={2 * Math.PI * 24 * (1 - overall.pct / 100)}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[15px] font-black text-text">{overall.pct}%</span>
            </div>
          </div>
          <div>
            <p className="text-[12px] font-bold text-text">{overall.approved}/{overall.total}</p>
            <p className="text-[10px] text-text-tertiary">{tx(locale, "Certified", "인증 완료", "認証完了")}</p>
          </div>
        </div>

        {/* Status cards */}
        {(["approved", "submitted", "inProgress", "notStarted"] as StatusKey[]).map((key) => (
          <div key={key} className="flex-1 bg-white rounded-xl border border-border px-4 py-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_META[key].dot }} />
              <span className="text-[10px] text-text-tertiary font-medium">{statusLabel(key, locale)}</span>
            </div>
            <p className="text-[22px] font-black text-text tabular-nums">{overall[key]}</p>
          </div>
        ))}
      </div>

      {/* ── Main content (full width) ─────────────────────────────── */}
      <div className="space-y-5">

          {/* Review requests */}
          {reviewItems.length > 0 && (
            <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center gap-2.5 mb-3">
                <span className="h-2 w-2 rounded-full bg-[#EB6200] animate-pulse" />
                <h2 className="text-[13px] font-bold text-text">
                  {tx(locale, "Review Requests", "검토 요청", "レビュー依頼")}
                </h2>
                <span className="text-[11px] font-bold text-[#EB6200] bg-[#FFF3E0] px-2 py-0.5 rounded-full">{reviewItems.length}</span>
              </div>
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-surface-page border-b border-border">
                      {[
                        tx(locale, "Equipment", "기자재", "機材"),
                        tx(locale, "Vendor", "벤더", "ベンダー"),
                        tx(locale, "Project", "프로젝트", "プロジェクト"),
                        "HW/SW",
                        "",
                      ].map((h, i) => (
                        <th key={i} className={cn("text-[10px] font-bold text-text-tertiary uppercase tracking-wider px-4 py-2", i === 3 ? "text-center" : "text-left", i === 4 ? "text-right" : "")}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reviewItems.map((eq, i) => (
                      <tr key={eq.id} className={cn("hover:bg-[#FFFBF5] transition-colors", i > 0 && "border-t border-border/40")}>
                        <td className="px-4 py-3">
                          <Link href={`/project/${eq.project?.id}?reviewEqId=${eq.id}`} className="text-[13px] font-semibold text-text hover:text-brand transition-colors">
                            {eq.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-[12px] text-text-tertiary">{eq.vendor?.company || eq.vendor?.name || "—"}</td>
                        <td className="px-4 py-3 text-[11px] text-text-tertiary">{eq.project?.vesselName}</td>
                        <td className="px-4 py-3 text-[11px] text-text-tertiary text-center font-mono">{eq._count?.hardware || 0} / {eq._count?.software || 0}</td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/project/${eq.project?.id}?reviewEqId=${eq.id}`}>
                            <Button size="sm">{tx(locale, "Review", "검토", "レビュー")} <ArrowRight size={12} /></Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.section>
          )}

          {/* Projects */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[13px] font-bold text-text">
                {tx(locale, "Project Status", "프로젝트 현황", "プロジェクト状況")}
                <span className="text-text-tertiary font-normal ml-2">
                  {contractGroups.length}{tx(locale, " projects", "개 프로젝트", "プロジェクト")} · {projects.length}{tx(locale, " vessels", "척", "隻")}
                </span>
              </h2>
              <div className="flex items-center gap-2">
                {/* Project search */}
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
                  <input
                    type="text" value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)}
                    placeholder={tx(locale, "Search projects...", "프로젝트 검색...", "プロジェクト検索...")}
                    className="h-8 w-48 rounded-lg border border-border bg-white pl-8 pr-3 text-[11px] text-text placeholder:text-text-tertiary/60 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
                  />
                </div>
                <Link href="/project/new">
                  <Button size="sm"><Plus size={13} /> {tx(locale, "New Project", "새 프로젝트", "新規プロジェクト")}</Button>
                </Link>
              </div>
            </div>

            {projects.length === 0 ? (
              <div className="bg-white rounded-xl border-2 border-dashed border-border py-16 text-center">
                <Ship size={32} className="mx-auto text-text-tertiary mb-3" />
                <p className="text-[14px] font-bold text-text mb-1">{tx(locale, "No projects yet", "등록된 프로젝트가 없습니다", "プロジェクトがありません")}</p>
                <p className="text-[12px] text-text-tertiary mb-4">{tx(locale, "Create a vessel project to get started", "선박 프로젝트를 생성하여 시작하세요", "船舶プロジェクトを作成して開始")}</p>
                <Link href="/project/new"><Button size="sm"><Plus size={14} /> {tx(locale, "Create Project", "프로젝트 생성", "プロジェクト作成")}</Button></Link>
              </div>
            ) : (
              <div className="space-y-5">
                {contractGroups
                  .filter(({ contract, vessels: cVessels }) => {
                    if (!projectSearch) return true;
                    const s = projectSearch.toLowerCase();
                    if (contract?.name.toLowerCase().includes(s)) return true;
                    if (contract?.shipowner?.toLowerCase().includes(s)) return true;
                    return cVessels.some(({ project: p }) => p.vesselName.toLowerCase().includes(s));
                  })
                  .map(({ contract, vessels: cVessels }) => {
                  const cTotalEq = cVessels.reduce((s, v) => s + v.items.length, 0);
                  const cApproved = cVessels.reduce((s, v) => s + v.items.filter((e) => categorize(e.status, e) === "approved").length, 0);
                  const cPct = cTotalEq > 0 ? Math.round((cApproved / cTotalEq) * 100) : 0;
                  const contractId = contract?.id || "ungrouped";
                  const isContractOpen = expandedContracts.has(contractId);

                  return (
                    <div key={contractId}>
                      {/* Contract header — clickable to toggle */}
                      {contract && (
                        <button
                          onClick={() => toggleContract(contractId)}
                          className="w-full bg-white rounded-xl border border-border p-4 mb-3 flex items-center gap-4 hover:shadow-sm transition-all text-left"
                        >
                          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand to-brand-active flex items-center justify-center shrink-0">
                            <Building2 size={18} className="text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-bold text-text">{contract.name}</p>
                            <p className="text-[11px] text-text-tertiary">{contract.shipowner || "—"} · {cVessels.length}{tx(locale, " vessels", "척 호선", "隻")} · {cTotalEq}{tx(locale, " equipment", "개 기자재", "機材")}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="w-24 h-2 rounded-full bg-surface-secondary overflow-hidden">
                              <div className="h-full rounded-full bg-[#24A148] transition-all" style={{ width: `${cPct}%` }} />
                            </div>
                            <span className={cn("text-[14px] font-bold tabular-nums", cPct >= 100 ? "text-[#24A148]" : "text-text-secondary")}>{cPct}%</span>
                            <ChevronDown size={16} className={cn("text-text-tertiary transition-transform", isContractOpen && "rotate-180")} />
                          </div>
                        </button>
                      )}

                      {/* Vessels under this contract — collapsible */}
                      <AnimatePresence initial={false}>
                        {(isContractOpen || !contract) && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                      <div className={cn("space-y-3", contract && "ml-5 border-l-2 border-brand/10 pl-4")}>
                {cVessels.map(({ project: p, items: eqs }, idx) => {
                  const isExpanded = expandedProject === p.id;
                  const counts: Record<StatusKey, number> = { approved: 0, submitted: 0, inProgress: 0, notStarted: 0 };
                  for (const eq of eqs) counts[categorize(eq.status, eq)]++;
                  const pct = eqs.length > 0 ? Math.round((counts.approved / eqs.length) * 100) : 0;

                  // Filter
                  const filtered = eqs.filter((eq) => {
                    if (filter !== "all" && categorize(eq.status, eq) !== filter) return false;
                    if (search) {
                      const s = search.toLowerCase();
                      return eq.name.toLowerCase().includes(s) || (eq.vendor?.company || eq.vendor?.name || "").toLowerCase().includes(s);
                    }
                    return true;
                  });

                  return (
                    <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}>
                      <div className={cn(
                        "bg-white rounded-xl border border-border overflow-hidden transition-shadow",
                        isExpanded && "shadow-sm ring-1 ring-brand/5",
                                                                      )}>
                        {/* Project header */}
                        <button
                          onClick={() => { setExpandedProject(isExpanded ? null : p.id); setFilter("all"); setSearch(""); }}
                          className="w-full flex items-center gap-5 px-5 py-4 text-left hover:bg-surface-secondary/20 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3">
                              <p className="text-[15px] font-bold text-text">{p.vesselName}</p>
                              <span className="text-[11px] text-text-tertiary">{eqs.length} {tx(locale, "equipment", "기자재", "機材")}</span>
                            </div>
                            {/* Status bar */}
                            <div className="flex h-2 rounded-full overflow-hidden mt-3 bg-surface-secondary">
                              {(["approved", "submitted", "inProgress", "notStarted"] as StatusKey[]).map((key) => {
                                const w = eqs.length > 0 ? (counts[key] / eqs.length) * 100 : 0;
                                if (w === 0) return null;
                                return <div key={key} style={{ width: `${w}%`, backgroundColor: STATUS_META[key].dot }} className="transition-all duration-500" />;
                              })}
                            </div>
                            {/* Legend */}
                            <div className="flex gap-4 mt-2">
                              {(["approved", "submitted", "inProgress", "notStarted"] as StatusKey[]).filter((k) => counts[k] > 0).map((key) => (
                                <span key={key} className="flex items-center gap-1 text-[10px] text-text-tertiary">
                                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_META[key].dot }} />
                                  {statusLabel(key, locale)} {counts[key]}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center gap-4 shrink-0">
                            <div className="text-right">
                              <p className={cn("text-[20px] font-black tabular-nums", pct >= 100 ? "text-[#24A148]" : "text-brand")}>{pct}%</p>
                              <p className="text-[10px] text-text-tertiary">{tx(locale, "complete", "완료", "完了")}</p>
                            </div>
                            <ChevronDown size={16} className={cn("text-text-tertiary transition-transform duration-200", isExpanded && "rotate-180")} />
                          </div>
                        </button>

                        {/* Expanded detail */}
                        <AnimatePresence>
                          {isExpanded && (() => {
                            // Group by vendor
                            const vendorMap = new Map<string, { vendor: Equipment["vendor"]; items: Equipment[] }>();
                            for (const eq of eqs) {
                              const vid = eq.vendor?.id || "__none__";
                              if (!vendorMap.has(vid)) vendorMap.set(vid, { vendor: eq.vendor, items: [] });
                              vendorMap.get(vid)!.items.push(eq);
                            }
                            const vendorGroups = Array.from(vendorMap.values());

                            return (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                              <div className="border-t border-border">

                                {/* ── Vendor summary cards ─────────────── */}
                                {(() => {
                                  // Separate at-risk vs completed vendors
                                  const vendorsWithStatus = vendorGroups.map(({ vendor: v, items: vEqs }) => {
                                    const vCounts: Record<StatusKey, number> = { approved: 0, submitted: 0, inProgress: 0, notStarted: 0 };
                                    for (const eq of vEqs) vCounts[categorize(eq.status, eq)]++;
                                    const vTotal = vEqs.length;
                                    const vDone = vCounts.approved;
                                    const allDone = vDone === vTotal;
                                    const hasNotStarted = vCounts.notStarted > 0;
                                    const vid = v?.id || "__none__";
                                    const worstStale = Math.max(...vEqs.filter((eq) => categorize(eq.status, eq) !== "approved").map((eq) => daysAgo(eq.updatedAt)), 0);
                                    const vendorCritical = hasNotStarted && worstStale > 14;
                                    return { vendor: v, items: vEqs, vCounts, vTotal, vDone, allDone, hasNotStarted, vid, worstStale, vendorCritical };
                                  });
                                  const atRisk = vendorsWithStatus.filter((v) => !v.allDone);
                                  const completed = vendorsWithStatus.filter((v) => v.allDone);
                                  const visibleVendors = showAllVendors ? vendorsWithStatus : atRisk;

                                  return (
                                <div className="px-5 py-4 bg-surface-page/30 border-b border-border">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      <p className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider">
                                        {tx(locale, "Vendor Progress", "벤더별 진행 현황", "ベンダー別進捗")}
                                      </p>
                                      {!showAllVendors && completed.length > 0 && (
                                        <span className="text-[10px] text-[#24A148] font-medium bg-[#E6F7EF] px-2 py-0.5 rounded-full">
                                          {completed.length} {tx(locale, "completed", "완료", "完了")}
                                        </span>
                                      )}
                                    </div>
                                    {completed.length > 0 && (
                                      <button
                                        onClick={() => setShowAllVendors(!showAllVendors)}
                                        className="text-[10px] font-medium text-brand hover:text-brand-hover transition-colors"
                                      >
                                        {showAllVendors
                                          ? tx(locale, "Show at-risk only", "미완료만 보기", "未完了のみ表示")
                                          : tx(locale, "Show all vendors", "전체 벤더 보기", "全ベンダー表示")
                                        } ({vendorsWithStatus.length})
                                      </button>
                                    )}
                                  </div>

                                  {visibleVendors.length === 0 ? (
                                    <div className="text-center py-3 text-[12px] text-[#24A148] font-medium">
                                      ✓ {tx(locale, "All vendors completed", "모든 벤더 완료", "全ベンダー完了")}
                                    </div>
                                  ) : (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                    {visibleVendors.map(({ vendor: v, items: vEqs, vCounts, vTotal, vDone, allDone, hasNotStarted, vid, worstStale, vendorCritical }) => (
                                        <div key={vid} className={cn(
                                          "rounded-lg border px-4 py-3 transition-all",
                                          allDone ? "border-[#24A148]/30 bg-[#E6F7EF]/30" :
                                          vendorCritical ? "border-[#DA1E28]/20 bg-[#FFF1F1]/30" :
                                          hasNotStarted ? "border-[#EB6200]/15 bg-[#FFF3E0]/15" :
                                          "border-border bg-white"
                                        )}>
                                          <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                              <Building2 size={13} className="text-text-tertiary shrink-0" />
                                              <span className="text-[12px] font-semibold text-text truncate">
                                                {v?.company || v?.name || tx(locale, "Unassigned", "미배정", "未割当")}
                                              </span>
                                            </div>
                                            {!allDone && worstStale > 7 && (
                                              <span className={cn("flex items-center gap-1 text-[10px] font-medium", vendorCritical ? "text-[#DA1E28]" : "text-[#EB6200]")}>
                                                <AlertTriangle size={12} />
                                                {daysAgoLabel(worstStale, locale)}
                                              </span>
                                            )}
                                          </div>

                                          {/* Progress bar */}
                                          <div className="flex h-1.5 rounded-full overflow-hidden bg-surface-secondary mb-2">
                                            {(["approved", "submitted", "inProgress", "notStarted"] as StatusKey[]).map((key) => {
                                              const w = vTotal > 0 ? (vCounts[key] / vTotal) * 100 : 0;
                                              if (w === 0) return null;
                                              return <div key={key} style={{ width: `${w}%`, backgroundColor: STATUS_META[key].dot }} />;
                                            })}
                                          </div>

                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-[10px] text-text-tertiary">
                                              <span className="font-bold text-text tabular-nums">{vDone}/{vTotal}</span>
                                              <span>{tx(locale, "approved", "승인", "承認")}</span>
                                              {vCounts.submitted > 0 && (
                                                <span className="text-[#EB6200] font-medium">{vCounts.submitted} {tx(locale, "pending", "검토대기", "レビュー待ち")}</span>
                                              )}
                                            </div>

                                            {/* Remind vendor (all incomplete items) */}
                                            {!allDone && (
                                              <button
                                                disabled={remindedIds.has(vid)}
                                                onClick={async () => {
                                                  const incomplete = vEqs.filter((eq) => categorize(eq.status, eq) !== "approved");
                                                  for (const eq of incomplete) {
                                                    await fetch(`/api/projects/${eq.project?.id}/equipment/${eq.id}/remind`, { method: "POST" });
                                                  }
                                                  setRemindedIds((prev) => new Set(prev).add(vid));
                                                  setTimeout(() => setRemindedIds((prev) => { const n = new Set(prev); n.delete(vid); return n; }), 3000);
                                                }}
                                                className={cn("flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all",
                                                  remindedIds.has(vid) ? "text-[#24A148] bg-[#E6F7EF]" : "text-text-tertiary hover:text-brand hover:bg-brand-lighter/30"
                                                )}
                                              >
                                                {remindedIds.has(vid) ? tx(locale, "✓ Sent", "✓ 전송됨", "✓ 送信済み") : <><MessageSquare size={10} /> {tx(locale, "Remind", "리마인드", "リマインド")}</>}
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                    ))}
                                  </div>
                                  )}
                                </div>
                                  );
                                })()}

                                {/* ── Filter + search ─────────────────── */}
                                <div className="flex items-center gap-2 px-5 py-2.5 border-b border-border">
                                  {(["all", "approved", "submitted", "inProgress", "notStarted"] as (StatusKey | "all")[]).map((key) => {
                                    const cnt = key === "all" ? eqs.length : counts[key as StatusKey];
                                    return (
                                      <button key={key} onClick={() => setFilter(key)}
                                        className={cn("px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all",
                                          filter === key ? "bg-brand text-white" : "text-text-tertiary hover:bg-surface-secondary")}>
                                        {key === "all" ? tx(locale, "All", "전체", "すべて") : statusLabel(key as StatusKey, locale)} {cnt > 0 && cnt}
                                      </button>
                                    );
                                  })}
                                  <div className="flex-1" />
                                  <div className="relative">
                                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
                                    <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                                      placeholder={tx(locale, "Search...", "검색...", "検索...")}
                                      className="w-[160px] h-7 pl-7 pr-2 rounded-md border border-border bg-white text-[11px] focus:outline-none focus:ring-1 focus:ring-brand/30" />
                                  </div>
                                </div>

                                {/* ── Equipment table ─────────────────── */}
                                <table className="w-full">
                                  <thead>
                                    <tr className="bg-surface-page/50">
                                      {[
                                        { label: tx(locale, "Equipment", "기자재", "機材"), align: "text-left" },
                                        { label: tx(locale, "Vendor", "벤더", "ベンダー"), align: "text-left" },
                                        { label: tx(locale, "Status", "상태", "状態"), align: "text-center" },
                                        { label: "HW", align: "text-center" },
                                        { label: "SW", align: "text-center" },
                                        { label: "DFD", align: "text-center" },
                                        { label: "TA", align: "text-center" },
                                        { label: "", align: "text-right" },
                                      ].map((col, ci) => (
                                        <th key={ci} className={cn("text-[10px] font-bold text-text-tertiary uppercase tracking-wider px-4 py-2.5 border-b border-border/60", col.align)}>
                                          {col.label}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {filtered.length === 0 ? (
                                      <tr><td colSpan={8} className="py-6 text-center text-[12px] text-text-tertiary">{tx(locale, "No matching equipment", "일치하는 기자재가 없습니다", "該当なし")}</td></tr>
                                    ) : filtered.map((eq, ei) => {
                                      const cat = categorize(eq.status, eq);
                                      const meta = STATUS_META[cat];
                                      const hwCount = eq._count?.hardware || 0;
                                      const swCount = eq._count?.software || 0;
                                      const hasDfd = !!eq.dfdDiagram;
                                      const certCount = eq._count?.certDocuments || 0;
                                      const days = daysAgo(eq.updatedAt);
                                      const isStale = cat !== "approved" && days > 7;
                                      const isCritical = cat === "notStarted" && days > 14;
                                      const court = ballInCourt(cat, locale);
                                      return (
                                        <tr key={eq.id} className={cn(
                                          "transition-colors",
                                          ei > 0 && "border-t border-border/40",
                                          isCritical ? "bg-[#FFF1F1] hover:bg-[#FFE5E5]" :
                                          isStale ? "bg-[#FFF9E6] hover:bg-[#FFF3D0]" :
                                          "hover:bg-surface-page/50"
                                        )}>
                                          <td className="px-4 py-3">
                                            <Link href={`/project/${eq.project?.id}?reviewEqId=${eq.id}`} className="text-[13px] font-semibold text-text hover:text-brand transition-colors">
                                              {eq.name}
                                            </Link>
                                            {certCount > 0 && (
                                              <span className="inline-flex items-center gap-0.5 ml-2 text-[10px] text-brand font-medium">
                                                <FileText size={10} />{certCount}
                                              </span>
                                            )}
                                          </td>
                                          <td className="px-4 py-3">
                                            <span className="text-[12px] text-text-tertiary">{eq.vendor?.company || eq.vendor?.name || "—"}</span>
                                            {cat !== "approved" && days > 0 && (
                                              <span className={cn("block text-[10px] mt-0.5", isCritical ? "text-[#DA1E28] font-semibold" : isStale ? "text-[#EB6200]" : "text-text-tertiary")}>
                                                {daysAgoLabel(days, locale)}
                                              </span>
                                            )}
                                          </td>
                                          <td className="px-4 py-3 text-center">
                                            <span className={cn("inline-block text-[10px] font-bold px-2.5 py-1 rounded-full", meta.color, meta.bg)}>
                                              {statusLabel(cat, locale)}
                                            </span>
                                            <span className={cn("block text-[9px] mt-1", court.isShipyard ? "text-[#EB6200] font-semibold" : "text-text-tertiary")}>
                                              {court.label}
                                            </span>
                                          </td>
                                          <td className="px-4 py-3 text-center">
                                            <span className={cn("text-[12px] tabular-nums font-mono", hwCount > 0 ? "text-text font-semibold" : "text-text-tertiary")}>{hwCount}</span>
                                          </td>
                                          <td className="px-4 py-3 text-center">
                                            <span className={cn("text-[12px] tabular-nums font-mono", swCount > 0 ? "text-text font-semibold" : "text-text-tertiary")}>{swCount}</span>
                                          </td>
                                          <td className="px-4 py-3 text-center">
                                            <span className={cn("text-[11px] font-semibold", hasDfd ? "text-[#24A148]" : "text-text-tertiary/50")}>{hasDfd ? "✓" : "—"}</span>
                                          </td>
                                          <td className="px-4 py-3 text-center">
                                            <span className={cn("text-[11px] font-semibold", eq.isTypeApproved ? "text-[#24A148]" : "text-text-tertiary/50")}>{eq.isTypeApproved ? "✓" : "—"}</span>
                                          </td>
                                          <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                              {(cat === "notStarted" || cat === "inProgress") && (
                                                <button
                                                  disabled={remindedIds.has(eq.id)}
                                                  onClick={async () => {
                                                    const res = await fetch(`/api/projects/${eq.project?.id}/equipment/${eq.id}/remind`, { method: "POST" });
                                                    if (res.ok) {
                                                      setRemindedIds((prev) => new Set(prev).add(eq.id));
                                                      setTimeout(() => setRemindedIds((prev) => { const n = new Set(prev); n.delete(eq.id); return n; }), 3000);
                                                    }
                                                  }}
                                                  className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all",
                                                    remindedIds.has(eq.id) ? "border-[#24A148]/30 text-[#24A148] bg-[#E6F7EF]" : "border-border text-text-tertiary hover:text-brand hover:border-brand/30"
                                                  )}
                                                >
                                                  {remindedIds.has(eq.id) ? tx(locale, "✓ Sent", "✓ 전송됨", "✓ 送信済み") : <><MessageSquare size={11} /> {tx(locale, "Remind", "리마인드", "リマインド")}</>}
                                                </button>
                                              )}
                                              {cat === "submitted" ? (
                                                <Link href={`/project/${eq.project?.id}?reviewEqId=${eq.id}`}>
                                                  <Button size="sm">{tx(locale, "Review", "검토", "レビュー")} <ArrowRight size={12} /></Button>
                                                </Link>
                                              ) : (
                                                <Link href={`/project/${eq.project?.id}?reviewEqId=${eq.id}`}
                                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-border text-text-secondary hover:text-brand hover:border-brand/30 transition-all">
                                                  {tx(locale, "Open", "열기", "開く")}
                                                </Link>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </motion.div>
                          );
                          })()}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  );
                })}
                      </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
    </div>
  );
}
