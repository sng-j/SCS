import { NextResponse } from "next/server";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** POST /api/auth/onboard — deprecated (orgRole removed from schema) */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  // orgRole onboarding is no longer needed — roles are set by admin
  return NextResponse.json({ success: true });
}
