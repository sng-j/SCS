"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { X as IconX, Download } from "lucide-react";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";

interface Equipment {
  id: string; name: string; status: string;
  vendor: { id: string; name: string; company: string | null } | null;
  _count: { hardware: number; software: number };
  dfdDiagram: { id: string } | null;
  certificationInfo?: string;
}
interface Hardware {
  id: string; name: string; type: string; manufacturer: string | null; model: string | null;
  ipAddress: string | null; macAddress?: string | null; zone: string | null;
  location?: string | null; purpose?: string | null; category?: string | null;
  software?: { id: string; name: string; version: string | null }[];
  _count?: { cveMatches: number };
}
interface Software {
  id: string; name: string; version: string | null; vendor: string | null; swType: string;
  cpe?: string | null; listeningPort?: string | null; purpose?: string | null;
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

const TABS = ["summary", "inventory", "assessment", "documents"] as const;
type Tab = typeof TABS[number];

const RESULT_META: Record<string, { glyph: string; signal: string; en: string; ko: string; ja: string }> = {
  PASS:           { glyph: "●", signal: "c-good", en: "Pass",        ko: "합격",     ja: "合格" },
  FAIL:           { glyph: "×", signal: "c-poor", en: "Fail",        ko: "불합격",   ja: "不合格" },
  PARTIAL:        { glyph: "◐", signal: "c-fair", en: "Partial",     ko: "일부",     ja: "一部" },
  NOT_APPLICABLE: { glyph: "—", signal: "c-idle", en: "N/A",         ko: "해당없음",  ja: "N/A" },
  NOT_CHECKED:    { glyph: "○", signal: "c-idle", en: "Unchecked",   ko: "미점검",   ja: "未点検" },
};

const STATUS_META: Record<string, { glyph: string; signal: string; en: string; ko: string; ja: string }> = {
  APPROVED:           { glyph: "●", signal: "c-good", en: "Approved", ko: "승인됨",   ja: "承認済み" },
  SUBMITTED:          { glyph: "◐", signal: "c-fair", en: "Submitted",ko: "제출됨",   ja: "提出済み" },
  IN_PROGRESS:        { glyph: "◐", signal: "c-fair", en: "In progress",ko: "진행 중",ja: "進行中" },
  REVISION_REQUESTED: { glyph: "×", signal: "c-poor", en: "Revision", ko: "수정 요청",ja: "修正依頼" },
  PENDING:            { glyph: "○", signal: "c-idle", en: "Pending",  ko: "대기",     ja: "保留中" },
};

function pad(n: number, w = 2) { return n.toString().padStart(w, "0"); }
function signalClass(pct: number) {
  if (pct >= 80) return "c-good";
  if (pct >= 50) return "c-fair";
  if (pct >= 20) return "c-idle";
  return "c-poor";
}

export default function ViewerEquipmentPage() {
  const { projectId, equipmentId } = useParams<{ projectId: string; equipmentId: string }>();
  const { locale } = useLocaleStore();
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [project, setProject] = useState<{ vesselName: string } | null>(null);
  const [hardware, setHardware] = useState<Hardware[]>([]);
  const [software, setSoftware] = useState<Software[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [loading, setLoading] = useState(true);
  const [expandedAssessment, setExpandedAssessment] = useState<string | null>(null);
  const [expandedHw, setExpandedHw] = useState<string | null>(null);
  const [expandedSw, setExpandedSw] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<Doc | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const openPreview = async (d: Doc) => {
    setPreviewDoc(d); setPreviewHtml(null); setPreviewLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/documents/${d.id}/preview`);
      if (res.ok) setPreviewHtml(await res.text());
      else setPreviewHtml(`<div style="padding:2rem;color:#8B8578;font-family:IBM Plex Mono,monospace;font-size:11px">preview failed (${res.status})</div>`);
    } catch {
      setPreviewHtml(`<div style="padding:2rem;color:#8B8578;font-family:IBM Plex Mono,monospace;font-size:11px">preview error</div>`);
    } finally { setPreviewLoading(false); }
  };
  const closePreview = () => { setPreviewDoc(null); setPreviewHtml(null); };

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}`).then(async (r) => r.ok ? r.json() : null),
      fetch(`/api/projects/${projectId}/equipment`).then(async (r) => r.ok ? r.json() : []),
      fetch(`/api/projects/${projectId}/hardware?equipmentId=${equipmentId}`).then(async (r) => r.ok ? r.json() : []),
      fetch(`/api/projects/${projectId}/software?equipmentId=${equipmentId}`).then(async (r) => r.ok ? r.json() : []),
      fetch(`/api/projects/${projectId}/assessments?equipmentId=${equipmentId}`).then(async (r) => r.ok ? r.json() : []),
      fetch(`/api/projects/${projectId}/documents?equipmentId=${equipmentId}`).then(async (r) => r.ok ? r.json() : []),
    ]).then(([p, eqs, hw, sw, as, docs]) => {
      setProject(p);
      const list = Array.isArray(eqs) ? eqs : [];
      setEquipment(list.find((e: Equipment) => e.id === equipmentId) || null);
      setHardware(Array.isArray(hw) ? hw : []);
      setSoftware(Array.isArray(sw) ? sw : []);
      setAssessments(Array.isArray(as) ? as : []);
      setDocuments(Array.isArray(docs) ? docs : []);
    }).finally(() => setLoading(false));
  }, [projectId, equipmentId]);

  if (loading) {
    return (
      <div className="max-w-[1180px] mx-auto px-8 py-10">
        <div className="masthead"><span>loading · · ·</span><span /></div>
      </div>
    );
  }
  if (!equipment) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-24 text-center">
        <div className="label mb-2">{tx(locale, "Not found", "찾을 수 없음", "見つかりません")}</div>
        <h1 className="display text-[48px]">404</h1>
        <Link href={`/viewer/${projectId}`} className="back-link mt-8">← {tx(locale, "back to vessel", "선박으로 돌아가기", "船舶に戻る")}</Link>
      </div>
    );
  }

  const assessPass = assessments.filter((a) => a.result === "PASS").length;
  const assessFail = assessments.filter((a) => a.result === "FAIL" || a.result === "PARTIAL").length;
  const assessNA = assessments.filter((a) => a.result === "NOT_APPLICABLE").length;
  const assessUnchecked = assessments.filter((a) => a.result === "NOT_CHECKED").length;
  const judged = assessPass + assessFail;
  const assessPct = judged > 0 ? Math.round((assessPass / judged) * 100) : 0;

  const tabs: Record<Tab, { en: string; ko: string; ja: string }> = {
    summary:    { en: "Summary",    ko: "요약",        ja: "サマリー" },
    inventory:  { en: "Inventory",  ko: "인벤토리",     ja: "インベントリ" },
    assessment: { en: "Assessment", ko: "평가",        ja: "評価" },
    documents:  { en: "Documents",  ko: "문서",        ja: "文書" },
  };

  const st = STATUS_META[equipment.status] || STATUS_META.PENDING;

  return (
    <div className="max-w-[1180px] mx-auto px-8 py-10">
      {/* Masthead */}
      <div className="masthead reveal">
        <div className="flex items-center gap-6">
          <Link href="/viewer" className="c-ink hover:c-copper transition-colors">Admiralty Log</Link>
          <span className="c-ink-mute">/</span>
          <Link href={`/viewer/${projectId}`} className="c-ink-soft hover:c-copper transition-colors">{project?.vesselName || "…"}</Link>
          <span className="c-ink-mute">/</span>
          <span className="c-copper">{equipment.name}</span>
        </div>
        <span className="seal">
          <span style={{ width: 4, height: 4, background: "var(--copper)", display: "inline-block" }} />
          Viewer
        </span>
      </div>

      <Link href={`/viewer/${projectId}`} className="back-link mt-6 inline-flex">
        ← {project?.vesselName || tx(locale, "vessel", "선박", "船舶")}
      </Link>

      {/* Hero */}
      <section className="grid grid-cols-12 gap-10 mt-10 mb-12 reveal reveal-delay-1">
        <div className="col-span-12 md:col-span-8">
          <div className="kicker mb-3">§ Equipment dossier</div>
          <h1 className="display text-[64px] md:text-[80px] c-ink leading-[0.96]">
            {equipment.name}
          </h1>
          <p className="mt-6 mono text-[11px] c-ink-soft uppercase tracking-[0.18em]">
            {equipment.vendor?.company || equipment.vendor?.name || tx(locale, "— no vendor of record —", "— 벤더 미배정 —", "— ベンダーなし —")}
          </p>
        </div>
        <div className="col-span-12 md:col-span-4 md:text-right">
          <div className="label mb-2">{tx(locale, "Filing status", "제출 상태", "提出状態")}</div>
          <div className="flex items-baseline md:justify-end gap-3">
            <span className={`${st.signal} text-[42px] leading-none`}>{st.glyph}</span>
            <span className={`display text-[28px] ${st.signal}`}>
              {st[locale as "en"|"ko"|"ja"] || st.en}
            </span>
          </div>
          <div className="mono text-[10px] c-ink-mute uppercase tracking-[0.22em] mt-3">
            HW {equipment._count.hardware} · SW {equipment._count.software} · DFD {equipment.dfdDiagram ? "set" : "—"}
          </div>
        </div>
      </section>

      {/* Tab bar */}
      <div className="tab-bar reveal reveal-delay-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            data-active={activeTab === tab}
            className="tab"
            onClick={() => setActiveTab(tab)}
          >
            {tabs[tab][locale as "en"|"ko"|"ja"] || tabs[tab].en}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mt-8 reveal reveal-delay-3">

        {/* ── SUMMARY ── */}
        {activeTab === "summary" && (
          <div className="grid grid-cols-12 gap-0 border-y border-[color:var(--ink)] divide-x divide-[color:var(--line)]">
            <KpiCell
              label={tx(locale, "Inventory", "인벤토리", "資産")}
              value={`${hardware.length}`}
              unit={tx(locale, "HW", "HW", "HW")}
              tail={`${software.length} ${tx(locale, "SW", "SW", "SW")}`}
            />
            <KpiCell
              label={tx(locale, "Assessment", "평가", "評価")}
              value={`${assessPct}`}
              unit="%"
              tail={`✓ ${assessPass} · ✗ ${assessFail} · − ${assessNA}`}
              signalOn={assessPct}
            />
            <KpiCell
              label={tx(locale, "Documents", "문서", "文書")}
              value={`${documents.length}`}
              unit=""
              tail={tx(locale, "issued", "발행", "発行済み")}
            />
            <KpiCell
              label={tx(locale, "Data flow", "DFD", "DFD")}
              value={equipment.dfdDiagram ? "●" : "○"}
              unit=""
              tail={equipment.dfdDiagram ? tx(locale, "defined", "정의됨", "定義済み") : tx(locale, "not defined", "미정의", "未定義")}
              signalClassOverride={equipment.dfdDiagram ? "c-good" : "c-idle"}
            />
            {assessUnchecked > 0 && (
              <div className="col-span-12 px-6 py-3 bg-[color:var(--paper-edge)] border-t border-[color:var(--line)] mono text-[10px] uppercase tracking-[0.2em] c-ink-soft">
                {tx(locale, `${assessUnchecked} checks still unchecked`, `${assessUnchecked}개 항목 미점검`, `${assessUnchecked}件未点検`)}
              </div>
            )}
          </div>
        )}

        {/* ── INVENTORY ── */}
        {activeTab === "inventory" && (
          <div className="space-y-10">
            {/* Hardware section */}
            <div>
              <div className="flex items-baseline gap-4 mb-4">
                <span className="kicker">§ Hardware</span>
                <hr className="rule flex-1" />
                <span className="mono text-[10px] c-ink-mute uppercase tracking-[0.2em]">{pad(hardware.length)}</span>
              </div>
              {hardware.length === 0 ? (
                <p className="display-italic c-ink-soft text-[18px] py-6">{tx(locale, "No hardware on file.", "하드웨어 기록 없음.", "ハードウェアなし。")}</p>
              ) : (
                <div className="border-y border-[color:var(--ink)]">
                  {hardware.map((hw, i) => {
                    const open = expandedHw === hw.id;
                    return (
                      <div key={hw.id} className="border-b border-[color:var(--line)] last:border-b-0">
                        <button
                          onClick={() => setExpandedHw(open ? null : hw.id)}
                          className="w-full grid grid-cols-12 gap-4 items-center px-4 py-4 text-left hover:bg-[color:var(--paper-edge)] transition-colors"
                        >
                          <span className="col-span-1 mono text-[11px] c-ink-mute tabular-nums">{pad(i + 1)}</span>
                          <span className="col-span-5 flex items-baseline gap-2">
                            <span className="display text-[18px] c-ink">{hw.name}</span>
                            {hw.category && <span className="mono text-[9px] c-ink-mute uppercase tracking-[0.16em]">{hw.category}</span>}
                          </span>
                          <span className="col-span-3 mono text-[11px] c-ink-soft truncate">
                            {[hw.manufacturer, hw.model].filter(Boolean).join(" ") || "—"}
                          </span>
                          <span className="col-span-2 mono text-[11px] c-ink-soft">{hw.ipAddress || <span className="c-ink-mute">—</span>}</span>
                          <span className="col-span-1 text-right">
                            {(hw._count?.cveMatches ?? 0) > 0
                              ? <span className="mono text-[10px] c-poor font-semibold">{hw._count?.cveMatches} CVE</span>
                              : <span className="mono text-[9px] c-ink-mute uppercase tracking-[0.2em]">{open ? "−" : "+"}</span>}
                          </span>
                        </button>
                        <AnimatePresence initial={false}>
                          {open && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                              className="overflow-hidden bg-[color:var(--paper-edge)]"
                            >
                              <div className="px-6 py-5 grid grid-cols-12 gap-8">
                                <dl className="datasheet col-span-12 md:col-span-7">
                                  <dt>{tx(locale, "Type", "유형", "種別")}</dt><dd>{hw.type}</dd>
                                  <dt>{tx(locale, "Manufacturer", "제조사", "製造元")}</dt><dd>{hw.manufacturer || "—"}</dd>
                                  <dt>{tx(locale, "Model", "모델", "モデル")}</dt><dd>{hw.model || "—"}</dd>
                                  <dt>IP</dt><dd>{hw.ipAddress || "—"}</dd>
                                  <dt>MAC</dt><dd>{hw.macAddress || "—"}</dd>
                                  <dt>{tx(locale, "Zone", "존", "ゾーン")}</dt><dd>{hw.zone || "—"}</dd>
                                  <dt>{tx(locale, "Location", "위치", "場所")}</dt><dd>{hw.location || "—"}</dd>
                                  <dt>{tx(locale, "Purpose", "용도", "用途")}</dt><dd>{hw.purpose || "—"}</dd>
                                </dl>
                                {hw.software && hw.software.length > 0 && (
                                  <div className="col-span-12 md:col-span-5">
                                    <div className="label mb-2">{tx(locale, "Installed software", "설치된 소프트웨어", "導入済みソフトウェア")}</div>
                                    <ul className="space-y-1">
                                      {hw.software.map((s) => (
                                        <li key={s.id} className="mono text-[11px] c-ink-soft flex items-baseline gap-2">
                                          <span className="c-ink-mute">→</span>
                                          <span className="c-ink">{s.name}</span>
                                          {s.version && <span className="c-ink-mute">v{s.version}</span>}
                                        </li>
                                      ))}
                                    </ul>
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
            </div>

            {/* Software section */}
            <div>
              <div className="flex items-baseline gap-4 mb-4">
                <span className="kicker">§ Software</span>
                <hr className="rule flex-1" />
                <span className="mono text-[10px] c-ink-mute uppercase tracking-[0.2em]">{pad(software.length)}</span>
              </div>
              {software.length === 0 ? (
                <p className="display-italic c-ink-soft text-[18px] py-6">{tx(locale, "No software on file.", "소프트웨어 기록 없음.", "ソフトウェアなし。")}</p>
              ) : (
                <div className="border-y border-[color:var(--ink)]">
                  {software.map((sw, i) => {
                    const open = expandedSw === sw.id;
                    return (
                      <div key={sw.id} className="border-b border-[color:var(--line)] last:border-b-0">
                        <button
                          onClick={() => setExpandedSw(open ? null : sw.id)}
                          className="w-full grid grid-cols-12 gap-4 items-center px-4 py-4 text-left hover:bg-[color:var(--paper-edge)] transition-colors"
                        >
                          <span className="col-span-1 mono text-[11px] c-ink-mute tabular-nums">{pad(i + 1)}</span>
                          <span className="col-span-5 flex items-baseline gap-2">
                            <span className="display text-[18px] c-ink">{sw.name}</span>
                            {sw.version && <span className="mono text-[10px] c-ink-mute">v{sw.version}</span>}
                          </span>
                          <span className="col-span-3 mono text-[11px] c-ink-soft truncate">{sw.vendor || "—"}</span>
                          <span className="col-span-2 mono text-[10px] c-ink-soft uppercase tracking-[0.14em]">{sw.swType}</span>
                          <span className="col-span-1 text-right">
                            {(sw._count?.cveMatches ?? 0) > 0
                              ? <span className="mono text-[10px] c-poor font-semibold">{sw._count?.cveMatches} CVE</span>
                              : <span className="mono text-[9px] c-ink-mute uppercase tracking-[0.2em]">{open ? "−" : "+"}</span>}
                          </span>
                        </button>
                        <AnimatePresence initial={false}>
                          {open && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                              className="overflow-hidden bg-[color:var(--paper-edge)]"
                            >
                              <div className="px-6 py-5">
                                <dl className="datasheet max-w-2xl">
                                  <dt>{tx(locale, "Type", "유형", "種別")}</dt><dd>{sw.swType}</dd>
                                  <dt>{tx(locale, "Version", "버전", "バージョン")}</dt><dd>{sw.version || "—"}</dd>
                                  <dt>{tx(locale, "Vendor", "벤더", "ベンダー")}</dt><dd>{sw.vendor || "—"}</dd>
                                  <dt>CPE</dt><dd className="break-all">{sw.cpe || "—"}</dd>
                                  <dt>{tx(locale, "Port", "포트", "ポート")}</dt><dd>{sw.listeningPort || "—"}</dd>
                                  <dt>{tx(locale, "Purpose", "용도", "用途")}</dt><dd>{sw.purpose || "—"}</dd>
                                  <dt>{tx(locale, "Host", "설치 장비", "ホスト")}</dt><dd>{sw.hardware?.name || "—"}</dd>
                                  <dt>CVE</dt><dd>{sw._count?.cveMatches ?? 0}</dd>
                                </dl>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ASSESSMENT ── */}
        {activeTab === "assessment" && (
          <div>
            <div className="flex items-baseline gap-4 mb-4">
              <span className="kicker">§ Security Configuration Audit</span>
              <hr className="rule flex-1" />
              <span className="mono text-[10px] c-ink-mute uppercase tracking-[0.2em]">{pad(assessments.length)} items</span>
            </div>
            {assessments.length === 0 ? (
              <p className="display-italic c-ink-soft text-[18px] py-6">{tx(locale, "No checks recorded yet.", "기록된 점검 항목이 없습니다.", "記録された点検項目がありません。")}</p>
            ) : (
              <div className="border-y border-[color:var(--ink)]">
                {assessments.map((a) => {
                  const r = RESULT_META[a.result] || RESULT_META.NOT_CHECKED;
                  const open = expandedAssessment === a.id;
                  const hasDetails = a.evidence || a.note;
                  return (
                    <div key={a.id} className="border-b border-[color:var(--line)] last:border-b-0">
                      <button
                        onClick={() => hasDetails && setExpandedAssessment(open ? null : a.id)}
                        disabled={!hasDetails}
                        className="w-full grid grid-cols-12 gap-4 items-center px-4 py-4 text-left hover:bg-[color:var(--paper-edge)] disabled:hover:bg-transparent transition-colors"
                      >
                        <span className="col-span-2 mono text-[13px] font-semibold c-ink tabular-nums">{a.checkId}</span>
                        <span className="col-span-7 mono text-[11px] c-ink-soft truncate">{a.hardware?.name || "—"}</span>
                        <span className="col-span-2 flex items-center gap-2">
                          <span className={`${r.signal} text-[14px] leading-none`}>{r.glyph}</span>
                          <span className={`mono text-[10px] uppercase tracking-[0.18em] ${r.signal}`}>
                            {r[locale as "en"|"ko"|"ja"] || r.en}
                          </span>
                        </span>
                        <span className="col-span-1 text-right mono text-[10px] c-ink-mute uppercase tracking-[0.2em]">
                          {hasDetails ? (open ? "close" : "open") : ""}
                        </span>
                      </button>
                      <AnimatePresence initial={false}>
                        {open && hasDetails && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden bg-[color:var(--paper-edge)]"
                          >
                            <div className="px-6 py-5 grid grid-cols-12 gap-8">
                              {a.evidence && (
                                <div className="col-span-12 md:col-span-6">
                                  <div className="label mb-2">{tx(locale, "Evidence", "근거", "証拠")}</div>
                                  <p className="text-[13px] c-ink-soft leading-[1.65] whitespace-pre-wrap">{a.evidence}</p>
                                </div>
                              )}
                              {a.note && (
                                <div className="col-span-12 md:col-span-6">
                                  <div className="label mb-2">{tx(locale, "Note", "비고", "備考")}</div>
                                  <p className="text-[13px] c-ink-soft leading-[1.65] whitespace-pre-wrap display-italic">{a.note}</p>
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
          </div>
        )}

        {/* ── DOCUMENTS ── */}
        {activeTab === "documents" && (
          <div>
            <div className="flex items-baseline gap-4 mb-4">
              <span className="kicker">§ Document vault</span>
              <hr className="rule flex-1" />
              <span className="mono text-[10px] c-ink-mute uppercase tracking-[0.2em]">{pad(documents.length)} issued</span>
            </div>
            {documents.length === 0 ? (
              <p className="display-italic c-ink-soft text-[18px] py-6">{tx(locale, "No documents in the vault.", "보관된 문서가 없습니다.", "保管された文書がありません。")}</p>
            ) : (
              <div className="border-y border-[color:var(--ink)]">
                {documents.map((d) => (
                  <div key={d.id} className="group grid grid-cols-12 gap-4 items-center px-4 py-4 border-b border-[color:var(--line)] last:border-b-0 hover:bg-[color:var(--paper-edge)] transition-colors">
                    <button onClick={() => openPreview(d)} className="col-span-10 text-left">
                      <div className="flex items-baseline gap-3">
                        <span className="mono text-[11px] c-ink-mute tabular-nums">{d.docType}</span>
                        <span className="display text-[17px] c-ink group-hover:c-copper transition-colors">{d.title}</span>
                        <span className="mono text-[9px] c-ink-mute uppercase tracking-[0.2em]">v{d.version}</span>
                      </div>
                      <div className="mono text-[10px] c-ink-mute uppercase tracking-[0.18em] mt-1">
                        {d.standard} · {d.status}
                        {d.generatedAt && ` · ${new Date(d.generatedAt).toLocaleDateString(tx(locale, "en-US", "ko-KR", "ja-JP"))}`}
                      </div>
                    </button>
                    <div className="col-span-2 flex items-center justify-end gap-2">
                      <button onClick={() => openPreview(d)} className="px-2.5 py-1 mono text-[10px] uppercase tracking-[0.2em] c-ink-soft hover:c-copper transition-colors">
                        {tx(locale, "read", "읽기", "閲覧")}
                      </button>
                      <span className="c-ink-mute">·</span>
                      <a
                        href={`/api/projects/${projectId}/documents/${d.id}/download`}
                        className="px-2.5 py-1 mono text-[10px] uppercase tracking-[0.2em] c-ink-soft hover:c-copper transition-colors inline-flex items-center gap-1"
                      >
                        <Download size={10} /> {tx(locale, "dl", "저장", "DL")}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="mt-24 pt-6 border-t border-[color:var(--ink)] flex items-center justify-between text-[10px] mono uppercase tracking-[0.22em] c-ink-mute">
        <span>— dossier · {equipment.name} —</span>
        <span>Read-only record</span>
      </footer>

      {/* Document preview modal — "document vault" */}
      <AnimatePresence>
        {previewDoc && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(13, 27, 42, 0.55)", backdropFilter: "blur(3px)" }}
            onClick={closePreview}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="bg-[color:var(--paper)] w-full max-w-4xl h-[88vh] flex flex-col border border-[color:var(--ink)]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal masthead */}
              <div className="flex items-center justify-between gap-4 px-6 py-3 border-b border-[color:var(--ink)]">
                <div className="flex items-baseline gap-3 min-w-0">
                  <span className="mono text-[10px] uppercase tracking-[0.24em] c-ink-mute">{previewDoc.docType}</span>
                  <span className="display text-[17px] c-ink truncate">{previewDoc.title}</span>
                  <span className="mono text-[9px] c-ink-mute uppercase tracking-[0.2em]">v{previewDoc.version}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <a
                    href={`/api/projects/${projectId}/documents/${previewDoc.id}/download`}
                    className="mono text-[10px] uppercase tracking-[0.22em] c-ink-soft hover:c-copper transition-colors inline-flex items-center gap-1.5"
                  >
                    <Download size={12} /> {tx(locale, "Download", "다운로드", "ダウンロード")}
                  </a>
                  <button onClick={closePreview} className="p-1 c-ink-mute hover:c-ink transition-colors" aria-label="close">
                    <IconX size={14} />
                  </button>
                </div>
              </div>
              {/* Document sheet */}
              <div className="flex-1 overflow-auto" style={{ background: "var(--paper-edge)" }}>
                {previewLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <span className="mono text-[11px] uppercase tracking-[0.24em] c-ink-mute">{tx(locale, "rendering · · ·", "렌더링 중 · · ·", "レンダリング中 · · ·")}</span>
                  </div>
                ) : previewHtml ? (
                  <div
                    className="bg-white mx-auto my-8 shadow-sm border border-[color:var(--line-strong)] max-w-[794px] p-12"
                    style={{ color: "#111" }}
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── KPI cell (Summary tab) ─────────────────────────────────────────
function KpiCell({ label, value, unit, tail, signalOn, signalClassOverride }: {
  label: string; value: string; unit: string; tail?: string;
  signalOn?: number; signalClassOverride?: string;
}) {
  const cls = signalClassOverride ?? (signalOn !== undefined ? signalClass(signalOn) : "c-ink");
  return (
    <div className="col-span-6 md:col-span-3 px-6 py-8">
      <div className="label mb-3">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className={`numeral text-[72px] leading-none ${cls}`}>{value}</span>
        {unit && <span className="numeral text-[22px] c-ink-mute">{unit}</span>}
      </div>
      {tail && <div className="mono text-[10px] c-ink-mute uppercase tracking-[0.18em] mt-3">{tail}</div>}
    </div>
  );
}
