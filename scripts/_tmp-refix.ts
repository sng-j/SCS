import { prisma } from "../src/lib/prisma";
import { buildE27 } from "../src/lib/audit-e27";
(async () => {
  const runs = await prisma.auditRun.findMany({
    where: { hardwareId: { not: null } },
    select: { id: true, hardwareId: true, platform: true, results: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const latestByHw = new Map<string, typeof runs[number]>();
  for (const r of runs) if (r.hardwareId) latestByHw.set(r.hardwareId, r);
  let created = 0, updated = 0;
  for (const [hardwareId, run] of latestByHw) {
    const data = typeof run.results === "string" ? JSON.parse(run.results) : run.results;
    const e27 = buildE27(data);
    if (e27.items.length === 0) continue;

    // Refresh OS fields from audit.
    const sysinfo = data?.SystemInfo ?? {};
    if (sysinfo.OS || sysinfo.OSVersion) {
      const patch: Record<string, string | null> = {};
      if (sysinfo.OS) patch.sysSoftwareCategory = String(sysinfo.OS).split(" ")[0];
      if (sysinfo.OSVersion) patch.sysSoftwareVersion = String(sysinfo.OSVersion);
      await prisma.hardware.update({ where: { id: hardwareId }, data: patch });
    }

    const scGroups = new Map<string, { items: typeof e27.items; pass: number; total: number }>();
    for (const item of e27.items) {
      const g = scGroups.get(item.cat) ?? { items: [], pass: 0, total: 0 };
      g.items.push(item); g.total++; if (item.pass) g.pass++;
      scGroups.set(item.cat, g);
    }
    for (const [sc, g] of scGroups) {
      const result = g.pass === g.total ? "PASS" : g.pass === 0 ? "FAIL" : "PARTIAL";
      const evidence = g.items.map((i) => `${i.pass ? "O" : "X"} ${i.item}: ${i.detail}`).join("\n");
      const note = `Auto: ${g.pass}/${g.total} (${run.platform}) [backfill]`;
      // updateMany bypasses the soft-delete extension's deletedAt:null
      // filter — if a tombstoned row exists it gets revived with fresh
      // values, unique index stays happy.
      const u = await prisma.assessment.updateMany({
        where: { hardwareId, checkId: sc },
        data: { result, evidence, note, standard: "E27", deletedAt: null },
      });
      if (u.count === 0) {
        await prisma.assessment.create({ data: { hardwareId, checkId: sc, standard: "E27", result, evidence, note } });
        created++;
      } else {
        updated++;
      }
    }
  }
  console.log(`backfill done. created=${created} updated=${updated}`);
  await prisma.$disconnect();
})();
