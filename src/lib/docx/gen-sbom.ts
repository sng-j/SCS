/**
 * E27-SBOM: Software Bill of Materials
 * Lists all software components with their host hardware mapping.
 */
import type { Document, Paragraph, Table } from "docx";
import type { DocumentData } from "./index";
import {
  buildCoverPage,
  heading1,
  heading2,
  bodyText,
  buildTable,
  wrapDocument,
} from "./shared";

const SW_TYPE_LABELS: Record<string, string> = {
  OS: "Operating System",
  APPLICATION: "Application",
  FIRMWARE: "Firmware",
  DRIVER: "Driver",
  LIBRARY: "Library",
};

export function generateSBOM(data: DocumentData): Document {
  const { project, software } = data;

  const cover = buildCoverPage(project, "Software Bill of Materials", "E27-SBOM");

  const summary = [
    heading1("1. Overview"),
    bodyText(
      `This document provides a complete software inventory for the CBS of vessel "${project.vesselName}". ` +
      `A total of ${software.length} software component(s) are registered.`,
    ),
  ];

  const tableSection = [
    heading1("2. Software Inventory"),
    buildTable(
      ["#", "Software Name", "Version", "Vendor", "Type", "CPE", "Installed On"],
      software.map((sw, i) => [
        String(i + 1),
        sw.name,
        sw.version || "",
        sw.vendor || "",
        SW_TYPE_LABELS[sw.swType] || sw.swType,
        sw.cpe || "",
        sw.hardware?.name || "Unlinked",
      ]),
    ),
  ];

  // Group by type
  const typeGroups = new Map<string, number>();
  software.forEach((sw) => {
    const t = SW_TYPE_LABELS[sw.swType] || sw.swType;
    typeGroups.set(t, (typeGroups.get(t) || 0) + 1);
  });

  const typeSummary = [
    heading2("2.1 Software Type Distribution"),
    buildTable(
      ["Type", "Count"],
      Array.from(typeGroups.entries()).map(([type, count]) => [type, String(count)]),
    ),
  ];

  // Vendor list
  const vendors = new Set<string>();
  software.forEach((sw) => { if (sw.vendor) vendors.add(sw.vendor); });

  const vendorSection = [
    heading2("2.2 Vendor Summary"),
    bodyText(`${vendors.size} unique software vendor(s) identified:`),
    buildTable(
      ["Vendor", "Software Count"],
      Array.from(vendors).map((v) => [
        v,
        String(software.filter((sw) => sw.vendor === v).length),
      ]),
    ),
  ];

  // CVE Exposure Summary
  const totalCveMatches = software.reduce((sum, sw) => sum + (sw._count?.cveMatches || 0), 0);
  const swWithCve = software.filter((sw) => (sw._count?.cveMatches || 0) > 0);
  const cveSection: (Paragraph | Table)[] = [
    heading1("3. CVE Exposure Summary"),
    bodyText(
      `${totalCveMatches} CVE match(es) identified across ${swWithCve.length} software component(s). ` +
      `Detailed vulnerability analysis is provided in the E27-VUL (Vulnerability Assessment) document.`,
    ),
  ];
  if (swWithCve.length > 0) {
    cveSection.push(
      buildTable(
        ["Software", "Version", "Vendor", "CVE Matches"],
        swWithCve.map((sw) => [
          sw.name,
          sw.version || "—",
          sw.vendor || "—",
          String(sw._count?.cveMatches || 0),
        ]),
      ),
    );
  }

  // Audit-Detected Software (from AuditRun sbomData)
  const auditSwSection: (Paragraph | Table)[] = [
    heading1("4. Additional Software Detected by Security Audit"),
    bodyText(
      "The following section identifies software detected by automated security audit tools (PowerShell/Linux audit scripts) " +
      "that may not be present in the manually registered software inventory above. " +
      "Software detected only by audit tools should be reviewed and either added to the formal inventory or documented as excluded.",
    ),
  ];
  const { auditRuns } = data;
  if (auditRuns && auditRuns.length > 0) {
    const auditSw: string[][] = [];
    auditRuns.forEach((run) => {
      const results = run.results as Record<string, unknown> | null;
      const sbom = run.sbomData as Record<string, unknown>[] | null;
      if (sbom && Array.isArray(sbom)) {
        sbom.forEach((item: Record<string, unknown>) => {
          const name = String(item.name || item.Name || "");
          const version = String(item.version || item.Version || "—");
          if (name && !software.some((sw) => sw.name.toLowerCase() === name.toLowerCase())) {
            auditSw.push([name, version, String(item.publisher || item.Publisher || "—"), "Audit-detected"]);
          }
        });
      }
      if (results && typeof results === "object" && "InstalledSoftware" in results) {
        const instSw = (results as { InstalledSoftware: Record<string, unknown>[] }).InstalledSoftware;
        if (Array.isArray(instSw)) {
          instSw.forEach((item) => {
            const name = String(item.Name || item.name || "");
            const version = String(item.Version || item.version || "—");
            if (name && !software.some((sw) => sw.name.toLowerCase() === name.toLowerCase())) {
              auditSw.push([name, version, String(item.Publisher || item.publisher || "—"), "Audit-detected"]);
            }
          });
        }
      }
    });
    if (auditSw.length > 0) {
      auditSwSection.push(
        bodyText(`${auditSw.length} software component(s) detected by audit tools but not in the registered inventory:`),
        buildTable(["Software Name", "Version", "Publisher", "Source"], auditSw),
      );
    } else {
      auditSwSection.push(bodyText("All audit-detected software is already present in the registered inventory."));
    }
  } else {
    auditSwSection.push(bodyText("No audit run data available. Run the security audit tool to detect installed software automatically."));
  }

  return wrapDocument("E27-SBOM: Software Bill of Materials", project, [
    ...cover,
    ...summary,
    ...tableSection,
    ...typeSummary,
    ...vendorSection,
    ...cveSection,
    ...auditSwSection,
  ]);
}
