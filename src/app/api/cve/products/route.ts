import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, apiError } from "@/lib/auth-helpers";
import { KNOWN_PRODUCTS, KNOWN_HARDWARE } from "@/lib/known-products";

export const dynamic = "force-dynamic";

/** Simple fuzzy match: returns true if query roughly matches target */
function fuzzyMatch(target: string, query: string): boolean {
  if (!query) return true;
  // Exact substring
  if (target.includes(query)) return true;
  // Allow 1-2 char typos via character overlap ratio
  if (query.length >= 3) {
    const qChars = new Set(query.split(""));
    const tChars = new Set(target.split(""));
    let overlap = 0;
    qChars.forEach(c => { if (tChars.has(c)) overlap++; });
    // 70%+ character overlap = fuzzy match
    if (overlap / qChars.size >= 0.7) return true;
  }
  return false;
}

function matchesQuery(fields: string[], q: string): boolean {
  return fields.some(f => fuzzyMatch(f, q));
}

/** GET /api/cve/products?q=forti&kind=hw|sw */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const q = (req.nextUrl.searchParams.get("q") || "").toLowerCase();
  const kind = req.nextUrl.searchParams.get("kind") || "sw";

  if (kind === "hw") {
    const hwType = req.nextUrl.searchParams.get("hwType") || "";
    let hwResults = KNOWN_HARDWARE;
    if (hwType) hwResults = hwResults.filter(p => p.hwType === hwType);
    if (q) hwResults = hwResults.filter(p =>
      matchesQuery([p.label.toLowerCase(), p.manufacturer.toLowerCase(), p.series, p.category.toLowerCase()], q)
    );
    const grouped: Record<string, typeof hwResults> = {};
    hwResults.forEach(p => { if (!grouped[p.category]) grouped[p.category] = []; grouped[p.category].push(p); });
    return NextResponse.json({ items: hwResults.slice(0, 80), grouped });
  }

  // SW
  const swType = req.nextUrl.searchParams.get("swType") || "";
  let results = KNOWN_PRODUCTS;
  if (swType) results = results.filter(p => p.swType === swType);
  if (q) results = results.filter(p =>
    matchesQuery([p.label.toLowerCase(), p.vendor, p.product, p.category.toLowerCase()], q)
  );
  const grouped: Record<string, typeof results> = {};
  results.forEach(p => { if (!grouped[p.category]) grouped[p.category] = []; grouped[p.category].push(p); });
  return NextResponse.json({ items: results.slice(0, 80), grouped });
}
