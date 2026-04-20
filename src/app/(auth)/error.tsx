"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/ui/error-screen";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[auth error]", error);
  }, [error]);

  // Note: we intentionally DO NOT surface `error.message` to the user.
  // Auth-layer errors commonly contain provider/DB hints that should
  // not leak to an unauthenticated client. Only a generic message and
  // the hashed digest (non-sensitive) are displayed.
  return (
    <ErrorScreen
      code="ERR"
      errKey="ERR_AUTH"
      title={{
        en: "Sign-in failed",
        ko: "로그인에 실패했습니다",
        ja: "サインインに失敗しました",
      }}
      description={{
        en: "Please try again. If the problem persists, contact your administrator.",
        ko: "다시 시도해 주세요. 문제가 계속되면 관리자에게 문의하세요.",
        ja: "再度お試しください。問題が続く場合は管理者にお問い合わせください。",
      }}
      referenceId={error.digest}
      debug={{ message: error.message, stack: error.stack }}
      actions={[
        { label: { en: "Try again", ko: "다시 시도", ja: "再試行" }, onClick: reset },
        { label: { en: "Back to login", ko: "로그인으로", ja: "ログインへ" }, href: "/login", variant: "outline" },
      ]}
    />
  );
}
