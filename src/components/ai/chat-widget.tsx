"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, X, Send, Sparkles, Trash2, ExternalLink, CheckCircle, AlertTriangle, Loader2, ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { useChatStore, type ChatMessage, type ChatAction } from "@/stores/chat-store";

// ─── Suggestion chips per page ──────────────────────────────────────────────

const SUGGESTIONS: Record<string, { en: string; ko: string; ja: string }[]> = {
  inventory: [
    { en: "Add 3 hardware devices", ko: "하드웨어 3대 추가해줘", ja: "ハードウェア3台追加して" },
    { en: "Summarize registered assets", ko: "현재 등록된 자산 요약해줘", ja: "登録済み資産を要約して" },
    { en: "Auto-generate DFD", ko: "DFD 자동 생성해줘", ja: "DFDを自動生成して" },
  ],
  assess: [
    { en: "Show assessment status", ko: "평가 현황 알려줘", ja: "評価状況を教えて" },
    { en: "Explain SC-1 requirements", ko: "SC-1 요구사항 설명해줘", ja: "SC-1要件を説明して" },
    { en: "Show incomplete assessments", ko: "미완료 평가 항목 알려줘", ja: "未完了の評価項目を教えて" },
  ],
  document: [
    { en: "Generate all missing documents", ko: "미생성 문서 전부 만들어줘", ja: "未生成の文書を全て作成して" },
    { en: "Check document readiness", ko: "문서 준비 상태 확인해줘", ja: "文書の準備状況を確認して" },
  ],
  submit: [
    { en: "Check submission readiness", ko: "제출 준비 상태 확인해줘", ja: "提出準備状況を確認して" },
    { en: "What should I do next?", ko: "다음에 뭘 해야 해?", ja: "次に何をすればいい？" },
  ],
  dfd: [
    { en: "Analyze this DFD", ko: "DFD 분석해줘", ja: "このDFDを分析して" },
    { en: "Any issues with data flow?", ko: "데이터 흐름에 문제 있어?", ja: "データフローに問題ある？" },
    { en: "Review DFD from security perspective", ko: "보안 관점에서 DFD 검토해줘", ja: "セキュリティ観点でDFDをレビューして" },
  ],
  "equipment-detail": [
    { en: "Summarize this equipment", ko: "이 기자재 현황 요약해줘", ja: "この機材の状況を要約して" },
    { en: "Add software", ko: "소프트웨어 추가해줘", ja: "ソフトウェアを追加して" },
  ],
  "project-overview": [
    { en: "Summarize project status", ko: "프로젝트 현황 요약해줘", ja: "プロジェクト状況を要約して" },
    { en: "What should I do next?", ko: "다음에 뭘 해야 해?", ja: "次に何をすればいい？" },
  ],
  default: [
    { en: "What should I do next?", ko: "다음에 뭘 해야 해?", ja: "次に何をすればいい？" },
    { en: "Explain E27 certification", ko: "E27 인증 절차 설명해줘", ja: "E27認証手続きを説明して" },
    { en: "Show project status", ko: "프로젝트 현황 알려줘", ja: "プロジェクト状況を教えて" },
  ],
};

function detectPageType(path: string, searchParams?: URLSearchParams): string {
  if (/\/project\/[^/]+\/inventory/.test(path)) {
    const tab = searchParams?.get("tab");
    if (tab === "dfd") return "dfd";
    return "inventory";
  }
  if (/\/project\/[^/]+\/assess/.test(path)) return "assess";
  if (/\/project\/[^/]+\/document/.test(path)) return "document";
  if (/\/project\/[^/]+\/submit/.test(path)) return "submit";
  if (/\/project\/[^/]+\/equipment\/[^/]+/.test(path)) return "equipment-detail";
  if (/\/project\/[^/]+/.test(path)) return "project-overview";
  if (/\/vendor/.test(path)) return "vendor";
  if (/\/shipyard/.test(path)) return "shipyard";
  if (/\/admin/.test(path)) return "admin";
  return "default";
}

function extractProjectId(path: string): string | undefined {
  const m = /\/project\/([^/]+)/.exec(path);
  return m?.[1] && m[1] !== "new" ? m[1] : undefined;
}

function extractEquipmentId(path: string, searchParams: URLSearchParams): string | undefined {
  const fromPath = /\/equipment\/([^/]+)/.exec(path)?.[1];
  return fromPath || searchParams.get("equipmentId") || undefined;
}

// ─── Main Widget ────────────────────────────────────────────────────────────

export default function ChatWidget() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { locale } = useLocaleStore();
  const {
    isOpen, messages, isTyping, context, pageFormData,
    toggleOpen, addMessage, setTyping, updateContext, clearMessages,
  } = useChatStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Context sync on navigation ──
  useEffect(() => {
    const pageType = detectPageType(pathname, searchParams);
    const projectId = extractProjectId(pathname);
    const equipmentId = extractEquipmentId(pathname, searchParams);

    const bannerMap: Record<string, { en: string; ko: string; ja: string }> = {
      inventory: { en: "📍 Inventory", ko: "📍 인벤토리", ja: "📍 インベントリ" },
      assess: { en: "📍 Assessment", ko: "📍 보안 평가", ja: "📍 セキュリティ評価" },
      document: { en: "📍 Documents", ko: "📍 문서", ja: "📍 文書" },
      submit: { en: "📍 Submit", ko: "📍 제출", ja: "📍 提出" },
      dfd: { en: "📍 DFD Network", ko: "📍 DFD 네트워크 구성", ja: "📍 DFDネットワーク" },
      "equipment-detail": { en: "📍 Equipment", ko: "📍 기자재 상세", ja: "📍 機材詳細" },
      "project-overview": { en: "📍 Project", ko: "📍 프로젝트", ja: "📍 プロジェクト" },
      vendor: { en: "📍 Vendor", ko: "📍 벤더 관리", ja: "📍 ベンダー管理" },
      shipyard: { en: "📍 Shipyard", ko: "📍 조선소 관리", ja: "📍 造船所管理" },
      admin: { en: "📍 Admin", ko: "📍 시스템 관리", ja: "📍 システム管理" },
      default: { en: "📍 SCS", ko: "📍 SCS", ja: "📍 SCS" },
    };

    const entry = bannerMap[pageType] || bannerMap.default;
    updateContext({
      path: pathname,
      projectId,
      equipmentId,
      pageType,
      banner: tx(locale, entry.en, entry.ko, entry.ja),
    });
  }, [pathname, searchParams, locale, updateContext]);

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // ── Focus input on open ──
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  // ── Send message ──
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isTyping) return;

    addMessage({ role: "user", content: text.trim() });
    setTyping(true);

    try {
      const res = await fetch("/api/ai/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          context: {
            path: context.path,
            projectId: context.projectId,
            equipmentId: context.equipmentId,
            pageType: context.pageType,
            pageFormData: Object.keys(pageFormData).length > 0 ? pageFormData : undefined,
          },
          history: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      // Update context banner from server
      if (data.context?.banner) {
        updateContext({ banner: data.context.banner });
      }

      addMessage({
        role: "assistant",
        content: data.response || "응답을 생성할 수 없습니다.",
        actions: data.actions?.length > 0 ? data.actions : undefined,
        conversationId: data.conversationId || null,
      });
    } catch (err) {
      addMessage({
        role: "assistant",
        content: `오류가 발생했습니다: ${err instanceof Error ? err.message : "알 수 없는 오류"}`,
      });
    } finally {
      setTyping(false);
    }
  }, [isTyping, context, pageFormData, messages, addMessage, setTyping, updateContext]);

  // ── Keyboard handler ──
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const value = e.currentTarget.value;
      e.currentTarget.value = "";
      sendMessage(value);
    }
  };

  const handleSend = () => {
    if (!inputRef.current) return;
    const value = inputRef.current.value;
    inputRef.current.value = "";
    sendMessage(value);
  };

  const suggestions = SUGGESTIONS[context.pageType] || SUGGESTIONS.default;

  return (
    <>
      {/* ── Floating toggle button ── */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={toggleOpen}
            className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-gradient-to-br from-brand to-brand-active text-white shadow-lg hover:shadow-xl flex items-center justify-center transition-shadow duration-200 group"
          >
            <MessageSquare size={22} className="group-hover:scale-110 transition-transform" />
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-safety-low border-2 border-white animate-pulse" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Chat panel ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-0 right-0 sm:bottom-6 sm:right-6 z-50 w-full sm:w-[400px] h-[100dvh] sm:h-[520px] sm:max-h-[80vh] bg-white sm:rounded-2xl border border-border shadow-xl flex flex-col overflow-hidden"
          >
            {/* ── Header ── */}
            <div className="px-4 py-3 bg-gradient-to-r from-brand to-brand-active flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-white/20 flex items-center justify-center">
                  <Sparkles size={14} className="text-white" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-white">
                    {tx(locale, "AI Assistant", "AI 어시스턴트", "AIアシスタント")}
                  </p>
                  <p className="text-[10px] text-white/70">SCS Copilot</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={clearMessages}
                  className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                  title={tx(locale, "Clear chat", "대화 초기화", "チャットをクリア")}
                >
                  <Trash2 size={14} />
                </button>
                <button
                  onClick={toggleOpen}
                  className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* ── Context banner ── */}
            <div className="px-4 py-2 bg-brand-lighter border-b border-brand/10 shrink-0">
              <p className="text-[11px] font-medium text-brand">{context.banner}</p>
            </div>

            {/* ── Messages area ── */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {/* Empty state: suggestion chips */}
              {messages.length === 0 && (
                <div className="flex flex-col items-center pt-6 gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-brand-lighter flex items-center justify-center">
                    <Sparkles size={22} className="text-brand" />
                  </div>
                  <p className="text-[13px] text-text-secondary text-center">
                    {tx(locale, "How can I help?", "무엇을 도와드릴까요?", "何かお手伝いできますか？")}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(tx(locale, s.en, s.ko, s.ja))}
                        className="px-3 py-1.5 rounded-full bg-surface-secondary text-[11px] font-medium text-text-secondary hover:bg-brand-lighter hover:text-brand transition-colors"
                      >
                        {tx(locale, s.en, s.ko, s.ja)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Message bubbles */}
              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} locale={locale} />
              ))}

              {/* Typing indicator */}
              {isTyping && (
                <div className="flex items-center gap-2 py-2">
                  <div className="h-7 w-7 rounded-full bg-brand-lighter flex items-center justify-center shrink-0">
                    <Sparkles size={12} className="text-brand" />
                  </div>
                  <div className="flex items-center gap-1 px-3 py-2 rounded-xl bg-surface-secondary">
                    <Loader2 size={12} className="text-brand animate-spin" />
                    <span className="text-[11px] text-text-tertiary">
                      {tx(locale, "Thinking...", "생각하는 중...", "考え中...")}
                    </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* ── Input area ── */}
            <div className="px-3 py-3 border-t border-border bg-white shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  onKeyDown={handleKeyDown}
                  placeholder={tx(locale, "Type a message...", "메시지를 입력하세요...", "メッセージを入力...")}
                  rows={1}
                  className="flex-1 resize-none rounded-xl border border-border bg-surface-secondary px-3 py-2.5 text-[13px] text-text placeholder:text-text-tertiary focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 transition-all max-h-20"
                  style={{ fieldSizing: "content" } as React.CSSProperties}
                />
                <button
                  onClick={handleSend}
                  disabled={isTyping}
                  className={cn(
                    "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-all",
                    isTyping
                      ? "bg-surface-secondary text-text-tertiary cursor-not-allowed"
                      : "bg-brand text-white hover:bg-brand-active",
                  )}
                >
                  <Send size={15} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Simple Markdown Renderer ────────────────────────────────────────────────

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Table detection: line with | separators
    if (line.includes("|") && line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      // Skip separator row (|---|---|)
      const dataRows = tableLines.filter((l) => !/^\|[\s-:|]+\|$/.test(l.trim()));
      if (dataRows.length > 0) {
        const parseRow = (row: string) =>
          row.split("|").filter((_, idx, arr) => idx > 0 && idx < arr.length - 1).map((c) => c.trim());
        const headerCells = parseRow(dataRows[0]);
        const bodyRows = dataRows.slice(1).map(parseRow);
        elements.push(
          <div key={`tbl-${i}`} className="overflow-x-auto my-1.5">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="bg-surface-secondary">
                  {headerCells.map((cell, ci) => (
                    <th key={ci} className="px-2 py-1 text-left font-semibold border-b border-border">
                      <MdInline text={cell} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 1 ? "bg-surface-secondary/50" : ""}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-2 py-1 border-b border-border/50">
                        <MdInline text={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
      }
      continue;
    }

    // Heading (### > ## > #)
    const headingMatch = /^(#{1,3})\s+(.+)/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const cls = level === 1 ? "text-[14px] font-bold" : level === 2 ? "text-[13px] font-bold" : "text-[12px] font-semibold";
      elements.push(<p key={i} className={`${cls} mt-2 mb-1`}><MdInline text={headingMatch[2]} /></p>);
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      elements.push(
        <div key={i} className="border-l-2 border-brand/40 pl-2 my-1 text-text-secondary italic">
          <MdInline text={line.slice(2)} />
        </div>,
      );
      i++;
      continue;
    }

    // Unordered list item
    if (/^[-*]\s+/.test(line.trim())) {
      elements.push(
        <div key={i} className="flex gap-1.5 ml-1">
          <span className="text-brand mt-0.5">•</span>
          <span><MdInline text={line.trim().replace(/^[-*]\s+/, "")} /></span>
        </div>,
      );
      i++;
      continue;
    }

    // Ordered list item
    const olMatch = /^(\d+)\.\s+(.+)/.exec(line.trim());
    if (olMatch) {
      elements.push(
        <div key={i} className="flex gap-1.5 ml-1">
          <span className="text-brand font-semibold min-w-[16px]">{olMatch[1]}.</span>
          <span><MdInline text={olMatch[2]} /></span>
        </div>,
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={i} className="my-2 border-border" />);
      i++;
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      elements.push(<div key={i} className="h-1.5" />);
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(<p key={i}><MdInline text={line} /></p>);
    i++;
  }

  return <>{elements}</>;
}

/** Inline markdown: **bold**, *italic*, `code`, <br> */
function MdInline({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|<br\s*\/?>)/g;
  let last = 0;
  let match;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[0].startsWith("<br")) parts.push(<br key={key++} />);
    else if (match[2]) parts.push(<strong key={key++} className="font-semibold">{match[2]}</strong>);
    else if (match[3]) parts.push(<em key={key++}>{match[3]}</em>);
    else if (match[4]) parts.push(<code key={key++} className="px-1 py-0.5 bg-surface-secondary rounded text-[11px] font-mono">{match[4]}</code>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

// ─── Message Bubble ─────────────────────────────────────────────────────────

function MessageBubble({ msg, locale }: { msg: ChatMessage; locale: string }) {
  const isUser = msg.role === "user";
  const { setFeedback } = useChatStore();

  const handleFeedback = async (rating: 1 | -1) => {
    if (!msg.conversationId || msg.feedback === rating) return;
    setFeedback(msg.id, rating);
    try {
      await fetch("/api/ai/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: msg.conversationId, rating }),
      });
    } catch { /* silent */ }
  };

  return (
    <div className={cn("flex gap-2", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      {!isUser && (
        <div className="h-7 w-7 rounded-full bg-brand-lighter flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles size={12} className="text-brand" />
        </div>
      )}

      <div className={cn("max-w-[85%] space-y-2", isUser && "items-end")}>
        {/* Text bubble */}
        <div
          className={cn(
            "px-3 py-2 rounded-xl text-[13px] leading-relaxed",
            isUser
              ? "bg-brand text-white rounded-br-sm whitespace-pre-wrap"
              : "bg-surface-secondary text-text rounded-bl-sm",
          )}
        >
          {isUser ? msg.content : renderMarkdown(msg.content)}
        </div>

        {/* Feedback buttons (assistant only) */}
        {!isUser && msg.conversationId && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleFeedback(1)}
              className={cn(
                "p-1 rounded-md transition-colors",
                msg.feedback === 1
                  ? "text-safety-low bg-green-50"
                  : "text-text-tertiary hover:text-safety-low hover:bg-green-50",
              )}
            >
              <ThumbsUp size={12} />
            </button>
            <button
              onClick={() => handleFeedback(-1)}
              className={cn(
                "p-1 rounded-md transition-colors",
                msg.feedback === -1
                  ? "text-safety-high bg-risk-bg"
                  : "text-text-tertiary hover:text-safety-high hover:bg-risk-bg",
              )}
            >
              <ThumbsDown size={12} />
            </button>
          </div>
        )}

        {/* Action result cards */}
        {msg.actions && msg.actions.length > 0 && (
          <div className="space-y-1.5">
            {msg.actions.map((action, i) => (
              <ActionCard key={i} action={action} locale={locale} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Action Result Card ─────────────────────────────────────────────────────

function ActionCard({ action, locale }: { action: ChatAction; locale: string }) {
  const success = (action.result as Record<string, unknown>)?.success !== false;
  const Icon = success ? CheckCircle : AlertTriangle;

  // User-friendly tool name mapping (never show raw tool names)
  const toolDisplayNames: Record<string, { en: string; ko: string; ja: string }> = {
    getProjectSummary: { en: "Project Summary", ko: "프로젝트 현황 조회", ja: "プロジェクト概要" },
    getHardwareList: { en: "Hardware List", ko: "하드웨어 목록 조회", ja: "ハードウェア一覧" },
    getSoftwareList: { en: "Software List", ko: "소프트웨어 목록 조회", ja: "ソフトウェア一覧" },
    addHardware: { en: "Add Hardware", ko: "하드웨어 추가", ja: "ハードウェア追加" },
    addSoftware: { en: "Add Software", ko: "소프트웨어 추가", ja: "ソフトウェア追加" },
    generateDFD: { en: "Generate DFD", ko: "DFD 생성", ja: "DFD生成" },
    getAssessmentStatus: { en: "Assessment Status", ko: "평가 현황 조회", ja: "評価状況" },
    setAssessmentResult: { en: "Set Assessment", ko: "평가 결과 설정", ja: "評価結果設定" },
    generateDocument: { en: "Generate Document", ko: "문서 생성", ja: "文書生成" },
    getReadiness: { en: "Readiness Check", ko: "제출 준비 확인", ja: "提出準備確認" },
    getVendorEquipmentStatus: { en: "Vendor Equipment Status", ko: "벤더별 기자재 현황", ja: "ベンダー機材状況" },
    getProjectList: { en: "Project List", ko: "프로젝트 목록 조회", ja: "プロジェクト一覧" },
  };

  const toolEntry = toolDisplayNames[action.tool];
  const displayName = action.label || (
    toolEntry
      ? tx(locale, toolEntry.en, toolEntry.ko, toolEntry.ja)
      : tx(locale, "Action performed", "작업 수행", "アクション実行")
  );

  // Resolve link for navigation
  const toolLinks: Record<string, string> = {
    addHardware: "inventory",
    addSoftware: "inventory",
    generateDFD: "inventory",
    generateDocument: "document",
    setAssessmentResult: "assess",
  };
  const linkSegment = toolLinks[action.tool];

  return (
    <div className={cn(
      "px-3 py-2 rounded-lg border text-[11px]",
      success
        ? "bg-green-50 border-green-200"
        : "bg-risk-bg border-red-200",
    )}>
      <div className="flex items-center gap-1.5">
        <Icon size={12} className={success ? "text-safety-low" : "text-safety-high"} />
        <span className={cn("font-semibold", success ? "text-green-700" : "text-red-700")}>
          {displayName}
        </span>
      </div>
      {linkSegment && (
        <button className="mt-1 flex items-center gap-1 text-brand hover:underline text-[10px]">
          <ExternalLink size={10} />
          {tx(locale, "View", "확인하기", "確認する")}
        </button>
      )}
    </div>
  );
}
