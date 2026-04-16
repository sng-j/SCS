import { prisma } from "@/lib/prisma";

export async function logSecurityEvent(
  event: string,
  detail?: string,
  level: string = "INFO",
  userId?: string,
  ip?: string
): Promise<void> {
  await prisma.securityLog.create({
    data: {
      event,
      detail: detail ?? null,
      level,
      userId: userId ?? null,
      ip: ip ?? null,
    },
  });
}
