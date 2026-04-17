"use client";

import { ErrorScreen } from "@/components/ui/error-screen";

export default function NotFound() {
  return (
    <ErrorScreen
      code="404"
      errKey="ERR_NOT_FOUND"
      title={{
        en: "Page not found",
        ko: "페이지를 찾을 수 없습니다",
        ja: "ページが見つかりません",
      }}
      description={{
        en: "The page you requested does not exist or has moved.",
        ko: "요청하신 페이지가 존재하지 않거나 이동되었습니다.",
        ja: "要求されたページは存在しないか、移動されました。",
      }}
      actions={[
        { label: { en: "Return home", ko: "홈으로 돌아가기", ja: "ホームへ戻る" }, href: "/" },
      ]}
    />
  );
}
