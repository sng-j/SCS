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
  buildApprovalBlock,
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

  let zoneIdx = 0;
  zoneGroups.forEach((assets, zoneId) => {
    const zoneDef = MARITIME_ZONES.find((z) => z.id === zoneId);
    const zoneName = zoneDef ? zoneDef.label : zoneId;

    zoneIdx++;
    hwPerZone.push(heading2(`3.${zoneIdx} ${zoneName}`));
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

  // DFD Diagram — embedded as node/edge tables when we have the equipment's
  // diagram in the DB. docx can't render arbitrary SVG inline cheaply, so we
  // emit a readable structured representation instead of telling the
  // reviewer "look elsewhere". The interactive diagram remains in the app.
  const dfdRef: (Paragraph | Table)[] = [heading1("6. Data Flow Diagram")];
  if (data.dfd && Array.isArray(data.dfd.nodes) && data.dfd.nodes.length > 0) {
    type DfdNode = { id: string; type?: string; data?: { label?: string }; position?: { x: number; y: number } };
    type DfdEdge = { id?: string; source: string; target: string; label?: string; data?: { label?: string } };
    const nodes = data.dfd.nodes as DfdNode[];
    const edges = (data.dfd.edges as DfdEdge[]) ?? [];

    dfdRef.push(bodyText(
      `The DFD for this equipment comprises ${nodes.length} node(s) and ${edges.length} edge(s). ` +
      `Each node is one CBS asset or external interface; each edge is a data / signal flow between them. ` +
      `The interactive diagram lives in the DFD editor — this table is the authoritative text form.`
    ));

    dfdRef.push(heading2("6.1 DFD Nodes"));
    dfdRef.push(
      buildTable(
        ["#", "Node ID", "Type", "Label"],
        nodes.map((n, i) => [
          String(i + 1),
          n.id,
          n.type || "default",
          n.data?.label || n.id,
        ]),
      ),
    );

    if (edges.length > 0) {
      const nameById = new Map<string, string>();
      for (const n of nodes) nameById.set(n.id, n.data?.label || n.id);
      dfdRef.push(heading2("6.2 DFD Flows (Edges)"));
      dfdRef.push(
        buildTable(
          ["#", "From", "To", "Label"],
          edges.map((e, i) => [
            String(i + 1),
            nameById.get(e.source) || e.source,
            nameById.get(e.target) || e.target,
            e.label || e.data?.label || "—",
          ]),
        ),
      );
    }

    dfdRef.push(bodyText(
      "For visual review, export the diagram to PNG/PDF from the DFD editor and attach the file to this document for the submission package."
    ));
  } else if (data.equipmentId) {
    dfdRef.push(bodyText(
      "No DFD has been drawn for this equipment yet. Open the DFD editor to create one — it will be embedded (as node/edge tables) on the next generation."
    ));
  } else {
    dfdRef.push(bodyText(
      "The DFD is embedded only when this document is generated with an equipment scope. Generate from a specific equipment to include its diagram."
    ));
  }

  return wrapDocument("E27-TOP: Network Topology Description", project, [
    ...cover,
    ...overview,
    ...zoneSection,
    ...hwPerZone,
    ...connSection,
    ...connectionMap,
    ...dfdRef,
    ...buildApprovalBlock(),
  ]);
}
