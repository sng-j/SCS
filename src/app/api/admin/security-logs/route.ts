import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** GET /api/admin/security-logs — list security logs (ADMIN only) */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    prisma.securityLog.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
    prisma.securityLog.count(),
  ]);

  return NextResponse.json({
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
