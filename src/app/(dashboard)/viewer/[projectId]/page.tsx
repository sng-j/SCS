"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft, Eye, Package, ChevronRight, Ship,
  CheckCircle, Clock, AlertCircle, XCircle,
} from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { SkeletonTable } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";

interface Equipment {
  id: string;
  name: string;
  status: string;
  // /api/projects/[id]/equipment returns the M2M relation as `vendors` (array).
  // The legacy singular `vendor` field is unused here — relying on it always
  // produced "벤더 미배정" even when vendors were assigned.
  vendors: { id: string; name: string; company: string | null }[];
  _count: { hardware: number; software: number };
  dfdDiagram: { id: string } | null;
}

interface Project {
  id: string;
  vesselName: string;
  classification: string | null;
  shipowner: string | null;
  systemName: string | null;
  complianceScore: number | null;
}

const STATUS_META: Record<string, {
  label: { en: string; ko: string; ja: string };
  color: string; bg: string; icon: React.ElementType;
}> = {
  APPROVED:           { label: { en: "Approved",    ko: "승인됨",    ja: "承認済み" }, color: "#24A148", bg: "#E6F7EF", icon: CheckCircle },
  SUBMITTED:          { label: { en: "Submitted",   ko: "제출됨",    ja: "提出済み" }, color: "#EB6200", bg: "#FFF3E0", icon: Clock },
  IN_PROGRESS:        { label: { en: "In Progress", ko: "진행 중",   ja: "進行中"   }, color: "#0F62FE", bg: "#EDF5FF", icon: Clock },
  REVISION_REQUESTED: { label: { en: "Revision",    ko: "수정 요청", ja: "修正依頼" }, color: "#DA1E28", bg: "#FFF1F1", icon: XCircle },
  PENDING:            { label: { en: "Pending",     ko: "대기",      ja: "保留中"   }, color: "#8D8D8D", bg: "#F4F4F4", icon: AlertCircle },
};

function signalColor(pct: number) {
  if (pct >= 80) return "var(--color-safety-low)";
  if (pct >= 50) return "var(--color-safety-elevated)";
  if (pct >= 20) return "var(--color-safety-moderate)";
  return "var(--color-safety-high)";
}

export default function ViewerProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { locale } = useLocaleStore();
  const [project, setProject] = useState<Project | null>(null);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}`).then(async (r) => r.ok ? r.json() : null),
      fetch(`/api/projects/${projectId}/equipment`).then(async (r) => r.ok ? r.json() : []),
    ]).then(([p, eqs]) => {
      setProject(p);
      setEquipments(Array.isArray(eqs) ? eqs : []);
    }).finally(() => setLoading(false));
  }, [projectId]);

  // Surface items requiring attention at the top
  const sortedEq = useMemo(() => {
    const order = ["REVISION_REQUESTED", "SUBMITTED", "IN_PROGRESS", "PENDING", "APPROVED"];
    return [...equipments].sort((a, b) => {
      const ai = order.indexOf(a.status); const bi = order.indexOf(b.status);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [equipments]);

  if (loading) {
    return <div className="max-w-[1200px] mx-auto px-6 py-8"><SkeletonTable rows={5} /></div>;
  }

  if (!project) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8">
        <EmptyState icon={Ship} title={tx(locale, "Project not found", "프로젝트를 찾을 수 없습니다", "プロジェクトが見つかりません")} />
      </div>
    );
  }

  const approvedCount = equipments.filter((e) => e.status === "APPROVED").length;
  const progressPct = equipments.length > 0 ? Math.round((approvedCount / equipments.length) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-[1200px] mx-auto px-6 py-8 space-y-5"
    >
      {/* Back link */}
      <Link
        href="/viewer"
        className="group inline-flex items-center gap-1 text-body-xs text-text-tertiary hover:text-brand transition-colors"
      >
        <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
        {tx(locale, "Fleet Overview", "선대 현황", "船隊概要")}
      </Link>

      {/* Vessel header — bridge console aesthetic, matches equipment page */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
        className="relative"
      >
        {/* Status color strip — vessel-level signal mirrors approval health */}
        <div
          aria-hidden
          className="absolute left-[-12px] top-1 bottom-1 w-[2px] rounded-full"
          style={{ backgroundColor: signalColor(progressPct) }}
        />
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-surface text-text-tertiary text-[10px] font-bold uppercase tracking-[0.1em]">
            <Eye size={10} /> {tx(locale, "Viewer", "뷰어", "閲覧")}
          </span>
          {project.classification && (
            <span className="px-1.5 py-0.5 rounded-md bg-surface-secondary text-[10px] font-bold text-text-secondary uppercase tracking-[0.06em]">
              {project.classification}
            </span>
          )}
          {/* live-pulse dot */}
          <span className="ml-0.5 inline-flex items-center gap-1 text-[9px] font-mono text-text-tertiary uppercase tracking-[0.1em]">
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inset-0 rounded-full bg-safety-low opacity-60 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-safety-low" />
            </span>
            Live
          </span>
        </div>
        <h1 className="text-h4 font-extrabold text-text leading-tight">{project.vesselName}</h1>
        <div className="flex items-center gap-3 mt-1 text-[11px] font-mono text-text-tertiary">
          <span className="tracking-tight">
            {[project.shipowner, project.systemName].filter(Boolean).join(" · ") || "—"}
          </span>
        </div>
      </motion.div>

      {/* Overall progress — readout panel */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <Card padding="none">
          <div className="p-4">
            <div className="flex items-baseline justify-between mb-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-tertiary">
                  {tx(locale, "Equipment Approval Progress", "기자재 승인 진행률", "機器承認進捗")}
                </p>
                <p className="text-body-xs text-text-secondary mt-1 font-mono">
                  {tx(locale,
                    `${approvedCount} of ${equipments.length} approved`,
                    `${equipments.length}개 중 ${approvedCount}개 승인 완료`,
                    `${equipments.length}中 ${approvedCount} 承認済み`)}
                </p>
              </div>
              <span className="text-[28px] font-extrabold tabular-nums" style={{ color: signalColor(progressPct) }}>
                {progressPct}<span className="text-[14px] font-medium text-text-tertiary">%</span>
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: `${signalColor(progressPct)}25` }}>
              <div className="h-full transition-[width] duration-700" style={{ width: `${progressPct}%`, backgroundColor: signalColor(progressPct) }} />
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Equipment list — numbered console rows */}
      {equipments.length === 0 ? (
        <Card><CardBody><EmptyState icon={Package} title={tx(locale, "No equipment registered", "등록된 기자재가 없습니다", "登録された機器がありません")} /></CardBody></Card>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <h2 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-text-tertiary mb-2 px-1">
            <Package size={11} strokeWidth={2.25} />
            <span>{tx(locale, "Equipment", "기자재", "機器")}</span>
            <span className="font-mono tabular-nums">[{String(equipments.length).padStart(2, "0")}]</span>
          </h2>
          <Card padding="none">
            <div className="divide-y divide-border">
              {sortedEq.map((eq, idx) => {
                const st = STATUS_META[eq.status] || STATUS_META.PENDING;
                const Icon = st.icon;
                return (
                  <Link
                    key={eq.id}
                    href={`/viewer/${projectId}/${eq.id}`}
                    className="relative flex items-center gap-4 px-5 py-3.5 hover:bg-surface-secondary/30 transition-colors group"
                  >
                    {/* Left status stripe */}
                    <span aria-hidden className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r" style={{ backgroundColor: st.color }} />
                    {/* Mono index */}
                    <span className="font-mono text-[10px] font-bold tabular-nums tracking-[0.05em] text-text-tertiary w-6 shrink-0">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: st.bg }}
                    >
                      <Icon size={16} style={{ color: st.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="text-body-sm font-bold text-text truncate group-hover:text-brand transition-colors">{eq.name}</p>
                        <span
                          className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.06em] shrink-0"
                          style={{ backgroundColor: st.bg, color: st.color }}
                        >
                          {st.label[locale as "en" | "ko" | "ja"] || st.label.en}
                        </span>
                      </div>
                      <p className="text-body-xs text-text-tertiary font-mono tracking-tight">
                        {eq.vendors.length > 0
                          ? eq.vendors.map((v) => v.company || v.name).join(", ")
                          : tx(locale, "No vendor assigned", "벤더 미배정", "ベンダー未割当")}
                        <span className="opacity-50 mx-1.5">·</span>HW {eq._count.hardware}
                        <span className="opacity-50 mx-1.5">·</span>SW {eq._count.software}
                        {eq.dfdDiagram && <><span className="opacity-50 mx-1.5">·</span><span className="text-safety-low">DFD ✓</span></>}
                      </p>
                    </div>
                    <ChevronRight size={16} className="text-text-tertiary group-hover:text-brand group-hover:translate-x-0.5 transition-all shrink-0" />
                  </Link>
                );
              })}
            </div>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
