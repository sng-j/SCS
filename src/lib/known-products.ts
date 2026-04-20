/**
 * Known software/firmware products for CVE matching.
 * When user selects one, vendor + CPE are auto-filled.
 */

export interface KnownProduct {
  label: string;        // Display name
  vendor: string;       // NVD vendor (lowercase)
  product: string;      // NVD product (lowercase)
  cpePrefix: string;    // CPE 2.3 prefix (without version)
  swType: string;       // OS | APPLICATION | FIRMWARE | LIBRARY | MIDDLEWARE
  category: string;     // Group for display
}

export const KNOWN_PRODUCTS: KnownProduct[] = [
  // ─── Operating Systems ─────────────────────────────────────────────────
  { label: "Windows 11", vendor: "microsoft", product: "windows_11", cpePrefix: "cpe:2.3:o:microsoft:windows_11", swType: "OS", category: "OS" },
  { label: "Windows 10", vendor: "microsoft", product: "windows_10", cpePrefix: "cpe:2.3:o:microsoft:windows_10", swType: "OS", category: "OS" },
  { label: "Windows Server 2022", vendor: "microsoft", product: "windows_server_2022", cpePrefix: "cpe:2.3:o:microsoft:windows_server_2022", swType: "OS", category: "OS" },
  { label: "Windows Server 2019", vendor: "microsoft", product: "windows_server_2019", cpePrefix: "cpe:2.3:o:microsoft:windows_server_2019", swType: "OS", category: "OS" },
  { label: "Windows Server 2016", vendor: "microsoft", product: "windows_server_2016", cpePrefix: "cpe:2.3:o:microsoft:windows_server_2016", swType: "OS", category: "OS" },
  { label: "Ubuntu Linux", vendor: "canonical", product: "ubuntu_linux", cpePrefix: "cpe:2.3:o:canonical:ubuntu_linux", swType: "OS", category: "OS" },
  { label: "Debian Linux", vendor: "debian", product: "debian_linux", cpePrefix: "cpe:2.3:o:debian:debian_linux", swType: "OS", category: "OS" },
  { label: "Red Hat Enterprise Linux", vendor: "redhat", product: "enterprise_linux", cpePrefix: "cpe:2.3:o:redhat:enterprise_linux", swType: "OS", category: "OS" },
  { label: "CentOS", vendor: "centos", product: "centos", cpePrefix: "cpe:2.3:o:centos:centos", swType: "OS", category: "OS" },
  { label: "Rocky Linux", vendor: "rockylinux", product: "rocky_linux", cpePrefix: "cpe:2.3:o:rockylinux:rocky_linux", swType: "OS", category: "OS" },
  { label: "AlmaLinux", vendor: "almalinux", product: "almalinux", cpePrefix: "cpe:2.3:o:almalinux:almalinux", swType: "OS", category: "OS" },
  { label: "Linux Kernel", vendor: "linux", product: "linux_kernel", cpePrefix: "cpe:2.3:o:linux:linux_kernel", swType: "OS", category: "OS" },
  { label: "Android", vendor: "google", product: "android", cpePrefix: "cpe:2.3:o:google:android", swType: "OS", category: "OS" },
  { label: "VMware ESXi", vendor: "vmware", product: "esxi", cpePrefix: "cpe:2.3:o:vmware:esxi", swType: "OS", category: "OS" },
  { label: "FreeBSD", vendor: "freebsd", product: "freebsd", cpePrefix: "cpe:2.3:o:freebsd:freebsd", swType: "OS", category: "OS" },
  { label: "VxWorks", vendor: "windriver", product: "vxworks", cpePrefix: "cpe:2.3:o:windriver:vxworks", swType: "OS", category: "OS" },

  // ─── Network / Firewall Firmware ───────────────────────────────────────
  { label: "Fortinet FortiOS", vendor: "fortinet", product: "fortios", cpePrefix: "cpe:2.3:o:fortinet:fortios", swType: "FIRMWARE", category: "Network" },
  { label: "Fortinet FortiManager", vendor: "fortinet", product: "fortimanager", cpePrefix: "cpe:2.3:a:fortinet:fortimanager", swType: "FIRMWARE", category: "Network" },
  { label: "Fortinet FortiAnalyzer", vendor: "fortinet", product: "fortianalyzer", cpePrefix: "cpe:2.3:a:fortinet:fortianalyzer", swType: "FIRMWARE", category: "Network" },
  { label: "Cisco IOS", vendor: "cisco", product: "ios", cpePrefix: "cpe:2.3:o:cisco:ios", swType: "FIRMWARE", category: "Network" },
  { label: "Cisco IOS XE", vendor: "cisco", product: "ios_xe", cpePrefix: "cpe:2.3:o:cisco:ios_xe", swType: "FIRMWARE", category: "Network" },
  { label: "Cisco NX-OS", vendor: "cisco", product: "nx-os", cpePrefix: "cpe:2.3:o:cisco:nx-os", swType: "FIRMWARE", category: "Network" },
  { label: "Cisco ASA", vendor: "cisco", product: "adaptive_security_appliance_software", cpePrefix: "cpe:2.3:o:cisco:adaptive_security_appliance_software", swType: "FIRMWARE", category: "Network" },
  { label: "Cisco Firepower Threat Defense", vendor: "cisco", product: "firepower_threat_defense", cpePrefix: "cpe:2.3:a:cisco:firepower_threat_defense", swType: "FIRMWARE", category: "Network" },
  { label: "Palo Alto PAN-OS", vendor: "paloaltonetworks", product: "pan-os", cpePrefix: "cpe:2.3:o:paloaltonetworks:pan-os", swType: "FIRMWARE", category: "Network" },
  { label: "Juniper Junos OS", vendor: "juniper", product: "junos", cpePrefix: "cpe:2.3:o:juniper:junos", swType: "FIRMWARE", category: "Network" },
  { label: "MikroTik RouterOS", vendor: "mikrotik", product: "routeros", cpePrefix: "cpe:2.3:o:mikrotik:routeros", swType: "FIRMWARE", category: "Network" },
  { label: "Aruba ClearPass", vendor: "arubanetworks", product: "clearpass_policy_manager", cpePrefix: "cpe:2.3:a:arubanetworks:clearpass_policy_manager", swType: "APPLICATION", category: "Network" },
  { label: "Ubiquiti UniFi", vendor: "ui", product: "unifi_network_application", cpePrefix: "cpe:2.3:a:ui:unifi_network_application", swType: "APPLICATION", category: "Network" },
  { label: "ZyXEL Firmware", vendor: "zyxel", product: "zyxel_firmware", cpePrefix: "cpe:2.3:o:zyxel:zyxel_firmware", swType: "FIRMWARE", category: "Network" },
  { label: "TP-Link Firmware", vendor: "tp-link", product: "firmware", cpePrefix: "cpe:2.3:o:tp-link:firmware", swType: "FIRMWARE", category: "Network" },
  { label: "NETGEAR Firmware", vendor: "netgear", product: "firmware", cpePrefix: "cpe:2.3:o:netgear:firmware", swType: "FIRMWARE", category: "Network" },

  // ─── Surveillance / CCTV ───────────────────────────────────────────────
  { label: "Hikvision Firmware", vendor: "hikvision", product: "ds-2cd2xx2_firmware", cpePrefix: "cpe:2.3:o:hikvision:ds-2cd2xx2_firmware", swType: "FIRMWARE", category: "Surveillance" },
  { label: "Dahua Firmware", vendor: "dahua", product: "firmware", cpePrefix: "cpe:2.3:o:dahua:firmware", swType: "FIRMWARE", category: "Surveillance" },
  { label: "Axis Camera Firmware", vendor: "axis", product: "axis_os", cpePrefix: "cpe:2.3:o:axis:axis_os", swType: "FIRMWARE", category: "Surveillance" },
  { label: "Hanwha Vision Firmware", vendor: "hanwha", product: "firmware", cpePrefix: "cpe:2.3:o:hanwha:firmware", swType: "FIRMWARE", category: "Surveillance" },

  // ─── Industrial / Maritime OT ──────────────────────────────────────────
  { label: "Siemens SIMATIC S7", vendor: "siemens", product: "simatic_s7-1500_firmware", cpePrefix: "cpe:2.3:o:siemens:simatic_s7-1500_firmware", swType: "FIRMWARE", category: "Industrial" },
  { label: "Siemens SCALANCE", vendor: "siemens", product: "scalance_firmware", cpePrefix: "cpe:2.3:o:siemens:scalance_firmware", swType: "FIRMWARE", category: "Industrial" },
  { label: "Schneider Electric Modicon", vendor: "schneider-electric", product: "modicon_firmware", cpePrefix: "cpe:2.3:o:schneider-electric:modicon_firmware", swType: "FIRMWARE", category: "Industrial" },
  { label: "ABB System 800xA", vendor: "abb", product: "system_800xa", cpePrefix: "cpe:2.3:a:abb:system_800xa", swType: "APPLICATION", category: "Industrial" },
  { label: "Honeywell Experion PKS", vendor: "honeywell", product: "experion_pks", cpePrefix: "cpe:2.3:a:honeywell:experion_pks", swType: "APPLICATION", category: "Industrial" },
  { label: "Yokogawa CENTUM VP", vendor: "yokogawa", product: "centum_vp", cpePrefix: "cpe:2.3:a:yokogawa:centum_vp", swType: "APPLICATION", category: "Industrial" },
  { label: "Moxa NPort Firmware", vendor: "moxa", product: "nport_firmware", cpePrefix: "cpe:2.3:o:moxa:nport_firmware", swType: "FIRMWARE", category: "Industrial" },
  { label: "Rockwell FactoryTalk", vendor: "rockwellautomation", product: "factorytalk_view", cpePrefix: "cpe:2.3:a:rockwellautomation:factorytalk_view", swType: "APPLICATION", category: "Industrial" },

  // ─── VoIP / Communication ──────────────────────────────────────────────
  { label: "Avaya Aura", vendor: "avaya", product: "aura_communication_manager", cpePrefix: "cpe:2.3:a:avaya:aura_communication_manager", swType: "APPLICATION", category: "VoIP" },
  { label: "Cisco Unified Communications", vendor: "cisco", product: "unified_communications_manager", cpePrefix: "cpe:2.3:a:cisco:unified_communications_manager", swType: "APPLICATION", category: "VoIP" },
  { label: "Mitel MiVoice", vendor: "mitel", product: "mivoice_connect", cpePrefix: "cpe:2.3:a:mitel:mivoice_connect", swType: "APPLICATION", category: "VoIP" },
  { label: "Grandstream UCM", vendor: "grandstream", product: "ucm6200_firmware", cpePrefix: "cpe:2.3:o:grandstream:ucm6200_firmware", swType: "FIRMWARE", category: "VoIP" },
  { label: "Yealink IP Phone Firmware", vendor: "yealink", product: "ip_phone_firmware", cpePrefix: "cpe:2.3:o:yealink:ip_phone_firmware", swType: "FIRMWARE", category: "VoIP" },

  // ─── Web / Application Server ──────────────────────────────────────────
  { label: "Apache HTTP Server", vendor: "apache", product: "http_server", cpePrefix: "cpe:2.3:a:apache:http_server", swType: "APPLICATION", category: "Web Server" },
  { label: "Apache Tomcat", vendor: "apache", product: "tomcat", cpePrefix: "cpe:2.3:a:apache:tomcat", swType: "APPLICATION", category: "Web Server" },
  { label: "Nginx", vendor: "f5", product: "nginx", cpePrefix: "cpe:2.3:a:f5:nginx", swType: "APPLICATION", category: "Web Server" },
  { label: "Microsoft IIS", vendor: "microsoft", product: "internet_information_services", cpePrefix: "cpe:2.3:a:microsoft:internet_information_services", swType: "APPLICATION", category: "Web Server" },
  { label: "Node.js", vendor: "nodejs", product: "node.js", cpePrefix: "cpe:2.3:a:nodejs:node.js", swType: "APPLICATION", category: "Web Server" },

  // ─── Database ──────────────────────────────────────────────────────────
  { label: "MySQL", vendor: "oracle", product: "mysql", cpePrefix: "cpe:2.3:a:oracle:mysql", swType: "APPLICATION", category: "Database" },
  { label: "PostgreSQL", vendor: "postgresql", product: "postgresql", cpePrefix: "cpe:2.3:a:postgresql:postgresql", swType: "APPLICATION", category: "Database" },
  { label: "Microsoft SQL Server", vendor: "microsoft", product: "sql_server", cpePrefix: "cpe:2.3:a:microsoft:sql_server", swType: "APPLICATION", category: "Database" },
  { label: "Oracle Database", vendor: "oracle", product: "database_server", cpePrefix: "cpe:2.3:a:oracle:database_server", swType: "APPLICATION", category: "Database" },
  { label: "MongoDB", vendor: "mongodb", product: "mongodb", cpePrefix: "cpe:2.3:a:mongodb:mongodb", swType: "APPLICATION", category: "Database" },
  { label: "Redis", vendor: "redis", product: "redis", cpePrefix: "cpe:2.3:a:redis:redis", swType: "APPLICATION", category: "Database" },
  { label: "MariaDB", vendor: "mariadb", product: "mariadb", cpePrefix: "cpe:2.3:a:mariadb:mariadb", swType: "APPLICATION", category: "Database" },
  { label: "IBM Db2", vendor: "ibm", product: "db2", cpePrefix: "cpe:2.3:a:ibm:db2", swType: "APPLICATION", category: "Database" },

  // ─── Security / Crypto ─────────────────────────────────────────────────
  { label: "OpenSSL", vendor: "openssl", product: "openssl", cpePrefix: "cpe:2.3:a:openssl:openssl", swType: "LIBRARY", category: "Security" },
  { label: "OpenSSH", vendor: "openbsd", product: "openssh", cpePrefix: "cpe:2.3:a:openbsd:openssh", swType: "APPLICATION", category: "Security" },
  { label: "OpenVPN", vendor: "openvpn", product: "openvpn", cpePrefix: "cpe:2.3:a:openvpn:openvpn", swType: "APPLICATION", category: "Security" },

  // ─── Virtualization / Container ────────────────────────────────────────
  { label: "VMware vCenter", vendor: "vmware", product: "vcenter_server", cpePrefix: "cpe:2.3:a:vmware:vcenter_server", swType: "APPLICATION", category: "Virtualization" },
  { label: "VMware Workstation", vendor: "vmware", product: "workstation", cpePrefix: "cpe:2.3:a:vmware:workstation", swType: "APPLICATION", category: "Virtualization" },
  { label: "Docker", vendor: "docker", product: "docker", cpePrefix: "cpe:2.3:a:docker:docker", swType: "APPLICATION", category: "Virtualization" },
  { label: "Kubernetes", vendor: "kubernetes", product: "kubernetes", cpePrefix: "cpe:2.3:a:kubernetes:kubernetes", swType: "APPLICATION", category: "Virtualization" },

  // ─── Dell / HP Server Firmware ─────────────────────────────────────────
  { label: "Dell iDRAC", vendor: "dell", product: "idrac9_firmware", cpePrefix: "cpe:2.3:o:dell:idrac9_firmware", swType: "FIRMWARE", category: "Server" },
  { label: "Dell PowerEdge BIOS", vendor: "dell", product: "poweredge_bios", cpePrefix: "cpe:2.3:o:dell:poweredge_bios", swType: "FIRMWARE", category: "Server" },
  { label: "HP iLO", vendor: "hp", product: "integrated_lights-out", cpePrefix: "cpe:2.3:o:hp:integrated_lights-out", swType: "FIRMWARE", category: "Server" },
  { label: "Supermicro BMC", vendor: "supermicro", product: "bmc_firmware", cpePrefix: "cpe:2.3:o:supermicro:bmc_firmware", swType: "FIRMWARE", category: "Server" },

  // ─── Microsoft Applications ────────────────────────────────────────────
  { label: "Microsoft 365 Apps", vendor: "microsoft", product: "365_apps", cpePrefix: "cpe:2.3:a:microsoft:365_apps", swType: "APPLICATION", category: "Application" },
  { label: "Microsoft Exchange Server", vendor: "microsoft", product: "exchange_server", cpePrefix: "cpe:2.3:a:microsoft:exchange_server", swType: "APPLICATION", category: "Application" },
  { label: "Microsoft SharePoint", vendor: "microsoft", product: "sharepoint_server", cpePrefix: "cpe:2.3:a:microsoft:sharepoint_server", swType: "APPLICATION", category: "Application" },
  { label: "Microsoft .NET Framework", vendor: "microsoft", product: ".net_framework", cpePrefix: "cpe:2.3:a:microsoft:.net_framework", swType: "LIBRARY", category: "Application" },

  // ─── Browsers ──────────────────────────────────────────────────────────
  { label: "Google Chrome", vendor: "google", product: "chrome", cpePrefix: "cpe:2.3:a:google:chrome", swType: "APPLICATION", category: "Application" },
  { label: "Microsoft Edge", vendor: "microsoft", product: "edge_chromium", cpePrefix: "cpe:2.3:a:microsoft:edge_chromium", swType: "APPLICATION", category: "Application" },
  { label: "Mozilla Firefox", vendor: "mozilla", product: "firefox", cpePrefix: "cpe:2.3:a:mozilla:firefox", swType: "APPLICATION", category: "Application" },

  // ─── Cisco Software ────────────────────────────────────────────────────
  { label: "Cisco IOS XR", vendor: "cisco", product: "ios_xr", cpePrefix: "cpe:2.3:o:cisco:ios_xr", swType: "FIRMWARE", category: "Network" },
  { label: "Cisco Identity Services Engine", vendor: "cisco", product: "identity_services_engine", cpePrefix: "cpe:2.3:a:cisco:identity_services_engine", swType: "APPLICATION", category: "Network" },
  { label: "Cisco AnyConnect", vendor: "cisco", product: "anyconnect_secure_mobility_client", cpePrefix: "cpe:2.3:a:cisco:anyconnect_secure_mobility_client", swType: "APPLICATION", category: "Network" },
  { label: "Cisco Webex Meetings", vendor: "cisco", product: "webex_meetings_server", cpePrefix: "cpe:2.3:a:cisco:webex_meetings_server", swType: "APPLICATION", category: "Application" },
  { label: "Cisco SD-WAN vManage", vendor: "cisco", product: "sd-wan_firmware", cpePrefix: "cpe:2.3:o:cisco:sd-wan_firmware", swType: "FIRMWARE", category: "Network" },
  { label: "Cisco Wireless LAN Controller", vendor: "cisco", product: "wireless_lan_controller_software", cpePrefix: "cpe:2.3:a:cisco:wireless_lan_controller_software", swType: "FIRMWARE", category: "Network" },

  // ─── Fortinet Extra ────────────────────────────────────────────────────
  { label: "Fortinet FortiWeb", vendor: "fortinet", product: "fortiweb", cpePrefix: "cpe:2.3:a:fortinet:fortiweb", swType: "APPLICATION", category: "Network" },
  { label: "Fortinet FortiProxy", vendor: "fortinet", product: "fortiproxy", cpePrefix: "cpe:2.3:a:fortinet:fortiproxy", swType: "APPLICATION", category: "Network" },
  { label: "Fortinet FortiSwitch", vendor: "fortinet", product: "fortiswitch", cpePrefix: "cpe:2.3:o:fortinet:fortiswitch", swType: "FIRMWARE", category: "Network" },
  { label: "Fortinet FortiAP", vendor: "fortinet", product: "fortiap", cpePrefix: "cpe:2.3:o:fortinet:fortiap", swType: "FIRMWARE", category: "Network" },

  // ─── Microsoft Extra ───────────────────────────────────────────────────
  { label: "Windows 7", vendor: "microsoft", product: "windows_7", cpePrefix: "cpe:2.3:o:microsoft:windows_7", swType: "OS", category: "OS" },
  { label: "Microsoft Office", vendor: "microsoft", product: "office", cpePrefix: "cpe:2.3:a:microsoft:office", swType: "APPLICATION", category: "Application" },
  { label: "Microsoft Excel", vendor: "microsoft", product: "excel", cpePrefix: "cpe:2.3:a:microsoft:excel", swType: "APPLICATION", category: "Application" },
  { label: "Microsoft Dynamics 365", vendor: "microsoft", product: "dynamics_365", cpePrefix: "cpe:2.3:a:microsoft:dynamics_365", swType: "APPLICATION", category: "Application" },

  // ─── Industrial Software ───────────────────────────────────────────────
  { label: "Siemens SINEC NMS", vendor: "siemens", product: "sinec_nms", cpePrefix: "cpe:2.3:a:siemens:sinec_nms", swType: "APPLICATION", category: "Industrial" },
  { label: "Siemens WinCC", vendor: "siemens", product: "wincc", cpePrefix: "cpe:2.3:a:siemens:wincc", swType: "APPLICATION", category: "Industrial" },
  { label: "Siemens TIA Portal", vendor: "siemens", product: "totally_integrated_automation_portal", cpePrefix: "cpe:2.3:a:siemens:totally_integrated_automation_portal", swType: "APPLICATION", category: "Industrial" },
  { label: "Schneider EcoStruxure", vendor: "schneider-electric", product: "ecostruxure", cpePrefix: "cpe:2.3:a:schneider-electric:ecostruxure", swType: "APPLICATION", category: "Industrial" },
  { label: "Rockwell FactoryTalk View", vendor: "rockwellautomation", product: "factorytalk_view", cpePrefix: "cpe:2.3:a:rockwellautomation:factorytalk_view", swType: "APPLICATION", category: "Industrial" },

  // ─── Dell Software ─────────────────────────────────────────────────────
  { label: "Dell PowerScale OneFS", vendor: "dell", product: "powerscale_onefs", cpePrefix: "cpe:2.3:a:dell:powerscale_onefs", swType: "APPLICATION", category: "Server" },
  { label: "Dell OpenManage", vendor: "dell", product: "openmanage_enterprise", cpePrefix: "cpe:2.3:a:dell:openmanage_enterprise", swType: "APPLICATION", category: "Server" },

  // ─── Apache Extra ──────────────────────────────────────────────────────
  { label: "Apache Struts", vendor: "apache", product: "struts", cpePrefix: "cpe:2.3:a:apache:struts", swType: "LIBRARY", category: "Web Server" },
  { label: "Apache Airflow", vendor: "apache", product: "airflow", cpePrefix: "cpe:2.3:a:apache:airflow", swType: "APPLICATION", category: "Application" },
  { label: "Apache Kafka", vendor: "apache", product: "kafka", cpePrefix: "cpe:2.3:a:apache:kafka", swType: "APPLICATION", category: "Application" },
  { label: "Apache ActiveMQ", vendor: "apache", product: "activemq", cpePrefix: "cpe:2.3:a:apache:activemq", swType: "MIDDLEWARE", category: "Application" },
  { label: "Apache Log4j", vendor: "apache", product: "log4j", cpePrefix: "cpe:2.3:a:apache:log4j", swType: "LIBRARY", category: "Security" },

  // ─── VMware Extra ──────────────────────────────────────────────────────
  { label: "VMware vSphere", vendor: "vmware", product: "vsphere", cpePrefix: "cpe:2.3:a:vmware:vsphere", swType: "APPLICATION", category: "Virtualization" },
  { label: "VMware NSX", vendor: "vmware", product: "nsx", cpePrefix: "cpe:2.3:a:vmware:nsx", swType: "APPLICATION", category: "Virtualization" },
  { label: "VMware Horizon", vendor: "vmware", product: "horizon", cpePrefix: "cpe:2.3:a:vmware:horizon", swType: "APPLICATION", category: "Virtualization" },

  // ─── Other Common ──────────────────────────────────────────────────────
  { label: "Elasticsearch", vendor: "elastic", product: "elasticsearch", cpePrefix: "cpe:2.3:a:elastic:elasticsearch", swType: "APPLICATION", category: "Database" },
  { label: "Grafana", vendor: "grafana", product: "grafana", cpePrefix: "cpe:2.3:a:grafana:grafana", swType: "APPLICATION", category: "Application" },
  { label: "GitLab", vendor: "gitlab", product: "gitlab", cpePrefix: "cpe:2.3:a:gitlab:gitlab", swType: "APPLICATION", category: "Application" },
  { label: "Jenkins", vendor: "jenkins", product: "jenkins", cpePrefix: "cpe:2.3:a:jenkins:jenkins", swType: "APPLICATION", category: "Application" },
  { label: "Samba", vendor: "samba", product: "samba", cpePrefix: "cpe:2.3:a:samba:samba", swType: "APPLICATION", category: "Application" },
  { label: "Zabbix", vendor: "zabbix", product: "zabbix", cpePrefix: "cpe:2.3:a:zabbix:zabbix", swType: "APPLICATION", category: "Application" },
  { label: "Nagios Core", vendor: "nagios", product: "nagios", cpePrefix: "cpe:2.3:a:nagios:nagios", swType: "APPLICATION", category: "Application" },
  { label: "Python", vendor: "python", product: "python", cpePrefix: "cpe:2.3:a:python:python", swType: "APPLICATION", category: "Application" },
  { label: "PHP", vendor: "php", product: "php", cpePrefix: "cpe:2.3:a:php:php", swType: "APPLICATION", category: "Application" },
  { label: "Java / OpenJDK", vendor: "oracle", product: "jdk", cpePrefix: "cpe:2.3:a:oracle:jdk", swType: "APPLICATION", category: "Application" },
];

/** Get categories sorted */
export function getProductCategories(): string[] {
  return [...new Set(KNOWN_PRODUCTS.map(p => p.category))];
}

/** Search products by query */
export function searchKnownProducts(query: string, swType?: string): KnownProduct[] {
  const q = query.toLowerCase();
  return KNOWN_PRODUCTS.filter(p => {
    if (swType && p.swType !== swType) return false;
    return p.label.toLowerCase().includes(q) || p.vendor.includes(q) || p.product.includes(q);
  });
}

// ─── Known Hardware Products ─────────────────────────────────────────────────

export interface KnownHardware {
  label: string;
  manufacturer: string;
  series: string;       // NVD product prefix for matching
  hwType: string;       // PLC | SERVER | NETWORK_DEVICE | SENSOR | PC | OTHER_DEVICE
  category: string;
}

export const KNOWN_HARDWARE: KnownHardware[] = [
  // ─── Fortinet ──────────────────────────────────────────────────────────
  { label: "FortiGate 40F", manufacturer: "Fortinet", series: "fortigate-40f", hwType: "NETWORK_DEVICE", category: "Firewall" },
  { label: "FortiGate 60F", manufacturer: "Fortinet", series: "fortigate-60f", hwType: "NETWORK_DEVICE", category: "Firewall" },
  { label: "FortiGate 80F", manufacturer: "Fortinet", series: "fortigate-80f", hwType: "NETWORK_DEVICE", category: "Firewall" },
  { label: "FortiGate 100F", manufacturer: "Fortinet", series: "fortigate-100f", hwType: "NETWORK_DEVICE", category: "Firewall" },
  { label: "FortiGate 120G", manufacturer: "Fortinet", series: "fortigate-120g", hwType: "NETWORK_DEVICE", category: "Firewall" },
  { label: "FortiGate 200F", manufacturer: "Fortinet", series: "fortigate-200f", hwType: "NETWORK_DEVICE", category: "Firewall" },
  { label: "FortiGate 400F", manufacturer: "Fortinet", series: "fortigate-400f", hwType: "NETWORK_DEVICE", category: "Firewall" },
  { label: "FortiGate 600F", manufacturer: "Fortinet", series: "fortigate-600f", hwType: "NETWORK_DEVICE", category: "Firewall" },
  { label: "FortiSwitch 124F", manufacturer: "Fortinet", series: "fortiswitch-124f", hwType: "NETWORK_DEVICE", category: "Switch" },
  { label: "FortiSwitch 248E", manufacturer: "Fortinet", series: "fortiswitch-248e", hwType: "NETWORK_DEVICE", category: "Switch" },
  { label: "FortiAP 231G", manufacturer: "Fortinet", series: "fortiap-231g", hwType: "NETWORK_DEVICE", category: "Wireless" },

  // ─── Cisco ─────────────────────────────────────────────────────────────
  { label: "Cisco ASA 5506", manufacturer: "Cisco", series: "asa5506", hwType: "NETWORK_DEVICE", category: "Firewall" },
  { label: "Cisco ASA 5508", manufacturer: "Cisco", series: "asa5508", hwType: "NETWORK_DEVICE", category: "Firewall" },
  { label: "Cisco ASA 5516", manufacturer: "Cisco", series: "asa5516", hwType: "NETWORK_DEVICE", category: "Firewall" },
  { label: "Cisco Firepower 1010", manufacturer: "Cisco", series: "firepower-1010", hwType: "NETWORK_DEVICE", category: "Firewall" },
  { label: "Cisco Firepower 2110", manufacturer: "Cisco", series: "firepower-2110", hwType: "NETWORK_DEVICE", category: "Firewall" },
  { label: "Cisco Catalyst 9200", manufacturer: "Cisco", series: "catalyst-9200", hwType: "NETWORK_DEVICE", category: "Switch" },
  { label: "Cisco Catalyst 9300", manufacturer: "Cisco", series: "catalyst-9300", hwType: "NETWORK_DEVICE", category: "Switch" },
  { label: "Cisco Catalyst 9500", manufacturer: "Cisco", series: "catalyst-9500", hwType: "NETWORK_DEVICE", category: "Switch" },
  { label: "Cisco Catalyst 3850", manufacturer: "Cisco", series: "catalyst-3850", hwType: "NETWORK_DEVICE", category: "Switch" },
  { label: "Cisco CBS250", manufacturer: "Cisco", series: "cbs250", hwType: "NETWORK_DEVICE", category: "Switch" },
  { label: "Cisco CBS350", manufacturer: "Cisco", series: "cbs350", hwType: "NETWORK_DEVICE", category: "Switch" },
  { label: "Cisco C1300", manufacturer: "Cisco", series: "c1300", hwType: "NETWORK_DEVICE", category: "Switch" },
  { label: "Cisco Nexus 9300", manufacturer: "Cisco", series: "nexus-9300", hwType: "NETWORK_DEVICE", category: "Switch" },
  { label: "Cisco Nexus 5600", manufacturer: "Cisco", series: "nexus-5600", hwType: "NETWORK_DEVICE", category: "Switch" },
  { label: "Cisco ISR 1100", manufacturer: "Cisco", series: "isr-1100", hwType: "NETWORK_DEVICE", category: "Router" },
  { label: "Cisco ISR 4300", manufacturer: "Cisco", series: "isr-4300", hwType: "NETWORK_DEVICE", category: "Router" },
  { label: "Cisco IP Phone 8800", manufacturer: "Cisco", series: "ip-phone-8800", hwType: "OTHER_DEVICE", category: "VoIP" },
  { label: "Cisco IP Phone 7800", manufacturer: "Cisco", series: "ip-phone-7800", hwType: "OTHER_DEVICE", category: "VoIP" },
  { label: "Cisco Unified CM", manufacturer: "Cisco", series: "cucm", hwType: "SERVER", category: "VoIP" },
  { label: "Cisco Aironet AP", manufacturer: "Cisco", series: "aironet", hwType: "NETWORK_DEVICE", category: "Wireless" },
  { label: "Cisco Meraki MR", manufacturer: "Cisco", series: "meraki-mr", hwType: "NETWORK_DEVICE", category: "Wireless" },

  // ─── Palo Alto ─────────────────────────────────────────────────────────
  { label: "Palo Alto PA-220", manufacturer: "Palo Alto Networks", series: "pa-220", hwType: "NETWORK_DEVICE", category: "Firewall" },
  { label: "Palo Alto PA-440", manufacturer: "Palo Alto Networks", series: "pa-440", hwType: "NETWORK_DEVICE", category: "Firewall" },
  { label: "Palo Alto PA-820", manufacturer: "Palo Alto Networks", series: "pa-820", hwType: "NETWORK_DEVICE", category: "Firewall" },
  { label: "Palo Alto PA-3200", manufacturer: "Palo Alto Networks", series: "pa-3200", hwType: "NETWORK_DEVICE", category: "Firewall" },
  { label: "Palo Alto PA-5200", manufacturer: "Palo Alto Networks", series: "pa-5200", hwType: "NETWORK_DEVICE", category: "Firewall" },

  // ─── Juniper ───────────────────────────────────────────────────────────
  { label: "Juniper SRX300", manufacturer: "Juniper", series: "srx300", hwType: "NETWORK_DEVICE", category: "Firewall" },
  { label: "Juniper SRX1500", manufacturer: "Juniper", series: "srx1500", hwType: "NETWORK_DEVICE", category: "Firewall" },
  { label: "Juniper EX2300", manufacturer: "Juniper", series: "ex2300", hwType: "NETWORK_DEVICE", category: "Switch" },
  { label: "Juniper EX4300", manufacturer: "Juniper", series: "ex4300", hwType: "NETWORK_DEVICE", category: "Switch" },
  { label: "Juniper QFX5100", manufacturer: "Juniper", series: "qfx5100", hwType: "NETWORK_DEVICE", category: "Switch" },

  // ─── Other Network ─────────────────────────────────────────────────────
  { label: "MikroTik hEX", manufacturer: "MikroTik", series: "hex", hwType: "NETWORK_DEVICE", category: "Router" },
  { label: "MikroTik CCR2004", manufacturer: "MikroTik", series: "ccr2004", hwType: "NETWORK_DEVICE", category: "Router" },
  { label: "MikroTik CRS326", manufacturer: "MikroTik", series: "crs326", hwType: "NETWORK_DEVICE", category: "Switch" },
  { label: "Aruba AP-515", manufacturer: "Aruba Networks", series: "ap-515", hwType: "NETWORK_DEVICE", category: "Wireless" },
  { label: "Aruba AP-635", manufacturer: "Aruba Networks", series: "ap-635", hwType: "NETWORK_DEVICE", category: "Wireless" },
  { label: "Ubiquiti UniFi U6-Pro", manufacturer: "Ubiquiti", series: "u6-pro", hwType: "NETWORK_DEVICE", category: "Wireless" },
  { label: "Ubiquiti UniFi Dream Machine", manufacturer: "Ubiquiti", series: "udm", hwType: "NETWORK_DEVICE", category: "Router" },
  { label: "ZyXEL GS1920", manufacturer: "ZyXEL", series: "gs1920", hwType: "NETWORK_DEVICE", category: "Switch" },
  { label: "ZyXEL USG FLEX 200", manufacturer: "ZyXEL", series: "usg-flex-200", hwType: "NETWORK_DEVICE", category: "Firewall" },
  { label: "TP-Link TL-SG1016", manufacturer: "TP-Link", series: "tl-sg1016", hwType: "NETWORK_DEVICE", category: "Switch" },
  { label: "TP-Link ER7206", manufacturer: "TP-Link", series: "er7206", hwType: "NETWORK_DEVICE", category: "Router" },
  { label: "NETGEAR GS308", manufacturer: "NETGEAR", series: "gs308", hwType: "NETWORK_DEVICE", category: "Switch" },
  { label: "NETGEAR GS724T", manufacturer: "NETGEAR", series: "gs724t", hwType: "NETWORK_DEVICE", category: "Switch" },

  // ─── Server ────────────────────────────────────────────────────────────
  { label: "Dell PowerEdge R450", manufacturer: "Dell", series: "poweredge-r450", hwType: "SERVER", category: "Server" },
  { label: "Dell PowerEdge R550", manufacturer: "Dell", series: "poweredge-r550", hwType: "SERVER", category: "Server" },
  { label: "Dell PowerEdge R650", manufacturer: "Dell", series: "poweredge-r650", hwType: "SERVER", category: "Server" },
  { label: "Dell PowerEdge R750", manufacturer: "Dell", series: "poweredge-r750", hwType: "SERVER", category: "Server" },
  { label: "Dell PowerEdge T350", manufacturer: "Dell", series: "poweredge-t350", hwType: "SERVER", category: "Server" },
  { label: "Dell PowerEdge XR5610", manufacturer: "Dell", series: "poweredge-xr5610", hwType: "SERVER", category: "Server" },
  { label: "HP ProLiant DL360", manufacturer: "HP", series: "proliant-dl360", hwType: "SERVER", category: "Server" },
  { label: "HP ProLiant DL380", manufacturer: "HP", series: "proliant-dl380", hwType: "SERVER", category: "Server" },
  { label: "HP ProLiant ML350", manufacturer: "HP", series: "proliant-ml350", hwType: "SERVER", category: "Server" },
  { label: "Supermicro SYS-1029", manufacturer: "Supermicro", series: "sys-1029", hwType: "SERVER", category: "Server" },
  { label: "Lenovo ThinkSystem SR630", manufacturer: "Lenovo", series: "sr630", hwType: "SERVER", category: "Server" },
  { label: "Lenovo ThinkSystem SR650", manufacturer: "Lenovo", series: "sr650", hwType: "SERVER", category: "Server" },

  // ─── Surveillance / CCTV ───────────────────────────────────────────────
  { label: "Hikvision DS-2CD2xxx", manufacturer: "Hikvision", series: "ds-2cd2", hwType: "OTHER_DEVICE", category: "Surveillance" },
  { label: "Hikvision DS-2DE4xxx PTZ", manufacturer: "Hikvision", series: "ds-2de4", hwType: "OTHER_DEVICE", category: "Surveillance" },
  { label: "Hikvision NVR DS-7600", manufacturer: "Hikvision", series: "ds-7600", hwType: "OTHER_DEVICE", category: "Surveillance" },
  { label: "Dahua IPC-HFW Series", manufacturer: "Dahua", series: "ipc-hfw", hwType: "OTHER_DEVICE", category: "Surveillance" },
  { label: "Dahua NVR DHI-NVR", manufacturer: "Dahua", series: "dhi-nvr", hwType: "OTHER_DEVICE", category: "Surveillance" },
  { label: "Axis P3245", manufacturer: "Axis", series: "p3245", hwType: "OTHER_DEVICE", category: "Surveillance" },
  { label: "Axis M3106", manufacturer: "Axis", series: "m3106", hwType: "OTHER_DEVICE", category: "Surveillance" },
  { label: "Hanwha XNV-6080", manufacturer: "Hanwha Vision", series: "xnv-6080", hwType: "OTHER_DEVICE", category: "Surveillance" },
  { label: "Hanwha XNO-8080R", manufacturer: "Hanwha Vision", series: "xno-8080r", hwType: "OTHER_DEVICE", category: "Surveillance" },
  { label: "Bosch FLEXIDOME IP", manufacturer: "Bosch", series: "flexidome", hwType: "OTHER_DEVICE", category: "Surveillance" },

  // ─── Siemens ───────────────────────────────────────────────────────────
  { label: "Siemens SIMATIC S7-1500", manufacturer: "Siemens", series: "s7-1500", hwType: "PLC", category: "Industrial" },
  { label: "Siemens SIMATIC S7-1200", manufacturer: "Siemens", series: "s7-1200", hwType: "PLC", category: "Industrial" },
  { label: "Siemens SIMATIC S7-300", manufacturer: "Siemens", series: "s7-300", hwType: "PLC", category: "Industrial" },
  { label: "Siemens SIMATIC S7-400", manufacturer: "Siemens", series: "s7-400", hwType: "PLC", category: "Industrial" },
  { label: "Siemens SIMATIC ET 200SP", manufacturer: "Siemens", series: "et200sp", hwType: "PLC", category: "Industrial" },
  { label: "Siemens SCALANCE XM408", manufacturer: "Siemens", series: "scalance-xm408", hwType: "NETWORK_DEVICE", category: "Industrial" },
  { label: "Siemens SCALANCE XC206", manufacturer: "Siemens", series: "scalance-xc206", hwType: "NETWORK_DEVICE", category: "Industrial" },
  { label: "Siemens SINAMICS G120", manufacturer: "Siemens", series: "sinamics-g120", hwType: "OTHER_DEVICE", category: "Industrial" },
  { label: "Siemens SINAUT ST7", manufacturer: "Siemens", series: "sinaut-st7", hwType: "OTHER_DEVICE", category: "Industrial" },
  { label: "Siemens RUGGEDCOM", manufacturer: "Siemens", series: "ruggedcom", hwType: "NETWORK_DEVICE", category: "Industrial" },
  { label: "Siemens SITOP PSU", manufacturer: "Siemens", series: "sitop", hwType: "OTHER_DEVICE", category: "Industrial" },

  // ─── Other Industrial ──────────────────────────────────────────────────
  { label: "Schneider Modicon M340", manufacturer: "Schneider Electric", series: "modicon-m340", hwType: "PLC", category: "Industrial" },
  { label: "Schneider Modicon M580", manufacturer: "Schneider Electric", series: "modicon-m580", hwType: "PLC", category: "Industrial" },
  { label: "Schneider Modicon M221", manufacturer: "Schneider Electric", series: "modicon-m221", hwType: "PLC", category: "Industrial" },
  { label: "Schneider APC UPS", manufacturer: "Schneider Electric", series: "apc", hwType: "OTHER_DEVICE", category: "Industrial" },
  { label: "Rockwell Allen-Bradley CompactLogix", manufacturer: "Rockwell Automation", series: "compactlogix", hwType: "PLC", category: "Industrial" },
  { label: "Rockwell Allen-Bradley ControlLogix", manufacturer: "Rockwell Automation", series: "controllogix", hwType: "PLC", category: "Industrial" },
  { label: "ABB AC500 PLC", manufacturer: "ABB", series: "ac500", hwType: "PLC", category: "Industrial" },
  { label: "ABB Freelance DCS", manufacturer: "ABB", series: "freelance", hwType: "OTHER_DEVICE", category: "Industrial" },
  { label: "Yokogawa CENTUM VP", manufacturer: "Yokogawa", series: "centum-vp", hwType: "OTHER_DEVICE", category: "Industrial" },
  { label: "Yokogawa ProSafe-RS", manufacturer: "Yokogawa", series: "prosafe-rs", hwType: "OTHER_DEVICE", category: "Industrial" },
  { label: "Honeywell Experion PKS", manufacturer: "Honeywell", series: "experion", hwType: "OTHER_DEVICE", category: "Industrial" },
  { label: "Honeywell C300 Controller", manufacturer: "Honeywell", series: "c300", hwType: "PLC", category: "Industrial" },
  { label: "Moxa NPort 5110", manufacturer: "Moxa", series: "nport-5110", hwType: "OTHER_DEVICE", category: "Industrial" },
  { label: "Moxa NPort 5150", manufacturer: "Moxa", series: "nport-5150", hwType: "OTHER_DEVICE", category: "Industrial" },
  { label: "Moxa EDS-408A", manufacturer: "Moxa", series: "eds-408a", hwType: "NETWORK_DEVICE", category: "Industrial" },
  { label: "Moxa EDS-508A", manufacturer: "Moxa", series: "eds-508a", hwType: "NETWORK_DEVICE", category: "Industrial" },
  { label: "Moxa AWK-3131A", manufacturer: "Moxa", series: "awk-3131a", hwType: "NETWORK_DEVICE", category: "Industrial" },
  { label: "Emerson DeltaV", manufacturer: "Emerson", series: "deltav", hwType: "OTHER_DEVICE", category: "Industrial" },
  { label: "Beckhoff CX Series", manufacturer: "Beckhoff", series: "cx", hwType: "PLC", category: "Industrial" },

  // ─── Maritime ──────────────────────────────────────────────────────────
  { label: "Furuno FMD-3200 ECDIS", manufacturer: "Furuno", series: "fmd-3200", hwType: "OTHER_DEVICE", category: "Maritime" },
  { label: "Furuno FMD-3300 ECDIS", manufacturer: "Furuno", series: "fmd-3300", hwType: "OTHER_DEVICE", category: "Maritime" },
  { label: "Furuno FAR-2xx8 Radar", manufacturer: "Furuno", series: "far-2", hwType: "OTHER_DEVICE", category: "Maritime" },
  { label: "Furuno GP-170 GPS", manufacturer: "Furuno", series: "gp-170", hwType: "OTHER_DEVICE", category: "Maritime" },
  { label: "Furuno NX-700B Navtex", manufacturer: "Furuno", series: "nx-700b", hwType: "OTHER_DEVICE", category: "Maritime" },
  { label: "JRC JAN-9201 ECDIS", manufacturer: "JRC", series: "jan-9201", hwType: "OTHER_DEVICE", category: "Maritime" },
  { label: "JRC JMA-9100 Radar", manufacturer: "JRC", series: "jma-9100", hwType: "OTHER_DEVICE", category: "Maritime" },
  { label: "Kongsberg K-Bridge ECDIS", manufacturer: "Kongsberg", series: "k-bridge", hwType: "OTHER_DEVICE", category: "Maritime" },
  { label: "Kongsberg DP System", manufacturer: "Kongsberg", series: "dp", hwType: "OTHER_DEVICE", category: "Maritime" },
  { label: "Wärtsilä Nacos ECDIS", manufacturer: "Wärtsilä", series: "nacos", hwType: "OTHER_DEVICE", category: "Maritime" },
  { label: "Danelec DM100 VDR", manufacturer: "Danelec", series: "dm100", hwType: "OTHER_DEVICE", category: "Maritime" },
  { label: "Sailor 6000 GMDSS", manufacturer: "Cobham SATCOM", series: "sailor-6000", hwType: "OTHER_DEVICE", category: "Maritime" },
  { label: "Sailor 900 VSAT", manufacturer: "Cobham SATCOM", series: "sailor-900", hwType: "OTHER_DEVICE", category: "Maritime" },
  { label: "Intellian v100 VSAT", manufacturer: "Intellian", series: "v100", hwType: "OTHER_DEVICE", category: "Maritime" },
  { label: "Intellian v240M VSAT", manufacturer: "Intellian", series: "v240m", hwType: "OTHER_DEVICE", category: "Maritime" },
  { label: "SAAB R5 AIS Transponder", manufacturer: "SAAB", series: "r5", hwType: "OTHER_DEVICE", category: "Maritime" },
  { label: "Sperry Marine VisionMaster", manufacturer: "Sperry Marine", series: "visionmaster", hwType: "OTHER_DEVICE", category: "Maritime" },
  { label: "Transas Navi-Sailor ECDIS", manufacturer: "Transas", series: "navi-sailor", hwType: "OTHER_DEVICE", category: "Maritime" },
  { label: "FLIR M-Series Thermal Camera", manufacturer: "FLIR", series: "m-series", hwType: "OTHER_DEVICE", category: "Maritime" },

  // ─── VoIP / Communication ─────────────────────────────────────────────
  { label: "Cisco IP Phone 8845", manufacturer: "Cisco", series: "ip-phone-8845", hwType: "OTHER_DEVICE", category: "VoIP" },
  { label: "Cisco IP Phone 7841", manufacturer: "Cisco", series: "ip-phone-7841", hwType: "OTHER_DEVICE", category: "VoIP" },
  { label: "Avaya J179 IP Phone", manufacturer: "Avaya", series: "j179", hwType: "OTHER_DEVICE", category: "VoIP" },
  { label: "Avaya J169 IP Phone", manufacturer: "Avaya", series: "j169", hwType: "OTHER_DEVICE", category: "VoIP" },
  { label: "Yealink T54W", manufacturer: "Yealink", series: "t54w", hwType: "OTHER_DEVICE", category: "VoIP" },
  { label: "Yealink T46U", manufacturer: "Yealink", series: "t46u", hwType: "OTHER_DEVICE", category: "VoIP" },
  { label: "Grandstream GXP2170", manufacturer: "Grandstream", series: "gxp2170", hwType: "OTHER_DEVICE", category: "VoIP" },
  { label: "Grandstream UCM6302", manufacturer: "Grandstream", series: "ucm6302", hwType: "SERVER", category: "VoIP" },
  { label: "Polycom VVX 450", manufacturer: "Polycom", series: "vvx-450", hwType: "OTHER_DEVICE", category: "VoIP" },
  { label: "Mitel 6930 IP Phone", manufacturer: "Mitel", series: "6930", hwType: "OTHER_DEVICE", category: "VoIP" },
  { label: "HANSHIN HXV PABX", manufacturer: "HANSHIN", series: "hxv", hwType: "SERVER", category: "VoIP" },
  { label: "HANSHIN HIF IP Phone", manufacturer: "HANSHIN", series: "hif", hwType: "OTHER_DEVICE", category: "VoIP" },
  { label: "HANSHIN HIW IP Phone", manufacturer: "HANSHIN", series: "hiw", hwType: "OTHER_DEVICE", category: "VoIP" },
  { label: "SEANET PABX", manufacturer: "SEANET", series: "seanet", hwType: "SERVER", category: "VoIP" },

  // ─── PC / Workstation ──────────────────────────────────────────────────
  { label: "Dell OptiPlex 7090", manufacturer: "Dell", series: "optiplex-7090", hwType: "PC", category: "PC" },
  { label: "Dell OptiPlex 5090", manufacturer: "Dell", series: "optiplex-5090", hwType: "PC", category: "PC" },
  { label: "Dell Latitude 5530", manufacturer: "Dell", series: "latitude-5530", hwType: "PC", category: "PC" },
  { label: "Dell Precision 3660", manufacturer: "Dell", series: "precision-3660", hwType: "PC", category: "PC" },
  { label: "HP EliteDesk 800 G9", manufacturer: "HP", series: "elitedesk-800", hwType: "PC", category: "PC" },
  { label: "HP EliteBook 840 G9", manufacturer: "HP", series: "elitebook-840", hwType: "PC", category: "PC" },
  { label: "HP ProDesk 400 G9", manufacturer: "HP", series: "prodesk-400", hwType: "PC", category: "PC" },
  { label: "Lenovo ThinkCentre M70q", manufacturer: "Lenovo", series: "thinkcentre-m70q", hwType: "PC", category: "PC" },
  { label: "Lenovo ThinkPad T14", manufacturer: "Lenovo", series: "thinkpad-t14", hwType: "PC", category: "PC" },

  // ─── KVM / Peripheral ─────────────────────────────────────────────────
  { label: "ATEN CL5708N KVM", manufacturer: "ATEN", series: "cl5708", hwType: "OTHER_DEVICE", category: "Peripheral" },
  { label: "ATEN CL5800N KVM", manufacturer: "ATEN", series: "cl5800", hwType: "OTHER_DEVICE", category: "Peripheral" },
  { label: "ATEN CS1768 KVM", manufacturer: "ATEN", series: "cs1768", hwType: "OTHER_DEVICE", category: "Peripheral" },
  { label: "Raritan Dominion KX III", manufacturer: "Raritan", series: "dominion-kx3", hwType: "OTHER_DEVICE", category: "Peripheral" },
  { label: "APC Smart-UPS", manufacturer: "APC", series: "smart-ups", hwType: "OTHER_DEVICE", category: "Peripheral" },
  { label: "Eaton UPS", manufacturer: "Eaton", series: "eaton-ups", hwType: "OTHER_DEVICE", category: "Peripheral" },

  // ─── Sensor / IoT ─────────────────────────────────────────────────────
  { label: "Advantech ADAM-6000", manufacturer: "Advantech", series: "adam-6000", hwType: "SENSOR", category: "Sensor" },
  { label: "Advantech WISE-4000", manufacturer: "Advantech", series: "wise-4000", hwType: "SENSOR", category: "Sensor" },
  { label: "Kontron KBox", manufacturer: "Kontron", series: "kbox", hwType: "PC", category: "Industrial PC" },
  { label: "Kontron KISS", manufacturer: "Kontron", series: "kiss", hwType: "PC", category: "Industrial PC" },
  { label: "Beckhoff CX5130", manufacturer: "Beckhoff", series: "cx5130", hwType: "PLC", category: "Industrial PC" },
];

export function searchKnownHardware(query: string, hwType?: string): KnownHardware[] {
  const q = query.toLowerCase();
  return KNOWN_HARDWARE.filter(p => {
    if (hwType && p.hwType !== hwType) return false;
    return p.label.toLowerCase().includes(q) || p.manufacturer.toLowerCase().includes(q) || p.series.includes(q) || p.category.toLowerCase().includes(q);
  });
}
