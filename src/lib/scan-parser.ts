// ─── SC-P Scan Parser ────────────────────────────────────────────────────────
// Converts SC-P (Ship Equipment Cybersecurity Compliance Assessment System Probe) scan output files
// into a structured JSON for SCS inventory import.
// Runs both client-side (preview) and server-side (API).

import { lookupMacVendor, inferTypeFromMacVendor } from "./mac-oui";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScpPort {
  port: number;
  service: string;
  product: string | null;
  version: string | null;
  banner: string | null;
  cpe?: string;
}

export interface ScpSoftware {
  name: string;
  version: string | null;
  vendor: string | null;
  swType: string;
  listeningPort: string | null;
  cpe?: string;
}

export interface ScpHost {
  ip: string;
  mac: string;
  macVendor?: string;
  hostname?: string;
  ports: ScpPort[];
  os: { name: string; confidence: number; method: string; cpe?: string } | null;
  hwType: string;
  hwName: string;
  software: ScpSoftware[];
}

export interface ScpScanResult {
  meta: {
    scanDate: string;
    hostCount: number;
    subnet: string;
    scanner?: string;
  };
  hosts: ScpHost[];
}

// ─── Internal types for parsing ──────────────────────────────────────────────

interface PortScanHost {
  os: { name: string; confidence: number; method: string } | null;
  ports: ScpPort[];
  vendor?: string;
  deviceType?: string;
}

// ─── Banner → Software mapping ───────────────────────────────────────────────

const BANNER_PATTERNS: { pattern: RegExp; name: string; vendor: string; swType: string; extractVersion?: (m: RegExpMatchArray) => string }[] = [
  {
    pattern: /OpenSSH[_ ](\S+)/i,
    name: "OpenSSH",
    vendor: "OpenBSD",
    swType: "APPLICATION",
    extractVersion: (m) => m[1].replace(/_/g, " "),
  },
  {
    pattern: /fortinet/i,
    name: "FortiOS",
    vendor: "Fortinet",
    swType: "FIRMWARE",
  },
  {
    pattern: /Apache[/ ](\S+)/i,
    name: "Apache HTTP Server",
    vendor: "Apache Foundation",
    swType: "APPLICATION",
    extractVersion: (m) => m[1],
  },
  {
    pattern: /nginx[/ ](\S+)/i,
    name: "nginx",
    vendor: "F5/Nginx",
    swType: "APPLICATION",
    extractVersion: (m) => m[1],
  },
  {
    pattern: /Microsoft-IIS[/ ](\S+)/i,
    name: "Microsoft IIS",
    vendor: "Microsoft",
    swType: "APPLICATION",
    extractVersion: (m) => m[1],
  },
  {
    pattern: /MariaDB[- ]?(\S+)?/i,
    name: "MariaDB",
    vendor: "MariaDB Foundation",
    swType: "APPLICATION",
    extractVersion: (m) => m[1] || "",
  },
  {
    pattern: /PostgreSQL[- ]?(\S+)?/i,
    name: "PostgreSQL",
    vendor: "PostgreSQL Global",
    swType: "APPLICATION",
    extractVersion: (m) => m[1] || "",
  },
  {
    pattern: /dropbear[_ ]?(\S+)?/i,
    name: "Dropbear SSH",
    vendor: "Matt Johnston",
    swType: "APPLICATION",
    extractVersion: (m) => m[1] || "",
  },
  {
    pattern: /Synology/i,
    name: "Synology DSM",
    vendor: "Synology",
    swType: "OS",
  },
  {
    pattern: /MikroTik/i,
    name: "RouterOS",
    vendor: "MikroTik",
    swType: "FIRMWARE",
  },
];

const SERVICE_SOFTWARE: Record<string, { name: string; vendor: string; swType: string }> = {
  mysql: { name: "MySQL", vendor: "Oracle", swType: "APPLICATION" },
  elasticsearch: { name: "Elasticsearch", vendor: "Elastic", swType: "APPLICATION" },
  rpcbind: { name: "rpcbind", vendor: "", swType: "APPLICATION" },
  "http-proxy": { name: "HTTP Proxy", vendor: "", swType: "APPLICATION" },
  postgresql: { name: "PostgreSQL", vendor: "PostgreSQL Global", swType: "APPLICATION" },
  redis: { name: "Redis", vendor: "Redis Ltd.", swType: "APPLICATION" },
  mongodb: { name: "MongoDB", vendor: "MongoDB Inc.", swType: "APPLICATION" },
  "microsoft-ds": { name: "SMB/CIFS", vendor: "Microsoft", swType: "APPLICATION" },
  snmp: { name: "SNMP Agent", vendor: "", swType: "APPLICATION" },
  modbus: { name: "Modbus TCP", vendor: "", swType: "APPLICATION" },
  dnp3: { name: "DNP3", vendor: "", swType: "APPLICATION" },
  rdp: { name: "Remote Desktop", vendor: "Microsoft", swType: "APPLICATION" },
};

// ─── Known port → service name (for "unknown" ports) ────────────────────────

const KNOWN_PORTS: Record<number, string> = {
  199: "SMUX",
  502: "Modbus TCP",
  3261: "iSCSI",
  5000: "HTTP (DSM/App)",
  5001: "HTTPS (DSM/App)",
  5357: "WSDAPI",
  5432: "PostgreSQL",
  5555: "ADB/Freeciv",
  5678: "n8n",
  8090: "Web Application",
  8443: "HTTPS-alt",
  9000: "Portainer/SonarQube",
  9090: "Prometheus/Cockpit",
  9100: "JetDirect/AppPort",
  9200: "Elasticsearch",
  20000: "DNP3",
  47808: "BACnet",
};

// ─── Parser: asset_discovery ─────────────────────────────────────────────────

export function parseAssetDiscovery(text: string): Map<string, string> {
  const result = new Map<string, string>();
  let pastSeparator = false;

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("---")) {
      pastSeparator = true;
      continue;
    }
    if (!pastSeparator || !trimmed) continue;

    // Format: 192.168.100.1 [48:3A:02:62:12:A4]
    const match = /^([\d.]+)\s+\[([0-9A-Fa-f:]+)\]/.exec(trimmed);
    if (match) {
      result.set(match[1], match[2].toUpperCase());
    }
  }

  return result;
}

// ─── Parser: port_discovery ──────────────────────────────────────────────────

export function parsePortDiscovery(text: string): Map<string, { port: number; service: string }[]> {
  const result = new Map<string, { port: number; service: string }[]>();
  let pastSeparator = false;
  let currentIp = "";

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("---")) {
      pastSeparator = true;
      continue;
    }
    if (!pastSeparator || !trimmed) continue;

    // IP line: "192.168.100.1:"
    const ipMatch = /^([\d.]+):$/.exec(trimmed);
    if (ipMatch) {
      currentIp = ipMatch[1];
      if (!result.has(currentIp)) result.set(currentIp, []);
      continue;
    }

    // Port line: "  22/ssh"
    const portMatch = /^(\d+)\/(.+)$/.exec(trimmed);
    if (portMatch && currentIp) {
      result.get(currentIp)!.push({
        port: parseInt(portMatch[1], 10),
        service: portMatch[2],
      });
    }
  }

  return result;
}

// ─── Parser: port_scan ───────────────────────────────────────────────────────

export function parsePortScan(text: string): Map<string, PortScanHost> {
  const result = new Map<string, PortScanHost>();
  let currentIp = "";
  let currentHost: PortScanHost | null = null;
  let currentPort: ScpPort | null = null;

  for (const rawLine of text.split("\n")) {
    const trimmed = rawLine.trim();

    // Host line
    const hostMatch = /^Host:\s*([\d.]+)/.exec(trimmed);
    if (hostMatch) {
      // Save previous host
      if (currentIp && currentHost) {
        if (currentPort) currentHost.ports.push(currentPort);
        result.set(currentIp, currentHost);
      }
      currentIp = hostMatch[1];
      currentHost = { os: null, ports: [] };
      currentPort = null;
      continue;
    }

    if (!currentHost) continue;

    // Vendor line: "Vendor: Synology" (SC-P v2)
    const vendorMatch = /^Vendor:\s*(.+)/.exec(trimmed);
    if (vendorMatch) {
      currentHost.vendor = vendorMatch[1].trim();
      continue;
    }

    // Type line: "Type: SERVER" (SC-P v2)
    const typeMatch = /^Type:\s*(.+)/.exec(trimmed);
    if (typeMatch) {
      currentHost.deviceType = typeMatch[1].trim();
      continue;
    }

    // OS line: "OS: Ubuntu (95% confidence)"
    const osMatch = /^OS:\s*(.+?)\s*\((\d+)%\s*confidence\)/.exec(trimmed);
    if (osMatch) {
      currentHost.os = {
        name: osMatch[1],
        confidence: parseInt(osMatch[2], 10),
        method: "",
      };
      continue;
    }

    // Method line: "  - Method: Banner"
    const methodMatch = /^-\s*Method:\s*(.+)/.exec(trimmed);
    if (methodMatch && currentHost.os) {
      currentHost.os.method = methodMatch[1];
      continue;
    }

    // Skip "Open ports:" line
    if (/^Open ports:/.test(trimmed)) continue;

    // Port line: "  22/ssh - OpenSSH_9.6p1 Ubuntu-3ubuntu13.13"
    // or:        "  80/http"
    const portMatch = /^(\d+)\/([\w-]+)(?:\s+-\s+(.+))?$/.exec(trimmed);
    if (portMatch) {
      // Save previous port
      if (currentPort) currentHost.ports.push(currentPort);

      const productStr = portMatch[3] || null;
      let product: string | null = null;
      let version: string | null = null;

      if (productStr) {
        // Extract product and version: "OpenSSH_9.6p1 Ubuntu-3ubuntu13.13" → product="OpenSSH", version="9.6p1"
        const pvMatch = /^(\S+?)(?:[_ ](\S+))?(?:\s+.+)?$/.exec(productStr);
        if (pvMatch) {
          product = pvMatch[1].replace(/_/g, " ");
          version = pvMatch[2]?.replace(/_/g, " ") || null;
        }
      }

      currentPort = {
        port: parseInt(portMatch[1], 10),
        service: portMatch[2],
        product,
        version,
        banner: null,
      };
      continue;
    }

    // Banner line: "    Banner: SSH-2.0-OpenSSH_9.6p1 ..."
    const bannerMatch = /^Banner:\s*(.+)/.exec(trimmed);
    if (bannerMatch && currentPort) {
      currentPort.banner = bannerMatch[1];
      continue;
    }
  }

  // Save last host
  if (currentIp && currentHost) {
    if (currentPort) currentHost.ports.push(currentPort);
    result.set(currentIp, currentHost);
  }

  return result;
}

// ─── Auto-classification (improved with MAC OUI + port heuristics) ──────────

function classifyHost(
  ip: string,
  mac: string,
  ports: ScpPort[],
  os: PortScanHost["os"],
): { hwType: string; hwName: string } {
  const portNums = new Set(ports.map((p) => p.port));
  const hasPort = (n: number) => portNums.has(n);
  const bannerText = ports.map((p) => p.banner || "").join(" ").toLowerCase();
  const osName = os?.name || "";
  const osLower = osName.toLowerCase();

  // MAC vendor lookup
  const macVendor = lookupMacVendor(mac);
  const macHint = inferTypeFromMacVendor(macVendor);

  // Heavy services that rule out a simple printer
  const hasHeavyServices = hasPort(3306) || hasPort(5432) || hasPort(9200) || hasPort(8080) || hasPort(8443) || hasPort(27017);

  // 1. Fortinet firewall (banner + port)
  if (hasPort(541) && bannerText.includes("fortinet")) {
    return { hwType: "NETWORK_DEVICE", hwName: `Fortinet Firewall (${ip})` };
  }
  // Also via MAC
  if (macVendor?.includes("Fortinet")) {
    return { hwType: "NETWORK_DEVICE", hwName: `Fortinet Device (${ip})` };
  }

  // 2. Synology NAS (MAC OUI + port pattern)
  if (macVendor?.includes("Synology") || (hasPort(5000) && hasPort(5001))) {
    return { hwType: "SERVER", hwName: `Synology NAS (${ip})` };
  }

  // 3. Industrial PLC (MAC vendor)
  if (macHint === "PLC") {
    return { hwType: "PLC", hwName: `${macVendor} PLC (${ip})` };
  }

  // 4. Modbus device (port 502)
  if (hasPort(502)) {
    return { hwType: "PLC", hwName: `Modbus Device (${ip})` };
  }

  // 5. Maritime sensor/navigation (MAC vendor)
  if (macHint === "SENSOR") {
    return { hwType: "SENSOR", hwName: `${macVendor} (${ip})` };
  }

  // 6. Network device (MAC vendor-based)
  if (macHint === "NETWORK_DEVICE") {
    return { hwType: "NETWORK_DEVICE", hwName: `${macVendor} (${ip})` };
  }

  // 7. Printer — ONLY if no heavy services present
  if (osLower.includes("printer") && !hasHeavyServices) {
    return { hwType: "OTHER_DEVICE", hwName: `Network Printer (${ip})` };
  }
  if (macHint === "OTHER_DEVICE" && !hasHeavyServices) {
    return { hwType: "OTHER_DEVICE", hwName: `${macVendor} Printer (${ip})` };
  }
  // Port 9100 only — but MUST have few ports and no heavy services
  if (hasPort(9100) && ports.length <= 3 && !hasHeavyServices && !hasPort(80) && !hasPort(443)) {
    return { hwType: "OTHER_DEVICE", hwName: `Network Printer (${ip})` };
  }

  // 8. Windows + RDP → PC
  if (osLower.includes("windows") && hasPort(3389)) {
    return { hwType: "PC", hwName: `Windows PC (${ip})` };
  }

  // 9. Linux/Ubuntu + RDP → PC (remote workstation)
  if ((osLower.includes("ubuntu") || osLower.includes("linux")) && hasPort(3389)) {
    return { hwType: "PC", hwName: `Linux Workstation (${ip})` };
  }

  // 10. Ubuntu/Linux → Server
  if (osLower.includes("ubuntu")) {
    return { hwType: "SERVER", hwName: `Ubuntu Server (${ip})` };
  }
  if (osLower.includes("linux")) {
    return { hwType: "SERVER", hwName: `Linux Server (${ip})` };
  }

  // 11. Windows → Server
  if (osLower.includes("windows")) {
    return { hwType: "SERVER", hwName: `Windows Server (${ip})` };
  }

  // 12. SMB pattern (NAS) — but check MAC first
  if (hasPort(139) && hasPort(445)) {
    // If MAC is Synology, it's already caught above
    return { hwType: "SERVER", hwName: `NAS/File Server (${ip})` };
  }

  // 13. VM detection from MAC
  if (macVendor?.includes("QEMU") || macVendor?.includes("VMware") || macVendor?.includes("VirtualBox") || macVendor?.includes("Hyper-V")) {
    return { hwType: "SERVER", hwName: `Virtual Machine (${ip})` };
  }

  // 14. Gateway (.1)
  if (ip.endsWith(".1")) {
    return { hwType: "NETWORK_DEVICE", hwName: `Gateway (${ip})` };
  }

  // 15. Default
  return { hwType: "SERVER", hwName: `Host (${ip})` };
}

// ─── Software extraction ─────────────────────────────────────────────────────

function extractSoftware(ports: ScpPort[], os: PortScanHost["os"]): ScpSoftware[] {
  const software: ScpSoftware[] = [];
  const seen = new Set<string>();

  // OS entry
  if (os?.name) {
    const osBase = os.name.split(" ")[0]; // "Ubuntu", "Windows", "Network"
    // Try to extract detailed version from SSH banner
    let osVersion: string | null = null;
    for (const p of ports) {
      if (p.banner && p.service === "ssh") {
        const ubuntuMatch = /Ubuntu[- ]?(\S+)/i.exec(p.banner);
        if (ubuntuMatch) {
          osVersion = ubuntuMatch[1];
          break;
        }
      }
    }
    const key = `os:${osBase}`;
    if (!seen.has(key)) {
      seen.add(key);
      software.push({
        name: osBase,
        version: osVersion,
        vendor: osBase === "Ubuntu" ? "Canonical" : osBase === "Windows" ? "Microsoft" : null,
        swType: "OS",
        listeningPort: null,
      });
    }
  }

  // Banner-detected software
  for (const p of ports) {
    if (!p.banner) continue;

    for (const sig of BANNER_PATTERNS) {
      const m = sig.pattern.exec(p.banner);
      if (m) {
        const ver = sig.extractVersion ? sig.extractVersion(m) : p.version;
        const key = `${sig.name}:${p.port}`;
        if (!seen.has(key)) {
          seen.add(key);
          software.push({
            name: sig.name,
            version: ver,
            vendor: sig.vendor,
            swType: sig.swType,
            listeningPort: String(p.port),
          });
        }
        break;
      }
    }
  }

  // Service-name-detected software
  for (const p of ports) {
    const svcInfo = SERVICE_SOFTWARE[p.service];
    if (svcInfo) {
      const key = `svc:${svcInfo.name}:${p.port}`;
      if (!seen.has(key)) {
        seen.add(key);
        software.push({
          name: svcInfo.name,
          version: p.version,
          vendor: svcInfo.vendor,
          swType: svcInfo.swType,
          listeningPort: String(p.port),
        });
      }
    }
  }

  return software;
}

// ─── Enrich unknown services with known port names ──────────────────────────

function enrichUnknownServices(ports: ScpPort[]): ScpPort[] {
  return ports.map((p) => {
    if (p.service === "unknown" && KNOWN_PORTS[p.port]) {
      return { ...p, service: KNOWN_PORTS[p.port] };
    }
    return p;
  });
}

// ─── Merge & Classify ────────────────────────────────────────────────────────

export function mergeAndClassify(
  assetText: string,
  portDiscText: string,
  portScanText: string,
): ScpScanResult {
  const assetMap = parseAssetDiscovery(assetText);
  const portDiscMap = parsePortDiscovery(portDiscText);
  const portScanMap = parsePortScan(portScanText);

  // Collect all known IPs
  const allIps = new Set([...assetMap.keys(), ...portDiscMap.keys(), ...portScanMap.keys()]);

  // Infer subnet from first IP
  const firstIp = [...allIps][0] || "0.0.0.0";
  const subnet = firstIp.replace(/\.\d+$/, ".0/24");

  // Extract scan date from filename convention (YYYYMMDD_HHMMSS) — fallback to now
  const scanDate = new Date().toISOString();

  const hosts: ScpHost[] = [];

  for (const ip of [...allIps].sort((a, b) => {
    const aParts = a.split(".").map(Number);
    const bParts = b.split(".").map(Number);
    for (let i = 0; i < 4; i++) {
      if (aParts[i] !== bParts[i]) return aParts[i] - bParts[i];
    }
    return 0;
  })) {
    const mac = assetMap.get(ip) || "00:00:00:00:00:00";
    const scanHost = portScanMap.get(ip);
    const discPorts = portDiscMap.get(ip) || [];

    // Build port list: prefer port_scan (richer), supplement from port_discovery
    let ports: ScpPort[];
    if (scanHost) {
      ports = scanHost.ports;
      // Add ports from discovery that aren't in scan
      const scanPortNums = new Set(scanHost.ports.map((p) => p.port));
      for (const dp of discPorts) {
        if (!scanPortNums.has(dp.port)) {
          ports.push({
            port: dp.port,
            service: dp.service,
            product: null,
            version: null,
            banner: null,
          });
        }
      }
    } else {
      ports = discPorts.map((dp) => ({
        port: dp.port,
        service: dp.service,
        product: null,
        version: null,
        banner: null,
      }));
    }

    // Enrich unknown services with known port names
    ports = enrichUnknownServices(ports);

    const os = scanHost?.os || null;
    // SC-P v2: vendor/deviceType from scanner, fallback to MAC OUI
    const macVendor = scanHost?.vendor || lookupMacVendor(mac);
    const { hwType, hwName } = scanHost?.deviceType
      ? { hwType: scanHost.deviceType, hwName: `${scanHost.vendor || ""} (${ip})`.trim() }
      : classifyHost(ip, mac, ports, os);
    const software = extractSoftware(ports, os);

    hosts.push({
      ip,
      mac,
      macVendor: macVendor || undefined,
      ports,
      os,
      hwType,
      hwName,
      software,
    });
  }

  return {
    meta: {
      scanDate,
      hostCount: hosts.length,
      subnet,
      scanner: "scp",
    },
    hosts,
  };
}
