/**
 * Template-based generator for documents that are primarily policy/procedure text
 * with some project data sections (VUL, INC, ACC, CHG, TRN, MON, BAK, PHY, SUP).
 */
import type { Document, Paragraph, Table } from "docx";
import type { DocumentData } from "./index";
// E27_SC_CHECKS used indirectly via assessment data
import {
  buildCoverPage,
  heading1,
  heading2,
  bodyText,
  bulletItem,
  buildTable,
  resultLabel,
  wrapDocument,
} from "./shared";

// ─── Template content by focus area ─────────────────────────────────────────

interface TemplateSection {
  title: string;
  body: string;
  bullets?: string[];
}

// Helper: count assessment results by type
function countResults(assessments: DocumentData["assessments"]) {
  const pass = assessments.filter((a) => a.result === "PASS").length;
  const fail = assessments.filter((a) => a.result === "FAIL").length;
  const partial = assessments.filter((a) => a.result === "PARTIAL").length;
  const na = assessments.filter((a) => a.result === "NOT_APPLICABLE").length;
  const total = assessments.length;
  return { pass, fail, partial, na, total };
}

// Helper: group hardware by zone
function groupByZone(hardware: DocumentData["hardware"]): Map<string, DocumentData["hardware"]> {
  const zones = new Map<string, DocumentData["hardware"]>();
  for (const hw of hardware) {
    const zone = hw.zone || "Unassigned";
    if (!zones.has(zone)) zones.set(zone, []);
    zones.get(zone)!.push(hw);
  }
  return zones;
}

function getSections(focus: string, data: DocumentData): TemplateSection[] {
  const { project, hardware, software, assessments } = data;
  const counts = countResults(assessments);
  const zones = groupByZone(hardware);
  const today = new Date().toISOString().slice(0, 10);

  switch (focus) {
    case "vulnerability":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document identifies and assesses cybersecurity vulnerabilities in the Computer Based System (CBS) of vessel "${project.vesselName}" in accordance with IACS UR E27 requirements. The scope covers all ${hardware.length} hardware and ${software.length} software assets registered in the CBS inventory.`,
        },
        {
          title: "2. Regulatory Reference",
          body: "This assessment is performed in accordance with:",
          bullets: [
            "IACS UR E27 — Cyber resilience of on-board systems and equipment",
            "IACS UR E26 — Cyber resilience of ships",
            `${project.classification || "Classification Society"} — Applicable cyber security rules and guidelines`,
          ],
        },
        {
          title: "3. CBS Overview",
          body: `The CBS comprises ${hardware.length} hardware assets across ${zones.size} security zone(s) and ${software.length} software components. The following zones are defined: ${[...zones.keys()].join(", ")}.`,
        },
        {
          title: "4. Vulnerability Identification Methods",
          body: "The following methods were used to identify vulnerabilities:",
          bullets: [
            "Automated CVE matching against the National Vulnerability Database (NVD) for all registered software components (CPE-based)",
            "Security configuration assessment (SC-1 through SC-13) for each hardware asset",
            "Manual review of software versions against known vulnerability advisories",
            "Analysis of network exposure and communication protocol security",
          ],
        },
        {
          title: "5. CVE Matching Results",
          body: `${software.length} software component(s) were evaluated for known CVEs. Software with registered CPE identifiers are automatically matched against the NVD database. Components without CPE require manual vulnerability review.`,
        },
        {
          title: "6. Security Configuration Assessment Summary",
          body: `A total of ${counts.total} security checks were performed across ${hardware.length} hardware assets. Results: ${counts.pass} PASS, ${counts.fail} FAIL, ${counts.partial} PARTIAL, ${counts.na} N/A.`,
        },
        {
          title: "7. Failed and Partial Assessment Items",
          body: `The following ${counts.fail + counts.partial} item(s) require remediation:`,
          bullets: assessments
            .filter((a) => a.result === "FAIL" || a.result === "PARTIAL")
            .map((a) => `${a.hardware.name} [${a.hardware.type}] — ${a.checkId}: ${resultLabel(a.result)}${a.note ? ` — ${a.note}` : ""}${a.evidence ? ` (Evidence: ${a.evidence})` : ""}`),
        },
        {
          title: "8. Risk Assessment",
          body: "Each identified vulnerability is assessed for risk based on likelihood and potential impact to vessel safety, operations, and data confidentiality. Critical and high-risk vulnerabilities must be addressed before submission to the classification society.",
        },
        {
          title: "9. Remediation Plan",
          body: "All identified vulnerabilities shall be tracked to resolution. The remediation plan must include:",
          bullets: [
            "Specific corrective actions for each vulnerability",
            "Responsible party and target completion date",
            "Verification method to confirm remediation effectiveness",
            "Re-assessment schedule for recurring checks",
          ],
        },
        {
          title: "10. Document Revision History",
          body: "(This section records changes to this document.)",
        },
      ];

    case "incident":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document establishes the Cybersecurity Incident Response Plan (CIRP) for the Computer Based System (CBS) aboard vessel "${project.vesselName}". It defines procedures for detecting, responding to, containing, and recovering from cybersecurity incidents affecting the CBS in accordance with IACS UR E27.`,
        },
        {
          title: "2. Regulatory Reference",
          body: "This plan is developed in compliance with:",
          bullets: [
            "IACS UR E27 — Section on incident response capabilities",
            "IACS UR E26 — Shipboard incident handling requirements",
            "IMO MSC-FAL.1/Circ.3 — Guidelines on maritime cyber risk management",
            `${project.classification || "Classification Society"} cyber security rules`,
          ],
        },
        {
          title: "3. CBS Assets in Scope",
          body: `This plan covers ${hardware.length} hardware and ${software.length} software components across ${zones.size} security zone(s): ${[...zones.keys()].join(", ")}. Any incident affecting these assets falls within the scope of this plan.`,
        },
        {
          title: "4. Incident Classification",
          body: "Incidents are classified by severity to determine the appropriate response level:",
          bullets: [
            "CRITICAL — Complete CBS compromise, direct impact on vessel safety systems (navigation, propulsion, safety), requires immediate Master notification",
            "HIGH — Major system disruption affecting operational capability, potential safety impact, requires SSO notification within 1 hour",
            "MEDIUM — Limited system disruption, no direct safety impact, containable within existing procedures",
            "LOW — Minor anomaly or suspicious activity, informational, logged for trend analysis",
          ],
        },
        {
          title: "5. Detection and Reporting",
          body: "Incidents may be detected through the following channels:",
          bullets: [
            "Automated monitoring: System alerts, intrusion detection, audit log anomalies (SC-7 compliance)",
            "Personnel observation: Unusual system behavior reported by operators",
            "External notification: Vendor advisories, CERT alerts, classification society notices",
            "Routine review: Periodic log analysis and system health checks",
          ],
        },
        {
          title: "6. Response Procedures",
          body: "Upon confirmation of a cybersecurity incident, execute the following steps in order:",
          bullets: [
            "Step 1: IDENTIFY — Confirm the incident, determine affected systems and scope",
            "Step 2: CONTAIN — Isolate affected systems from the CBS network to prevent spread",
            "Step 3: NOTIFY — Alert the Ship Security Officer (SSO), Master, and relevant authorities per severity",
            "Step 4: DOCUMENT — Record all incident details, timestamps, actions taken, and decisions",
            "Step 5: ERADICATE — Remove the threat, patch vulnerabilities, change compromised credentials",
            "Step 6: RECOVER — Restore systems from verified backups, validate system integrity",
            "Step 7: REVIEW — Conduct post-incident analysis, update procedures, brief crew",
          ],
        },
        {
          title: "7. Communication Protocol",
          body: "Incident communications follow this chain:",
          bullets: [
            "Internal: Duty Officer → Ship Security Officer → Master → Company Security Officer",
            `External: SSO → ${project.classification || "Classification Society"} → Flag State (if required)`,
            `Ship Owner: ${project.shipowner || "(To be specified)"}`,
            "All external communications must be authorized by the Master or CSO",
          ],
        },
        {
          title: "8. Recovery and Continuity",
          body: "Recovery procedures shall ensure:",
          bullets: [
            "System restoration from verified, uncompromised backups",
            "Integrity verification of all restored systems before returning to service",
            "Enhanced monitoring for a minimum of 72 hours post-recovery",
            "Documentation of recovery steps and timeline",
          ],
        },
        {
          title: "9. Training and Exercises",
          body: "Incident response capability shall be maintained through:",
          bullets: [
            "Annual tabletop exercise covering CRITICAL scenario",
            "Semi-annual review of this plan with all responsible personnel",
            "Immediate plan update following any actual incident",
          ],
        },
        {
          title: "10. Contact List",
          body: `Classification Society: ${project.classification || "[To be specified]"}\nShip Owner: ${project.shipowner || "[To be specified]"}\nVessel: ${project.vesselName}\nSystem: ${project.systemName || "[To be specified]"}\n\n(Complete emergency contact details including phone numbers and email addresses for all roles listed above.)`,
        },
      ];

    case "access":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document defines the access control policy and procedures for the Computer Based System (CBS) of vessel "${project.vesselName}" in accordance with IACS UR E27 requirements for user authentication and authorization (SC-1, SC-2, SC-3).`,
        },
        {
          title: "2. Regulatory Reference",
          body: "Access control requirements are based on:",
          bullets: [
            "IACS UR E27 — SC-1 (Password Policy), SC-2 (Account Management), SC-3 (Network Access Control)",
            "IACS UR E26 — Access management requirements for ship systems",
            `${project.classification || "Classification Society"} specific requirements`,
          ],
        },
        {
          title: "3. User Roles and Privileges",
          body: "The following roles are defined for CBS access. Each user must be assigned exactly one role:",
          bullets: [
            "Administrator — Full system access including configuration changes, user management, and system updates. Limited to designated IT/OT personnel.",
            "Operator — Operational functions, monitoring dashboards, alarm acknowledgment. Assigned to bridge and engine room watch officers.",
            "Service Technician — Temporary maintenance access with time-limited credentials. Requires escort or supervision per physical security policy.",
            "Auditor — Read-only access for compliance verification and log review. Assigned to classification society surveyors and internal auditors.",
          ],
        },
        {
          title: "4. Password Policy (SC-1)",
          body: `All CBS components must enforce the following password requirements. SC-1 compliance status for ${hardware.length} hardware asset(s) is shown in the assessment table below.`,
          bullets: [
            "Minimum password length: 8 characters (12 recommended for admin accounts)",
            "Complexity: uppercase + lowercase + number + special character",
            "Maximum age: 90 days for admin, 180 days for operator accounts",
            "Account lockout: After 5 consecutive failed attempts, lock for 15 minutes",
            "No password reuse for last 5 passwords",
            "Default passwords must be changed before commissioning",
          ],
        },
        {
          title: "5. Account Management (SC-2)",
          body: "Account management procedures:",
          bullets: [
            "All user accounts shall be individually assigned — shared accounts are prohibited in operational use",
            "Guest/anonymous access is disabled on all CBS components",
            "Service accounts for automated processes must use non-interactive authentication",
            "Account creation requires authorization from the vessel's designated security officer",
            "Departing personnel must have accounts disabled within 24 hours",
            "Quarterly review of all active accounts to identify and remove orphaned credentials",
          ],
        },
        {
          title: "6. Network Access Control (SC-3)",
          body: `Network access is controlled across ${zones.size} security zone(s): ${[...zones.keys()].join(", ")}.`,
          bullets: [
            "Inter-zone communication is restricted to explicitly permitted connections",
            "Remote access requires multi-factor authentication when technically feasible",
            "Unused network ports must be disabled or physically secured",
            "Wireless access points must use WPA3 or equivalent encryption",
          ],
        },
        {
          title: "7. Access Control Assessment Results",
          body: "The following table summarizes SC-1 and SC-2 assessment results for each hardware asset:",
        },
        {
          title: "8. Document Revision History",
          body: "(This section records changes to this document.)",
        },
      ];

    case "change":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document establishes change management procedures for the Computer Based System (CBS) of vessel "${project.vesselName}" in accordance with IACS UR E27. All modifications to CBS hardware, software, or configuration must follow these procedures.`,
        },
        {
          title: "2. Regulatory Reference",
          body: "Change management requirements are based on:",
          bullets: [
            "IACS UR E27 — Configuration management and change control",
            "IACS UR E26 — Ship lifecycle change management",
            `${project.classification || "Classification Society"} type approval and change notification requirements`,
          ],
        },
        {
          title: "3. Current CBS Scope",
          body: `The CBS currently comprises ${hardware.length} hardware assets and ${software.length} software components across ${zones.size} security zone(s). Any changes to this inventory require formal change management approval and may trigger re-assessment of security configuration (SC-1 through SC-13).`,
        },
        {
          title: "4. Change Categories",
          body: "Changes are categorized by type and impact level:",
          bullets: [
            "Hardware Change — Addition, removal, replacement, or relocation of CBS hardware. Requires classification society notification if type-approved equipment is affected.",
            "Software Change — Installation, update, removal, or version change of software including OS patches, firmware, and applications.",
            "Configuration Change — Modification of system settings, parameters, firewall rules, or access policies.",
            "Network Change — Modification of network topology, new connections, zone boundary changes, or protocol changes.",
          ],
        },
        {
          title: "5. Change Approval Workflow",
          body: "All changes must follow the formal approval process:",
          bullets: [
            "1. REQUEST — Initiator submits change request with description, justification, and risk assessment",
            "2. REVIEW — Security officer evaluates cybersecurity impact and approves/rejects",
            "3. PLAN — Develop implementation plan including rollback procedures",
            "4. TEST — Verify change in isolated environment when possible",
            "5. APPROVE — Final authorization from designated approver",
            "6. IMPLEMENT — Execute change per approved plan with documentation",
            "7. VERIFY — Confirm change is functioning correctly, run relevant SC checks",
            "8. CLOSE — Update CBS inventory, document results, close change record",
          ],
        },
        {
          title: "6. Emergency Changes",
          body: "Emergency changes (critical patches, safety-related fixes) may bypass normal approval but must be retrospectively documented within 48 hours and reviewed at the next scheduled change review meeting.",
        },
        {
          title: "7. Change Log",
          body: "(Record all changes below. Each entry should include date, description, affected assets, approver, and verification result.)",
        },
      ];

    case "training":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document records cybersecurity training requirements and completion records for personnel operating the CBS of vessel "${project.vesselName}" in accordance with IACS UR E27 and E26 training requirements.`,
        },
        {
          title: "2. Regulatory Reference",
          body: "Training requirements are based on:",
          bullets: [
            "IACS UR E27 — Personnel competence and awareness",
            "IACS UR E26 — Crew training and awareness requirements",
            "IMO MSC-FAL.1/Circ.3 — Guidelines on maritime cyber risk management",
          ],
        },
        {
          title: "3. Training Program",
          body: "The cybersecurity training program is structured by role and frequency:",
          bullets: [
            "All CBS users: Cybersecurity awareness training (annual, mandatory)",
            "Operators: CBS-specific operational procedures and monitoring (initial + annual refresh)",
            "Administrators: Advanced system administration, patch management, backup/recovery (initial + annual)",
            "All CBS users: Incident response procedures including reporting chain (annual)",
            "All CBS users: Access control policy including password management (initial + after policy changes)",
            "Service technicians: Vendor-specific equipment training as required",
          ],
        },
        {
          title: "4. Training Topics",
          body: "Core training modules cover the following subjects:",
          bullets: [
            "Module 1: Cybersecurity fundamentals and maritime-specific threats",
            "Module 2: CBS architecture overview and security zones",
            "Module 3: Password policy and account management (SC-1, SC-2)",
            "Module 4: Recognizing and reporting suspicious activity",
            "Module 5: Incident response procedures and communication chain",
            "Module 6: Physical security awareness for CBS equipment",
            "Module 7: Removable media and USB device policy",
            "Module 8: Social engineering awareness",
          ],
        },
        {
          title: "5. CBS-Specific Training",
          body: `Personnel must be familiar with the ${hardware.length} hardware assets and ${software.length} software components in the CBS inventory. Training should cover the specific systems in their operational area.`,
        },
        {
          title: "6. Training Record",
          body: "(Complete the table below for each training session. Retain records for a minimum of 5 years.)",
        },
      ];

    case "monitoring":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document defines the monitoring and logging strategy for the Computer Based System (CBS) of vessel "${project.vesselName}" in accordance with IACS UR E27 SC-7 (Audit Logging) requirements.`,
        },
        {
          title: "2. Regulatory Reference",
          body: "Monitoring requirements are based on:",
          bullets: [
            "IACS UR E27 — SC-7 (Audit Logging) requirements",
            "IACS UR E26 — System monitoring and anomaly detection",
            `${project.classification || "Classification Society"} logging requirements`,
          ],
        },
        {
          title: "3. SC-7 Compliance Status",
          body: `SC-7 (Audit Logging) assessment results for ${hardware.length} hardware asset(s) are shown in the table below.`,
        },
        {
          title: "4. Log Sources",
          body: `The following ${hardware.length} CBS assets generate security-relevant logs:`,
        },
        {
          title: "5. Events to be Logged",
          body: "The following event types shall be captured by all CBS assets where technically feasible:",
          bullets: [
            "Authentication events — Successful/failed login, logout, password changes, account lockout",
            "Authorization events — Access grants, denials, privilege escalation",
            "Configuration changes — Parameter modifications, firmware updates, policy changes",
            "System events — Startup, shutdown, service start/stop, errors, warnings",
            "Network events — Connection establishment, firewall blocks, port scans",
            "Security events — Malware detection, intrusion alerts, audit log tampering attempts",
          ],
        },
        {
          title: "6. Log Format and Content",
          body: "Each log entry shall contain at minimum:",
          bullets: [
            "Timestamp (UTC, synchronized via NTP where available)",
            "Source system identifier (hostname or IP)",
            "Event type and severity",
            "User identity (where applicable)",
            "Action performed and result (success/failure)",
            "Source and destination addresses for network events",
          ],
        },
        {
          title: "7. Log Retention and Protection",
          body: "Log management requirements:",
          bullets: [
            "Minimum retention period: 90 days onboard, 1 year in shore-based archive",
            "Logs shall be stored in tamper-evident format where technically feasible",
            "Log storage shall be monitored for capacity — alert at 80% utilization",
            "Log files shall not be modifiable by the users whose activities they record",
            "Backup copies of logs shall be included in the regular backup schedule",
          ],
        },
        {
          title: "8. Monitoring and Review",
          body: "Log review procedures:",
          bullets: [
            "Automated alerting for CRITICAL and HIGH severity events",
            "Daily review of authentication failure summaries",
            "Weekly review of configuration change logs",
            "Monthly comprehensive log analysis and trend report",
          ],
        },
      ];

    case "backup":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document establishes the backup and recovery plan for the Computer Based System (CBS) of vessel "${project.vesselName}". It covers all ${hardware.length} hardware and ${software.length} software assets in the CBS inventory.`,
        },
        {
          title: "2. Regulatory Reference",
          body: "Backup and recovery requirements are based on:",
          bullets: [
            "IACS UR E27 — System resilience and recovery capability",
            "IACS UR E26 — Business continuity for ship systems",
            `${project.classification || "Classification Society"} requirements`,
          ],
        },
        {
          title: "3. Backup Strategy",
          body: "The backup strategy covers three categories:",
          bullets: [
            "System images: Complete OS and application snapshots for each CBS asset",
            "Configuration data: System parameters, network settings, firewall rules, user accounts",
            "Operational data: Security logs, assessment records, change history",
          ],
        },
        {
          title: "4. Backup Schedule",
          body: "The following backup schedule shall be maintained for all CBS assets:",
          bullets: [
            "Full system image — Before initial commissioning, before/after major updates, minimum annually",
            "Configuration backup — After every approved configuration change, minimum monthly",
            "Software/firmware backup — Before and after every software update or patch",
            "Security log archive — Weekly transfer to long-term storage",
            "CBS inventory data — After every change to hardware or software inventory",
          ],
        },
        {
          title: "5. Backup Media and Storage",
          body: "Backup storage requirements:",
          bullets: [
            "Primary: Onboard dedicated storage device, physically secured",
            "Secondary: Shore-based backup (when connectivity permits)",
            "Media rotation: Maintain minimum 3 generations of full backups",
            "Storage media shall be tested annually for integrity",
            "Backup media shall be stored separately from the systems they protect",
          ],
        },
        {
          title: "6. Recovery Objectives",
          body: "The following recovery objectives apply to CBS assets:",
          bullets: [
            "Recovery Time Objective (RTO): [To be defined per asset criticality]",
            "Recovery Point Objective (RPO): [To be defined per asset criticality]",
            "Critical safety systems (navigation, propulsion control): RTO < 4 hours recommended",
            "Operational systems: RTO < 24 hours recommended",
          ],
        },
        {
          title: "7. Recovery Procedures",
          body: "Recovery shall follow these steps:",
          bullets: [
            "1. Identify affected system(s) and select appropriate backup",
            "2. Verify backup integrity before restoration",
            "3. Restore system to known-good state",
            "4. Verify system functionality and network connectivity",
            "5. Re-run relevant security checks (SC-1 through SC-13 as applicable)",
            "6. Document the recovery event including root cause and timeline",
          ],
        },
        {
          title: "8. Backup Verification",
          body: "Backup integrity shall be verified through:",
          bullets: [
            "Checksum verification after each backup creation",
            "Semi-annual test restoration of at least one critical system",
            "Annual review and update of recovery procedures",
          ],
        },
      ];

    case "physical":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document defines the physical security measures for CBS equipment on vessel "${project.vesselName}". It covers physical access controls, environmental protection, and tamper detection for ${hardware.length} hardware assets across ${zones.size} security zone(s).`,
        },
        {
          title: "2. Regulatory Reference",
          body: "Physical security requirements are based on:",
          bullets: [
            "IACS UR E27 — Physical security of CBS equipment",
            "IACS UR E26 — Ship physical security requirements",
            "ISPS Code — Ship Security Plan physical access provisions",
          ],
        },
        {
          title: "3. Equipment Locations",
          body: `CBS hardware assets are distributed across the following locations and zones. Each location has specific physical access requirements:`,
        },
        {
          title: "4. Physical Access Controls by Area",
          body: "Access to CBS equipment areas shall be controlled as follows:",
          bullets: [
            "Bridge — Supervised access during operations. CBS equipment in locked cabinets. Key control by OOW.",
            "Engine Control Room — Restricted to authorized engineering personnel. CBS equipment in dedicated rack with key lock.",
            "Server/Network Room — Locked room, key-card access where available, entry logged. Access limited to IT/OT administrators.",
            "Network Distribution Points — Locked cabinets with tamper-evident seals. Inspection during routine rounds.",
            "Cargo Control Room — Restricted access during cargo operations. CBS equipment secured in locked enclosure.",
          ],
        },
        {
          title: "5. Tamper Detection",
          body: "The following tamper detection measures shall be applied:",
          bullets: [
            "Tamper-evident seals on network cabinets and distribution panels",
            "Serial number verification of CBS hardware during quarterly inspections",
            "Visual inspection of cable connections and port status during routine rounds",
            "Logging of physical access to secured CBS areas where electronic access control is installed",
          ],
        },
        {
          title: "6. Environmental Controls",
          body: "CBS equipment areas shall maintain appropriate environmental conditions:",
          bullets: [
            "Temperature and humidity within manufacturer specifications",
            "Adequate ventilation for equipment cooling",
            "Protection from water ingress, vibration, and electromagnetic interference",
            "UPS or equivalent power protection for critical CBS assets",
          ],
        },
        {
          title: "7. Removable Media Policy",
          body: "Physical media controls:",
          bullets: [
            "USB ports on CBS equipment shall be disabled unless specifically required and approved",
            "Removable media (USB drives, portable drives) must be scanned before connection to CBS",
            "Use of personal devices prohibited on CBS networks",
            "Approved removable media shall be registered and tracked",
          ],
        },
      ];

    case "supply":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document defines supply chain security requirements for CBS components of vessel "${project.vesselName}". It covers vendor management, procurement security, and component integrity verification for all ${hardware.length} hardware and ${software.length} software assets.`,
        },
        {
          title: "2. Regulatory Reference",
          body: "Supply chain security requirements are based on:",
          bullets: [
            "IACS UR E27 — Supply chain security for CBS components",
            "IACS UR E26 — Ship equipment supply chain requirements",
            `${project.classification || "Classification Society"} type approval requirements`,
          ],
        },
        {
          title: "3. Vendor Registry",
          body: "The following vendors supply CBS hardware and software components. Each vendor shall be assessed for cybersecurity practices:",
        },
        {
          title: "4. Procurement Security Requirements",
          body: "All CBS components shall be procured through verified supply chains with the following requirements:",
          bullets: [
            "Vendor identity verification — Confirm vendor is the genuine manufacturer or authorized distributor",
            "Component authenticity — Verify serial numbers, certificates of conformity, and type approval marks",
            "Software integrity — Validate software packages via checksums, digital signatures, or hash verification",
            "Chain of custody — Maintain documentation of component handling from manufacturer to installation",
            "Security assessment — Review vendor's cybersecurity practices and incident history before procurement",
            "Contractual requirements — Include cybersecurity obligations in vendor contracts (patch support, vulnerability disclosure)",
          ],
        },
        {
          title: "5. Software Update Supply Chain",
          body: "Software updates and patches shall follow secure delivery practices:",
          bullets: [
            "Updates obtained only from verified vendor sources (official websites, secure repositories)",
            "All updates verified for integrity before installation (digital signature or checksum)",
            "Update testing in isolated environment before deployment to production CBS",
            "Documentation of all software changes per change management procedures",
          ],
        },
        {
          title: "6. Third-Party Service Provider Security",
          body: "Service providers with CBS access shall comply with:",
          bullets: [
            "Non-disclosure agreement covering CBS system details",
            "Temporary, individually assigned credentials per access control policy",
            "Supervision or escort requirement per physical security policy",
            "Activity logging during service access",
            "Post-service verification of system integrity",
          ],
        },
      ];

    // ─── E27 new required documents ─────────────────────────

    case "sdl":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document describes the Secure Development Lifecycle (SDL) applied to the CBS of vessel "${project.vesselName}" in accordance with IACS UR E27 Section 5 and IEC 62443-4-1. It covers the security practices applied throughout requirement analysis, design, implementation, verification, release, maintenance, and end-of-life.`,
        },
        {
          title: "2. Regulatory Reference",
          body: "This document addresses the following IACS UR E27 requirements:",
          bullets: [
            "E27 5.1 (SM-8) — Private key protection and QA process for code signing",
            "E27 5.2 (SUM-2) — Security update documentation",
            "E27 5.3 (SUM-3) — Dependent component/OS security update compatibility",
            "E27 5.4 (SUM-4) — Availability of security updates with authenticity verification",
            "E27 5.5 (SG-1) — Security defence-in-depth strategy",
            "E27 5.6 (SG-2) — External environment security measures",
            "E27 5.7 (SG-3) — Hardening guidelines for installation and maintenance",
            "IEC 62443-4-1 — Product security development lifecycle requirements",
          ],
        },
        {
          title: "3. Defence-in-Depth Strategy (SG-1)",
          body: `The CBS implements a layered security architecture. Each layer provides independent protection so that compromise of one layer does not immediately compromise the entire system. The CBS comprises ${hardware.length} hardware assets across ${zones.size} zone(s).`,
          bullets: [
            "Network layer — Segmentation via firewalls, VLANs, and zone-based access control",
            "Host layer — OS hardening, least functionality, disabled unnecessary services",
            "Application layer — Input validation, secure coding, authentication enforcement",
            "Data layer — Encryption at rest and in transit, integrity verification",
            "Physical layer — Access controls, tamper detection (ref: Physical Security document)",
          ],
        },
        {
          title: "4. Secure Development Phases",
          body: "Security is integrated into each phase of the development lifecycle:",
          bullets: [
            "Requirement Analysis — Security requirements derived from E27 capabilities and risk assessment",
            "Design — Threat modelling, secure architecture patterns, defence-in-depth",
            "Implementation — Secure coding standards, code review, static analysis",
            "Verification — Security testing, penetration testing, vulnerability scanning",
            "Release — Integrity verification (code signing), secure packaging, release notes with security impact",
            "Maintenance — Patch management, vulnerability monitoring, update distribution",
            "End-of-Life — Secure decommissioning, data sanitization, migration support",
          ],
        },
        {
          title: "5. Security Update Process (SUM-2, SUM-3, SUM-4)",
          body: "Security updates are managed as follows:",
          bullets: [
            "Each update includes: version number, installation instructions, security impact description, verification instructions, risk of non-application",
            "Compatibility with dependent components and OS is documented and verified before release",
            "Updates are made available through authenticated channels with integrity verification (digital signatures)",
            "Critical security updates are flagged and distributed within 72 hours of vulnerability disclosure",
          ],
        },
        {
          title: "6. Code Signing and Key Management (SM-8)",
          body: "Private keys used for code signing are protected through:",
          bullets: [
            "Hardware security modules (HSM) or equivalent secure key storage",
            "Access to signing keys restricted to authorized build/release personnel",
            "QA process ensures all distributed software is signed and verified before release",
            "Key rotation schedule defined and documented",
          ],
        },
        {
          title: "7. External Environment Security Measures (SG-2)",
          body: "The following security measures are expected in the deployment environment:",
          bullets: [
            "Network segmentation per E26 zone architecture",
            "Firewall rules restricting traffic to required protocols only",
            "Physical security of CBS equipment locations",
            "Regular security monitoring and audit log review",
            "Trained personnel for CBS operation and maintenance",
          ],
        },
      ];

    case "maintenance":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document defines the maintenance plan for the CBS of vessel "${project.vesselName}" in accordance with IACS UR E27 Section 3(g). It covers both on-site and remote maintenance procedures, schedules, and responsibilities for ${hardware.length} hardware assets and ${software.length} software components.`,
        },
        {
          title: "2. Regulatory Reference",
          body: "This plan addresses:",
          bullets: [
            "IACS UR E27 Section 3(g) — Maintenance plan requirements",
            "IACS UR E27 Capabilities 27 (System Backup) and 28 (System Recovery)",
            "IACS UR E27 Section 5.2-5.4 — Security update management",
            `${project.classification || "Classification Society"} — Survey and maintenance requirements`,
          ],
        },
        {
          title: "3. Maintenance Types",
          body: "The following maintenance categories apply to CBS assets:",
          bullets: [
            "Preventive — Scheduled maintenance to prevent failures (firmware updates, certificate renewal, log rotation)",
            "Corrective — Unscheduled repairs to restore functionality after failure",
            "Adaptive — Changes to accommodate new requirements or environment changes",
            "Security — Application of security patches, signature updates, vulnerability remediation",
          ],
        },
        {
          title: "4. Maintenance Schedule",
          body: "Periodic maintenance tasks for CBS assets:",
          bullets: [
            "Daily — Log review, system health monitoring, backup verification",
            "Weekly — Security signature update verification, disk space monitoring",
            "Monthly — Configuration backup, user account review, certificate expiry check",
            "Quarterly — Full security assessment review, penetration test (if applicable)",
            "Annually — Full system image backup, hardware inspection, classification society survey preparation",
          ],
        },
        {
          title: "5. On-Site Maintenance Procedures",
          body: "For maintenance performed directly on the vessel:",
          bullets: [
            "Maintenance personnel must be authorized per access control policy",
            "Service technicians require temporary, individually assigned credentials",
            "All maintenance activities logged in the change management system",
            "Post-maintenance verification: re-run relevant security capability checks",
            "Supervision or escort required for external service providers",
          ],
        },
        {
          title: "6. Remote Maintenance Procedures",
          body: "For maintenance performed remotely:",
          bullets: [
            "Remote access enabled only with explicit crew approval (E27 Capability 37)",
            "Multi-factor authentication required for remote access (E27 Capability 32)",
            "Remote sessions monitored and logged (E27 Capability 36)",
            "Automatic session termination after inactivity",
            "Remote access disabled when not in active use",
          ],
        },
        {
          title: "7. Responsible Persons",
          body: "Maintenance responsibilities:",
          bullets: [
            "Equipment Supplier — Firmware updates, security patches, warranty support",
            "Systems Integrator — Network configuration, integration maintenance",
            "Ship Owner/Operator — Routine maintenance, monitoring, crew training",
            "Classification Society — Survey and compliance verification",
          ],
        },
      ];

    case "system-test":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document defines the system test plan for verifying that the CBS of vessel "${project.vesselName}" meets IACS UR E27 security capability requirements. It covers test procedures for all 31 required security capabilities (Table 1) and applicable additional capabilities for untrusted network interfaces (Table 2).`,
        },
        {
          title: "2. Regulatory Reference",
          body: "Testing addresses:",
          bullets: [
            "IACS UR E27 Section 3(i) — System test plan requirements",
            "IACS UR E27 Section 4 — All 41 security capabilities",
            "IEC 62443-3-3 — System security requirements and security levels",
            `${project.classification || "Classification Society"} — Type approval / case-by-case testing requirements`,
          ],
        },
        {
          title: "3. Test Strategy",
          body: "The test plan verifies each E27 security capability through:",
          bullets: [
            "Functional testing — Verify each capability is implemented and operates as specified",
            "Configuration testing — Verify security settings can be configured as required",
            "Negative testing — Verify the system correctly rejects unauthorized access and invalid input",
            "Recovery testing — Verify backup, restore, and recovery procedures function correctly",
            "Integration testing — Verify security capabilities function correctly when the CBS is integrated into the vessel network",
          ],
        },
        {
          title: "4. Test Environment",
          body: `Testing is performed on ${hardware.length} hardware assets across ${zones.size} security zone(s). Tests may be conducted in a factory acceptance test (FAT) environment or onboard during commissioning.`,
        },
        {
          title: "5. Security Capability Test Cases",
          body: "Test cases are organized by E27 capability number:",
          bullets: [
            "Cap. 1-7: Identification & Authentication — User login, account management, password policy, wireless auth, password strength, authenticator feedback",
            "Cap. 8-12: Use Control — Authorization enforcement, wireless use control, portable device control, mobile code, session lock",
            "Cap. 13-16: Audit — Auditable events, storage capacity, processing failures, timestamps",
            "Cap. 17-21: Communication & Data Integrity — Communication integrity, malware protection, security verification, input validation, deterministic output",
            "Cap. 22-23: Confidentiality — Information confidentiality, cryptography use",
            "Cap. 24: Audit Access — Audit log accessibility",
            "Cap. 25-31: Availability — DoS protection, resource management, backup, recovery, emergency power, network config, least functionality",
            "Cap. 32-41: Untrusted Networks (if applicable) — MFA, software/device auth, login lockout, system notification, access control, remote session, crypto integrity, session integrity, session ID invalidation",
          ],
        },
        {
          title: "6. Test Acceptance Criteria",
          body: "Each capability test must achieve one of the following results:",
          bullets: [
            "PASS — Capability fully implemented and functioning as required",
            "PASS with Compensating Countermeasure — Capability met through alternative means (documented and approved)",
            "FAIL — Capability not met, remediation required before certification",
            "NOT APPLICABLE — Capability not relevant to this CBS (justified and documented)",
          ],
        },
        {
          title: "7. Test Reporting",
          body: `Test results are documented in the Security Capability Assessment Report (E27-AUD) and submitted to ${project.classification || "the Classification Society"} for review.`,
        },
      ];

    case "hardening":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document provides hardening guidelines for the installation and maintenance of the CBS of vessel "${project.vesselName}" in accordance with IACS UR E27 Section 5.7 (SG-3). It covers OS hardening, network hardening, application hardening, and ongoing hardening verification for ${hardware.length} hardware assets.`,
        },
        {
          title: "2. Regulatory Reference",
          body: "This document addresses:",
          bullets: [
            "IACS UR E27 Section 5.7 (SG-3) — Hardening guidelines requirement",
            "IACS UR E27 Capability 31 — Least functionality",
            "IACS UR E27 Capability 30 — Network and security configuration settings",
            "IEC 62443-4-2 — Technical security requirements for components",
          ],
        },
        {
          title: "3. Operating System Hardening",
          body: "The following OS-level hardening must be applied to all CBS assets:",
          bullets: [
            "Remove or disable all unnecessary OS components, features, and services",
            "Disable AutoRun/AutoPlay for removable media (SC-5)",
            "Disable unnecessary network protocols (Telnet, FTP, SMBv1) (SC-5)",
            "Apply latest security patches from verified sources (SC-13)",
            "Configure secure boot where supported",
            "Set file system permissions to least privilege",
            "Disable guest accounts and rename default admin accounts (SC-2)",
          ],
        },
        {
          title: "4. Network Hardening",
          body: "Network-level hardening requirements:",
          bullets: [
            "Close all unused network ports",
            "Disable unnecessary network services",
            "Configure host-based firewalls where available",
            "Restrict network access to required IP ranges/VLANs",
            "Disable RDP unless specifically required; enforce NLA and TLS if enabled (SC-6)",
            "Enable network-level authentication for all remote access",
            "Configure SNMP v3 (disable v1/v2 where possible)",
          ],
        },
        {
          title: "5. Application Hardening",
          body: "Application-level hardening:",
          bullets: [
            "Remove or disable all sample, demo, and test applications",
            "Disable debug modes and verbose error messages in production",
            "Configure application-level authentication and authorization",
            "Disable mobile code execution (Java applets, ActiveX) where not required",
            "Configure session timeout and automatic lock (SC-10)",
          ],
        },
        {
          title: "6. Anti-Malware Configuration",
          body: "Malware protection hardening (SC-11):",
          bullets: [
            "Install anti-malware software or configure application whitelisting as alternative",
            "Enable real-time scanning where performance permits",
            "Configure removable media scanning before any file transfer",
            "Establish signature update procedure (manual or automated depending on connectivity)",
            "Configure quarantine procedures for detected threats",
          ],
        },
        {
          title: "7. Audit Logging Configuration",
          body: "Audit log hardening (SC-7):",
          bullets: [
            "Enable logging for: authentication events, configuration changes, system events",
            "Configure NTP time synchronization for log timestamps",
            "Set log retention to minimum 90 days",
            "Protect log files from unauthorized modification",
            "Configure log storage capacity monitoring (alert at 80%)",
          ],
        },
        {
          title: "8. Hardening Verification",
          body: "Hardening status must be verified:",
          bullets: [
            "During initial installation/commissioning — full hardening checklist",
            "After each software update or configuration change — affected items re-verified",
            "During quarterly security reviews — sample verification",
            "During annual classification society survey — full verification",
            "Using the SCS Platform security assessment (SC-1 through SC-13) for automated verification",
          ],
        },
      ];

    // ─── E26 new required documents ──────────────────────────

    case "e26-inventory":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document provides the complete vessel-level asset inventory for "${project.vesselName}" in accordance with IACS UR E26. Unlike equipment-level inventories (E27-CBS), this document consolidates all CBS assets across the entire vessel into a single comprehensive inventory.`,
        },
        {
          title: "2. Regulatory Reference",
          body: "This inventory addresses:",
          bullets: [
            "IACS UR E26 — Vessel asset inventory requirement (Design & Construction phase)",
            "IACS UR E26 — Making assets 'visible' (IDENTIFY function)",
          ],
        },
        {
          title: "3. Vessel CBS Summary",
          body: `The vessel CBS comprises ${hardware.length} hardware assets and ${software.length} software components distributed across ${zones.size} security zone(s): ${[...zones.keys()].join(", ")}.`,
        },
        {
          title: "4. Hardware Asset Inventory",
          body: "Complete listing of all OT and IT hardware onboard. Each entry includes identification, network details, and zone assignment.",
        },
        {
          title: "5. Software Asset Inventory",
          body: "Complete listing of all OS, firmware, applications, and configuration files. Includes version information, vendor, and license status.",
        },
        {
          title: "6. Zone Distribution Summary",
          body: `Assets are distributed across ${zones.size} IEC 62443 security zone(s). Zone assignment determines the security requirements and access control policies applicable to each asset.`,
        },
      ];

    case "e26-design":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document describes the cybersecurity design for vessel "${project.vesselName}" in accordance with IACS UR E26. It covers the security architecture, protection mechanisms, detection capabilities, and resilience measures implemented during design and construction.`,
        },
        {
          title: "2. Regulatory Reference",
          body: "This document addresses E26 requirements across all five functional areas:",
          bullets: [
            "IDENTIFY — Asset inventory, block diagrams, network arrangement",
            "PROTECT — Network segmentation, firewalls, access control, remote access, wireless, software updates",
            "DETECT — Network monitoring, IDS, verification and diagnostics",
            "RESPOND — Incident response, network isolation, independent operation",
            "RECOVER — Backup/restore, shutdown/reset/rollback, recovery plan",
          ],
        },
        {
          title: "3. Network Security Architecture",
          body: `The vessel network is segmented into ${zones.size} security zone(s): ${[...zones.keys()].join(", ")}. Each zone groups assets by function and trust level.`,
          bullets: [
            "OT systems are isolated in dedicated security zones",
            "Firewalls/data diodes control inter-zone communication",
            "Shore connections are isolated from operational zones",
            "Safety-critical systems have highest security zone level",
          ],
        },
        {
          title: "4. Protection Mechanisms",
          body: `The following protection mechanisms are implemented across ${hardware.length} CBS assets:`,
          bullets: [
            "Network segmentation — Zone-based firewall rules per IACS UR E26 requirements",
            "Anti-malware — Protection installed on compatible assets (E27 Capability 18)",
            "Access control — Role-based authentication with least privilege (E27 Capabilities 1-7)",
            "Remote access — Controlled, monitored, requires crew approval (E27 Capability 37)",
            "Wireless security — Separate zones, encryption, authentication (E27 Capability 5)",
            "Software updates — Pre-tested with rollback capability (E27 Capability 28)",
          ],
        },
        {
          title: "5. Detection Capabilities",
          body: "Detection mechanisms implemented:",
          bullets: [
            "Continuous network monitoring with anomaly alerts",
            "Intrusion Detection System (IDS) in passive mode on key network segments",
            "Audit logging on all CBS assets (E27 Capability 13-16)",
            "Security verification and diagnostic functions (E27 Capability 19)",
          ],
        },
        {
          title: "6. Response and Recovery Design",
          body: "The vessel is designed for cyber resilience:",
          bullets: [
            "Network isolation capability — Affected zones can be isolated without impacting other zones",
            "Independent operation — Safety-critical systems can operate independently of network connectivity",
            "Default to minimal risk — Systems fail to a safe state (E27 Capability 21)",
            "Backup and restore — All CBS assets have backup/recovery procedures (E27 Capabilities 27-28)",
            "Manual fallback — Manual operation procedures for all critical vessel functions",
          ],
        },
      ];

    case "e26-test":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document defines the ship cyber-resilience test procedure for vessel "${project.vesselName}" in accordance with IACS UR E26. It covers testing during construction, commissioning, and annual surveys during operational life.`,
        },
        {
          title: "2. Regulatory Reference",
          body: "This procedure addresses:",
          bullets: [
            "IACS UR E26 — Ship cyber-resilience test procedure (Commissioning phase)",
            "IACS UR E26 — Regular cyber resilience tests (RECOVER function)",
            `${project.classification || "Classification Society"} — Survey testing requirements`,
          ],
        },
        {
          title: "3. Test Phases",
          body: "Testing is conducted in three phases:",
          bullets: [
            "Phase 1 — Construction: Factory Acceptance Test (FAT) for individual CBS equipment",
            "Phase 2 — Commissioning: Harbour Acceptance Test (HAT) and Sea Acceptance Test (SAT) for integrated vessel systems",
            "Phase 3 — Operation: Annual survey testing and periodic resilience verification",
          ],
        },
        {
          title: "4. Construction Phase Tests (FAT)",
          body: `Each CBS equipment undergoes Factory Acceptance Test per E27 system test plan. ${hardware.length} hardware assets require FAT testing.`,
          bullets: [
            "E27 security capability verification (41 capabilities per Table 1 and Table 2)",
            "Network communication verification per flow diagrams",
            "Security configuration validation against hardening guidelines",
            "Backup and recovery procedure verification",
          ],
        },
        {
          title: "5. Commissioning Tests (HAT/SAT)",
          body: "Integrated vessel-level testing:",
          bullets: [
            "Zone boundary verification — Confirm firewall rules enforce zone segmentation",
            "Inter-system communication test — Verify only permitted data flows exist",
            "Network monitoring verification — Confirm IDS/monitoring captures expected events",
            "Incident response drill — Simulate cyber incident, verify isolation and recovery",
            "Remote access test — Verify remote access controls (crew approval, MFA, session timeout)",
            "Backup/restore test — Full backup and restore of critical system",
            "Degraded mode test — Verify vessel can operate with CBS in degraded state",
          ],
        },
        {
          title: "6. Annual Survey Tests",
          body: "During annual classification society surveys:",
          bullets: [
            "Security configuration spot-check (sample of SC checks)",
            "Audit log review — Verify logging is active and logs retained",
            "Account management review — Verify no orphaned or default accounts",
            "Backup verification — Confirm backups are current and restorable",
            "Change management review — Verify all CBS changes were properly documented",
            "Incident response readiness — Verify crew awareness and procedure currency",
          ],
        },
        {
          title: "7. Test Documentation",
          body: `All test results shall be documented and submitted to ${project.classification || "the Classification Society"}. Test records shall be retained for the operational life of the vessel.`,
        },
      ];

    // ─── E26 focus areas ─────────────────────────────────────

    case "e26-training":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document establishes the ship-level Cybersecurity Training Plan for vessel "${project.vesselName}" in accordance with IACS UR E26. Unlike equipment-specific training records (E27), this plan defines the organizational training program, competency requirements, and awareness strategy for all personnel who interact with or are affected by the vessel's Computer Based Systems (CBS).`,
        },
        {
          title: "2. Regulatory Reference",
          body: "This training plan is developed in compliance with:",
          bullets: [
            "IACS UR E26 — Crew cyber resilience awareness and competency requirements",
            "IMO MSC-FAL.1/Circ.3 — Guidelines on maritime cyber risk management (Section 4: Training)",
            "ISM Code — Chapter 6: Resources and Personnel (competence requirements)",
            "STCW Convention — Applicable training standards for maritime personnel",
            `${project.classification || "Classification Society"} specific cyber training requirements`,
          ],
        },
        {
          title: "3. Training Governance",
          body: "The training program is managed under the vessel's Safety Management System (SMS):",
          bullets: [
            "Designated Person Ashore (DPA) — Approves annual training plan and budget",
            "Company Security Officer (CSO) — Develops training content and verifies compliance",
            "Ship Security Officer (SSO) — Coordinates onboard training delivery and records",
            "Master — Ensures all onboard personnel complete required training",
            "Department Heads — Identify role-specific training needs within their departments",
          ],
        },
        {
          title: "4. Target Audience and Competency Levels",
          body: "Training requirements are defined by three competency levels, aligned with personnel roles:",
          bullets: [
            "Level 1 — AWARENESS (All crew): Basic cyber hygiene, recognizing phishing and social engineering, reporting procedures. Required for all personnel onboard including temporary visitors with system access.",
            "Level 2 — OPERATIONAL (Watch officers, engineers, operators): CBS operational procedures, monitoring dashboards, alarm response, safe use of removable media and external connections. Required for personnel operating CBS equipment.",
            "Level 3 — SPECIALIST (IT/OT administrators, SSO): Advanced system administration, security configuration management, vulnerability assessment, incident response leadership, backup/recovery procedures.",
          ],
        },
        {
          title: "5. Annual Training Schedule",
          body: "The following training schedule shall be maintained as part of the vessel's SMS drill plan:",
          bullets: [
            "Q1 — Cybersecurity awareness refresher (Level 1, all crew, 2 hours)",
            "Q2 — CBS operational procedures and incident response drill (Level 2, 4 hours)",
            "Q3 — Table-top exercise: cyber incident scenario (Level 2+3, 4 hours)",
            "Q4 — Annual review and competency assessment (All levels, 2 hours)",
            "Ongoing — Induction training for new crew members within 7 days of joining",
            "As needed — Supplementary training following actual incidents or major CBS changes",
          ],
        },
        {
          title: "6. Training Content by Module",
          body: "The training program covers the following modules aligned with E26 requirements:",
          bullets: [
            "Module A: Maritime cyber threat landscape — Current threats to shipping, recent incidents, regulatory drivers",
            "Module B: CBS architecture overview — Ship network zones, critical systems, data flows (reference: Security Zone Design document)",
            "Module C: Access control and password management — Account management procedures, password policy compliance",
            "Module D: Physical security awareness — Equipment protection, tamper detection, visitor escort procedures",
            "Module E: Incident recognition and reporting — Indicators of compromise, initial response actions, reporting chain",
            "Module F: Secure communications — Email safety, removable media handling, remote access procedures",
            "Module G: Business continuity — Degraded mode operations, backup procedures, manual fallback capabilities",
          ],
        },
        {
          title: "7. Training Delivery Methods",
          body: "Training shall be delivered through a combination of methods appropriate to the vessel environment:",
          bullets: [
            "Classroom sessions — Led by SSO or external instructors, with presentation materials",
            "Practical exercises — Hands-on drills using actual CBS equipment (Level 2+3)",
            "Table-top exercises — Scenario-based group discussions for incident response practice",
            "Self-study materials — Posters, quick-reference cards, digital learning modules for ongoing awareness",
            "Toolbox talks — Brief (15-minute) safety briefings integrated into daily operations",
          ],
        },
        {
          title: "8. Competency Assessment",
          body: "Training effectiveness shall be assessed through:",
          bullets: [
            "Written or oral knowledge checks following classroom training",
            "Practical demonstration of CBS operational skills (Level 2+3)",
            "Observation during drills and exercises — documented by SSO",
            "Annual competency review as part of SMS internal audit",
            "Tracking of cyber incident reports as a leading indicator of awareness levels",
          ],
        },
        {
          title: "9. Record Keeping",
          body: "Training records shall be maintained in accordance with ISM Code requirements:",
          bullets: [
            "Individual training records kept in crew files (minimum 5 years retention)",
            "Training attendance logs signed by attendees and trainer",
            "Drill and exercise reports filed in SMS documentation",
            "Competency assessment results recorded and tracked for trend analysis",
            "Records available for classification society audit and flag state inspection",
          ],
        },
        {
          title: "10. Integration with SMS",
          body: `This training plan is integrated with the Safety Management System of vessel "${project.vesselName}". The CSO shall review and update this plan annually, or immediately following significant changes to the CBS, a cyber incident, or updated regulatory requirements. Training plan revisions require DPA approval.`,
        },
      ];

    case "e26-incident":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document establishes the ship-level Cybersecurity Incident Response Procedure for vessel "${project.vesselName}" in accordance with IACS UR E26. Unlike equipment-level incident response plans (E27), this procedure defines the organizational command structure, communication protocols, and coordination with external parties for managing cyber incidents that affect vessel safety and operations.`,
        },
        {
          title: "2. Regulatory Reference",
          body: "This procedure is developed in compliance with:",
          bullets: [
            "IACS UR E26 — Ship-level incident response and recovery requirements",
            "IMO MSC-FAL.1/Circ.3 — Guidelines on maritime cyber risk management",
            "ISM Code — Chapter 8: Emergency Preparedness (cyber incident integration)",
            "ISPS Code — Ship Security Plan incident reporting requirements",
            `${project.classification || "Classification Society"} notification requirements for cyber incidents`,
          ],
        },
        {
          title: "3. Relationship to E27 Incident Response",
          body: "This E26 procedure operates at the ship management level and coordinates with equipment-level (E27) incident response plans. E27 plans handle technical detection and containment for individual CBS equipment. This E26 procedure manages the overall ship response including command decisions, external communications, regulatory notifications, and business continuity.",
        },
        {
          title: "4. Incident Command Structure",
          body: "The following command structure is activated upon confirmation of a cybersecurity incident:",
          bullets: [
            "Master — Ultimate authority for all onboard decisions. Authorizes external notifications and operational changes.",
            "Ship Security Officer (SSO) — Incident Commander. Coordinates response activities, manages communication flow, maintains incident log.",
            "Chief Engineer — OT System Lead. Manages response for propulsion, power, and machinery control systems.",
            "Officer of the Watch (OOW) — Navigation Lead. Ensures safe navigation during incident, activates manual fallback procedures.",
            "Company Security Officer (CSO) — Shore-side coordination. Manages company resources, regulatory notifications, media communications.",
            "Designated Person Ashore (DPA) — Safety oversight. Ensures SMS compliance during incident response and recovery.",
          ],
        },
        {
          title: "5. Incident Classification and Escalation",
          body: "Incidents are classified by their impact on vessel safety and operations:",
          bullets: [
            "LEVEL 1 — CRITICAL: Safety systems compromised (navigation, propulsion, fire detection). Immediate Master notification. Activate emergency procedures. Consider requesting assistance.",
            "LEVEL 2 — MAJOR: Operational systems significantly degraded. Multiple CBS zones affected. SSO declares incident. CSO notified within 1 hour.",
            "LEVEL 3 — MODERATE: Single system or zone affected. Operations continue with workarounds. SSO investigates. CSO notified within 4 hours.",
            "LEVEL 4 — MINOR: Suspicious activity or anomaly detected. No operational impact. SSO logs and monitors. CSO informed in daily report.",
          ],
        },
        {
          title: "6. Initial Response Procedures",
          body: "Upon detection of a potential cyber incident, the following procedures apply:",
          bullets: [
            "Step 1: DETECT & REPORT — Any crew member observing unusual system behavior reports to OOW/Duty Engineer immediately",
            "Step 2: INITIAL ASSESSMENT — OOW/Duty Engineer assesses impact on vessel safety. If safety systems are affected, activate manual fallback procedures immediately.",
            "Step 3: NOTIFY SSO — SSO is notified regardless of severity. SSO performs detailed assessment and assigns incident level.",
            "Step 4: ACTIVATE COMMAND — For Level 1-2 incidents, SSO activates incident command structure and notifies Master.",
            "Step 5: CONTAIN — Isolate affected systems per E27 technical procedures. SSO coordinates with E27 technical response.",
            "Step 6: ESTABLISH MANUAL OPERATIONS — If critical systems are affected, activate manual/degraded mode procedures from ship's emergency plans.",
          ],
        },
        {
          title: "7. External Communication Protocol",
          body: "External communications during a cyber incident follow the Ship Security Plan notification chain:",
          bullets: [
            `Company Security Officer (CSO): Notify within 1 hour for Level 1-2, 4 hours for Level 3`,
            `Flag State Administration: As required by maritime security regulations`,
            `${project.classification || "Classification Society"}: Notify for incidents affecting class-related CBS equipment`,
            `Port State Authority: If incident occurs in port or affects port operations`,
            `CERT/National Authority: As required by applicable cybersecurity regulations`,
            `Ship Owner (${project.shipowner || "[To be specified]"}): Per company policy`,
            "NOTE: All external communications must be authorized by the Master and coordinated through CSO",
          ],
        },
        {
          title: "8. Business Continuity and Degraded Operations",
          body: "The vessel shall maintain the ability to operate safely with degraded CBS capability:",
          bullets: [
            "Manual navigation procedures (paper charts, visual bearings, manual radar plotting)",
            "Manual engine control from engine room (direct telegraph communication)",
            "Manual fire detection and alarm procedures",
            "Manual cargo operations procedures",
            "Satellite phone / VHF radio for communications if digital systems are compromised",
            "Pre-positioned manual procedures documentation accessible without CBS",
          ],
        },
        {
          title: "9. Recovery and Post-Incident Activities",
          body: "Following containment and eradication (per E27 technical procedures):",
          bullets: [
            "SSO coordinates system restoration priority based on operational criticality",
            "Master authorizes return to automated operations for each system individually",
            "Enhanced monitoring period: Minimum 72 hours for Level 1-2 incidents",
            "Post-incident review: Within 7 days, led by CSO with SSO and department heads",
            "Lessons learned report: Filed in SMS, shared with fleet if applicable",
            "Procedure update: This E26 procedure and related E27 plans updated based on findings",
            `Classification society notification: Submit incident report to ${project.classification || "[Classification Society]"} per their requirements`,
          ],
        },
        {
          title: "10. Drill and Exercise Program",
          body: "Cyber incident response capability shall be tested regularly:",
          bullets: [
            "Quarterly — Communication test: Verify notification chain (SSO → Master → CSO) including alternate channels",
            "Semi-annually — Table-top exercise: Scenario-based discussion covering Level 2-3 incident",
            "Annually — Full drill: Simulated Level 1 incident with manual fallback activation and external notification",
            "All drills documented in SMS and reviewed during management review",
            "Drill findings incorporated into training plan updates (ref: E26 Training Plan)",
          ],
        },
        {
          title: "11. Emergency Contact List",
          body: `Vessel: ${project.vesselName}\nClassification Society: ${project.classification || "[To be specified]"}\nShip Owner: ${project.shipowner || "[To be specified]"}\n\n(Complete the emergency contact details below with current phone numbers, email addresses, and INMARSAT numbers for all positions listed in the Incident Command Structure.)`,
        },
      ];

    case "risk-policy":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document establishes the Cyber Risk Policy for vessel "${project.vesselName}" in accordance with IACS UR E26 requirements. It defines the organizational commitment to managing cyber risks affecting ship systems.`,
        },
        {
          title: "2. Regulatory Reference",
          body: "This policy is developed in compliance with:",
          bullets: [
            "IACS UR E26 — Cyber resilience of ships",
            "IMO MSC-FAL.1/Circ.3 — Guidelines on maritime cyber risk management",
            "ISM Code — Safety management system integration",
          ],
        },
        {
          title: "3. Policy Statement",
          body: `The operator of vessel "${project.vesselName}" is committed to managing cybersecurity risks to ensure the safe and secure operation of the vessel. This policy applies to all computer-based systems onboard and ashore that affect vessel operations, safety, and security.`,
        },
        {
          title: "4. Roles and Responsibilities",
          body: "Cybersecurity governance structure:",
          bullets: [
            "Designated Person Ashore (DPA) — Overall cybersecurity oversight",
            "Company Security Officer (CSO) — Policy development and compliance monitoring",
            "Ship Security Officer (SSO) — Onboard implementation and incident response",
            "Master — Final authority for onboard cybersecurity decisions",
            "Chief Engineer — OT system security responsibility",
            "IT Administrator — Technical implementation and maintenance",
          ],
        },
        {
          title: "5. Risk Management Framework",
          body: "The cyber risk management framework follows a continuous cycle:",
          bullets: [
            "IDENTIFY — Inventory all CBS assets, determine criticality, assess threats",
            "PROTECT — Implement security controls based on risk assessment",
            "DETECT — Monitor for anomalies and potential incidents",
            "RESPOND — Execute incident response procedures",
            "RECOVER — Restore systems and resume operations",
          ],
        },
        {
          title: "6. Integration with Safety Management System",
          body: "This cyber risk policy shall be integrated into the vessel's existing Safety Management System (SMS) as required by the ISM Code. Cybersecurity considerations shall be included in operational procedures, drills, and management reviews.",
        },
      ];

    case "risk-assessment":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document presents the Cyber Risk Assessment for vessel "${project.vesselName}" in accordance with IACS UR E26. It identifies cyber threats, assesses vulnerabilities, evaluates potential impacts, and determines risk levels for all CBS assets.`,
        },
        {
          title: "2. Assessment Methodology",
          body: "The risk assessment follows a structured approach:",
          bullets: [
            "Asset identification and valuation based on CBS inventory",
            "Threat identification based on maritime-specific threat landscape",
            "Vulnerability assessment through security configuration checks (SC-1 to SC-13)",
            "Impact analysis considering safety, operational, financial, and reputational consequences",
            "Risk calculation: Risk = Likelihood × Impact",
          ],
        },
        {
          title: "3. CBS Asset Summary",
          body: `The CBS comprises ${hardware.length} hardware assets and ${software.length} software components across ${zones.size} security zone(s). Assets are categorized by criticality based on their role in vessel safety and operations.`,
        },
        {
          title: "4. Threat Landscape",
          body: "The following threat categories are considered:",
          bullets: [
            "Malware — Ransomware, worms, trojans targeting operational systems",
            "Unauthorized access — Exploitation of weak credentials or network access controls",
            "Insider threat — Accidental or malicious actions by personnel or service providers",
            "Supply chain compromise — Malicious code in software updates or counterfeit hardware",
            "Physical attack — Unauthorized physical access to CBS equipment",
            "Denial of service — Resource exhaustion targeting CBS network services",
          ],
        },
        {
          title: "5. Security Assessment Summary",
          body: `Security configuration assessment results: ${counts.pass} PASS, ${counts.fail} FAIL, ${counts.partial} PARTIAL out of ${counts.total} checks across ${hardware.length} assets.`,
        },
        {
          title: "6. Risk Evaluation",
          body: "Risk levels are determined by combining likelihood and impact scores. Items assessed as FAIL represent HIGH risk and require immediate mitigation. PARTIAL results represent MEDIUM risk requiring planned remediation.",
        },
        {
          title: "7. Risk Treatment Plan",
          body: "For each identified risk, one of the following treatment options is selected:",
          bullets: [
            "MITIGATE — Implement additional controls to reduce risk to acceptable level",
            "ACCEPT — Risk is within acceptable threshold with existing controls",
            "TRANSFER — Risk is shared through contractual arrangements or insurance",
            "AVOID — Activity or system configuration is changed to eliminate the risk",
          ],
        },
      ];

    case "zone-design":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document defines the Security Zone Design for the CBS of vessel "${project.vesselName}" in accordance with IACS UR E26. Security zones group CBS assets by function and trust level, with controlled communication between zones.`,
        },
        {
          title: "2. Zone Architecture",
          body: `The CBS is divided into ${zones.size} security zone(s): ${[...zones.keys()].join(", ")}. Each zone contains assets with similar security requirements and operational functions.`,
        },
        {
          title: "3. Zone Definitions",
          body: "Each security zone is defined by its function, trust level, and boundary controls:",
        },
        {
          title: "4. Inter-Zone Communication",
          body: "Communication between zones is controlled by the following policies:",
          bullets: [
            "All inter-zone traffic passes through controlled conduits (firewalls, data diodes, or gateways)",
            "Only explicitly permitted communication flows are allowed",
            "Communication between safety-critical and non-critical zones requires additional validation",
            "External network connections (shore-side, satellite) are isolated from operational zones",
          ],
        },
        {
          title: "5. Zone Asset Assignment",
          body: "Hardware assets are assigned to zones based on their operational function. See the table below for current zone assignments.",
        },
        {
          title: "6. Network Topology Reference",
          body: "Refer to the Network Topology (DFD) diagram for a visual representation of zone boundaries, assets, and communication paths. The topology diagram is maintained in the DFD editor and should be referenced alongside this document.",
        },
      ];

    default:
      return [
        {
          title: "1. Purpose",
          body: `This document supports the cybersecurity compliance program for vessel "${project.vesselName}".`,
        },
        {
          title: "2. Scope",
          body: `The scope covers ${hardware.length} hardware and ${software.length} software assets registered in the CBS inventory across ${zones.size} security zone(s).`,
        },
        {
          title: "3. Content",
          body: "(Document content to be defined based on specific regulatory requirements.)",
        },
      ];
  }
}

// ─── Generator ──────────────────────────────────────────────────────────────

export function generateTemplate(
  data: DocumentData,
  docType: string,
  title: string,
  focus: string,
): Document {
  const { project, hardware, software, assessments } = data; // used conditionally below
  const sections = getSections(focus, data);

  const cover = buildCoverPage(project, title, docType);

  const content: (Paragraph | Table)[] = [];

  sections.forEach((section) => {
    content.push(heading1(section.title));
    content.push(bodyText(section.body));

    if (section.bullets && section.bullets.length > 0) {
      section.bullets.forEach((b) => content.push(bulletItem(b)));
    }
  });

  // Add relevant data tables based on focus
  if (focus === "vulnerability") {
    // Full assessment results table
    if (assessments.length > 0) {
      content.push(heading2("Assessment Results Detail"));
      content.push(
        buildTable(
          ["Hardware", "Type", "Zone", "Check", "Result", "Evidence", "Notes"],
          assessments.map((a) => [
            a.hardware.name, a.hardware.type, hardware.find((h) => h.id === a.hardwareId)?.zone || "—",
            a.checkId, resultLabel(a.result), a.evidence || "—", a.note || "—",
          ]),
        ),
      );
    }
    // Software inventory for CVE reference
    if (software.length > 0) {
      content.push(heading2("Software Inventory (CVE Reference)"));
      content.push(
        buildTable(
          ["Software", "Version", "Vendor", "Type", "CPE", "CVE Matches"],
          software.map((sw) => [
            sw.name, sw.version || "—", sw.vendor || "—", sw.swType,
            sw.cpe || "Not registered", String(sw._count.cveMatches),
          ]),
        ),
      );
    }
  }

  if (focus === "access") {
    const sc1 = assessments.filter((a) => a.checkId === "SC-1" || a.checkId === "SC-2" || a.checkId === "SC-3");
    if (sc1.length > 0) {
      content.push(
        buildTable(
          ["Hardware", "Type", "Zone", "Check", "Result", "Evidence", "Notes"],
          sc1.map((a) => [
            a.hardware.name, a.hardware.type,
            hardware.find((h) => h.id === a.hardwareId)?.zone || "—",
            a.checkId, resultLabel(a.result), a.evidence || "—", a.note || "—",
          ]),
        ),
      );
    }
  }

  if (focus === "monitoring") {
    const sc7 = assessments.filter((a) => a.checkId === "SC-7");
    if (sc7.length > 0) {
      content.push(
        buildTable(
          ["Hardware", "Type", "Zone", "Result", "Evidence", "Notes"],
          sc7.map((a) => [
            a.hardware.name, a.hardware.type,
            hardware.find((h) => h.id === a.hardwareId)?.zone || "—",
            resultLabel(a.result), a.evidence || "—", a.note || "—",
          ]),
        ),
      );
    }
    // Log source inventory
    if (hardware.length > 0) {
      content.push(heading2("CBS Asset Log Sources"));
      content.push(
        buildTable(
          ["Asset", "Type", "Zone", "IP Address", "Log Capability"],
          hardware.map((hw) => [
            hw.name, hw.type, hw.zone || "—", hw.ipAddress || "—",
            sc7.find((a) => a.hardwareId === hw.id)?.result === "PASS" ? "Verified" : "To be verified",
          ]),
        ),
      );
    }
  }

  if (focus === "physical") {
    const locations = new Map<string, typeof hardware>();
    hardware.forEach((hw) => {
      const loc = hw.location || "Unspecified";
      if (!locations.has(loc)) locations.set(loc, []);
      locations.get(loc)!.push(hw);
    });
    content.push(
      buildTable(
        ["Location", "Asset Count", "Assets", "Zone(s)"],
        Array.from(locations.entries()).map(([loc, assets]) => [
          loc,
          String(assets.length),
          assets.map((a) => a.name).join(", "),
          [...new Set(assets.map((a) => a.zone || "Unassigned"))].join(", "),
        ]),
      ),
    );
  }

  if (focus === "supply") {
    const vendors = new Map<string, { products: string[]; types: Set<string> }>();
    hardware.forEach((hw) => {
      if (hw.manufacturer) {
        if (!vendors.has(hw.manufacturer)) vendors.set(hw.manufacturer, { products: [], types: new Set() });
        const v = vendors.get(hw.manufacturer)!;
        v.products.push(`${hw.name} (HW)`);
        v.types.add("Hardware");
      }
    });
    software.forEach((sw) => {
      if (sw.vendor) {
        if (!vendors.has(sw.vendor)) vendors.set(sw.vendor, { products: [], types: new Set() });
        const v = vendors.get(sw.vendor)!;
        v.products.push(`${sw.name} v${sw.version || "?"} (SW)`);
        v.types.add("Software");
      }
    });
    content.push(
      buildTable(
        ["Vendor", "Type", "Products", "Count"],
        Array.from(vendors.entries()).map(([name, v]) => [
          name, [...v.types].join(", "), v.products.join("; "), String(v.products.length),
        ]),
      ),
    );
  }

  if (focus === "training") {
    content.push(heading2("Training Record Table"));
    content.push(
      buildTable(
        ["Date", "Attendee Name", "Role", "Module/Topic", "Trainer", "Duration", "Result"],
        [["", "", "", "", "", "", ""], ["", "", "", "", "", "", ""], ["", "", "", "", "", "", ""], ["", "", "", "", "", "", ""], ["", "", "", "", "", "", ""]],
      ),
    );
  }

  if (focus === "e26-training") {
    // Annual training matrix
    content.push(heading2("Annual Training Matrix"));
    content.push(
      buildTable(
        ["Quarter", "Module", "Target Audience", "Duration", "Delivery Method", "Status"],
        [
          ["Q1", "Cybersecurity Awareness Refresher", "All crew (Level 1)", "2 hours", "Classroom + Self-study", ""],
          ["Q2", "CBS Operations & Incident Response Drill", "Watch officers, engineers (Level 2)", "4 hours", "Practical exercise", ""],
          ["Q3", "Cyber Incident Table-top Exercise", "Level 2+3 personnel", "4 hours", "Scenario-based discussion", ""],
          ["Q4", "Annual Review & Competency Assessment", "All levels", "2 hours", "Assessment + review", ""],
        ],
      ),
    );
    // CBS scope summary
    content.push(heading2("CBS Assets Covered by Training Program"));
    content.push(
      buildTable(
        ["Zone", "Asset Count", "Key Systems"],
        [...groupByZone(hardware).entries()].map(([zone, assets]) => [
          zone, String(assets.length), assets.slice(0, 3).map((a) => a.name).join(", ") + (assets.length > 3 ? ` (+${assets.length - 3} more)` : ""),
        ]),
      ),
    );
  }

  if (focus === "e26-incident") {
    // Incident notification matrix
    content.push(heading2("Incident Notification Matrix"));
    content.push(
      buildTable(
        ["Incident Level", "Master", "SSO", "CSO", "DPA", "Classification", "Flag State"],
        [
          ["Level 1 (Critical)", "Immediate", "Immediate", "< 1 hour", "< 1 hour", "< 4 hours", "As required"],
          ["Level 2 (Major)", "< 15 min", "Immediate", "< 1 hour", "< 4 hours", "< 24 hours", "As required"],
          ["Level 3 (Moderate)", "Daily report", "< 1 hour", "< 4 hours", "Weekly report", "If class equipment", "—"],
          ["Level 4 (Minor)", "If needed", "< 4 hours", "Daily report", "Monthly report", "—", "—"],
        ],
      ),
    );
    // CBS zones at risk
    content.push(heading2("CBS Zones and Critical Assets"));
    content.push(
      buildTable(
        ["Zone", "Asset Count", "Critical Assets", "Manual Fallback Available"],
        [...groupByZone(hardware).entries()].map(([zone, assets]) => [
          zone, String(assets.length),
          assets.slice(0, 3).map((a) => a.name).join(", ") + (assets.length > 3 ? ` (+${assets.length - 3})` : ""),
          "[To be verified]",
        ]),
      ),
    );
  }

  if (focus === "change") {
    // Current CBS scope table
    content.push(heading2("Current CBS Hardware Scope"));
    content.push(
      buildTable(
        ["Asset", "Type", "Manufacturer", "Model", "Zone", "IP Address"],
        hardware.map((hw) => [
          hw.name, hw.type, hw.manufacturer || "—", hw.model || "—",
          hw.zone || "—", hw.ipAddress || "—",
        ]),
      ),
    );
    // Change log template
    content.push(heading2("Change Log"));
    content.push(
      buildTable(
        ["Date", "Change ID", "Description", "Affected Asset(s)", "Category", "Approver", "Status"],
        [["", "", "", "", "", "", ""], ["", "", "", "", "", "", ""], ["", "", "", "", "", "", ""]],
      ),
    );
  }

  if (focus === "zone-design") {
    // Zone assignment table
    const zones = groupByZone(hardware);
    content.push(heading2("Zone Asset Assignment Table"));
    content.push(
      buildTable(
        ["Zone", "Asset", "Type", "IP Address", "Function"],
        [...zones.entries()].flatMap(([zone, assets]) =>
          assets.map((hw) => [zone, hw.name, hw.type, hw.ipAddress || "—", hw.software.map((s) => s.name).join(", ") || "—"]),
        ),
      ),
    );
  }

  if (focus === "risk-assessment") {
    // Assessment summary table
    if (assessments.length > 0) {
      content.push(heading2("Security Assessment Results"));
      content.push(
        buildTable(
          ["Hardware", "Type", "Zone", "Check", "Result", "Notes"],
          assessments.map((a) => [
            a.hardware.name, a.hardware.type,
            hardware.find((h) => h.id === a.hardwareId)?.zone || "—",
            a.checkId, resultLabel(a.result), a.note || "—",
          ]),
        ),
      );
    }
  }

  if (focus === "maintenance") {
    content.push(heading2("CBS Asset Maintenance Matrix"));
    content.push(
      buildTable(
        ["Asset", "Type", "Zone", "Manufacturer", "Maintenance Contact", "Remote Access"],
        hardware.map((hw) => [
          hw.name, hw.type, hw.zone || "—", hw.manufacturer || "—", "[To be specified]",
          hw.ipAddress ? "Yes (if enabled)" : "N/A",
        ]),
      ),
    );
  }

  if (focus === "system-test") {
    content.push(heading2("Test Matrix — CBS Assets"));
    content.push(
      buildTable(
        ["Asset", "Type", "Zone", "FAT Required", "HAT/SAT Required", "Test Status"],
        hardware.map((hw) => [hw.name, hw.type, hw.zone || "—", "Yes", "Yes", "[Pending]"]),
      ),
    );
  }

  if (focus === "hardening") {
    content.push(heading2("Hardening Checklist — CBS Assets"));
    content.push(
      buildTable(
        ["Asset", "Type", "OS Hardened", "Network Hardened", "AV/Whitelist", "Audit Logging", "Verified"],
        hardware.map((hw) => {
          const sc5 = assessments.find((a) => a.hardwareId === hw.id && a.checkId === "SC-5");
          const sc7 = assessments.find((a) => a.hardwareId === hw.id && a.checkId === "SC-7");
          const sc11 = assessments.find((a) => a.hardwareId === hw.id && a.checkId === "SC-11");
          return [
            hw.name, hw.type,
            sc5 ? resultLabel(sc5.result) : "—",
            sc5 ? resultLabel(sc5.result) : "—",
            sc11 ? resultLabel(sc11.result) : "—",
            sc7 ? resultLabel(sc7.result) : "—",
            "[Date]",
          ];
        }),
      ),
    );
  }

  if (focus === "e26-inventory") {
    // Hardware inventory
    content.push(heading2("Hardware Asset Inventory"));
    content.push(
      buildTable(
        ["#", "Asset", "Type", "Manufacturer", "Model", "IP Address", "Zone", "Location"],
        hardware.map((hw, i) => [
          String(i + 1), hw.name, hw.type, hw.manufacturer || "—", hw.model || "—",
          hw.ipAddress || "—", hw.zone || "—", hw.location || "—",
        ]),
      ),
    );
    // Software inventory
    content.push(heading2("Software Asset Inventory"));
    content.push(
      buildTable(
        ["#", "Software", "Version", "Vendor", "Type", "CPE", "Installed On"],
        software.map((sw, i) => [
          String(i + 1), sw.name, sw.version || "—", sw.vendor || "—",
          sw.swType, sw.cpe || "—", sw.hardware?.name || "—",
        ]),
      ),
    );
    // Zone summary
    const zones = groupByZone(hardware);
    content.push(heading2("Zone Distribution"));
    content.push(
      buildTable(
        ["Zone", "Hardware Count", "Key Assets"],
        [...zones.entries()].map(([z, assets]) => [
          z, String(assets.length),
          assets.slice(0, 4).map((a) => a.name).join(", ") + (assets.length > 4 ? ` (+${assets.length - 4})` : ""),
        ]),
      ),
    );
  }

  if (focus === "e26-design") {
    // Zone architecture table
    const zones = groupByZone(hardware);
    content.push(heading2("Zone Architecture Overview"));
    content.push(
      buildTable(
        ["Zone", "Assets", "Types", "Network Range"],
        [...zones.entries()].map(([z, assets]) => [
          z, String(assets.length),
          [...new Set(assets.map((a) => a.type))].join(", "),
          assets.filter((a) => a.ipAddress).map((a) => a.ipAddress).join(", ") || "—",
        ]),
      ),
    );
    // Assessment summary
    if (assessments.length > 0) {
      const counts = countResults(assessments);
      content.push(heading2("Security Capability Implementation Status"));
      content.push(
        buildTable(
          ["Result", "Count", "Percentage"],
          [
            ["PASS", String(counts.pass), counts.total > 0 ? `${Math.round((counts.pass / counts.total) * 100)}%` : "—"],
            ["FAIL", String(counts.fail), counts.total > 0 ? `${Math.round((counts.fail / counts.total) * 100)}%` : "—"],
            ["PARTIAL", String(counts.partial), counts.total > 0 ? `${Math.round((counts.partial / counts.total) * 100)}%` : "—"],
          ],
        ),
      );
    }
  }

  if (focus === "e26-test") {
    // Test matrix
    content.push(heading2("Test Matrix — All CBS Assets"));
    content.push(
      buildTable(
        ["Asset", "Type", "Zone", "FAT", "HAT", "SAT", "Annual Survey"],
        hardware.map((hw) => [hw.name, hw.type, hw.zone || "—", "[Date]", "[Date]", "[Date]", "[Date]"]),
      ),
    );
  }

  // Add revision history table for all document types
  content.push(heading2("Document Revision History"));
  content.push(
    buildTable(
      ["Version", "Date", "Author", "Description"],
      [
        ["1.0", new Date().toISOString().slice(0, 10), "SCS Platform", "Initial generation"],
        ["", "", "", ""],
        ["", "", "", ""],
      ],
    ),
  );

  return wrapDocument(`${docType}: ${title}`, project, [...cover, ...content]);
}
