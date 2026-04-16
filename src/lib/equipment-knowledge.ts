/**
 * Maritime equipment domain knowledge base
 * Static suggestions for E27 compliance fields
 * Based on IACS UR E27 / IMO maritime equipment standards
 */

// ── Manufacturer recommendations by equipment type ──
export const MANUFACTURERS: Record<string, string[]> = {
  ECDIS: ["Furuno", "JRC", "Kongsberg", "Transas", "Raytheon"],
  AIS: ["Furuno", "JRC", "Trimble", "SRT Marine", "Kongsberg"],
  GPS: ["Furuno", "Garmin", "Trimble", "u-blox", "Septentrio"],
  RADAR: ["Furuno", "JRC", "Kongsberg", "Raytheon", "Kelvin Hughes"],
  VDR: ["Furuno", "JRC", "Kongsberg", "Jotron", "L3 Technologies"],
  Autopilot: ["Kongsberg", "Simrad", "Raytheon", "JRC", "Furuno"],
  "VHF Radio": ["Icom", "Furuno", "JRC", "Cobra", "Standard Horizon"],
  PLC: ["Siemens", "ABB", "Schneider Electric", "Rockwell", "Mitsubishi"],
  DCS: ["Yokogawa", "ABB", "Emerson", "Honeywell", "Siemens"],
  HMI: ["Siemens", "Schneider Electric", "Advantech", "Beckhoff"],
  SCADA: ["Siemens", "Wonderware", "iFIX", "Yokogawa", "ABB"],
  "Engine Monitor": ["Wärtsilä", "MAN", "ABB", "Kongsberg", "Siemens"],
  Firewall: ["Fortinet", "Palo Alto", "Cisco", "Check Point", "Juniper"],
  "Network Switch": ["Cisco", "Moxa", "Hirschmann", "Netgear", "HP ProCurve"],
  Router: ["Cisco", "Moxa", "Juniper", "Cradlepoint", "Digi"],
  "IDS/IPS": ["Claroty", "Nozomi Networks", "Dragos", "Cisco", "Palo Alto"],
  VSAT: ["Inmarsat", "ViaSat", "Cobham", "KVH", "Intellian"],
  SATCOM: ["Inmarsat", "Iridium", "ViaSat", "Cobham", "KVH"],
  Server: ["Dell", "HP", "Advantech", "Kontron", "Cisco"],
  Workstation: ["Advantech", "Dell", "HP", "Panasonic Toughbook", "Kontron"],
  CCTV: ["Axis", "Hikvision", "Dahua", "Bosch", "Sony"],
  "Gyro Compass": ["Tokimec", "Sperry Marine", "Raytheon", "Yokogawa"],
  "Speed Log": ["JRC", "Consilium", "Furuno", "Sperry Marine"],
  "Echo Sounder": ["Furuno", "Simrad", "Kongsberg", "JRC"],
  "Alarm System": ["Kongsberg", "Praxis", "ABB", "Wärtsilä"],
  UPS: ["APC", "Eaton", "Schneider Electric", "Vertiv"],
};

// ── HW type → manufacturer mapping by our HW types ──
export const MANUFACTURERS_BY_HW_TYPE: Record<string, string[]> = {
  PLC: ["Siemens", "ABB", "Schneider Electric", "Rockwell", "Mitsubishi", "Yokogawa"],
  SERVER: ["Dell", "HP", "Advantech", "Kontron", "Cisco", "Supermicro"],
  SENSOR: ["Furuno", "JRC", "Garmin", "Trimble", "Kongsberg", "Yokogawa"],
  NETWORK_DEVICE: ["Cisco", "Moxa", "Hirschmann", "Fortinet", "Juniper", "HP"],
  PC: ["Advantech", "Dell", "HP", "Panasonic Toughbook", "Kontron", "Lenovo"],
  OTHER_DEVICE: ["Furuno", "Kongsberg", "Siemens", "ABB", "Cobham"],
};

// ── Model recommendations by manufacturer ──
export const MODELS: Record<string, string[]> = {
  Furuno: ["FAR-2228", "GP-32", "FA-170", "VR-3000S", "FMD-3300", "NX-300", "GP-170"],
  JRC: ["JAN-9201", "JMA-5300", "JLR-4341", "FAX-440", "JHS-183"],
  Kongsberg: ["K-Bridge ECDIS", "cPos G2", "K-Chief 600", "SDP-21", "K-Sim"],
  Siemens: ["S7-300", "S7-1500", "S7-1200", "SIMATIC WinCC", "SCALANCE X308", "SIMATIC ET 200SP"],
  ABB: ["AC500", "Freelance 800F", "System 800xA", "MicroSCADA", "AC800M"],
  Cisco: ["Catalyst 2960-X", "IE-3400", "ASA 5506-X", "ISR 891F", "IE-4000"],
  Moxa: ["EDS-408A", "EDS-405A", "PT-7528", "NPort 5150A", "EDS-G508E"],
  Fortinet: ["FortiGate 60F", "FortiGate 100F", "FortiSwitch 108F", "FortiGate 40F"],
  Yokogawa: ["CENTUM VP", "STARDOM", "ProSafe-RS", "DX2000", "FA-M3"],
  Inmarsat: ["Fleet One", "Fleet Xpress", "IsatPhone Pro", "FleetBroadband"],
  Cobham: ["SAILOR 900 VSAT", "SAILOR 3027", "SAILOR 6300", "SAILOR 6000"],
  KVH: ["TracVision RV1", "V7-IP", "TracPhone V7-HTS", "V11-HTS"],
  Dell: ["PowerEdge R640", "PowerEdge T440", "OptiPlex 7090", "Latitude 5520"],
  HP: ["ProLiant DL380", "ProLiant ML350", "EliteDesk 800", "ZBook 15"],
  Schneider: ["Modicon M340", "Modicon M580", "Magelis HMI", "Preventa"],
  Rockwell: ["CompactLogix 5380", "ControlLogix 5580", "PanelView Plus 7"],
  Mitsubishi: ["MELSEC iQ-R", "MELSEC iQ-F", "GOT2000"],
  Hirschmann: ["RS20", "RSR20", "EAGLE20", "MACH100"],
  Advantech: ["UNO-2484G", "EKI-5528", "TPC-1551T", "ADAM-6050"],
};

// ── Physical location by equipment type ──
export const LOCATIONS: Record<string, string[]> = {
  ECDIS: ["Navigation Bridge", "Chart Room", "Wheelhouse"],
  AIS: ["Navigation Bridge", "Bridge Wing", "Chart Room"],
  GPS: ["Antenna Mast", "Bridge Roof", "Navigation Bridge"],
  RADAR: ["Radar Mast", "Antenna Deck", "Bridge Wing"],
  VDR: ["Navigation Bridge", "Bridge Equipment Rack", "Antenna Deck"],
  PLC: ["Engine Control Room (ECR)", "Machinery Space", "Engine Room"],
  DCS: ["Engine Control Room (ECR)", "Cargo Control Room", "Pump Room"],
  HMI: ["Engine Control Room (ECR)", "Bridge", "Cargo Control Room"],
  Firewall: ["Server Room", "Network Room", "Bridge Rack"],
  "Network Switch": ["Server Room", "Bridge Rack", "Engine Control Room (ECR)"],
  Server: ["Server Room", "IT Room", "Bridge Equipment Rack"],
  Workstation: ["Navigation Bridge", "Engine Control Room (ECR)", "Bridge"],
  CCTV: ["Deck", "Engine Room", "Bridge Wing", "Accommodation"],
  VSAT: ["Antenna Mast", "Topside Dome", "Radar Mast"],
  SATCOM: ["Antenna Mast", "Topside", "Satellite Dome"],
};

export const LOCATIONS_BY_HW_TYPE: Record<string, string[]> = {
  PLC: ["Engine Control Room (ECR)", "Machinery Space", "Pump Room", "Cargo Control Room", "Engine Room"],
  SERVER: ["Server Room", "Navigation Bridge", "Bridge Equipment Rack", "IT Room", "Chart Room"],
  SENSOR: ["Antenna Mast", "Bridge Wing", "Navigation Bridge", "Hull", "Bridge Roof"],
  NETWORK_DEVICE: ["Server Room", "Network Room", "Bridge Rack", "Engine Control Room (ECR)"],
  PC: ["Navigation Bridge", "Engine Control Room (ECR)", "Chart Room", "Bridge", "Office"],
  OTHER_DEVICE: ["Navigation Bridge", "Engine Room", "Antenna Mast", "Deck"],
};

// ── Communication protocols by equipment type ──
export const PROTOCOLS: Record<string, string[]> = {
  ECDIS: ["NMEA 0183", "NMEA 2000", "TCP/IP", "RS-422"],
  AIS: ["NMEA 0183", "NMEA 2000", "TCP/IP", "RS-422"],
  GPS: ["NMEA 0183", "NMEA 2000", "RS-232", "RS-422"],
  RADAR: ["NMEA 0183", "Ethernet", "RS-422", "ARPA Data"],
  PLC: ["Modbus RTU", "PROFIBUS DP", "RS-485", "Modbus TCP", "EtherNet/IP"],
  DCS: ["PROFIBUS DP", "Modbus TCP", "EtherNet/IP", "OPC-UA"],
  Firewall: ["TCP/IP", "HTTPS", "SSH", "SNMP", "Syslog"],
  "Network Switch": ["Ethernet", "TCP/IP", "SNMP", "SSH", "STP"],
  VSAT: ["TCP/IP", "HTTP/HTTPS", "Ethernet", "SMTP"],
};

export const PROTOCOLS_BY_HW_TYPE: Record<string, string[]> = {
  PLC: ["Modbus RTU", "PROFIBUS DP", "RS-485", "Modbus TCP", "EtherNet/IP", "OPC-UA"],
  SERVER: ["TCP/IP", "Ethernet", "NMEA 0183", "Modbus TCP", "HTTPS", "SSH"],
  SENSOR: ["NMEA 0183", "NMEA 2000", "RS-422", "RS-232", "TCP/IP"],
  NETWORK_DEVICE: ["TCP/IP", "Ethernet", "SNMP", "SSH", "HTTPS", "STP"],
  PC: ["TCP/IP", "Ethernet", "WiFi", "USB", "HTTPS"],
  OTHER_DEVICE: ["TCP/IP", "Ethernet", "RS-232", "RS-485", "NMEA 0183"],
};

// ── Physical interface by HW type ──
export const INTERFACES_BY_HW_TYPE: Record<string, string[]> = {
  PLC: ["RS-485", "PROFIBUS DP", "Ethernet RJ-45", "CAN Bus", "Modbus RTU"],
  SERVER: ["Ethernet RJ-45", "Fiber SFP", "USB 3.0", "HDMI", "Serial RS-232"],
  SENSOR: ["NMEA 0183", "RS-422", "RS-232", "Ethernet RJ-45", "NMEA 2000"],
  NETWORK_DEVICE: ["Ethernet RJ-45 (x8)", "Fiber SFP", "USB Console", "Serial Management"],
  PC: ["Ethernet RJ-45", "USB 3.0", "HDMI", "Serial RS-232", "Wi-Fi"],
  OTHER_DEVICE: ["Ethernet RJ-45", "USB", "Serial RS-232", "Coaxial RF"],
};

// ── Logical location (network segment) by HW type ──
export const LOGICAL_LOCATIONS: Record<string, string[]> = {
  PLC: ["OT/Machinery Network (VLAN 20)", "Control Network", "Fieldbus", "PROFIBUS Segment"],
  SERVER: ["Navigation Network (VLAN 10)", "Bridge Network", "Server VLAN", "DMZ"],
  SENSOR: ["Navigation Network (VLAN 10)", "Sensor Bus", "NMEA 0183 Bus", "NMEA 2000 Backbone"],
  NETWORK_DEVICE: ["Network Core", "DMZ", "Perimeter", "VLAN Trunk", "Management VLAN"],
  PC: ["Navigation Network (VLAN 10)", "Admin Network (VLAN 30)", "Bridge LAN"],
  OTHER_DEVICE: ["External/WAN", "Internet", "DMZ", "Satellite Link"],
};

// ── Purpose by equipment name/type ──
export const PURPOSES: Record<string, string[]> = {
  ECDIS: ["Electronic chart display and route monitoring", "Voyage planning and navigation"],
  AIS: ["Vessel identification and traffic awareness", "Collision avoidance data exchange"],
  GPS: ["Position fixing and navigation data input", "Time synchronization"],
  RADAR: ["Collision avoidance and target tracking", "Navigation in restricted visibility"],
  VDR: ["Voyage data recording for incident investigation", "SOLAS Reg. V/20 compliance"],
  PLC: ["Engine automation and process control", "Machinery monitoring and alarm management"],
  DCS: ["Distributed control of cargo/ballast systems", "Engine room automation"],
  Firewall: ["Network security boundary between OT and IT", "Traffic filtering per cyber policy"],
  "Network Switch": ["LAN interconnection for bridge equipment", "VLAN segmentation"],
  VSAT: ["Broadband internet for crew and operations", "Shore-based remote monitoring"],
  CCTV: ["Vessel security surveillance", "Deck and engine room monitoring"],
};

export const PURPOSES_BY_HW_TYPE: Record<string, string[]> = {
  PLC: ["Engine automation and process control", "Machinery monitoring and alarm management", "Ballast/cargo system control"],
  SERVER: ["System management and data storage", "Navigation data processing", "Application hosting"],
  SENSOR: ["Navigation data acquisition", "Environmental monitoring", "Position and heading data"],
  NETWORK_DEVICE: ["Network traffic routing and switching", "Security boundary enforcement", "VLAN segmentation"],
  PC: ["Operator interface and monitoring", "System administration", "Data visualization"],
  OTHER_DEVICE: ["Communication and data exchange", "Safety system function", "Remote monitoring"],
};

// ── E27 Security Category by HW type ──
export const CATEGORIES_BY_HW_TYPE: Record<string, string[]> = {
  PLC: ["Cat I", "Cat II"],
  SERVER: ["Cat II", "Cat I"],
  SENSOR: ["Cat II", "Cat III"],
  NETWORK_DEVICE: ["Cat I", "Cat II"],
  PC: ["Cat III", "Cat II"],
  OTHER_DEVICE: ["Cat II", "Cat III", "Cat I"],
};

// ── Protection method ──
export const PROTECTION_METHODS = [
  "Firewall", "VPN", "ACL", "IDS/IPS", "Network Segmentation",
  "Port Security", "802.1X", "Air Gap", "Data Diode", "Encryption",
];

// ── System software categories ──
export const SYS_SOFTWARE_CATEGORIES = [
  "Windows 10", "Windows 10 IoT Enterprise", "Windows 11",
  "Windows Server 2019", "Windows Server 2022",
  "Ubuntu 22.04 LTS", "Red Hat Enterprise Linux 8", "CentOS 7",
  "Embedded Linux", "VxWorks 7", "QNX 7.1", "RTOS",
  "Firmware", "Proprietary OS",
];

// ── SW knowledge ──
export const SW_NAMES: Record<string, string[]> = {
  ecdis: ["Transas ECDIS 4000", "Furuno NavNet ECDIS", "JRC JAN Navigation", "Kongsberg K-Bridge ECDIS"],
  vdr: ["Furuno VDR Manager", "Jotron VDR Software", "Kongsberg VDR Application"],
  plc: ["Siemens TIA Portal", "RSLogix 5000", "CODESYS V3", "GX Works 3"],
  dcs: ["Yokogawa CENTUM VP", "ABB 800xA", "Emerson DeltaV", "Honeywell Experion"],
  hmi: ["SIMATIC WinCC", "Schneider EcoStruxure", "iFIX SCADA HMI"],
  firewall: ["FortiOS", "Palo Alto PAN-OS", "Cisco ASA Software", "Check Point Gaia OS"],
  switch: ["Cisco IOS", "Moxa MXview", "Hirschmann HiOS", "HP ProCurve OS"],
  server: ["Windows Server 2019", "Windows Server 2022", "Ubuntu Server 22.04", "RHEL 8"],
  radar: ["Furuno Radar Software", "JRC Radar Application", "Kongsberg Radar Suite"],
};

export const SW_VENDORS_BY_TYPE: Record<string, string[]> = {
  OS: ["Microsoft", "Canonical", "Red Hat", "Wind River", "QNX", "BlackBerry"],
  APPLICATION: ["Furuno", "Kongsberg", "Siemens", "ABB", "Yokogawa", "JRC"],
  FIRMWARE: ["Device OEM", "Siemens", "ABB", "Furuno", "Schneider Electric"],
  DRIVER: ["Microsoft", "Intel", "Realtek", "Broadcom"],
  LIBRARY: ["OpenSSL", "Apache", "Oracle", "Microsoft"],
  MIDDLEWARE: ["Microsoft", "Oracle", "IBM", "Red Hat"],
};

export const SW_VERSIONS_BY_TYPE: Record<string, string[]> = {
  OS: ["Windows 10 (Build 19044)", "Windows Server 2019", "Ubuntu 22.04.3 LTS", "RHEL 8.8", "VxWorks 7.0"],
  APPLICATION: ["v1.0.0", "v2.3.1", "v3.0 (latest)", "2024 Release"],
  FIRMWARE: ["v1.0.0", "v2.1.3", "v3.5.2", "Factory Default"],
  DRIVER: ["v1.0", "Latest", "Windows Update"],
  LIBRARY: ["v1.0", "v2.0", "Latest stable"],
  MIDDLEWARE: ["v1.0", "v2.0", "Latest"],
};

export const LISTENING_PORTS_BY_TYPE: Record<string, string[]> = {
  OS: ["22 (SSH)", "443 (HTTPS)", "3389 (RDP)", "161 (SNMP)"],
  APPLICATION: ["80 (HTTP)", "443 (HTTPS)", "502 (Modbus)", "4001 (NMEA)", "8080"],
  FIRMWARE: ["502 (Modbus)", "102 (S7comm)", "20000 (DNP3)", "44818 (EtherNet/IP)"],
};

// ── Zone suggestions ──
export const ZONE_SUGGESTIONS = [
  // IEC 62443 Security Levels
  "Lv4 - Enterprise / IT",
  "Lv3.5 - OT-IT DMZ",
  "Lv3 - OT Network Infra.",
  "Lv2 - Area Supervisory Ctrl",
  "Lv1 - Basic Control / Field Device",
  // Maritime system zones
  "Navigation Bridge",
  "Engine Control Room",
  "Cargo Control Room",
  "External Communication",
  "Crew / Office Network",
  "DMZ",
  // Common vessel areas
  "Server Room",
  "Bridge Wing",
  "Machinery Space",
  "Pump Room",
  "Accommodation",
];

/**
 * Infer E27 fields from device name and type.
 * Used during diagram import to auto-fill required fields.
 */
export function inferE27Fields(deviceName: string, hwType: string): {
  manufacturer?: string;
  model?: string;
  purpose?: string;
  physicalInterface?: string;
  commProtocols?: string;
  sysSoftwareCategory?: string;
  location?: string;
} {
  const n = deviceName.toUpperCase();
  const result: Record<string, string> = {};

  // Detect equipment category from name
  const equipMap: Record<string, string[]> = {
    ECDIS: ["ECDIS"], AIS: ["AIS", "TRANSPONDER"], GPS: ["GPS", "GNSS", "DGPS"],
    RADAR: ["RADAR", "S-RADAR", "X-RADAR"], VDR: ["VDR", "VOYAGE DATA"],
    GYRO: ["GYRO", "COMPASS"], AUTOPILOT: ["AUTOPILOT", "AUTO PILOT"],
    VHF: ["VHF", "RADIO TELEPHONE"], SATCOM: ["SATCOM", "SATELLITE COMM"],
    VSAT: ["VSAT"], PLC: ["PLC"], DCS: ["DCS"], HMI: ["HMI"],
    FIREWALL: ["FIREWALL"], SWITCH: ["SWITCH", "HUB", "INTELLIGENCE HUB"],
    ROUTER: ["ROUTER", "GATEWAY"], SERVER: ["SERVER"],
    CCTV: ["CCTV", "CAMERA"], BNWAS: ["BNWAS"], SPEED_LOG: ["SPEED LOG"],
    CONNING: ["CONNING"], VDR2: ["VDR"],
  };

  let detected = "";
  for (const [key, patterns] of Object.entries(equipMap)) {
    if (patterns.some((p) => n.includes(p))) { detected = key; break; }
  }

  // Manufacturer
  const mfrMap: Record<string, string> = {
    ECDIS: "Furuno", RADAR: "Furuno", GPS: "Furuno", VDR: "Furuno",
    GYRO: "Tokimec", BNWAS: "Furuno", SPEED_LOG: "JRC", CONNING: "Furuno",
    AIS: "Furuno", VHF: "Furuno", AUTOPILOT: "Tokimec",
    SATCOM: "Cobham", VSAT: "Intellian",
    PLC: "Siemens", DCS: "Yokogawa", HMI: "Siemens",
    FIREWALL: "Fortinet", SWITCH: "Cisco", ROUTER: "Cisco",
    SERVER: "Dell", CCTV: "Axis",
  };
  if (mfrMap[detected]) result.manufacturer = mfrMap[detected];

  // Purpose
  const purposeMap: Record<string, string> = {
    ECDIS: "Electronic chart display and route monitoring",
    RADAR: "Collision avoidance and target tracking",
    GPS: "Position fixing and navigation data",
    VDR: "Voyage data recording",
    GYRO: "Heading reference for navigation",
    AIS: "Vessel identification and traffic monitoring",
    VHF: "Voice communication",
    BNWAS: "Bridge navigational watch alarm",
    SPEED_LOG: "Speed measurement",
    CONNING: "Navigation data display",
    SATCOM: "Satellite communication",
    VSAT: "Broadband internet via satellite",
    PLC: "Process control and automation",
    DCS: "Distributed control of machinery",
    HMI: "Human-machine interface for operators",
    FIREWALL: "Network security and traffic filtering",
    SWITCH: "Network switching and VLAN segmentation",
    ROUTER: "Network routing and gateway",
    SERVER: "Data processing and application hosting",
    CCTV: "Video surveillance",
  };
  if (purposeMap[detected]) result.purpose = purposeMap[detected];

  // Protocols
  const protoMap: Record<string, string> = {
    ECDIS: "NMEA 0183, TCP/IP, RS-422",
    RADAR: "NMEA 0183, Ethernet, RS-422",
    GPS: "NMEA 0183, RS-232",
    VDR: "NMEA 0183, Ethernet",
    GYRO: "NMEA 0183, RS-422",
    AIS: "NMEA 0183, TCP/IP",
    VHF: "NMEA 0183",
    BNWAS: "NMEA 0183, RS-422",
    SPEED_LOG: "NMEA 0183, RS-422",
    CONNING: "NMEA 0183, Ethernet",
    SATCOM: "TCP/IP, Ethernet",
    VSAT: "TCP/IP, Ethernet",
    PLC: "Modbus RTU, RS-485, Modbus TCP",
    DCS: "PROFIBUS DP, Modbus TCP",
    HMI: "Ethernet, Modbus TCP",
    FIREWALL: "TCP/IP, HTTPS, SSH",
    SWITCH: "Ethernet, TCP/IP, SNMP",
    ROUTER: "TCP/IP, Ethernet",
    SERVER: "TCP/IP, Ethernet, HTTPS",
    CCTV: "TCP/IP, Ethernet",
  };
  if (protoMap[detected]) result.commProtocols = protoMap[detected];

  // Physical interface
  const ifaceMap: Record<string, string> = {
    ECDIS: "Ethernet RJ-45, RS-422", RADAR: "Ethernet RJ-45, RS-422",
    GPS: "RS-232, RS-422", GYRO: "RS-422", VDR: "Ethernet RJ-45, RS-422",
    AIS: "RS-422, Ethernet RJ-45", VHF: "RS-422",
    BNWAS: "RS-422", SPEED_LOG: "RS-422", CONNING: "Ethernet RJ-45",
    SATCOM: "Ethernet RJ-45, Coaxial", VSAT: "Ethernet RJ-45, Coaxial",
    PLC: "RS-485, Ethernet RJ-45", DCS: "PROFIBUS DP, Ethernet RJ-45",
    FIREWALL: "Ethernet RJ-45 (x4)", SWITCH: "Ethernet RJ-45 (x8+)",
    ROUTER: "Ethernet RJ-45", SERVER: "Ethernet RJ-45, USB",
    CCTV: "Ethernet RJ-45",
  };
  if (ifaceMap[detected]) result.physicalInterface = ifaceMap[detected];

  // System software
  const swMap: Record<string, string> = {
    ECDIS: "Proprietary OS", RADAR: "Firmware", GPS: "Firmware",
    VDR: "Embedded Linux", GYRO: "Firmware", AIS: "Firmware",
    BNWAS: "Firmware", SPEED_LOG: "Firmware", CONNING: "Windows 10",
    SATCOM: "Firmware", VSAT: "Firmware",
    PLC: "RTOS", DCS: "RTOS", HMI: "Windows 10",
    FIREWALL: "FortiOS", SWITCH: "Cisco IOS", ROUTER: "Cisco IOS",
    SERVER: "Windows Server 2019", CCTV: "Embedded Linux",
  };
  if (swMap[detected]) result.sysSoftwareCategory = swMap[detected];

  // Location from type
  const locMap: Record<string, string> = {
    PLC: "Engine Control Room (ECR)", SERVER: "Server Room",
    SENSOR: "Antenna Mast", NETWORK_DEVICE: "Network Room",
    PC: "Navigation Bridge", OTHER_DEVICE: "Navigation Bridge",
  };
  if (!result.location && locMap[hwType]) result.location = locMap[hwType];

  return result;
}

// ── Main suggestion function ──
export function getStaticSuggestions(
  fieldKey: string,
  kind: "hw" | "sw",
  context: Record<string, string>
): string[] {
  const hwType = (context.type || "").toUpperCase();
  const hwName = (context.name || "").toLowerCase();
  const manufacturer = context.manufacturer || "";
  const swType = context.swType || "";

  // Detect equipment category from name
  function detectEquipmentFromName(name: string): string | null {
    const nl = name.toLowerCase();
    const map: Record<string, string[]> = {
      ECDIS: ["ecdis"],
      AIS: ["ais", "transponder"],
      GPS: ["gps", "gnss", "position"],
      RADAR: ["radar"],
      VDR: ["vdr", "voyage data"],
      PLC: ["plc", "controller"],
      DCS: ["dcs", "distributed"],
      HMI: ["hmi", "human machine"],
      Firewall: ["firewall", "fortigate", "asa"],
      "Network Switch": ["switch", "catalyst", "eds-"],
      Router: ["router"],
      Server: ["server"],
      VSAT: ["vsat"],
      SATCOM: ["satcom", "satellite"],
      CCTV: ["cctv", "camera"],
    };
    for (const [key, patterns] of Object.entries(map)) {
      if (patterns.some((p) => nl.includes(p))) return key;
    }
    return null;
  }

  const detectedEquip = detectEquipmentFromName(context.name || "");

  if (kind === "hw") {
    switch (fieldKey) {
      case "manufacturer": {
        if (detectedEquip && MANUFACTURERS[detectedEquip]) return MANUFACTURERS[detectedEquip];
        if (hwType && MANUFACTURERS_BY_HW_TYPE[hwType]) return MANUFACTURERS_BY_HW_TYPE[hwType];
        return ["Furuno", "Siemens", "Cisco", "ABB", "Kongsberg", "Moxa"];
      }
      case "model": {
        const mfr = manufacturer.trim();
        if (mfr) {
          for (const [key, models] of Object.entries(MODELS)) {
            if (key.toLowerCase() === mfr.toLowerCase() || mfr.toLowerCase().includes(key.toLowerCase())) {
              return models;
            }
          }
        }
        return [];
      }
      case "physicalInterface": {
        if (detectedEquip && INTERFACES_BY_HW_TYPE[hwType]) return INTERFACES_BY_HW_TYPE[hwType];
        if (hwType && INTERFACES_BY_HW_TYPE[hwType]) return INTERFACES_BY_HW_TYPE[hwType];
        return ["Ethernet RJ-45", "USB", "Serial RS-232", "RS-485", "NMEA 0183"];
      }
      case "commProtocols": {
        if (detectedEquip && PROTOCOLS[detectedEquip]) return PROTOCOLS[detectedEquip];
        if (hwType && PROTOCOLS_BY_HW_TYPE[hwType]) return PROTOCOLS_BY_HW_TYPE[hwType];
        return ["TCP/IP", "Ethernet", "NMEA 0183", "Modbus TCP", "HTTPS"];
      }
      case "location": {
        if (detectedEquip && LOCATIONS[detectedEquip]) return LOCATIONS[detectedEquip];
        if (hwType && LOCATIONS_BY_HW_TYPE[hwType]) return LOCATIONS_BY_HW_TYPE[hwType];
        return ["Navigation Bridge", "Engine Control Room (ECR)", "Server Room"];
      }
      case "logicalLocation": {
        if (hwType && LOGICAL_LOCATIONS[hwType]) return LOGICAL_LOCATIONS[hwType];
        return ["Navigation Network (VLAN 10)", "OT/Machinery Network (VLAN 20)", "DMZ"];
      }
      case "purpose": {
        if (detectedEquip && PURPOSES[detectedEquip]) return PURPOSES[detectedEquip];
        if (hwType && PURPOSES_BY_HW_TYPE[hwType]) return PURPOSES_BY_HW_TYPE[hwType];
        return ["System operation and control", "Data acquisition and monitoring"];
      }
      case "sysSoftwareCategory":
        return SYS_SOFTWARE_CATEGORIES;
      case "protectionMethod":
        return PROTECTION_METHODS;
      case "category": {
        if (hwType && CATEGORIES_BY_HW_TYPE[hwType]) return CATEGORIES_BY_HW_TYPE[hwType];
        return ["Cat I", "Cat II", "Cat III"];
      }
      case "zone":
        return ZONE_SUGGESTIONS;
    }
  }

  if (kind === "sw") {
    switch (fieldKey) {
      case "name": {
        const hn = hwName || (context.hardwareName || "").toLowerCase();
        for (const [key, names] of Object.entries(SW_NAMES)) {
          if (hn.includes(key)) return names;
        }
        return [];
      }
      case "vendor": {
        if (swType && SW_VENDORS_BY_TYPE[swType]) return SW_VENDORS_BY_TYPE[swType];
        return ["Microsoft", "Furuno", "Siemens", "ABB", "Kongsberg"];
      }
      case "version": {
        if (swType && SW_VERSIONS_BY_TYPE[swType]) return SW_VERSIONS_BY_TYPE[swType];
        return ["v1.0", "v2.0", "Latest"];
      }
      case "listeningPort": {
        if (swType && LISTENING_PORTS_BY_TYPE[swType]) return LISTENING_PORTS_BY_TYPE[swType];
        return ["80 (HTTP)", "443 (HTTPS)", "22 (SSH)", "502 (Modbus)"];
      }
    }
  }

  return [];
}
