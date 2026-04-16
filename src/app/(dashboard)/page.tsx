"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Package, Send, CheckCircle, ArrowRight, Clock, AlertCircle,
  Shield, FileText, Network, Cpu, Bell, Zap,
  Ship, Users, Inbox, TrendingUp, BarChart3, Activity,
  Building2, UserCog, FolderOpen, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody, CardFooter } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCards, SkeletonTable } from "@/components/ui/skeleton";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { ShipyardDashboard } from "@/components/dashboard/shipyard-dashboard";
import { VendorDashboard } from "@/components/dashboard/vendor-dashboard";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DashboardData {
  totalProjects: number;
  pendingReviews: number;
  pendingSignups?: number;
  complianceScore: number | null;
  recentChanges: number;
  recentProjects: {
    id: string;
    vesselName: string;
    systemName: string | null;
    status: string;
    complianceScore: number | null;
    updatedAt: string;
    hwCount: number;
    swCount: number;
  }[];
  equipment?: unknown[];
}

interface VendorEquipment {
  id: string;
  name: string;
  description: string | null;
  status: string;
  _count: { hardware: number; software: number };
  dfdDiagram: { id: string } | null;
  project?: { id: string; vesselName: string; shipyard?: { name: string } | null; classification?: string | null };
}

const STATUS_MAP: Record<string, { label: string; labelEn: string; labelJa: string; color: string; bg: string; icon: React.ElementType<Record<string, unknown>> }> = {
  PENDING:            { label: "대기",     labelEn: "Pending",    labelJa: "保留中",     color: "#8D8D8D", bg: "#F4F4F4",  icon: Clock },
  IN_PROGRESS:        { label: "진행 중",  labelEn: "In Progress", labelJa: "進行中",    color: "#0F62FE", bg: "#EDF5FF", icon: AlertCircle },
  SUBMITTED:          { label: "제출됨",   labelEn: "Submitted",  labelJa: "提出済み",   color: "#EB6200", bg: "#FFF3E0",  icon: Send },
  UNDER_REVIEW:       { label: "검토 중",  labelEn: "Under Review", labelJa: "審査中",   color: "#EB6200", bg: "#FFF3E0", icon: Clock },
  REVISION_REQUESTED: { label: "수정 요청", labelEn: "Revision",   labelJa: "修正依頼",  color: "#DA1E28", bg: "#FFF1F1",  icon: AlertCircle },
  APPROVED:           { label: "승인됨",   labelEn: "Approved",   labelJa: "承認済み",   color: "#24A148", bg: "#E6F7EF",  icon: CheckCircle },
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const userRole = (session?.user as { role?: string })?.role || "VENDOR";

  // 세션 로딩 중 — 깜빡임 방지
  if (status === "loading") {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <SkeletonCards count={3} />
        <SkeletonTable rows={4} />
      </div>
    );
  }

  if (userRole === "VENDOR") return <VendorDashboard />;
  if (userRole === "SHIPYARD") return <ShipyardView />;
  return <AdminDashboard />;
}

// ═════════════════════════════════════════════════════════════════════════════
// VENDOR VIEW
// ═════════════════════════════════════════════════════════════════════════════

function VendorView() {
  const { data: session } = useSession();
  const { locale } = useLocaleStore();
  const userName = session?.user?.name || "User";

  const [equipment, setEquipment] = useState<VendorEquipment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setEquipment(data.equipment || []);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const actionNeeded = equipment.filter((eq) =>
    ["PENDING", "IN_PROGRESS", "REVISION_REQUESTED"].includes(eq.status),
  );
  const completed = equipment.filter((eq) => eq.status === "APPROVED");
  const totalCount = equipment.length;
  const progressCount = actionNeeded.length;
  const approvedCount = completed.length;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-7">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-lighter to-brand-light p-7 relative overflow-hidden border border-brand/10">
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-brand/5 rounded-full" />
        <div className="absolute right-20 -bottom-8 w-28 h-28 bg-brand/5 rounded-full" />
        <div className="relative">
          <p className="text-body-xs text-brand/60 font-medium">
            {locale === "ko" ? `안녕하세요, ${userName}님` : locale === "ja" ? `こんにちは、${userName}さん` : `Hello, ${userName}`}
          </p>
          <h1 className="text-h4 font-extrabold mt-1">
            {tx(locale, "E27 Cybersecurity Certification", "E27 사이버 보안 인증", "E27サイバーセキュリティ認証")}
          </h1>
          <p className="text-body-sm text-text-secondary mt-2 max-w-md">
            {tx(locale, "Complete cybersecurity certification for your assigned equipment", "할당된 기자재의 보안 인증을 4단계로 진행하세요", "割り当てられた機器のセキュリティ認証を4段階で進めてください")}
          </p>
          <div className="flex gap-6 mt-5">
            <div><p className="text-[22px] font-extrabold text-brand-active">{totalCount}</p><p className="text-[10px] text-brand/50">{tx(locale, "Total", "전체 기자재", "全機器")}</p></div>
            <div><p className="text-[22px] font-extrabold text-brand-active">{progressCount}</p><p className="text-[10px] text-brand/50">{tx(locale, "In Progress", "진행 중", "進行中")}</p></div>
            <div><p className="text-[22px] font-extrabold text-brand-active">{approvedCount}</p><p className="text-[10px] text-brand/50">{tx(locale, "Approved", "승인 완료", "承認済み")}</p></div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <SkeletonCards count={2} />
        </div>
      ) : equipment.length === 0 ? (
        <EmptyState
          icon={Package}
          title={tx(locale, "No equipment assigned", "할당된 기자재가 없습니다", "割り当てられた機器がありません")}
          subtitle={tx(locale, "Equipment will appear here when assigned by a shipyard", "조선소에서 기자재를 할당하면 여기에 표시됩니다", "造船所から機器が割り当てられるとここに表示されます")}
        />
      ) : (
        <>
          {/* Action needed */}
          {actionNeeded.length > 0 && (
            <div>
              <h2 className="text-[15px] font-bold text-text mb-1 flex items-center gap-2">
                <Bell size={15} className="text-safety-elevated" />
                {tx(locale, "Action needed", "작업이 필요합니다", "対応が必要です")}
              </h2>
              <p className="text-body-xs text-text-tertiary mb-4">
                {tx(locale, "Click on equipment to start working", "기자재를 클릭해서 작업을 진행하세요", "機器をクリックして作業を進めてください")}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {actionNeeded.map((eq) => (
                  <EquipmentCard key={eq.id} eq={eq} locale={locale} />
                ))}
              </div>
            </div>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <div>
              <h2 className="text-[14px] font-bold text-text mb-3 flex items-center gap-2">
                <CheckCircle size={15} className="text-safety-low" />
                {tx(locale, "Completed", "완료된 기자재", "完了した機器")}
              </h2>
              <Card padding="none">
                <div className="divide-y divide-border">
                  {completed.map((eq) => (
                    <Link key={eq.id} href={`/project/${eq.project?.id}/equipment/${eq.id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-surface-secondary/30 transition-colors cursor-pointer">
                      <div className="flex items-center gap-3">
                        <CheckCircle size={16} className="text-safety-low" />
                        <div>
                          <p className="text-body-sm font-semibold text-text">{eq.name}</p>
                          <p className="text-body-xs text-text-tertiary">
                            {eq.project?.vesselName} · {eq.project?.shipyard?.name}
                          </p>
                        </div>
                      </div>
                      <span className="text-body-xs text-safety-low font-semibold">
                        {tx(locale, "Approved", "승인됨", "承認済み")}
                      </span>
                    </Link>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EquipmentCard({ eq, locale }: { eq: VendorEquipment; locale: string }) {
  const st = STATUS_MAP[eq.status] || STATUS_MAP.PENDING;
  const hwCount = eq._count?.hardware || 0;
  const swCount = eq._count?.software || 0;

  return (
    <Card hover padding="none">
      <CardBody>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: st.bg }}>
              <Cpu size={17} style={{ color: st.color }} />
            </div>
            <div>
              <p className="text-body-sm font-bold text-text">{eq.name}</p>
              <p className="text-body-xs text-text-tertiary">
                {eq.project?.vesselName || "—"} · {eq.project?.shipyard?.name || "—"}
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold" style={{ background: st.bg, color: st.color }}>
            {locale === "ko" ? st.label : locale === "ja" ? (st.labelJa || st.labelEn) : st.labelEn}
          </span>
        </div>

        {/* Guide text */}
        <div className="p-3 rounded-lg bg-surface-secondary mb-3">
          <p className="text-body-xs font-semibold text-text-secondary">
            {eq.status === "PENDING" && (tx(locale, "👉 Start by adding hardware and software", "👉 먼저 하드웨어와 소프트웨어 목록을 입력하세요", "👉 まずハードウェアとソフトウェアリストを入力してください"))}
            {eq.status === "IN_PROGRESS" && (tx(locale, "👉 Continue with security assessment", "👉 보안 평가를 진행하세요", "👉 セキュリティ評価を進めてください"))}
            {eq.status === "REVISION_REQUESTED" && (tx(locale, "👉 Review feedback and make corrections", "👉 검토 의견을 확인하고 수정하세요", "👉 フィードバックを確認し修正してください"))}
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex gap-3 text-body-xs text-text-tertiary">
            <span>HW <strong className="text-text">{hwCount}</strong></span>
            <span>SW <strong className="text-text">{swCount}</strong></span>
            <span>DFD {eq.dfdDiagram ? "✅" : "❌"}</span>
          </div>
          <Link
            href={`/project/${eq.project?.id || ""}/equipment/${eq.id}`}
            className={cn(
              "px-4 py-2 rounded-lg text-body-xs font-bold text-white transition-all duration-200 hover:shadow-md",
              eq.status === "REVISION_REQUESTED" ? "bg-safety-high hover:opacity-90" : "bg-brand hover:bg-brand-hover",
            )}
          >
            {eq.status === "PENDING" ? (tx(locale, "Start →", "시작하기 →", "開始 →")) :
             eq.status === "REVISION_REQUESTED" ? (tx(locale, "Fix →", "수정하기 →", "修正 →")) :
             (tx(locale, "Continue →", "이어서 작업 →", "続行 →"))}
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SHIPYARD VIEW (uses separate component)
// ═════════════════════════════════════════════════════════════════════════════

function ShipyardView() {
  return <ShipyardDashboard />;
}


// Old ShipyardView removed — see src/components/dashboard/shipyard-dashboard.tsx


// ═════════════════════════════════════════════════════════════════════════════
// ADMIN VIEW
// ═════════════════════════════════════════════════════════════════════════════

function AdminView() {
  const { locale } = useLocaleStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then(async (res) => { if (res.ok) setData(await res.json()); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-7">
      <div className="rounded-2xl bg-gradient-to-br from-brand-lighter to-brand-light p-7 relative overflow-hidden border border-brand/10">
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-brand/5 rounded-full" />
        <div className="relative">
          <h1 className="text-h4 font-extrabold text-brand-active">{tx(locale, "System Dashboard", "시스템 관리 현황", "システム管理ダッシュボード")}</h1>
          <p className="text-body-sm text-brand/60 mt-1">{tx(locale, "Manage the system and analyze equipment patterns", "전체 시스템을 관리하고 기자재 패턴을 분석하세요", "システム全体を管理し機器パターンを分析します")}</p>
          <div className="flex gap-6 mt-5">
            <div><p className="text-[22px] font-extrabold text-brand-active">{data?.totalProjects || 0}</p><p className="text-[10px] text-brand/50">{tx(locale, "Projects", "프로젝트", "プロジェクト")}</p></div>
            <div><p className="text-[22px] font-extrabold text-brand-active">{data?.pendingReviews || 0}</p><p className="text-[10px] text-brand/50">{tx(locale, "Pending", "미처리", "未処理")}</p></div>
            <div><p className="text-[22px] font-extrabold text-brand-active">{data?.recentChanges || 0}</p><p className="text-[10px] text-brand/50">{tx(locale, "Changes", "최근 변경", "最近の変更")}</p></div>
            <div><p className="text-[22px] font-extrabold text-brand-active">{data?.complianceScore || 0}%</p><p className="text-[10px] text-brand/50">{tx(locale, "Compliance", "준수율", "準拠率")}</p></div>
          </div>
        </div>
      </div>

      {loading ? (
        <SkeletonCards count={4} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={UserCog} label={tx(locale, "Signups", "가입 대기", "サインアップ待ち")} value={data?.pendingSignups || 0} iconBg="bg-orange-50" />
            <StatCard icon={Inbox} label={tx(locale, "Unreviewed", "미검토", "未審査")} value={data?.pendingReviews || 0} iconBg="bg-brand-lighter" />
            <StatCard icon={Activity} label={tx(locale, "Changes", "최근 변경", "最近の変更")} value={data?.recentChanges || 0} />
            <StatCard icon={TrendingUp} label={tx(locale, "Compliance", "준수율", "準拠率")} value={`${data?.complianceScore || 0}%`} iconBg="bg-green-50" />
          </div>

          <div>
            <h2 className="text-[14px] font-bold text-text mb-4">{tx(locale, "Recent Projects", "최근 프로젝트", "最近のプロジェクト")}</h2>
            <Card padding="none">
              <div className="divide-y divide-border">
                {(data?.recentProjects || []).map((p) => (
                  <Link key={p.id} href={`/project/${p.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-secondary/30 transition-colors">
                    <Ship size={18} className="text-brand shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm font-semibold text-text">{p.vesselName}</p>
                      <p className="text-body-xs text-text-tertiary">HW {p.hwCount} · SW {p.swCount}</p>
                    </div>
                    <ArrowRight size={14} className="text-text-tertiary" />
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
