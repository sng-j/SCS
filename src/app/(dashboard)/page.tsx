"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { SkeletonCards, SkeletonTable } from "@/components/ui/skeleton";
import { ShipyardDashboard } from "@/components/dashboard/shipyard-dashboard";
import { VendorDashboard } from "@/components/dashboard/vendor-dashboard";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";

// ─── Page ───────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const userRole = (session?.user as { role?: string })?.role || "VENDOR";

  // SHIPYARD viewers get the dedicated viewer dashboard, not the shipyard mgmt view
  useEffect(() => {
    if (status === "authenticated" && userRole === "SHIPYARD") {
      router.replace("/viewer");
    }
  }, [status, userRole, router]);

  // 세션 로딩 중 — 깜빡임 방지
  if (status === "loading") {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <SkeletonCards count={3} />
        <SkeletonTable rows={4} />
      </div>
    );
  }

  if (userRole === "VENDOR") return <VendorDashboard />;
  // SUPPORT sees the shipyard management dashboard (same role as old SHIPYARD).
  if (userRole === "SUPPORT") return <ShipyardView />;
  // SHIPYARD viewer will be redirected by the useEffect above — show nothing briefly.
  if (userRole === "SHIPYARD") return null;
  return <AdminDashboard />;
}

// ═════════════════════════════════════════════════════════════════════════════
// SHIPYARD VIEW (uses separate component)
// ═════════════════════════════════════════════════════════════════════════════

function ShipyardView() {
  return <ShipyardDashboard />;
}
