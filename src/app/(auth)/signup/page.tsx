"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  User,
  Building2,
  Phone,
  Shield,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/stores/locale-store";
import { tx, formError } from "@/lib/i18n";

// ─── Schema ─────────────────────────────────────────────────────────────────

const signupSchema = z.object({
  email: z.string().min(1, "REQUIRED").email("INVALID_EMAIL"),
  name: z.string().min(1, "REQUIRED").min(2, "MIN_2"),
  password: z.string().min(1, "REQUIRED").min(6, "MIN_6"),
  company: z.string().optional(),
  phone: z.string().optional(),
});

type SignupForm = z.infer<typeof signupSchema>;

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SignupPage() {
  const { locale } = useLocaleStore();

  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
  });

  async function onSubmit(data: SignupForm) {
    setIsLoading(true);
    setApiError(null);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        setSubmittedEmail(data.email);
        setIsSuccess(true);
      } else {
        const body = await res.json();
        if (res.status === 409) {
          const msg = body.error === "Account already exists"
            ? tx(locale, "Account already exists. Please sign in.", "이미 등록된 계정입니다. 로그인하세요.", "アカウントは既に存在します。ログインしてください。")
            : tx(locale, "A signup request for this email is already pending.", "이미 가입 신청이 접수된 이메일입니다.", "このメールアドレスの登録申請はすでに受理されています。");
          setApiError(msg);
        } else {
          setApiError(body.error || tx(locale, "An error occurred.", "오류가 발생했습니다.", "エラーが発生しました。"));
        }
      }
    } catch {
      setApiError(tx(locale, "Unable to connect to server.", "서버에 연결할 수 없습니다.", "サーバーに接続できません。"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AnimatePresence mode="wait">
      {isSuccess ? (
        <SuccessState key="success" email={submittedEmail} locale={locale} />
      ) : (
        <motion.div
          key="form"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Mobile header */}
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-7 w-7 items-center justify-center rounded-[4px] bg-brand/10">
                <Shield className="h-3.5 w-3.5 text-brand" />
              </div>
              <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-text-tertiary">
                {tx(locale, "Secure Access", "보안 접근", "セキュアアクセス")}
              </span>
            </div>
            <h1 className="text-h4 text-text">
              {tx(locale, "Request Access", "가입 신청", "アクセス申請")}
            </h1>
            <p className="text-body-sm text-text-tertiary mt-1">
              {tx(locale, "Ship Equipment Cybersecurity Compliance Assessment System Support System", "선박 사이버 보안 지원 시스템", "船舶サイバーセキュリティ支援システム")}
            </p>
          </div>

          {/* Desktop header */}
          <div className="hidden lg:block mb-10">
            <div className="flex items-center gap-2 mb-5">
              <div className="flex h-7 w-7 items-center justify-center rounded-[4px] bg-brand/10">
                <Shield className="h-3.5 w-3.5 text-brand" />
              </div>
              <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-text-tertiary">
                {tx(locale, "Secure Access", "보안 접근", "セキュアアクセス")}
              </span>
            </div>
            <h2 className="text-h3 text-text tracking-[-0.01em]">
              {tx(locale, "Request Access", "가입 신청", "アクセス申請")}
            </h2>
            <p className="text-body-sm text-text-secondary mt-2">
              {tx(locale, "Request access to SCS. Your account will be activated after administrator approval.", "SCS 이용을 신청합니다. 관리자 승인 후 이용 가능합니다.", "SCSへのアクセスを申請します。管理者の承認後にご利用いただけます。")}
            </p>
          </div>

          {/* Approval notice */}
          <div className="mb-6 flex items-start gap-3 rounded-[4px] border border-brand/15 bg-brand-lighter/40 px-4 py-3">
            <Info className="h-4 w-4 text-brand mt-0.5 shrink-0" />
            <p className="text-body-xs text-text-secondary leading-relaxed">
              {tx(locale, "After submitting, an administrator will review your request. Once approved, you can sign in with your account.", "가입 신청 후 관리자가 검토하여 승인합니다. 승인 완료 후 로그인이 가능합니다.", "申請後、管理者が審査・承認します。承認後、ログインが可能になります。")}
            </p>
          </div>

          {/* Error banner */}
          {apiError && (
            <div
              className="mb-6 flex items-start gap-3 rounded-[4px] border border-safety-high/20 bg-risk-bg px-4 py-3"
              role="alert"
              style={{ animation: "shake 0.4s ease-out" }}
            >
              <AlertCircle className="h-4 w-4 text-safety-high mt-0.5 shrink-0" />
              <p className="text-body-sm text-safety-high">{apiError}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="flex items-center gap-1.5 text-body-sm font-medium text-text">
                <Mail className="h-3.5 w-3.5 text-text-tertiary" />
                {tx(locale, "Email", "이메일", "メールアドレス")} <span className="text-safety-high text-body-xs">*</span>
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="name@company.com"
                className={cn(
                  "h-11 w-full rounded-[4px] border px-3.5 text-body-sm text-text",
                  "placeholder:text-text-tertiary/60 transition-all duration-150",
                  "focus:outline-none focus:ring-2 focus:border-transparent",
                  errors.email
                    ? "border-safety-high bg-risk-bg/50 focus:ring-safety-high/40"
                    : "border-border bg-white hover:border-border-strong focus:ring-brand/40",
                )}
                {...register("email")}
              />
              {errors.email && <p className="text-body-xs text-safety-high">{formError(locale, errors.email.message)}</p>}
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <label htmlFor="name" className="flex items-center gap-1.5 text-body-sm font-medium text-text">
                <User className="h-3.5 w-3.5 text-text-tertiary" />
                {tx(locale, "Name", "이름", "名前")} <span className="text-safety-high text-body-xs">*</span>
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                placeholder={tx(locale, "Full name", "홍길동", "氏名")}
                className={cn(
                  "h-11 w-full rounded-[4px] border px-3.5 text-body-sm text-text",
                  "placeholder:text-text-tertiary/60 transition-all duration-150",
                  "focus:outline-none focus:ring-2 focus:border-transparent",
                  errors.name
                    ? "border-safety-high bg-risk-bg/50 focus:ring-safety-high/40"
                    : "border-border bg-white hover:border-border-strong focus:ring-brand/40",
                )}
                {...register("name")}
              />
              {errors.name && <p className="text-body-xs text-safety-high">{formError(locale, errors.name.message)}</p>}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="flex items-center gap-2 text-body-sm font-medium text-text">
                <Shield size={15} className="text-text-tertiary" />
                {tx(locale, "Password", "비밀번호", "パスワード")} <span className="text-safety-high">*</span>
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder={tx(locale, "6+ characters", "6자 이상", "6文字以上")}
                className={cn(
                  "h-11 w-full rounded-[4px] border px-3.5 text-body-sm text-text placeholder:text-text-tertiary/60 transition-all duration-150",
                  "focus:outline-none focus:ring-2 focus:border-transparent",
                  errors.password
                    ? "border-safety-high bg-risk-bg/50 focus:ring-safety-high/40"
                    : "border-border bg-white hover:border-border-strong focus:ring-brand/40",
                )}
                {...register("password")}
              />
              {errors.password && <p className="text-body-xs text-safety-high">{formError(locale, errors.password.message)}</p>}
            </div>

            {/* Company + Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="company" className="flex items-center gap-1.5 text-body-sm font-medium text-text">
                  <Building2 className="h-3.5 w-3.5 text-text-tertiary" />
                  {tx(locale, "Company", "회사명", "会社名")}
                </label>
                <input
                  id="company"
                  type="text"
                  autoComplete="organization"
                  placeholder={tx(locale, "Company name", "(주)한국전자", "会社名を入力")}
                  className="h-11 w-full rounded-[4px] border border-border bg-white px-3.5 text-body-sm text-text placeholder:text-text-tertiary/60 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-transparent hover:border-border-strong"
                  {...register("company")}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="phone" className="flex items-center gap-1.5 text-body-sm font-medium text-text">
                  <Phone className="h-3.5 w-3.5 text-text-tertiary" />
                  {tx(locale, "Phone", "연락처", "電話番号")}
                </label>
                <input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="010-0000-0000"
                  className="h-11 w-full rounded-[4px] border border-border bg-white px-3.5 text-body-sm text-text placeholder:text-text-tertiary/60 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-transparent hover:border-border-strong"
                  {...register("phone")}
                />
              </div>
            </div>

            {/* Submit */}
            <div className="pt-1">
              <Button type="submit" size="lg" loading={isLoading} className="w-full group">
                {tx(locale, "Submit Request", "가입 신청", "申請を送信")}
                {!isLoading && (
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                )}
              </Button>
            </div>
          </form>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-border">
            <div className="flex items-center justify-between">
              <p className="text-body-xs text-text-tertiary">
                {tx(locale, "Already have an account?", "이미 계정이 있으신가요?", "すでにアカウントをお持ちですか？")}
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-1 text-body-sm font-medium text-brand hover:text-brand-hover transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {tx(locale, "Sign in", "로그인", "ログイン")}
              </Link>
            </div>
          </div>

          {/* Platform badge */}
          <div className="mt-8 flex items-center justify-center">
            <span className="font-mono text-[10px] text-text-tertiary/60 tracking-wider">
              SCS — CYTUR Maritime Platform
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Success State ──────────────────────────────────────────────────────────

function SuccessState({ email, locale }: { email: string; locale: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="text-center"
    >
      {/* Checkmark */}
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.15, duration: 0.5, type: "spring", stiffness: 200, damping: 15 }}
        className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-lighter"
      >
        <CheckCircle2 className="h-8 w-8 text-brand" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
      >
        <h2 className="text-h4 text-text tracking-[-0.01em]">
          {tx(locale, "Request Submitted", "가입 신청 완료", "申請完了")}
        </h2>
        <p className="text-body-sm text-text-secondary mt-3 max-w-sm mx-auto leading-relaxed">
          {tx(locale, "Your request has been submitted. You can sign in after administrator approval.", "가입 신청이 접수되었습니다. 관리자 승인 후 로그인하실 수 있습니다.", "申請が受理されました。管理者の承認後にログインできます。")}
        </p>
      </motion.div>

      {/* Email badge */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.4 }}
        className="mt-6 mx-auto max-w-xs rounded-[4px] border border-border bg-surface-secondary/50 px-4 py-3"
      >
        <div className="flex items-center justify-center gap-2">
          <Mail className="h-3.5 w-3.5 text-text-tertiary" />
          <span className="text-body-sm font-medium text-text">{email}</span>
        </div>
      </motion.div>

      {/* Progress timeline */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.4 }}
        className="mt-8 mx-auto max-w-xs space-y-3 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand shrink-0">
            <CheckCircle2 className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-body-xs text-text-secondary">
            {tx(locale, "Request submitted", "가입 신청 접수됨", "申請受理済み")}
          </span>
        </div>
        <div className="ml-3 w-px h-3 bg-border" />
        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-brand-light bg-white shrink-0">
            <Clock className="h-3 w-3 text-brand" />
          </div>
          <span className="text-body-xs text-text-tertiary">
            {tx(locale, "Awaiting review", "관리자 검토 대기 중", "管理者の審査待ち")}
          </span>
        </div>
        <div className="ml-3 w-px h-3 bg-border" />
        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-border bg-white shrink-0">
            <Mail className="h-3 w-3 text-text-tertiary" />
          </div>
          <span className="text-body-xs text-text-tertiary">
            {tx(locale, "Email on approval", "승인 시 이메일 안내", "承認時にメール通知")}
          </span>
        </div>
      </motion.div>

      {/* Back to login */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-10"
      >
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-body-sm font-medium text-brand hover:text-brand-hover transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          {tx(locale, "Back to sign in", "로그인 페이지로 돌아가기", "ログインページに戻る")}
        </Link>
      </motion.div>
    </motion.div>
  );
}
