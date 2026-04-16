import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { getStaticSuggestions } from "@/lib/equipment-knowledge";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[projectId]/suggestions
 * ?field=manufacturer&kind=hw&query=Sie&type=PLC&name=...
 *
 * Returns: { suggestions: string[] }
 * Combines static knowledge base + DB frequency-based suggestions
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ suggestions: [] }, { status: 401 });

  const { projectId } = await params;
  const sp = request.nextUrl.searchParams;
  const field = sp.get("field") || "";
  const kind = (sp.get("kind") || "hw") as "hw" | "sw";
  const query = (sp.get("query") || "").toLowerCase().trim();

  // Build context from query params
  const context: Record<string, string> = {};
  for (const key of ["type", "name", "manufacturer", "swType", "hardwareName"]) {
    const v = sp.get(key);
    if (v) context[key] = v;
  }

  // 1. Static suggestions from knowledge base
  const staticSugs = getStaticSuggestions(field, kind, context);

  // 2. DB-based suggestions (frequency-based from existing records in this project)
  const dbSugs = await getDbSuggestions(projectId, field, kind, query);

  // 3. Merge: static first, then DB unique additions
  const seen = new Set<string>();
  const merged: string[] = [];

  // Add static suggestions (filtered by query if provided)
  for (const s of staticSugs) {
    const key = s.toLowerCase();
    if (query && !key.includes(query)) continue;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(s);
    }
  }

  // Add DB suggestions
  for (const s of dbSugs) {
    const key = s.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(s);
    }
  }

  // If query provided but no static matches, show DB results first
  if (query && staticSugs.length === 0) {
    return NextResponse.json({ suggestions: merged.slice(0, 8) });
  }

  return NextResponse.json({ suggestions: merged.slice(0, 8) });
}

// ── DB-based frequency suggestions ──
async function getDbSuggestions(
  projectId: string,
  field: string,
  kind: "hw" | "sw",
  query: string
): Promise<string[]> {
  try {
    if (kind === "hw") {
      return await getHwFieldValues(projectId, field, query);
    } else {
      return await getSwFieldValues(projectId, field, query);
    }
  } catch {
    return [];
  }
}

async function getHwFieldValues(projectId: string, field: string, query: string): Promise<string[]> {
  const fieldMap: Record<string, string> = {
    name: "name",
    manufacturer: "manufacturer",
    model: "model",
    physicalInterface: "physicalInterface",
    commProtocols: "commProtocols",
    location: "location",
    logicalLocation: "logicalLocation",
    purpose: "purpose",
    sysSoftwareCategory: "sysSoftwareCategory",
    sysSoftwareVersion: "sysSoftwareVersion",
    protectionMethod: "protectionMethod",
    ipAddress: "ipAddress",
    brand: "brand",
    identifier: "identifier",
  };

  const dbField = fieldMap[field];
  if (!dbField) return [];

  const records = await prisma.hardware.findMany({
    where: {
      projectId,
      [dbField]: query ? { contains: query } : { not: null },
    },
    select: { [dbField]: true },
    take: 100,
  });

  // Count frequency
  const freq = new Map<string, number>();
  for (const r of records) {
    const val = (r as Record<string, unknown>)[dbField] as string | null;
    if (!val || !val.trim()) continue;
    // For comma-separated fields, split and count each
    if (field === "physicalInterface" || field === "commProtocols") {
      for (const part of val.split(",")) {
        const trimmed = part.trim();
        if (trimmed) freq.set(trimmed, (freq.get(trimmed) || 0) + 1);
      }
    } else {
      freq.set(val.trim(), (freq.get(val.trim()) || 0) + 1);
    }
  }

  // Sort by frequency descending
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([val]) => val);
}

async function getSwFieldValues(projectId: string, field: string, query: string): Promise<string[]> {
  const fieldMap: Record<string, string> = {
    name: "name",
    vendor: "vendor",
    version: "version",
    modelName: "modelName",
    purpose: "purpose",
    listeningPort: "listeningPort",
    cpe: "cpe",
    brand: "brand",
  };

  const dbField = fieldMap[field];
  if (!dbField) return [];

  const records = await prisma.software.findMany({
    where: {
      projectId,
      [dbField]: query ? { contains: query } : { not: null },
    },
    select: { [dbField]: true },
    take: 100,
  });

  const freq = new Map<string, number>();
  for (const r of records) {
    const val = (r as Record<string, unknown>)[dbField] as string | null;
    if (!val || !val.trim()) continue;
    if (field === "listeningPort") {
      for (const part of val.split(",")) {
        const trimmed = part.trim();
        if (trimmed) freq.set(trimmed, (freq.get(trimmed) || 0) + 1);
      }
    } else {
      freq.set(val.trim(), (freq.get(val.trim()) || 0) + 1);
    }
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([val]) => val);
}
