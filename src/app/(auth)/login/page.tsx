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
    formState: { errors, isValid, isSubmitted },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    mode: "onSubmit",
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

  const hasError = !!authError || (isSubmitted && !isValid);

  return (
    <div style={{ animation: "fadeSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both" }}>
      {/* ── Title block ─────────────────────────────────────────────── */}
      <div className="mb-9">
        {/* Brand kicker line — anchors the form to the product identity */}
        <div className="flex items-center gap-2 mb-4">
          <span className="h-px w-6 bg-brand" />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-brand">
            {tx(locale, "Secure Access", "보안 인증", "セキュアアクセス")}
          </span>
        </div>

        <h1 className="text-[26px] font-extrabold text-text tracking-tight leading-[1.15]">
          {tx(locale, "Sign in to SCS", "SCS에 로그인", "SCSにサインイン")}
        </h1>
        <p className="text-[13px] text-text-tertiary mt-2 leading-[1.6]">
          {tx(locale,
            "Maritime cyber-security compliance platform for shipyards, vendors, and classification societies.",
            "조선소·벤더·선급을 위한 선박 사이버 보안 컴플라이언스 플랫폼입니다.",
            "造船所・ベンダー・船級のための船舶サイバーセキュリティプラットフォーム。"
          )}
        </p>
      </div>

      {/* ── Auth error banner ────────────────────────────────────────── */}
      {authError && (
        <div
          className="mb-5 flex items-start gap-2.5 rounded-[8px] border border-safety-high/20 bg-risk-bg/70 px-3.5 py-3"
          role="alert"
          style={{ animation: "shake 0.4s ease-out" }}
        >
          <AlertCircle className="h-4 w-4 text-safety-high mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-safety-high leading-snug">
              {authError}
            </p>
            {lockCountdown > 0 && (
              <div className="mt-1.5 flex items-center gap-2">
                <span className="font-mono text-[11px] text-safety-high/70 tabular-nums">
                  {formatCountdown(lockCountdown)}
                </span>
                <div className="flex-1 h-0.5 bg-safety-high/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-safety-high/50 rounded-full transition-all duration-1000"
                    style={{ width: `${(lockCountdown / (15 * 60)) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Form ─────────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>

        {/* Email */}
        <FieldShell
          id="email"
          icon={Mail}
          label={tx(locale, "Email", "이메일", "メールアドレス")}
          error={errors.email ? formError(locale, errors.email.message) : undefined}
        >
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="name@company.com"
            className={cn(
              "peer h-11 w-full rounded-[8px] border px-3.5 text-[14px] text-text bg-white",
              "placeholder:text-text-tertiary/40",
              "transition-[border,box-shadow] duration-200",
              "focus:outline-none",
              errors.email
                ? "border-safety-high focus:border-safety-high focus:shadow-[0_0_0_3px_rgba(218,30,40,0.12)]"
                : "border-border hover:border-border-strong focus:border-brand focus:shadow-[0_0_0_3px_rgba(69,137,255,0.16)]"
            )}
            {...register("email")}
          />
        </FieldShell>

        {/* Password */}
        <FieldShell
          id="password"
          icon={Lock}
          label={tx(locale, "Password", "비밀번호", "パスワード")}
          error={errors.password ? formError(locale, errors.password.message) : undefined}
        >
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              className={cn(
                "h-11 w-full rounded-[8px] border px-3.5 pr-11 text-[14px] text-text bg-white",
                "placeholder:text-text-tertiary/40",
                "transition-[border,box-shadow] duration-200",
                "focus:outline-none",
                errors.password
                  ? "border-safety-high focus:border-safety-high focus:shadow-[0_0_0_3px_rgba(218,30,40,0.12)]"
                  : "border-border hover:border-border-strong focus:border-brand focus:shadow-[0_0_0_3px_rgba(69,137,255,0.16)]"
              )}
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-text-tertiary hover:text-text-secondary transition-colors"
              tabIndex={-1}
              aria-label={showPassword
                ? tx(locale, "Hide password", "비밀번호 숨기기", "パスワードを非表示")
                : tx(locale, "Show password", "비밀번호 표시", "パスワードを表示")}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </FieldShell>

        {/* Submit */}
        <div className="pt-3">
          <Button
            type="submit"
            size="lg"
            loading={isLoading}
            disabled={lockCountdown > 0}
            className="w-full group relative overflow-hidden"
          >
            <span className={cn(
              "inline-flex items-center gap-2 transition-transform duration-200",
              hasError && !isLoading && "animate-none"
            )}>
              {lockCountdown > 0
                ? tx(locale, "Locked", "잠김", "ロック中")
                : tx(locale, "Sign in", "로그인", "ログイン")}
              {!isLoading && lockCountdown === 0 && (
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              )}
            </span>
          </Button>
        </div>
      </form>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <div className="mt-8 pt-5 border-t border-border">
        <p className="text-[12px] text-text-tertiary text-center leading-[1.6]">
          {tx(locale,
            "No account? Contact your administrator.",
            "계정이 필요하시면 관리자에게 문의하세요.",
            "アカウントが必要な場合は管理者にお問い合わせください。"
          )}
        </p>
      </div>
    </div>
  );
}

// ─── Field shell ─────────────────────────────────────────────────────────────
// Extracts a consistent label + input + error pattern so email and password
// stay visually in lockstep.

function FieldShell({
  id, icon: Icon, label, error, children,
}: {
  id: string;
  icon: React.ElementType;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-[12px] font-semibold text-text-secondary"
      >
        <Icon className="h-3.5 w-3.5 text-text-tertiary" />
        {label}
      </label>
      {children}
      {/* Reserve ~18px of space so the layout doesn't jump when an error appears */}
      <div className="min-h-[16px]">
        {error && (
          <p className="text-[11px] text-safety-high leading-snug" style={{ animation: "fadeSlideUp 0.2s ease-out" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
