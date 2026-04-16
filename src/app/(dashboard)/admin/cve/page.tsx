"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { Shield, Search, ArrowLeft, ChevronLeft, ChevronRight, Zap, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonTable } from "@/components/ui/skeleton";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CveEntry {
  id: number;
  cveId: string;
  description: string;
  baseScore: number | null;
  baseSeverity: string | null;
  vendor: string | null;
  product: string | null;
  publishedAt: string | null;
}

interface ExploitRef {
  id: number;
  cveId: string | null;
  edbId: string | null;
  title: string;
  description: string | null;
  platform: string | null;
  type: string | null;
  url: string | null;
  createdAt: string;
}

const SEV: Record<string, { bg: string; text: string }> = {
  CRITICAL: { bg: "bg-risk-bg", text: "text-safety-high" },
  HIGH:     { bg: "bg-orange-50", text: "text-safety-elevated" },
  MEDIUM:   { bg: "bg-amber-50", text: "text-amber-600" },
  LOW:      { bg: "bg-green-50", text: "text-safety-low" },
};

const PAGE_SIZE = 50;
type ActiveTab = "cve" | "exploit";

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CvePage() {
  const { data: session, status } = useSession();
  const { locale } = useLocaleStore();
  const userRole = (session?.user as { role?: string })?.role;

  const [activeTab, setActiveTab] = useState<ActiveTab>("cve");

  // CVE state
  const [cveResults, setCveResults] = useState<CveEntry[]>([]);
  const [cveTotal, setCveTotal] = useState(0);
  const [cveLoading, setCveLoading] = useState(true);
  const [cveSearch, setCveSearch] = useState("");
  const [sevFilter, setSevFilter] = useState("");
  const [cvePage, setCvePage] = useState(1);

  // Exploit state
  const [exploits, setExploits] = useState<ExploitRef[]>([]);
  const [exploitTotal, setExploitTotal] = useState(0);
  const [exploitLoading, setExploitLoading] = useState(true);
  const [exploitSearch, setExploitSearch] = useState("");
  const [exploitPage, setExploitPage] = useState(1);

  // Exploit set for CVE table indicator
  const [exploitCveIds, setExploitCveIds] = useState<Set<string>>(new Set());

  // Detail dialog
  const [selectedCve, setSelectedCve] = useState<CveEntry | null>(null);
  const [selectedExploits, setSelectedExploits] = useState<ExploitRef[]>([]);

  // ── Fetch CVEs ─────────────────────────────────────────────────────────

  const fetchCves = useCallback(() => {
    setCveLoading(true);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(cvePage) });
    if (cveSearch.trim()) params.set("keyword", cveSearch.trim());
    if (sevFilter) params.set("severity", sevFilter);
    fetch(`/api/cve/search?${params}`)
      .then(async (r) => {
        if (r.ok) {
          const d = await r.json();
          setCveResults(d.results || []);
          setCveTotal(d.pagination?.total || 0);
        }
      })
      .finally(() => setCveLoading(false));
  }, [cvePage, cveSearch, sevFilter]);

  // ── Fetch Exploits ─────────────────────────────────────────────────────

  const fetchExploits = useCallback(() => {
    setExploitLoading(true);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(exploitPage) });
    if (exploitSearch.trim()) params.set("cveId", exploitSearch.trim());
    fetch(`/api/admin/exploit-refs?${params}`)
      .then(async (r) => {
        if (r.ok) {
          const d = await r.json();
          setExploits(d.refs || []);
          setExploitTotal(d.pagination?.total || 0);
          // Build CVE ID set for indicators
          const ids = new Set<string>();
          (d.refs || []).forEach((ref: ExploitRef) => { if (ref.cveId) ids.add(ref.cveId); });
          setExploitCveIds((prev) => {
            const merged = new Set(prev);
            ids.forEach((id) => merged.add(id));
            return merged;
          });
        }
      })
      .finally(() => setExploitLoading(false));
  }, [exploitPage, exploitSearch]);

  // Load all exploit CVE IDs on mount (for CVE tab indicators)
  useEffect(() => {
    fetch("/api/admin/exploit-refs?limit=1000")
      .then(async (r) => {
        if (r.ok) {
          const d = await r.json();
          const ids = new Set<string>();
          (d.refs || []).forEach((ref: ExploitRef) => { if (ref.cveId) ids.add(ref.cveId); });
          setExploitCveIds(ids);
          setExploitTotal(d.pagination?.total || 0);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => { queueMicrotask(() => fetchCves()); }, [fetchCves]);
  useEffect(() => { if (activeTab === "exploit") queueMicrotask(() => fetchExploits()); }, [fetchExploits, activeTab]);
  useEffect(() => { queueMicrotask(() => setCvePage(1)); }, [cveSearch, sevFilter]);
  useEffect(() => { queueMicrotask(() => setExploitPage(1)); }, [exploitSearch]);

  // CVE detail click
  const handleCveClick = (cve: CveEntry) => {
    setSelectedCve(cve);
    // Fetch exploits for this CVE
    fetch(`/api/admin/exploit-refs?cveId=${cve.cveId}&limit=50`)
      .then(async (r) => {
        if (r.ok) {
          const d = await r.json();
          setSelectedExploits(d.refs || []);
        }
      })
      .catch(() => setSelectedExploits([]));
  };

  const cveTotalPages = Math.ceil(cveTotal / PAGE_SIZE);
  const exploitTotalPages = Math.ceil(exploitTotal / PAGE_SIZE);

  if (status === "loading") return <div className="max-w-6xl mx-auto px-6 py-8"><SkeletonTable rows={6} /></div>;
  if (userRole !== "ADMIN") return <div className="max-w-6xl mx-auto px-6 py-8"><EmptyState icon={Shield} title={tx(locale, "Admin access required", "관리자 권한이 필요합니다", "管理者権限が必要です")} /></div>;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className="max-w-6xl mx-auto px-6 py-8 space-y-6"
    >
      <Link href="/admin" className="inline-flex items-center gap-1 text-body-xs text-text-tertiary hover:text-brand transition-colors">
        <ArrowLeft size={14} /> {tx(locale, "Admin", "관리자", "管理者")}
      </Link>

      <div>
        <h1 className="text-h5 text-text tracking-tight">CVE & {tx(locale, "Exploits", "익스플로잇", "エクスプロイト")}</h1>
        <p className="text-body-sm text-text-tertiary mt-1">
          {tx(locale, "Manage vulnerabilities and exploit references", "취약점과 공격 코드를 관리합니다", "脆弱性とエクスプロイト参照を管理します")}
        </p>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 p-1 bg-surface-secondary rounded-[var(--radius-md)] w-fit">
        <button onClick={() => setActiveTab("cve")} className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-[var(--radius-sm)] text-body-xs font-semibold transition-all",
          activeTab === "cve" ? "bg-white text-text shadow-sm" : "text-text-tertiary hover:text-text",
        )}>
          <Shield size={14} />
          CVE
          <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-bold min-w-[20px] text-center",
            activeTab === "cve" ? "bg-brand text-white" : "bg-surface-tertiary/60 text-text-tertiary"
          )}>{cveTotal.toLocaleString()}</span>
        </button>
        <button onClick={() => setActiveTab("exploit")} className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-[var(--radius-sm)] text-body-xs font-semibold transition-all",
          activeTab === "exploit" ? "bg-white text-text shadow-sm" : "text-text-tertiary hover:text-text",
        )}>
          <Zap size={14} />
          {tx(locale, "Exploits", "익스플로잇", "エクスプロイト")}
          <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-bold min-w-[20px] text-center",
            activeTab === "exploit" ? "bg-safety-high text-white" : "bg-surface-tertiary/60 text-text-tertiary"
          )}>{exploitTotal}</span>
        </button>
      </div>

      {/* ════════════ CVE Tab ════════════ */}
      {activeTab === "cve" && (
        <>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input value={cveSearch} onChange={(e) => setCveSearch(e.target.value)}
                placeholder={tx(locale, "CVE ID, description, vendor...", "CVE ID, 설명, 벤더, 제품...", "CVE ID、説明、ベンダー、製品...")}
                className="h-10 w-full rounded-[var(--radius-md)] border border-border bg-white pl-10 pr-4 text-body-sm text-text placeholder:text-border-strong focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
              />
            </div>
            <div className="flex gap-1.5">
              {["", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => (
                <button key={s} onClick={() => setSevFilter(s)}
                  className={cn("px-3 py-2 rounded-[var(--radius-md)] text-[11px] font-bold transition-all",
                    sevFilter === s ? s ? `${SEV[s]?.bg} ${SEV[s]?.text}` : "bg-brand text-white" : "bg-white border border-border text-text-tertiary hover:border-border-strong",
                  )}>{s || (tx(locale, "All", "전체", "全て"))}</button>
              ))}
            </div>
          </div>

          {cveLoading ? <SkeletonTable rows={8} /> : cveResults.length === 0 ? (
            <EmptyState icon={Search} title={tx(locale, "No results", "검색 결과가 없습니다", "検索結果がありません")} />
          ) : (
            <Card padding="none">
              <div className="overflow-auto max-h-[calc(100vh-400px)]">
                <table className="w-full">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-border bg-white shadow-xs">
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-text-tertiary uppercase w-36">CVE ID</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-text-tertiary uppercase w-20">{tx(locale, "Sev.", "심각도", "深刻度")}</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-text-tertiary uppercase w-14">{tx(locale, "Score", "점수", "スコア")}</th>
                      <th className="px-4 py-3 text-center text-[10px] font-bold text-text-tertiary uppercase w-12">⚡</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-text-tertiary uppercase">{tx(locale, "Description", "설명", "説明")}</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-text-tertiary uppercase hidden lg:table-cell w-24">{tx(locale, "Vendor", "벤더", "ベンダー")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {cveResults.map((cve) => {
                      const sev = SEV[cve.baseSeverity || ""] || { bg: "bg-surface-secondary", text: "text-text-tertiary" };
                      const hasExploit = exploitCveIds.has(cve.cveId);
                      return (
                        <tr key={cve.id} className="hover:bg-brand-lighter/20 transition-colors cursor-pointer" onClick={() => handleCveClick(cve)}>
                          <td className="px-4 py-2.5 font-mono text-[11px] text-brand font-semibold">{cve.cveId}</td>
                          <td className="px-4 py-2.5">
                            {cve.baseSeverity && <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold", sev.bg, sev.text)}>{cve.baseSeverity}</span>}
                          </td>
                          <td className="px-4 py-2.5 text-[12px] font-bold text-text">{cve.baseScore ?? "—"}</td>
                          <td className="px-4 py-2.5 text-center">
                            {hasExploit && <Zap size={12} className="text-safety-high inline-block" />}
                          </td>
                          <td className="px-4 py-2.5 text-[11px] text-text-secondary truncate max-w-md">{cve.description}</td>
                          <td className="px-4 py-2.5 text-[11px] text-text-tertiary hidden lg:table-cell">{cve.vendor || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={cvePage} totalPages={cveTotalPages} total={cveTotal} pageSize={PAGE_SIZE} onPageChange={setCvePage} />
            </Card>
          )}
        </>
      )}

      {/* ════════════ Exploit Tab ════════════ */}
      {activeTab === "exploit" && (
        <>
          <div className="relative max-w-md">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input value={exploitSearch} onChange={(e) => setExploitSearch(e.target.value)}
              placeholder={tx(locale, "Search by CVE ID...", "CVE ID로 검색...", "CVE IDで検索...")}
              className="h-10 w-full rounded-[var(--radius-md)] border border-border bg-white pl-10 pr-4 text-body-sm text-text placeholder:text-border-strong focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
            />
          </div>

          {exploitLoading ? <SkeletonTable rows={6} /> : exploits.length === 0 ? (
            <EmptyState icon={Zap} title={tx(locale, "No exploits found", "등록된 익스플로잇이 없습니다", "登録されたエクスプロイトがありません")} subtitle={tx(locale, "Exploits mapped to CVE data will appear here", "CVE 데이터와 매핑된 익스플로잇이 표시됩니다", "CVEデータとマッピングされたエクスプロイトが表示されます")} />
          ) : (
            <Card padding="none">
              <div className="overflow-auto max-h-[calc(100vh-400px)]">
                <table className="w-full">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-border bg-white shadow-xs">
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-text-tertiary uppercase w-36">CVE ID</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-text-tertiary uppercase w-24">EDB ID</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-text-tertiary uppercase">{tx(locale, "Title", "제목", "タイトル")}</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-text-tertiary uppercase hidden md:table-cell w-24">{tx(locale, "Platform", "플랫폼", "プラットフォーム")}</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-text-tertiary uppercase hidden md:table-cell w-20">{tx(locale, "Type", "유형", "タイプ")}</th>
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {exploits.map((exp) => (
                      <tr key={exp.id} className="hover:bg-brand-lighter/20 transition-colors">
                        <td className="px-4 py-2.5">
                          {exp.cveId ? (
                            <span className="font-mono text-[11px] text-brand font-semibold cursor-pointer hover:underline"
                              onClick={() => {
                                const cve = cveResults.find(c => c.cveId === exp.cveId);
                                if (cve) handleCveClick(cve);
                              }}
                            >{exp.cveId}</span>
                          ) : <span className="text-[11px] text-text-tertiary">—</span>}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-safety-elevated font-semibold">
                          {exp.edbId ? `EDB-${exp.edbId}` : "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="text-[11px] font-medium text-text truncate max-w-sm">{exp.title}</p>
                          {exp.description && <p className="text-[10px] text-text-tertiary truncate max-w-sm mt-0.5">{exp.description}</p>}
                        </td>
                        <td className="px-4 py-2.5 hidden md:table-cell">
                          {exp.platform && <span className="px-1.5 py-0.5 rounded bg-surface-secondary text-[9px] font-bold text-text-tertiary">{exp.platform}</span>}
                        </td>
                        <td className="px-4 py-2.5 hidden md:table-cell">
                          {exp.type && <span className="px-1.5 py-0.5 rounded bg-surface-secondary text-[9px] font-bold text-text-tertiary">{exp.type}</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {exp.url && (
                            <a href={exp.url} target="_blank" rel="noopener noreferrer" className="p-1 rounded text-text-tertiary hover:text-brand transition-colors">
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={exploitPage} totalPages={exploitTotalPages} total={exploitTotal} pageSize={PAGE_SIZE} onPageChange={setExploitPage} />
            </Card>
          )}
        </>
      )}

      {/* ════════════ CVE Detail Dialog ════════════ */}
      <Dialog open={!!selectedCve} onClose={() => { setSelectedCve(null); setSelectedExploits([]); }}
        title={selectedCve?.cveId || ""} maxWidth="max-w-2xl">
        {selectedCve && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              {selectedCve.baseSeverity && (
                <span className={cn("px-2.5 py-1 rounded-full text-[11px] font-bold", SEV[selectedCve.baseSeverity]?.bg, SEV[selectedCve.baseSeverity]?.text)}>
                  {selectedCve.baseSeverity} {selectedCve.baseScore}
                </span>
              )}
              {selectedCve.vendor && <span className="text-body-xs text-text-secondary">{selectedCve.vendor}</span>}
              {selectedCve.product && <span className="text-body-xs text-text-tertiary">/ {selectedCve.product}</span>}
            </div>

            <p className="text-body-xs text-text-secondary leading-relaxed">{selectedCve.description}</p>

            <div className="flex gap-2">
              <a href={`https://nvd.nist.gov/vuln/detail/${selectedCve.cveId}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[var(--radius-sm)] text-[11px] font-medium text-brand border border-brand/20 hover:bg-brand-lighter transition-colors">
                <ExternalLink size={11} /> NVD
              </a>
              <a href={`https://www.exploit-db.com/search?cve=${selectedCve.cveId.replace("CVE-", "")}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[var(--radius-sm)] text-[11px] font-medium text-safety-elevated border border-safety-elevated/20 hover:bg-orange-50 transition-colors">
                <Zap size={11} /> Exploit-DB
              </a>
            </div>

            {/* Exploits section */}
            <div className="border-t border-border pt-4">
              <h3 className="text-body-sm font-bold text-text flex items-center gap-2 mb-3">
                <Zap size={14} className={selectedExploits.length > 0 ? "text-safety-high" : "text-text-tertiary"} />
                {tx(locale, "Exploits", "익스플로잇", "エクスプロイト")} ({selectedExploits.length})
              </h3>

              {selectedExploits.length === 0 ? (
                <p className="text-body-xs text-text-tertiary py-3 text-center bg-surface-secondary/30 rounded-lg">
                  {tx(locale, "No exploits found for this CVE", "등록된 익스플로잇이 없습니다", "登録されたエクスプロイトがありません")}
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedExploits.map((exp) => (
                    <div key={exp.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-border hover:bg-surface-secondary/30 transition-colors">
                      <div className="h-7 w-7 rounded-lg bg-safety-high/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Zap size={12} className="text-safety-high" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-body-xs font-semibold text-text">{exp.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {exp.edbId && <span className="font-mono text-[10px] text-text-tertiary">EDB-{exp.edbId}</span>}
                          {exp.platform && <span className="px-1.5 py-0.5 rounded bg-surface-secondary text-[9px] font-bold text-text-tertiary">{exp.platform}</span>}
                          {exp.type && <span className="px-1.5 py-0.5 rounded bg-surface-secondary text-[9px] font-bold text-text-tertiary">{exp.type}</span>}
                        </div>
                      </div>
                      {exp.url && (
                        <a href={exp.url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded text-text-tertiary hover:text-brand transition-colors shrink-0">
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </motion.div>
  );
}

// ─── Pagination Component ────────────────────────────────────────────────────

function Pagination({ page, totalPages, total, pageSize, onPageChange }: {
  page: number; totalPages: number; total: number; pageSize: number; onPageChange: (p: number) => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
      <p className="text-[11px] text-text-tertiary">
        {total.toLocaleString()} total — {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)}
      </p>
      <div className="flex items-center gap-2">
        <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1}
          className="p-1.5 rounded-[var(--radius-sm)] border border-border hover:bg-surface-secondary disabled:opacity-30 transition-colors">
          <ChevronLeft size={14} />
        </button>
        <span className="text-[11px] text-text-secondary font-medium px-2">{page} / {totalPages || 1}</span>
        <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
          className="p-1.5 rounded-[var(--radius-sm)] border border-border hover:bg-surface-secondary disabled:opacity-30 transition-colors">
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
