"use client";

import { useSession } from "next-auth/react";
import { SkeletonCards, SkeletonTable } from "@/components/ui/skeleton";
import { ShipyardDashboard } from "@/components/dashboard/shipyard-dashboard";
import { VendorDashboard } from "@/components/dashboard/vendor-dashboard";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";

// ─── Page ───────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const userRole = (session?.user as { role?: string })?.role || "VENDOR";

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
  // SUPPORT and SHIPYARD (viewer) both see the shipyard dashboard.
  // The dashboard itself gates actions by role where needed.
  if (userRole === "SHIPYARD" || userRole === "SUPPORT") return <ShipyardView />;
  return <AdminDashboard />;
}

// ═════════════════════════════════════════════════════════════════════════════
// SHIPYARD VIEW (uses separate component)
// ═════════════════════════════════════════════════════════════════════════════

function ShipyardView() {
  return <ShipyardDashboard />;
}
