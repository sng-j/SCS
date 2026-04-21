"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Eye, Cpu, Package, FileText, Network, ClipboardCheck,
  ChevronDown, ChevronRight, Download, Shield, AlertTriangle, AlertCircle,
  CheckCircle, XCircle, MinusCircle, Clock,
  X as IconX, Zap,
} from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { SkeletonTable } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  CveBadge,
  emptySeverity,
  addToSeverity,
  type SeverityCounts,
} from "@/components/inventory/cve-badge";
import { AuditRunsList } from "@/components/audit/audit-runs-list";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Equipment {
  id: string; name: string; status: string;
  description: string | null;
  securityCategory: number | null;
  isTypeApproved: boolean;
  manufacturerName: string | null;
  productModelName: string | null;
  updatedAt: string;
  // API returns `vendors` (M2M array). The legacy singular `vendor` was always
  // null at this endpoint, which made the header show "벤더 미배정" even when
  // vendors were assigned.
  vendors: { id: string; name: string; company: string | null }[];
  _count: { hardware: number; software: number };
  dfdDiagram: { id: string } | null;
}
interface SubmissionEvent {
  id: string; phase: string; status: string;
  submittedAt: string | null; createdAt: string; updatedAt: string;
  notes: string | null; reviewNote: string | null;
}
interface ChangeEventItem {
  id: string; subject: string; kind: string; actor: string | null;
  resolvedAt: string | null; createdAt: string;
}
interface Hardware {
  id: string; name: string; type: string; manufacturer: string | null; model: string | null;
  ipAddress: string | null; macAddress?: string | null; zone: string | null;
  location?: string | null; purpose?: string | null; category?: string | null;
  protectionMethod?: string | null; commProtocols?: string | null; physicalInterface?: string | null;
  sysSoftwareCategory?: string | null; sysSoftwareVersion?: string | null;
  software?: { id: string; name: string; version: string | null }[];
  _count?: { cveMatches: number };
}
interface Software {
  id: string; name: string; version: string | null; vendor: string | null; swType: string;
  cpe?: string | null; listeningPort?: string | null; purpose?: string | null;
  hardwareId?: string | null;
  hardware?: { id: string; name: string } | null;
  _count?: { cveMatches: number };
}
interface Assessment {
  id: string; hardwareId: string; checkId: string; result: string;
  evidence: string | null; note: string | null;
  hardware?: { id: string; name: string; type: string };
}
interface Doc {
  id: string; docType: string; title: string; standard: string;
  status: string; version: number; generatedAt: string | null; updatedAt: string;
}
interface Risk {
  id: string; threatId: string; cveId?: string | null; assetRef: string | null;
  likelihood: number; impact: number; riskLevel: number; status: string;
  mitigation: string | null;
}
interface AuditRunSummary {
  id: string; platform: string; results: Record<string, unknown>;
  createdAt: string; hardwareId: string | null;
}
interface ViewerCveMatch {
  name: string; version: string;
  cves: { cveId: string; severity: string | null; score: number | null; description: string }[];
}

// ─── Visual helpers ─────────────────────────────────────────────────────────

const RESULT_META: Record<string, {
  icon: React.ElementType; color: string; bg: string;
  label: { en: string; ko: string; ja: string };
}> = {
  PASS:           { icon: CheckCircle, color: "#24A148", bg: "#E6F7EF", label: { en: "Pass", ko: "합격", ja: "合格" } },
  FAIL:           { icon: XCircle,     color: "#DA1E28", bg: "#FFF1F1", label: { en: "Fail", ko: "불합격", ja: "不合格" } },
  PARTIAL:        { icon: AlertCircle, color: "#EB6200", bg: "#FFF3E0", label: { en: "Partial", ko: "일부", ja: "一部" } },
  NOT_APPLICABLE: { icon: MinusCircle, color: "#8D8D8D", bg: "#F4F4F4", label: { en: "N/A", ko: "해당없음", ja: "N/A" } },
  NOT_CHECKED:    { icon: Clock,       color: "#A8A8A8", bg: "#F4F4F4", label: { en: "Not Checked", ko: "미점검", ja: "未点検" } },
};

const STATUS_META: Record<string, {
  label: { en: string; ko: string; ja: string }; color: string; bg: string;
}> = {
  APPROVED:           { label: { en: "Approved", ko: "승인됨", ja: "承認済み" }, color: "#24A148", bg: "#E6F7EF" },
  SUBMITTED:          { label: { en: "Submitted", ko: "제출됨", ja: "提出済み" }, color: "#EB6200", bg: "#FFF3E0" },
  IN_PROGRESS:        { label: { en: "In Progress", ko: "진행 중", ja: "進行中" }, color: "#0F62FE", bg: "#EDF5FF" },
  REVISION_REQUESTED: { label: { en: "Revision", ko: "수정 요청", ja: "修正依頼" }, color: "#DA1E28", bg: "#FFF1F1" },
  PENDING:            { label: { en: "Pending", ko: "대기", ja: "保留中" }, color: "#8D8D8D", bg: "#F4F4F4" },
};

function signalColor(pct: number) {
  if (pct >= 80) return "var(--color-safety-low)";
  if (pct >= 50) return "var(--color-safety-elevated)";
  if (pct >= 20) return "var(--color-safety-moderate)";
  return "var(--color-safety-high)";
}

// ─── Page ────────────────────────────────────────────────────────────────────

type Section = "assets" | "assessment" | "risk" | "audit" | "documents" | "timeline";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert an absolute date into a compact relative string (mono-ready). */
function relativeTime(iso: string, locale: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (sec < 60) return tx(locale, "just now", "방금 전", "たった今");
  if (min < 60) return tx(locale, `${min}m ago`, `${min}분 전`, `${min}分前`);
  if (hr < 24)  return tx(locale, `${hr}h ago`, `${hr}시간 전`, `${hr}時間前`);
  if (day < 30) return tx(locale, `${day}d ago`, `${day}일 전`, `${day}日前`);
  return d.toLocaleDateString(locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US");
}

const CAT_META: Record<number, { label: string; color: string; bg: string; border: string; note: { en: string; ko: string; ja: string } }> = {
  1: { label: "CAT I",   color: "#DA1E28", bg: "#FFF1F1", border: "#FFC7CD", note: { en: "Essential safety system — failure may endanger ship or crew", ko: "필수 안전 시스템 — 장애 시 선박/승조원 위험", ja: "必須安全システム — 障害時に船舶/乗組員が危険" } },
  2: { label: "CAT II",  color: "#EB6200", bg: "#FFF3E0", border: "#FFD5AA", note: { en: "Essential operational system — loss of function degrades operation", ko: "필수 운영 시스템 — 기능 상실 시 운영 저하", ja: "必須運用システム — 機能喪失で運用低下" } },
  3: { label: "CAT III", color: "#0F62FE", bg: "#EDF5FF", border: "#C1D8FF", note: { en: "Non-critical IT — convenience, no operational safety impact", ko: "비중요 IT — 편의용, 안전 운영에 영향 없음", ja: "非重要IT — 便利性のみ、運用安全への影響なし" } },
};

export default function ViewerEquipmentPage() {
  const { projectId, equipmentId } = useParams<{ projectId: string; equipmentId: string }>();
  const { locale } = useLocaleStore();
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [project, setProject] = useState<{ vesselName: string } | null>(null);
  const [hardware, setHardware] = useState<Hardware[]>([]);
  const [software, setSoftware] = useState<Software[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [auditRuns, setAuditRuns] = useState<AuditRunSummary[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionEvent[]>([]);
  const [changes, setChanges] = useState<ChangeEventItem[]>([]);
  const [cveBySwId, setCveBySwId] = useState<Map<string, SeverityCounts>>(new Map());
  const [cveByHwId, setCveByHwId] = useState<Map<string, SeverityCounts>>(new Map());
  const [hwCveMatches, setHwCveMatches] = useState<Map<string, ViewerCveMatch[]>>(new Map());
  const [loading, setLoading] = useState(true);

  // Default: "assets" open; accordion keys reopen remains user-driven
  const [openSections, setOpenSections] = useState<Set<Section>>(new Set(["assets"]));
  const [expandedAssessment, setExpandedAssessment] = useState<string | null>(null);
  const [expandedHw, setExpandedHw] = useState<string | null>(null);
  const [expandedSw, setExpandedSw] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<Doc | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const toggleSection = (s: Section) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  const openPreview = async (d: Doc) => {
    setPreviewDoc(d); setPreviewHtml(null); setPreviewLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/documents/${d.id}/preview`);
      if (res.ok) setPreviewHtml(await res.text());
      else setPreviewHtml(`<div style="padding:2rem;color:#666">Preview failed (${res.status})</div>`);
    } catch {
      setPreviewHtml(`<div style="padding:2rem;color:#666">Preview error</div>`);
    } finally { setPreviewLoading(false); }
  };
  const closePreview = () => { setPreviewDoc(null); setPreviewHtml(null); };

  useEffect(() => {
    const safe = (p: Promise<Response>) => p.catch(() => null);
    Promise.all([
      safe(fetch(`/api/projects/${projectId}`)),
      safe(fetch(`/api/projects/${projectId}/equipment`)),
      safe(fetch(`/api/projects/${projectId}/hardware?equipmentId=${equipmentId}`)),
      safe(fetch(`/api/projects/${projectId}/software?equipmentId=${equipmentId}`)),
      safe(fetch(`/api/projects/${projectId}/assessments?equipmentId=${equipmentId}`)),
      safe(fetch(`/api/projects/${projectId}/documents?equipmentId=${equipmentId}`)),
      safe(fetch(`/api/projects/${projectId}/risks`)),
      safe(fetch(`/api/projects/${projectId}/cve-matches`)),
      safe(fetch(`/api/vendor/audit-tools/upload?equipmentId=${equipmentId}`)),
      safe(fetch(`/api/projects/${projectId}/submissions`)),
      safe(fetch(`/api/projects/${projectId}/changes?filter=all&limit=10`)),
    ]).then(async ([pRes, eqRes, hwRes, swRes, asRes, docsRes, riskRes, cveRes, auditRes, subRes, chgRes]) => {
      const p = pRes?.ok ? await pRes.json() : null;
      const eqs = eqRes?.ok ? await eqRes.json() : [];
      const hwList: Hardware[] = hwRes?.ok ? await hwRes.json() : [];
      const swList: Software[] = swRes?.ok ? await swRes.json() : [];

      setProject(p);
      setEquipment(Array.isArray(eqs) ? (eqs.find((e: Equipment) => e.id === equipmentId) || null) : null);
      setHardware(hwList);
      setSoftware(swList);
      setAssessments(asRes?.ok ? await asRes.json() : []);
      setDocuments(docsRes?.ok ? await docsRes.json() : []);
      setRisks(riskRes?.ok ? await riskRes.json() : []);

      // CVE maps
      if (cveRes?.ok) {
        const all = await cveRes.json() as Array<{
          cveId: string;
          softwareId: string | null;
          hardwareId: string | null;
          software: { id: string; name: string; version: string | null } | null;
          cveDetail: { description: string | null; baseScore: number | null; baseSeverity: string | null } | null;
        }>;
        const swMap = new Map<string, SeverityCounts>();
        const hwMap = new Map<string, SeverityCounts>();
        for (const m of all) {
          const sev = m.cveDetail?.baseSeverity;
          if (m.softwareId) {
            if (!swMap.has(m.softwareId)) swMap.set(m.softwareId, emptySeverity());
            addToSeverity(swMap.get(m.softwareId)!, sev);
          }
          if (m.hardwareId) {
            if (!hwMap.has(m.hardwareId)) hwMap.set(m.hardwareId, emptySeverity());
            addToSeverity(hwMap.get(m.hardwareId)!, sev);
          }
        }
        setCveBySwId(swMap);
        setCveByHwId(hwMap);

        const swIdToHwId = new Map<string, string>();
        for (const sw of swList) if (sw.hardwareId) swIdToHwId.set(sw.id, sw.hardwareId);
        const perHw = new Map<string, ViewerCveMatch[]>();
        for (const m of all) {
          const hwId = m.hardwareId ?? (m.softwareId ? swIdToHwId.get(m.softwareId) : undefined);
          if (!hwId) continue;
          const name = m.software?.name ?? "—";
          const version = m.software?.version ?? "";
          const key = `${name}::${version}`;
          if (!perHw.has(hwId)) perHw.set(hwId, []);
          const bucket = perHw.get(hwId)!;
          let entry = bucket.find((b) => `${b.name}::${b.version}` === key);
          if (!entry) { entry = { name, version, cves: [] }; bucket.push(entry); }
          entry.cves.push({
            cveId: m.cveId,
            severity: m.cveDetail?.baseSeverity ?? null,
            score: m.cveDetail?.baseScore ?? null,
            description: m.cveDetail?.description ?? "",
          });
        }
        setHwCveMatches(perHw);
      }

      // Audit runs
      if (auditRes?.ok) {
        const raw = await auditRes.json();
        const list = Array.isArray(raw) ? raw : (raw.runs ?? []);
        type RawRun = { id: string; platform?: string; results?: string | object; createdAt: string; hardwareId?: string | null };
        setAuditRuns(list.map((r: RawRun) => ({
          id: r.id,
          platform: r.platform || "UNKNOWN",
          results: typeof r.results === "string"
            ? (() => { try { return JSON.parse(r.results as string); } catch { return {}; } })()
            : ((r.results as Record<string, unknown>) ?? {}),
          createdAt: r.createdAt,
          hardwareId: r.hardwareId ?? null,
        })));
      }

      // Submissions (project-level — shows phase progression history)
      if (subRes?.ok) {
        const subs = await subRes.json();
        setSubmissions(Array.isArray(subs) ? subs : []);
      }
      // Change events
      if (chgRes?.ok) {
        const raw = await chgRes.json();
        const list = Array.isArray(raw) ? raw : (raw.changes ?? raw.items ?? []);
        setChanges(list as ChangeEventItem[]);
      }
    }).finally(() => setLoading(false));
  }, [projectId, equipmentId]);

  if (loading) {
    return <div className="max-w-[1200px] mx-auto px-6 py-8"><SkeletonTable rows={6} /></div>;
  }
  if (!equipment) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8">
        <EmptyState icon={Package} title={tx(locale, "Equipment not found", "기자재를 찾을 수 없습니다", "機器が見つかりません")} />
      </div>
    );
  }

  // ─── Derived metrics for the HUD ─────────────────────────────────────────

  const assessPass = assessments.filter((a) => a.result === "PASS").length;
  const assessFail = assessments.filter((a) => a.result === "FAIL" || a.result === "PARTIAL").length;
  const assessNA = assessments.filter((a) => a.result === "NOT_APPLICABLE").length;
  const assessUnchecked = assessments.filter((a) => a.result === "NOT_CHECKED").length;
  const judged = assessPass + assessFail;
  const assessPct = judged > 0 ? Math.round((assessPass / judged) * 100) : 0;

  // Aggregate CVE severity scoped to this equipment
  const cveAggregate = emptySeverity();
  for (const hw of hardware) {
    const c = cveByHwId.get(hw.id);
    if (!c) continue;
    cveAggregate.total += c.total;
    cveAggregate.critical += c.critical;
    cveAggregate.high += c.high;
    cveAggregate.medium += c.medium;
    cveAggregate.low += c.low;
    cveAggregate.unknown += c.unknown;
  }
  for (const sw of software) {
    const c = cveBySwId.get(sw.id);
    if (!c) continue;
    cveAggregate.total += c.total;
    cveAggregate.critical += c.critical;
    cveAggregate.high += c.high;
    cveAggregate.medium += c.medium;
    cveAggregate.low += c.low;
    cveAggregate.unknown += c.unknown;
  }

  const auditedHwIds = new Set(auditRuns.map((r) => r.hardwareId).filter(Boolean) as string[]);
  const auditedCount = hardware.filter((h) => auditedHwIds.has(h.id)).length;
  const auditPct = hardware.length > 0 ? Math.round((auditedCount / hardware.length) * 100) : 0;

  const missingCpe = software.filter((s) => !s.cpe).length;
  const openCriticalRisks = risks.filter((r) => r.status === "OPEN" && r.riskLevel >= 20);
  const openHighRisks = risks.filter((r) => r.status === "OPEN" && r.riskLevel >= 12 && r.riskLevel < 20);

  // Build "needs attention" items
  type AttentionItem = { key: string; severity: "critical" | "high" | "medium"; label: string; icon: React.ElementType };
  const attention: AttentionItem[] = [];
  if (cveAggregate.critical > 0) attention.push({
    key: "cve-critical", severity: "critical", icon: Zap,
    label: tx(locale,
      `${cveAggregate.critical} Critical CVE match(es) — immediate action required`,
      `Critical CVE ${cveAggregate.critical}건 — 즉시 조치 필요`,
      `Critical CVE ${cveAggregate.critical}件 — 即時対応が必要`),
  });
  if (openCriticalRisks.length > 0) attention.push({
    key: "risk-critical", severity: "critical", icon: AlertTriangle,
    label: tx(locale,
      `${openCriticalRisks.length} Critical risk(s) awaiting mitigation`,
      `Critical 리스크 ${openCriticalRisks.length}건 미조치`,
      `Critical リスク ${openCriticalRisks.length}件 未対応`),
  });
  if (assessFail > 0) attention.push({
    key: "sc-fail", severity: "high", icon: XCircle,
    label: tx(locale,
      `${assessFail} SC check(s) failed`,
      `보안 점검 실패 ${assessFail}건`,
      `セキュリティチェック失敗 ${assessFail}件`),
  });
  if (auditPct < 100 && hardware.length > 0) attention.push({
    key: "audit-gap", severity: "high", icon: Shield,
    label: tx(locale,
      `${hardware.length - auditedCount} HW not audited (${auditPct}% coverage)`,
      `미감사 HW ${hardware.length - auditedCount}건 (커버리지 ${auditPct}%)`,
      `未監査HW ${hardware.length - auditedCount}件 (カバレッジ${auditPct}%)`),
  });
  if (openHighRisks.length > 0) attention.push({
    key: "risk-high", severity: "high", icon: AlertCircle,
    label: tx(locale,
      `${openHighRisks.length} High risk(s) open`,
      `High 리스크 ${openHighRisks.length}건 미조치`,
      `High リスク ${openHighRisks.length}件 未対応`),
  });
  if (missingCpe > 0) attention.push({
    key: "cpe-missing", severity: "medium", icon: AlertCircle,
    label: tx(locale,
      `${missingCpe} software entry(ies) without CPE — CVE matching unavailable`,
      `CPE 누락 SW ${missingCpe}건 — CVE 매칭 불가`,
      `CPE未登録SW ${missingCpe}件 — CVEマッチング不可`),
  });
  if (documents.length === 0) attention.push({
    key: "docs-missing", severity: "medium", icon: FileText,
    label: tx(locale, "No documents generated yet", "생성된 문서 없음", "文書未生成"),
  });
  if (!equipment.dfdDiagram) attention.push({
    key: "dfd-missing", severity: "medium", icon: Network,
    label: tx(locale, "DFD not defined yet", "DFD 미정의", "DFD未定義"),
  });

  const st = STATUS_META[equipment.status] || STATUS_META.PENDING;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-[1200px] mx-auto px-6 py-8 space-y-5"
    >
      {/* Back link */}
      <Link
        href={`/viewer/${projectId}`}
        className="group inline-flex items-center gap-1 text-body-xs text-text-tertiary hover:text-brand transition-colors"
      >
        <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
        <span>{project?.vesselName || tx(locale, "Vessel", "선박", "船舶")}</span>
      </Link>

      {/* Equipment header — bridge console readout style */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
        className="relative"
      >
        {/* Status color strip — left edge, 2px, color-coded by equipment status */}
        <div
          aria-hidden
          className="absolute left-[-12px] top-1 bottom-1 w-[2px] rounded-full"
          style={{ backgroundColor: st.color }}
        />
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-surface text-text-tertiary text-[10px] font-bold uppercase tracking-[0.1em]">
            <Eye size={10} /> {tx(locale, "Viewer", "뷰어", "閲覧")}
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.06em]" style={{ backgroundColor: st.bg, color: st.color }}>
            {st.label[locale as "en" | "ko" | "ja"] || st.label.en}
          </span>
        </div>
        <h1 className="text-h4 font-extrabold text-text leading-tight">{equipment.name}</h1>
        <div className="flex items-center gap-3 mt-1 text-[11px] font-mono text-text-tertiary">
          <span className="tracking-tight">
            {equipment.vendors.length > 0
              ? equipment.vendors.map((v) => v.company || v.name).join(", ")
              : tx(locale, "— no vendor —", "— 벤더 미배정 —", "— ベンダーなし —")}
          </span>
          <span className="h-3 w-px bg-border/80" />
          <span className="tabular-nums">HW {hardware.length}</span>
          <span className="opacity-50">·</span>
          <span className="tabular-nums">SW {software.length}</span>
          <span className="h-3 w-px bg-border/80" />
          <span className="tabular-nums">{relativeTime(equipment.updatedAt, locale)}</span>
        </div>
      </motion.div>

      {/* ── Equipment Identity — the "what is this system" card ─────── */}
      <EquipmentIdentityCard equipment={equipment} locale={locale} />

      {/* ── HUD: 5 stat cards — staggered console bootup ─────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Compliance */}
        <StatCard index={0} icon={ClipboardCheck} label={tx(locale, "Compliance", "준수율", "準拠率")}>
          <div className="flex items-baseline gap-1">
            <span className="text-[22px] font-extrabold tabular-nums" style={{ color: signalColor(assessPct) }}>
              {assessPct}
            </span>
            <span className="text-[12px] font-medium text-text-tertiary">%</span>
          </div>
          <div className="mt-1.5 h-1 w-full rounded-full bg-border/50 overflow-hidden">
            <div className="h-full transition-[width] duration-500" style={{ width: `${assessPct}%`, backgroundColor: signalColor(assessPct) }} />
          </div>
          <p className="text-[10px] text-text-tertiary mt-1">
            ✓ {assessPass} · ✗ {assessFail} · N/A {assessNA} · — {assessUnchecked}
          </p>
        </StatCard>

        {/* Risk */}
        <StatCard index={1} icon={AlertTriangle} label={tx(locale, "Risk", "리스크", "リスク")}>
          {(() => {
            const riskSignal = openCriticalRisks.length > 0
              ? "var(--color-safety-high)"
              : openHighRisks.length > 0
              ? "var(--color-safety-elevated)"
              : risks.length > 0
              ? "var(--color-safety-moderate)"
              : "var(--color-safety-low)";
            return (
              <>
                <div className="flex items-baseline gap-1">
                  <span className="text-[22px] font-extrabold tabular-nums text-text">{risks.length}</span>
                  <span className="text-[11px] font-medium text-text-tertiary">
                    {tx(locale, "item(s)", "건", "件")}
                  </span>
                </div>
                <div className="mt-1.5 h-1 w-full rounded-full overflow-hidden" style={{ background: `${riskSignal}25` }}>
                  <div className="h-full transition-[width] duration-500" style={{ width: risks.length > 0 ? "100%" : "0%", background: riskSignal }} />
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px]">
                  {openCriticalRisks.length > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-safety-high font-bold font-mono tabular-nums">
                      <AlertTriangle size={8} /> {openCriticalRisks.length}
                    </span>
                  )}
                  {openHighRisks.length > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-safety-elevated font-bold font-mono tabular-nums">
                      {openHighRisks.length} H
                    </span>
                  )}
                  {openCriticalRisks.length === 0 && openHighRisks.length === 0 && (
                    <span className="text-text-tertiary">{tx(locale, "nominal", "양호", "良好")}</span>
                  )}
                </div>
              </>
            );
          })()}
        </StatCard>

        {/* CVE */}
        <StatCard index={2} icon={Zap} label="CVE">
          {(() => {
            const cveSignal = cveAggregate.critical > 0
              ? "var(--color-safety-high)"
              : cveAggregate.high > 0
              ? "var(--color-safety-elevated)"
              : cveAggregate.total > 0
              ? "var(--color-safety-moderate)"
              : "var(--color-safety-low)";
            return (
              <>
                <div className="flex items-baseline gap-1">
                  <span className="text-[22px] font-extrabold tabular-nums" style={{ color: cveAggregate.total === 0 ? "var(--color-safety-low)" : "var(--color-text)" }}>
                    {cveAggregate.total}
                  </span>
                  <span className="text-[11px] font-medium text-text-tertiary">
                    {tx(locale, "matches", "매칭", "一致")}
                  </span>
                </div>
                <div className="mt-1.5 h-1 w-full rounded-full overflow-hidden" style={{ background: `${cveSignal}25` }}>
                  <div className="h-full transition-[width] duration-500" style={{ width: cveAggregate.total > 0 ? "100%" : "0%", background: cveSignal }} />
                </div>
                <div className="mt-1">
                  {cveAggregate.total > 0 ? (
                    <CveBadge counts={cveAggregate} size="sm" />
                  ) : (
                    <p className="text-[10px] text-text-tertiary">
                      {tx(locale, "no matches", "매칭 없음", "一致なし")}
                    </p>
                  )}
                </div>
              </>
            );
          })()}
        </StatCard>

        {/* Audit */}
        <StatCard index={3} icon={Shield} label={tx(locale, "Audit", "감사", "監査")}>
          <div className="flex items-baseline gap-1">
            <span className="text-[22px] font-extrabold tabular-nums" style={{ color: signalColor(auditPct) }}>
              {auditedCount}
            </span>
            <span className="text-[12px] text-text-tertiary">/ {hardware.length}</span>
          </div>
          <div className="mt-1.5 h-1 w-full rounded-full bg-border/50 overflow-hidden">
            <div className="h-full transition-[width] duration-500" style={{ width: `${auditPct}%`, backgroundColor: signalColor(auditPct) }} />
          </div>
          <p className="text-[10px] text-text-tertiary mt-1">
            {auditPct}% {tx(locale, "covered", "감사됨", "カバー")}
          </p>
        </StatCard>

        {/* Documents + DFD */}
        <StatCard index={4} icon={FileText} label={tx(locale, "Output", "산출물", "成果物")}>
          {(() => {
            const hasDocs = documents.length > 0;
            const hasDfd = !!equipment.dfdDiagram;
            const outputPct = (hasDocs ? 50 : 0) + (hasDfd ? 50 : 0);
            const outputSignal = outputPct === 100
              ? "var(--color-safety-low)"
              : outputPct >= 50
              ? "var(--color-safety-elevated)"
              : "var(--color-safety-high)";
            return (
              <>
                <div className="flex items-baseline gap-1">
                  <span className="text-[22px] font-extrabold tabular-nums text-text">{documents.length}</span>
                  <span className="text-[12px] text-text-tertiary">
                    {tx(locale, "docs", "문서", "文書")}
                  </span>
                </div>
                <div className="mt-1.5 h-1 w-full rounded-full overflow-hidden" style={{ background: `${outputSignal}25` }}>
                  <div className="h-full transition-[width] duration-500" style={{ width: `${outputPct}%`, background: outputSignal }} />
                </div>
                <p className="text-[10px] mt-1 flex items-center gap-1 text-text-tertiary font-mono">
                  <Network size={10} />
                  {hasDfd
                    ? <span className="text-safety-low font-bold tracking-tight">DFD ✓</span>
                    : <span className="text-safety-elevated font-bold tracking-tight">DFD ✗</span>}
                </p>
              </>
            );
          })()}
        </StatCard>
      </div>

      {/* ── Needs-attention — action list with severity color strip ── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
      >
        {attention.length > 0 ? (
          <Card padding="none">
            <div className="px-4 py-2.5 border-b border-border bg-risk-bg/40 flex items-center gap-2">
              <AlertTriangle size={12} className="text-safety-high" strokeWidth={2.5} />
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-safety-high">
                {tx(locale, "Needs attention", "지금 확인해야 할 것", "要確認事項")}
              </span>
              <span className="font-mono text-[10px] tabular-nums text-text-tertiary">[{String(attention.length).padStart(2, "0")}]</span>
            </div>
            <ul className="divide-y divide-border/60">
              {attention.map((a, i) => {
                const Icon = a.icon;
                const severityStyle = {
                  critical: { stripe: "bg-safety-high", iconColor: "text-safety-high", label: "CRIT" },
                  high:     { stripe: "bg-safety-elevated", iconColor: "text-safety-elevated", label: "HIGH" },
                  medium:   { stripe: "bg-safety-moderate", iconColor: "text-[#9a6a00]", label: "MED" },
                }[a.severity];
                return (
                  <motion.li
                    key={a.key}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: 0.4 + i * 0.03 }}
                    className="relative flex items-start gap-3 pl-4 pr-4 py-2.5 group/item hover:bg-surface-secondary/30 transition-colors"
                  >
                    {/* Left-edge severity strip — IDE breakpoint aesthetic */}
                    <span aria-hidden className={cn("absolute left-0 top-2 bottom-2 w-[3px] rounded-r", severityStyle.stripe)} />
                    <Icon size={13} className={cn("shrink-0 mt-0.5", severityStyle.iconColor)} strokeWidth={2.25} />
                    <span className="text-[12px] text-text-secondary leading-relaxed flex-1">{a.label}</span>
                    <span className={cn("font-mono text-[9px] font-bold tracking-[0.08em] shrink-0 mt-0.5", severityStyle.iconColor)}>
                      {severityStyle.label}
                    </span>
                  </motion.li>
                );
              })}
            </ul>
          </Card>
        ) : (
          <Card padding="none">
            <div className="relative flex items-center gap-3 pl-4 pr-4 py-3 bg-green-50/40">
              <span aria-hidden className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-safety-low" />
              <CheckCircle size={14} className="text-safety-low shrink-0" strokeWidth={2.5} />
              <span className="text-[12px] font-bold text-safety-low">
                {tx(locale, "All critical items resolved · status nominal", "주요 이슈 없음 · 상태 양호", "重大な問題なし · 状態良好")}
              </span>
              <span className="ml-auto font-mono text-[9px] font-bold text-safety-low/80 tracking-[0.12em] uppercase">Clear</span>
            </div>
          </Card>
        )}
      </motion.div>

      {/* ── Top Risks — surface the 3 worst open risks before accordions ─ */}
      <TopRisksStrip risks={risks} locale={locale} />

      {/* ── Accordions — numbered console sections (01 – 06) ────────── */}
      <div className="space-y-2 pt-1">
        {/* Assets */}
        <AccordionSection
          id="assets"
          num="01"
          title={tx(locale, `Inventory — HW ${hardware.length} · SW ${software.length}`, `자산 목록 — HW ${hardware.length} · SW ${software.length}`, `資産 — HW ${hardware.length} · SW ${software.length}`)}
          icon={Cpu}
          open={openSections.has("assets")}
          onToggle={() => toggleSection("assets")}
          motionDelay={0.5}
        >
          <div className="divide-y divide-border">
            {/* HW rows */}
            {hardware.map((hw) => {
              const isExpanded = expandedHw === hw.id;
              const hwSev = cveByHwId.get(hw.id) || emptySeverity();
              for (const s of software.filter((sw) => sw.hardwareId === hw.id)) {
                const c = cveBySwId.get(s.id);
                if (c) {
                  hwSev.total += c.total;
                  hwSev.critical += c.critical; hwSev.high += c.high;
                  hwSev.medium += c.medium; hwSev.low += c.low; hwSev.unknown += c.unknown;
                }
              }
              return (
                <div key={hw.id}>
                  <button
                    onClick={() => setExpandedHw(isExpanded ? null : hw.id)}
                    className="w-full flex items-start gap-3 px-5 py-3 hover:bg-surface-secondary/30 transition-colors text-left"
                  >
                    <Cpu size={14} className="text-text-tertiary shrink-0 mt-0.5" strokeWidth={2.25} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-body-sm font-semibold text-text truncate">{hw.name}</p>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-surface-secondary text-text-tertiary uppercase tracking-[0.06em]">{hw.type}</span>
                        {hw.zone && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-brand-lighter text-brand uppercase tracking-[0.06em]">{hw.zone}</span>}
                      </div>
                      <p className="text-body-xs text-text-tertiary mt-0.5 font-mono tracking-tight">
                        {[hw.manufacturer, hw.model].filter(Boolean).join(" ") || "—"}
                        {hw.ipAddress && <><span className="opacity-50 mx-1.5">·</span>{hw.ipAddress}</>}
                      </p>
                      {/* Dense info chips — purpose / protection / protocol */}
                      {(hw.purpose || hw.protectionMethod || hw.commProtocols) && (
                        <div className="flex flex-wrap items-center gap-1 mt-1.5">
                          {hw.purpose && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-surface-secondary/70 text-text-secondary border border-border/50">
                              <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-text-tertiary">{tx(locale, "use", "용도", "用途")}</span>
                              <span className="truncate max-w-[140px]">{hw.purpose}</span>
                            </span>
                          )}
                          {hw.protectionMethod && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-surface-secondary/70 text-text-secondary border border-border/50">
                              <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-text-tertiary">{tx(locale, "prot", "보호", "保護")}</span>
                              <span className="truncate max-w-[140px]">{hw.protectionMethod}</span>
                            </span>
                          )}
                          {hw.commProtocols && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono bg-surface-secondary/70 text-text-secondary border border-border/50">
                              <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-text-tertiary font-sans">proto</span>
                              <span className="truncate max-w-[120px]">{hw.commProtocols}</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {hwSev.total > 0 && <div className="mt-0.5">{<CveBadge counts={hwSev} />}</div>}
                    {isExpanded ? <ChevronDown size={14} className="text-text-tertiary shrink-0 mt-0.5" /> : <ChevronRight size={14} className="text-text-tertiary shrink-0 mt-0.5" />}
                  </button>
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 pb-4 bg-surface-secondary/30">
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] pt-3">
                            <DetailRow label={tx(locale, "Manufacturer", "제조사", "製造元")} value={hw.manufacturer} />
                            <DetailRow label={tx(locale, "Model", "모델", "モデル")} value={hw.model} />
                            <DetailRow label="IP" value={hw.ipAddress} />
                            <DetailRow label="MAC" value={hw.macAddress} />
                            <DetailRow label={tx(locale, "Zone", "존", "ゾーン")} value={hw.zone} />
                            <DetailRow label={tx(locale, "Location", "위치", "場所")} value={hw.location} />
                            <DetailRow label={tx(locale, "Category", "카테고리", "カテゴリ")} value={hw.category} />
                            <DetailRow label={tx(locale, "Purpose", "용도", "用途")} value={hw.purpose} />
                          </dl>
                          {hw.software && hw.software.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-border">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-1.5">
                                {tx(locale, "Installed Software", "설치된 소프트웨어", "インストール済み")}
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {hw.software.map((s) => (
                                  <span key={s.id} className="px-2 py-0.5 rounded-md text-[10px] bg-white border border-border text-text-secondary">
                                    {s.name}{s.version && ` v${s.version}`}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}

            {/* SW rows */}
            {software.map((sw) => {
              const isExpanded = expandedSw === sw.id;
              const swCve = cveBySwId.get(sw.id);
              return (
                <div key={sw.id}>
                  <button
                    onClick={() => setExpandedSw(isExpanded ? null : sw.id)}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-surface-secondary/30 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Package size={12} className="text-text-tertiary" />
                        <p className="text-body-sm font-semibold text-text truncate">
                          {sw.name} {sw.version && <span className="text-body-xs font-normal text-text-tertiary font-mono">v{sw.version}</span>}
                        </p>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-surface-secondary text-text-tertiary">{sw.swType}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {sw.cpe ? (
                          <span className="cpe-chip" title={sw.cpe}>{sw.cpe}</span>
                        ) : (
                          <span className="cpe-chip cpe-chip--missing">{tx(locale, "no CPE", "CPE 없음", "CPEなし")}</span>
                        )}
                        {sw.hardware?.name && <span className="text-[10px] text-text-tertiary">· {sw.hardware.name}</span>}
                        {sw.vendor && <span className="text-[10px] text-text-tertiary">· {sw.vendor}</span>}
                      </div>
                    </div>
                    {swCve && swCve.total > 0 && <CveBadge counts={swCve} />}
                    {isExpanded ? <ChevronDown size={14} className="text-text-tertiary shrink-0" /> : <ChevronRight size={14} className="text-text-tertiary shrink-0" />}
                  </button>
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 pb-4 bg-surface-secondary/30">
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] pt-3">
                            <DetailRow label={tx(locale, "Vendor", "벤더", "ベンダー")} value={sw.vendor} />
                            <DetailRow label={tx(locale, "Version", "버전", "バージョン")} value={sw.version} />
                            <DetailRow label="CPE" value={sw.cpe} />
                            <DetailRow label={tx(locale, "Listening Port", "리스닝 포트", "リスニングポート")} value={sw.listeningPort} />
                            <DetailRow label={tx(locale, "Purpose", "용도", "用途")} value={sw.purpose} />
                            <DetailRow label={tx(locale, "Installed on", "설치 HW", "インストール先")} value={sw.hardware?.name} />
                          </dl>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
            {hardware.length === 0 && software.length === 0 && (
              <div className="py-6 text-center text-[12px] text-text-tertiary">
                {tx(locale, "No inventory registered", "등록된 자산 없음", "資産未登録")}
              </div>
            )}
          </div>
        </AccordionSection>

        {/* Assessment */}
        <AccordionSection
          id="assessment"
          num="02"
          title={tx(locale, `Security Assessment — ${assessPct}%`, `보안 평가 — ${assessPct}%`, `評価 — ${assessPct}%`)}
          icon={ClipboardCheck}
          open={openSections.has("assessment")}
          onToggle={() => toggleSection("assessment")}
          motionDelay={0.55}
        >
          {assessments.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-text-tertiary">
              {tx(locale, "No assessment data", "평가 데이터 없음", "評価データなし")}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {assessments.map((a) => {
                const r = RESULT_META[a.result] || RESULT_META.NOT_CHECKED;
                const Icon = r.icon;
                const isExpanded = expandedAssessment === a.id;
                const hasDetails = a.evidence || a.note;
                return (
                  <div key={a.id}>
                    <button
                      onClick={() => hasDetails && setExpandedAssessment(isExpanded ? null : a.id)}
                      disabled={!hasDetails}
                      className={cn("w-full flex items-center gap-3 px-5 py-3 text-left transition-colors",
                        hasDetails ? "hover:bg-surface-secondary/30 cursor-pointer" : "cursor-default")}
                    >
                      <Icon size={15} style={{ color: r.color }} className="shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono font-bold text-text-tertiary">{a.checkId}</span>
                          <span className="text-body-sm font-semibold text-text truncate">{a.hardware?.name || "—"}</span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0" style={{ backgroundColor: r.bg, color: r.color }}>
                        {r.label[locale as "en" | "ko" | "ja"] || r.label.en}
                      </span>
                      {hasDetails && (isExpanded ? <ChevronDown size={14} className="text-text-tertiary" /> : <ChevronRight size={14} className="text-text-tertiary" />)}
                    </button>
                    <AnimatePresence initial={false}>
                      {isExpanded && hasDetails && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                          <div className="px-5 pb-4 ml-7 space-y-2 bg-surface-secondary/30">
                            {a.evidence && (
                              <div className="pt-3">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-1">{tx(locale, "Evidence", "근거", "証拠")}</p>
                                <p className="text-body-xs text-text-secondary whitespace-pre-wrap">{a.evidence}</p>
                              </div>
                            )}
                            {a.note && (
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-1">{tx(locale, "Note", "비고", "備考")}</p>
                                <p className="text-body-xs text-text-secondary whitespace-pre-wrap">{a.note}</p>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </AccordionSection>

        {/* Risk */}
        <AccordionSection
          id="risk"
          num="03"
          title={tx(locale, `Risk — ${risks.length}`, `리스크 — ${risks.length}건`, `リスク — ${risks.length}件`)}
          icon={AlertTriangle}
          open={openSections.has("risk")}
          onToggle={() => toggleSection("risk")}
          motionDelay={0.6}
        >
          {risks.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-text-tertiary">
              {tx(locale, "No risks registered", "등록된 리스크 없음", "リスクなし")}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {[...risks].sort((a, b) => b.riskLevel - a.riskLevel).map((r) => {
                const level = r.riskLevel >= 20 ? "CRITICAL" : r.riskLevel >= 12 ? "HIGH" : r.riskLevel >= 6 ? "MEDIUM" : "LOW";
                const colors: Record<string, string> = { CRITICAL: "#DA1E28", HIGH: "#EB6200", MEDIUM: "#F1C21B", LOW: "#24A148" };
                const statusColors: Record<string, string> = { OPEN: "#DA1E28", MITIGATED: "#24A148", ACCEPTED: "#0F62FE", TRANSFERRED: "#8D8D8D" };
                return (
                  <div key={r.id} className="flex items-start gap-3 px-5 py-3">
                    <div className="h-9 w-9 rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{ background: colors[level] }}>
                      {r.riskLevel}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[12px] font-bold text-text">{r.threatId}</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: `${colors[level]}15`, color: colors[level] }}>{level}</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: `${statusColors[r.status] || "#8D8D8D"}15`, color: statusColors[r.status] || "#8D8D8D" }}>{r.status}</span>
                        {r.cveId && (
                          <a href={`https://nvd.nist.gov/vuln/detail/${r.cveId}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[9px] font-bold text-brand hover:underline">{r.cveId}</a>
                        )}
                      </div>
                      {r.assetRef && <p className="text-[11px] text-text-secondary mt-0.5 truncate">{r.assetRef}</p>}
                      <p className="text-[11px] text-text-tertiary mt-0.5">
                        L={r.likelihood} × I={r.impact}
                        {r.mitigation && ` · ${r.mitigation}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </AccordionSection>

        {/* Audit runs */}
        <AccordionSection
          id="audit"
          num="04"
          title={tx(locale, `Audit — ${auditedCount}/${hardware.length} · ${auditPct}%`, `감사 결과 — ${auditedCount}/${hardware.length} · ${auditPct}%`, `監査 — ${auditedCount}/${hardware.length} · ${auditPct}%`)}
          icon={Shield}
          open={openSections.has("audit")}
          onToggle={() => toggleSection("audit")}
          motionDelay={0.65}
        >
          <div className="p-4">
            <AuditRunsList
              auditRuns={auditRuns}
              hwCveMatches={hwCveMatches}
              hardware={hardware.map((h) => ({ id: h.id, name: h.name }))}
              locale={locale}
            />
          </div>
        </AccordionSection>

        {/* Documents */}
        <AccordionSection
          id="documents"
          num="05"
          title={tx(locale, `Documents — ${documents.length}`, `문서 — ${documents.length}`, `文書 — ${documents.length}`)}
          icon={FileText}
          open={openSections.has("documents")}
          onToggle={() => toggleSection("documents")}
          motionDelay={0.7}
        >
          {documents.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-text-tertiary">
              {tx(locale, "No documents generated yet", "생성된 문서 없음", "文書未生成")}
            </div>
          ) : (
            <DocumentStandardGroups documents={documents} locale={locale} projectId={projectId} onPreview={openPreview} />
          )}
        </AccordionSection>

        {/* Timeline — activity log (submissions + change events) */}
        {(submissions.length > 0 || changes.length > 0) && (
          <AccordionSection
            id="timeline"
            num="06"
            title={tx(
              locale,
              `Activity — ${submissions.length + changes.length}`,
              `활동 이력 — ${submissions.length + changes.length}`,
              `アクティビティ — ${submissions.length + changes.length}`
            )}
            icon={Clock}
            open={openSections.has("timeline")}
            onToggle={() => toggleSection("timeline")}
            motionDelay={0.75}
          >
            <ActivityTimeline submissions={submissions} changes={changes} locale={locale} />
          </AccordionSection>
        )}
      </div>

      {/* Document preview modal */}
      <AnimatePresence>
        {previewDoc && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={closePreview}>
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 10 }} transition={{ duration: 0.2 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-surface-secondary/50">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={16} className="text-text-tertiary shrink-0" />
                  <span className="text-[11px] font-mono font-bold text-text-tertiary">{previewDoc.docType}</span>
                  <h2 className="text-body-sm font-bold text-text truncate">{previewDoc.title}</h2>
                  <span className="px-1.5 py-0.5 rounded bg-white border border-border text-[9px] font-bold text-text-tertiary">v{previewDoc.version}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a href={`/api/projects/${projectId}/documents/${previewDoc.id}/download`} className="px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-brand hover:bg-brand-lighter transition-colors inline-flex items-center gap-1">
                    <Download size={12} /> {tx(locale, "Download", "다운로드", "ダウンロード")}
                  </a>
                  <button onClick={closePreview} className="p-1.5 rounded-md text-text-tertiary hover:text-text hover:bg-surface-secondary transition-colors" title={tx(locale, "Close", "닫기", "閉じる")}>
                    <IconX size={16} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto bg-surface-secondary/20">
                {previewLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-body-xs text-text-tertiary">{tx(locale, "Loading preview...", "미리보기 로딩 중...", "プレビュー読み込み中...")}</div>
                  </div>
                ) : previewHtml ? (
                  <div className="bg-white mx-auto my-6 shadow-sm border border-border max-w-[794px] p-10" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, children, index = 0 }: { icon: React.ElementType; label: string; children: React.ReactNode; index?: number }) {
  // Staggered fade-in — evokes a bridge console coming online
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.05 + index * 0.05, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <Card padding="none" className="relative overflow-hidden group">
        <div className="p-3.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Icon size={11} className="text-text-tertiary" strokeWidth={2.25} />
            {/* micro-caps label with letter-spacing — instrument panel readout */}
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-text-tertiary">{label}</p>
          </div>
          {children}
        </div>
      </Card>
    </motion.div>
  );
}

function AccordionSection({
  num, title, icon: Icon, open, onToggle, children, motionDelay = 0,
}: {
  id: Section;
  /** Monospace two-digit prefix (e.g. "01") — gives the list a bridge-console readout feel */
  num: string;
  title: string;
  icon: React.ElementType;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  motionDelay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: motionDelay, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <Card padding="none" className={cn("overflow-hidden transition-colors", open && "shadow-sm")}>
        <button
          onClick={onToggle}
          className={cn(
            "w-full flex items-center gap-3 px-4 py-3 text-left group/acc transition-colors",
            open ? "bg-surface-secondary/30" : "hover:bg-surface-secondary/20"
          )}
          aria-expanded={open}
        >
          {/* Monospace index — instrument readout numbering */}
          <span className="font-mono text-[10px] font-bold tabular-nums tracking-[0.05em] text-text-tertiary shrink-0 w-6">
            {num}
          </span>
          <Icon size={14} className={cn("shrink-0 transition-colors", open ? "text-brand" : "text-text-tertiary")} strokeWidth={2.25} />
          <span className={cn("flex-1 text-body-sm font-bold tracking-tight transition-colors", open ? "text-text" : "text-text")}>
            {title}
          </span>
          <ChevronDown size={14} className={cn("text-text-tertiary transition-transform duration-200", open && "rotate-180")} />
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
              className="overflow-hidden border-t border-border"
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <dt className="text-text-tertiary font-medium">{label}</dt>
      <dd className="text-text-secondary font-mono text-right truncate">{value || "—"}</dd>
    </>
  );
}

// ─── Equipment Identity Card ─────────────────────────────────────────────────

function EquipmentIdentityCard({ equipment, locale }: { equipment: Equipment; locale: string }) {
  const cat = equipment.securityCategory ? CAT_META[equipment.securityCategory] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.08, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <Card padding="none">
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4">
          {/* CAT classification badge — large, color-coded */}
          {cat ? (
            <div
              className="shrink-0 w-28 rounded-lg border px-3 py-2.5 flex flex-col justify-between"
              style={{ backgroundColor: cat.bg, borderColor: cat.border }}
            >
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: cat.color }}>
                  {tx(locale, "Category", "분류", "分類")}
                </p>
                <p className="text-[22px] font-extrabold mt-0.5 tracking-tight tabular-nums" style={{ color: cat.color }}>
                  {cat.label}
                </p>
              </div>
              <p className="text-[9px] leading-snug mt-1" style={{ color: cat.color, opacity: 0.85 }}>
                {cat.note[locale as "en" | "ko" | "ja"] || cat.note.en}
              </p>
            </div>
          ) : (
            <div className="shrink-0 w-28 rounded-lg border border-border bg-surface-secondary/60 px-3 py-2.5 flex flex-col justify-between">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-text-tertiary">{tx(locale, "Category", "분류", "分類")}</p>
                <p className="text-[14px] font-bold mt-0.5 text-text-tertiary">{tx(locale, "Unclassified", "미분류", "未分類")}</p>
              </div>
              <p className="text-[9px] text-text-tertiary">{tx(locale, "No CAT level set", "보안 분류 미지정", "分類未指定")}</p>
            </div>
          )}

          {/* Description + meta */}
          <div className="flex-1 min-w-0 flex flex-col">
            {equipment.description ? (
              <p className="text-body-sm text-text leading-relaxed">{equipment.description}</p>
            ) : (
              <p className="text-body-sm text-text-tertiary italic">
                {tx(locale, "No system description provided by vendor", "벤더의 시스템 설명 없음", "ベンダー説明なし")}
              </p>
            )}

            <dl className="mt-3 pt-3 border-t border-border/60 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-[11px]">
              <IdentityField label={tx(locale, "Manufacturer", "제조사", "製造元")} value={equipment.manufacturerName} />
              <IdentityField label={tx(locale, "Model", "모델", "モデル")} value={equipment.productModelName} />
              <div>
                <dt className="text-[9px] font-bold uppercase tracking-[0.1em] text-text-tertiary">{tx(locale, "Type approval", "타입 승인", "型式承認")}</dt>
                <dd className="mt-0.5">
                  {equipment.isTypeApproved ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-safety-low">
                      <CheckCircle size={11} strokeWidth={2.5} />
                      {tx(locale, "Certified", "인증됨", "認証済")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-safety-elevated">
                      <AlertCircle size={11} strokeWidth={2.5} />
                      {tx(locale, "Not certified", "미인증", "未認証")}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[9px] font-bold uppercase tracking-[0.1em] text-text-tertiary">{tx(locale, "Last updated", "최근 업데이트", "最終更新")}</dt>
                <dd className="mt-0.5 text-[11px] font-mono tabular-nums text-text-secondary">{relativeTime(equipment.updatedAt, locale)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function IdentityField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[9px] font-bold uppercase tracking-[0.1em] text-text-tertiary">{label}</dt>
      <dd className="mt-0.5 text-[11px] font-mono text-text-secondary truncate">{value || <span className="text-text-tertiary italic font-sans">—</span>}</dd>
    </div>
  );
}

// ─── Top Risks Strip ────────────────────────────────────────────────────────

function TopRisksStrip({ risks, locale }: { risks: Risk[]; locale: string }) {
  // Only surface OPEN risks with score >= 12 (High+). Cap at 3 — anything more
  // belongs inside the Risk accordion so the top strip stays scannable.
  const top = [...risks]
    .filter((r) => r.status === "OPEN" && r.riskLevel >= 12)
    .sort((a, b) => b.riskLevel - a.riskLevel)
    .slice(0, 3);
  if (top.length === 0) return null;
  const colors: Record<string, string> = { CRITICAL: "#DA1E28", HIGH: "#EB6200", MEDIUM: "#F1C21B", LOW: "#24A148" };
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <Card padding="none">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 bg-gradient-to-r from-risk-bg/50 to-transparent">
          <AlertTriangle size={12} className="text-safety-high" strokeWidth={2.5} />
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-safety-high">
            {tx(locale, "Top open risks", "최우선 리스크", "最優先リスク")}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-text-tertiary">[{String(top.length).padStart(2, "0")}]</span>
        </div>
        <ul className="divide-y divide-border/60">
          {top.map((r) => {
            const level = r.riskLevel >= 20 ? "CRITICAL" : r.riskLevel >= 12 ? "HIGH" : "MEDIUM";
            return (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                {/* Score pill — huge, instantly readable */}
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0 font-mono text-[13px] font-extrabold text-white tabular-nums"
                  style={{ background: colors[level] }}
                >
                  {r.riskLevel}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] font-bold text-text font-mono">{r.threatId}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[0.06em]" style={{ background: `${colors[level]}15`, color: colors[level] }}>{level}</span>
                    {r.cveId && (
                      <a
                        href={`https://nvd.nist.gov/vuln/detail/${r.cveId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[10px] font-bold text-brand hover:underline"
                      >
                        {r.cveId}
                      </a>
                    )}
                    <span className="font-mono text-[9px] text-text-tertiary tracking-tight">L {r.likelihood} × I {r.impact}</span>
                  </div>
                  {r.assetRef && <p className="text-[11px] text-text-secondary mt-0.5 truncate">{r.assetRef}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </motion.div>
  );
}

// ─── Documents grouped by standard ──────────────────────────────────────────

function DocumentStandardGroups({
  documents, locale, projectId, onPreview,
}: {
  documents: Doc[]; locale: string; projectId: string; onPreview: (d: Doc) => void;
}) {
  // Group by standard prefix; preserve vendor authoring order within each bucket
  const STANDARD_ORDER = ["E27", "E26", "IEC", "NIST", "ISO"];
  const groups = new Map<string, Doc[]>();
  for (const d of documents) {
    const key = STANDARD_ORDER.find((s) => d.standard?.startsWith(s)) || d.standard || "—";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => {
    const ia = STANDARD_ORDER.indexOf(a); const ib = STANDARD_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return (
    <div className="divide-y divide-border">
      {ordered.map(([std, docs]) => (
        <section key={std}>
          <div className="px-5 py-2 bg-surface-secondary/40 flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold tracking-[0.08em] text-text-secondary uppercase">{std}</span>
            <span className="font-mono text-[10px] tabular-nums text-text-tertiary">[{String(docs.length).padStart(2, "0")}]</span>
          </div>
          <div className="divide-y divide-border/60">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-secondary/30 transition-colors">
                <FileText size={14} className="text-text-tertiary shrink-0" />
                <button onClick={() => onPreview(d)} className="flex-1 min-w-0 text-left group">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono font-bold text-text-tertiary tracking-tight">{d.docType}</span>
                    <span className="text-body-sm font-semibold text-text truncate group-hover:text-brand transition-colors">{d.title}</span>
                    <span className="px-1.5 py-0.5 rounded bg-surface-secondary text-[9px] font-bold text-text-tertiary tabular-nums">v{d.version}</span>
                  </div>
                  <p className="text-[10px] text-text-tertiary mt-0.5 font-mono">
                    {d.status}
                    {d.generatedAt && <><span className="opacity-50 mx-1.5">·</span>{new Date(d.generatedAt).toLocaleDateString(locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US")}</>}
                  </p>
                </button>
                <button onClick={() => onPreview(d)} className="p-1.5 rounded-md text-text-tertiary hover:text-brand hover:bg-brand-lighter transition-colors shrink-0" title={tx(locale, "Preview", "미리보기", "プレビュー")}>
                  <Eye size={14} />
                </button>
                <a href={`/api/projects/${projectId}/documents/${d.id}/download`} className="p-1.5 rounded-md text-text-tertiary hover:text-brand hover:bg-brand-lighter transition-colors shrink-0" title={tx(locale, "Download", "다운로드", "ダウンロード")}>
                  <Download size={14} />
                </a>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ─── Activity Timeline ──────────────────────────────────────────────────────

function ActivityTimeline({
  submissions, changes, locale,
}: {
  submissions: SubmissionEvent[]; changes: ChangeEventItem[]; locale: string;
}) {
  // Interleave and sort by date descending
  type Entry = { kind: "submission"; at: string; label: string; meta: string; icon: React.ElementType; color: string }
              | { kind: "change";     at: string; label: string; meta: string; icon: React.ElementType; color: string };
  const entries: Entry[] = [];

  for (const s of submissions) {
    const subStatus = s.status || s.phase;
    const color =
      subStatus === "APPROVED" ? "#24A148" :
      subStatus === "SUBMITTED" || subStatus === "UNDER_REVIEW" ? "#EB6200" :
      subStatus === "REVISION_REQUESTED" ? "#DA1E28" :
      "#0F62FE";
    const at = s.submittedAt || s.updatedAt || s.createdAt;
    entries.push({
      kind: "submission",
      at,
      label: `${s.phase} · ${s.status}`,
      meta: s.reviewNote || s.notes || "",
      icon: s.status === "APPROVED" ? CheckCircle : s.status === "REVISION_REQUESTED" ? XCircle : Clock,
      color,
    });
  }
  for (const c of changes) {
    entries.push({
      kind: "change",
      at: c.createdAt,
      label: c.subject,
      meta: [c.kind, c.actor].filter(Boolean).join(" · "),
      icon: c.resolvedAt ? CheckCircle : AlertCircle,
      color: c.resolvedAt ? "#24A148" : "#EB6200",
    });
  }
  entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (entries.length === 0) return null;

  return (
    <ol className="relative pl-5">
      {/* Vertical rail */}
      <span aria-hidden className="absolute left-1.5 top-3 bottom-3 w-px bg-border" />
      {entries.map((e, i) => {
        const Icon = e.icon;
        return (
          <li key={i} className="relative py-2.5 pr-4">
            {/* Node dot */}
            <span
              aria-hidden
              className="absolute -left-[11.5px] top-3 h-2.5 w-2.5 rounded-full ring-2 ring-white"
              style={{ background: e.color }}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Icon size={11} style={{ color: e.color }} strokeWidth={2.5} />
              <span className="text-[11px] font-bold text-text">{e.label}</span>
              <span className="ml-auto font-mono text-[10px] tabular-nums text-text-tertiary">{relativeTime(e.at, locale)}</span>
            </div>
            {e.meta && <p className="text-[10px] text-text-tertiary mt-0.5 line-clamp-2">{e.meta}</p>}
          </li>
        );
      })}
    </ol>
  );
}
