import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { safeError } from "@/lib/safe-log";
import { validatePassword } from "@/lib/password-policy";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

/** GET /api/shipyard/vendors — list vendors belonging to the user's shipyard */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "SHIPYARD" && user.role !== "ADMIN") return apiError("Forbidden", 403);

  const where = user.role === "ADMIN"
    ? { role: "VENDOR" as const }
    : { role: "VENDOR" as const, shipyardId: user.shipyardId! };

  const vendors = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      name: true,
      company: true,
      phone: true,
      isActive: true,
      createdAt: true,
      shipyard: { select: { id: true, name: true } },
      _count: { select: { assignedEquipments: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(vendors);
}

/** POST /api/shipyard/vendors — create a new vendor account */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "SHIPYARD" && user.role !== "ADMIN") return apiError("Forbidden", 403);

  try {
    const body = await request.json();
    const { email, name, company, phone, password, shipyardId: targetShipyardId } = body;

    if (!email?.trim()) return apiError("Email is required", 400);
    if (!name?.trim()) return apiError("Name is required", 400);
    const pwResult = validatePassword(password);
    if (!pwResult.valid) return apiError(pwResult.message, 400, `PWD_${pwResult.code}`);

    // Determine which shipyard to assign
    const assignShipyardId = user.role === "ADMIN" ? targetShipyardId : user.shipyardId;
    if (!assignShipyardId) return apiError("Shipyard assignment required", 400);

    const vendorEmail = email.trim();

    // Check email uniqueness
    const existing = await prisma.user.findUnique({ where: { email: vendorEmail } });
    if (existing) return apiError("Email already in use", 409);

    const hashedPassword = await bcrypt.hash(password, 12);

    const vendor = await prisma.user.create({
      data: {
        email: vendorEmail,
        password: hashedPassword,
        name: name.trim(),
        company: company?.trim() || null,
        phone: phone?.trim() || null,
        role: "VENDOR",
        shipyardId: assignShipyardId,
        isActive: true,
        needsPasswordChange: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        company: true,
        phone: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json(vendor, { status: 201 });
  } catch (err) {
    safeError("Create vendor error", err);
    return apiError("Failed to create vendor", 500);
  }
}

/** PATCH /api/shipyard/vendors — update vendor account */
export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "SHIPYARD" && user.role !== "ADMIN") return apiError("Forbidden", 403);

  try {
    const body = await request.json();
    const { id, name, company, phone, isActive, password, resetIp } = body;

    if (!id) return apiError("Vendor id is required", 400);

    // Verify vendor belongs to user's shipyard
    const vendor = await prisma.user.findUnique({
      where: { id },
      select: { role: true, shipyardId: true },
    });
    if (!vendor || vendor.role !== "VENDOR") return apiError("Vendor not found", 404);
    if (user.role === "SHIPYARD" && vendor.shipyardId !== user.shipyardId) {
      return apiError("Forbidden", 403);
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name.trim();
    if (company !== undefined) data.company = company?.trim() || null;
    if (phone !== undefined) data.phone = phone?.trim() || null;
    if (isActive !== undefined) data.isActive = isActive;
    if (password !== undefined && password !== null && password !== "") {
      const pwResult = validatePassword(password);
      if (!pwResult.valid) return apiError(pwResult.message, 400, `PWD_${pwResult.code}`);
      data.password = await bcrypt.hash(password, 12);
      data.needsPasswordChange = true;
    }

    // IP 화이트리스트 초기화
    if (resetIp) {
      await prisma.ipWhitelist.deleteMany({ where: { userId: id } });
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        company: true,
        phone: true,
        isActive: true,
      },
    });

    return NextResponse.json({ ...updated, ipReset: !!resetIp });
  } catch {
    return apiError("Failed to update vendor", 500);
  }
}

/** DELETE /api/shipyard/vendors?id=xxx — delete a vendor */
export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "SHIPYARD" && user.role !== "ADMIN") return apiError("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return apiError("id is required", 400);

  // Verify the vendor belongs to this shipyard
  const vendor = await prisma.user.findUnique({ where: { id }, select: { role: true, shipyardId: true } });
  if (!vendor || vendor.role !== "VENDOR") return apiError("Vendor not found", 404);
  if (user.role === "SHIPYARD" && vendor.shipyardId !== user.shipyardId) return apiError("Forbidden", 403);

  // Collect equipment IDs outside the transaction.
  const equipmentIds = (
    await prisma.equipment.findMany({ where: { vendors: { some: { id } } }, select: { id: true } })
  ).map((e) => e.id);

  try {
    // Phase 1: Non-soft-delete models (hard delete, no extension overhead)
    await prisma.userActionLog.deleteMany({ where: { userId: id } });
    await prisma.loginLog.deleteMany({ where: { userId: id } });
    await prisma.ipWhitelist.deleteMany({ where: { userId: id } });
    await prisma.aiFeedback.deleteMany({ where: { userId: id } });
    await prisma.aiConversation.deleteMany({ where: { userId: id } });
    await prisma.notification.deleteMany({ where: { userId: id } });
    await prisma.loginAttempt.deleteMany({ where: { userId: id } });
    await prisma.securityLog.deleteMany({ where: { userId: id } });

    // Phase 2: Soft-delete domain entities (children first)
    if (equipmentIds.length > 0) {
      await prisma.vendorAuditResult.deleteMany({ where: { equipmentId: { in: equipmentIds } } });
      await prisma.assessment.deleteMany({ where: { hardware: { equipmentId: { in: equipmentIds } } } });
      await prisma.software.deleteMany({ where: { equipmentId: { in: equipmentIds } } });
      await prisma.hardware.deleteMany({ where: { equipmentId: { in: equipmentIds } } });
      await prisma.dfdDiagram.deleteMany({ where: { equipmentId: { in: equipmentIds } } });
      await prisma.equipment.deleteMany({ where: { id: { in: equipmentIds } } });
    }

    await prisma.certDocument.deleteMany({ where: { uploadedBy: id } });
    await prisma.qna.deleteMany({ where: { userId: id } });
    await prisma.equipmentTemplate.deleteMany({ where: { vendorId: id } });
    await prisma.user.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    safeError("Delete vendor error", err);
    return apiError("Failed to delete vendor", 500);
  }
}
