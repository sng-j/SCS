import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** GET /api/admin/login-logs — list recent login logs */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);

  const logs = await prisma.loginLog.findMany({
    include: { user: { select: { name: true, email: true, role: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json(
    logs.map((l) => ({
      id: l.id,
      userName: l.user.name,
      userEmail: l.user.email,
      userRole: l.user.role,
      ip: l.ip,
      userAgent: l.userAgent,
      createdAt: l.createdAt,
    })),
  );
}
