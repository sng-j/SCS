/**
 * Sync CISA Known Exploited Vulnerabilities (KEV) catalog into ExploitRef.
 *
 * CISA publishes a public JSON feed of vulnerabilities that are confirmed to be
 * actively exploited in the wild. Presence in the KEV catalog is the single
 * strongest signal that a CVE deserves high likelihood scoring. We import each
 * KEV entry as an ExploitRef row (type="kev") so the existing match tooling
 * can flag it without a dedicated table.
 *
 * Usage: npx tsx scripts/sync-cisa-kev.ts
 * Schedule weekly via pm2/cron; CISA typically adds 2-5 CVEs per week.
 *
 * Source: https://www.cisa.gov/known-exploited-vulnerabilities-catalog
 * Feed:   https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json
 */
import { prisma } from "../src/lib/prisma";

const KEV_URL =
  "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";

interface KevEntry {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  shortDescription: string;
  requiredAction: string;
  dueDate: string;
  knownRansomwareCampaignUse?: string;
  notes?: string;
}

async function main() {
  console.log("[kev-sync] fetching CISA KEV catalog…");
  const res = await fetch(KEV_URL, {
    headers: { "User-Agent": "SCS-CVE-Sync/1.0" },
  });
  if (!res.ok) {
    console.error(`[kev-sync] fetch failed: HTTP ${res.status}`);
    process.exit(1);
  }
  const data = (await res.json()) as {
    catalogVersion: string;
    dateReleased: string;
    count: number;
    vulnerabilities: KevEntry[];
  };
  console.log(
    `[kev-sync] catalog v${data.catalogVersion} released ${data.dateReleased} — ${data.count} entries`,
  );

  let created = 0;
  let updated = 0;
  for (const v of data.vulnerabilities) {
    const edbId = `KEV-${v.cveID}`;
    try {
      const existing = await prisma.exploitRef.findUnique({ where: { edbId } });
      const payload = {
        cveId: v.cveID,
        title: v.vulnerabilityName,
        description: [
          v.shortDescription,
          `Required action by ${v.dueDate}: ${v.requiredAction}`,
          v.knownRansomwareCampaignUse === "Known"
            ? "Known ransomware campaign use."
            : null,
        ]
          .filter(Boolean)
          .join("\n\n"),
        platform: `${v.vendorProject}:${v.product}`,
        type: "kev",
        url: `https://www.cisa.gov/known-exploited-vulnerabilities-catalog#${v.cveID}`,
      };
      if (existing) {
        await prisma.exploitRef.update({ where: { edbId }, data: payload });
        updated++;
      } else {
        await prisma.exploitRef.create({ data: { edbId, ...payload } });
        created++;
      }
    } catch (err) {
      console.error(`[kev-sync] ${v.cveID}:`, (err as Error).message);
    }
  }

  console.log(`[kev-sync] done — created ${created}, updated ${updated}`);

  const total = await prisma.exploitRef.count({ where: { type: "kev" } });
  console.log(`[kev-sync] total KEV entries in DB: ${total}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
