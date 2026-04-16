import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** PATCH /api/user/profile — update own profile */
export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  try {
    const body = await request.json();
    const { name, company, phone } = body;

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(name !== undefined && { name }),
        ...(company !== undefined && { company }),
        ...(phone !== undefined && { phone }),
      },
      select: { id: true, name: true, company: true, phone: true },
    });

    return NextResponse.json(updated);
  } catch {
    return apiError("Failed to update profile", 500);
  }
}
