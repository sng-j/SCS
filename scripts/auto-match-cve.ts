/**
 * Precise two-step CVE auto-matching (strict mode)
 *
 * Step 1: HW — exact model match only (no prefix/wildcard)
 * Step 2: SW — vendor+product exact, or self-match. No generic names.
 *
 * Usage: npx tsx scripts/auto-match-cve.ts
 */

import { PrismaClient } from "@prisma/client";
import { KNOWN_PRODUCTS } from "../src/lib/known-products";
const prisma = new PrismaClient();

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i]||0, nb = pb[i]||0;
    if (na < nb) return -1; if (na > nb) return 1;
  }
  return 0;
}
function norm(v: string) { return v.replace(/[^0-9.]/g, "").replace(/\.+$/, ""); }
function isAffected(ver: string|null, s: string|null, e: string|null): boolean {
  if (!ver) return true; if (!s && !e) return false;
  const sv = norm(ver); if (!sv) return true;
  if (s && e) return compareVersions(sv, norm(s)) >= 0 && compareVersions(sv, norm(e)) <= 0;
  if (s) return compareVersions(sv, norm(s)) >= 0;
  if (e) return compareVersions(sv, norm(e)) <= 0;
  return true;
}

const GENERIC = new Set(["firmware","software","driver","server","client","system","application","service","module","device","manager","agent","os","kernel","library","tool","utility","plugin"]);
type Cve = { cveId: string; versionStart: string|null; versionEnd: string|null; baseScore: number|null; baseSeverity: string|null };
const SEL = { cveId: true as const, versionStart: true as const, versionEnd: true as const, baseScore: true as const, baseSeverity: true as const };
function s2l(s: number|null) { if(!s)return 1;if(s>=9)return 5;if(s>=7)return 4;if(s>=4)return 3;if(s>=2)return 2;return 1; }
function s2i(v: string|null) { switch(v?.toUpperCase()){case"CRITICAL":return 5;case"HIGH":return 4;case"MEDIUM":return 3;case"LOW":return 2;default:return 1;} }

async function main() {
  console.log("🔗 Strict CVE auto-matching\n");

  const allHw = await prisma.hardware.findMany({ where: { deletedAt: null }, select: { id: true, name: true, manufacturer: true, model: true, projectId: true } });
  const allSw = await prisma.software.findMany({ where: { deletedAt: null }, select: { id: true, name: true, vendor: true, version: true, cpe: true, projectId: true, hardware: { select: { id: true, name: true, manufacturer: true, model: true } } } });

  console.log(`📦 ${allHw.length} HW, ${allSw.length} SW\n`);
  let hwTotal = 0, swTotal = 0;

  // ── Step 1: HW exact model match ──────────────────────────────────────
  console.log("── Step 1: HW (exact model) ──");
  for (const hw of allHw) {
    if (!hw.manufacturer || !hw.model) { console.log(`  ⚪ ${hw.name}: no mfr/model`); continue; }
    const vendor = hw.manufacturer.toLowerCase().split(/\s+/)[0];
    const modelFull = hw.model.toLowerCase().replace(/\s+/g, "_");
    const modelDash = modelFull.replace(/-/g, "_");

    let cves: Cve[] = [];
    // Exact full model
    cves = await prisma.cveLocal.findMany({ where: { vendor, product: modelFull }, select: SEL });
    if (cves.length === 0 && modelDash !== modelFull) {
      cves = await prisma.cveLocal.findMany({ where: { vendor, product: modelDash }, select: SEL });
    }

    if (cves.length === 0 || cves.length > 50) {
      console.log(`  ⚪ ${hw.name} (${hw.manufacturer} ${hw.model}): ${cves.length === 0 ? "no match" : "too broad"}`);
      continue;
    }

    let created = 0;
    for (const { cveId } of cves) {
      try { await prisma.cveMatch.create({ data: { hardwareId: hw.id, cveId, matchType: "hw-auto" } }); created++; } catch {}
    }
    if (created > 0) { console.log(`  ✅ ${hw.name}: ${created} CVEs (${vendor}/${modelFull})`); hwTotal += created; }
  }

  // ── Step 2: SW strict match ───────────────────────────────────────────
  console.log("\n── Step 2: SW (strict) ──");
  for (const sw of allSw) {
    const nameClean = sw.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (GENERIC.has(nameClean)) { console.log(`  ⚪ ${sw.name}: generic name, skip`); continue; }

    let cves: Cve[] = [];
    let method = "";

    // CPE exact
    if (sw.cpe?.startsWith("cpe:2.3:")) {
      const p = sw.cpe.split(":");
      if (p.length >= 5 && p[3] !== "*" && p[4] !== "*") {
        cves = await prisma.cveLocal.findMany({ where: { vendor: p[3].toLowerCase(), product: p[4].toLowerCase() }, select: SEL });
        method = `CPE ${p[3]}/${p[4]}`;
      }
    }

    // Catalog match by SW name
    if (cves.length === 0) {
      const nameLc = sw.name.toLowerCase().trim();
      const cat = KNOWN_PRODUCTS.find(p =>
        p.label.toLowerCase() === nameLc ||
        p.label.toLowerCase().replace(/\s+/g, "") === nameLc.replace(/\s+/g, "")
      );
      if (cat) {
        cves = await prisma.cveLocal.findMany({ where: { vendor: cat.vendor, product: cat.product }, select: SEL });
        if (cves.length === 0) {
          const base = cat.product.replace(/_\d+h\d+$/, "");
          cves = await prisma.cveLocal.findMany({ where: { vendor: cat.vendor, product: { startsWith: base } }, select: SEL, take: 500 });
        }
        if (cves.length > 0) method = `catalog: ${cat.vendor}/${cat.product}`;
      }
    }

    // Vendor + exact name
    if (cves.length === 0) {
      const vendor = (sw.vendor || (sw as any).hardware?.manufacturer || "").toLowerCase().split(/\s+/)[0];
      if (vendor && vendor.length >= 3) {
        const nameNorm = sw.name.toLowerCase().replace(/\s+/g, "_");
        cves = await prisma.cveLocal.findMany({ where: { vendor, product: nameNorm }, select: SEL });
        if (cves.length > 0) method = `${vendor}/${nameNorm}`;
      }
    }

    // Self-match (centos/centos)
    if (cves.length === 0 && nameClean.length >= 4) {
      cves = await prisma.cveLocal.findMany({ where: { vendor: nameClean, product: nameClean }, select: SEL });
      if (cves.length > 0) method = `self: ${nameClean}`;
    }

    if (cves.length === 0) { console.log(`  ⚪ ${sw.name} v${sw.version||"?"}: no match`); continue; }

    // Version filter (when many) + no-version fallback (top severity)
    const before = cves.length;
    if (!sw.version && before > 50) {
      cves = cves
        .filter(c => c.baseSeverity === "CRITICAL" || c.baseSeverity === "HIGH")
        .sort((a, b) => (b.baseScore || 0) - (a.baseScore || 0))
        .slice(0, 50);
      console.log(`  📋 ${sw.name} (no version): ${before} → ${cves.length} top CRITICAL/HIGH`);
    } else if (before > 10 && sw.version) {
      cves = cves.filter(c => isAffected(sw.version, c.versionStart, c.versionEnd));
    }
    if (cves.length > 300) { console.log(`  ⚠️  ${sw.name}: ${cves.length} too many, skip`); continue; }
    if (cves.length === 0) { console.log(`  ⚪ ${sw.name} v${sw.version}: all filtered by version`); continue; }

    let created = 0;
    for (const { cveId } of cves) {
      try { await prisma.cveMatch.create({ data: { softwareId: sw.id, cveId, matchType: sw.cpe ? "cpe-auto" : "name-auto" } }); created++; } catch {}
    }
    console.log(`  ✅ ${sw.name} v${sw.version||"?"}: ${created} CVEs${before > 10 ? ` (${before}→${cves.length} ver filter)` : ""} (${method})`);
    swTotal += created;
  }

  console.log(`\n📊 HW: ${hwTotal}, SW: ${swTotal}, Total: ${hwTotal + swTotal}`);

  // ── Generate Risks ────────────────────────────────────────────────────
  console.log("\n── Generating risks ──");
  const projects = [...new Set([...allHw.map(h=>h.projectId), ...allSw.map(s=>s.projectId)])];
  let riskTotal = 0;
  for (const pid of projects) {
    const matches = await prisma.cveMatch.findMany({
      where: { OR: [{ hardware: { projectId: pid } }, { software: { projectId: pid } }], deletedAt: null },
      select: { cveId: true, hardwareId: true, softwareId: true },
    });
    const map = new Map<string, string>();
    for (const m of matches) {
      if (map.has(m.cveId)) continue;
      if (m.hardwareId) { const h = allHw.find(x=>x.id===m.hardwareId); if(h) map.set(m.cveId, h.name); }
      if (m.softwareId) { const s = allSw.find(x=>x.id===m.softwareId); if(s) map.set(m.cveId, (s as any).hardware?.name ? `${(s as any).hardware.name} → ${s.name} v${s.version||""}` : s.name); }
    }
    const ids = [...map.keys()];
    if (ids.length === 0) continue;
    const det = await prisma.cveLocal.findMany({ where: { cveId: { in: ids } }, select: { cveId: true, baseScore: true, baseSeverity: true } });
    const dm = new Map(det.map(c=>[c.cveId,c]));
    let n = 0;
    for (const id of ids) {
      const c = dm.get(id); if(!c) continue; n++;
      await prisma.riskEntry.create({ data: { projectId: pid, cveId: id, threatId: `T-${String(n).padStart(3,"0")}`, assetRef: map.get(id)||null, likelihood: s2l(c.baseScore), impact: s2i(c.baseSeverity), riskLevel: s2l(c.baseScore)*s2i(c.baseSeverity), status: "OPEN" } });
      riskTotal++;
    }
  }
  console.log(`📊 Risks: ${riskTotal}`);
  await prisma.$disconnect();
  console.log("🎉 Done!");
}

main().catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
