import { NextResponse } from "next/server";
import { checkRateLimitDurable } from "@/lib/rate-limiter";
import { getClientIP } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login-check — pre-check endpoint (deprecated semantics).
 *
 * Previously returned account state (LOCKED/SIGNUP_PENDING/etc.) before authentication,
 * enabling account enumeration. Now always returns a generic "ok" response.
 *
 * Any lockout information is only surfaced AFTER a failed signIn attempt, via the
 * NextAuth error flow — not as a pre-check. This prevents confirming to unauthenticated
 * attackers whether a given email has an active lockout or pending signup.
 */
export async function POST() {
  const clientIP = await getClientIP();
  const rl = await checkRateLimitDurable(`login-check:${clientIP}`, 10, 60 * 1000); // 10 req/min

  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${rl.retryAfterSeconds}s` },
      { status: 429 }
    );
  }

  return NextResponse.json({ status: "ok" });
}
