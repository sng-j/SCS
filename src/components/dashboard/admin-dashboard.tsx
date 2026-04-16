"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Building2, Users, Ship, FolderOpen, CheckCircle, Clock,
  AlertTriangle, UserPlus, Check, X, ArrowRight,
  Activity, Send, Shield, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { SkeletonCards } from "@/components/ui/skeleton";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ShipyardProject { id: string; vesselName: string; classification: string | null; status: string; updatedAt: string; eqTotal: number; eqApproved: number }
interface ShipyardData { id: string; name: string; projectCount: number; userCount: number; projects: ShipyardProject[] }
interface SignupRequest { id: number; email: string; name: string; company: string | null; createdAt: string }
interface VendorData { id: string; name: string; company: string | null; email: string; eqCount: number; lastActive: string }
interface StuckEquipment { id: string; name: string; status: string; updatedAt: string; project: { id: string; vesselName: string } | null; vendor: { name: string; company: string | null } | null }
interface ActivityItem { id: string; type: string; action: string; vessel: string | null; createdAt: string }

interface AdminDashboardData {
  totalProjects: number;
  pendingReviews: number;
  pendingSignups: number;
  recentChanges: number;
  shipyards?: ShipyardData[];
  signupRequests?: SignupRequest[];
  vendors?: VendorData[];
  stuckEquipment?: StuckEquipment[];
  recentActivity?: ActivityItem[];
  projects?: { id: string; vesselName: string; classification: string | null; _count: { equipments: number }; updatedAt: string }[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function timeAgoLabel(dateStr: string, locale: string): string {
  const d = daysAgo(dateStr);
  if (d === 0) return tx(locale, "today", "오늘", "今日");
  if (d === 1) return tx(locale, "1d ago", "1일 전", "1日前");
  return `${d}${tx(locale, "d ago", "일 전", "日前")}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AdminDashboard() {
  const { locale } = useLocaleStore();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingSignup, setProcessingSignup] = useState<Set<number>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "project" | "equipment"; id: string; projectId?: string; name: string } | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then(async (r) => r.ok ? setData(await r.json()) : null)
      .finally(() => setLoading(false));
  }, []);

  const shipyards = data?.shipyards || [];
  const signups = data?.signupRequests || [];
  const vendors = data?.vendors || [];
  const stuck = data?.stuckEquipment || [];
  const activity = data?.recentActivity || [];

  // Inactive vendors (never submitted, assigned > 0)
  const inactiveVendors = useMemo(() =>
    vendors.filter((v) => v.eqCount > 0 && daysAgo(v.lastActive) > 14),
  [vendors]);

  const handleSignup = async (id: number, action: "approve" | "reject") => {
    setProcessingSignup((p) => new Set(p).add(id));
    await fetch("/api/admin/signups", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    // Remove from list
    setData((prev) => prev ? { ...prev, signupRequests: (prev.signupRequests || []).filter((s) => s.id !== id), pendingSignups: Math.max(0, (prev.pendingSignups || 1) - 1) } : prev);
    setProcessingSignup((p) => { const n = new Set(p); n.delete(id); return n; });
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const { type, id, projectId } = deleteConfirm;
    if (type === "project") {
      await fetch(`/api/projects/${id}`, { method: "DELETE" });
      // Remove from local state
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          totalProjects: Math.max(0, (prev.totalProjects || 1) - 1),
          shipyards: (prev.shipyards || []).map((s) => ({ ...s, projects: s.projects.filter((p) => p.id !== id) })),
        };
      });
    } else if (type === "equipment" && projectId) {
      await fetch(`/api/projects/${projectId}/equipment?id=${id}`, { method: "DELETE" });
    }
    setDeleteConfirm(null);
  };

  if (loading) {
    return <div className="w-full max-w-[1400px] mx-auto px-6 py-6"><SkeletonCards count={4} /></div>;
  }

  const totalVendors = vendors.length;
  const totalShipyards = shipyards.length;

  return (
    <div className="w-full max-w-[1400px] mx-auto px-6 py-6">
      <div className="flex gap-6">

        {/* ════ Left main column (~70%) ════ */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Title */}
          <div>
            <h1 className="text-[18px] font-bold text-text">
              {tx(locale, "Admin Dashboard", "관리자 대시보드", "管理者ダッシュボード")}
            </h1>
            <p className="text-[12px] text-text-tertiary mt-0.5">
              {tx(locale, "Monitor the platform and manage shipyards, vendors, and projects.", "플랫폼을 모니터링하고 조선소, 벤더, 프로젝트를 관리합니다.", "プラットフォームを監視し、造船所、ベンダー、プロジェクトを管理します。")}
            </p>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { icon: Building2, value: totalShipyards, label: tx(locale, "Shipyards", "조선소", "造船所"), color: "text-brand" },
              { icon: Users, value: totalVendors, label: tx(locale, "Vendors", "벤더", "ベンダー"), color: "text-[#6366F1]" },
              { icon: FolderOpen, value: data?.totalProjects || 0, label: tx(locale, "Projects", "프로젝트", "プロジェクト"), color: "text-[#0D9488]" },
              { icon: UserPlus, value: data?.pendingSignups || 0, label: tx(locale, "Pending Signups", "가입 대기", "承認待ち"), color: (data?.pendingSignups || 0) > 0 ? "text-[#DA1E28]" : "text-text-tertiary" },
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

          {/* ── Pending signups (inline approve/reject) ─────────────── */}
          {signups.length > 0 && (
            <div className="bg-white rounded-xl border border-border overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <span className="h-2 w-2 rounded-full bg-[#DA1E28] animate-pulse" />
                <span className="text-[13px] font-bold text-text">
                  {tx(locale, "Pending Signups", "가입 승인 대기", "承認待ち")}
                </span>
                <span className="text-[10px] font-bold text-[#DA1E28] bg-[#FFF1F1] px-1.5 py-0.5 rounded-full">{signups.length}</span>
              </div>
              <div className="divide-y divide-border/50">
                {signups.map((s) => (
                  <div key={s.id} className="flex items-center gap-4 px-4 py-3">
                    <div className="h-9 w-9 rounded-full bg-surface-secondary flex items-center justify-center text-[12px] font-bold text-text-tertiary shrink-0">
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-text">{s.name}</p>
                      <p className="text-[11px] text-text-tertiary">{s.email} {s.company && `· ${s.company}`}</p>
                    </div>
                    <span className="text-[10px] text-text-tertiary shrink-0">{timeAgoLabel(s.createdAt, locale)}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        disabled={processingSignup.has(s.id)}
                        onClick={() => handleSignup(s.id, "approve")}
                        className="h-7 px-3 rounded-lg text-[11px] font-semibold bg-[#24A148] text-white hover:bg-[#1e8a3c] transition-colors flex items-center gap-1 disabled:opacity-50"
                      >
                        <Check size={12} /> {tx(locale, "Approve", "승인", "承認")}
                      </button>
                      <button
                        disabled={processingSignup.has(s.id)}
                        onClick={() => handleSignup(s.id, "reject")}
                        className="h-7 px-3 rounded-lg text-[11px] font-semibold border border-border text-text-tertiary hover:text-[#DA1E28] hover:border-[#DA1E28]/30 transition-colors flex items-center gap-1 disabled:opacity-50"
                      >
                        <X size={12} /> {tx(locale, "Reject", "거절", "拒否")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Attention needed (stuck reviews + inactive vendors) ───── */}
          {(stuck.length > 0 || inactiveVendors.length > 0) && (
            <div className="bg-white rounded-xl border border-border overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <AlertTriangle size={14} className="text-[#EB6200]" />
                <span className="text-[13px] font-bold text-text">
                  {tx(locale, "Attention Needed", "주의 필요", "対応が必要")}
                </span>
                <span className="text-[10px] font-bold text-[#EB6200] bg-[#FFF3E0] px-1.5 py-0.5 rounded-full">{stuck.length + inactiveVendors.length}</span>
              </div>
              <div className="divide-y divide-border/50">
                {stuck.map((eq) => (
                  <Link key={eq.id} href={`/project/${eq.project?.id}/equipment/${eq.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface-page/50 transition-colors">
                    <div className="h-7 w-7 rounded-lg bg-[#FFF3E0] flex items-center justify-center shrink-0">
                      <Clock size={13} className="text-[#EB6200]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-text">{eq.name}</p>
                      <p className="text-[11px] text-text-tertiary">{eq.project?.vesselName} · {eq.vendor?.company || eq.vendor?.name} · {tx(locale, "submitted", "제출됨", "提出済み")} {daysAgo(eq.updatedAt)}{tx(locale, "d ago", "일 전", "日前")}</p>
                    </div>
                    <ArrowRight size={14} className="text-text-tertiary" />
                  </Link>
                ))}
                {inactiveVendors.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="h-7 w-7 rounded-lg bg-[#FFF1F1] flex items-center justify-center shrink-0">
                      <Users size={13} className="text-[#DA1E28]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-text">{v.company || v.name}</p>
                      <p className="text-[11px] text-text-tertiary">{v.email} · {v.eqCount}{tx(locale, " equipment assigned", "건 기자재 배정", "件機器割当")} · {daysAgo(v.lastActive)}{tx(locale, "d no activity", "일 활동 없음", "日間活動なし")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Shipyard overview (card grid) ───────────────────────── */}
          <div>
            <h2 className="text-[14px] font-bold text-text mb-3">
              {tx(locale, "Shipyard Overview", "조선소 현황", "造船所概要")}
            </h2>
            {shipyards.length === 0 ? (
              <div className="bg-white rounded-xl border-2 border-dashed border-border py-10 text-center">
                <Building2 size={28} className="mx-auto text-text-tertiary mb-2" />
                <p className="text-[13px] text-text-tertiary">{tx(locale, "No shipyards registered", "등록된 조선소가 없습니다", "造船所がありません")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {shipyards.map((sy) => {
                  const totalEq = sy.projects.reduce((sum, p) => sum + p.eqTotal, 0);
                  const approvedEq = sy.projects.reduce((sum, p) => sum + p.eqApproved, 0);
                  const pct = totalEq > 0 ? Math.round((approvedEq / totalEq) * 100) : 0;
                  return (
                    <motion.div key={sy.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                      <div className="bg-white rounded-xl border border-border p-4 hover:shadow-sm transition-shadow">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-lg bg-brand-lighter/50 text-brand flex items-center justify-center">
                              <Building2 size={15} />
                            </div>
                            <div>
                              <p className="text-[13px] font-bold text-text">{sy.name}</p>
                              <p className="text-[10px] text-text-tertiary">
                                {sy.projectCount} {tx(locale, "projects", "프로젝트", "プロジェクト")} · {sy.userCount} {tx(locale, "users", "사용자", "ユーザー")}
                              </p>
                            </div>
                          </div>
                          <span className={cn("text-[14px] font-bold tabular-nums", pct >= 100 ? "text-[#24A148]" : pct > 0 ? "text-brand" : "text-text-tertiary")}>{pct}%</span>
                        </div>
                        {/* Projects within shipyard */}
                        {sy.projects.length > 0 && (
                          <div className="space-y-2">
                            {sy.projects.map((p) => {
                              const pp = p.eqTotal > 0 ? Math.round((p.eqApproved / p.eqTotal) * 100) : 0;
                              return (
                                <Link key={p.id} href={`/project/${p.id}`} className="flex items-center gap-2.5 group">
                                  <Ship size={12} className="text-text-tertiary shrink-0" />
                                  <span className="text-[11px] text-text group-hover:text-brand transition-colors truncate flex-1">{p.vesselName}</span>
                                  {p.classification && <span className="text-[8px] font-black text-brand bg-brand-lighter/50 px-1 rounded">{p.classification}</span>}
                                  <span className="text-[10px] text-text-tertiary tabular-nums">{p.eqApproved}/{p.eqTotal}</span>
                                  <div className="w-12 h-1 bg-surface-secondary rounded-full overflow-hidden shrink-0">
                                    <div className="h-full rounded-full" style={{ width: `${pp}%`, backgroundColor: pp >= 100 ? "#24A148" : "var(--color-brand)" }} />
                                  </div>
                                  <ArrowRight size={12} className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

        </div>{/* end left column */}

        {/* ════ Right sidebar (~300px) ════ */}
        <div className="w-[300px] shrink-0 space-y-4 hidden xl:block">

          {/* Project progress */}
          <div className="bg-white rounded-xl border border-border p-4">
            <h3 className="text-[12px] font-bold text-text mb-3 flex items-center gap-2">
              <Ship size={13} className="text-brand" />
              {tx(locale, "Project Progress", "프로젝트 진행률", "プロジェクト進捗")}
            </h3>
            <div className="space-y-3">
              {shipyards.flatMap((sy) => sy.projects.map((p) => ({ ...p, shipyard: sy.name }))).map((p) => {
                const pp = p.eqTotal > 0 ? Math.round((p.eqApproved / p.eqTotal) * 100) : 0;
                const isLow = pp < 30 && p.eqTotal > 0;
                return (
                  <Link key={p.id} href={`/project/${p.id}`} className="block group">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-semibold text-text group-hover:text-brand transition-colors truncate">{p.vesselName}</span>
                      <span className={cn("text-[11px] font-bold tabular-nums", pp >= 100 ? "text-[#24A148]" : isLow ? "text-[#EB6200]" : "text-brand")}>
                        {pp}%
                        {isLow && <AlertTriangle size={10} className="inline ml-1 -mt-0.5" />}
                      </span>
                    </div>
                    <div className="h-1.5 bg-surface-secondary rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pp}%`, backgroundColor: pp >= 100 ? "#24A148" : isLow ? "#EB6200" : "var(--color-brand)" }} />
                    </div>
                    <p className="text-[10px] text-text-tertiary mt-1">{p.shipyard} · {tx(locale, "equipment", "기자재", "機材")} {p.eqApproved}/{p.eqTotal}</p>
                  </Link>
                );
              })}
              {shipyards.flatMap((s) => s.projects).length === 0 && (
                <p className="text-[11px] text-text-tertiary text-center py-3">{tx(locale, "No projects", "프로젝트 없음", "プロジェクトなし")}</p>
              )}
            </div>
          </div>


          {/* Activity log */}
          <div className="bg-white rounded-xl border border-border p-4">
            <h3 className="text-[12px] font-bold text-text mb-3 flex items-center gap-2">
              <Activity size={13} className="text-text-tertiary" />
              {tx(locale, "Activity Log", "활동 로그", "アクティビティログ")}
            </h3>
            {activity.length === 0 ? (
              <p className="text-[11px] text-text-tertiary text-center py-3">{tx(locale, "No recent activity", "최근 활동 없음", "最近のアクティビティなし")}</p>
            ) : (
              <div className="space-y-2.5">
                {activity.slice(0, 8).map((a) => (
                  <div key={a.id} className="flex items-start gap-2.5">
                    <div className={cn("h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                      a.action === "CREATE" ? "bg-[#E6F7EF] text-[#24A148]" :
                      a.action === "UPDATE" ? "bg-[#EDF5FF] text-brand" :
                      "bg-surface-secondary text-text-tertiary"
                    )}>
                      {a.action === "CREATE" ? <CheckCircle size={11} /> : <Activity size={11} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-text">
                        <span className="font-medium">{a.type}</span> {a.action.toLowerCase()}
                      </p>
                      {a.vessel && <p className="text-[10px] text-text-tertiary">{a.vessel}</p>}
                    </div>
                    <span className="text-[9px] text-text-tertiary shrink-0">{timeAgoLabel(a.createdAt, locale)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>{/* end right sidebar */}

      </div>

      {/* Delete confirm dialog */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleDelete}
        title={deleteConfirm?.type === "project"
          ? tx(locale, "Delete Project", "프로젝트 삭제", "プロジェクト削除")
          : tx(locale, "Delete Equipment", "기자재 삭제", "機器削除")
        }
        description={
          locale === "ko"
            ? `"${deleteConfirm?.name || ""}"을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없으며, 관련된 모든 데이터가 영구 삭제됩니다.`
            : locale === "ja"
            ? `「${deleteConfirm?.name || ""}」を削除しますか？この操作は元に戻せません。`
            : `Are you sure you want to delete "${deleteConfirm?.name || ""}"? This action cannot be undone and all related data will be permanently deleted.`
        }
      />
    </div>
  );
}
