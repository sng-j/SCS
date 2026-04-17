"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { Eye, Ship, ChevronRight, Package, TrendingUp, AlertCircle } from "lucide-react";
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

// Uses the app's existing safety tokens for compliance signalling
function signalColor(pct: number) {
  if (pct >= 80) return "var(--color-safety-low)";     // green
  if (pct >= 50) return "var(--color-safety-elevated)"; // orange
  if (pct >= 20) return "var(--color-safety-moderate)"; // yellow
  return "var(--color-safety-high)";                     // red
}

function signalBg(pct: number) {
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

  const userRole = (session?.user as { role?: string })?.role;
  const denied = userRole && userRole !== "SHIPYARD" && userRole !== "SUPPORT" && userRole !== "ADMIN";

  const { groups, ungrouped } = useMemo(() => {
    const groups = new Map<string, { name: string; shipowner: string | null; vessels: VesselSummary[] }>();
    const ungrouped: VesselSummary[] = [];
    (data?.projects || []).forEach((p) => {
      if (p.projectGroup) {
        const key = p.projectGroup.id;
        if (!groups.has(key)) groups.set(key, { name: p.projectGroup.name, shipowner: p.projectGroup.shipowner, vessels: [] });
        groups.get(key)!.vessels.push(p);
      } else {
        ungrouped.push(p);
      }
    });
    return { groups, ungrouped };
  }, [data]);

  if (status === "loading" || loading) {
    return <div className="max-w-[1200px] mx-auto px-6 py-8"><SkeletonTable rows={6} /></div>;
  }

  if (denied) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <EmptyState icon={Eye} title={tx(locale, "Access denied", "접근 권한이 없습니다", "アクセスが拒否されました")} />
      </div>
    );
  }

  const summary = data?.summary;
  const projects = data?.projects || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-[1200px] mx-auto px-6 py-8 space-y-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-surface text-text-tertiary text-[10px] font-bold uppercase tracking-wider">
              <Eye size={10} /> {tx(locale, "Viewer Mode", "뷰어 모드", "閲覧モード")}
            </span>
          </div>
          <h1 className="text-h4 font-extrabold text-text">
            {tx(locale, "Fleet Overview", "선대 현황", "船隊概要")}
          </h1>
          <p className="text-body-sm text-text-tertiary mt-1">
            {tx(locale, "Cyber security compliance status across all vessels",
              "전체 선박 사이버 보안 컴플라이언스 현황",
              "全船舶サイバーセキュリティ状況")}
          </p>
        </div>
      </div>

      {/* Summary stat cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            icon={Ship}
            label={tx(locale, "Total Vessels", "총 선박", "船舶総数")}
            value={String(summary.totalVessels)}
          />
          <StatCard
            icon={TrendingUp}
            label={tx(locale, "Avg Compliance", "평균 컴플라이언스", "平均準拠率")}
            value={`${summary.avgCompliance}%`}
            valueColor={signalColor(summary.avgCompliance)}
          />
          <StatCard
            icon={AlertCircle}
            label={tx(locale, "Needs Attention", "점검 필요", "要注意")}
            value={String(summary.needsAttention)}
            valueColor={summary.needsAttention > 0 ? "var(--color-safety-high)" : undefined}
          />
        </div>
      )}

      {/* Vessel list grouped by project group */}
      {projects.length === 0 ? (
        <Card><CardBody><EmptyState icon={Ship} title={tx(locale, "No vessels yet", "등록된 선박이 없습니다", "登録された船舶がありません")} /></CardBody></Card>
      ) : (
        <div className="space-y-5">
          {[...groups.entries()].map(([groupId, group]) => (
            <section key={groupId}>
              <div className="flex items-baseline justify-between mb-2 px-1">
                <h2 className="text-body-sm font-bold text-text">{group.name}</h2>
                {group.shipowner && <span className="text-body-xs text-text-tertiary">{group.shipowner}</span>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {group.vessels.map((v) => <VesselCard key={v.id} vessel={v} locale={locale} />)}
              </div>
            </section>
          ))}
          {ungrouped.length > 0 && (
            <section>
              {groups.size > 0 && (
                <div className="mb-2 px-1">
                  <h2 className="text-body-sm font-bold text-text">
                    {tx(locale, "Other Vessels", "기타 선박", "その他船舶")}
                  </h2>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {ungrouped.map((v) => <VesselCard key={v.id} vessel={v} locale={locale} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </motion.div>
  );
}

function StatCard({ icon: Icon, label, value, valueColor }: {
  icon: React.ElementType; label: string; value: string; valueColor?: string;
}) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">{label}</p>
            <p className="text-[28px] font-extrabold mt-1 tabular-nums" style={valueColor ? { color: valueColor } : undefined}>
              {value}
            </p>
          </div>
          <Icon size={22} className="text-text-tertiary" />
        </div>
      </CardBody>
    </Card>
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
    <Link href={`/viewer/${vessel.id}`} className="group block">
      <Card className="hover:border-brand/40 hover:shadow-sm transition-all">
        <CardBody>
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-body-md font-bold text-text truncate group-hover:text-brand transition-colors">{vessel.vesselName}</p>
                {vessel.classification && (
                  <span className="px-1.5 py-0.5 rounded-md bg-surface-secondary text-[10px] font-bold text-text-secondary shrink-0">
                    {vessel.classification}
                  </span>
                )}
              </div>
              <p className="text-body-xs text-text-tertiary">
                {tx(locale,
                  `${vessel.equipmentCount} equipment · ${vessel.hardwareCount} HW · ${vessel.softwareCount} SW`,
                  `기자재 ${vessel.equipmentCount}개 · HW ${vessel.hardwareCount} · SW ${vessel.softwareCount}`,
                  `機器 ${vessel.equipmentCount} · HW ${vessel.hardwareCount} · SW ${vessel.softwareCount}`)}
              </p>
            </div>
            <ChevronRight size={16} className="text-text-tertiary group-hover:text-brand group-hover:translate-x-0.5 transition-all shrink-0" />
          </div>

          {/* Compliance score */}
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
              {tx(locale, "Compliance", "컴플라이언스", "準拠率")}
            </span>
            <span className="text-[22px] font-extrabold tabular-nums" style={{ color: signalColor(vessel.complianceScore) }}>
              {vessel.complianceScore}%
            </span>
          </div>

          {/* Progress breakdown */}
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
        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", signalBg(pct))}>
          {current !== undefined && total !== undefined ? `${current}/${total}` : `${pct}%`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-secondary overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: signalColor(pct) }}
        />
      </div>
    </div>
  );
}
