/**
 * E27-TOP: Network Topology Description
 * Describes network zones, hardware placement, and connections.
 */
import type { Document, Paragraph, Table } from "docx";
import type { DocumentData } from "./index";
import { MARITIME_ZONES } from "@/lib/constants";
import {
  buildCoverPage,
  heading1,
  heading2,
  bodyText,
  buildTable,
  wrapDocument,
} from "./shared";

export function generateTOP(data: DocumentData): Document {
  const { project, hardware, connections } = data;

  const cover = buildCoverPage(project, "Network Topology Description", "E27-TOP");

  const overview = [
    heading1("1. Overview"),
    bodyText(
      `This document describes the network topology and zone architecture of the CBS ` +
      `for vessel "${project.vesselName}". The system comprises ${hardware.length} hardware asset(s) ` +
      `distributed across the defined IEC 62443 security zones.`,
    ),
  ];

  // Zone definitions
  const zoneSection = [
    heading1("2. Security Zones"),
    bodyText(
      "The following security zones are defined according to IEC 62443 zone model " +
      "and IACS UR E26 requirements:",
    ),
    buildTable(
      ["Zone ID", "Zone Name", "Description"],
      MARITIME_ZONES.map((z) => [z.id, z.label, z.labelKo]),
    ),
  ];

  // Hardware per zone
  const zoneGroups = new Map<string, typeof hardware>();
  hardware.forEach((hw) => {
    const z = hw.zone || "unassigned";
    if (!zoneGroups.has(z)) zoneGroups.set(z, []);
    zoneGroups.get(z)!.push(hw);
  });

  const hwPerZone: (Paragraph | Table)[] = [heading1("3. Assets per Zone")];

  zoneGroups.forEach((assets, zoneId) => {
    const zoneDef = MARITIME_ZONES.find((z) => z.id === zoneId);
    const zoneName = zoneDef ? zoneDef.label : zoneId;

    hwPerZone.push(heading2(`3.x ${zoneName}`));
    hwPerZone.push(
      buildTable(
        ["Asset Name", "Type", "IP Address", "Location"],
        assets.map((hw) => [
          hw.name,
          hw.type,
          hw.ipAddress || "",
          hw.location || "",
        ]),
      ),
    );
  });

  // Connection matrix
  const connSection = [
    heading1("4. Network Connections"),
    bodyText(
      "The following table shows the IP-based network connectivity of assets. " +
      "Detailed connection diagrams are maintained in the DFD Diagram module.",
    ),
    buildTable(
      ["#", "Asset Name", "IP Address", "MAC Address", "Zone", "Connected Software"],
      hardware
        .filter((hw) => hw.ipAddress)
        .map((hw, i) => [
          String(i + 1),
          hw.name,
          hw.ipAddress || "",
          hw.macAddress || "",
          hw.zone || "",
          hw.software.map((s) => s.name).join(", ") || "None",
        ]),
    ),
  ];

  // Connection Map from NetworkConnection data
  const connectionMap: (Paragraph | Table)[] = [
    heading1("5. Connection Map"),
    bodyText(
      `The following table shows all registered network connections between CBS hardware assets. ` +
      `${connections.length} connection(s) are registered.`,
    ),
  ];
  if (connections.length > 0) {
    connectionMap.push(
      buildTable(
        ["#", "From", "To", "Medium", "Protocol", "Port", "Encrypted"],
        connections.map((c, i) => [
          String(i + 1),
          c.fromHw?.name || "Unknown",
          c.toHw?.name || "Unknown",
          c.medium || "Ethernet",
          c.protocol || "—",
          c.port || "—",
          c.encrypted ? "Yes" : "No",
        ]),
      ),
    );
  } else {
    connectionMap.push(bodyText("No network connections have been registered. Please define connections in the DFD editor."));
  }

  // DFD Diagram Reference
  const dfdRef: (Paragraph | Table)[] = [
    heading1("6. DFD Diagram Reference"),
    bodyText(
      "The detailed Data Flow Diagram (DFD) is maintained in the system's interactive DFD editor " +
      "and should be exported separately as a PNG/PDF image for inclusion in the final submission package. " +
      "The DFD visually represents network topology, security zones, trust boundaries, and data flows."
    ),
  ];

  return wrapDocument("E27-TOP: Network Topology Description", project, [
    ...cover,
    ...overview,
    ...zoneSection,
    ...hwPerZone,
    ...connSection,
    ...connectionMap,
    ...dfdRef,
  ]);
}
