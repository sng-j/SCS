import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** GET /api/support/dashboard — returns pending submissions and open questions */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  if (user.role !== "SHIPYARD" && user.role !== "ADMIN") {
    return apiError("Forbidden", 403);
  }

  // Organization filter for non-ADMINs
  const orgFilter = user.role === "ADMIN" ? {} : { shipyardId: user.shipyardId };

  try {
    const [pendingSubmissions, openQuestions] = await Promise.all([
      prisma.submission.findMany({
        where: {
          status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
          project: orgFilter,
        },
        include: {
          project: {
            select: {
              id: true,
              vesselName: true,
            },
          },
        },
        orderBy: { submittedAt: "desc" },
      }),
      prisma.qna.findMany({
        where: {
          status: "OPEN",
          user: orgFilter,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({ pendingSubmissions, openQuestions });
  } catch {
    return apiError("Failed to load support dashboard", 500);
  }
}
