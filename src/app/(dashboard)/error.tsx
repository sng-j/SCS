"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/ui/error-screen";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard error]", error);
  }, [error]);

  return (
    <ErrorScreen
      variant="embedded"
      code="500"
      errKey="ERR_DASHBOARD"
      title={{
        en: "Could not load this page",
        ko: "페이지를 불러오지 못했습니다",
        ja: "ページを読み込めませんでした",
      }}
      description={{
        en: "Please try again or return to the dashboard home.",
        ko: "다시 시도하거나 대시보드 홈으로 돌아가세요.",
        ja: "再試行するか、ダッシュボードホームへ戻ってください。",
      }}
      referenceId={error.digest}
      debug={{ message: error.message, stack: error.stack }}
      actions={[
        { label: { en: "Retry", ko: "다시 시도", ja: "再試行" }, onClick: reset },
        { label: { en: "Dashboard home", ko: "대시보드 홈", ja: "ダッシュボード" }, href: "/", variant: "outline" },
      ]}
    />
  );
}
