"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { locale } = useLocaleStore();

  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-safety-high/10">
        <AlertCircle className="h-8 w-8 text-safety-high" />
      </div>
      <div className="text-center space-y-2">
        <h2 className="text-h4 text-text">
          {tx(locale, "Something went wrong", "오류가 발생했습니다", "エラーが発生しました")}
        </h2>
        <p className="text-body-sm text-text-secondary max-w-md">
          {tx(locale, "An error occurred while loading the page. Please try again or contact an administrator.", "페이지를 불러오는 중 문제가 발생했습니다. 다시 시도하거나 관리자에게 문의하세요.", "ページの読み込み中にエラーが発生しました。再試行するか、管理者にお問い合わせください。")}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={reset} variant="secondary">
          {tx(locale, "Try again", "다시 시도", "再試行")}
        </Button>
        <Link href="/">
          <Button variant="outline">
            {tx(locale, "Go home", "홈으로", "ホームへ")}
          </Button>
        </Link>
      </div>
    </div>
  );
}
