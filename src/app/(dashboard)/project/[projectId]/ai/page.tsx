"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Bot, Send, Sparkles, User, Clipboard, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 mb-4">
      <div className="h-8 w-8 rounded-full bg-brand-lighter flex items-center justify-center shrink-0">
        <Bot size={16} className="text-brand" />
      </div>
      <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-white border border-border shadow-xs">
        <div className="flex items-center gap-1.5 h-4">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-2 w-2 rounded-full bg-border-strong"
              animate={{ y: [0, -6, 0] }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                delay: i * 0.15,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  locale,
}: {
  msg: Message;
  locale: string;
}) {
  const isUser = msg.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [msg.content]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={cn("flex items-end gap-2 mb-4 group", isUser && "flex-row-reverse")}
    >
      {/* Avatar */}
      <div
        className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
          isUser ? "bg-brand-hover" : "bg-brand-lighter",
        )}
      >
        {isUser ? (
          <User size={15} className="text-white" />
        ) : (
          <Bot size={15} className="text-brand" />
        )}
      </div>

      {/* Bubble */}
      <div className={cn("max-w-[72%] relative", isUser && "items-end flex flex-col")}>
        <div
          className={cn(
            "px-4 py-3 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap break-words",
            isUser
              ? "bg-brand-hover text-white rounded-br-sm shadow-sm"
              : "bg-white text-text border border-border rounded-bl-sm shadow-xs",
          )}
        >
          {msg.content}
        </div>

        {/* Meta row */}
        <div
          className={cn(
            "flex items-center gap-2 mt-1 px-1",
            isUser ? "flex-row-reverse" : "flex-row",
          )}
        >
          <span className="text-[10px] text-border-strong">
            {formatDateTime(msg.createdAt)}
          </span>
          {!isUser && (
            <button
              onClick={handleCopy}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-border-strong hover:text-text-tertiary"
              title={tx(locale, "Copy", "복사", "コピー")}
            >
              {copied ? (
                <Check size={12} className="text-safety-low" />
              ) : (
                <Clipboard size={12} />
              )}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Suggested prompts ────────────────────────────────────────────────────────

const SUGGESTIONS_KO = [
  "SC-1 물리적 보안 요구사항을 설명해주세요",
  "DFD 다이어그램 생성을 도와주세요",
  "E27 문서 작성 절차를 안내해주세요",
  "SC-13 보안 패치 관리 체크리스트",
];

const SUGGESTIONS_EN = [
  "Explain SC-1 physical security requirements",
  "Help me create a DFD diagram",
  "Guide me through E27 document preparation",
  "SC-13 security patch management checklist",
];

const SUGGESTIONS_JA = [
  "SC-1の物理的セキュリティ要件を説明してください",
  "DFDダイアグラムの作成を手伝ってください",
  "E27文書作成の手順を案内してください",
  "SC-13セキュリティパッチ管理チェックリスト",
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AIAssistantPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const eqParams = useSearchParams();
  const equipmentId = eqParams.get("equipmentId");
  const { data: session, status: sessionStatus } = useSession();
  const { locale } = useLocaleStore();

  // session is used for context; role not needed for AI page (all roles can use)
  void session;
  void sessionStatus;

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── Load history ─────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/projects/${projectId}/ai`);
        if (res.ok) {
          const data: Message[] = await res.json();
          setMessages(data);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [projectId]);

  // ─── Auto scroll ──────────────────────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // ─── Auto-resize textarea ─────────────────────────────────────────────────

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      // Auto-resize
      const el = e.target;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    },
    [],
  );

  // ─── Send message ─────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: Message = {
      id: `local-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, projectId }),
      });

      if (res.ok) {
        const data: { message: Message } = await res.json();
        setMessages((prev) => [...prev, data.message]);
      } else {
        showToast.error(tx(locale, "Failed to get response", "응답을 받지 못했습니다", "応答を取得できませんでした"));
        // Remove optimistic user message on failure
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        setInput(text);
      }
    } catch {
      showToast.error(tx(locale, "Network error", "네트워크 오류", "ネットワークエラー"));
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      setInput(text);
    } finally {
      setSending(false);
    }
  }, [input, sending, projectId, locale]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleSuggestion = useCallback((prompt: string) => {
    setInput(prompt);
    textareaRef.current?.focus();
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col" style={{ minHeight: "calc(100vh - 64px)" }}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col flex-1"
      >
        {/* Back */}
        <Link
          href={equipmentId ? `/project/${projectId}/equipment/${equipmentId}` : `/project/${projectId}`}
          className="inline-flex items-center gap-1 text-[12px] text-text-tertiary hover:text-brand transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          {equipmentId ? (tx(locale, "Equipment", "기자재", "機器")) : (tx(locale, "Project", "프로젝트", "プロジェクト"))}
        </Link>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-11 w-11 rounded-xl bg-brand-lighter flex items-center justify-center">
            <Sparkles size={20} className="text-brand" />
          </div>
          <div>
            <h1 className="text-[22px] font-extrabold text-text tracking-tight">
              {tx(locale, "AI Security Assistant", "AI 보안 어시스턴트", "AIセキュリティアシスタント")}
            </h1>
            <p className="text-[13px] text-text-tertiary mt-0.5">
              {tx(locale, "IACS UR E27/E26 compliance expert", "IACS UR E27/E26 전문 가이드", "IACS UR E27/E26コンプライアンス専門ガイド")}
            </p>
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 rounded-2xl border border-border bg-surface-sidebar overflow-hidden flex flex-col shadow-xs">
          {/* Messages scroll area */}
          <div className="flex-1 overflow-y-auto px-5 py-5">
            {loading ? (
              // Loading skeleton
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={cn("flex items-end gap-2", i % 2 === 0 && "flex-row-reverse")}
                  >
                    <div className="h-8 w-8 rounded-full bg-surface-secondary shrink-0" />
                    <div
                      className="h-10 rounded-2xl bg-surface-secondary"
                      style={{ width: `${40 + i * 12}%` }}
                    />
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              // Empty state with guide
              <div className="h-full flex flex-col items-center justify-center py-8">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="h-16 w-16 rounded-2xl bg-brand-lighter flex items-center justify-center mb-4"
                >
                  <Bot size={32} className="text-brand" />
                </motion.div>
                <p className="text-[15px] font-bold text-text mb-2">
                  {tx(locale, "How can I help you?", "무엇을 도와드릴까요?", "お手伝いできることはありますか？")}
                </p>
                <p className="text-[13px] text-text-tertiary text-center max-w-sm leading-relaxed mb-6">
                  {tx(locale, "I can help with SC-1 to SC-13 security guides, DFD creation, and document preparation", "SC-1~SC-13 보안 가이드, DFD 생성, 문서 작성을 도와드립니다", "SC-1〜SC-13セキュリティガイド、DFD作成、文書作成をサポートします")}
                </p>

                {/* Suggestion chips */}
                <div className="flex flex-wrap gap-2 justify-center max-w-md">
                  {(locale === "ko" ? SUGGESTIONS_KO : locale === "ja" ? SUGGESTIONS_JA : SUGGESTIONS_EN).map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSuggestion(s)}
                      className="px-3 py-2 rounded-xl border border-border bg-white text-[12px] text-text-secondary hover:border-brand/40 hover:bg-brand-lighter hover:text-brand transition-all duration-200 text-left"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} locale={locale} />
                ))}

                {/* Typing indicator */}
                <AnimatePresence>
                  {sending && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                    >
                      <TypingIndicator />
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}

            {/* Scroll anchor */}
            <div ref={bottomRef} />
          </div>

          {/* Suggestion row (when messages exist) */}
          {messages.length > 0 && !loading && (
            <div className="px-4 py-2 border-t border-border bg-white overflow-x-auto scrollbar-hide">
              <div className="flex gap-2">
                {(locale === "ko" ? SUGGESTIONS_KO : locale === "ja" ? SUGGESTIONS_JA : SUGGESTIONS_EN).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSuggestion(s)}
                    className="whitespace-nowrap px-3 py-1.5 rounded-full border border-border text-[11px] text-text-tertiary hover:border-brand/40 hover:text-brand hover:bg-brand-lighter transition-all duration-200 shrink-0"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input row */}
          <div className="border-t border-border bg-white px-4 py-3">
            <div className="flex items-end gap-3">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  tx(locale, "Ask a security question… (Shift+Enter for newline)", "보안 관련 질문을 입력하세요… (Shift+Enter 줄바꿈)", "セキュリティに関する質問を入力してください…（Shift+Enterで改行）")
                }
                rows={1}
                disabled={sending}
                aria-label={tx(locale, "Message input", "메시지 입력", "メッセージ入力")}
                className={cn(
                  "flex-1 resize-none rounded-xl border border-border px-4 py-3",
                  "text-[14px] text-text placeholder:text-border-strong",
                  "focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand",
                  "transition-all duration-200 bg-white",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "leading-relaxed overflow-hidden",
                )}
                style={{ minHeight: "46px", maxHeight: "160px" }}
              />
              <Button
                variant="primary"
                size="icon"
                disabled={!input.trim() || sending}
                onClick={handleSend}
                aria-label={tx(locale, "Send", "전송", "送信")}
                className="shrink-0 h-[46px] w-[46px] rounded-xl"
              >
                <Send size={17} />
              </Button>
            </div>
            <p className="text-[10px] text-border-strong mt-1.5 px-1">
              {tx(locale, "AI-generated content requires review. Always refer to official IACS UR E27/E26 documents.", "AI가 생성한 내용은 검토가 필요합니다. IACS UR E27/E26 공식 문서를 참조하세요.", "AI生成コンテンツは確認が必要です。IACS UR E27/E26公式文書を参照してください。")}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
