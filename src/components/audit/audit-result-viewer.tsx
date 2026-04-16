"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, ChevronDown, Zap, Monitor, Globe, Lock, Package,
  AlertTriangle, CheckCircle2, XCircle, ExternalLink,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface E27Item {
  cat: string;
  item: string;
  detail: string;
  pass: boolean;
}

interface E27Result {
  pass: number;
  fail: number;
  total: number;
  items: E27Item[];
}

interface CveMatch {
  name: string;
  version: string;
  cves: { cveId: string; severity: string | null; score: number | null; description: string }[];
}

interface AuditReport {
  SystemInfo?: {
    ComputerName?: string;
    OS?: string;
    OSBuild?: string;
    Architecture?: string;
    Manufacturer?: string;
    Model?: string;
    TotalRAM_GB?: string;
    Domain?: string;
    LastBoot?: string;
    AuditTime?: string;
  };
  InstalledSoftware?: Record<string, unknown>[] | Record<string, unknown>;
  RunningServices?: Record<string, unknown>[] | Record<string, unknown>;
  NetworkSettings?: {
    SMBv1Disabled?: boolean;
    LMAuthLevel?: number;
    NullSessionBlocked?: boolean;
  };
  OpenPorts?: { Port: number; IP?: string; Process?: string; PID?: string }[];
  PatchStatus?: {
    TotalInstalled?: number;
    AutoUpdateOff?: boolean;
    LastPatch?: string;
    RecentPatches?: { HotFixID?: string; Description?: string; InstalledOn?: string }[];
  };
}

export interface AuditResultViewerProps {
  e27: E27Result | null;
  report: AuditReport | null;
  cveMatches: CveMatch[];
  deviceName: string;
  runDate: string;
  exploitCveIds?: Set<string>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toArr = (v: unknown): unknown[] => {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === "object") return Object.values(v);
  return [];
};

type DetailTab = "e27" | "system" | "software" | "services" | "network" | "patches";

// ─── Component ───────────────────────────────────────────────────────────────

export function AuditResultViewer({ e27, report, cveMatches, deviceName, runDate, exploitCveIds }: AuditResultViewerProps) {
  const { locale } = useLocaleStore();
  const [expanded, setExpanded] = useState(false);
  const [failExpanded, setFailExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>("e27");

  if (!e27 && !report) return null;

  const pct = e27 ? Math.round((e27.pass / Math.max(e27.total, 1)) * 100) : 0;
  const failItems = e27?.items.filter((i) => !i.pass) || [];
  const totalCves = cveMatches.reduce((sum, m) => sum + m.cves.length, 0);
  const exploitCount = cveMatches.reduce((sum, m) =>
    sum + m.cves.filter((c) => exploitCveIds?.has(c.cveId)).length, 0
  );

  const scoreColor = pct >= 80 ? "text-safety-low" : pct >= 60 ? "text-safety-elevated" : "text-safety-high";
  const scoreBg = pct >= 80 ? "bg-green-50" : pct >= 60 ? "bg-orange-50" : "bg-risk-bg";
  const barColor = pct >= 80 ? "bg-safety-low" : pct >= 60 ? "bg-safety-elevated" : "bg-safety-high";

  const si = report?.SystemInfo || {};
  const swList = toArr(report?.InstalledSoftware) as { Name?: string; Version?: string; Publisher?: string }[];
  const svcList = toArr(report?.RunningServices) as { Name?: string; DisplayName?: string; StartType?: string }[];
  const ports = (report?.OpenPorts || []) as { Port: number; IP?: string; Process?: string; PID?: string }[];
  const ns = report?.NetworkSettings || {};
  const pt = report?.PatchStatus || {};
  const patches = toArr(pt.RecentPatches) as { HotFixID?: string; Description?: string; InstalledOn?: string }[];

  const tabs: { id: DetailTab; icon: typeof Shield; label: string; count?: number }[] = [
    { id: "e27", icon: Shield, label: "E27" },
    { id: "system", icon: Monitor, label: tx(locale, "System", "시스템", "システム") },
    { id: "software", icon: Package, label: `CVE/SW`, count: totalCves },
    { id: "services", icon: Lock, label: tx(locale, "Services", "서비스", "サービス"), count: svcList.length },
    { id: "network", icon: Globe, label: tx(locale, "Network", "네트워크", "ネットワーク"), count: ports.length },
    { id: "patches", icon: Lock, label: tx(locale, "Patches", "패치", "パッチ"), count: patches.length },
  ];

  return (
    <Card padding="none" className="overflow-hidden">
      {/* ── Layer 1: Summary (always visible) ── */}
      <div className={cn("px-5 py-4", scoreBg)}>
        <div className="flex items-center gap-4">
          {/* Score circle */}
          <div className="relative h-16 w-16 shrink-0">
            <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
              <circle cx="18" cy="18" r="14" fill="none" stroke="#E0E0E0" strokeWidth="3" />
              <circle cx="18" cy="18" r="14" fill="none"
                stroke={pct >= 80 ? "#24A148" : pct >= 60 ? "#EB6200" : "#DA1E28"}
                strokeWidth="3" strokeDasharray={`${pct * 0.88} 88`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={cn("text-[15px] font-black", scoreColor)}>{pct}%</span>
            </div>
          </div>

          {/* Summary info */}
          <div className="flex-1 min-w-0">
            <p className="text-body-sm font-bold text-text">E27 {tx(locale, "Compliance", "준수율", "準拠率")}</p>
            <p className="text-[11px] text-text-tertiary mt-0.5">{deviceName} · {runDate}</p>
            <div className="flex items-center gap-3 mt-2">
              <span className="flex items-center gap-1 text-[11px] font-bold text-safety-low">
                <CheckCircle2 size={12} /> {e27?.pass || 0} {tx(locale, "PASS", "통과", "合格")}
              </span>
              <span className="flex items-center gap-1 text-[11px] font-bold text-safety-high">
                <XCircle size={12} /> {e27?.fail || 0} {tx(locale, "FAIL", "실패", "不合格")}
              </span>
            </div>
          </div>

          {/* CVE/Exploit summary */}
          <div className="flex items-center gap-3 shrink-0">
            {totalCves > 0 && (
              <div className="text-center px-3 py-1.5 rounded-lg bg-white/80 border border-border">
                <p className="text-[14px] font-black text-safety-elevated">{totalCves}</p>
                <p className="text-[9px] text-text-tertiary font-bold">CVE</p>
              </div>
            )}
            {exploitCount > 0 && (
              <div className="text-center px-3 py-1.5 rounded-lg bg-safety-high/10 border border-safety-high/20">
                <p className="text-[14px] font-black text-safety-high flex items-center gap-1"><Zap size={12} />{exploitCount}</p>
                <p className="text-[9px] text-safety-high font-bold">Exploit</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Layer 2: Fail items (summary) ── */}
        {failItems.length > 0 && (
          <div className="mt-3 pt-3 border-t border-black/5">
            <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-2">
              <AlertTriangle size={11} className="inline text-safety-high mr-1" />
              {tx(locale, "Action Required", "개선 필요 항목", "対応が必要な項目")} ({failItems.length})
            </p>
            <div className="grid grid-cols-2 gap-1">
              {(failExpanded ? failItems : failItems.slice(0, 6)).map((item, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px] text-text-secondary">
                  <XCircle size={10} className="text-safety-high shrink-0" />
                  <span className="truncate">{tx(locale, item.item, item.item)}</span>
                </div>
              ))}
            </div>
            {failItems.length > 6 && (
              <button onClick={() => setFailExpanded(!failExpanded)} className="text-[10px] text-brand font-semibold mt-1 hover:underline">
                {failExpanded ? tx(locale, "Collapse", "접기", "折りたたむ") : `+${failItems.length - 6} ${tx(locale, "more", "건 더", "件以上")}`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Expand toggle ── */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-center gap-1.5 px-5 py-2 border-t border-border text-[11px] font-semibold text-brand hover:bg-brand-lighter/20 transition-colors"
      >
        {expanded ? tx(locale, "Collapse", "접기", "折りたたむ") : tx(locale, "View Details", "상세 보기", "詳細を表示")}
        <ChevronDown size={14} className={cn("transition-transform", expanded && "rotate-180")} />
      </button>

      {/* ── Layer 3: Full detail tabs ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            {/* Tab bar */}
            <div className="flex gap-0 px-4 border-t border-border bg-surface-secondary/30 overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className={cn("flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-bold whitespace-nowrap border-b-2 transition-all",
                      activeTab === tab.id
                        ? "border-brand text-brand"
                        : "border-transparent text-text-tertiary hover:text-text-secondary")}
                  >
                    <Icon size={12} />
                    {tab.label}
                    {tab.count !== undefined && tab.count > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-surface-tertiary/50 text-[9px] font-bold">{tab.count}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div className="p-4 max-h-[400px] overflow-y-auto">
              {/* E27 Tab */}
              {activeTab === "e27" && e27 && (
                <div className="space-y-3">
                  {Object.entries(
                    e27.items.reduce<Record<string, E27Item[]>>((acc, item) => {
                      if (!acc[item.cat]) acc[item.cat] = [];
                      acc[item.cat].push(item);
                      return acc;
                    }, {})
                  ).map(([cat, items]) => (
                    <div key={cat}>
                      <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mb-1.5 px-2 py-1 bg-surface-secondary/50 rounded">{cat}</p>
                      <div className="space-y-1">
                        {items.map((item, i) => (
                          <div key={i} className={cn("flex items-center gap-2.5 px-3 py-2 rounded-lg border",
                            item.pass ? "border-safety-low/20 bg-green-50/30" : "border-safety-high/20 bg-risk-bg/30")}>
                            {item.pass ? <CheckCircle2 size={13} className="text-safety-low shrink-0" /> : <XCircle size={13} className="text-safety-high shrink-0" />}
                            <span className="flex-1 text-[12px] font-medium text-text">{tx(locale, item.item, item.item)}</span>
                            <span className="text-[10px] font-mono text-text-tertiary">{item.detail}</span>
                            <span className={cn("text-[10px] font-bold min-w-[32px] text-right", item.pass ? "text-safety-low" : "text-safety-high")}>
                              {item.pass ? tx(locale, "PASS", "통과", "合格") : tx(locale, "FAIL", "실패", "不合格")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* System Tab */}
              {activeTab === "system" && (
                <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-0 text-[12px]">
                  {[
                    [tx(locale, "Computer Name", "컴퓨터 이름", "コンピュータ名"), si.ComputerName],
                    ["OS", si.OS],
                    ["Build", si.OSBuild],
                    [tx(locale, "Architecture", "아키텍처", "アーキテクチャ"), si.Architecture],
                    [tx(locale, "Manufacturer", "제조사", "メーカー"), si.Manufacturer],
                    [tx(locale, "Model", "모델", "モデル"), si.Model],
                    ["RAM", si.TotalRAM_GB ? `${si.TotalRAM_GB} GB` : undefined],
                    [tx(locale, "Domain", "도메인", "ドメイン"), si.Domain],
                    [tx(locale, "Last Boot", "마지막 부팅", "最終起動"), si.LastBoot],
                    [tx(locale, "Audit Time", "감사 시간", "監査時間"), si.AuditTime],
                  ].filter(([, v]) => v).map(([k, v], i) => (
                    <div key={i} className="contents">
                      <div className="font-semibold text-text-secondary py-2 border-b border-border/50">{k}</div>
                      <div className="text-text py-2 border-b border-border/50 font-mono text-[11px]">{v || "—"}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Software/CVE Tab */}
              {activeTab === "software" && (
                <div className="space-y-3">
                  {cveMatches.length > 0 ? (
                    cveMatches.map((match, i) => (
                      <div key={i} className="rounded-lg border border-border">
                        <div className="flex items-center gap-2 px-3 py-2 bg-surface-secondary/30 border-b border-border">
                          <Package size={12} className="text-text-tertiary" />
                          <span className="text-[12px] font-bold text-text">{match.name}</span>
                          <span className="font-mono text-[10px] text-text-tertiary">{match.version}</span>
                          <span className="ml-auto text-[10px] font-bold text-safety-elevated">{match.cves.length} CVE</span>
                        </div>
                        <div className="divide-y divide-border/50">
                          {match.cves.slice(0, 5).map((cve, j) => {
                            const hasExploit = exploitCveIds?.has(cve.cveId);
                            return (
                              <div key={j} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
                                <span className="font-mono text-brand font-semibold">{cve.cveId}</span>
                                {cve.severity && (
                                  <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold",
                                    cve.severity === "CRITICAL" ? "bg-risk-bg text-safety-high" :
                                    cve.severity === "HIGH" ? "bg-orange-50 text-safety-elevated" :
                                    "bg-surface-secondary text-text-tertiary"
                                  )}>{cve.severity}</span>
                                )}
                                {hasExploit && <Zap size={10} className="text-safety-high" />}
                                <span className="text-text-tertiary truncate flex-1">{cve.description}</span>
                              </div>
                            );
                          })}
                          {match.cves.length > 5 && (
                            <p className="px-3 py-1.5 text-[10px] text-text-tertiary">+{match.cves.length - 5} more</p>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6">
                      <Package size={24} className="mx-auto text-text-tertiary mb-2" />
                      <p className="text-body-xs text-text-tertiary">
                        {swList.length > 0
                          ? tx(locale, `${swList.length} SW installed — No CVE matches`, `${swList.length}개 SW 설치됨 — CVE 매칭 결과 없음`, `${swList.length}件のSWインストール済み — CVE一致なし`)
                          : tx(locale, "No software data", "소프트웨어 정보 없음", "ソフトウェア情報なし")}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Services Tab */}
              {activeTab === "services" && (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-surface-secondary/50">
                      <th className="px-2 py-1.5 text-left font-bold text-text-tertiary">{tx(locale, "Service", "서비스 이름", "サービス名")}</th>
                      <th className="px-2 py-1.5 text-left font-bold text-text-tertiary">{tx(locale, "Display Name", "표시 이름", "表示名")}</th>
                      <th className="px-2 py-1.5 text-left font-bold text-text-tertiary w-20">{tx(locale, "Start", "시작 유형", "開始タイプ")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {svcList.slice(0, 50).map((s, i) => (
                      <tr key={i} className={i % 2 ? "bg-surface-secondary/20" : ""}>
                        <td className="px-2 py-1.5 font-mono text-[10px] text-text">{(s as Record<string, string>).Name || "—"}</td>
                        <td className="px-2 py-1.5 text-text-secondary">{(s as Record<string, string>).DisplayName || "—"}</td>
                        <td className="px-2 py-1.5"><span className="px-1.5 py-0.5 rounded bg-surface-secondary text-[9px] font-bold text-text-tertiary">{(s as Record<string, string>).StartType || "—"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Network Tab */}
              {activeTab === "network" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ["SMBv1", ns.SMBv1Disabled ? tx(locale, "Disabled ✅", "비활성화 ✅", "無効 ✅") : tx(locale, "ENABLED ❌", "활성화 ❌", "有効 ❌"), !!ns.SMBv1Disabled],
                      ["LM Auth", String(ns.LMAuthLevel ?? "—"), (ns.LMAuthLevel ?? 0) >= 3],
                      [tx(locale, "Null Sessions", "널 세션", "Nullセッション"), ns.NullSessionBlocked ? tx(locale, "Blocked ✅", "차단 ✅", "ブロック済み ✅") : tx(locale, "Allowed ❌", "허용 ❌", "許可 ❌"), !!ns.NullSessionBlocked],
                    ].map(([label, value, pass], i) => (
                      <div key={i} className={cn("px-3 py-2.5 rounded-lg border", pass ? "border-safety-low/20 bg-green-50/30" : "border-safety-high/20 bg-risk-bg/30")}>
                        <p className="text-[10px] font-bold text-text-tertiary">{label as string}</p>
                        <p className={cn("text-[12px] font-bold mt-0.5", pass ? "text-safety-low" : "text-safety-high")}>{value as string}</p>
                      </div>
                    ))}
                  </div>
                  {ports.length > 0 && (
                    <>
                      <p className="text-[11px] font-bold text-text">{tx(locale, "Listening Ports", "열린 포트", "リスニングポート")} ({ports.length})</p>
                      <table className="w-full text-[11px]">
                        <thead><tr className="bg-surface-secondary/50">
                          <th className="px-2 py-1.5 text-left font-bold text-text-tertiary w-16">Port</th>
                          <th className="px-2 py-1.5 text-left font-bold text-text-tertiary">IP</th>
                          <th className="px-2 py-1.5 text-left font-bold text-text-tertiary">Process</th>
                        </tr></thead>
                        <tbody className="divide-y divide-border/50">
                          {ports.slice(0, 20).map((p, i) => (
                            <tr key={i}><td className="px-2 py-1 font-mono font-bold">{p.Port}</td>
                            <td className="px-2 py-1 font-mono text-[10px] text-text-tertiary">{p.IP || "—"}</td>
                            <td className="px-2 py-1 text-text-secondary">{p.Process || "—"}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              )}

              {/* Patches Tab */}
              {activeTab === "patches" && (
                <div className="space-y-3">
                  <div className="flex gap-2 flex-wrap">
                    <div className="px-3 py-2 rounded-lg border border-border text-center min-w-[80px]">
                      <p className="text-[16px] font-black text-brand">{pt.TotalInstalled || 0}</p>
                      <p className="text-[9px] text-text-tertiary">{tx(locale, "Total", "전체 패치", "合計")}</p>
                    </div>
                    <div className={cn("px-3 py-2 rounded-lg border text-center min-w-[80px]", pt.AutoUpdateOff ? "border-safety-high/20 bg-risk-bg/30" : "border-safety-low/20 bg-green-50/30")}>
                      <p className={cn("text-[12px] font-bold", pt.AutoUpdateOff ? "text-safety-high" : "text-safety-low")}>
                        {pt.AutoUpdateOff ? "OFF ❌" : "ON ✅"}
                      </p>
                      <p className="text-[9px] text-text-tertiary">{tx(locale, "Auto Update", "자동 업데이트", "自動更新")}</p>
                    </div>
                    <div className="px-3 py-2 rounded-lg border border-border text-center min-w-[100px]">
                      <p className="text-[11px] font-bold text-text">{pt.LastPatch || "—"}</p>
                      <p className="text-[9px] text-text-tertiary">{tx(locale, "Last Patch", "마지막 패치", "最終パッチ")}</p>
                    </div>
                  </div>
                  {patches.length > 0 && (
                    <table className="w-full text-[11px]">
                      <thead><tr className="bg-surface-secondary/50">
                        <th className="px-2 py-1.5 text-left font-bold text-text-tertiary">KB</th>
                        <th className="px-2 py-1.5 text-left font-bold text-text-tertiary">{tx(locale, "Description", "설명", "説明")}</th>
                        <th className="px-2 py-1.5 text-left font-bold text-text-tertiary w-24">{tx(locale, "Date", "설치일", "日付")}</th>
                      </tr></thead>
                      <tbody className="divide-y divide-border/50">
                        {patches.map((p, i) => (
                          <tr key={i}>
                            <td className="px-2 py-1 font-mono font-bold text-brand">{p.HotFixID || "—"}</td>
                            <td className="px-2 py-1 text-text-secondary">{p.Description || "—"}</td>
                            <td className="px-2 py-1 text-[10px] text-text-tertiary">{p.InstalledOn || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
