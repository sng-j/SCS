"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Shield,
  ChevronDown, CheckCircle, ArrowRight, Layers,
  FileText, ClipboardCheck, Send,
} from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { E27_SC_CHECKS, type SCCheck } from "@/lib/constants";
import { cn } from "@/lib/utils";

const TABS = ["overview", "sc-checks"] as const;
type Tab = typeof TABS[number];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function GuidancePage() {
  const { locale } = useLocaleStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<Tab>((TABS as readonly string[]).includes(tabParam || "") ? tabParam as Tab : "overview");

  // Sync tab from URL (sidebar click → page)
  useEffect(() => {
    if (tabParam && (TABS as readonly string[]).includes(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam as Tab);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam]);

  const changeTab = (tab: Tab) => {
    setActiveTab(tab);
    router.replace(`/guidance?tab=${tab}`, { scroll: false });
  };

  const tabDefs: { id: Tab; label: string; icon: React.ElementType<{ size?: number; className?: string }> }[] = [
    { id: "overview",   label: tx(locale, "Overview", "개요", "概要"),   icon: BookOpen },
    { id: "sc-checks",  label: tx(locale, "SC Checks", "SC 점검", "SCチェック"), icon: Shield },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="max-w-4xl mx-auto px-6 py-8 space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-h4 font-extrabold text-text">
          {tx(locale, "Guidance", "가이드라인", "ガイダンス")}
        </h1>
        <p className="text-body-sm text-text-tertiary mt-1">
          {tx(locale, "E27 cybersecurity certification guidelines and reference materials", "E27 사이버 보안 인증 가이드라인 및 참고 자료", "E27サイバーセキュリティ認証ガイドラインと参考資料")}
        </p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 bg-surface-secondary rounded-[8px] w-fit flex-wrap">
        {tabDefs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => changeTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-body-sm font-medium transition-all duration-200",
              activeTab === id
                ? "bg-white text-text shadow-xs"
                : "text-text-tertiary hover:text-text-secondary",
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "overview"  && <OverviewTab locale={locale} />}
      {activeTab === "sc-checks" && <ScChecksTab locale={locale} />}
    </motion.div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

const PHASES = [
  {
    num: 1,
    icon: Layers,
    titleKo: "자산 등록", titleEn: "Inventory", titleJa: "資産登録",
    descKo: "기자재의 하드웨어 및 소프트웨어 목록을 등록하고 DFD(데이터 흐름도)를 작성합니다.",
    descEn: "Register hardware and software inventory for the equipment and create a Data Flow Diagram (DFD).",
    descJa: "機器のハードウェアおよびソフトウェア一覧を登録し、DFD（データフロー図）を作成します。",
    color: "#0F62FE", bg: "#EDF5FF",
    detailsKo: [
      { label: "하드웨어 등록", desc: "선박에 탑재되는 PC, PLC, 네트워크 장비 등 모든 CBS 하드웨어를 등록합니다." },
      { label: "소프트웨어 등록", desc: "각 하드웨어에 설치된 OS, 애플리케이션, 펌웨어를 등록하고 버전과 CPE를 명시합니다." },
      { label: "DFD 작성", desc: "시스템 간 데이터 흐름을 시각화하는 DFD(Data Flow Diagram)를 생성합니다." },
      { label: "하드닝 감사", desc: "감사 도구로 실제 PC를 스캔하여 설치된 소프트웨어(SBOM)와 보안 설정을 자동 수집합니다." },
    ],
    detailsEn: [
      { label: "Register Hardware", desc: "Register all CBS hardware onboard: PCs, PLCs, network devices, etc." },
      { label: "Register Software", desc: "Register OS, applications, and firmware for each hardware with version and CPE." },
      { label: "Create DFD", desc: "Create a Data Flow Diagram visualizing data flows between systems." },
      { label: "Hardening Audit", desc: "Run the audit tool on shipboard PCs to automatically collect SBOM and security settings." },
    ],
    detailsJa: [
      { label: "ハードウェア登録", desc: "船上のPC、PLC、ネットワーク機器など全てのCBSハードウェアを登録します。" },
      { label: "ソフトウェア登録", desc: "各ハードウェアにインストールされたOS、アプリケーション、ファームウェアをバージョンとCPE付きで登録します。" },
      { label: "DFD作成", desc: "システム間のデータフローを可視化するDFD（データフロー図）を生成します。" },
      { label: "ハードニング監査", desc: "監査ツールで実際のPCをスキャンし、インストール済みソフトウェア（SBOM）とセキュリティ設定を自動収集します。" },
    ],
    tipsKo: ["템플릿 기능으로 유사 장비 설정을 빠르게 복사할 수 있습니다", "AI 어시스턴트에게 하드웨어/소프트웨어 추가를 요청할 수 있습니다"],
    tipsEn: ["Use templates to quickly copy similar equipment configurations", "Ask the AI assistant to add hardware/software for you"],
    tipsJa: ["テンプレート機能で類似機器設定を素早くコピーできます", "AIアシスタントにハードウェア/ソフトウェアの追加を依頼できます"],
  },
  {
    num: 2,
    icon: ClipboardCheck,
    titleKo: "보안 평가", titleEn: "Assessment", titleJa: "セキュリティ評価",
    descKo: "SC-1~SC-13 체크리스트에 따라 보안 구성을 평가하고 취약점을 분석합니다.",
    descEn: "Evaluate security configuration per SC-1~SC-13 checklist and analyze vulnerabilities.",
    descJa: "SC-1〜SC-13チェックリストに基づいてセキュリティ構成を評価し、脆弱性を分析します。",
    color: "#EB6200", bg: "#FFF3E0",
    detailsKo: [
      { label: "SC-1: 사용자 인증", desc: "비밀번호 복잡성, 최소 길이, 만료 주기, 잠금 정책을 점검합니다." },
      { label: "SC-2: 접근 제어", desc: "게스트 계정 비활성화, 관리자 권한 분리를 확인합니다." },
      { label: "SC-5: 네트워크 보안", desc: "SMBv1 비활성화, AutoRun 차단, 불필요한 서비스 제거를 확인합니다." },
      { label: "SC-6: 원격 접속", desc: "RDP NLA 인증, 암호화 수준 등 원격 접속 보안을 평가합니다." },
      { label: "SC-7: 감사 로깅", desc: "로그온/프로세스 감사 정책 활성화 여부를 점검합니다." },
      { label: "SC-10~13: 기타", desc: "화면 잠금, 백신, 패치 관리 등 나머지 보안 요건을 평가합니다." },
    ],
    detailsEn: [
      { label: "SC-1: User Authentication", desc: "Check password complexity, minimum length, expiration, and lockout policy." },
      { label: "SC-2: Access Control", desc: "Verify guest account is disabled and admin privileges are separated." },
      { label: "SC-5: Network Security", desc: "Check SMBv1 disabled, AutoRun blocked, unnecessary services removed." },
      { label: "SC-6: Remote Access", desc: "Evaluate RDP NLA authentication and encryption levels." },
      { label: "SC-7: Audit Logging", desc: "Check logon/process auditing policies are enabled." },
      { label: "SC-10~13: Others", desc: "Evaluate screen lock, antivirus, patch management, and other requirements." },
    ],
    detailsJa: [
      { label: "SC-1: ユーザー認証", desc: "パスワードの複雑さ、最小長、有効期限、ロックアウトポリシーを確認します。" },
      { label: "SC-2: アクセス制御", desc: "ゲストアカウントの無効化と管理者権限の分離を確認します。" },
      { label: "SC-5: ネットワークセキュリティ", desc: "SMBv1無効化、AutoRunブロック、不要なサービスの除去を確認します。" },
      { label: "SC-6: リモートアクセス", desc: "RDP NLA認証、暗号化レベルなどリモートアクセスのセキュリティを評価します。" },
      { label: "SC-7: 監査ログ", desc: "ログオン/プロセス監査ポリシーの有効化を確認します。" },
      { label: "SC-10〜13: その他", desc: "画面ロック、アンチウイルス、パッチ管理など残りのセキュリティ要件を評価します。" },
    ],
    tipsKo: ["하드닝 감사 결과(E27 점수)가 보안 평가 근거로 활용됩니다", "SC 점검 탭에서 각 항목의 상세 기준을 확인하세요"],
    tipsEn: ["Hardening audit results (E27 score) serve as evidence for assessment", "Check the SC Checks tab for detailed criteria"],
    tipsJa: ["ハードニング監査結果（E27スコア）がセキュリティ評価の根拠として活用されます", "SCチェックタブで各項目の詳細基準を確認してください"],
  },
  {
    num: 3,
    icon: FileText,
    titleKo: "문서 생성", titleEn: "Documentation", titleJa: "文書生成",
    descKo: "평가 결과를 바탕으로 보안 인증에 필요한 공식 문서를 자동 생성합니다.",
    descEn: "Automatically generate official documents required for security certification based on the assessment.",
    descJa: "評価結果に基づいて、セキュリティ認証に必要な公式文書を自動生成します。",
    color: "#24A148", bg: "#E6F7EF",
    detailsKo: [
      { label: "E27-CBS: CBS 목록", desc: "등록된 하드웨어/소프트웨어를 기반으로 Computer Based System 문서를 생성합니다." },
      { label: "E27-SBOM: 소프트웨어 BOM", desc: "장비별 소프트웨어 목록(SBOM)을 표준 형식으로 문서화합니다." },
      { label: "E27-SCR: 보안 구성 보고서", desc: "SC-1~SC-13 평가 결과를 종합한 보안 구성 보고서를 생성합니다." },
      { label: "E27-DFD: 데이터 흐름도", desc: "시스템 간 데이터 흐름 다이어그램을 문서로 출력합니다." },
    ],
    detailsEn: [
      { label: "E27-CBS: CBS List", desc: "Generate Computer Based System document from registered hardware/software." },
      { label: "E27-SBOM: Software BOM", desc: "Document per-equipment software inventory (SBOM) in standard format." },
      { label: "E27-SCR: Security Config Report", desc: "Generate comprehensive security configuration report from SC-1~SC-13 results." },
      { label: "E27-DFD: Data Flow Diagram", desc: "Export system data flow diagrams as documentation." },
    ],
    detailsJa: [
      { label: "E27-CBS: CBSリスト", desc: "登録済みHW/SWからComputer Based Systemドキュメントを生成します。" },
      { label: "E27-SBOM: ソフトウェアBOM", desc: "機器別ソフトウェア一覧（SBOM）を標準形式で文書化します。" },
      { label: "E27-SCR: セキュリティ構成レポート", desc: "SC-1〜SC-13評価結果を総合したセキュリティ構成レポートを生成します。" },
      { label: "E27-DFD: データフロー図", desc: "システム間データフローダイアグラムをドキュメントとして出力します。" },
    ],
    tipsKo: ["문서는 DOCX 형식으로 자동 생성되어 다운로드할 수 있습니다", "AI 어시스턴트에게 문서 생성을 요청할 수도 있습니다"],
    tipsEn: ["Documents are auto-generated in DOCX format for download", "You can also ask the AI assistant to generate documents"],
    tipsJa: ["文書はDOCX形式で自動生成されダウンロードできます", "AIアシスタントに文書生成を依頼することもできます"],
  },
  {
    num: 4,
    icon: Send,
    titleKo: "제출", titleEn: "Submission", titleJa: "提出",
    descKo: "완성된 문서와 평가 결과를 조선소에 제출하여 검토 및 승인을 요청합니다.",
    descEn: "Submit completed documents and assessment results to the shipyard for review and approval.",
    descJa: "完成した文書と評価結果を造船所に提出し、審査と承認を依頼します。",
    color: "#8A3FFC", bg: "#F6F2FF",
    detailsKo: [
      { label: "준비 상태 확인", desc: "제출 전 모든 필수 항목(자산 등록, 평가, 문서)이 완료되었는지 확인합니다." },
      { label: "조선소 제출", desc: "기자재 상세 페이지에서 '제출하기' 버튼으로 조선소에 검토를 요청합니다." },
      { label: "검토 및 피드백", desc: "조선소 담당자가 검토 후 승인하거나 수정을 요청합니다." },
      { label: "최종 승인", desc: "수정사항 반영 후 최종 승인을 받으면 해당 기자재의 E27 인증이 완료됩니다." },
    ],
    detailsEn: [
      { label: "Readiness Check", desc: "Verify all required items (inventory, assessment, documents) are complete before submission." },
      { label: "Submit to Shipyard", desc: "Click 'Submit' on the equipment detail page to request shipyard review." },
      { label: "Review & Feedback", desc: "Shipyard reviewer will approve or request revisions." },
      { label: "Final Approval", desc: "After addressing feedback, final approval completes E27 certification for the equipment." },
    ],
    detailsJa: [
      { label: "準備状態確認", desc: "提出前に全ての必須項目（資産登録、評価、文書）が完了しているか確認します。" },
      { label: "造船所提出", desc: "機器詳細ページの「提出」ボタンで造船所に審査を依頼します。" },
      { label: "審査＆フィードバック", desc: "造船所の審査担当者が承認または修正を依頼します。" },
      { label: "最終承認", desc: "修正対応後、最終承認を受けると当該機器のE27認証が完了します。" },
    ],
    tipsKo: ["수정 요청 시 검토 의견이 기자재 페이지에 표시됩니다", "AI 어시스턴트에게 제출 준비 상태를 물어볼 수 있습니다"],
    tipsEn: ["Revision feedback is shown on the equipment detail page", "Ask the AI assistant to check submission readiness"],
    tipsJa: ["修正依頼時のレビューコメントは機器ページに表示されます", "AIアシスタントに提出準備状態を確認できます"],
  },
];

function OverviewTab({ locale }: { locale: string }) {
  const [expandedPhase, setExpandedPhase] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      {/* E27 Description */}
      <Card padding="md" className="border-brand/20 bg-brand-lighter/30">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-lg bg-brand flex items-center justify-center shrink-0">
            <Shield size={18} className="text-white" />
          </div>
          <div>
            <p className="text-body-sm font-bold text-text">
              {tx(locale, "IACS UR E27 Rev.1 (2023)", "IACS UR E27 Rev.1 (2023)", "IACS UR E27 Rev.1 (2023)")}
            </p>
            <p className="text-body-xs text-text-secondary mt-1 leading-relaxed">
              {tx(locale, "IACS Unified Requirement E27 establishes cybersecurity requirements for onboard systems. Applies to ships contracted for construction on or after January 1, 2024.", "국제선급연합(IACS)의 사이버 복원력 통합 요건(UR E27)은 선박 탑재 시스템의 사이버 보안을 위한 국제 표준입니다. 2024년 1월 1일 이후 건조 계약된 선박에 적용됩니다.", "IACS統一要件E27は船上システムのサイバーセキュリティ要件を規定しています。2024年1月1日以降に建造契約された船舶に適用されます。")}
            </p>
          </div>
        </div>
      </Card>

      {/* 4-Phase Workflow — horizontal step indicator */}
      <div>
        <h2 className="text-body-sm font-bold text-text mb-4">
          {tx(locale, "E27 Certification 4-Phase Process", "E27 인증 4단계 프로세스", "E27認証4段階プロセス")}
        </h2>
        <p className="text-body-xs text-text-tertiary mb-4">
          {tx(locale, "Click each phase to see the detailed guide", "각 단계를 클릭하면 상세 가이드를 확인할 수 있습니다", "各段階をクリックすると詳細ガイドが表示されます")}
        </p>

        {/* Step indicator bar */}
        <div className="flex items-center gap-0 mb-4">
          {PHASES.map((phase, i) => {
            const Icon = phase.icon;
            const isActive = expandedPhase === phase.num;
            return (
              <div key={phase.num} className="flex items-center flex-1">
                <button
                  onClick={() => setExpandedPhase(isActive ? null : phase.num)}
                  className={cn(
                    "flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg transition-all duration-200 text-left",
                    isActive
                      ? "ring-1 shadow-sm"
                      : "hover:bg-surface-secondary/50"
                  )}
                  style={isActive ? { background: phase.bg, borderColor: phase.color, outlineColor: phase.color } : {}}
                >
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: isActive ? phase.color : phase.bg }}>
                    <Icon size={15} style={{ color: isActive ? "#fff" : phase.color }} />
                  </div>
                  <div className="min-w-0 hidden sm:block">
                    <p className="text-[10px] font-bold" style={{ color: phase.color }}>Phase {phase.num}</p>
                    <p className={cn("text-body-xs font-semibold truncate", isActive ? "text-text" : "text-text-secondary")}>
                      {locale === "ko" ? phase.titleKo : locale === "ja" ? (phase.titleJa || phase.titleEn) : phase.titleEn}
                    </p>
                  </div>
                </button>
                {i < PHASES.length - 1 && (
                  <ArrowRight size={14} className="text-text-tertiary/30 shrink-0 mx-0.5" />
                )}
              </div>
            );
          })}
        </div>

        {/* Expanded phase detail */}
        <AnimatePresence mode="wait">
          {expandedPhase && (() => {
            const phase = PHASES.find((p) => p.num === expandedPhase)!;
            const details = (locale === "ko" ? phase.detailsKo : locale === "ja" ? (phase.detailsJa || phase.detailsEn) : phase.detailsEn) as typeof phase.detailsEn;
            const tips = (locale === "ko" ? phase.tipsKo : locale === "ja" ? (phase.tipsJa || phase.tipsEn) : phase.tipsEn) as typeof phase.tipsEn;
            return (
              <motion.div
                key={phase.num}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
              >
                <div style={{ borderColor: `${phase.color}30` }} className="rounded-[var(--radius-md)] border"><Card padding="none" className="overflow-hidden border-0">
                  {/* Header */}
                  <div className="px-5 py-4 flex items-center gap-3" style={{ background: phase.bg }}>
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: phase.color }}>
                      <phase.icon size={18} className="text-white" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold" style={{ color: phase.color }}>Phase {phase.num}</p>
                      <p className="text-body-sm font-bold text-text">{locale === "ko" ? phase.titleKo : locale === "ja" ? (phase.titleJa || phase.titleEn) : phase.titleEn}</p>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="px-5 py-3 border-b border-border">
                    <p className="text-body-xs text-text-secondary leading-relaxed">
                      {locale === "ko" ? phase.descKo : locale === "ja" ? (phase.descJa || phase.descEn) : phase.descEn}
                    </p>
                  </div>

                  {/* Checklist */}
                  <div className="px-5 py-4 space-y-3">
                    <p className="text-[11px] font-bold text-text-tertiary uppercase tracking-wide">
                      {tx(locale, "Key Tasks", "주요 작업", "主要タスク")}
                    </p>
                    <div className="space-y-2.5">
                      {details.map((item, j) => (
                        <div key={j} className="flex items-start gap-3">
                          <div className="h-5 w-5 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: phase.bg }}>
                            <span className="text-[9px] font-bold" style={{ color: phase.color }}>{j + 1}</span>
                          </div>
                          <div>
                            <p className="text-body-xs font-semibold text-text">{item.label}</p>
                            <p className="text-[11px] text-text-tertiary mt-0.5 leading-relaxed">{item.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tips */}
                  <div className="px-5 py-3 bg-surface-secondary/30 border-t border-border">
                    <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide mb-2">
                      {tx(locale, "Tips", "팁", "ヒント")}
                    </p>
                    {tips.map((tip, j) => (
                      <div key={j} className="flex items-start gap-2 mb-1.5">
                        <span className="text-[10px] mt-0.5">💡</span>
                        <p className="text-[11px] text-text-secondary leading-relaxed">{tip}</p>
                      </div>
                    ))}
                  </div>
                </Card></div>
              </motion.div>
            );
          })()}
        </AnimatePresence>
      </div>

      {/* Key Points */}
      <Card padding="none">
        <CardBody>
          <h3 className="text-body-sm font-bold text-text mb-3">
            {tx(locale, "Key Points", "핵심 포인트", "重要ポイント")}
          </h3>
          <div className="space-y-2.5">
            {(locale === "ko" ? [
              "CBS(Computer Based System)는 항해, 추진, 안전 등 운항에 영향을 미치는 모든 시스템을 포함합니다",
              "SC-1~SC-13의 13개 보안 구성 요건을 모두 충족해야 합니다",
              "각 선급(KR, LR, DNV, ABS, BV, CCS, NK)별로 추가 요건이 있을 수 있습니다",
              "문서는 조선소를 통해 선급에 제출하며, 선급 승인 후 인증이 완료됩니다",
            ] : locale === "ja" ? [
              "CBS（Computer Based System）は航海、推進、安全等、運航に影響する全てのシステムを含みます",
              "SC-1〜SC-13の13項目のセキュリティ構成要件を全て満たす必要があります",
              "船級（KR、LR、DNV、ABS、BV、CCS、NK）ごとに追加要件がある場合があります",
              "文書は造船所を通じて船級に提出し、船級承認後に認証が完了します",
            ] : [
              "CBS (Computer Based Systems) includes all systems affecting navigation, propulsion, and safety",
              "All 13 security configuration requirements (SC-1~SC-13) must be satisfied",
              "Additional requirements may exist per classification society (KR, LR, DNV, ABS, BV, CCS, NK)",
              "Documents are submitted to the class through the shipyard; certification completes after class approval",
            ]).map((point, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <CheckCircle size={14} className="text-brand shrink-0 mt-0.5" />
                <p className="text-body-xs text-text-secondary leading-relaxed">{point}</p>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

// ─── SC Checks Tab ────────────────────────────────────────────────────────────

function ScChecksTab({ locale }: { locale: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <p className="text-body-xs text-text-tertiary">
        {locale === "ko" ? `총 ${E27_SC_CHECKS.length}개의 보안 구성 점검 항목 (IACS UR E27 Rev.1 기준)` : locale === "ja" ? `IACS UR E27 Rev.1に基づく${E27_SC_CHECKS.length}項目のセキュリティ構成チェック` : `${E27_SC_CHECKS.length} security configuration checks based on IACS UR E27 Rev.1`}
      </p>
      {E27_SC_CHECKS.map((check, i) => (
        <ScCheckCard
          key={check.id}
          check={check}
          locale={locale}
          isExpanded={expanded === check.id}
          onToggle={() => setExpanded(expanded === check.id ? null : check.id)}
          index={i}
        />
      ))}
    </div>
  );
}

function ScCheckCard({ check, locale, isExpanded, onToggle, index }: {
  check: SCCheck; locale: string; isExpanded: boolean; onToggle: () => void; index: number;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: index * 0.04 }}>
      <Card padding="none">
        <button onClick={onToggle} className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-surface-secondary/20 transition-colors rounded-[8px]" aria-expanded={isExpanded}>
          <div className="h-9 w-9 rounded-lg bg-brand-lighter flex items-center justify-center shrink-0">
            <span className="text-[11px] font-bold text-brand">{check.id}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-body-sm font-bold text-text">{tx(locale, check.title, check.titleKo)}</p>
            <p className="text-[11px] text-text-tertiary">{tx(locale, check.category, check.categoryKo)}</p>
          </div>
          <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }} className="shrink-0">
            <ChevronDown size={16} className="text-text-tertiary" />
          </motion.div>
        </button>
        <AnimatePresence>
          {isExpanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
              <div className="px-5 pb-5 pt-1 border-t border-border space-y-3">
                <p className="text-body-xs text-text-secondary leading-relaxed">{tx(locale, check.description, check.descriptionKo)}</p>
                <div>
                  <p className="text-[11px] font-bold text-text-tertiary uppercase tracking-wide mb-2">{tx(locale, "Pass Criteria", "통과 기준", "合格基準")}</p>
                  <div className="space-y-1.5">
                    {((locale === "ko" ? check.passItemsKo : check.passItems) as string[]).map((item: string, j: number) => (
                      <div key={j} className="flex items-start gap-2">
                        <CheckCircle size={13} className="text-brand shrink-0 mt-0.5" />
                        <p className="text-body-xs text-text-secondary leading-relaxed">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

