import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  shipyardId: string | null;
  company: string | null;
}

/**
 * Get the authenticated user from the session.
 * Returns null if not authenticated.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? "",
    role: session.user.role ?? "VENDOR",
    shipyardId: session.user.shipyardId ?? null,
    company: session.user.company ?? null,
  };
}

/**
 * Verify the user has access to a specific project.
 * - ADMIN: access to all projects
 * - SUPPORT: access if project.shipyardId matches user.shipyardId (full perms)
 * - SHIPYARD: access if project.shipyardId matches user.shipyardId (read-only)
 * - VENDOR: access if user has equipment in the project
 */
export async function verifyProjectAccess(
  userId: string,
  projectId: string,
  role?: string,
  shipyardId?: string | null
): Promise<boolean> {
  if (role === "ADMIN") return true;

  if (role === "SUPPORT" || role === "SHIPYARD") {
    if (!shipyardId) return false; // No shipyard assigned = no access
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { shipyardId: true },
    });
    return project?.shipyardId === shipyardId;
  }

  // VENDOR: check if user has equipment in this project
  const equipmentCount = await prisma.equipment.count({
    where: {
      projectId,
      OR: [
        { vendorId: userId },
        { vendors: { some: { id: userId } } }
      ]
    },
  });
  return equipmentCount > 0;
}

/**
 * Verify VENDOR has ownership of a specific hardware/software via equipment.
 * ADMIN, SUPPORT and SHIPYARD (read-only) always pass.
 */
export async function verifyEquipmentOwnership(
  userId: string,
  role: string,
  hardwareId?: string,
  softwareId?: string,
): Promise<boolean> {
  if (role === "ADMIN" || role === "SUPPORT" || role === "SHIPYARD") return true;

  if (hardwareId) {
    const hw = await prisma.hardware.findFirst({
      where: { id: hardwareId },
      select: {
        equipment: {
          select: {
            vendorId: true,
            vendors: { select: { id: true } }
          }
        }
      },
    });
    if (!hw?.equipment) return false;
    return hw.equipment.vendorId === userId || hw.equipment.vendors.some(v => v.id === userId);
  }
  if (softwareId) {
    const sw = await prisma.software.findFirst({
      where: { id: softwareId },
      select: {
        equipment: {
          select: {
            vendorId: true,
            vendors: { select: { id: true } }
          }
        }
      },
    });
    if (!sw?.equipment) return false;
    return sw.equipment.vendorId === userId || sw.equipment.vendors.some(v => v.id === userId);
  }
  return false;
}

/**
 * Standard JSON error response. Pass an optional `code` for stable error
 * identifiers the client can match against (e.g. password policy violations).
 */
export function apiError(message: string, status: number, code?: string) {
  return NextResponse.json(
    code ? { error: message, code } : { error: message },
    { status },
  );
}

/**
 * True when the role may issue write requests against project-scoped
 * resources. SHIPYARD is the viewer role and must never mutate data —
 * call this after verifyProjectAccess on any POST/PATCH/PUT/DELETE
 * endpoint that should be off-limits to viewers.
 *
 * ADMIN, SUPPORT, and VENDOR are permitted; individual endpoints layer
 * further restrictions (e.g. VENDOR must own the equipment) on top of
 * this gate.
 */
export function isWriteRole(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "SUPPORT" || role === "VENDOR";
}
