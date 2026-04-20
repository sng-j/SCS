import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** GET — list all doc formats */
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return apiError("Forbidden", 403);

  const formats = await prisma.docFormat.findMany({
    orderBy: [{ standard: "asc" }, { code: "asc" }],
  });
  return NextResponse.json(formats);
}

/** POST — create a new doc format */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return apiError("Forbidden", 403);

  const body = await req.json();
  const { code, standard, title, titleKo, sections, isActive } = body;

  if (!code || !standard || !title) {
    return apiError("code, standard, title are required", 400);
  }

  const existing = await prisma.docFormat.findUnique({ where: { code } });
  if (existing) return apiError("Code already exists", 409);

  const format = await prisma.docFormat.create({
    data: {
      code,
      standard,
      title,
      titleKo: titleKo || null,
      sections: typeof sections === "string" ? sections : JSON.stringify(sections || []),
      isActive: isActive ?? true,
    },
  });
  return NextResponse.json(format, { status: 201 });
}

/** PATCH — update a doc format */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return apiError("Forbidden", 403);

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return apiError("id is required", 400);

  if (updates.sections && typeof updates.sections !== "string") {
    updates.sections = JSON.stringify(updates.sections);
  }

  const format = await prisma.docFormat.update({
    where: { id },
    data: updates,
  });
  return NextResponse.json(format);
}

/** DELETE — delete a doc format */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return apiError("Forbidden", 403);

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return apiError("id is required", 400);

  await prisma.docFormat.delete({ where: { id: parseInt(id, 10) } });
  return NextResponse.json({ ok: true });
}
