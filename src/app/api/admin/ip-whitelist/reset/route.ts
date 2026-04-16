import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** POST /api/admin/ip-whitelist/reset — reset all IPs for a user (ADMIN only) */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  const body = await request.json();
  const { userId } = body as { userId: string };

  if (!userId) return apiError("userId is required", 400);

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser) return apiError("User not found", 404);

  // Delete all IP whitelist entries for this user
  const deleted = await prisma.ipWhitelist.deleteMany({ where: { userId } });

  return NextResponse.json({
    success: true,
    deleted: deleted.count,
    message: `Cleared ${deleted.count} IP entries for ${targetUser.email}. New IP will be auto-registered on next login.`,
  });
}
