/**
 * E27-SBOM: Software Bill of Materials
 * Lists all software components with their host hardware mapping.
 */
import type { Document } from "docx";
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

  return wrapDocument("E27-SBOM: Software Bill of Materials", project, [
    ...cover,
    ...summary,
    ...tableSection,
    ...typeSummary,
    ...vendorSection,
  ]);
}
