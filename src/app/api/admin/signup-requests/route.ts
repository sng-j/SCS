import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { logSecurityEvent } from "@/lib/security-log";

export const dynamic = "force-dynamic";

/** GET /api/admin/signup-requests — list pending signup requests */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  const requests = await prisma.signupRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(requests);
}

/** PATCH /api/admin/signup-requests — approve or reject */
export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  if (user.role !== "ADMIN") return apiError("Forbidden", 403);

  try {
    const body = await request.json();
    const { requestId, action } = body;

    if (!requestId || !["APPROVED", "REJECTED"].includes(action)) {
      return apiError("requestId and action (APPROVED/REJECTED) required", 400);
    }

    const signupReq = await prisma.signupRequest.findUnique({
      where: { id: requestId },
    });

    if (!signupReq) return apiError("Request not found", 404);
    if (signupReq.status !== "PENDING") return apiError("Request already processed", 409);

    // Update status
    await prisma.signupRequest.update({
      where: { id: requestId },
      data: { status: action },
    });

    // If approved, create shipyard + user account
    if (action === "APPROVED") {
      // Reject approval if no password was provided during signup
      if (!signupReq.password) {
        return apiError("Cannot approve request without password. Ask user to re-register with a password.", 400);
      }
      const password = signupReq.password;
      const companyName = signupReq.company || signupReq.name;

      // Create or find shipyard for this company
      let shipyard = await prisma.shipyard.findFirst({
        where: { name: companyName },
      });
      if (!shipyard) {
        shipyard = await prisma.shipyard.create({
          data: { name: companyName },
        });
      }

      await prisma.user.create({
        data: {
          email: signupReq.email,
          name: signupReq.name,
          password,
          company: signupReq.company,
          phone: signupReq.phone,
          role: "SHIPYARD",
          shipyardId: shipyard.id,
          needsPasswordChange: true,
        },
      });

      // Clear any login lockout from failed attempts during pending period
      await prisma.loginAttempt.deleteMany({
        where: { email: signupReq.email, success: false },
      });
    }

    logSecurityEvent(
      `SIGNUP_${action}`,
      `Signup request ${action.toLowerCase()}: ${signupReq.email}`,
      "INFO",
      user.id,
    ).catch(() => {});

    return NextResponse.json({ success: true });
  } catch {
    return apiError("Failed to process request", 500);
  }
}
