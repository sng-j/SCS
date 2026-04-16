import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyRole } from "@/lib/notifications";
import { safeError } from "@/lib/safe-log";
import bcrypt from "bcryptjs";
import { validatePassword } from "@/lib/password-policy";
import { checkRateLimitDurable } from "@/lib/rate-limiter";
import { getClientIP } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // Rate limiting: max 5 signup requests per IP per 15 minutes
    const clientIP = await getClientIP();
    const rl = await checkRateLimitDurable(`signup:${clientIP}`, 5, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${rl.retryAfterSeconds}s` },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { email, name, password, company, phone } = body;

    // Administrative check: is signup enabled?
    const signupSetting = await prisma.setting.findUnique({ where: { key: "signup_enabled" } });
    if (!signupSetting || signupSetting.value !== "true") {
      return NextResponse.json({ error: "Signup is currently disabled" }, { status: 403 });
    }

    if (!email || !name) {
      return NextResponse.json({ error: "Email and name are required" }, { status: 400 });
    }

    // Validate password (required + complexity)
    const pwResult = validatePassword(password);
    if (!pwResult.valid) {
      return NextResponse.json({ error: pwResult.message }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Check if user account already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      // Return success even if account exists to prevent enumeration.
      return NextResponse.json({ success: true });
    }

    // Check if already requested
    const existing = await prisma.signupRequest.findFirst({
      where: { email, status: "PENDING" },
    });

    if (existing) {
      // Return success even if request is pending to prevent enumeration.
      return NextResponse.json({ success: true });
    }

    await prisma.signupRequest.create({
      data: { email, name, password: hashedPassword, company, phone },
    });

    // Notify all admins
    await notifyRole(
      "ADMIN",
      "SIGNUP_REQUEST",
      `새 가입 신청: ${name}`,
      `${email}${company ? ` (${company})` : ""} 님이 가입을 신청했습니다.`,
      "/admin",
    ).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (err) {
    safeError("Signup error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
