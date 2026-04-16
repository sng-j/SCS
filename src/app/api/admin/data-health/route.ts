import { NextResponse } from "next/server";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { safeError } from "@/lib/safe-log";
import { diagnoseDataHealth, autoFixDataHealth } from "@/lib/data-health";
import { logSecurityEvent } from "@/lib/security-log";

export const dynamic = "force-dynamic";

/** GET /api/admin/data-health — diagnose tenant-data inconsistencies (read-only). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  try {
    const report = await diagnoseDataHealth();
    return NextResponse.json(report);
  } catch (err) {
    safeError("data-health diagnose", err);
    return apiError("Failed to run data health check", 500);
  }
}

/**
 * POST /api/admin/data-health
 *
 * Body: { action: "auto-fix" }
 *
 * Applies the safe auto-fixes described in `lib/data-health.ts`. Returns
 * the list of applied operations and any items that needed manual review.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  let body: { action?: string; aggressive?: boolean };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  if (body.action !== "auto-fix") {
    return apiError("Unsupported action", 400);
  }

  try {
    const result = await autoFixDataHealth({ aggressive: !!body.aggressive });
    logSecurityEvent(
      "DATA_HEALTH_AUTOFIX",
      `Applied ${result.applied.length}, skipped ${result.skipped.length}`,
      "INFO",
      user.id,
    ).catch(() => {});
    return NextResponse.json(result);
  } catch (err) {
    safeError("data-health auto-fix", err);
    return apiError("Failed to apply auto-fixes", 500);
  }
}
