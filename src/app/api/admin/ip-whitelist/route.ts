import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/**
 * Validate CIDR notation: supports single IPs (1.2.3.4)
 * and CIDR ranges (1.2.3.0/24).
 */
function isValidCidr(cidr: string): boolean {
  const cidrPattern =
    /^(\d{1,3}\.){3}\d{1,3}(\/([0-9]|[12]\d|3[0-2]))?$/;
  if (!cidrPattern.test(cidr)) return false;

  const ipPart = cidr.split("/")[0];
  const octets = ipPart.split(".").map(Number);
  return octets.every((o) => o >= 0 && o <= 255);
}

/** GET /api/admin/ip-whitelist — list all IP whitelist entries grouped by user (ADMIN only) */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  const entries = await prisma.ipWhitelist.findMany({
    orderBy: { id: "desc" },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  // Group by user
  const grouped: Record<
    string,
    {
      user: { id: string; name: string; email: string };
      entries: { id: number; cidr: string }[];
    }
  > = {};

  for (const entry of entries) {
    if (!grouped[entry.userId]) {
      grouped[entry.userId] = {
        user: entry.user,
        entries: [],
      };
    }
    grouped[entry.userId].entries.push({ id: entry.id, cidr: entry.cidr });
  }

  return NextResponse.json(Object.values(grouped));
}

/** POST /api/admin/ip-whitelist — add an IP whitelist entry (ADMIN only) */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  try {
    const body = await request.json();
    const { userId, cidr } = body;

    if (!userId || typeof userId !== "string") {
      return apiError("userId is required", 400);
    }
    if (!cidr || typeof cidr !== "string") {
      return apiError("cidr is required", 400);
    }

    const trimmedCidr = cidr.trim();
    if (!isValidCidr(trimmedCidr)) {
      return apiError("Invalid CIDR format. Use x.x.x.x or x.x.x.x/prefix", 400);
    }

    // Verify user exists
    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      return apiError("User not found", 404);
    }

    const entry = await prisma.ipWhitelist.create({
      data: { userId, cidr: trimmedCidr },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch {
    return apiError("Failed to add IP whitelist entry", 500);
  }
}

/** DELETE /api/admin/ip-whitelist — remove an IP whitelist entry (ADMIN only) */
export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  try {
    const body = await request.json();
    const { id } = body;

    if (!id || typeof id !== "number") {
      return apiError("id is required and must be a number", 400);
    }

    const existing = await prisma.ipWhitelist.findUnique({ where: { id } });
    if (!existing) {
      return apiError("IP whitelist entry not found", 404);
    }

    await prisma.ipWhitelist.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch {
    return apiError("Failed to delete IP whitelist entry", 500);
  }
}
