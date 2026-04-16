"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Redirects to home if user doesn't have one of the allowed roles.
 * Returns { allowed, loading } so the page can show loading state while checking.
 */
export function useRoleGuard(allowedRoles: string[]): { allowed: boolean; loading: boolean } {
  const { data: session, status } = useSession();
  const router = useRouter();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = session?.user?.role || "VENDOR";
  const loading = status === "loading";
  const allowed = allowedRoles.includes(role);

  useEffect(() => {
    if (!loading && !allowed) {
      router.replace("/");
    }
  }, [loading, allowed, router]);

  return { allowed, loading };
}
