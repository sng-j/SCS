import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-6 bg-surface">
      <div className="text-center space-y-2">
        <p className="font-mono text-[80px] font-extrabold text-brand/20 leading-none">404</p>
        <h2 className="text-h4 text-text">페이지를 찾을 수 없습니다</h2>
        <p className="text-body-sm text-text-secondary">
          요청하신 페이지가 존재하지 않거나 이동되었습니다.
        </p>
      </div>
      <Link href="/">
        <Button variant="secondary">
          <Home className="h-4 w-4" />
          홈으로 돌아가기
        </Button>
      </Link>
    </div>
  );
}
