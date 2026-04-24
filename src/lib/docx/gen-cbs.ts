/**
 * E27-CBS: Cyber Security Bill of Materials
 * Lists all hardware assets in the CBS with their key attributes.
 */
import type { Document } from "docx";
import type { DocumentData } from "./index";
import {
  buildCoverPage,
  heading1,
  heading2,
  bodyText,
  buildTable,
  buildApprovalBlock,
  wrapDocument,
} from "./shared";

const HW_TYPE_LABELS: Record<string, string> = {
  PLC: "PLC",
  SERVER: "Server",
  SENSOR: "Sensor",
  NETWORK_DEVICE: "Network Device",
  PC: "PC/Workstation",
  OTHER_DEVICE: "Other",
};

export function generateCBS(data: DocumentData): Document {
  const { project, hardware } = data;

  const cover = buildCoverPage(project, "Cyber Security Bill of Materials", "E27-CBS");

  const summary = [
    heading1("1. Overview"),
    bodyText(
      `This document provides a complete inventory of all Computer Based System (CBS) ` +
      `hardware components for vessel "${project.vesselName}"${project.systemName ? ` (${project.systemName})` : ""}. ` +
      `A total of ${hardware.length} hardware asset(s) are registered in the system.`,
    ),
  ];

  const tableSection = [
    heading1("2. Hardware Asset Inventory"),
    bodyText("The following table lists all hardware assets registered in the CBS scope."),
    buildTable(
      ["#", "Asset Name", "Type", "Manufacturer", "Model", "IP Address", "Zone", "Location", "SW Count"],
      hardware.map((hw, i) => [
        String(i + 1),
        hw.name,
        HW_TYPE_LABELS[hw.type] || hw.type,
        hw.manufacturer || "",
        hw.model || "",
        hw.ipAddress || "",
        hw.zone || "",
        hw.location || "",
        String(hw.software.length),
      ]),
    ),
  ];

  // Zone summary
  const zoneGroups = new Map<string, number>();
  hardware.forEach((hw) => {
    const z = hw.zone || "Unassigned";
    zoneGroups.set(z, (zoneGroups.get(z) || 0) + 1);
  });

  const zoneSummary = [
    heading2("2.1 Zone Distribution"),
    buildTable(
      ["Zone", "Asset Count"],
      Array.from(zoneGroups.entries()).map(([zone, count]) => [zone, String(count)]),
    ),
  ];

  const typeGroups = new Map<string, number>();
  hardware.forEach((hw) => {
    const t = HW_TYPE_LABELS[hw.type] || hw.type;
    typeGroups.set(t, (typeGroups.get(t) || 0) + 1);
  });

  const typeSummary = [
    heading2("2.2 Asset Type Distribution"),
    buildTable(
      ["Type", "Count"],
      Array.from(typeGroups.entries()).map(([type, count]) => [type, String(count)]),
    ),
  ];

  return wrapDocument("E27-CBS: Cyber Security Bill of Materials", project, [
    ...cover,
    ...summary,
    ...tableSection,
    ...zoneSummary,
    ...typeSummary,
    ...buildApprovalBlock(),
  ]);
}
