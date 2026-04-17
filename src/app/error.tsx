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
        en: "A temporary error occurred.",
        ko: "일시적인 오류가 발생했습니다.",
        ja: "一時的なエラーが発生しました。",
      }}
      description={{
        en: "The request could not be completed. You can retry the action or return to the home page. If the problem persists, contact your administrator with the reference below.",
        ko: "요청을 완료하지 못했습니다. 다시 시도하거나 홈으로 돌아갈 수 있습니다. 문제가 계속되면 아래 참조 번호와 함께 관리자에게 문의하세요.",
        ja: "リクエストを完了できませんでした。再試行するか、ホームへ戻ることができます。問題が続く場合は、以下の参照番号と共に管理者にお問い合わせください。",
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
