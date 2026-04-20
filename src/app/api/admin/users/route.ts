import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { safeError } from "@/lib/safe-log";
import bcrypt from "bcryptjs";
import { validatePassword } from "@/lib/password-policy";
import { findOrCreateShipyardByName } from "@/lib/data-health";

export const dynamic = "force-dynamic";

/** GET /api/admin/users — list all users (ADMIN only) */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      company: true,
      phone: true,
      role: true,
      shipyardId: true,
      shipyard: { select: { id: true, name: true } },
      isActive: true,
      createdAt: true,
      ipWhitelist: { select: { id: true, cidr: true } },
      loginAttempts: {
        where: { success: true },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true, ip: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Flatten for frontend
  const mapped = users.map((u) => ({
    ...u,
    registeredIps: u.ipWhitelist.map((ip) => ip.cidr),
    lastLoginAt: u.loginAttempts[0]?.createdAt || null,
    lastLoginIp: u.loginAttempts[0]?.ip || null,
    ipWhitelist: undefined,
    loginAttempts: undefined,
  }));

  return NextResponse.json(mapped);
}

/** POST /api/admin/users — create admin or shipyard account */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  try {
    const { name, email, password, company, role, shipyardId: explicitShipyardId } = await request.json();
    if (!name || !email || !password) return apiError("Name, email, and password required", 400);
    // Admin can create admin, support, or shipyard (viewer) accounts here.
    if (!["ADMIN", "SUPPORT", "SHIPYARD"].includes(role)) return apiError("Role must be ADMIN, SUPPORT, or SHIPYARD", 400);
    const pwResult = validatePassword(password);
    if (!pwResult.valid) return apiError(pwResult.message, 400, `PWD_${pwResult.code}`);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return apiError("Email already in use", 409);

    const hashedPassword = await bcrypt.hash(password, 10);

    // For SHIPYARD, the operator must make an explicit choice:
    // - Pass `shipyardId` to attach the new user to an existing shipyard.
    // - Omit it (or pass empty) and we create a new shipyard from `company`.
    // This is the structural fix for the data-mismatch class of bugs: a new
    // SHIPYARD account never silently lands in a brand-new orphan shipyard
    // when the operator actually meant to put them in an existing one.
    let shipyardId: string | undefined;
    // Both SHIPYARD (viewer) and SUPPORT (write) are scoped to a shipyard.
    if (role === "SHIPYARD" || role === "SUPPORT") {
      if (explicitShipyardId) {
        // Verify the target shipyard exists and is active.
        const target = await prisma.shipyard.findUnique({
          where: { id: explicitShipyardId },
          select: { id: true },
        });
        if (!target) return apiError("Selected shipyard not found", 404);
        shipyardId = target.id;
      } else {
        const companyName = (company || name).trim();
        if (!companyName) {
          return apiError("Company name (or shipyard selection) is required for SHIPYARD/SUPPORT users", 400);
        }
        const shipyard = await findOrCreateShipyardByName(companyName);
        shipyardId = shipyard.id;
      }
    }

    const created = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        company: company || null,
        role,
        shipyardId,
        needsPasswordChange: true,
      },
      select: { id: true, name: true, email: true, role: true },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    safeError("Create user error", err);
    return apiError("Failed to create user", 500);
  }
}

/** PATCH /api/admin/users — update user role/status */
export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  try {
    const body = await request.json();
    const { userId, role, isActive, shipyardId, name, email, company, newPassword } = body;

    if (!userId) return apiError("userId is required", 400);

    // Prevent self role change
    if (userId === user.id && role !== undefined) {
      return apiError("Cannot change your own role", 400);
    }

    // Validate role if provided
    const validRoles = ["ADMIN", "SUPPORT", "SHIPYARD", "VENDOR"];
    if (role !== undefined && !validRoles.includes(role)) {
      return apiError("Invalid role. Must be ADMIN, SUPPORT, SHIPYARD, or VENDOR", 400);
    }

    // Prevent changing ADMIN role (blocks role-change-then-delete bypass)
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, shipyardId: true } });
    if (!target) return apiError("User not found", 404);
    if (target.role === "ADMIN" && role !== undefined && role !== "ADMIN") {
      // Check if this is the last admin
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) {
        return apiError("Cannot demote the last admin", 400);
      }
      return apiError("Cannot change role of admin accounts", 400);
    }

    // If the operator is moving the user to a different shipyard, validate
    // the target exists. Allow nullification (transfer out) by passing null.
    if (shipyardId !== undefined && shipyardId !== null) {
      const sy = await prisma.shipyard.findUnique({
        where: { id: shipyardId },
        select: { id: true },
      });
      if (!sy) return apiError("Selected shipyard not found", 404);
    }

    // If we're moving a VENDOR to a different shipyard, also realign every
    // piece of equipment they own to the new shipyard's projects? No — that
    // would silently mutate other operators' projects. Instead, refuse the
    // move when the vendor still has equipment hosted in the previous
    // shipyard, so the operator must clean up first.
    if (
      shipyardId !== undefined &&
      target.role === "VENDOR" &&
      shipyardId !== target.shipyardId
    ) {
      const conflictingEquipment = await prisma.equipment.count({
        where: {
          vendors: { some: { id: userId } },
          project: { shipyardId: target.shipyardId ?? undefined },
        },
      });
      if (conflictingEquipment > 0) {
        return apiError(
          "Vendor still has equipment in the current shipyard. Reassign or delete it first.",
          409,
        );
      }
    }

    // Validate email uniqueness if changing
    if (email !== undefined) {
      const existing = await prisma.user.findFirst({
        where: { email, id: { not: userId } },
        select: { id: true },
      });
      if (existing) return apiError("Email already in use", 409);
    }

    // Hash new password if provided
    let hashedPassword: string | undefined;
    if (newPassword) {
      const pwResult = validatePassword(newPassword);
      if (!pwResult.valid) return apiError(pwResult.message, 400, `PWD_${pwResult.code}`);
      hashedPassword = await bcrypt.hash(newPassword, 10);
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(email !== undefined && { email: email.trim() }),
        ...(company !== undefined && { company: company?.trim() || null }),
        ...(hashedPassword && { password: hashedPassword, needsPasswordChange: true }),
        ...(role !== undefined && { role }),
        ...(isActive !== undefined && { isActive }),
        ...(shipyardId !== undefined && { shipyardId }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        shipyardId: true,
        company: true,
      },
    });

    return NextResponse.json(updated);
  } catch {
    return apiError("Failed to update user", 500);
  }
}

/** DELETE /api/admin/users — delete a user (ADMIN only) */
export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return apiError("userId is required", 400);

  // Prevent self-deletion
  if (userId === user.id) return apiError("Cannot delete yourself", 400);

  // Check target user
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!target) return apiError("User not found", 404);

  // Prevent admin deletion
  if (target.role === "ADMIN") return apiError("Cannot delete admin accounts", 400);

  // Gather dependent IDs OUTSIDE the transaction to minimize transaction time
  // and to decide whether the shipyard record can be safely removed.
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { shipyardId: true },
  });

  const equipmentIdsByVendor =
    target.role === "VENDOR"
      ? (
          await prisma.equipment.findMany({ where: { vendors: { some: { id: userId } } }, select: { id: true } })
        ).map((e) => e.id)
      : [];

  let shipyardProjectIds: string[] = [];
  let shipyardEquipmentIds: string[] = [];
  let shipyardHasOtherUsers = true;
  if (target.role === "SHIPYARD" && targetUser?.shipyardId) {
    shipyardProjectIds = (
      await prisma.project.findMany({
        where: { shipyardId: targetUser.shipyardId },
        select: { id: true },
      })
    ).map((p) => p.id);
    if (shipyardProjectIds.length > 0) {
      shipyardEquipmentIds = (
        await prisma.equipment.findMany({
          where: { projectId: { in: shipyardProjectIds } },
          select: { id: true },
        })
      ).map((e) => e.id);
    }
    shipyardHasOtherUsers =
      (await prisma.user.count({
        where: { shipyardId: targetUser.shipyardId, id: { not: userId } },
      })) > 0;
  }

  try {
    // Phase 1: Clear non-soft-delete models (logs, auth, system tables).
    // These are hard-deletes and don't need the soft-delete extension, so
    // they run outside the transaction to avoid the 5s timeout.
    await prisma.userActionLog.deleteMany({ where: { userId } });
    await prisma.loginLog.deleteMany({ where: { userId } });
    await prisma.ipWhitelist.deleteMany({ where: { userId } });
    await prisma.aiFeedback.deleteMany({ where: { userId } });
    await prisma.aiConversation.deleteMany({ where: { userId } });
    await prisma.notification.deleteMany({ where: { userId } });
    await prisma.loginAttempt.deleteMany({ where: { userId } });
    await prisma.securityLog.deleteMany({ where: { userId } });
    await prisma.changeEvent.deleteMany({ where: { projectId: { in: shipyardProjectIds } } });

    // Phase 2: Soft-delete domain entities (the extension rewrites these
    // to UPDATE … SET deletedAt). Uses the regular `prisma` client (not
    // interactive transactions) to avoid the tx-timeout problem — each
    // call is its own implicit transaction which is fine because soft-
    // delete is idempotent and the user row is deleted last.
    await prisma.certDocument.deleteMany({ where: { uploadedBy: userId } });
    await prisma.qna.deleteMany({ where: { userId } });
    await prisma.equipmentTemplate.deleteMany({ where: { vendorId: userId } });

    // VENDOR: delete their equipment + children
    if (equipmentIdsByVendor.length > 0) {
      await prisma.vendorAuditResult.deleteMany({ where: { equipmentId: { in: equipmentIdsByVendor } } });
      await prisma.assessment.deleteMany({ where: { hardware: { equipmentId: { in: equipmentIdsByVendor } } } });
      await prisma.software.deleteMany({ where: { equipmentId: { in: equipmentIdsByVendor } } });
      await prisma.hardware.deleteMany({ where: { equipmentId: { in: equipmentIdsByVendor } } });
      await prisma.dfdDiagram.deleteMany({ where: { equipmentId: { in: equipmentIdsByVendor } } });
      await prisma.auditRun.deleteMany({ where: { equipmentId: { in: equipmentIdsByVendor } } });
      await prisma.equipment.deleteMany({ where: { id: { in: equipmentIdsByVendor } } });
    }

    // SHIPYARD: delete all projects under this shipyard
    if (shipyardProjectIds.length > 0) {
      if (shipyardEquipmentIds.length > 0) {
        await prisma.vendorAuditResult.deleteMany({ where: { equipmentId: { in: shipyardEquipmentIds } } });
        await prisma.dfdDiagram.deleteMany({ where: { equipmentId: { in: shipyardEquipmentIds } } });
        await prisma.equipment.deleteMany({ where: { projectId: { in: shipyardProjectIds } } });
      }
      await prisma.auditRun.deleteMany({ where: { projectId: { in: shipyardProjectIds } } });
      await prisma.assessment.deleteMany({ where: { hardware: { projectId: { in: shipyardProjectIds } } } });
      await prisma.software.deleteMany({ where: { projectId: { in: shipyardProjectIds } } });
      await prisma.hardware.deleteMany({ where: { projectId: { in: shipyardProjectIds } } });
      await prisma.dfdDiagram.deleteMany({ where: { projectId: { in: shipyardProjectIds } } });
      await prisma.compliancePackage.deleteMany({ where: { projectId: { in: shipyardProjectIds } } });
      await prisma.submissionFile.deleteMany({ where: { submission: { projectId: { in: shipyardProjectIds } } } });
      await prisma.document.deleteMany({ where: { submission: { projectId: { in: shipyardProjectIds } } } });
      await prisma.submission.deleteMany({ where: { projectId: { in: shipyardProjectIds } } });
      await prisma.riskEntry.deleteMany({ where: { projectId: { in: shipyardProjectIds } } });
      await prisma.project.deleteMany({ where: { shipyardId: targetUser!.shipyardId! } });
    }

    // Remove the shipyard row itself only if no other users reference it.
    if (target.role === "SHIPYARD" && targetUser?.shipyardId && !shipyardHasOtherUsers) {
      await prisma.shipyard.delete({ where: { id: targetUser.shipyardId } });
    }

    await prisma.user.delete({ where: { id: userId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    safeError("Delete user error", err);
    return apiError("Failed to delete user", 500);
  }
}
