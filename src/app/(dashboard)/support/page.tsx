"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import {
  Headphones, Inbox, MessageSquare, ArrowRight, Clock,
  Package, HelpCircle,
} from "lucide-react";
import Link from "next/link";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonTable } from "@/components/ui/skeleton";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PendingSubmission {
  id: string;
  equipmentName: string;
  vendorName: string;
  projectName: string;
  projectId: string;
  submittedAt: string;
  status: string;
}

interface UnansweredQna {
  id: string;
  question: string;
  authorName: string;
  createdAt: string;
  equipmentId: string | null;
  projectId: string | null;
}

interface SupportData {
  pendingSubmissions: PendingSubmission[];
  unansweredQna: UnansweredQna[];
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SupportPage() {
  const { data: session, status } = useSession();
  const { locale } = useLocaleStore();
  const [data, setData] = useState<SupportData | null>(null);
  const [loading, setLoading] = useState(true);

  const userRole = (session?.user as { role?: string })?.role;

  useEffect(() => {
    fetch("/api/support/dashboard")
      .then(async (r) => { if (r.ok) setData(await r.json()); })
      .finally(() => setLoading(false));
  }, []);

  if (status === "loading" || loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <SkeletonTable rows={3} />
        <SkeletonTable rows={3} />
      </div>
    );
  }

  if (userRole !== "ADMIN" && userRole !== "SHIPYARD") {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <EmptyState icon={Headphones} title={tx(locale, "Access denied", "접근 권한이 없습니다", "アクセスが拒否されました")} />
      </div>
    );
  }

  const submissions = data?.pendingSubmissions ?? [];
  const qna = data?.unansweredQna ?? [];

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
          {tx(locale, "Support Dashboard", "서포트 대시보드", "サポートダッシュボード")}
        </h1>
        <p className="text-body-sm text-text-tertiary mt-1">
          {tx(locale, "Review pending submissions and unanswered Q&A", "미처리 제출물과 미답변 Q&A를 확인합니다", "未処理提出物と未回答Q&Aを確認します")}
        </p>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-[8px] border border-border shadow-xs p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
            <Inbox size={18} className="text-safety-elevated" />
          </div>
          <div>
            <p className="text-[22px] font-extrabold text-text">{submissions.length}</p>
            <p className="text-body-xs text-text-tertiary">{tx(locale, "Pending Submissions", "미처리 제출물", "未処理提出物")}</p>
          </div>
        </div>
        <div className="bg-white rounded-[8px] border border-border shadow-xs p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-brand-lighter flex items-center justify-center shrink-0">
            <MessageSquare size={18} className="text-brand" />
          </div>
          <div>
            <p className="text-[22px] font-extrabold text-text">{qna.length}</p>
            <p className="text-body-xs text-text-tertiary">{tx(locale, "Unanswered Q&A", "미답변 Q&A", "未回答Q&A")}</p>
          </div>
        </div>
      </div>

      {/* Pending Submissions */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-body-sm font-bold text-text flex items-center gap-2">
            <Inbox size={16} className="text-safety-elevated" />
            {tx(locale, "Pending Submissions", "미처리 제출물", "未処理提出物")}
          </h2>
          {submissions.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-orange-50 text-safety-elevated text-[11px] font-bold">
              {submissions.length}
            </span>
          )}
        </div>

        {submissions.length === 0 ? (
          <Card padding="none">
            <div className="py-10 flex flex-col items-center gap-2 text-center">
              <Package size={24} className="text-text-tertiary/40" />
              <p className="text-body-xs text-text-tertiary">{tx(locale, "All submissions are processed", "모든 제출물이 처리되었습니다", "全ての提出物が処理されました")}</p>
            </div>
          </Card>
        ) : (
          <Card padding="none">
            <div className="divide-y divide-border">
              {submissions.map((sub, i) => (
                <motion.div
                  key={sub.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.04 }}
                >
                  <Link
                    href={`/project/${sub.projectId}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-surface-secondary/30 transition-colors group"
                  >
                    <div className="h-9 w-9 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                      <Package size={16} className="text-safety-elevated" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm font-semibold text-text">{sub.equipmentName}</p>
                      <p className="text-body-xs text-text-tertiary">
                        {sub.vendorName} · {sub.projectName}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-1 text-[11px] text-text-tertiary">
                        <Clock size={11} />
                        {new Date(sub.submittedAt).toLocaleDateString(locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US", { month: "short", day: "numeric" })}
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-orange-50 text-safety-elevated text-[10px] font-semibold">
                        {sub.status === "SUBMITTED" ? (tx(locale, "Submitted", "제출됨", "提出済み")) : (tx(locale, "Under Review", "검토 중", "審査中"))}
                      </span>
                      <ArrowRight size={14} className="text-text-tertiary group-hover:text-brand transition-colors" />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </Card>
        )}
      </section>

      {/* Unanswered Q&A */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-body-sm font-bold text-text flex items-center gap-2">
            <MessageSquare size={16} className="text-brand" />
            {tx(locale, "Unanswered Q&A", "미답변 Q&A", "未回答Q&A")}
          </h2>
          {qna.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-brand-lighter text-brand text-[11px] font-bold">
              {qna.length}
            </span>
          )}
        </div>

        {qna.length === 0 ? (
          <Card padding="none">
            <div className="py-10 flex flex-col items-center gap-2 text-center">
              <HelpCircle size={24} className="text-text-tertiary/40" />
              <p className="text-body-xs text-text-tertiary">{tx(locale, "No unanswered questions", "미답변 질문이 없습니다", "未回答の質問がありません")}</p>
            </div>
          </Card>
        ) : (
          <Card padding="none">
            <div className="divide-y divide-border">
              {qna.map((q, i) => {
                const href = q.projectId
                  ? `/project/${q.projectId}`
                  : "/guidance";
                return (
                  <motion.div
                    key={q.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.04 }}
                  >
                    <Link
                      href={href}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-surface-secondary/30 transition-colors group"
                    >
                      <div className="h-9 w-9 rounded-lg bg-brand-lighter flex items-center justify-center shrink-0">
                        <MessageSquare size={16} className="text-brand" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-body-sm font-semibold text-text line-clamp-1">{q.question}</p>
                        <p className="text-body-xs text-text-tertiary">
                          {q.authorName} · {new Date(q.createdAt).toLocaleDateString(locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US", { month: "short", day: "numeric" })}
                        </p>
                      </div>
                      <ArrowRight size={14} className="text-text-tertiary group-hover:text-brand transition-colors shrink-0" />
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </Card>
        )}
      </section>
    </motion.div>
  );
}
