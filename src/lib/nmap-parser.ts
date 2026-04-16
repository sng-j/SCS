// ─── Nmap XML Parser ────────────────────────────────────────────────────────
// Parses nmap XML output (-oX) into the same ScpScanResult format
// used by the SC-P text parser, allowing unified import flow.
// Runs client-side via DOMParser.

import type { ScpScanResult, ScpHost, ScpPort, ScpSoftware } from "./scan-parser";
import { lookupMacVendor, inferTypeFromMacVendor } from "./mac-oui";

// ─── Topology types ─────────────────────────────────────────────────────────

export interface TracerouteHop {
  ttl: number;
  ip: string;
  rtt: number;
}

export interface TopologyLink {
  src: string;
  dst: string;
  hops: TracerouteHop[];
}

export interface NmapEnrichedResult extends ScpScanResult {
  topology?: {
    links: TopologyLink[];
  };
}

// ─── Service → Software mapping (for nmap CPE/product) ──────────────────────

const OS_VENDOR_MAP: Record<string, string> = {
  ubuntu: "Canonical",
  debian: "Debian Project",
  centos: "CentOS Project",
  "red hat": "Red Hat",
  fedora: "Fedora Project",
  windows: "Microsoft",
  synology: "Synology",
  fortios: "Fortinet",
  freebsd: "FreeBSD Foundation",
};

// ─── Helper: extract text from XML element ──────────────────────────────────

function getAttr(el: Element, attr: string): string {
  return el.getAttribute(attr) || "";
}

function getChildText(parent: Element, tag: string): string {
  const child = parent.querySelector(tag);
  return child?.textContent?.trim() || "";
}

// ─── Parse nmap XML ─────────────────────────────────────────────────────────

export function parseNmapXml(xmlText: string): NmapEnrichedResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");

  // Check for parse errors
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("Invalid nmap XML: " + parseError.textContent?.substring(0, 200));
  }

  const nmaprun = doc.querySelector("nmaprun");
  const startTs = nmaprun ? getAttr(nmaprun, "start") : "";
  const scanDate = startTs ? new Date(parseInt(startTs) * 1000).toISOString() : new Date().toISOString();
  const scanArgs = nmaprun ? getAttr(nmaprun, "args") : "";

  const hostElements = doc.querySelectorAll("host");
  const hosts: ScpHost[] = [];
  const topologyLinks: TopologyLink[] = [];

  for (const hostEl of hostElements) {
    // Skip down hosts
    const status = hostEl.querySelector("status");
    if (status && getAttr(status, "state") !== "up") continue;

    // ── Addresses ──
    let ip = "";
    let mac = "00:00:00:00:00:00";
    let nmapMacVendor: string | null = null;

    const addresses = hostEl.querySelectorAll("address");
    for (const addr of addresses) {
      const addrType = getAttr(addr, "addrtype");
      if (addrType === "ipv4" || addrType === "ipv6") {
        ip = getAttr(addr, "addr");
      } else if (addrType === "mac") {
        mac = getAttr(addr, "addr").toUpperCase();
        nmapMacVendor = getAttr(addr, "vendor") || null;
      }
    }

    if (!ip) continue;

    // MAC vendor: prefer nmap's vendor attr, fallback to OUI lookup
    const macVendor = nmapMacVendor || lookupMacVendor(mac);

    // ── Hostname ──
    let hostname: string | null = null;
    const hostnameEl = hostEl.querySelector("hostnames hostname");
    if (hostnameEl) {
      hostname = getAttr(hostnameEl, "name") || null;
    }

    // ── Ports ──
    const ports: ScpPort[] = [];
    const portElements = hostEl.querySelectorAll("ports port");

    for (const portEl of portElements) {
      const stateEl = portEl.querySelector("state");
      if (stateEl && getAttr(stateEl, "state") !== "open") continue;

      const portNum = parseInt(getAttr(portEl, "portid"), 10);
      const protocol = getAttr(portEl, "protocol"); // tcp/udp

      const serviceEl = portEl.querySelector("service");
      let service = "unknown";
      let product: string | null = null;
      let version: string | null = null;
      let cpe: string | null = null;
      let extraInfo: string | null = null;

      if (serviceEl) {
        service = getAttr(serviceEl, "name") || "unknown";
        product = getAttr(serviceEl, "product") || null;
        version = getAttr(serviceEl, "version") || null;
        extraInfo = getAttr(serviceEl, "extrainfo") || null;

        // Get CPE from service
        const cpeEl = serviceEl.querySelector("cpe");
        if (cpeEl) {
          cpe = cpeEl.textContent?.trim() || null;
        }
      }

      ports.push({
        port: portNum,
        service: service + (protocol === "udp" ? "/udp" : ""),
        product,
        version,
        banner: extraInfo,
        cpe: cpe || undefined,
      });
    }

    // ── OS Detection ──
    let os: ScpHost["os"] = null;
    const osmatchEl = hostEl.querySelector("os osmatch");
    if (osmatchEl) {
      const osName = getAttr(osmatchEl, "name");
      const accuracy = parseInt(getAttr(osmatchEl, "accuracy"), 10) || 0;

      let osCpe: string | undefined;
      const osclassEl = osmatchEl.querySelector("osclass");
      if (osclassEl) {
        const osclassCpeEl = osclassEl.querySelector("cpe");
        if (osclassCpeEl) {
          osCpe = osclassCpeEl.textContent?.trim() || undefined;
        }
      }

      os = {
        name: osName,
        confidence: accuracy,
        method: "nmap-fingerprint",
        cpe: osCpe,
      };
    }

    // ── Traceroute ──
    const traceEl = hostEl.querySelector("trace");
    if (traceEl) {
      const hops: TracerouteHop[] = [];
      const hopElements = traceEl.querySelectorAll("hop");
      for (const hopEl of hopElements) {
        hops.push({
          ttl: parseInt(getAttr(hopEl, "ttl"), 10),
          ip: getAttr(hopEl, "ipaddr"),
          rtt: parseFloat(getAttr(hopEl, "rtt")) || 0,
        });
      }
      if (hops.length > 0) {
        topologyLinks.push({ src: "scanner", dst: ip, hops });
      }
    }

    // ── NSE Script results (for hwName enrichment) ──
    let scriptTitle: string | null = null;
    const scriptElements = hostEl.querySelectorAll("hostscript script, ports port script");
    for (const scriptEl of scriptElements) {
      const scriptId = getAttr(scriptEl, "id");
      if (scriptId === "http-title") {
        scriptTitle = getAttr(scriptEl, "output") || null;
      }
    }

    // ── Classification ──
    const { hwType, hwName } = classifyNmapHost(ip, mac, macVendor, ports, os, hostname, scriptTitle);

    // ── Software extraction ──
    const software = extractNmapSoftware(ports, os);

    hosts.push({
      ip,
      mac,
      macVendor: macVendor || undefined,
      hostname: hostname || undefined,
      ports,
      os,
      hwType,
      hwName,
      software,
    });
  }

  // Sort hosts by IP
  hosts.sort((a, b) => {
    const ap = a.ip.split(".").map(Number);
    const bp = b.ip.split(".").map(Number);
    for (let i = 0; i < 4; i++) {
      if (ap[i] !== bp[i]) return ap[i] - bp[i];
    }
    return 0;
  });

  // Infer subnet
  const firstIp = hosts[0]?.ip || "0.0.0.0";
  const subnet = firstIp.replace(/\.\d+$/, ".0/24");

  return {
    meta: {
      scanDate,
      hostCount: hosts.length,
      subnet,
      scanner: "nmap",
    },
    hosts,
    topology: topologyLinks.length > 0 ? { links: topologyLinks } : undefined,
  };
}

// ─── Nmap-aware host classification ─────────────────────────────────────────

function classifyNmapHost(
  ip: string,
  mac: string,
  macVendor: string | null,
  ports: ScpPort[],
  os: ScpHost["os"],
  hostname: string | null,
  scriptTitle: string | null,
): { hwType: string; hwName: string } {
  const portNums = new Set(ports.map((p) => p.port));
  const hasPort = (n: number) => portNums.has(n);
  const osName = os?.name?.toLowerCase() || "";
  const osCpe = (os as { cpe?: string })?.cpe || "";
  const allProducts = ports.map((p) => (p.product || "").toLowerCase()).join(" ");

  // Use script title or hostname for better naming
  const displayName = scriptTitle || hostname || null;

  // ── 1. MAC vendor-based inference (strongest signal from nmap) ──
  const macHint = inferTypeFromMacVendor(macVendor);

  // ── 2. Specific product detection from nmap -sV ──
  if (allProducts.includes("fortios") || allProducts.includes("fortigate")) {
    return { hwType: "NETWORK_DEVICE", hwName: displayName || `Fortinet Firewall (${ip})` };
  }

  // Synology NAS (from product or CPE or MAC)
  if (allProducts.includes("synology") || osCpe.includes("synology") || macVendor?.includes("Synology")) {
    return { hwType: "SERVER", hwName: displayName || `Synology NAS (${ip})` };
  }

  // ── 3. PLC / Industrial (from MAC vendor) ──
  if (macHint === "PLC") {
    return { hwType: "PLC", hwName: displayName || `${macVendor} PLC (${ip})` };
  }

  // ── 4. Maritime sensor/navigation (from MAC vendor) ──
  if (macHint === "SENSOR") {
    return { hwType: "SENSOR", hwName: displayName || `${macVendor} (${ip})` };
  }

  // ── 5. Network device (from MAC vendor) ──
  if (macHint === "NETWORK_DEVICE") {
    return { hwType: "NETWORK_DEVICE", hwName: displayName || `${macVendor} (${ip})` };
  }

  // ── 6. Printer — but verify it's actually a printer ──
  const hasHeavyServices = hasPort(3306) || hasPort(5432) || hasPort(9200) || hasPort(8080) || hasPort(8443);
  if (macHint === "OTHER_DEVICE" && !hasHeavyServices) {
    return { hwType: "OTHER_DEVICE", hwName: displayName || `${macVendor} Printer (${ip})` };
  }

  // ── 7. OS-based classification (nmap fingerprint is reliable) ──
  if (osName.includes("windows") && hasPort(3389)) {
    return { hwType: "PC", hwName: displayName || `Windows PC (${ip})` };
  }
  if ((osName.includes("ubuntu") || osName.includes("linux")) && hasPort(3389)) {
    return { hwType: "PC", hwName: displayName || `Linux Workstation (${ip})` };
  }
  if (osName.includes("windows")) {
    return { hwType: "SERVER", hwName: displayName || `Windows Server (${ip})` };
  }
  if (osName.includes("ubuntu")) {
    return { hwType: "SERVER", hwName: displayName || `Ubuntu Server (${ip})` };
  }
  if (osName.includes("linux")) {
    return { hwType: "SERVER", hwName: displayName || `Linux Server (${ip})` };
  }

  // ── 8. Port-based fallbacks ──
  if (hasPort(502)) {
    return { hwType: "PLC", hwName: displayName || `Modbus Device (${ip})` };
  }
  if (ip.endsWith(".1") || (hasPort(179) /* BGP */)) {
    return { hwType: "NETWORK_DEVICE", hwName: displayName || `Gateway (${ip})` };
  }

  // ── 9. VM detection from MAC ──
  if (macVendor?.includes("QEMU") || macVendor?.includes("VMware") || macVendor?.includes("VirtualBox") || macVendor?.includes("Hyper-V")) {
    return { hwType: "SERVER", hwName: displayName || `Virtual Machine (${ip})` };
  }

  return { hwType: "SERVER", hwName: displayName || `Host (${ip})` };
}

// ─── Nmap software extraction (richer than SC-P) ────────────────────────────

function extractNmapSoftware(ports: ScpPort[], os: ScpHost["os"]): ScpSoftware[] {
  const software: ScpSoftware[] = [];
  const seen = new Set<string>();

  // OS entry
  if (os?.name) {
    const osLower = os.name.toLowerCase();
    let osVendor: string | null = null;
    for (const [key, vendor] of Object.entries(OS_VENDOR_MAP)) {
      if (osLower.includes(key)) {
        osVendor = vendor;
        break;
      }
    }

    // Try to extract version from OS name (e.g., "Linux 4.15 - 5.8" → "4.15-5.8")
    const versionMatch = /(\d+\.\d+(?:\s*-\s*\d+\.\d+)?)/i.exec(os.name);
    const key = `os:${os.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      software.push({
        name: os.name.split("(")[0].trim(),
        version: versionMatch ? versionMatch[1].replace(/\s+/g, "") : null,
        vendor: osVendor,
        swType: "OS",
        listeningPort: null,
        cpe: (os as { cpe?: string })?.cpe || undefined,
      });
    }
  }

  // Per-port software from nmap -sV
  for (const p of ports) {
    if (!p.product) continue;

    const key = `${p.product}:${p.port}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Infer vendor from product name
    let vendor: string | null = null;
    const prodLower = p.product.toLowerCase();
    if (prodLower.includes("openssh")) vendor = "OpenBSD";
    else if (prodLower.includes("apache")) vendor = "Apache Foundation";
    else if (prodLower.includes("nginx")) vendor = "F5/Nginx";
    else if (prodLower.includes("mysql")) vendor = "Oracle";
    else if (prodLower.includes("mariadb")) vendor = "MariaDB Foundation";
    else if (prodLower.includes("postgresql")) vendor = "PostgreSQL Global";
    else if (prodLower.includes("synology")) vendor = "Synology";
    else if (prodLower.includes("fortios") || prodLower.includes("fortigate")) vendor = "Fortinet";
    else if (prodLower.includes("microsoft") || prodLower.includes("iis")) vendor = "Microsoft";
    else if (prodLower.includes("elasticsearch")) vendor = "Elastic";
    else if (prodLower.includes("prometheus")) vendor = "Prometheus Authors";
    else if (prodLower.includes("grafana")) vendor = "Grafana Labs";
    else if (prodLower.includes("node.js") || prodLower.includes("nodejs")) vendor = "OpenJS Foundation";
    else if (prodLower.includes("redis")) vendor = "Redis Ltd.";
    else if (prodLower.includes("mongodb")) vendor = "MongoDB Inc.";

    // Determine swType
    let swType = "APPLICATION";
    if (prodLower.includes("fortios")) swType = "FIRMWARE";

    software.push({
      name: p.product,
      version: p.version,
      vendor,
      swType,
      listeningPort: String(p.port),
      cpe: (p as { cpe?: string })?.cpe || undefined,
    });
  }

  return software;
}

// ─── Detect if text is nmap XML ─────────────────────────────────────────────

export function isNmapXml(text: string): boolean {
  const trimmed = text.trimStart().substring(0, 500);
  return trimmed.includes("<nmaprun") || (trimmed.startsWith("<?xml") && trimmed.includes("nmap"));
}
