"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Ship, Package, FileText, AlertCircle, CheckCircle, Clock,
  TrendingUp, Anchor, Layers, ArrowRight,
} from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCards, SkeletonTable } from "@/components/ui/skeleton";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FleetSummary {
  totalVessels: number;
  avgCompliance: number;
  needsAttention: number;
}

interface VesselData {
  id: string;
  vesselName: string;
  classification: string | null;
  hwCount: number;
  swCount: number;
  assessmentPct: number;
  docCount: number;
  complianceScore: number | null;
  status: string;
  equipmentCount?: number;
  equipmentApproved?: number;
  projectGroup?: { id: string; name: string; shipowner: string | null } | null;
}

interface FleetData {
  summary: FleetSummary;
  projects: VesselData[];
}

// ─── Classification badge colors ─────────────────────────────────────────────

const CLASS_COLORS: Record<string, { bg: string; text: string }> = {
  KR:  { bg: "bg-blue-50",   text: "text-blue-700" },
  LR:  { bg: "bg-red-50",    text: "text-red-700" },
  DNV: { bg: "bg-green-50",  text: "text-green-700" },
  ABS: { bg: "bg-teal-50",   text: "text-teal-700" },
  BV:  { bg: "bg-orange-50", text: "text-orange-700" },
  CCS: { bg: "bg-yellow-50", text: "text-yellow-700" },
  NK:  { bg: "bg-purple-50", text: "text-purple-700" },
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function FleetPage() {
  const { data: session, status } = useSession();
  const { locale } = useLocaleStore();
  const [data, setData] = useState<FleetData | null>(null);
  const [loading, setLoading] = useState(true);

  const userRole = (session?.user as { role?: string })?.role;

  useEffect(() => {
    fetch("/api/fleet")
      .then(async (r) => { if (r.ok) setData(await r.json()); })
      .finally(() => setLoading(false));
  }, []);

  if (status === "loading" || loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <SkeletonCards count={3} />
        <SkeletonTable rows={5} />
      </div>
    );
  }

  if (userRole !== "SHIPYARD" && userRole !== "ADMIN") {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8">
        <EmptyState icon={Ship} title={tx(locale, "Access denied", "접근 권한이 없습니다", "アクセスが拒否されました")} />
      </div>
    );
  }

  const summary = data?.summary ?? { totalVessels: 0, avgCompliance: 0, needsAttention: 0 };
  const vessels = data?.projects ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="max-w-5xl mx-auto px-6 py-8 space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-h4 font-extrabold text-text">
          {tx(locale, "Vessel Status", "선박 현황", "船舶一覧")}
        </h1>
        <p className="text-body-sm text-text-tertiary mt-1">
          {tx(locale, "Overview of cybersecurity compliance across all vessels", "전체 선박의 사이버 보안 준수 현황을 확인합니다", "全船舶のサイバーセキュリティ準拠状況を確認します")}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          icon={Ship}
          label={tx(locale, "Total Vessels", "전체 선박", "全船舶")}
          value={summary.totalVessels}
          iconBg="bg-brand-lighter"
          iconColor="text-brand"
        />
        <SummaryCard
          icon={TrendingUp}
          label={tx(locale, "Avg Compliance", "평균 준수율", "平均準拠率")}
          value={`${summary.avgCompliance}%`}
          iconBg="bg-green-50"
          iconColor="text-safety-low"
          sub={tx(locale, "Fleet average", "전체 선박 평균", "船隊平均")}
        />
        <SummaryCard
          icon={AlertCircle}
          label={tx(locale, "Needs Attention", "주의 필요", "注意が必要")}
          value={summary.needsAttention}
          iconBg="bg-orange-50"
          iconColor="text-safety-elevated"
          sub={tx(locale, "Revision requested or incomplete", "수정 요청 또는 미완료", "修正依頼または未完了")}
          highlight={summary.needsAttention > 0}
        />
      </div>

      {/* Vessel List */}
      <div>
        <h2 className="text-body-sm font-bold text-text mb-4">
          {locale === "ko" ? `선박 목록 (${vessels.length})` : locale === "ja" ? `船舶一覧 (${vessels.length})` : `Vessels (${vessels.length})`}
        </h2>

        {vessels.length === 0 ? (
          <EmptyState
            icon={Anchor}
            title={tx(locale, "No vessels registered", "등록된 선박이 없습니다", "登録された船舶がありません")}
            subtitle={tx(locale, "Vessel information will appear after creating projects", "프로젝트를 생성하면 선박 정보가 표시됩니다", "プロジェクトを作成すると船舶情報が表示されます")}
          />
        ) : (
          <div className="space-y-3">
            {vessels.map((vessel, i) => (
              <VesselCard key={vessel.id} vessel={vessel} locale={locale} index={i} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  iconBg,
  iconColor,
  sub,
  highlight,
}: {
  icon: React.ElementType<{ size?: number; className?: string }>;
  label: string;
  value: string | number;
  iconBg: string;
  iconColor: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <Card padding="md" className={cn(highlight && "border-safety-elevated/40")}>
      <div className="flex items-center gap-3">
        <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", iconBg)}>
          <Icon size={20} className={iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-body-xs text-text-tertiary">{label}</p>
          <p className={cn("text-[22px] font-extrabold leading-tight", highlight ? "text-safety-elevated" : "text-text")}>
            {value}
          </p>
          {sub && <p className="text-[11px] text-text-tertiary mt-0.5">{sub}</p>}
        </div>
      </div>
    </Card>
  );
}

// ─── Vessel Card ──────────────────────────────────────────────────────────────

function VesselCard({ vessel, locale, index }: { vessel: VesselData; locale: string; index: number }) {
  const cls = CLASS_COLORS[vessel.classification || ""] || { bg: "bg-surface-secondary", text: "text-text-tertiary" };
  const eqCount = vessel.equipmentCount || 0;
  const eqApproved = vessel.equipmentApproved || 0;
  const eqPct = eqCount > 0 ? Math.round((eqApproved / eqCount) * 100) : 0;
  const allDone = eqCount > 0 && eqApproved === eqCount;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link href={`/project/${vessel.id}`}>
      <Card padding="none" hover>
        <CardBody>
          <div className="flex items-center gap-4">
            {/* Icon + Name */}
            <div className="flex items-center gap-3 flex-1 min-w-[180px]">
              <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", allDone ? "bg-green-50" : "bg-brand-lighter")}>
                <Ship size={18} className={allDone ? "text-green-600" : "text-brand"} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-body-sm font-bold text-text">{vessel.vesselName}</p>
                  {vessel.classification && (
                    <span className={cn("px-1.5 py-0.5 rounded-full text-[9px] font-bold", cls.bg, cls.text)}>{vessel.classification}</span>
                  )}
                </div>
                <p className="text-[10px] text-text-tertiary mt-0.5">
                  {vessel.projectGroup?.shipowner || "—"}
                  {vessel.projectGroup?.name ? ` · ${vessel.projectGroup.name}` : ""}
                </p>
              </div>
            </div>

            {/* Equipment stats */}
            <div className="flex items-center gap-4 text-[11px] text-text-tertiary shrink-0">
              <span>{tx(locale, "Equipment", "기자재", "機材")} <strong className="text-text">{eqCount}</strong></span>
              <span>HW <strong className="text-text">{vessel.hwCount}</strong></span>
              <span>SW <strong className="text-text">{vessel.swCount}</strong></span>
            </div>

            {/* Approval progress */}
            <div className="flex items-center gap-3 min-w-[180px] shrink-0">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-text-tertiary">{tx(locale, "Approval", "승인 현황", "承認")}</span>
                  <span className={cn("text-[11px] font-bold", allDone ? "text-green-600" : eqPct > 0 ? "text-blue-600" : "text-text-tertiary")}>
                    {eqApproved}/{eqCount}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", allDone ? "bg-green-500" : "bg-blue-500")} style={{ width: `${eqPct}%` }} />
                </div>
              </div>
            </div>

            {/* Status badge */}
            <div className="shrink-0">
              {allDone ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 text-green-700">
                  <CheckCircle size={12} />
                  <span className="text-[11px] font-semibold">{tx(locale, "Complete", "완료", "完了")}</span>
                </div>
              ) : eqPct > 0 ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                  <Clock size={12} />
                  <span className="text-[11px] font-semibold">{eqPct}%</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-text-tertiary">
                  <AlertCircle size={12} />
                  <span className="text-[11px] font-semibold">{tx(locale, "Not started", "미착수", "未着手")}</span>
                </div>
              )}
            </div>
          </div>
        </CardBody>
      </Card>
      </Link>
    </motion.div>
  );
}
