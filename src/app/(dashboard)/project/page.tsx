"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Ship, Package, Cpu, ArrowRight, Clock, AlertCircle,
  Send, CheckCircle, Search, Plus, FolderOpen, Anchor,
  ChevronRight, Shield, Trash2, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCards, SkeletonTable } from "@/components/ui/skeleton";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProjectData {
  id: string;
  vesselName: string;
  systemName: string | null;
  classification: string | null;
  shipowner: string | null;
  status: string;
  complianceScore: number | null;
  updatedAt: string;
  _count: { hardware: number; software: number; submissions: number; equipments: number };
  projectGroup?: { id: string; name: string; shipowner: string | null } | null;
}

interface Equipment {
  id: string;
  name: string;
  description: string | null;
  status: string;
  _count: { hardware: number; software: number };
  dfdDiagram: { id: string } | null;
  vendor?: { id: string; name: string; company: string | null };
}

const STATUS_MAP: Record<string, { label: string; labelEn: string; labelJa: string; color: string; bg: string; icon: React.ElementType<Record<string, unknown>> }> = {
  PENDING:            { label: "대기",     labelEn: "Pending",      labelJa: "保留中",    color: "#8D8D8D", bg: "#F4F4F4",  icon: Clock },
  IN_PROGRESS:        { label: "진행 중",  labelEn: "In Progress",  labelJa: "進行中",   color: "#0F62FE", bg: "#EDF5FF",  icon: AlertCircle },
  SUBMITTED:          { label: "제출됨",   labelEn: "Submitted",    labelJa: "提出済み",  color: "#EB6200", bg: "#FFF3E0",  icon: Send },
  UNDER_REVIEW:       { label: "검토 중",  labelEn: "Under Review", labelJa: "審査中",   color: "#EB6200", bg: "#FFF3E0",  icon: Clock },
  REVISION_REQUESTED: { label: "수정 요청", labelEn: "Revision",    labelJa: "修正依頼",  color: "#DA1E28", bg: "#FFF1F1",  icon: AlertCircle },
  APPROVED:           { label: "승인됨",   labelEn: "Approved",     labelJa: "承認済み",  color: "#24A148", bg: "#E6F7EF",  icon: CheckCircle },
  ACTIVE:             { label: "활성",     labelEn: "Active",       labelJa: "アクティブ", color: "#0F62FE", bg: "#EDF5FF",  icon: CheckCircle },
};

const CLASS_COLORS: Record<string, string> = {
  KR: "bg-blue-50 text-blue-700", LR: "bg-red-50 text-red-700", DNV: "bg-green-50 text-green-700",
  ABS: "bg-teal-50 text-teal-700", BV: "bg-orange-50 text-orange-700", CCS: "bg-yellow-50 text-yellow-700", NK: "bg-purple-50 text-purple-700",
};

// ─── Stagger variants ───────────────────────────────────────────────────────

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const } },
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ProjectListPage() {
  const { data: session, status: sessionStatus } = useSession();
  const userRole = (session?.user as { role?: string })?.role || "VENDOR";

  if (sessionStatus === "loading") {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <SkeletonCards count={4} />
      </div>
    );
  }

  if (userRole === "VENDOR") return <VendorProjectView />;
  return <AdminShipyardProjectView />;
}

// ═════════════════════════════════════════════════════════════════════════════
// VENDOR VIEW — Projects grouped with equipment
// ═════════════════════════════════════════════════════════════════════════════

interface VendorProject {
  id: string;
  vesselName: string;
  classification: string | null;
  shipowner: string | null;
  equipment: Equipment[];
}

function VendorProjectView() {
  const { locale } = useLocaleStore();
  const [projects, setProjects] = useState<VendorProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Get project list
        const dashRes = await fetch("/api/dashboard");
        if (!dashRes.ok) return;
        const dashData = await dashRes.json();

        // For each project, fetch equipment
        const projectsWithEq: VendorProject[] = [];
        for (const p of dashData.projects || []) {
          const eqRes = await fetch(`/api/projects/${p.id}/equipment`);
          const eq = eqRes.ok ? await eqRes.json() : [];
          projectsWithEq.push({
            id: p.id,
            vesselName: p.vesselName,
            classification: p.classification,
            shipowner: p.shipowner,
            equipment: eq,
          });
        }
        setProjects(projectsWithEq);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <h1 className="text-h4 font-extrabold text-text tracking-tight">
          {tx(locale, "My Projects", "내 프로젝트", "マイプロジェクト")}
        </h1>
        <p className="text-body-sm text-text-tertiary mt-1">
          {tx(locale, "View your assigned projects and equipment", "할당된 프로젝트와 기자재를 확인하세요", "割り当てられたプロジェクトと機器を確認してください")}
        </p>
      </motion.div>

      {loading ? (
        <div className="space-y-6">
          <SkeletonTable rows={3} />
          <SkeletonTable rows={2} />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={tx(locale, "No projects assigned", "할당된 프로젝트가 없습니다", "割り当てられたプロジェクトがありません")}
          subtitle={tx(locale, "Projects will appear here when a shipyard assigns equipment to you", "조선소에서 프로젝트에 기자재를 할당하면 여기에 표시됩니다", "造船所がプロジェクトに機器を割り当てるとここに表示されます")}
        />
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="space-y-6"
        >
          {projects.map((project) => (
            <motion.div key={project.id} variants={itemVariants}>
              <ProjectGroup project={project} locale={locale} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

function ProjectGroup({ project, locale }: { project: VendorProject; locale: string }) {
  const actionNeeded = project.equipment.filter((eq) =>
    ["PENDING", "IN_PROGRESS", "REVISION_REQUESTED"].includes(eq.status),
  );
  const others = project.equipment.filter((eq) =>
    !["PENDING", "IN_PROGRESS", "REVISION_REQUESTED"].includes(eq.status),
  );

  return (
    <Card padding="none">
      {/* Project header */}
      <div className="px-5 py-4 border-b border-border bg-gradient-to-r from-brand-lighter/40 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-brand-lighter flex items-center justify-center">
              <Ship size={17} className="text-brand" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-body-sm font-bold text-text">{project.vesselName}</h3>
                {project.classification && (
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-bold",
                    CLASS_COLORS[project.classification] || "bg-surface-secondary text-text-tertiary",
                  )}>
                    {project.classification}
                  </span>
                )}
              </div>
              <p className="text-body-xs text-text-tertiary mt-0.5">
                {project.shipowner || (tx(locale, "No shipowner", "선주 미지정", "船主未指定"))} · {tx(locale, "Equipment", "기자재", "機器")} {project.equipment.length}{tx(locale, "", "개", "件")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Equipment list */}
      <div className="divide-y divide-border">
        {project.equipment.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-body-xs text-text-tertiary">
              {tx(locale, "No equipment assigned", "할당된 기자재가 없습니다", "割り当てられた機器がありません")}
            </p>
          </div>
        ) : (
          <>
            {/* Action needed first */}
            {actionNeeded.map((eq) => (
              <EquipmentRow key={eq.id} eq={eq} projectId={project.id} locale={locale} showGuide />
            ))}
            {/* Then others */}
            {others.map((eq) => (
              <EquipmentRow key={eq.id} eq={eq} projectId={project.id} locale={locale} />
            ))}
          </>
        )}
      </div>
    </Card>
  );
}

function EquipmentRow({ eq, projectId, locale, showGuide }: {
  eq: Equipment; projectId: string; locale: string; showGuide?: boolean;
}) {
  const st = STATUS_MAP[eq.status] || STATUS_MAP.PENDING;
  const hwCount = eq._count?.hardware || 0;
  const swCount = eq._count?.software || 0;
  const hasDfd = !!eq.dfdDiagram;
  const isActionable = ["PENDING", "IN_PROGRESS", "REVISION_REQUESTED"].includes(eq.status);

  return (
    <Link
      href={`/project/${projectId}/equipment/${eq.id}`}
      className={cn(
        "flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 transition-all duration-200 group",
        isActionable ? "hover:bg-brand-lighter/30" : "hover:bg-surface-secondary/30",
      )}
    >
      {/* Left: icon + info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div
          className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: st.bg }}
        >
          <Cpu size={18} style={{ color: st.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-body-sm font-semibold text-text truncate">{eq.name}</p>
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0"
              style={{ background: st.bg, color: st.color }}
            >
              {locale === "ko" ? st.label : locale === "ja" ? st.labelJa : st.labelEn}
            </span>
          </div>

          {/* Guide text for actionable items */}
          {showGuide && (
            <p className="text-body-xs text-text-secondary mt-1">
              {eq.status === "PENDING" && (tx(locale, "👉 Start by registering hardware and software", "👉 하드웨어와 소프트웨어를 등록하세요", "👉 ハードウェアとソフトウェアを登録してください"))}
              {eq.status === "IN_PROGRESS" && (tx(locale, "👉 Continue with security assessment", "👉 보안 평가를 진행하세요", "👉 セキュリティ評価を進めてください"))}
              {eq.status === "REVISION_REQUESTED" && (tx(locale, "⚠️ Review shipyard feedback", "⚠️ 조선소 검토 의견을 확인하세요", "⚠️ 造船所の審査コメントを確認してください"))}
            </p>
          )}
        </div>
      </div>

      {/* Right: stats + arrow */}
      <div className="flex items-center gap-4 sm:gap-5 shrink-0 pl-13 sm:pl-0">
        <div className="flex gap-3 text-body-xs text-text-tertiary">
          <span>HW <strong className="text-text">{hwCount}</strong></span>
          <span>SW <strong className="text-text">{swCount}</strong></span>
          <span>DFD {hasDfd ? <CheckCircle size={11} className="inline text-safety-low -mt-0.5" /> : <span className="text-text-tertiary">—</span>}</span>
        </div>

        {isActionable ? (
          <span className={cn(
            "px-3 py-1.5 rounded-lg text-body-xs font-bold text-white transition-all duration-200 group-hover:shadow-md",
            eq.status === "REVISION_REQUESTED" ? "bg-safety-high" : "bg-brand",
          )}>
            {eq.status === "PENDING" ? (tx(locale, "Start", "시작", "開始")) :
             eq.status === "REVISION_REQUESTED" ? (tx(locale, "Fix", "수정", "修正")) :
             (tx(locale, "Go", "진입", "進む"))}
            <ArrowRight size={12} className="inline ml-1 -mt-0.5" />
          </span>
        ) : (
          <ChevronRight size={16} className="text-text-tertiary group-hover:text-brand transition-colors" />
        )}
      </div>
    </Link>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN / SHIPYARD VIEW — Project card grid
// ═════════════════════════════════════════════════════════════════════════════

function AdminShipyardProjectView() {
  const { locale } = useLocaleStore();
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [emptyGroups, setEmptyGroups] = useState<{ id: string; name: string; shipowner: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const initialOpenDone = useRef(false);
  const toggleGroup = (id: string) => setOpenGroups((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Auto-open all groups only on first load
  useEffect(() => {
    if (!initialOpenDone.current && projects.length > 0) {
      const allIds = new Set<string>();
      projects.forEach((p) => { if (p.projectGroup?.id) allIds.add(p.projectGroup.id); });
      emptyGroups.forEach((g) => allIds.add(g.id));
      if (allIds.size > 0) { queueMicrotask(() => setOpenGroups(allIds)); initialOpenDone.current = true; }
    }
  }, [projects, emptyGroups]);

  const fetchAll = () => {
    Promise.all([
      fetch("/api/dashboard").then(async (r) => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/project-groups").then(async (r) => r.ok ? r.json() : []).catch(() => []),
    ]).then(([dashData, groups]) => {
      const projs = dashData?.projects || [];
      setProjects(projs);
      // Find groups that have no projects (호선 없는 프로젝트)
      const projGroupIds = new Set(projs.map((p: ProjectData) => p.projectGroup?.id).filter(Boolean));
      const allGroups = (groups as { id: string; name: string; shipowner: string | null; _count: { projects: number } }[]);
      const empty = allGroups.filter((g) => !projGroupIds.has(g.id) && g._count.projects === 0);
      setEmptyGroups(empty);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  const filtered = projects.filter((p) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return p.vesselName.toLowerCase().includes(s) ||
      (p.shipowner || "").toLowerCase().includes(s) ||
      (p.projectGroup?.name || "").toLowerCase().includes(s);
  });

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="text-h4 font-extrabold text-text tracking-tight">
            {tx(locale, "Projects", "프로젝트", "プロジェクト")}
          </h1>
          <p className="text-body-sm text-text-tertiary mt-1">
            {locale === "ko" ? `총 ${projects.length}개 프로젝트` : locale === "ja" ? `全${projects.length}プロジェクト` : `${projects.length} projects total`}
          </p>
        </div>
        <Link href="/project/new">
          <Button size="sm">
            <Plus size={14} />
            {tx(locale, "New Project", "프로젝트 생성", "新規プロジェクト")}
          </Button>
        </Link>
      </motion.div>

      {/* Search */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="mb-6"
      >
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tx(locale, "Search projects, vessels, shipowner...", "프로젝트, 호선, 선주 검색...", "プロジェクト、船舶、船主を検索...")}
            className="h-10 w-full max-w-md rounded-lg border border-border bg-white pl-10 pr-4 text-body-sm text-text placeholder:text-text-tertiary/60 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand hover:border-border-strong"
          />
        </div>
      </motion.div>

      {loading ? (
        <SkeletonCards count={4} />
      ) : filtered.length === 0 && emptyGroups.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={search ? (tx(locale, "No results", "검색 결과가 없습니다", "検索結果がありません")) : (tx(locale, "No projects yet", "프로젝트가 없습니다", "プロジェクトがありません"))}
          subtitle={search ? undefined : (tx(locale, "Create a new project to get started", "새 프로젝트를 생성하세요", "新規プロジェクトを作成してください"))}
          action={!search ? (
            <Link href="/project/new">
              <Button size="sm"><Plus size={14} /> {tx(locale, "New Project", "프로젝트 생성", "新規プロジェクト")}</Button>
            </Link>
          ) : undefined}
        />
      ) : (() => {
        // Group projects by projectGroup
        const grouped: { group: { id: string; name: string; shipowner: string | null } | null; vessels: ProjectData[] }[] = [];
        const groupMap = new Map<string, ProjectData[]>();
        const ungrouped: ProjectData[] = [];

        filtered.forEach((p) => {
          if (p.projectGroup) {
            const key = p.projectGroup.id;
            if (!groupMap.has(key)) groupMap.set(key, []);
            groupMap.get(key)!.push(p);
          } else {
            ungrouped.push(p);
          }
        });

        // Build grouped list
        groupMap.forEach((vessels, groupId) => {
          const first = vessels[0];
          grouped.push({ group: first.projectGroup!, vessels });
        });
        // Add empty groups (호선 없는 프로젝트)
        emptyGroups.forEach((eg) => {
          if (!search || eg.name.toLowerCase().includes(search.toLowerCase()) || (eg.shipowner || "").toLowerCase().includes(search.toLowerCase())) {
            grouped.push({ group: eg, vessels: [] });
          }
        });
        if (ungrouped.length > 0) {
          grouped.push({ group: null, vessels: ungrouped });
        }

        return (
          <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-8">
            {grouped.map((g) => {
              const totalEq = g.vessels.reduce((s, v) => s + (v._count?.equipments || 0), 0);
              const totalHw = g.vessels.reduce((s, v) => s + (v._count?.hardware || 0), 0);
              const totalSw = g.vessels.reduce((s, v) => s + (v._count?.software || 0), 0);

              // removed: auto-open handled by useEffect below

              const gId = g.group?.id || "ungrouped";
              const isGroupOpen = openGroups.has(gId) || !g.group;

              return (
                <motion.div key={gId} variants={itemVariants}>
                  {/* ── Project Group Card (클릭 접기/펼치기) ── */}
                  {g.group && (<>
                    <div className="rounded-xl border border-border bg-white p-5 mb-4 shadow-xs">
                      <div className="flex items-center justify-between">
                        <button onClick={() => toggleGroup(gId)} className="flex items-center gap-3 flex-1 text-left min-w-0">
                          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-brand to-brand-active flex items-center justify-center shrink-0">
                            <FolderOpen size={20} className="text-white" />
                          </div>
                          <div className="min-w-0">
                            <h2 className="text-[16px] font-bold text-text">{g.group.name}</h2>
                            <p className="text-[12px] text-text-tertiary mt-0.5">
                              {g.group.shipowner || "—"} · {g.vessels.length}{tx(locale, " vessels", "척 호선", " 隻")}
                            </p>
                          </div>
                          <ChevronRight size={18} className={cn("text-text-tertiary transition-transform shrink-0 ml-2", isGroupOpen && "rotate-90")} />
                        </button>
                        <div className="flex items-center gap-1.5 shrink-0 ml-3">
                          <EditGroupButton groupId={g.group.id} currentName={g.group.name} currentShipowner={g.group.shipowner} locale={locale} onUpdated={fetchAll} />
                          <AddVesselButton groupId={g.group.id} groupName={g.group.name} shipowner={g.group.shipowner} locale={locale} onAdded={fetchAll} />
                          <DeleteGroupButton groupId={g.group.id} groupName={g.group.name} locale={locale} onDeleted={fetchAll} />
                        </div>
                      </div>
                      {/* Summary stats */}
                      <div className="flex items-center gap-5 mt-4 pt-3 border-t border-border">
                        <div className="flex items-center gap-1.5">
                          <Ship size={13} className="text-brand" />
                          <span className="text-[12px] text-text-tertiary">{tx(locale, "Vessels", "호선", "船舶")}</span>
                          <span className="text-[13px] font-bold text-text">{g.vessels.length}</span>
                        </div>
                        <div className="w-px h-4 bg-border" />
                        <div className="flex items-center gap-1.5">
                          <Package size={13} className="text-indigo-600" />
                          <span className="text-[12px] text-text-tertiary">{tx(locale, "Equipment", "기자재", "機材")}</span>
                          <span className="text-[13px] font-bold text-text">{totalEq}</span>
                        </div>
                        <div className="w-px h-4 bg-border" />
                        <div className="flex items-center gap-1.5">
                          <Cpu size={13} className="text-teal-600" />
                          <span className="text-[12px] text-text-tertiary">HW/SW</span>
                          <span className="text-[13px] font-bold text-text">{totalHw}/{totalSw}</span>
                        </div>
                      </div>
                    </div>
                  </>)}
                  {!g.group && grouped.length > 1 && (
                    <p className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider mb-3 px-1">
                      {tx(locale, "Standalone Vessels", "독립 호선", "独立船舶")}
                    </p>
                  )}
                  {/* ── Vessel cards (collapsible) ── */}
                  {isGroupOpen && (
                    <div className={cn(g.group && "ml-6 border-l-2 border-brand/10 pl-4")}>
                      {g.vessels.length === 0 ? (
                        <div className="py-8 text-center rounded-xl border-2 border-dashed border-border bg-surface-secondary/30">
                          <Ship size={24} className="mx-auto text-text-tertiary mb-2" />
                          <p className="text-[13px] font-semibold text-text-secondary mb-1">{tx(locale, "No vessels yet", "호선이 없습니다", "船舶がありません")}</p>
                          <p className="text-[11px] text-text-tertiary">{tx(locale, "Use the 'Add Vessel' button above to add a hull", "상단 '호선 추가' 버튼으로 호선을 추가하세요", "上部の「船舶追加」ボタンで船舶を追加")}</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {g.vessels.map((project) => (
                            <ProjectCard key={project.id} project={project} locale={locale} onDelete={fetchAll} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        );
      })()}
    </div>
  );
}

function ProjectCard({ project, locale, onDelete }: { project: ProjectData; locale: string; onDelete?: () => void }) {
  const eqCount = project._count?.equipments || 0;
  const hwCount = project._count?.hardware || 0;
  const swCount = project._count?.software || 0;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (res.ok) { setConfirmDelete(false); onDelete?.(); }
    } finally { setDeleting(false); }
  };

  return (
    <div className="relative group">
      {/* Delete button — top right corner */}
      {onDelete && (
        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDelete(true); }}
          className="absolute top-2 right-2 z-10 p-1.5 rounded-lg text-text-tertiary hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
          title={tx(locale, "Delete vessel", "호선 삭제", "船舶削除")}>
          <Trash2 size={13} />
        </button>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmDelete(false); }}>
          <div className="bg-white rounded-xl p-6 w-full max-w-[380px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-bold text-red-600 mb-2">{tx(locale, "Delete Vessel", "호선 삭제", "船舶削除")}</h3>
            <p className="text-[12px] text-text-secondary mb-4">
              {tx(locale,
                `Delete "${project.vesselName}" and all its equipment.`,
                `"${project.vesselName}" 호선과 소속 기자재를 모두 삭제합니다.`,
                `"${project.vesselName}" と配下の機材をすべて削除します。`)}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 rounded-lg text-[12px] font-medium text-text-tertiary hover:bg-surface-secondary">{tx(locale, "Cancel", "취소", "キャンセル")}</button>
              <button onClick={handleDelete} disabled={deleting}
                className="px-4 py-2 rounded-lg text-[12px] font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50">
                {deleting ? "..." : tx(locale, "Delete", "삭제", "削除")}
              </button>
            </div>
          </div>
        </div>
      )}

    <Link href={`/project/${project.id}`}>
      <Card hover padding="none">
        <CardBody className="pb-3">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-brand-lighter flex items-center justify-center shrink-0">
                <Ship size={16} className="text-brand" />
              </div>
              <div>
                <h3 className="text-[13px] font-bold text-text leading-tight">{project.vesselName}</h3>
                <p className="text-[10px] text-text-tertiary mt-0.5">{project.shipowner || "—"}</p>
              </div>
            </div>
            {project.classification && (
              <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 mr-6", CLASS_COLORS[project.classification] || "bg-surface-secondary text-text-tertiary")}>
                {project.classification}
              </span>
            )}
          </div>

          {/* Stat chips */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-lighter text-[10px] font-semibold text-brand">
              <Package size={10} /> {eqCount} {tx(locale, "eq", "기자재", "機材")}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-[10px] font-semibold text-blue-700">
              <Cpu size={10} /> {hwCount} HW
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-[10px] font-semibold text-indigo-700">
              <Shield size={10} /> {swCount} SW
            </span>
          </div>

          {/* Progress bar — asset registration progress */}
          {eqCount > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.min(100, hwCount > 0 ? 100 : 0)}%` }} />
              </div>
              <span className="text-[10px] text-text-tertiary tabular-nums">
                {hwCount > 0 ? (swCount > 0 ? "100%" : `HW ${hwCount}`) : tx(locale, "Not started", "미착수", "未着手")}
              </span>
            </div>
          )}
        </CardBody>
        <CardFooter>
          <span className="text-[10px] text-text-tertiary">
            {new Date(project.updatedAt).toLocaleDateString(locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US", { month: "short", day: "numeric" })}
          </span>
          <span className="text-[10px] font-semibold text-brand flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
            {tx(locale, "View", "보기", "表示")} <ArrowRight size={11} />
          </span>
        </CardFooter>
      </Card>
    </Link>
    </div>
  );
}

// ─── Add Vessel Button ──────────────────────────────────────────────────────

function AddVesselButton({ groupId, groupName, shipowner, locale, onAdded }: {
  groupId: string; groupName: string; shipowner: string | null; locale: string; onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [classification, setClassification] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vesselName: name.trim(), shipowner, classification: classification || null, projectGroupId: groupId }),
      });
      if (res.ok) {
        setOpen(false); setName(""); setClassification("");
        onAdded();
      }
    } finally { setSaving(false); }
  };

  return (
    <>
      <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); }}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-brand border border-brand/20 hover:bg-brand-lighter transition-colors">
        <Plus size={12} /> {tx(locale, "Add Vessel", "호선 추가", "船舶追加")}
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="bg-white rounded-xl p-6 w-full max-w-[400px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-bold text-text mb-1">{tx(locale, "Add Vessel", "호선 추가", "船舶追加")}</h3>
            <p className="text-[12px] text-text-tertiary mb-4">{groupName}</p>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-text-tertiary">{tx(locale, "Vessel Name *", "호선명 *", "船名 *")}</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tx(locale, "e.g. HO-2604", "예: HO-2604 호선", "例: HO-2604")}
                  className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-text-tertiary">{tx(locale, "Classification", "선급", "船級")}</label>
                <select value={classification} onChange={(e) => setClassification(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-[13px] appearance-none focus:outline-none focus:ring-2 focus:ring-brand/20">
                  <option value="">{tx(locale, "Select", "선택", "選択")}</option>
                  <option value="KR">KR</option><option value="LR">LR</option><option value="DNV">DNV</option>
                  <option value="ABS">ABS</option><option value="BV">BV</option><option value="CCS">CCS</option><option value="NK">NK</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg text-[12px] font-medium text-text-tertiary hover:bg-surface-secondary">{tx(locale, "Cancel", "취소", "キャンセル")}</button>
              <button onClick={handleCreate} disabled={saving || !name.trim()}
                className="px-4 py-2 rounded-lg text-[12px] font-semibold text-white bg-brand hover:bg-brand-hover disabled:opacity-50 transition-colors">
                {saving ? "..." : tx(locale, "Create", "생성", "作成")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Delete Group Button ────────────────────────────────────────────────────

function DeleteGroupButton({ groupId, groupName, locale, onDeleted }: {
  groupId: string; groupName: string; locale: string; onDeleted: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // Delete all projects in this group first, then the group
      const res = await fetch(`/api/project-groups/${groupId}`, { method: "DELETE" });
      if (res.ok) { setConfirm(false); onDeleted(); }
    } finally { setDeleting(false); }
  };

  return (
    <>
      <button onClick={(e) => { e.stopPropagation(); setConfirm(true); }}
        className="p-1.5 rounded-lg text-text-tertiary hover:text-red-600 hover:bg-red-50 transition-colors" title={tx(locale, "Delete", "삭제", "削除")}>
        <Trash2 size={14} />
      </button>
      {confirm && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirm(false); }}>
          <div className="bg-white rounded-xl p-6 w-full max-w-[380px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-bold text-red-600 mb-2">{tx(locale, "Delete Project", "프로젝트 삭제", "プロジェクト削除")}</h3>
            <p className="text-[12px] text-text-secondary mb-4">
              {tx(locale,
                `Delete "${groupName}" and all its vessels and equipment. This cannot be undone.`,
                `"${groupName}" 프로젝트와 소속 호선, 기자재를 모두 삭제합니다. 되돌릴 수 없습니다.`,
                `"${groupName}" プロジェクトと配下の船舶・機材をすべて削除します。元に戻せません。`)}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirm(false)} className="px-4 py-2 rounded-lg text-[12px] font-medium text-text-tertiary hover:bg-surface-secondary">{tx(locale, "Cancel", "취소", "キャンセル")}</button>
              <button onClick={handleDelete} disabled={deleting}
                className="px-4 py-2 rounded-lg text-[12px] font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors">
                {deleting ? "..." : tx(locale, "Delete", "삭제", "削除")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Edit Group Button ──────────────────────────────────────────────────────

function EditGroupButton({ groupId, currentName, currentShipowner, locale, onUpdated }: {
  groupId: string; currentName: string; currentShipowner: string | null; locale: string; onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [shipowner, setShipowner] = useState(currentShipowner || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/project-groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), shipowner: shipowner.trim() || null }),
      });
      if (res.ok) { setOpen(false); onUpdated(); }
    } finally { setSaving(false); }
  };

  return (
    <>
      <button onClick={(e) => { e.stopPropagation(); setName(currentName); setShipowner(currentShipowner || ""); setOpen(true); }}
        className="p-1.5 rounded-lg text-text-tertiary hover:text-brand hover:bg-brand-lighter transition-colors" title={tx(locale, "Edit", "수정", "編集")}>
        <Pencil size={13} />
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="bg-white rounded-xl p-6 w-full max-w-[400px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-bold text-text mb-4">{tx(locale, "Edit Project", "프로젝트 수정", "プロジェクト編集")}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-text-tertiary">{tx(locale, "Project Name *", "프로젝트명 *", "プロジェクト名 *")}</label>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-text-tertiary">{tx(locale, "Shipowner", "선주", "船主")}</label>
                <input value={shipowner} onChange={(e) => setShipowner(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg text-[12px] font-medium text-text-tertiary hover:bg-surface-secondary">{tx(locale, "Cancel", "취소", "キャンセル")}</button>
              <button onClick={handleSave} disabled={saving || !name.trim()}
                className="px-4 py-2 rounded-lg text-[12px] font-semibold text-white bg-brand hover:bg-brand-hover disabled:opacity-50 transition-colors">
                {saving ? "..." : tx(locale, "Save", "저장", "保存")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
