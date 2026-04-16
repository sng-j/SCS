"use client";

import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/stores/locale-store";
import { tx, formError } from "@/lib/i18n";

// ─── Schema ─────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().min(1, "REQUIRED").email("INVALID_EMAIL"),
  password: z.string().min(1, "REQUIRED"),
});

type LoginForm = z.infer<typeof loginSchema>;

// ─── Page ───────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const { locale } = useLocaleStore();

  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lockCountdown, setLockCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Countdown timer for lockout
  useEffect(() => {
    if (lockCountdown > 0) {
      timerRef.current = setInterval(() => {
        setLockCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setAuthError(null);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [lockCountdown]);

  function formatCountdown(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginForm) {
    setIsLoading(true);
    setAuthError(null);

    try {
      const result = await signIn("credentials", {
        redirect: false,
        email: data.email,
        password: data.password,
      });

      if (result?.error) {
        // NextAuth passes the thrown Error message through result.error.
        // The auth provider only distinguishes LOCKED from INVALID_CREDENTIALS
        // to avoid account enumeration. All other states return generic errors.
        if (result.error.includes("LOCKED")) {
          setLockCountdown(15 * 60);
          setAuthError(tx(locale, "Account locked. Try again in 15 minutes.", "계정이 잠겼습니다. 15분 후 다시 시도해주세요.", "アカウントがロックされています。15分後に再度お試しください。"));
        } else {
          setAuthError(tx(locale, "Invalid email or password.", "이메일 또는 비밀번호가 올바르지 않습니다.", "メールアドレスまたはパスワードが正しくありません。"));
        }
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setAuthError(tx(locale, "Unable to connect to server.", "서버에 연결할 수 없습니다.", "サーバーに接続できません。"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div style={{ animation: "fadeSlideUp 0.4s ease-out both" }}>
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-[24px] font-extrabold text-text tracking-tight">
          {tx(locale, "Sign in", "로그인", "ログイン")}
        </h1>
        <p className="text-[14px] text-text-tertiary mt-2">
          {tx(locale, "Access the Ship Equipment Cybersecurity Compliance Assessment System Support System.", "선박 사이버 보안 지원 시스템에 접속합니다.", "船舶サイバーセキュリティ支援システムにアクセスします。")}
        </p>
      </div>

      {/* Error */}
      {authError && (
        <div
          className="mb-6 flex items-start gap-3 rounded-[8px] border border-safety-high/15 bg-risk-bg px-4 py-3"
          role="alert"
          style={{ animation: "shake 0.4s ease-out" }}
        >
          <AlertCircle className="h-4 w-4 text-safety-high mt-0.5 shrink-0" />
          <p className="text-[13px] text-safety-high">
            {authError}
            {lockCountdown > 0 && (
              <span className="ml-1 font-mono font-bold">{formatCountdown(lockCountdown)}</span>
            )}
          </p>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {/* Email */}
        <div className="space-y-2">
          <label htmlFor="email" className="flex items-center gap-1.5 text-[13px] font-semibold text-text-secondary">
            <Mail className="h-3.5 w-3.5 text-text-tertiary" />
            {tx(locale, "Email", "이메일", "メールアドレス")}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="name@company.com"
            className={cn(
              "h-11 w-full rounded-[8px] border px-3.5 text-[14px] text-text",
              "placeholder:text-text-tertiary/50",
              "transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:border-transparent",
              errors.email
                ? "border-safety-high bg-risk-bg/50 focus:ring-safety-high/30"
                : "border-border bg-white hover:border-border-strong focus:ring-brand/30",
            )}
            {...register("email")}
          />
          {errors.email && (
            <p className="text-[12px] text-safety-high">{formError(locale, errors.email.message)}</p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-2">
          <label htmlFor="password" className="flex items-center gap-1.5 text-[13px] font-semibold text-text-secondary">
            <Lock className="h-3.5 w-3.5 text-text-tertiary" />
            {tx(locale, "Password", "비밀번호", "パスワード")}
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              className={cn(
                "h-11 w-full rounded-[8px] border px-3.5 pr-11 text-[14px] text-text",
                "placeholder:text-text-tertiary/50",
                "transition-all duration-200",
                "focus:outline-none focus:ring-2 focus:border-transparent",
                errors.password
                  ? "border-safety-high bg-risk-bg/50 focus:ring-safety-high/30"
                  : "border-border bg-white hover:border-border-strong focus:ring-brand/30",
              )}
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-text-tertiary hover:text-text-secondary transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && (
            <p className="text-[12px] text-safety-high">{formError(locale, errors.password.message)}</p>
          )}
        </div>

        {/* Submit */}
        <div className="pt-2">
          <Button type="submit" size="lg" loading={isLoading} disabled={lockCountdown > 0} className="w-full group">
            {tx(locale, "Sign in", "로그인", "ログイン")}
            {!isLoading && (
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            )}
          </Button>
        </div>
      </form>

      {/* Footer */}
      <div className="mt-8 pt-6 border-t border-border">
        <p className="text-[12px] text-text-tertiary text-center">
          {tx(locale, "Contact your administrator for account access.", "계정이 필요하시면 관리자에게 문의하세요.", "アカウントが必要な場合は管理者にお問い合わせください。")}
        </p>
      </div>
    </div>
  );
}
