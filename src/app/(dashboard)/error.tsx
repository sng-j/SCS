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
        en: "This page could not be loaded.",
        ko: "페이지를 불러오지 못했습니다.",
        ja: "ページを読み込めませんでした。",
      }}
      description={{
        en: "Part of the dashboard failed to render. Retry, or return to the main screen. Your session is unaffected.",
        ko: "대시보드 일부를 불러오는 데 실패했습니다. 다시 시도하거나 메인 화면으로 돌아가세요. 세션은 유지됩니다.",
        ja: "ダッシュボードの一部を読み込めませんでした。再試行するか、メイン画面へ戻ってください。セッションは維持されます。",
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
