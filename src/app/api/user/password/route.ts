import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { validatePassword } from "@/lib/password-policy";

export const dynamic = "force-dynamic";

/** PATCH /api/user/password — change own password */
export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  try {
    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return apiError("Current and new passwords are required", 400);
    }

    const pwResult = validatePassword(newPassword);
    if (!pwResult.valid) {
      return apiError(pwResult.message, 400);
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { password: true },
    });

    if (!dbUser) return apiError("User not found", 404);

    const isValid = await bcrypt.compare(currentPassword, dbUser.password);
    if (!isValid) return apiError("Current password is incorrect", 400);

    const hashed = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        needsPasswordChange: false,
      },
    });

    return NextResponse.json({ success: true });
  } catch {
    return apiError("Failed to change password", 500);
  }
}
