import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/** POST /api/admin/audit-tools/pin — generate or verify a PIN */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  const body = await request.json();

  // Verify PIN flow
  if (body.pin && body.projectId) {
    const { projectId, pin } = body as { projectId: string; pin: string };

    if (!projectId || !pin) {
      return apiError("projectId and pin are required", 400);
    }

    const passwords = await prisma.auditPassword.findMany({
      where: { projectId, usedAt: null },
      orderBy: { createdAt: "desc" },
    });

    for (const record of passwords) {
      const match = await bcrypt.compare(pin, record.pin);
      if (match) {
        await prisma.auditPassword.update({
          where: { id: record.id },
          data: { usedAt: new Date() },
        });
        return NextResponse.json({ verified: true, id: record.id });
      }
    }

    return NextResponse.json({ verified: false });
  }

  // Generate PIN flow
  const { projectId } = body as { projectId: string };
  if (!projectId) {
    return apiError("projectId is required", 400);
  }

  // Generate a random 6-digit PIN
  const plainPin = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const hashedPin = await bcrypt.hash(plainPin, 10);

  const record = await prisma.auditPassword.create({
    data: {
      projectId,
      pin: hashedPin,
    },
  });

  return NextResponse.json({
    id: record.id,
    pin: plainPin,
    createdAt: record.createdAt,
  });
}

/** GET /api/admin/audit-tools/pin?projectId=xxx — list PINs */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return apiError("projectId is required", 400);
  }

  const pins = await prisma.auditPassword.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      usedAt: true,
    },
  });

  return NextResponse.json(pins);
}
