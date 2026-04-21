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
import { cn } from "@/lib/utils";

interface Equipment {
  id: string;
  name: string;
  status: string;
  description: string | null;
  securityCategory: number | null;
  isTypeApproved: boolean;
  updatedAt: string;
  // /api/projects/[id]/equipment returns the M2M relation as `vendors` (array).
  // The legacy singular `vendor` field is unused here — relying on it always
  // produced "벤더 미배정" even when vendors were assigned.
  vendors: { id: string; name: string; company: string | null }[];
  _count: { hardware: number; software: number };
  dfdDiagram: { id: string } | null;
}

interface EquipmentHealth {
  hardware: number;
  swWithoutCpe: number;
  auditedHw: number;
  openCritical: number;
  openHigh: number;
  totalCve: number;
  criticalCve: number;
  highCve: number;
}

/** Format "N hours ago" from an ISO timestamp. */
function relTime(iso: string, locale: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (min < 60) return tx(locale, `${min}m ago`, `${min}분 전`, `${min}分前`);
  if (hr < 24)  return tx(locale, `${hr}h ago`, `${hr}시간 전`, `${hr}時間前`);
  return tx(locale, `${day}d ago`, `${day}일 전`, `${day}日前`);
}

const CAT_PILL: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: "CAT I",   color: "#DA1E28", bg: "#FFE2E5" },
  2: { label: "CAT II",  color: "#EB6200", bg: "#FFE3C7" },
  3: { label: "CAT III", color: "#0F62FE", bg: "#E0ECFF" },
};

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
  const [healthByEq, setHealthByEq] = useState<Map<string, EquipmentHealth>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const safe = (p: Promise<Response>) => p.catch(() => null);
    Promise.all([
      safe(fetch(`/api/projects/${projectId}`)),
      safe(fetch(`/api/projects/${projectId}/equipment`)),
      safe(fetch(`/api/projects/${projectId}/software`)),
      safe(fetch(`/api/projects/${projectId}/hardware`)),
      safe(fetch(`/api/projects/${projectId}/risks`)),
      safe(fetch(`/api/projects/${projectId}/cve-matches`)),
    ]).then(async ([pRes, eqRes, swRes, hwRes, riskRes, cveRes]) => {
      const p = pRes?.ok ? await pRes.json() : null;
      const eqs: Equipment[] = eqRes?.ok ? await eqRes.json() : [];
      setProject(p);
      setEquipments(Array.isArray(eqs) ? eqs : []);

      // Aggregate per-equipment health — lightweight; we avoid a dedicated
      // endpoint by joining on the client since equipment counts are small.
      const software: Array<{ id: string; equipmentId: string | null; cpe: string | null; hardwareId: string | null }> =
        swRes?.ok ? await swRes.json() : [];
      const hardware: Array<{ id: string; equipmentId: string | null }> = hwRes?.ok ? await hwRes.json() : [];
      const risks: Array<{ status: string; riskLevel: number; assetRef: string | null }> =
        riskRes?.ok ? await riskRes.json() : [];
      const cve = cveRes?.ok ? await cveRes.json() as Array<{ softwareId: string | null; hardwareId: string | null; cveDetail: { baseSeverity: string | null } | null }> : [];

      const hwByEq = new Map<string, string[]>();
      for (const h of hardware) {
        if (!h.equipmentId) continue;
        if (!hwByEq.has(h.equipmentId)) hwByEq.set(h.equipmentId, []);
        hwByEq.get(h.equipmentId)!.push(h.id);
      }
      // Audit coverage — call once with no filter would include null equipmentId,
      // but we treat auditRuns as per-HW via a cheap proxy: how many HW have
      // at least one audit run attached. Fetch once per-equipment would be
      // expensive; skip here and let the equipment page expose the detail.
      // For the overview we only show "audited" if the equipment has any run.

      // Build a Set of HW names for each equipment so we can filter project-
      // wide risks down to the ones that reference this equipment's assets.
      // (CVE-generated risks use assetRef = "HW name → SW name v…"; manual
      //  risks may use any free-form prefix, so HW-name substring match gives
      //  the best coverage without backend changes.)
      const hwNamesByEq = new Map<string, string[]>();
      for (const eq of eqs) {
        const names = hardware
          .filter((h) => h.equipmentId === eq.id)
          .map((h) => (h as unknown as { name?: string }).name)
          .filter((n): n is string => !!n);
        hwNamesByEq.set(eq.id, names);
      }

      const m = new Map<string, EquipmentHealth>();
      for (const eq of eqs) {
        const hwIds = new Set(hwByEq.get(eq.id) || []);
        const swIds = new Set(software.filter((s) => s.equipmentId === eq.id).map((s) => s.id));
        const missingCpe = [...swIds].filter((id) => !software.find((s) => s.id === id)?.cpe).length;

        let criticalCve = 0, highCve = 0, totalCve = 0;
        for (const c of cve) {
          const inHw = !!c.hardwareId && hwIds.has(c.hardwareId);
          const inSw = !!c.softwareId && swIds.has(c.softwareId);
          if (!inHw && !inSw) continue;
          totalCve++;
          const sev = (c.cveDetail?.baseSeverity || "").toUpperCase();
          if (sev === "CRITICAL") criticalCve++;
          else if (sev === "HIGH") highCve++;
        }

        // Equipment-scoped risk counts — match assetRef against the HW names
        // belonging to this equipment. Risks with no assetRef (legacy / manual)
        // are excluded here; they surface in the equipment page's Risk tab.
        const eqHwNames = hwNamesByEq.get(eq.id) || [];
        const belongs = (assetRef: string | null) => {
          if (!assetRef) return false;
          return eqHwNames.some((n) => assetRef.includes(n));
        };
        const openCritical = risks.filter((r) => r.status === "OPEN" && r.riskLevel >= 20 && belongs(r.assetRef)).length;
        const openHigh = risks.filter((r) => r.status === "OPEN" && r.riskLevel >= 12 && r.riskLevel < 20 && belongs(r.assetRef)).length;

        m.set(eq.id, {
          hardware: eqHwNames.length,
          swWithoutCpe: missingCpe,
          auditedHw: 0, // surfaced inside equipment page, not here
          openCritical,
          openHigh,
          totalCve,
          criticalCve,
          highCve,
        });
      }
      setHealthByEq(m);
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
                const cat = eq.securityCategory ? CAT_PILL[eq.securityCategory] : null;
                const health = healthByEq.get(eq.id);
                const worstCveTone =
                  health?.criticalCve ? "safety-high" :
                  health?.highCve ? "safety-elevated" :
                  health?.totalCve ? "safety-moderate" : "safety-low";
                return (
                  <Link
                    key={eq.id}
                    href={`/viewer/${projectId}/${eq.id}`}
                    className="relative flex items-start gap-4 px-5 py-3.5 hover:bg-surface-secondary/30 transition-colors group"
                  >
                    {/* Left status stripe */}
                    <span aria-hidden className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r" style={{ backgroundColor: st.color }} />
                    {/* Mono index */}
                    <span className="font-mono text-[10px] font-bold tabular-nums tracking-[0.05em] text-text-tertiary w-6 shrink-0 mt-0.5">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ backgroundColor: st.bg }}
                    >
                      <Icon size={16} style={{ color: st.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="text-body-sm font-bold text-text truncate group-hover:text-brand transition-colors">{eq.name}</p>
                        {cat && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[0.06em] shrink-0 tabular-nums"
                            style={{ backgroundColor: cat.bg, color: cat.color }}
                            title={tx(locale, "Security category", "보안 분류", "セキュリティ分類")}
                          >
                            {cat.label}
                          </span>
                        )}
                        {eq.isTypeApproved && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-50 text-safety-low uppercase tracking-[0.06em]">
                            <CheckCircle size={8} strokeWidth={2.5} /> {tx(locale, "Certified", "인증", "認証")}
                          </span>
                        )}
                        <span
                          className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.06em] shrink-0 ml-auto"
                          style={{ backgroundColor: st.bg, color: st.color }}
                        >
                          {st.label[locale as "en" | "ko" | "ja"] || st.label.en}
                        </span>
                      </div>
                      {eq.description && (
                        <p className="text-body-xs text-text-secondary mt-0.5 line-clamp-1 leading-relaxed">{eq.description}</p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap mt-1.5">
                        <span className="text-[10px] font-mono text-text-tertiary tracking-tight">
                          {eq.vendors.length > 0
                            ? eq.vendors.map((v) => v.company || v.name).join(", ")
                            : tx(locale, "— no vendor —", "— 벤더 미배정 —", "— ベンダーなし —")}
                        </span>
                        <span className="font-mono text-[10px] tabular-nums text-text-tertiary">HW {eq._count.hardware}</span>
                        <span className="font-mono text-[10px] tabular-nums text-text-tertiary">SW {eq._count.software}</span>
                        {eq.dfdDiagram && <span className="font-mono text-[10px] text-safety-low font-bold">DFD ✓</span>}
                        <span className="font-mono text-[10px] text-text-tertiary">· {relTime(eq.updatedAt, locale)}</span>
                      </div>
                      {/* Health chips — CVE severity and risk counts */}
                      {health && (health.totalCve > 0 || health.openCritical > 0 || health.openHigh > 0 || health.swWithoutCpe > 0) && (
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {health.totalCve > 0 && (
                            <span className={cn("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tabular-nums",
                              worstCveTone === "safety-high" ? "bg-risk-bg text-safety-high" :
                              worstCveTone === "safety-elevated" ? "bg-orange-50 text-safety-elevated" :
                              worstCveTone === "safety-moderate" ? "bg-amber-50 text-[#9a6a00]" :
                              "bg-green-50 text-safety-low"
                            )}>
                              CVE {health.totalCve}
                              {health.criticalCve > 0 && <span className="opacity-70">· C{health.criticalCve}</span>}
                              {health.highCve > 0 && <span className="opacity-70">· H{health.highCve}</span>}
                            </span>
                          )}
                          {health.openCritical > 0 && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tabular-nums bg-risk-bg text-safety-high">
                              <AlertCircle size={8} strokeWidth={2.5} /> {health.openCritical} {tx(locale, "crit", "긴급", "緊急")}
                            </span>
                          )}
                          {health.openHigh > 0 && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tabular-nums bg-orange-50 text-safety-elevated">
                              {health.openHigh} high
                            </span>
                          )}
                          {health.swWithoutCpe > 0 && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tabular-nums bg-surface-secondary text-text-tertiary">
                              {health.swWithoutCpe} {tx(locale, "missing CPE", "CPE 누락", "CPE未登録")}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <ChevronRight size={16} className="text-text-tertiary group-hover:text-brand group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
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
