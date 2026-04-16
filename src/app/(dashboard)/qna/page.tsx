"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
// motion removed — layout animation was causing page crash
import {
  MessageSquare, Plus, Send, ChevronDown, Clock,
  CheckCircle, AlertCircle, User, Building2, Shield, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface QnaItem {
  id: string;
  title: string;
  content: string;
  authorName: string;
  authorRole: string;
  targetRole: string;  // who the question is directed to
  status: "PENDING" | "ANSWERED";
  answer?: string;
  answeredBy?: string;
  createdAt: string;
  answeredAt?: string;
}

const ROLE_CFG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType<{size?: number; className?: string}> }> = {
  ADMIN:    { label: "관리자",  color: "#8A3FFC", bg: "#F3EEFF", icon: Shield },
  SHIPYARD: { label: "조선소",  color: "#0F62FE", bg: "#EDF5FF", icon: Building2 },
  VENDOR:   { label: "벤더",   color: "#24A148", bg: "#E6F7EF", icon: User },
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function QnaPage() {
  const { data: session } = useSession();
  const { locale } = useLocaleStore();
  const userRole = (session?.user as { role?: string })?.role || "VENDOR";
  const userName = session?.user?.name || "User";

  const [items, setItems] = useState<QnaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "MY" | "PENDING" | "ANSWERED">("ALL");
  const [newOpen, setNewOpen] = useState(false);
  const [answerOpen, setAnswerOpen] = useState<string | null>(null);

  // Form
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formTarget, setFormTarget] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/qna")
      .then(async (r) => {
        if (r.ok) {
          const d = await r.json();
          // Map API format to component format
          const mapped = (Array.isArray(d) ? d : []).map((q: Record<string, unknown>) => {
            const user = q.user as { name?: string; role?: string; company?: string } | null;
            return {
              id: q.id as string,
              title: q.title as string,
              content: q.content as string,
              authorName: user?.name || "Unknown",
              authorRole: user?.role || "VENDOR",
              targetRole: ((q.targetType as string) || "TO_ADMIN").replace("TO_", ""),
              status: (q.status as string) === "ANSWERED" ? "ANSWERED" as const : "PENDING" as const,
              answer: q.answer as string | undefined,
              answeredBy: q.answeredBy as string | undefined,
              createdAt: q.createdAt as string,
              answeredAt: q.updatedAt as string | undefined,
            };
          });
          setItems(mapped as QnaItem[]);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // Who can this user ask?
  const targetOptions = (() => {
    if (userRole === "VENDOR") return [
      { value: "SHIPYARD", label: tx(locale, "Shipyard", "조선소", "造船所") },
      { value: "ADMIN", label: tx(locale, "Admin (System)", "관리자 (시스템)", "管理者") },
    ];
    if (userRole === "SHIPYARD") return [
      { value: "ADMIN", label: tx(locale, "Admin (System)", "관리자 (시스템)", "管理者") },
    ];
    return []; // Admin doesn't ask, only answers
  })();

  // Who can this user answer?
  const canAnswer = (item: QnaItem) => {
    if (userRole === "ADMIN") return true; // Admin can answer everything
    if (userRole === "SHIPYARD" && item.targetRole === "SHIPYARD") return true; // Shipyard answers vendor questions
    return false;
  };

  const handleCreate = async () => {
    if (!formTitle.trim() || !formContent.trim() || !formTarget) return;
    setSaving(true);
    try {
      const res = await fetch("/api/qna", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: formTitle.trim(), content: formContent.trim(), targetType: `TO_${formTarget}` }),
      });
      if (res.ok) {
        const item = await res.json();
        setItems((prev) => [item, ...prev]);
        setNewOpen(false); setFormTitle(""); setFormContent(""); setFormTarget("");
        showToast.success(tx(locale, "Question posted", "질문이 등록되었습니다", "質問が投稿されました"));
      }
    } finally { setSaving(false); }
  };

  const handleAnswer = async (id: string) => {
    if (!answerText.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/qna", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, answer: answerText.trim() }),
      });
      if (res.ok) {
        setItems((prev) => prev.map((q) => q.id === id ? { ...q, status: "ANSWERED", answer: answerText.trim(), answeredBy: userName, answeredAt: new Date().toISOString() } : q));
        setAnswerOpen(null); setAnswerText("");
        showToast.success(tx(locale, "Answer posted", "답변이 등록되었습니다", "回答が投稿されました"));
      }
    } finally { setSaving(false); }
  };

  const filtered = items.filter((q) => {
    if (filter === "MY") return q.authorName === userName;
    if (filter === "PENDING") return q.status === "PENDING";
    if (filter === "ANSWERED") return q.status === "ANSWERED";
    return true;
  });

  const pendingCount = items.filter((q) => q.status === "PENDING" && canAnswer(q)).length;

  return (
    <div className="max-w-[900px] mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-extrabold text-gray-900 tracking-tight">Q&A</h1>
          <p className="text-[13px] text-gray-500 mt-1">
            {userRole === "VENDOR" && tx(locale, "Ask questions to shipyard or admin", "조선소 또는 관리자에게 질문하세요", "造船所・管理者に質問")}
            {userRole === "SHIPYARD" && tx(locale, "Answer vendor questions & ask admin", "벤더 질문에 답변하고 관리자에게 질문하세요", "ベンダーに回答・管理者に質問")}
            {userRole === "ADMIN" && tx(locale, "Answer all questions", "모든 질문에 답변하세요", "全質問に回答")}
          </p>
        </div>
        {targetOptions.length > 0 && (
          <Button onClick={() => setNewOpen(true)}>
            <Plus size={14} /> {tx(locale, "New Question", "질문하기", "質問する")}
          </Button>
        )}
      </div>

      {/* Pending badge for answerers */}
      {pendingCount > 0 && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-orange-50 border border-orange-200 flex items-center gap-3">
          <AlertCircle size={18} className="text-orange-600" />
          <p className="text-[13px] text-orange-800 font-medium">
            {tx(locale, `${pendingCount} questions waiting for your answer`, `답변 대기 중인 질문이 ${pendingCount}건 있습니다`, `${pendingCount}件の質問が回答待ちです`)}
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-1 mb-6">
        {(["ALL", "PENDING", "ANSWERED", "MY"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors",
              filter === f ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200")}>
            {f === "ALL" ? tx(locale, "All", "전체", "全て") : f === "PENDING" ? tx(locale, "Pending", "대기 중", "待機中") : f === "ANSWERED" ? tx(locale, "Answered", "답변 완료", "回答済") : tx(locale, "My Questions", "내 질문", "自分の質問")}
          </button>
        ))}
      </div>

      {/* Questions list */}
      {loading ? (
        <div className="py-12 text-center text-gray-400">{tx(locale, "Loading...", "로딩 중...", "読込中...")}</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <MessageSquare size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-[14px] text-gray-400">{tx(locale, "No questions yet", "질문이 없습니다", "質問がありません")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((q) => {
            const authorCfg = ROLE_CFG[q.authorRole] || ROLE_CFG.VENDOR;
            const targetCfg = ROLE_CFG[q.targetRole] || ROLE_CFG.ADMIN;
            const isAnswering = answerOpen === q.id;

            return (
              <div key={q.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Question */}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: authorCfg.bg }}>
                      <authorCfg.icon size={14} style={{ color: authorCfg.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[13px] font-bold text-gray-900">{q.title}</span>
                        <span className={cn("px-1.5 py-0.5 rounded text-[8px] font-bold", q.status === "ANSWERED" ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-600")}>
                          {q.status === "ANSWERED" ? tx(locale, "Answered", "답변 완료", "回答済") : tx(locale, "Pending", "대기 중", "待機中")}
                        </span>
                      </div>
                      <p className="text-[12px] text-gray-600 mb-2">{q.content}</p>
                      <div className="flex items-center gap-3 text-[10px] text-gray-400">
                        <span className="font-medium" style={{ color: authorCfg.color }}>{q.authorName} ({authorCfg.label})</span>
                        <span>→</span>
                        <span style={{ color: targetCfg.color }}>{targetCfg.label}</span>
                        <span>{new Date(q.createdAt).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US", { month: "short", day: "numeric" })}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Answer */}
                {q.answer && (
                  <div className="border-t border-gray-100 bg-blue-50/30 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="h-6 w-6 rounded flex items-center justify-center bg-blue-100 shrink-0 mt-0.5">
                        <CheckCircle size={12} className="text-blue-600" />
                      </div>
                      <div>
                        <p className="text-[12px] text-gray-700">{q.answer}</p>
                        <p className="text-[10px] text-gray-400 mt-1">{q.answeredBy} · {q.answeredAt && new Date(q.answeredAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Answer input */}
                {q.status === "PENDING" && canAnswer(q) && !isAnswering && (
                  <div className="border-t border-gray-100 px-4 py-2">
                    <button onClick={() => { setAnswerOpen(q.id); setAnswerText(""); }}
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-700">
                      {tx(locale, "Write Answer", "답변 작성", "回答を作成")}
                    </button>
                  </div>
                )}

                {isAnswering && (
                  <div className="border-t border-gray-100 px-4 py-3 space-y-2">
                    <textarea value={answerText} onChange={(e) => setAnswerText(e.target.value)}
                      placeholder={tx(locale, "Write your answer...", "답변을 작성하세요...", "回答を入力...")}
                      rows={3} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 resize-none" />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setAnswerOpen(null)} className="px-3 py-1.5 text-[11px] text-gray-500 hover:bg-gray-100 rounded-lg">{tx(locale, "Cancel", "취소", "キャンセル")}</button>
                      <button onClick={() => handleAnswer(q.id)} disabled={saving || !answerText.trim()}
                        className="px-3 py-1.5 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 flex items-center gap-1">
                        <Send size={11} /> {tx(locale, "Submit", "등록", "投稿")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* New Question Modal */}
      {newOpen && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onMouseDown={(e) => { if (e.target === e.currentTarget) setNewOpen(false); }}>
          <div className="bg-white rounded-xl p-6 w-[500px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold text-gray-900">{tx(locale, "New Question", "새 질문", "新規質問")}</h3>
              <button onClick={() => setNewOpen(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-gray-500 mb-1 block">{tx(locale, "Ask to", "질문 대상", "質問先")} *</label>
                <select value={formTarget} onChange={(e) => setFormTarget(e.target.value)}
                  className="h-10 w-full rounded-lg border border-gray-200 px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-100 appearance-none">
                  <option value="">{tx(locale, "Select recipient", "대상 선택", "宛先選択")}</option>
                  {targetOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 mb-1 block">{tx(locale, "Title", "제목", "タイトル")} *</label>
                <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)}
                  placeholder={tx(locale, "Brief question title", "질문 제목을 간략히 작성하세요", "質問タイトル")}
                  className="h-10 w-full rounded-lg border border-gray-200 px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 mb-1 block">{tx(locale, "Content", "내용", "内容")} *</label>
                <textarea value={formContent} onChange={(e) => setFormContent(e.target.value)}
                  placeholder={tx(locale, "Describe your question in detail", "질문 내용을 자세히 작성하세요", "質問内容を詳しく記入")}
                  rows={4} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setNewOpen(false)} className="px-4 py-2 text-[12px] text-gray-500 hover:bg-gray-100 rounded-lg">{tx(locale, "Cancel", "취소", "キャンセル")}</button>
              <Button onClick={handleCreate} loading={saving} disabled={!formTitle.trim() || !formContent.trim() || !formTarget}>
                <Send size={13} /> {tx(locale, "Post Question", "질문 등록", "質問投稿")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
