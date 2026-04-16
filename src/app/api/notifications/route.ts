import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** GET /api/notifications — get current user's notifications */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id, dismissed: false },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  return NextResponse.json({ notifications, unreadCount });
}

/** PATCH /api/notifications — mark as read or dismiss */
export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const body = await request.json();
  const { id, action } = body as { id?: string; action: "read" | "dismiss" | "read_all" };

  if (action === "read_all") {
    await prisma.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });
    return NextResponse.json({ success: true });
  }

  if (!id) return apiError("id required", 400);

  // Verify ownership
  const notif = await prisma.notification.findFirst({
    where: { id, userId: user.id },
  });
  if (!notif) return apiError("Not found", 404);

  if (action === "read") {
    await prisma.notification.update({ where: { id }, data: { read: true } });
  } else if (action === "dismiss") {
    await prisma.notification.update({ where: { id }, data: { dismissed: true, read: true } });
  }

  return NextResponse.json({ success: true });
}
