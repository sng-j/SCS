"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/ui/error-screen";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log internally for the operator. Never shown to the user in production.
    console.error("[root error]", error);
  }, [error]);

  return (
    <ErrorScreen
      code="500"
      errKey="ERR_INTERNAL"
      title={{
        en: "Something went wrong",
        ko: "오류가 발생했습니다",
        ja: "エラーが発生しました",
      }}
      description={{
        en: "Please try again. If the problem persists, contact your administrator.",
        ko: "다시 시도해 주세요. 문제가 계속되면 관리자에게 문의하세요.",
        ja: "再度お試しください。問題が続く場合は管理者にお問い合わせください。",
      }}
      referenceId={error.digest}
      debug={{ message: error.message, stack: error.stack }}
      actions={[
        { label: { en: "Retry", ko: "다시 시도", ja: "再試行" }, onClick: reset },
        { label: { en: "Home", ko: "홈으로", ja: "ホームへ" }, href: "/", variant: "outline" },
      ]}
    />
  );
}
