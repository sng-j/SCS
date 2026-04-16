import { prisma } from "@/lib/prisma";

/** Create notification for specific user */
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message?: string,
  link?: string,
) {
  return prisma.notification.create({
    data: { userId, type, title, message, link },
  });
}

/** Create notification for all users with a specific role */
export async function notifyRole(
  role: string,
  type: string,
  title: string,
  message?: string,
  link?: string,
) {
  const users = await prisma.user.findMany({
    where: { role, isActive: true },
    select: { id: true },
  });

  if (users.length === 0) return;

  await prisma.notification.createMany({
    data: users.map((u) => ({ userId: u.id, type, title, message, link })),
  });
}
