"use client";

import { useEffect } from "react";

/**
 * 저장되지 않은 변경사항이 있을 때 페이지 이탈 경고를 표시합니다.
 * - 브라우저 새로고침 / 닫기 시 beforeunload 경고
 * - isDirty가 true일 때만 활성화
 */
export function useUnsavedChanges(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}

/**
 * useState 기반 폼에서 dirty state를 추적하는 간단한 훅.
 * initialValues와 currentValues를 JSON 비교합니다.
 */
export function useIsDirty(
  initialValues: unknown,
  currentValues: unknown,
): boolean {
  try {
    return JSON.stringify(initialValues) !== JSON.stringify(currentValues);
  } catch {
    return false;
  }
}
