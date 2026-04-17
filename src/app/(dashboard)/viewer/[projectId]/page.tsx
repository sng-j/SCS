"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Eye, Package, ChevronRight, Ship, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { SkeletonTable } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Equipment {
  id: string;
  name: string;
  status: string;
  vendor: { id: string; name: string; company: string | null } | null;
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

const STATUS_LABELS: Record<string, { label: { en: string; ko: string; ja: string }; color: string; bg: string; icon: React.ElementType }> = {
  APPROVED: { label: { en: "Approved", ko: "승인됨", ja: "承認済み" }, color: "#24A148", bg: "#E6F7EF", icon: CheckCircle },
  SUBMITTED: { label: { en: "Submitted", ko: "제출됨", ja: "提出済み" }, color: "#EB6200", bg: "#FFF3E0", icon: Clock },
  IN_PROGRESS: { label: { en: "In Progress", ko: "진행 중", ja: "進行中" }, color: "#0F62FE", bg: "#EDF5FF", icon: Clock },
  REVISION_REQUESTED: { label: { en: "Revision", ko: "수정 요청", ja: "修正依頼" }, color: "#DA1E28", bg: "#FFF1F1", icon: AlertCircle },
  PENDING: { label: { en: "Pending", ko: "대기", ja: "保留中" }, color: "#8D8D8D", bg: "#F4F4F4", icon: Clock },
};

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

  if (loading) {
    return <div className="max-w-[1200px] mx-auto px-6 py-8"><SkeletonTable rows={6} /></div>;
  }

  if (!project) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <EmptyState icon={Ship} title={tx(locale, "Project not found", "프로젝트를 찾을 수 없습니다", "プロジェクトが見つかりません")} />
      </div>
    );
  }

  // Group equipment by status
  const statusOrder = ["SUBMITTED", "REVISION_REQUESTED", "IN_PROGRESS", "PENDING", "APPROVED"];
  const sortedEq = [...equipments].sort((a, b) => {
    const ai = statusOrder.indexOf(a.status); const bi = statusOrder.indexOf(b.status);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

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
      <Link href="/viewer" className="inline-flex items-center gap-1 text-[12px] text-text-tertiary hover:text-brand transition-colors">
        <ArrowLeft size={14} /> {tx(locale, "Fleet Overview", "선대 현황", "船隊概要")}
      </Link>

      {/* Vessel header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1">
            <Eye size={10} /> {tx(locale, "Viewer Mode", "뷰어 모드", "閲覧モード")}
          </span>
          {project.classification && (
            <span className="px-1.5 py-0.5 rounded-md bg-surface-secondary text-[10px] font-bold text-text-secondary">
              {project.classification}
            </span>
          )}
        </div>
        <h1 className="text-[24px] font-extrabold text-text">{project.vesselName}</h1>
        <p className="text-[13px] text-text-tertiary mt-0.5">
          {[project.shipowner, project.systemName].filter(Boolean).join(" · ") || "—"}
        </p>
      </div>

      {/* Overall progress */}
      <Card>
        <CardBody>
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
                {tx(locale, "Equipment Approval Progress", "기자재 승인 진행률", "機器承認進捗")}
              </p>
              <p className="text-[13px] text-text-secondary mt-0.5">
                {tx(locale, `${approvedCount} of ${equipments.length} equipment approved`,
                  `전체 ${equipments.length}개 중 ${approvedCount}개 승인 완료`,
                  `${equipments.length}中 ${approvedCount} 承認済み`)}
              </p>
            </div>
            <span className="text-[32px] font-extrabold tabular-nums" style={{ color: progressPct >= 80 ? "#24A148" : progressPct >= 50 ? "#EB6200" : "#8D8D8D" }}>
              {progressPct}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-secondary overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${progressPct}%`, backgroundColor: progressPct >= 80 ? "#24A148" : progressPct >= 50 ? "#EB6200" : "#F1C21B" }}
            />
          </div>
        </CardBody>
      </Card>

      {/* Equipment list grouped by status */}
      {equipments.length === 0 ? (
        <Card><CardBody><EmptyState icon={Package} title={tx(locale, "No equipment registered", "등록된 기자재가 없습니다", "登録された機器がありません")} /></CardBody></Card>
      ) : (
        <div>
          <h2 className="text-[13px] font-bold text-text mb-2 px-1">
            {tx(locale, `Equipment (${equipments.length})`, `기자재 (${equipments.length}개)`, `機器 (${equipments.length})`)}
          </h2>
          <Card padding="none">
            <div className="divide-y divide-border">
              {sortedEq.map((eq) => {
                const st = STATUS_LABELS[eq.status] || STATUS_LABELS.PENDING;
                const StatusIcon = st.icon;
                return (
                  <Link
                    key={eq.id}
                    href={`/viewer/${projectId}/${eq.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-surface-secondary/30 transition-colors group"
                  >
                    <div
                      className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: st.bg }}
                    >
                      <StatusIcon size={18} style={{ color: st.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-[14px] font-bold text-text truncate">{eq.name}</p>
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0"
                          style={{ backgroundColor: st.bg, color: st.color }}
                        >
                          {st.label[locale as keyof typeof st.label] || st.label.en}
                        </span>
                      </div>
                      <p className="text-[11px] text-text-tertiary">
                        {eq.vendor?.company || eq.vendor?.name || tx(locale, "No vendor assigned", "벤더 미배정", "ベンダー未割当")}
                        {` · HW ${eq._count.hardware} · SW ${eq._count.software}`}
                        {eq.dfdDiagram ? ` · ${tx(locale, "DFD ✓", "DFD ✓", "DFD ✓")}` : ""}
                      </p>
                    </div>
                    <ChevronRight size={16} className={cn("text-text-tertiary group-hover:text-brand group-hover:translate-x-0.5 transition-all shrink-0")} />
                  </Link>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </motion.div>
  );
}
