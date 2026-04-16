"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Ship, Shield, FileText, Package, Cpu, Server, Radio, HardDrive, Monitor, Network,
  CheckCircle, Clock, AlertTriangle, Eye, ThumbsUp, MessageSquare, X,
  ChevronRight, ArrowLeft, Download, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types & Mock ───────────────────────────────────────────────────────────

type EqStatus = "APPROVED" | "SUBMITTED" | "IN_PROGRESS" | "PENDING" | "REVISION_REQUESTED";

interface MockSw { name: string; version: string; type: string; vendor: string }
interface MockHw { name: string; type: string; manufacturer: string; model: string; ip: string | null; zone: string; category: string; sw: MockSw[] }
interface MockDoc { type: string; title: string; generated: boolean }
interface MockEq {
  id: string; name: string; vendor: string; status: EqStatus;
  hardware: MockHw[]; scResults: ("PASS" | "FAIL" | "NOT_CHECKED")[];
  docs: MockDoc[]; hasDfd: boolean;
  lastUpdate: string; reviewComment?: string;
}

const VESSEL = { name: "HO-2601 호선", shipowner: "현대상선", classification: "KR", group: "현대상선 유조선 3척" };

const EQUIPMENT: MockEq[] = [
  {
    id: "eq1", name: "ECDIS (전자해도시스템)", vendor: "(주)해양전자", status: "SUBMITTED",
    hardware: [
      { name: "ECDIS 서버", type: "SERVER", manufacturer: "Dell", model: "PowerEdge R650", ip: "192.168.1.10", zone: "Lv3", category: "1",
        sw: [{ name: "Windows Server 2019", version: "10.0.17763", type: "OS", vendor: "Microsoft" }, { name: "ECDIS App", version: "3.2.1", type: "APP", vendor: "해양전자" }] },
      { name: "ECDIS 디스플레이", type: "PC", manufacturer: "한화시스템", model: "HW-D200", ip: "192.168.1.11", zone: "Lv3", category: "1",
        sw: [{ name: "Windows 10 IoT", version: "10.0.19041", type: "OS", vendor: "Microsoft" }] },
      { name: "L3 스위치", type: "NETWORK_DEVICE", manufacturer: "Cisco", model: "Catalyst 9300", ip: "192.168.1.1", zone: "Lv2", category: "2", sw: [] },
    ],
    scResults: Array(13).fill("PASS"), hasDfd: true,
    docs: [
      { type: "E27-CBS", title: "CBS 장비 목록 및 하드웨어 상세", generated: true },
      { type: "E27-SBOM", title: "소프트웨어 자재 명세서(SBOM)", generated: true },
      { type: "E27-AUD", title: "보안 능력 평가 보고서", generated: true },
      { type: "E27-TOP", title: "네트워크 토폴로지 다이어그램", generated: true },
      { type: "E27-VUL", title: "취약점 평가서", generated: true },
    ],
    lastUpdate: "2026-04-03",
  },
  {
    id: "eq2", name: "VDR (항해데이터기록장치)", vendor: "(주)해양전자", status: "APPROVED",
    hardware: [
      { name: "VDR 서버", type: "SERVER", manufacturer: "Dell", model: "R450", ip: "192.168.1.20", zone: "Lv3", category: "1",
        sw: [{ name: "VDR Software", version: "5.1", type: "APP", vendor: "해양전자" }] },
    ],
    scResults: Array(13).fill("PASS"), hasDfd: true,
    docs: [
      { type: "E27-CBS", title: "CBS 장비 목록", generated: true },
      { type: "E27-SBOM", title: "SBOM", generated: true },
      { type: "E27-AUD", title: "보안 평가 보고서", generated: true },
    ],
    lastUpdate: "2026-04-01", reviewComment: "CBS 구성 적합. 승인합니다.",
  },
  {
    id: "eq3", name: "IAS (통합자동화시스템)", vendor: "(주)해양전자", status: "IN_PROGRESS",
    hardware: [
      { name: "IAS 컨트롤러", type: "PLC", manufacturer: "Siemens", model: "S7-1500", ip: "192.168.2.10", zone: "Lv1", category: "2", sw: [] },
      { name: "HMI 단말", type: "PC", manufacturer: "한화시스템", model: "HW-T100", ip: "192.168.2.11", zone: "Lv2", category: "2",
        sw: [{ name: "WinCC", version: "7.5", type: "APP", vendor: "Siemens" }] },
    ],
    scResults: ["PASS","PASS","PASS","PASS","PASS","PASS","PASS","PASS","NOT_CHECKED","NOT_CHECKED","NOT_CHECKED","NOT_CHECKED","NOT_CHECKED"],
    hasDfd: true, docs: [{ type: "E27-CBS", title: "CBS 장비 목록", generated: true }],
    lastUpdate: "2026-03-30",
  },
  {
    id: "eq4", name: "Radar (항해레이더)", vendor: "후루노전기", status: "PENDING",
    hardware: [], scResults: Array(13).fill("NOT_CHECKED"), hasDfd: false, docs: [], lastUpdate: "2026-03-25",
  },
  {
    id: "eq5", name: "AIS Transponder", vendor: "삼성중공업전자", status: "REVISION_REQUESTED",
    hardware: [{ name: "AIS Unit", type: "OTHER_DEVICE", manufacturer: "Samsung", model: "SA-200", ip: null, zone: "Lv3", category: "3", sw: [] }],
    scResults: ["PASS","PASS","PASS","PASS","FAIL","NOT_CHECKED","NOT_CHECKED","NOT_CHECKED","NOT_CHECKED","NOT_CHECKED","NOT_CHECKED","NOT_CHECKED","NOT_CHECKED"],
    hasDfd: false, docs: [{ type: "E27-CBS", title: "CBS 장비 목록", generated: true }],
    lastUpdate: "2026-04-02", reviewComment: "SC-5 네트워크 분리 항목 FAIL. DFD 미생성. 보완 후 재제출 요청.",
  },
];

const STATUS_CFG: Record<EqStatus, { label: string; color: string; bg: string; icon: React.ElementType<{size?: number; className?: string}> }> = {
  APPROVED:           { label: "승인됨",   color: "#24A148", bg: "#E6F7EF", icon: CheckCircle },
  SUBMITTED:          { label: "검토 대기", color: "#EB6200", bg: "#FFF3E0", icon: Eye },
  IN_PROGRESS:        { label: "벤더 작업중", color: "#0F62FE", bg: "#EDF5FF", icon: Clock },
  PENDING:            { label: "미착수",   color: "#8D8D8D", bg: "#F4F4F4", icon: Clock },
  REVISION_REQUESTED: { label: "수정 요청", color: "#DA1E28", bg: "#FFF1F1", icon: AlertTriangle },
};

const HW_ICONS: Record<string, React.ElementType<{size?: number; className?: string}>> = {
  SERVER: Server, PC: Monitor, PLC: Cpu, NETWORK_DEVICE: Network, SENSOR: Radio, OTHER_DEVICE: HardDrive,
};

const SC_NAMES = ["사용자 식별 및 인증","사용 제어 및 권한","시스템 무결성 보호","데이터 기밀성 보호","네트워크 분리 및 데이터 흐름 제한","원격 접속 보안","보안 감사 로깅","통신 무결성 및 인증","백업, 복구 및 복원력","자동 세션 잠금","악성코드 방어 및 탐지","CBS의 물리적 보안","보안 패치 및 업데이트 관리"];

const E26_DOCS = [
  { type: "E26-ZCD", title: "Zones & Conduits Diagram" },
  { type: "E26-INV", title: "Vessel Asset Inventory" },
  { type: "E26-CRA", title: "Cyber Risk Assessment" },
  { type: "E26-CSD", title: "Cyber Security Design Description" },
  { type: "E26-CRP", title: "Cyber Resilience Test Procedure" },
];

// ─── Page (호선 대시보드) ────────────────────────────────────────────────────

export default function ShipyardVesselDemo() {
  const [selectedEqId, setSelectedEqId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<EqStatus | "ALL">("ALL");
  const [remindedIds, setRemindedIds] = useState<Set<string>>(new Set());

  // If equipment selected → show review page
  const selectedEq = EQUIPMENT.find((e) => e.id === selectedEqId);
  if (selectedEq) {
    return <EquipmentReviewPage eq={selectedEq} vessel={VESSEL} onBack={() => setSelectedEqId(null)} />;
  }

  const approved = EQUIPMENT.filter((e) => e.status === "APPROVED").length;
  const submitted = EQUIPMENT.filter((e) => e.status === "SUBMITTED").length;
  const revision = EQUIPMENT.filter((e) => e.status === "REVISION_REQUESTED").length;
  const inProgress = EQUIPMENT.filter((e) => e.status === "IN_PROGRESS").length;
  const total = EQUIPMENT.length;
  const pct = Math.round((approved / total) * 100);
  const allApproved = approved === total;

  const filtered = statusFilter === "ALL" ? EQUIPMENT : EQUIPMENT.filter((e) => e.status === statusFilter);

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12px] text-gray-400 mb-5">
        <ArrowLeft size={13} /> 프로젝트 <ChevronRight size={11} /> {VESSEL.group} <ChevronRight size={11} />
        <span className="text-gray-700 font-semibold">{VESSEL.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-200">
          <Ship size={26} className="text-white" />
        </div>
        <div>
          <h1 className="text-[24px] font-extrabold text-gray-900 tracking-tight">{VESSEL.name}</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">{VESSEL.shipowner} · {VESSEL.classification} · {total}개 기자재</p>
        </div>
      </div>

      {/* Status overview */}
      <div className="grid grid-cols-5 gap-3 mb-8">
        <OverviewCard label="인증 진행률" value={`${pct}%`} sub={`${approved}/${total} 승인`} accent={allApproved ? "#24A148" : "#0F62FE"} active={false} onClick={() => setStatusFilter("ALL")}
          ring={<ProgressRing pct={pct} color={allApproved ? "#24A148" : "#0F62FE"} />} />
        <OverviewCard label="검토 대기" value={String(submitted)} sub="벤더 제출 완료" accent="#EB6200"
          active={statusFilter === "SUBMITTED"} onClick={() => setStatusFilter(statusFilter === "SUBMITTED" ? "ALL" : "SUBMITTED")} />
        <OverviewCard label="수정 요청" value={String(revision)} sub="보완 필요" accent="#DA1E28"
          active={statusFilter === "REVISION_REQUESTED"} onClick={() => setStatusFilter(statusFilter === "REVISION_REQUESTED" ? "ALL" : "REVISION_REQUESTED")} />
        <OverviewCard label="벤더 작업중" value={String(inProgress)} sub="자산등록/평가 중" accent="#0F62FE"
          active={statusFilter === "IN_PROGRESS"} onClick={() => setStatusFilter(statusFilter === "IN_PROGRESS" ? "ALL" : "IN_PROGRESS")} />
        <OverviewCard label="승인 완료" value={String(approved)} sub="E27 인증 완료" accent="#24A148"
          active={statusFilter === "APPROVED"} onClick={() => setStatusFilter(statusFilter === "APPROVED" ? "ALL" : "APPROVED")} />
      </div>

      {/* Equipment list */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-bold text-gray-900">기자재 현황</h2>
          {statusFilter !== "ALL" && (
            <button onClick={() => setStatusFilter("ALL")} className="text-[11px] text-blue-600 font-semibold hover:underline">
              필터 해제
            </button>
          )}
        </div>

        <div className="space-y-2">
          {filtered.map((eq) => {
            const cfg = STATUS_CFG[eq.status];
            const Icon = cfg.icon;
            const hwCount = eq.hardware.length;
            const swCount = eq.hardware.reduce((s, h) => s + h.sw.length, 0);
            const scPassed = eq.scResults.filter((r) => r === "PASS").length;
            const scFailed = eq.scResults.filter((r) => r === "FAIL").length;
            const docCount = eq.docs.filter((d) => d.generated).length;

            return (
              <motion.button key={eq.id} layout
                onClick={() => setSelectedEqId(eq.id)}
                className="w-full bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-md transition-all text-left group">
                <div className="flex items-center gap-4">
                  <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: cfg.bg }}>
                    <Icon size={20} style={{ color: cfg.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[14px] font-bold text-gray-900">{eq.name}</span>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-gray-400">
                      <span className="font-medium text-gray-500">{eq.vendor}</span>
                      <span>HW {hwCount}</span>
                      <span>SW {swCount}</span>
                      <span>DFD {eq.hasDfd ? "✅" : "—"}</span>
                      <span>문서 {docCount}</span>
                      <span className="text-gray-300">|</span>
                      <span>보안평가 <strong className={scFailed > 0 ? "text-red-600" : scPassed === 13 ? "text-green-600" : "text-gray-500"}>{scPassed}/13</strong></span>
                      {scFailed > 0 && <span className="text-red-500 font-semibold">FAIL {scFailed}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Action buttons by status */}
                    {(eq.status === "PENDING" || eq.status === "IN_PROGRESS" || eq.status === "REVISION_REQUESTED") && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setRemindedIds((p) => new Set(p).add(eq.id)); setTimeout(() => setRemindedIds((p) => { const n = new Set(p); n.delete(eq.id); return n; }), 3000); }}
                        disabled={remindedIds.has(eq.id)}
                        className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all",
                          remindedIds.has(eq.id)
                            ? "bg-green-50 text-green-600 border border-green-200"
                            : "bg-gray-100 text-gray-500 hover:bg-orange-50 hover:text-orange-600 border border-gray-200 hover:border-orange-200")}>
                        {remindedIds.has(eq.id) ? <><CheckCircle size={11} /> 전송됨</> : <><MessageSquare size={11} /> 리마인드</>}
                      </button>
                    )}
                    {eq.status === "SUBMITTED" && (
                      <span className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-orange-50 text-orange-600 border border-orange-200">
                        검토 필요
                      </span>
                    )}
                    <span className="text-[10px] text-gray-300">{eq.lastUpdate}</span>
                    <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
                  </div>
                </div>
                {eq.status === "REVISION_REQUESTED" && eq.reviewComment && (
                  <div className="mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-100">
                    <p className="text-[11px] text-red-700"><strong>수정 요청:</strong> {eq.reviewComment}</p>
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* E26 Section */}
      <div className={cn("rounded-xl border p-6", allApproved ? "border-green-200 bg-green-50/30" : "border-gray-200 bg-gray-50/30")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center", allApproved ? "bg-green-100" : "bg-gray-100")}>
              <FileText size={22} className={allApproved ? "text-green-600" : "text-gray-400"} />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-gray-900">E26 선박 문서</h2>
              <p className="text-[12px] text-gray-500 mt-0.5">
                {allApproved
                  ? `모든 기자재(${total}개) 승인 완료. E26 문서를 생성할 수 있습니다.`
                  : `${approved}/${total}개 승인 완료. 전체 승인 후 생성 가능합니다.`}
              </p>
            </div>
          </div>
          <button disabled={!allApproved}
            className={cn("px-5 py-2.5 rounded-lg text-[13px] font-semibold transition-colors",
              allApproved ? "bg-green-600 text-white hover:bg-green-700 shadow-sm" : "bg-gray-200 text-gray-400 cursor-not-allowed")}>
            E26 문서 일괄 생성
          </button>
        </div>
        {!allApproved && (
          <div className="mt-4 h-2 rounded-full bg-gray-200 overflow-hidden">
            <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}
        {allApproved && (
          <div className="mt-4 grid grid-cols-5 gap-2">
            {E26_DOCS.map((d) => (
              <div key={d.type} className="px-3 py-2.5 rounded-lg bg-white border border-green-200 text-center">
                <p className="text-[10px] font-bold text-green-600">{d.type}</p>
                <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{d.title}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-8 text-center text-[11px] text-gray-300">데모 · /demo/shipyard-vessel</p>
    </div>
  );
}

// ─── Equipment Review Page (별도 풀 페이지) ─────────────────────────────────

function EquipmentReviewPage({ eq, vessel, onBack }: { eq: MockEq; vessel: typeof VESSEL; onBack: () => void }) {
  const cfg = STATUS_CFG[eq.status];
  const Icon = cfg.icon;
  const [reviewNote, setReviewNote] = useState(eq.reviewComment || "");
  const [tab, setTab] = useState<"assets" | "assessment" | "documents">("assets");

  const hwCount = eq.hardware.length;
  const swCount = eq.hardware.reduce((s, h) => s + h.sw.length, 0);
  const scPassed = eq.scResults.filter((r) => r === "PASS").length;
  const scFailed = eq.scResults.filter((r) => r === "FAIL").length;

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-blue-600 transition-colors mb-5">
        <ArrowLeft size={13} /> {vessel.name} 기자재 현황으로 돌아가기
      </button>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ background: cfg.bg }}>
            <Icon size={24} style={{ color: cfg.color }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] font-extrabold text-gray-900">{eq.name}</h1>
              <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
            </div>
            <p className="text-[13px] text-gray-500 mt-0.5">{eq.vendor} · 최종 업데이트 {eq.lastUpdate}</p>
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <MiniStat label="하드웨어" value={hwCount} unit="개" ok={hwCount > 0} />
        <MiniStat label="소프트웨어" value={swCount} unit="개" ok={swCount > 0} />
        <MiniStat label="DFD" value={eq.hasDfd ? "생성됨" : "미생성"} ok={eq.hasDfd} />
        <MiniStat label="보안평가" value={`${scPassed}/13`} ok={scPassed === 13} warn={scFailed > 0} />
        <MiniStat label="E27 문서" value={`${eq.docs.filter((d) => d.generated).length}건`} ok={eq.docs.length > 0 && eq.docs.every((d) => d.generated)} />
      </div>

      {/* Review comment for REVISION_REQUESTED */}
      {eq.status === "REVISION_REQUESTED" && eq.reviewComment && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-[12px] font-bold text-red-800">이전 수정 요청 사항</p>
            <p className="text-[12px] text-red-700 mt-0.5">{eq.reviewComment}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 pb-px">
        {([
          { id: "assets" as const, label: "자산 현황", icon: Package, count: `${hwCount}HW · ${swCount}SW` },
          { id: "assessment" as const, label: "보안 평가", icon: Shield, count: `${scPassed}/13` },
          { id: "documents" as const, label: "벤더 제출 문서", icon: FileText, count: `${eq.docs.length}건` },
        ]).map((t) => {
          const TIcon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-semibold border-b-2 -mb-px transition-colors",
                tab === t.id ? "border-blue-600 text-blue-700" : "border-transparent text-gray-400 hover:text-gray-600")}>
              <TIcon size={14} /> {t.label} <span className="text-[10px] text-gray-400 font-normal ml-1">{t.count}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="mb-8">
        {tab === "assets" && (
          <div className="space-y-3">
            {eq.hardware.length === 0 ? (
              <div className="py-12 text-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                <Cpu size={28} className="mx-auto text-gray-300 mb-2" />
                <p className="text-[13px] text-gray-400">벤더가 아직 자산을 등록하지 않았습니다</p>
              </div>
            ) : (
              eq.hardware.map((hw, i) => {
                const HwIcon = HW_ICONS[hw.type] || HardDrive;
                return (
                  <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <HwIcon size={16} className="text-blue-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[13px] font-semibold text-gray-900">{hw.name}</span>
                        <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
                          <span>{hw.manufacturer} · {hw.model}</span>
                          {hw.ip && <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">{hw.ip}</span>}
                          <span>{hw.zone}</span>
                        </div>
                      </div>
                      <span className={cn("px-2 py-0.5 rounded text-[9px] font-bold",
                        hw.category === "1" ? "bg-red-50 text-red-700" : hw.category === "2" ? "bg-orange-50 text-orange-700" : "bg-blue-50 text-blue-700")}>
                        Cat {hw.category === "1" ? "I" : hw.category === "2" ? "II" : "III"}
                      </span>
                    </div>
                    {hw.sw.length > 0 && (
                      <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-2">
                        <div className="flex flex-wrap gap-2">
                          {hw.sw.map((s, si) => (
                            <span key={si} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-gray-200 text-[10px]">
                              <FileText size={9} className="text-indigo-500" />
                              <span className="font-medium text-gray-700">{s.name}</span>
                              <span className="text-gray-400">{s.version}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === "assessment" && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {eq.scResults.map((result, i) => (
              <div key={i} className={cn("flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0",
                result === "FAIL" && "bg-red-50/50")}>
                <div className={cn("h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                  result === "PASS" ? "bg-green-100 text-green-600" : result === "FAIL" ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-400")}>
                  {result === "PASS" ? "✓" : result === "FAIL" ? "✗" : "—"}
                </div>
                <span className="text-[12px] font-semibold text-gray-600 w-12">SC-{i + 1}</span>
                <span className="text-[12px] text-gray-700 flex-1">{SC_NAMES[i]}</span>
                <span className={cn("text-[11px] font-bold",
                  result === "PASS" ? "text-green-600" : result === "FAIL" ? "text-red-600" : "text-gray-300")}>
                  {result === "PASS" ? "PASS" : result === "FAIL" ? "FAIL" : "미확인"}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === "documents" && (
          <div className="space-y-2">
            {eq.docs.length === 0 ? (
              <div className="py-12 text-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                <FileText size={28} className="mx-auto text-gray-300 mb-2" />
                <p className="text-[13px] text-gray-400">벤더가 아직 문서를 생성하지 않았습니다</p>
              </div>
            ) : (
              eq.docs.map((doc) => (
                <div key={doc.type} className="flex items-center gap-4 bg-white rounded-xl border border-gray-200 px-4 py-3">
                  <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                    <FileText size={16} className="text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-900">{doc.title}</p>
                    <p className="text-[11px] text-gray-400">{doc.type} · v1</p>
                  </div>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors">
                    <Eye size={12} /> 미리보기
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">
                    <Download size={12} /> 다운로드
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Review action bar — only for SUBMITTED */}
      {eq.status === "SUBMITTED" && (
        <div className="sticky bottom-0 bg-white border-t border-gray-200 -mx-6 px-6 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          <div className="max-w-[1200px] mx-auto flex items-end gap-4">
            <div className="flex-1">
              <label className="text-[11px] font-bold text-gray-500 mb-1.5 block">검토 의견</label>
              <textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)}
                placeholder="승인 또는 반려 사유를 작성하세요..."
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 resize-none" />
            </div>
            <div className="flex gap-2 shrink-0">
              <button className="h-11 px-6 rounded-lg bg-green-600 text-white text-[13px] font-semibold hover:bg-green-700 transition-colors flex items-center gap-2 shadow-sm">
                <ThumbsUp size={16} /> 승인
              </button>
              <button className="h-11 px-6 rounded-lg bg-red-600 text-white text-[13px] font-semibold hover:bg-red-700 transition-colors flex items-center gap-2 shadow-sm">
                <MessageSquare size={16} /> 수정 요청
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approved footer */}
      {eq.status === "APPROVED" && eq.reviewComment && (
        <div className="rounded-xl bg-green-50 border border-green-200 px-5 py-4 flex items-start gap-3">
          <CheckCircle size={20} className="text-green-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-[13px] font-bold text-green-800">승인 완료</p>
            <p className="text-[12px] text-green-700 mt-0.5">{eq.reviewComment}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ProgressRing({ pct, color }: { pct: number; color: string }) {
  const r = 20; const c = 2 * Math.PI * r;
  return (
    <svg className="h-11 w-11 -rotate-90" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r={r} fill="none" stroke="#F0F0F0" strokeWidth="4" />
      <circle cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={`${c}`} strokeDashoffset={`${c * (1 - pct / 100)}`} strokeLinecap="round" className="transition-all duration-700" />
    </svg>
  );
}

function OverviewCard({ label, value, sub, accent, active, onClick, ring }: {
  label: string; value: string; sub: string; accent: string; active: boolean; onClick: () => void; ring?: React.ReactNode;
}) {
  return (
    <button onClick={onClick} className={cn(
      "bg-white rounded-xl border p-4 text-left transition-all",
      active ? "border-blue-400 ring-2 ring-blue-100 shadow-sm" : "border-gray-200 hover:border-gray-300 hover:shadow-sm",
    )}>
      <div className="flex items-center gap-3">
        {ring || <div className="h-3 w-3 rounded-full" style={{ background: accent }} />}
        <div>
          <p className="text-[10px] text-gray-400">{label}</p>
          <p className="text-[20px] font-black tabular-nums leading-none mt-0.5" style={{ color: accent }}>{value}</p>
          <p className="text-[10px] text-gray-400 mt-1">{sub}</p>
        </div>
      </div>
    </button>
  );
}

function MiniStat({ label, value, unit, ok, warn }: { label: string; value: string | number; unit?: string; ok: boolean; warn?: boolean }) {
  return (
    <div className={cn("px-4 py-3 rounded-lg border text-center",
      warn ? "bg-red-50/50 border-red-200" : ok ? "bg-green-50/50 border-green-200" : "bg-gray-50/50 border-gray-200")}>
      <p className="text-[10px] text-gray-400">{label}</p>
      <p className={cn("text-[16px] font-bold mt-0.5",
        warn ? "text-red-600" : ok ? "text-green-600" : "text-gray-400")}>{value}{unit || ""}</p>
    </div>
  );
}
