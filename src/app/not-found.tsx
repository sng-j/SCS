"use client";

import { ErrorScreen } from "@/components/ui/error-screen";

export default function NotFound() {
  return (
    <ErrorScreen
      code="404"
      errKey="ERR_NOT_FOUND"
      title={{
        en: "This page cannot be reached.",
        ko: "요청하신 페이지에 접근할 수 없습니다.",
        ja: "このページには到達できません。",
      }}
      description={{
        en: "The resource you requested does not exist or you do not have access to it. No further details are disclosed.",
        ko: "요청하신 리소스가 존재하지 않거나 접근 권한이 없습니다. 자세한 정보는 공개하지 않습니다.",
        ja: "要求されたリソースは存在しないか、アクセス権限がありません。詳細は開示されません。",
      }}
      actions={[
        { label: { en: "Return home", ko: "홈으로 돌아가기", ja: "ホームへ戻る" }, href: "/" },
      ]}
    />
  );
}
