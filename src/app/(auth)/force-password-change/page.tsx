"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Lock, Eye, EyeOff, AlertCircle, CheckCircle, ShieldCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/stores/locale-store";
import { tx, formError } from "@/lib/i18n";
import { showToast } from "@/lib/toast";

// ─── Schema ─────────────────────────────────────────────────────────────────

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "REQUIRED"),
  newPassword: z.string().min(6, "PWD_MIN_LENGTH"),
  confirmPassword: z.string().min(1, "REQUIRED"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "PWD_NOT_MATCH",
  path: ["confirmPassword"],
});

type PasswordForm = z.infer<typeof passwordSchema>;

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ForcePasswordChangePage() {
  const router = useRouter();
  const { data: session, update } = useSession();
  const { locale } = useLocaleStore();

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  });

  async function onSubmit(data: PasswordForm) {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/user/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        }),
      });

      if (res.ok) {
        showToast.success(tx(locale, "Password changed successfully.", "비밀번호가 성공적으로 변경되었습니다.", "パスワードが正常に変更されました。"));
        
        // Update session client-side then force a full reload to ensure server-side middleware sees the new flag
        try {
          await update();
        } catch (e) {
          console.error("Session update failed", e);
        }

        setTimeout(() => {
          window.location.href = "/";
        }, 1000);
      } else {
        const result = await res.json();
        setError(result.error || tx(locale, "Failed to change password.", "비밀번호 변경에 실패했습니다.", "パスワードの変更に失敗しました。"));
      }
    } catch {
      setError(tx(locale, "Unable to connect to server.", "서버에 연결할 수 없습니다.", "サーバーに接続できません。"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div style={{ animation: "fadeSlideUp 0.4s ease-out both" }}>
      {/* Header */}
      <div className="mb-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-lighter/50 text-brand mb-4">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="text-[24px] font-extrabold text-text tracking-tight">
          {tx(locale, "Change Password", "비밀번호 변경", "パスワード変更")}
        </h1>
        <p className="text-[14px] text-text-tertiary mt-2 leading-relaxed">
          {tx(
            locale,
            "For security reasons, you must change your temporary password before continuing.",
            "보안을 위해 서비스 이용 전 임시 비밀번호를 변경해야 합니다.",
            "セキュリティ上の理由から、続行する前に一時パスワードを変更する必要があります。"
          )}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div
          className="mb-6 flex items-start gap-3 rounded-[8px] border border-safety-high/15 bg-risk-bg px-4 py-3"
          role="alert"
          style={{ animation: "shake 0.4s ease-out" }}
        >
          <AlertCircle className="h-4 w-4 text-safety-high mt-0.5 shrink-0" />
          <p className="text-[13px] text-safety-high">{error}</p>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* Current Password */}
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-text-secondary ml-1">
            {tx(locale, "Current Password", "현재 비밀번호", "現在のパスワード")}
          </label>
          <div className="relative">
            <input
              type={showCurrent ? "text" : "password"}
              placeholder="••••••••"
              className={cn(
                "h-11 w-full rounded-[8px] border px-3.5 pr-11 text-[14px] text-text",
                "placeholder:text-text-tertiary/50",
                "transition-all duration-200",
                errors.currentPassword ? "border-safety-high bg-risk-bg/50" : "border-border bg-white"
              )}
              {...register("currentPassword")}
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-text-tertiary hover:text-text-secondary"
              tabIndex={-1}
            >
              {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.currentPassword && (
            <p className="text-[12px] text-safety-high ml-1">{formError(locale, errors.currentPassword.message)}</p>
          )}
        </div>

        {/* New Password */}
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-text-secondary ml-1">
            {tx(locale, "New Password", "새 비밀번호", "新しいパスワード")}
          </label>
          <div className="relative">
            <input
              type={showNew ? "text" : "password"}
              placeholder={tx(locale, "At least 6 characters", "6자 이상", "6文字以上")}
              className={cn(
                "h-11 w-full rounded-[8px] border px-3.5 pr-11 text-[14px] text-text",
                errors.newPassword ? "border-safety-high bg-risk-bg/50" : "border-border bg-white"
              )}
              {...register("newPassword")}
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-text-tertiary hover:text-text-secondary"
              tabIndex={-1}
            >
              {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.newPassword && (
            <p className="text-[12px] text-safety-high ml-1">{formError(locale, errors.newPassword.message)}</p>
          )}
        </div>

        {/* Confirm Password */}
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-text-secondary ml-1">
            {tx(locale, "Confirm New Password", "새 비밀번호 확인", "新しいパスワードの確認")}
          </label>
          <div className="relative">
            <input
              type={showConfirm ? "text" : "password"}
              placeholder="••••••••"
              className={cn(
                "h-11 w-full rounded-[8px] border px-3.5 pr-11 text-[14px] text-text",
                errors.confirmPassword ? "border-safety-high bg-risk-bg/50" : "border-border bg-white"
              )}
              {...register("confirmPassword")}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-text-tertiary hover:text-text-secondary"
              tabIndex={-1}
            >
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="text-[12px] text-safety-high ml-1">{formError(locale, errors.confirmPassword.message)}</p>
          )}
        </div>

        {/* Submit */}
        <div className="pt-4">
          <Button type="submit" size="lg" loading={isLoading} className="w-full">
            <CheckCircle className="mr-2 h-4 w-4" />
            {tx(locale, "Update Password", "비밀번호 업데이트", "パスワードを更新")}
          </Button>
        </div>
      </form>
    </div>
  );
}
