"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { locale } = useLocaleStore();

  useEffect(() => {
    console.error("Auth error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-safety-high/10">
        <AlertCircle className="h-7 w-7 text-safety-high" />
      </div>
      <div className="text-center space-y-2">
        <h2 className="text-h4 text-text">
          {tx(locale, "Something went wrong", "오류가 발생했습니다", "エラーが発生しました")}
        </h2>
        <p className="text-body-sm text-text-secondary">
          {error.message || tx(locale, "An error occurred during authentication.", "인증 과정에서 문제가 발생했습니다.", "認証中にエラーが発生しました。")}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={reset} variant="secondary">
          {tx(locale, "Try again", "다시 시도", "再試行")}
        </Button>
        <Link href="/login">
          <Button variant="outline">
            {tx(locale, "Go to login", "로그인으로", "ログインへ")}
          </Button>
        </Link>
      </div>
    </div>
  );
}
