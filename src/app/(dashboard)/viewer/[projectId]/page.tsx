"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";

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

/** Editorial status glyph + compressed label. Circles replaced with
 *  typographic marks (●/◐/○/×/—) to keep the nautical-logbook feel. */
const STATUS_GLYPH: Record<string, { glyph: string; signal: string; en: string; ko: string; ja: string }> = {
  APPROVED:           { glyph: "●", signal: "c-good", en: "Approved",   ko: "승인됨",   ja: "承認済み" },
  SUBMITTED:          { glyph: "◐", signal: "c-fair", en: "Submitted",  ko: "제출됨",   ja: "提出済み" },
  IN_PROGRESS:        { glyph: "◐", signal: "c-fair", en: "In progress",ko: "진행 중",  ja: "進行中" },
  REVISION_REQUESTED: { glyph: "×", signal: "c-poor", en: "Revision",   ko: "수정 요청",ja: "修正依頼" },
  PENDING:            { glyph: "○", signal: "c-idle", en: "Pending",    ko: "대기",     ja: "保留中" },
};

function pad(n: number, w = 2) { return n.toString().padStart(w, "0"); }

function signalClass(pct: number) {
  if (pct >= 80) return "c-good";
  if (pct >= 50) return "c-fair";
  if (pct >= 20) return "c-idle";
  return "c-poor";
}

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

  const sortedEq = useMemo(() => {
    // Surface items requiring attention at the top
    const order = ["REVISION_REQUESTED", "SUBMITTED", "IN_PROGRESS", "PENDING", "APPROVED"];
    return [...equipments].sort((a, b) => {
      const ai = order.indexOf(a.status); const bi = order.indexOf(b.status);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [equipments]);

  const approvedCount = equipments.filter((e) => e.status === "APPROVED").length;
  const progressPct = equipments.length > 0 ? Math.round((approvedCount / equipments.length) * 100) : 0;
  const sig = signalClass(progressPct);

  if (loading) {
    return (
      <div className="max-w-[1180px] mx-auto px-8 py-10">
        <div className="masthead"><span>loading · · ·</span><span /></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-24 text-center">
        <div className="label mb-2">{tx(locale, "Not found", "찾을 수 없음", "見つかりません")}</div>
        <h1 className="display text-[48px]">404</h1>
        <Link href="/viewer" className="back-link mt-8">← {tx(locale, "return to log", "일지로 돌아가기", "ログに戻る")}</Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1180px] mx-auto px-8 py-10">
      {/* Masthead + breadcrumb */}
      <div className="masthead reveal">
        <div className="flex items-center gap-6">
          <Link href="/viewer" className="c-ink hover:c-copper transition-colors">Admiralty Log</Link>
          <span className="c-ink-mute">/</span>
          <span className="c-copper">{project.vesselName}</span>
        </div>
        <span className="seal">
          <span style={{ width: 4, height: 4, background: "var(--copper)", display: "inline-block" }} />
          Viewer
        </span>
      </div>

      <Link href="/viewer" className="back-link mt-6 inline-flex">
        ← {tx(locale, "fleet overview", "선대 현황", "船隊概要")}
      </Link>

      {/* ── Vessel hero ────────────────────────────────────────────── */}
      <section className="grid grid-cols-12 gap-10 mt-10 mb-14 reveal reveal-delay-1">
        <div className="col-span-12 md:col-span-8">
          <div className="kicker mb-3">§ Vessel file</div>
          <h1 className="display text-[72px] md:text-[88px] c-ink leading-[0.96]">
            {project.vesselName}
          </h1>
          <dl className="datasheet mt-8 max-w-md">
            <dt>{tx(locale, "Shipowner", "선주", "船主")}</dt>
            <dd>{project.shipowner || "—"}</dd>
            <dt>{tx(locale, "Classification", "선급", "船級")}</dt>
            <dd>{project.classification || "—"}</dd>
            <dt>{tx(locale, "System", "시스템", "システム")}</dt>
            <dd>{project.systemName || "—"}</dd>
          </dl>
        </div>

        {/* Progress dial */}
        <div className="col-span-12 md:col-span-4 md:text-right">
          <div className="label mb-2">{tx(locale, "Approval ratio", "승인률", "承認率")}</div>
          <div className="flex items-start gap-1 md:justify-end">
            <span className={`numeral text-[136px] leading-none ${sig}`}>{progressPct}</span>
            <span className="numeral text-[36px] c-ink-mute mt-3">%</span>
          </div>
          <div className="mono text-[11px] c-ink-mute uppercase tracking-[0.2em] mt-3">
            {approvedCount} / {equipments.length} {tx(locale, "approved", "승인됨", "承認済み")}
          </div>
        </div>
      </section>

      {/* Scale bar under hero */}
      <div className="mb-14 reveal reveal-delay-2">
        <div className="scale">
          <div className={`scale-fill scale-in-bar ${sig}`} style={{ width: `${Math.max(1, progressPct)}%` }} />
        </div>
        <div className="flex justify-between mt-2 mono text-[9px] uppercase tracking-[0.22em] c-ink-mute">
          <span>0</span><span>20</span><span>40</span><span>60</span><span>80</span><span>100</span>
        </div>
      </div>

      {/* ── Equipment register ─────────────────────────────────────── */}
      <section className="reveal reveal-delay-3">
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <div className="kicker">§ II · Equipment register</div>
            <h2 className="display text-[32px] mt-1">
              {equipments.length} {tx(locale, "items under certification", "인증 대상 기자재", "認証対象機器")}
            </h2>
          </div>
        </div>

        {equipments.length === 0 ? (
          <div className="py-20 text-center border-y border-[color:var(--line)]">
            <div className="label">{tx(locale, "Register empty", "기자재 없음", "登録なし")}</div>
            <p className="display-italic c-ink-soft text-[20px] mt-2">{tx(locale, "No equipment yet filed.", "아직 등록된 기자재가 없습니다.", "まだ機器が登録されていません。")}</p>
          </div>
        ) : (
          <div className="border-t border-b border-[color:var(--ink)]">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-[color:var(--line)] label">
              <div className="col-span-1">№</div>
              <div className="col-span-5">{tx(locale, "Equipment", "기자재", "機器")}</div>
              <div className="col-span-3">{tx(locale, "Vendor", "벤더", "ベンダー")}</div>
              <div className="col-span-1 text-right">HW</div>
              <div className="col-span-1 text-right">SW</div>
              <div className="col-span-1 text-right">{tx(locale, "State", "상태", "状態")}</div>
            </div>

            {/* Rows */}
            {sortedEq.map((eq, i) => {
              const st = STATUS_GLYPH[eq.status] || STATUS_GLYPH.PENDING;
              return (
                <Link
                  key={eq.id}
                  href={`/viewer/${projectId}/${eq.id}`}
                  className="grid grid-cols-12 gap-4 px-4 py-5 items-center border-b border-[color:var(--line)] last:border-b-0 hover:bg-[color:var(--paper-edge)] transition-colors group"
                >
                  <div className="col-span-1 mono text-[11px] c-ink-mute tabular-nums">{pad(i + 1)}</div>
                  <div className="col-span-5">
                    <div className="flex items-baseline gap-3">
                      <span className="display text-[22px] c-ink group-hover:c-copper transition-colors leading-tight">{eq.name}</span>
                      {eq.dfdDiagram && (
                        <span className="mono text-[9px] c-ink-mute uppercase tracking-[0.2em] border border-[color:var(--line-strong)] px-1.5 py-0.5">DFD</span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-3 mono text-[11px] c-ink-soft truncate">
                    {eq.vendor?.company || eq.vendor?.name || <span className="c-ink-mute">—</span>}
                  </div>
                  <div className="col-span-1 mono text-[12px] c-ink text-right tabular-nums">{eq._count.hardware}</div>
                  <div className="col-span-1 mono text-[12px] c-ink text-right tabular-nums">{eq._count.software}</div>
                  <div className="col-span-1 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className={`${st.signal} text-[15px] leading-none`}>{st.glyph}</span>
                      <span className={`mono text-[9px] uppercase tracking-[0.18em] ${st.signal}`}>
                        {st[locale as "en"|"ko"|"ja"] || st.en}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <footer className="mt-24 pt-6 border-t border-[color:var(--ink)] flex items-center justify-between text-[10px] mono uppercase tracking-[0.22em] c-ink-mute">
        <span>— vessel file · {project.vesselName} —</span>
        <span>Read-only record</span>
      </footer>
    </div>
  );
}
