"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircleQuestion, X, Send, CheckCircle, Clock,
  ArrowRight, Search, HelpCircle, ChevronDown, MessageSquare,
} from "lucide-react";
import Link from "next/link";
import { useLocaleStore } from "@/stores/locale-store";
import { useSession } from "next-auth/react";
import { tx } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { showToast } from "@/lib/toast";

interface QnaItem {
  id: string;
  title: string;
  content: string;
  status: string;
  answer: string | null;
  targetType: string;
  userId: string;
  createdAt: string;
  user?: { id: string; name: string; email: string };
}

interface FaqItem {
  id: number;
  question: string;
  answer: string;
  category: string;
}

const PAGE_SIZE = 10;

export function QnAWidget() {
  const { locale } = useLocaleStore();
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role || "VENDOR";
  // Staff = those who answer questions. SHIPYARD (viewer) is read-only.
  const isStaff = userRole === "ADMIN" || userRole === "SUPPORT";

  const [open, setOpen] = useState(false);
  const [qnas, setQnas] = useState<QnaItem[]>([]);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<string>(isStaff ? "pending" : "qna");
  const [search, setSearch] = useState("");
  const [showCount, setShowCount] = useState(PAGE_SIZE);

  // Vendor: new question form
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Staff: answer form
  const [answerTarget, setAnswerTarget] = useState<QnaItem | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [answering, setAnswering] = useState(false);

  // FAQ expand
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [qnaRes, faqRes] = await Promise.all([
      fetch("/api/qna").then(async (r) => r.ok ? await r.json() : []),
      fetch("/api/faq").then(async (r) => r.ok ? await r.json() : []),
    ]);
    setQnas(Array.isArray(qnaRes) ? qnaRes : []);
    setFaqs(Array.isArray(faqRes) ? faqRes : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      queueMicrotask(() => { fetchData(); setShowCount(PAGE_SIZE); });
    }
  }, [open, fetchData]);

  // Reset tab based on role when opening
  useEffect(() => {
    if (open) {
      const target = isStaff ? "pending" : "qna";
      queueMicrotask(() => setTab(target));
    }
  }, [open, isStaff]);

  // Vendor: submit question
  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) return;
    setSubmitting(true);
    const res = await fetch("/api/qna", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), content: content.trim(), targetType: "TO_ADMIN" }),
    });
    if (res.ok) {
      showToast.success(tx(locale, "Question submitted", "질문이 등록되었습니다", "質問が登録されました"));
      setTitle(""); setContent(""); setTab("qna"); fetchData();
    } else {
      showToast.error(tx(locale, "Failed to submit", "등록 실패", "送信失敗"));
    }
    setSubmitting(false);
  };

  // Staff: answer question
  const handleAnswer = async () => {
    if (!answerTarget || !answerText.trim()) return;
    setAnswering(true);
    const res = await fetch(`/api/qna/${answerTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: answerText.trim(), status: "ANSWERED" }),
    });
    if (res.ok) {
      showToast.success(tx(locale, "Answer submitted", "답변이 등록되었습니다", "回答が送信されました"));
      setAnswerTarget(null); setAnswerText(""); fetchData();
    } else {
      showToast.error(tx(locale, "Failed", "실패", "失敗"));
    }
    setAnswering(false);
  };

  // Counts
  const pendingCount = qnas.filter((q) => q.status === "OPEN" || (!q.answer && q.status !== "ANSWERED")).length;
  const answeredCount = qnas.filter((q) => q.status === "ANSWERED" && q.answer).length;

  // Badge: vendor sees answered count, staff sees pending count
  const badgeCount = isStaff ? pendingCount : answeredCount;

  // Filtered lists
  const filteredQnas = useMemo(() => {
    let list = qnas;
    if (tab === "pending") list = qnas.filter((q) => !q.answer || q.status !== "ANSWERED");
    if (tab === "answered") list = qnas.filter((q) => q.status === "ANSWERED" && q.answer);
    if (!search) return list;
    const s = search.toLowerCase();
    return list.filter((q) => q.title.toLowerCase().includes(s) || q.content.toLowerCase().includes(s) || q.user?.name.toLowerCase().includes(s));
  }, [qnas, search, tab]);

  const filteredFaqs = useMemo(() => {
    if (!search) return faqs;
    const s = search.toLowerCase();
    return faqs.filter((f) => f.question.toLowerCase().includes(s) || f.answer.toLowerCase().includes(s));
  }, [faqs, search]);

  const visibleQnas = filteredQnas.slice(0, showCount);
  const hasMore = filteredQnas.length > showCount;

  // Tabs differ by role
  const tabs = isStaff
    ? [
        { key: "pending", label: tx(locale, "Pending", "답변 대기", "未回答"), count: pendingCount },
        { key: "answered", label: tx(locale, "Answered", "답변 완료", "回答済み"), count: answeredCount },
        { key: "faq", label: "FAQ", count: faqs.length },
      ]
    : [
        { key: "qna", label: "Q&A", count: qnas.length },
        { key: "new", label: tx(locale, "Ask", "질문하기", "質問"), count: 0 },
        { key: "faq", label: "FAQ", count: faqs.length },
      ];

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed bottom-5 right-5 z-50 h-12 w-12 rounded-full flex items-center justify-center shadow-lg transition-all duration-300",
          open ? "bg-text text-white scale-95" : "bg-brand text-white hover:bg-brand-hover hover:scale-105 hover:shadow-xl",
        )}
      >
        {open ? <X size={20} /> : <MessageCircleQuestion size={22} />}
        {!open && badgeCount > 0 && (
          <span className={cn("absolute -top-1 -right-1 h-5 min-w-[20px] px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center",
            isStaff ? "bg-[#EB6200]" : "bg-[#DA1E28]"
          )}>
            {badgeCount}
          </span>
        )}
      </button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-20 right-3 sm:right-5 z-50 w-[calc(100vw-24px)] sm:w-[400px] max-h-[560px] bg-white rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-[14px] font-bold text-text flex items-center gap-2">
                  <MessageCircleQuestion size={16} className="text-brand" />
                  {isStaff ? tx(locale, "Q&A Management", "Q&A 관리", "Q&A管理") : tx(locale, "Help & Q&A", "도움말 & Q&A", "ヘルプ & Q&A")}
                </h3>
                <Link href={`/guidance?tab=${tab === "faq" ? "faq" : "qna"}`} onClick={() => setOpen(false)}
                  className="text-[10px] text-brand font-medium hover:underline flex items-center gap-0.5">
                  {tx(locale, "View all", "전체 보기", "すべて表示")} <ArrowRight size={10} />
                </Link>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 mb-2.5">
                {tabs.map((t) => (
                  <button key={t.key} onClick={() => { setTab(t.key); setSearch(""); setShowCount(PAGE_SIZE); setAnswerTarget(null); }}
                    className={cn("px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1",
                      tab === t.key ? "bg-brand text-white" : "text-text-tertiary hover:bg-surface-secondary"
                    )}>
                    {t.label}
                    {t.count > 0 && <span className={cn("text-[9px]", tab === t.key ? "text-white/70" : "text-text-tertiary")}>{t.count}</span>}
                  </button>
                ))}
              </div>

              {/* Search */}
              {tab !== "new" && !answerTarget && (
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
                  <input value={search} onChange={(e) => { setSearch(e.target.value); setShowCount(PAGE_SIZE); }}
                    placeholder={tx(locale, "Search...", "검색...", "検索...")}
                    className="w-full h-8 pl-8 pr-3 rounded-lg border border-border text-[11px] text-text focus:outline-none focus:ring-1 focus:ring-brand/30 bg-surface-page/50" />
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">

              {/* ── Answer form (staff, inline) ─── */}
              {answerTarget && (
                <div className="p-4 space-y-3">
                  <button onClick={() => setAnswerTarget(null)} className="text-[10px] text-brand font-medium hover:underline">
                    ← {tx(locale, "Back to list", "목록으로", "一覧へ")}
                  </button>
                  <div className="p-3 rounded-lg bg-surface-page/50 border border-border">
                    <p className="text-[12px] font-semibold text-text mb-1">{answerTarget.title}</p>
                    <p className="text-[11px] text-text-secondary">{answerTarget.content}</p>
                    <p className="text-[9px] text-text-tertiary mt-2">{answerTarget.user?.name} · {new Date(answerTarget.createdAt).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US")}</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mb-1.5 block">
                      {tx(locale, "Your Answer", "답변 내용", "回答内容")}
                    </label>
                    <textarea value={answerText} onChange={(e) => setAnswerText(e.target.value)}
                      placeholder={tx(locale, "Write your answer...", "답변을 작성하세요...", "回答を入力...")}
                      rows={4}
                      className="w-full px-3 py-2 rounded-lg border border-border text-[12px] text-text resize-none focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                    />
                  </div>
                  <button onClick={handleAnswer} disabled={answering || !answerText.trim()}
                    className="w-full h-9 rounded-lg bg-brand text-white text-[12px] font-semibold hover:bg-brand-hover transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
                    {answering
                      ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <><Send size={13} /> {tx(locale, "Submit Answer", "답변 등록", "回答送信")}</>
                    }
                  </button>
                </div>
              )}

              {/* ── Q&A List (pending/answered/all) ─── */}
              {(tab === "qna" || tab === "pending" || tab === "answered") && !answerTarget && (
                loading ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="h-5 w-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : filteredQnas.length === 0 ? (
                  <div className="py-10 text-center">
                    <MessageCircleQuestion size={24} className="mx-auto text-text-tertiary mb-2" />
                    <p className="text-[12px] text-text-tertiary">
                      {tab === "pending"
                        ? tx(locale, "No pending questions", "답변 대기 질문이 없습니다", "未回答の質問はありません")
                        : search
                        ? tx(locale, "No matching questions", "검색 결과가 없습니다", "一致する質問がありません")
                        : tx(locale, "No questions yet", "질문이 없습니다", "質問がありません")
                      }
                    </p>
                    {!isStaff && !search && (
                      <button onClick={() => setTab("new")} className="mt-2 text-[11px] text-brand font-medium hover:underline">
                        {tx(locale, "Ask your first question", "첫 질문을 등록하세요", "最初の質問をどうぞ")}
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="divide-y divide-border/50">
                      {visibleQnas.map((q) => {
                        const isAnswered = q.status === "ANSWERED" && q.answer;
                        return (
                          <div key={q.id} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-page/50 transition-colors">
                            <div className={cn("h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                              isAnswered ? "bg-[#E6F7EF]" : "bg-[#FFF3E0]"
                            )}>
                              {isAnswered ? <CheckCircle size={12} className="text-[#24A148]" /> : <Clock size={12} className="text-[#EB6200]" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-semibold text-text truncate">{q.title}</p>
                              <p className="text-[10px] text-text-tertiary mt-0.5 truncate">
                                {q.user?.name} · {isAnswered
                                  ? <span className="text-[#24A148] font-medium">{tx(locale, "Answered", "답변 완료", "回答済み")}</span>
                                  : <span className="text-[#EB6200] font-medium">{tx(locale, "Waiting", "대기 중", "待機中")}</span>
                                }
                              </p>
                              {/* Show answer preview for answered items */}
                              {isAnswered && q.answer && (
                                <p className="text-[10px] text-text-secondary mt-1 line-clamp-2 bg-surface-page/50 rounded px-2 py-1">{q.answer}</p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <span className="text-[9px] text-text-tertiary">
                                {new Date(q.createdAt).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US", { month: "short", day: "numeric" })}
                              </span>
                              {/* Staff: answer button */}
                              {isStaff && !isAnswered && (
                                <button onClick={() => { setAnswerTarget(q); setAnswerText(""); }}
                                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold text-brand bg-brand-lighter/50 hover:bg-brand-lighter transition-colors">
                                  <MessageSquare size={10} /> {tx(locale, "Answer", "답변", "回答")}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {hasMore && (
                      <button onClick={() => setShowCount((c) => c + PAGE_SIZE)}
                        className="w-full py-2.5 text-[11px] font-medium text-brand hover:bg-surface-page/50 transition-colors flex items-center justify-center gap-1 border-t border-border/50">
                        <ChevronDown size={12} />
                        {tx(locale, "Show more", "더보기", "もっと見る")} ({filteredQnas.length - showCount} {tx(locale, "remaining", "개 남음", "件残り")})
                      </button>
                    )}
                  </>
                )
              )}

              {/* ── FAQ List ─── */}
              {tab === "faq" && !answerTarget && (
                loading ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="h-5 w-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : filteredFaqs.length === 0 ? (
                  <div className="py-10 text-center">
                    <HelpCircle size={24} className="mx-auto text-text-tertiary mb-2" />
                    <p className="text-[12px] text-text-tertiary">
                      {search ? tx(locale, "No matching FAQ", "검색 결과가 없습니다", "一致するFAQがありません") : tx(locale, "No FAQ available", "FAQ가 없습니다", "FAQがありません")}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {filteredFaqs.map((f) => (
                      <div key={f.id}>
                        <button onClick={() => setExpandedFaq(expandedFaq === f.id ? null : f.id)}
                          className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-surface-page/50 transition-colors">
                          <HelpCircle size={14} className="text-brand shrink-0 mt-0.5" />
                          <p className="text-[12px] font-semibold text-text flex-1">{f.question}</p>
                          <ChevronDown size={14} className={cn("text-text-tertiary shrink-0 transition-transform", expandedFaq === f.id && "rotate-180")} />
                        </button>
                        <AnimatePresence>
                          {expandedFaq === f.id && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                              <div className="px-4 pb-3 pl-11">
                                <p className="text-[11px] text-text-secondary leading-relaxed">{f.answer}</p>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* ── New Question Form (vendor only) ─── */}
              {tab === "new" && !isStaff && (
                <div className="p-4 space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mb-1.5 block">
                      {tx(locale, "Title", "제목", "タイトル")}
                    </label>
                    <input value={title} onChange={(e) => setTitle(e.target.value)}
                      placeholder={tx(locale, "Brief question title", "질문 제목을 입력하세요", "質問タイトル")}
                      className="w-full h-9 px-3 rounded-lg border border-border text-[12px] text-text focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mb-1.5 block">
                      {tx(locale, "Details", "상세 내용", "詳細")}
                    </label>
                    <textarea value={content} onChange={(e) => setContent(e.target.value)}
                      placeholder={tx(locale, "Describe your question in detail...", "질문 내용을 상세히 작성해주세요...", "詳しく記述してください...")}
                      rows={4}
                      className="w-full px-3 py-2 rounded-lg border border-border text-[12px] text-text resize-none focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" />
                  </div>
                  <button onClick={handleSubmit} disabled={submitting || !title.trim() || !content.trim()}
                    className="w-full h-9 rounded-lg bg-brand text-white text-[12px] font-semibold hover:bg-brand-hover transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
                    {submitting
                      ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <><Send size={13} /> {tx(locale, "Submit Question", "질문 등록", "質問送信")}</>
                    }
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
