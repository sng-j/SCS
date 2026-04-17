"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { Eye, Ship, ChevronRight, Package, Cpu, FileText, TrendingUp } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { SkeletonTable } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface VesselSummary {
  id: string;
  vesselName: string;
  classification: string | null;
  status: string;
  complianceScore: number;
  hardwareCount: number;
  softwareCount: number;
  equipmentCount: number;
  equipmentApproved: number;
  assessmentCompletion: number;
  documentCount: number;
  totalDocuments: number;
  projectGroup: { id: string; name: string; shipowner: string | null } | null;
}

interface FleetResponse {
  summary: { totalVessels: number; avgCompliance: number; needsAttention: number };
  projects: VesselSummary[];
}

function progressColor(pct: number) {
  if (pct >= 80) return "#24A148"; // green
  if (pct >= 50) return "#EB6200"; // orange
  if (pct >= 20) return "#F1C21B"; // yellow
  return "#DA1E28"; // red
}

function progressBg(pct: number) {
  if (pct >= 80) return "bg-green-50 text-green-700";
  if (pct >= 50) return "bg-orange-50 text-orange-700";
  if (pct >= 20) return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

export default function ViewerHomePage() {
  const { data: session, status } = useSession();
  const { locale } = useLocaleStore();
  const [data, setData] = useState<FleetResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/fleet")
      .then(async (r) => { if (r.ok) setData(await r.json()); })
      .finally(() => setLoading(false));
  }, []);

  if (status === "loading" || loading) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <SkeletonTable rows={6} />
      </div>
    );
  }

  const userRole = (session?.user as { role?: string })?.role;
  if (userRole !== "SHIPYARD" && userRole !== "SUPPORT" && userRole !== "ADMIN") {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <EmptyState icon={Eye} title={tx(locale, "Access denied", "접근 권한이 없습니다", "アクセスが拒否されました")} />
      </div>
    );
  }

  const summary = data?.summary;
  const projects = data?.projects || [];

  // Group by projectGroup (선주/그룹) for cleaner overview
  const groups = new Map<string, { name: string; shipowner: string | null; vessels: VesselSummary[] }>();
  const ungrouped: VesselSummary[] = [];
  projects.forEach((p) => {
    if (p.projectGroup) {
      const key = p.projectGroup.id;
      if (!groups.has(key)) groups.set(key, { name: p.projectGroup.name, shipowner: p.projectGroup.shipowner, vessels: [] });
      groups.get(key)!.vessels.push(p);
    } else {
      ungrouped.push(p);
    }
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-[1200px] mx-auto px-6 py-8 space-y-6"
    >
      {/* Header — viewer badge */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1">
              <Eye size={10} /> {tx(locale, "Viewer Mode", "뷰어 모드", "閲覧モード")}
            </span>
          </div>
          <h1 className="text-[22px] font-extrabold text-text">
            {tx(locale, "Fleet Overview", "선대 현황", "船隊概要")}
          </h1>
          <p className="text-[13px] text-text-tertiary mt-0.5">
            {tx(locale, "Cyber security compliance status across all vessels",
              "전체 선박 사이버 보안 컴플라이언스 현황",
              "全船舶サイバーセキュリティ状況")}
          </p>
        </div>
      </div>

      {/* Summary stat cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardBody>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">
                    {tx(locale, "Total Vessels", "총 선박", "船舶総数")}
                  </p>
                  <p className="text-[28px] font-extrabold text-text mt-1 tabular-nums">{summary.totalVessels}</p>
                </div>
                <Ship size={24} className="text-text-tertiary" />
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">
                    {tx(locale, "Avg Compliance", "평균 컴플라이언스", "平均準拠率")}
                  </p>
                  <p className="text-[28px] font-extrabold mt-1 tabular-nums" style={{ color: progressColor(summary.avgCompliance) }}>
                    {summary.avgCompliance}%
                  </p>
                </div>
                <TrendingUp size={24} className="text-text-tertiary" />
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">
                    {tx(locale, "Needs Attention", "점검 필요", "要注意")}
                  </p>
                  <p className={cn(
                    "text-[28px] font-extrabold mt-1 tabular-nums",
                    summary.needsAttention > 0 ? "text-safety-high" : "text-text"
                  )}>
                    {summary.needsAttention}
                  </p>
                </div>
                <Package size={24} className="text-text-tertiary" />
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Vessel list grouped by project group */}
      {projects.length === 0 ? (
        <Card><CardBody><EmptyState icon={Ship} title={tx(locale, "No vessels yet", "등록된 선박이 없습니다", "登録された船舶がありません")} /></CardBody></Card>
      ) : (
        <div className="space-y-5">
          {[...groups.entries()].map(([groupId, group]) => (
            <div key={groupId}>
              <div className="flex items-baseline justify-between mb-2 px-1">
                <h2 className="text-[13px] font-bold text-text">{group.name}</h2>
                {group.shipowner && <span className="text-[11px] text-text-tertiary">{group.shipowner}</span>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {group.vessels.map((v) => <VesselCard key={v.id} vessel={v} locale={locale} />)}
              </div>
            </div>
          ))}
          {ungrouped.length > 0 && (
            <div>
              {groups.size > 0 && (
                <div className="mb-2 px-1">
                  <h2 className="text-[13px] font-bold text-text">{tx(locale, "Other Vessels", "기타 선박", "その他船舶")}</h2>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {ungrouped.map((v) => <VesselCard key={v.id} vessel={v} locale={locale} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

function VesselCard({ vessel, locale }: { vessel: VesselSummary; locale: string }) {
  const approvalPct = vessel.equipmentCount > 0
    ? Math.round((vessel.equipmentApproved / vessel.equipmentCount) * 100)
    : 0;
  const docPct = vessel.totalDocuments > 0
    ? Math.round((vessel.documentCount / vessel.totalDocuments) * 100)
    : 0;

  return (
    <Link href={`/viewer/${vessel.id}`} className="group">
      <Card className="hover:border-brand/40 hover:shadow-sm transition-all">
        <CardBody>
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-[14px] font-bold text-text truncate">{vessel.vesselName}</p>
                {vessel.classification && (
                  <span className="px-1.5 py-0.5 rounded-md bg-surface-secondary text-[10px] font-bold text-text-secondary shrink-0">
                    {vessel.classification}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-text-tertiary">
                {tx(locale, `${vessel.equipmentCount} equipment · ${vessel.hardwareCount} HW · ${vessel.softwareCount} SW`,
                  `기자재 ${vessel.equipmentCount}개 · HW ${vessel.hardwareCount} · SW ${vessel.softwareCount}`,
                  `機器 ${vessel.equipmentCount} · HW ${vessel.hardwareCount} · SW ${vessel.softwareCount}`)}
              </p>
            </div>
            <ChevronRight size={16} className="text-text-tertiary group-hover:text-brand group-hover:translate-x-0.5 transition-all" />
          </div>

          {/* Compliance score — big */}
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
              {tx(locale, "Compliance", "컴플라이언스", "準拠率")}
            </span>
            <span className="text-[22px] font-extrabold tabular-nums" style={{ color: progressColor(vessel.complianceScore) }}>
              {vessel.complianceScore}%
            </span>
          </div>

          {/* Progress breakdown — 3 bars */}
          <div className="space-y-2">
            <ProgressRow
              label={tx(locale, "Equipment Approved", "기자재 승인", "機器承認")}
              pct={approvalPct}
              current={vessel.equipmentApproved}
              total={vessel.equipmentCount}
            />
            <ProgressRow
              label={tx(locale, "Assessments", "보안 평가", "評価")}
              pct={vessel.assessmentCompletion}
            />
            <ProgressRow
              label={tx(locale, "Documents", "문서", "文書")}
              pct={docPct}
              current={vessel.documentCount}
              total={vessel.totalDocuments}
            />
          </div>
        </CardBody>
      </Card>
    </Link>
  );
}

function ProgressRow({ label, pct, current, total }: { label: string; pct: number; current?: number; total?: number }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-text-secondary">{label}</span>
        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", progressBg(pct))}>
          {current !== undefined && total !== undefined ? `${current}/${total}` : `${pct}%`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-secondary overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: progressColor(pct) }}
        />
      </div>
    </div>
  );
}
