"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";

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

function signalClass(pct: number) {
  if (pct >= 80) return "c-good";
  if (pct >= 50) return "c-fair";
  if (pct >= 20) return "c-idle";
  return "c-poor";
}

function pad(n: number, w = 2) {
  return n.toString().padStart(w, "0");
}

function formatLogDate(d: Date, locale: string) {
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const mm = months[d.getMonth()];
  const dd = pad(d.getDate());
  const yyyy = d.getFullYear();
  void locale;
  return `${dd} ${mm} ${yyyy}`;
}

function formatLogTime(d: Date) {
  return `${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export default function ViewerHomePage() {
  const { data: session, status } = useSession();
  const { locale } = useLocaleStore();
  const [data, setData] = useState<FleetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    fetch("/api/fleet")
      .then(async (r) => { if (r.ok) setData(await r.json()); })
      .finally(() => setLoading(false));
  }, []);

  const userRole = (session?.user as { role?: string })?.role;
  const denied = userRole && userRole !== "SHIPYARD" && userRole !== "SUPPORT" && userRole !== "ADMIN";

  const summary = data?.summary;
  const projects = data?.projects || [];

  const { groups, ungrouped } = useMemo(() => {
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
    return { groups, ungrouped };
  }, [projects]);

  if (status === "loading" || loading) {
    return (
      <div className="max-w-[1180px] mx-auto px-8 py-10">
        <div className="masthead"><span>loading · · ·</span><span /></div>
        <div className="mt-12 opacity-50">
          <div className="label">Awaiting transmission</div>
        </div>
      </div>
    );
  }

  if (denied) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-24 text-center">
        <div className="label mb-2">{tx(locale, "Access restricted", "접근 제한", "アクセス制限")}</div>
        <h1 className="display text-[48px] text-[color:var(--ink)]">401</h1>
      </div>
    );
  }

  // Order vessels by compliance ascending within each group (flag attention)
  const orderVessels = (list: VesselSummary[]) => [...list].sort((a, b) => a.complianceScore - b.complianceScore);

  // Global index counter across sections so each vessel gets a continuous No. 01, 02 …
  let indexCounter = 0;
  const nextIndex = () => { indexCounter++; return pad(indexCounter); };

  return (
    <div className="max-w-[1180px] mx-auto px-8 py-10">
      {/* ── Masthead strip ─────────────────────────────────────────── */}
      <div className="masthead reveal">
        <div className="flex items-center gap-6">
          <span>Admiralty Log</span>
          <span className="c-ink-mute">·</span>
          <span>{formatLogDate(now, locale)}</span>
          <span className="c-ink-mute">·</span>
          <span>{formatLogTime(now)} KST</span>
        </div>
        <span className="seal">
          <span style={{ width: 4, height: 4, background: "var(--copper)", display: "inline-block" }} />
          Viewer
        </span>
      </div>

      {/* ── Hero: Fleet Overview ──────────────────────────────────── */}
      <section className="grid grid-cols-12 gap-10 mt-12 mb-16 reveal reveal-delay-1">
        {/* Title column */}
        <div className="col-span-12 md:col-span-7">
          <div className="kicker mb-3">§ I · Fleet Review</div>
          <h1 className="display text-[68px] md:text-[84px] c-ink">
            Fleet<br />
            <span className="display-italic c-ink-soft">overview.</span>
          </h1>
          <p className="mt-6 text-[13px] leading-[1.65] c-ink-soft max-w-[52ch]">
            {tx(locale,
              "A quarterly review of cyber-security posture across all operating assets. Figures are aggregated from equipment approval, security assessments, and documentation issued under IACS UR E26 / E27.",
              "운항 중인 모든 자산의 사이버 보안 현황을 분기별로 검토합니다. 수치는 기자재 승인, 보안 평가 및 IACS UR E26 / E27 기준 문서 발행을 기준으로 집계됩니다.",
              "運航中の資産におけるサイバーセキュリティ体制の四半期レビュー。数値は機器承認、セキュリティ評価、およびIACS UR E26 / E27に基づく発行文書から集計されます。"
            )}
          </p>
        </div>

        {/* Compliance dial column */}
        <div className="col-span-12 md:col-span-5 flex flex-col md:items-end">
          {summary && (
            <>
              <div className="label mb-2">{tx(locale, "Aggregate compliance", "종합 컴플라이언스", "総合準拠率")}</div>
              <div className="flex items-start gap-1">
                <span className={`numeral text-[156px] md:text-[192px] leading-none ${signalClass(summary.avgCompliance)}`}>
                  {summary.avgCompliance}
                </span>
                <span className="numeral text-[36px] md:text-[44px] c-ink-mute mt-4">%</span>
              </div>
              <div className="mt-3 flex items-center gap-4 text-[10px] mono c-ink-mute uppercase tracking-[0.18em]">
                <span>q{Math.floor(now.getMonth() / 3) + 1} {now.getFullYear()}</span>
                <span>·</span>
                <span>n = {summary.totalVessels}</span>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── Register strip (summary metadata) ─────────────────────── */}
      {summary && (
        <div className="reveal reveal-delay-2">
          <hr className="rule-ink" />
          <div className="grid grid-cols-4 divide-x divide-[color:var(--line)]">
            <RegisterCell
              label={tx(locale, "Vessels under watch", "감시 중인 선박", "監視中船舶")}
              value={pad(summary.totalVessels, 2)}
              footnote={tx(locale, "active", "활성", "稼働")}
            />
            <RegisterCell
              label={tx(locale, "Flag", "깃발", "旗")}
              value={summary.avgCompliance >= 80 ? "A" : summary.avgCompliance >= 50 ? "B" : "C"}
              footnote={
                summary.avgCompliance >= 80 ? tx(locale, "satisfactory", "양호", "良好") :
                summary.avgCompliance >= 50 ? tx(locale, "conditional", "조건부", "条件付き") :
                tx(locale, "review", "재검토", "再検討")
              }
              signal={signalClass(summary.avgCompliance)}
            />
            <RegisterCell
              label={tx(locale, "Requires attention", "조치 필요", "要対応")}
              value={pad(summary.needsAttention, 2)}
              footnote={tx(locale, "flagged", "플래그", "フラグ")}
              signal={summary.needsAttention > 0 ? "c-poor" : "c-idle"}
            />
            <RegisterCell
              label={tx(locale, "Last reconciled", "최종 집계", "最終集計")}
              value={formatLogTime(now)}
              footnote="UTC+9"
            />
          </div>
          <hr className="rule" />
        </div>
      )}

      {/* ── Vessel register ────────────────────────────────────────── */}
      <section className="mt-16 reveal reveal-delay-3">
        <div className="flex items-baseline justify-between mb-8">
          <div>
            <div className="kicker">§ II · Vessel Register</div>
            <h2 className="display text-[32px] mt-1">{tx(locale, "The fleet", "선대", "船隊")}</h2>
          </div>
          <div className="mono text-[10px] c-ink-mute uppercase tracking-[0.2em]">
            {tx(locale, `${projects.length} entries`, `${projects.length}건`, `${projects.length}件`)}
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="py-24 text-center border-y border-[color:var(--line)]">
            <div className="label">{tx(locale, "No entries in register", "등록된 선박 없음", "登録なし")}</div>
            <p className="display-italic c-ink-soft text-[20px] mt-2">{tx(locale, "The logbook is blank.", "항해일지가 비어 있습니다.", "航海日誌は白紙です。")}</p>
          </div>
        ) : (
          <div className="space-y-10">
            {[...groups.entries()].map(([groupId, group]) => (
              <GroupBlock key={groupId} name={group.name} shipowner={group.shipowner} locale={locale}>
                {orderVessels(group.vessels).map((v) => (
                  <VesselEntry key={v.id} vessel={v} index={nextIndex()} locale={locale} />
                ))}
              </GroupBlock>
            ))}
            {ungrouped.length > 0 && (
              <GroupBlock name={groups.size > 0 ? tx(locale, "Unassigned", "미분류", "未分類") : tx(locale, "All vessels", "전체 선박", "全船舶")} shipowner={null} locale={locale}>
                {orderVessels(ungrouped).map((v) => (
                  <VesselEntry key={v.id} vessel={v} index={nextIndex()} locale={locale} />
                ))}
              </GroupBlock>
            )}
          </div>
        )}
      </section>

      {/* ── Colophon ────────────────────────────────────────────────── */}
      <footer className="mt-24 pt-6 border-t border-[color:var(--ink)] flex items-center justify-between text-[10px] mono uppercase tracking-[0.22em] c-ink-mute">
        <span>— end of log —</span>
        <span>Compiled for viewer · read-only</span>
      </footer>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────

function RegisterCell({ label, value, footnote, signal }: {
  label: string; value: string; footnote?: string; signal?: string;
}) {
  return (
    <div className="px-5 py-4">
      <div className="label">{label}</div>
      <div className={`numeral text-[44px] mt-2 ${signal || "c-ink"}`}>{value}</div>
      {footnote && <div className="mono text-[10px] c-ink-mute uppercase tracking-[0.16em] mt-1">{footnote}</div>}
    </div>
  );
}

function GroupBlock({ name, shipowner, locale, children }: {
  name: string; shipowner: string | null; locale: string; children: React.ReactNode;
}) {
  void locale;
  return (
    <div>
      <div className="flex items-baseline gap-4 mb-4">
        <hr className="rule flex-1" />
        <span className="mono text-[10px] uppercase tracking-[0.24em] c-ink px-2">
          {name}
          {shipowner && <span className="c-ink-mute ml-2 normal-case tracking-normal">— {shipowner}</span>}
        </span>
        <hr className="rule flex-1" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-[color:var(--line)]">
        {children}
      </div>
    </div>
  );
}

function VesselEntry({ vessel, index, locale }: { vessel: VesselSummary; index: string; locale: string }) {
  const approvalPct = vessel.equipmentCount > 0
    ? Math.round((vessel.equipmentApproved / vessel.equipmentCount) * 100)
    : 0;
  const docPct = vessel.totalDocuments > 0
    ? Math.round((vessel.documentCount / vessel.totalDocuments) * 100)
    : 0;
  const sig = signalClass(vessel.complianceScore);

  return (
    <Link href={`/viewer/${vessel.id}`} className="group block bg-[color:var(--paper)] hover:bg-[color:var(--paper-edge)] transition-colors duration-200">
      <article className="p-7 relative">
        {/* Index + classification row */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="index-no mb-2"><span>No.</span><strong>{index}</strong></div>
            <h3 className="display text-[28px] leading-[1.1] c-ink group-hover:c-copper transition-colors">
              {vessel.vesselName}
            </h3>
          </div>
          {vessel.classification && (
            <div className="text-right">
              <div className="label">{vessel.classification}</div>
              <div className="mono text-[10px] c-ink-mute uppercase tracking-[0.16em] mt-1">{vessel.status}</div>
            </div>
          )}
        </div>

        {/* Compliance numeral + meta */}
        <div className="flex items-end justify-between mb-6">
          <div className="flex items-baseline gap-2">
            <span className={`numeral text-[64px] leading-none ${sig}`}>{vessel.complianceScore}</span>
            <span className="numeral text-[22px] c-ink-mute">%</span>
          </div>
          <div className="text-right">
            <div className="label">{tx(locale, "Inventory", "인벤토리", "資産")}</div>
            <div className="mono text-[11px] c-ink mt-1">
              {vessel.equipmentCount}eq / {vessel.hardwareCount}hw / {vessel.softwareCount}sw
            </div>
          </div>
        </div>

        {/* Scale bars */}
        <div className="space-y-3.5">
          <Scale
            label={tx(locale, "Equipment approved", "기자재 승인", "機器承認")}
            value={`${vessel.equipmentApproved}/${vessel.equipmentCount}`}
            pct={approvalPct}
          />
          <Scale
            label={tx(locale, "Security assessment", "보안 평가", "評価")}
            value={`${vessel.assessmentCompletion}%`}
            pct={vessel.assessmentCompletion}
          />
          <Scale
            label={tx(locale, "Documents issued", "문서 발행", "文書発行")}
            value={`${vessel.documentCount}/${vessel.totalDocuments}`}
            pct={docPct}
          />
        </div>

        {/* Chevron-less indicator — a tiny mono "open →" in the corner */}
        <div className="mt-6 flex justify-end">
          <span className="mono text-[10px] uppercase tracking-[0.22em] c-ink-mute group-hover:c-copper transition-colors">
            open entry →
          </span>
        </div>
      </article>
    </Link>
  );
}

function Scale({ label, value, pct }: { label: string; value: string; pct: number }) {
  const sig = signalClass(pct);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="label">{label}</span>
        <span className={`mono text-[11px] ${sig}`}>{value}</span>
      </div>
      <div className="scale">
        <div className={`scale-fill scale-in-bar ${sig}`} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
    </div>
  );
}
