// ─── MAC OUI Vendor Lookup ──────────────────────────────────────────────────
// Maps the first 3 bytes of a MAC address to a device vendor.
// Covers common vendors found in ship/industrial/IT networks.
// Format: "XX:XX:XX" (uppercase) → vendor name

const MAC_OUI_TABLE: Record<string, string> = {
  // ── Firewalls / Security ──
  "48:3A:02": "Fortinet",
  "00:09:0F": "Fortinet",
  "70:4C:A5": "Fortinet",
  "08:5B:0E": "Fortinet",

  // ── NAS / Storage ──
  "90:09:D0": "Synology",
  "00:11:32": "Synology",
  "00:15:17": "QNAP",

  // ── Virtualization ──
  "52:54:00": "QEMU/KVM",
  "00:0C:29": "VMware",
  "00:50:56": "VMware",
  "00:15:5D": "Hyper-V",
  "08:00:27": "VirtualBox",

  // ── Industrial / PLC ──
  "00:80:F4": "Schneider Electric",
  "00:01:05": "Beckhoff",
  "00:0E:8C": "Siemens",
  "00:1C:06": "Siemens",
  "00:30:11": "HMS Industrial",
  "00:C0:C6": "ABB",
  "00:1D:9C": "Rockwell Automation",
  "00:00:BC": "Allen-Bradley",
  "00:60:35": "Dallas Semiconductor",
  "00:A0:45": "Phoenix Contact",

  // ── Maritime / Navigation ──
  "00:20:CB": "Furuno Electric",
  "00:40:58": "Kongsberg Maritime",
  "00:07:7C": "Westermo",
  "00:0A:DC": "RuggedCom",
  "00:80:82": "JRC (Japan Radio Co.)",
  "00:0D:8D": "Toshiba",
  "00:E0:4B": "Raytheon",

  // ── Networking Equipment ──
  "00:06:C4": "Piolink",
  "30:56:0F": "Juniper",
  "88:75:56": "Cisco",
  "00:1B:17": "Cisco",
  "00:26:CB": "Cisco",
  "FC:99:47": "Cisco",
  "64:F6:9D": "Cisco",
  "D8:C4:97": "D-Link",
  "00:1C:7E": "Moxa",
  "00:90:E8": "Moxa",
  "00:1E:68": "Quanta",
  "00:23:89": "MikroTik",
  "74:4D:28": "MikroTik",
  "E4:8D:8C": "MikroTik",
  "48:8F:5A": "Aruba",
  "00:0B:86": "Aruba",
  "AC:A3:1E": "Aruba",
  "EC:F4:BB": "Dell Networking",
  "00:24:38": "Brocade",
  "00:05:33": "Brocade",
  "CC:4E:24": "Brocade",

  // ── Servers / Workstations ──
  "10:7C:61": "HP",
  "EC:2A:72": "Dell",
  "00:25:B5": "Dell",
  "F8:BC:12": "Dell",
  "D4:BE:D9": "Dell",
  "F4:8E:38": "Dell",
  "D0:94:66": "Dell",
  "2C:44:FD": "HP",
  "3C:D9:2B": "HP",
  "FC:15:B4": "HP Enterprise",
  "B4:B5:2F": "HP Enterprise",
  "94:57:A5": "HP Enterprise",
  "38:63:BB": "HP Enterprise",
  "F0:92:1C": "Lenovo",
  "70:5A:0F": "Lenovo",
  "5C:F3:FC": "Lenovo",
  "40:F2:E9": "Lenovo",
  "00:25:90": "Supermicro",
  "AC:1F:6B": "Supermicro",
  "0C:C4:7A": "Supermicro",

  // ── IoT / Embedded ──
  "B8:27:EB": "Raspberry Pi",
  "DC:A6:32": "Raspberry Pi",
  "E4:5F:01": "Raspberry Pi",
  "28:CD:C1": "Raspberry Pi",
  "00:1A:07": "Advantech",
  "00:D0:C9": "Advantech",

  // ── Printers ──
  "00:00:48": "Seiko Epson",
  "00:1B:A9": "Brother",
  "30:CD:A7": "Samsung",
  "AC:18:26": "HP Printer",
  "3C:2A:F4": "Brother",
  "00:00:74": "Ricoh",
  "00:26:73": "Ricoh",
  "00:1E:8F": "Canon",
  "18:0C:AC": "Canon",

  // ── Cameras / Surveillance ──
  "00:80:F0": "Panasonic",
  "00:1F:C6": "Axis Communications",
  "AC:CC:8E": "Axis Communications",
  "00:40:8C": "Hikvision",
  "C0:56:E3": "Hanwha Vision",
  "70:B3:D5": "Dahua",

  // ── Consumer / General ──
  "00:1A:2B": "Ayecom",
  "00:1E:58": "D-Link",
  "F0:9F:C2": "Ubiquiti",
  "24:5A:4C": "Ubiquiti",
  "78:8A:20": "Ubiquiti",
  "04:18:D6": "Ubiquiti",
};

/**
 * Look up vendor name from MAC address.
 * Returns vendor string or null if not found.
 */
export function lookupMacVendor(mac: string): string | null {
  if (!mac || mac === "00:00:00:00:00:00") return null;

  // Normalize: uppercase, colon-separated
  const normalized = mac
    .toUpperCase()
    .replace(/[-.]/g, ":")
    .replace(/(.{2})(?!$)/g, "$1:")
    .substring(0, 8); // First 3 octets: "XX:XX:XX"

  // Try exact prefix match
  const prefix = normalized.substring(0, 8);
  return MAC_OUI_TABLE[prefix] || null;
}

/**
 * Infer device type hint from MAC vendor.
 * Returns a suggested hwType or null.
 */
export function inferTypeFromMacVendor(vendor: string | null): string | null {
  if (!vendor) return null;
  const v = vendor.toLowerCase();

  // Firewalls / Networking
  if (v.includes("fortinet")) return "NETWORK_DEVICE";
  if (v.includes("cisco") || v.includes("juniper") || v.includes("aruba") || v.includes("mikrotik") || v.includes("brocade") || v.includes("dell networking")) return "NETWORK_DEVICE";
  if (v.includes("moxa") || v.includes("westermo") || v.includes("ruggedcom") || v.includes("piolink")) return "NETWORK_DEVICE";

  // NAS
  if (v.includes("synology") || v.includes("qnap")) return "SERVER";

  // PLC / Industrial
  if (v.includes("schneider") || v.includes("siemens") || v.includes("beckhoff") || v.includes("rockwell") || v.includes("allen-bradley") || v.includes("abb") || v.includes("phoenix contact") || v.includes("hms industrial")) return "PLC";

  // Maritime / Navigation
  if (v.includes("furuno") || v.includes("kongsberg") || v.includes("jrc") || v.includes("raytheon")) return "SENSOR";

  // Printers
  if (v.includes("epson") || v.includes("brother") || v.includes("canon") || v.includes("ricoh") || v.includes("hp printer")) return "OTHER_DEVICE";

  // Cameras
  if (v.includes("axis") || v.includes("hikvision") || v.includes("hanwha") || v.includes("dahua")) return "SENSOR";

  return null;
}
