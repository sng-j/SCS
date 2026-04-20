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

    // ─── E26 additional documents ────────────────────────────

    case "e26-management":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This Cyber Security Management Plan (CSMP) defines the organizational framework for managing cybersecurity on vessel "${project.vesselName}" in accordance with IACS UR E26. It establishes governance structures, responsibilities, processes, and review cycles to maintain ongoing cyber resilience throughout the vessel's operational life.`,
        },
        {
          title: "2. Regulatory Reference",
          body: "This plan is developed in compliance with:",
          bullets: [
            "IACS UR E26 — Cyber resilience of ships (Operational phase management requirements)",
            "IMO MSC-FAL.1/Circ.3 — Guidelines on maritime cyber risk management",
            "ISM Code — Safety Management System integration",
            `${project.classification || "Classification Society"} — Cybersecurity management requirements`,
          ],
        },
        {
          title: "3. Governance and Responsibilities",
          body: "Cybersecurity management is governed at three levels:",
          bullets: [
            "Company Level — Designated Person Ashore (DPA) and Company Security Officer (CSO): Overall policy, compliance oversight, resource allocation",
            "Ship Level — Ship Security Officer (SSO) and Master: Onboard implementation, incident command, crew training coordination",
            "System Level — IT/OT Administrator and Equipment Vendors: Technical maintenance, patch management, configuration control",
          ],
        },
        {
          title: "4. Cyber Security Management Lifecycle",
          body: "The CSMP follows a Plan-Do-Check-Act (PDCA) lifecycle integrated with the vessel Safety Management System (SMS):",
          bullets: [
            "PLAN — Annual cyber risk assessment, update threat register, set improvement objectives",
            "DO — Implement controls, deliver training, apply patches, manage changes",
            "CHECK — Monitor and audit compliance, review incident reports, verify control effectiveness",
            "ACT — Corrective actions, update procedures, classify lessons learned",
          ],
        },
        {
          title: "5. Scope of Management",
          body: `The CSMP covers ${hardware.length} hardware assets and ${software.length} software components across ${zones.size} security zone(s): ${[...zones.keys()].join(", ")}. All CBS equipment listed in the vessel asset inventory falls within the scope of this plan.`,
        },
        {
          title: "6. Key Management Processes",
          body: "The following core cybersecurity processes are managed under this plan:",
          bullets: [
            "Risk Management — Annual cyber risk assessment aligned with IACS UR E26 (ref: E26-CRA)",
            "Asset Management — Maintaining the Vessel Asset Inventory (ref: E26-INV)",
            "Change Management — Formal change control for all CBS modifications (ref: E27-MOC)",
            "Incident Management — Incident response and reporting chain (ref: E27-INC, E26 procedures)",
            "Training Management — Crew cyber awareness and competency program (ref: E26-TRA)",
            "Supplier Management — Vendor qualification and supply chain security (ref: E26-SSL)",
            "Remote Access Management — Policy and authorization for remote connections (ref: E26-RAP)",
            "Audit and Review — Internal audit of CSMP compliance and classification society surveys",
          ],
        },
        {
          title: "7. Performance Metrics",
          body: "The effectiveness of the CSMP shall be measured through the following key performance indicators (KPIs):",
          bullets: [
            "Patch compliance rate — Percentage of assets with current security patches",
            "Training completion rate — Percentage of crew completing mandatory annual training",
            "Incident response time — Time from detection to initial response for each incident level",
            "Assessment score — Percentage of security checks (SC-1 to SC-13) rated PASS",
            "Change management compliance — Percentage of changes processed through formal workflow",
            "Audit findings closure rate — Percentage of audit findings closed within target timescale",
          ],
        },
        {
          title: "8. Annual Review and Update",
          body: `This CSMP shall be reviewed annually by the CSO with inputs from the SSO and department heads. The review shall consider: changes to the threat landscape, regulatory updates, lessons learned from incidents and drills, audit findings, and changes to the CBS asset inventory. Updated plans require DPA approval and shall be communicated to vessel "${project.vesselName}" within 30 days of approval.`,
        },
      ];

    case "e26-remote-access":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This Remote Access Policy defines the requirements and procedures for remote access to the Computer Based Systems (CBS) of vessel "${project.vesselName}" in accordance with IACS UR E26 and E27 remote access capabilities (Capabilities 32–41). It applies to all remote connections by vendors, administrators, and service providers.`,
        },
        {
          title: "2. Regulatory Reference",
          body: "This policy is based on:",
          bullets: [
            "IACS UR E26 — Remote access security requirements (PROTECT function)",
            "IACS UR E27 — Capability 32 (MFA), Capability 33 (Software/device authentication), Capability 34 (Login lockout), Capability 35 (System notification), Capability 36 (Remote session monitoring), Capability 37 (Crew approval for remote access)",
            "IACS UR E27 — Capability 38 (Cryptographic integrity), Capability 39 (Session integrity), Capability 40 (Session ID invalidation), Capability 41 (Untrusted network protection)",
            `${project.classification || "Classification Society"} — Remote access requirements`,
          ],
        },
        {
          title: "3. Remote Access Authorization",
          body: "All remote access to CBS requires prior authorization:",
          bullets: [
            "Crew Approval (Capability 37) — Master or SSO must explicitly approve each remote session before it is enabled",
            "Vendor Authorization — Remote vendor access requires a formal service request approved by the Ship Owner",
            "Emergency Access — Defined emergency procedure for time-critical remote access with retrospective documentation",
            "Access is disabled by default — Remote access capability is off unless actively enabled for an approved session",
          ],
        },
        {
          title: "4. Authentication Requirements",
          body: "Remote access authentication must meet the following requirements:",
          bullets: [
            "Multi-Factor Authentication (MFA) — Required for all remote access (Capability 32); minimum two factors from: knowledge (password), possession (token/certificate), or inherence (biometric)",
            "Individual accounts — Shared remote access credentials are prohibited",
            "Certificate-based authentication — Preferred for machine-to-machine connections (Capability 33)",
            "Login lockout — Account locked after 5 failed attempts; lockout duration minimum 15 minutes (Capability 34)",
            "Credentials must be unique for remote access (separate from local accounts where technically feasible)",
          ],
        },
        {
          title: "5. Session Security Requirements",
          body: "Active remote sessions must comply with:",
          bullets: [
            "Session monitoring — All remote sessions logged and monitored in real-time (Capability 36)",
            "Session notification — CBS shall display notification of active remote session to onboard personnel (Capability 35)",
            "Automatic timeout — Sessions terminated after maximum 30 minutes of inactivity",
            "Session ID invalidation — Session tokens invalidated on logout (Capability 40)",
            "Cryptographic integrity — All remote communications use TLS 1.2+ or equivalent (Capabilities 38, 39)",
            "Encryption — Data in transit protected by current-generation cryptographic protocols",
          ],
        },
        {
          title: "6. Network Requirements for Remote Access",
          body: "Technical network controls for remote access:",
          bullets: [
            "Remote access only through designated, controlled entry points (VPN gateway or equivalent)",
            "Remote sessions isolated from other CBS zones — access restricted to specific systems required for the task",
            "All remote traffic logged at network perimeter with timestamps and source identification",
            "Firewall rules restrict remote access ports to authorized source IP ranges where feasible",
            "Satellite and shore connections used for remote access must be encrypted end-to-end",
          ],
        },
        {
          title: "7. Vendor and Third-Party Remote Access",
          body: "Third-party remote access must additionally comply with:",
          bullets: [
            "Non-disclosure agreement (NDA) covering CBS system details must be in place before access is granted",
            "Scope limitation — Access restricted to specific systems required for the service task",
            "Time limitation — Access enabled for defined period only; disabled immediately upon task completion",
            "Supervision — An onboard representative (SSO or designated person) monitors the session",
            "Post-service report — Vendor submits activity report within 48 hours of session completion",
            "Post-session integrity check — Verify system integrity after each vendor remote session",
          ],
        },
        {
          title: "8. Approved Remote Access Methods",
          body: `The following remote access methods are approved for use on vessel "${project.vesselName}":`,
          bullets: [
            "[Specify approved VPN solution — e.g., IPsec VPN, SSL/TLS VPN]",
            "[Specify approved remote desktop protocol and version — e.g., RDP with NLA, SSH]",
            "[List any vendor-specific remote access platforms approved by the Ship Owner]",
            "All other remote access methods are prohibited without explicit written approval from the DPA",
          ],
        },
        {
          title: "9. CBS Assets in Scope",
          body: `Remote access may be required for ${hardware.length} hardware assets across ${zones.size} security zone(s). Each asset's remote access capability shall be documented and assessed per the security capability assessment (E27-AUD).`,
        },
        {
          title: "10. Record Keeping",
          body: "Remote access records shall be maintained:",
          bullets: [
            "Log of all remote access sessions: date/time, duration, user/vendor, system accessed, purpose",
            "Authorization records: Master/SSO approval for each session",
            "Incident records: Any anomalies observed during remote sessions",
            "Records retained for minimum 2 years and available for classification society audit",
          ],
        },
      ];

    // ─── IEC 62443 documents ─────────────────────────────────

    case "iec-risk-assessment":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This Security Risk Assessment (SRA) is performed in accordance with IEC 62443-3-2 for the industrial automation and control system (IACS) / Computer Based System (CBS) of vessel "${project.vesselName}". It identifies threats, vulnerabilities, and risks, and establishes target security levels (SL-T) for each security zone.`,
        },
        {
          title: "2. Normative References",
          body: "This assessment is based on:",
          bullets: [
            "IEC 62443-3-2:2020 — Security risk assessment for system design",
            "IEC 62443-3-3 — System security requirements and security levels",
            "IEC 62443-2-1 — Security management system for IACS",
            "IACS UR E26/E27 — Maritime cyber resilience requirements",
            `${project.classification || "Classification Society"} — Applicable rules and guidelines`,
          ],
        },
        {
          title: "3. System Under Assessment",
          body: `The system under assessment is the CBS of vessel "${project.vesselName}". It comprises ${hardware.length} hardware assets and ${software.length} software components organized into ${zones.size} security zone(s): ${[...zones.keys()].join(", ")}.`,
        },
        {
          title: "4. Risk Assessment Methodology",
          body: "The risk assessment follows the IEC 62443-3-2 process:",
          bullets: [
            "Step 1: Identify high-level risk (HLR) for each zone and conduit",
            "Step 2: Identify threats using STRIDE methodology (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege)",
            "Step 3: Identify vulnerabilities through security capability assessment (SC-1 to SC-13)",
            "Step 4: Determine consequence severity (safety, financial, operational, reputational)",
            "Step 5: Determine likelihood based on threat actor capability and existing controls",
            "Step 6: Calculate risk = Consequence × Likelihood",
            "Step 7: Determine target security level (SL-T) based on risk",
          ],
        },
        {
          title: "5. Target Security Levels",
          body: "Security levels (SL) are defined per IEC 62443-3-3:",
          bullets: [
            "SL 1 — Protection against casual or unintentional violation",
            "SL 2 — Protection against intentional violation with simple means, low motivation/resources",
            "SL 3 — Protection against intentional violation with sophisticated means, moderate motivation/resources",
            "SL 4 — Protection against intentional violation with sophisticated means, high motivation/extended resources",
          ],
        },
        {
          title: "6. Assessment Summary",
          body: `Security capability assessment results across ${hardware.length} asset(s): ${counts.pass} PASS, ${counts.fail} FAIL, ${counts.partial} PARTIAL, ${counts.na} N/A out of ${counts.total} total checks. FAIL results represent unmet security requirements that elevate risk levels.`,
        },
        {
          title: "7. Risk Register",
          body: "The risk register documents all identified risks with their treatment plans. High-risk items (derived from FAIL assessment results and zone connectivity analysis) are prioritized for immediate remediation.",
        },
        {
          title: "8. Risk Treatment",
          body: "For each identified risk, treatment options per IEC 62443-3-2:",
          bullets: [
            "Reduce — Apply additional countermeasures to reduce likelihood or consequence",
            "Accept — Risk is within tolerance threshold; formally accepted and documented",
            "Transfer — Risk transferred through contractual arrangements",
            "Avoid — System design or operational change eliminates the risk",
          ],
        },
      ];

    case "iec-security-level":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This Security Level Report documents the achieved security levels (SL-A) for the CBS of vessel "${project.vesselName}" in accordance with IEC 62443-3-3. It compares achieved levels against target security levels (SL-T) established in the Security Risk Assessment and identifies gaps requiring remediation.`,
        },
        {
          title: "2. Normative References",
          body: "This report references:",
          bullets: [
            "IEC 62443-3-3:2013 — System security requirements and security levels",
            "IEC 62443-3-2 — Security risk assessment (source of SL-T values)",
            "IEC 62443-4-2 — Technical security requirements for IACS components",
            "IACS UR E27 — Security capability assessment (SC-1 to SC-13)",
          ],
        },
        {
          title: "3. Security Level Definitions",
          body: "Security levels are evaluated across seven foundational requirements (FR) per IEC 62443-3-3:",
          bullets: [
            "FR 1 — Identification and Authentication Control (IAC)",
            "FR 2 — Use Control (UC)",
            "FR 3 — System Integrity (SI)",
            "FR 4 — Data Confidentiality (DC)",
            "FR 5 — Restricted Data Flow (RDF)",
            "FR 6 — Timely Response to Events (TRE)",
            "FR 7 — Resource Availability (RA)",
          ],
        },
        {
          title: "4. System Security Level Assessment",
          body: `The CBS comprises ${hardware.length} assets across ${zones.size} zone(s). Security level assessment is performed per zone based on the security capabilities implemented and verified through assessment results (${counts.pass} PASS, ${counts.fail} FAIL, ${counts.partial} PARTIAL out of ${counts.total} checks).`,
        },
        {
          title: "5. Security Level Gap Analysis",
          body: "The following gaps exist between target (SL-T) and achieved (SL-A) security levels. Items assessed as FAIL indicate capabilities not yet meeting the target security level requirements.",
        },
        {
          title: "6. Remediation Plan",
          body: "For each identified gap, a remediation plan is required:",
          bullets: [
            "Identify specific IEC 62443-3-3 system requirement (SR) not met",
            "Define corrective action with responsible party and target date",
            "Verify remediation through re-assessment",
            "Update SL-A upon successful remediation",
          ],
        },
        {
          title: "7. Certification Readiness",
          body: "This report supports the certification process for IEC 62443 compliance. All SL-T values must be met by SL-A before certification can be achieved. Current gap count requiring remediation: based on FAIL results in security capability assessment.",
        },
      ];

    case "iec-capability-req":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This Security Capability Requirements document defines the system-level security requirements for the CBS of vessel "${project.vesselName}" in accordance with IEC 62443-3-3. It translates the target security levels (SL-T) from the risk assessment into specific, verifiable system requirements.`,
        },
        {
          title: "2. Normative References",
          body: "This document references:",
          bullets: [
            "IEC 62443-3-3:2013 — System security requirements and security levels",
            "IEC 62443-3-2 — Security risk assessment (source of SL-T)",
            "IEC 62443-4-2 — Component-level requirements (supplier responsibility)",
            "IACS UR E27 — Security capabilities 1-41 (maritime implementation)",
          ],
        },
        {
          title: "3. Foundational Requirements Structure",
          body: "System requirements are organized by IEC 62443-3-3 Foundational Requirements (FR) and System Requirements (SR). Each SR has capability levels (CR 1-4) that must be met based on the target SL-T.",
        },
        {
          title: "4. FR 1 — Identification and Authentication Control",
          body: "System requirements for identity and authentication (mapped to E27 SC-1, SC-2, SC-3):",
          bullets: [
            "SR 1.1 — Human user identification and authentication (maps to E27 Cap. 1)",
            "SR 1.2 — Software process and device identification and authentication",
            "SR 1.3 — Account management (maps to E27 Cap. 2, SC-2)",
            "SR 1.4 — Identifier management",
            "SR 1.5 — Authenticator management (maps to E27 Cap. 3, SC-1)",
            "SR 1.6 — Wireless access management (maps to E27 Cap. 5)",
            "SR 1.7 — Strength of password-based authentication (maps to E27 Cap. 6)",
            "SR 1.8 — Public key infrastructure certificates",
            "SR 1.9 — Strength of public key-based authentication",
            "SR 1.10 — Authenticator feedback (maps to E27 Cap. 7)",
            "SR 1.11 — Unsuccessful login attempts (maps to E27 Cap. 4)",
            "SR 1.12 — System use notification (maps to E27 Cap. 35)",
            "SR 1.13 — Access via untrusted networks (maps to E27 Cap. 32-41)",
          ],
        },
        {
          title: "5. FR 2 — Use Control",
          body: "System requirements for authorization and use control (mapped to E27 SC-2, SC-3):",
          bullets: [
            "SR 2.1 — Authorization enforcement (maps to E27 Cap. 8)",
            "SR 2.2 — Wireless use control (maps to E27 Cap. 9)",
            "SR 2.3 — Use control for portable and mobile devices (maps to E27 Cap. 10)",
            "SR 2.4 — Mobile code (maps to E27 Cap. 11)",
            "SR 2.5 — Session lock (maps to E27 Cap. 12, SC-10)",
            "SR 2.6 — Remote session termination",
            "SR 2.7 — Concurrent session control",
            "SR 2.8 — Auditable events (maps to E27 Cap. 13, SC-7)",
            "SR 2.9 — Audit storage capacity (maps to E27 Cap. 14)",
            "SR 2.10 — Response to audit processing failures (maps to E27 Cap. 15)",
            "SR 2.11 — Timestamps (maps to E27 Cap. 16)",
            "SR 2.12 — Non-repudiation",
          ],
        },
        {
          title: "6. FR 3–7 Summary",
          body: "Requirements for remaining foundational requirements:",
          bullets: [
            "FR 3 (System Integrity) — SR 3.1 through 3.9: Communication integrity, malware protection, security verification, input validation, deterministic output",
            "FR 4 (Data Confidentiality) — SR 4.1 through 4.3: Information confidentiality, use of cryptography, communication confidentiality",
            "FR 5 (Restricted Data Flow) — SR 5.1 through 5.4: Network segmentation, zone boundary protection, general purpose person-to-person communication restrictions",
            "FR 6 (Timely Response to Events) — SR 6.1 through 6.2: Audit log accessibility, continuous monitoring",
            "FR 7 (Resource Availability) — SR 7.1 through 7.8: DoS protection, resource management, control system backup, control system recovery, emergency power, network and security configuration, least functionality",
          ],
        },
        {
          title: "7. Compliance Status",
          body: `Current compliance status based on security capability assessment: ${counts.pass} requirements met (PASS), ${counts.fail} requirements not met (FAIL), ${counts.partial} requirements partially met (PARTIAL) out of ${counts.total} assessed. Detailed requirement-by-requirement status is available in the Security Capability Assessment Report (E27-AUD).`,
        },
      ];

    case "iec-component-req":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This Component Security Requirements document defines the security requirements for individual CBS components of vessel "${project.vesselName}" in accordance with IEC 62443-4-2. It establishes the security requirements that each hardware and software component must meet, based on the component security level (SL-C) derived from the system security level assessment.`,
        },
        {
          title: "2. Normative References",
          body: "This document references:",
          bullets: [
            "IEC 62443-4-2:2019 — Technical security requirements for IACS components",
            "IEC 62443-3-3 — System-level security requirements (source of SL-C targets)",
            "IEC 62443-4-1 — Secure product development lifecycle",
            "IACS UR E27 — Security capability requirements (SC-1 to SC-13)",
          ],
        },
        {
          title: "3. Component Types and Requirements",
          body: "IEC 62443-4-2 defines four component types with specific requirements:",
          bullets: [
            "Software Application (SA) — Applications running on general-purpose OS",
            "Embedded Device (ED) — Embedded systems with dedicated OS or firmware",
            "Host Device (HD) — General-purpose computing devices (servers, workstations, PCs)",
            "Network Device (ND) — Network infrastructure components (switches, routers, firewalls)",
          ],
        },
        {
          title: "4. Component Inventory",
          body: `The CBS contains ${hardware.length} hardware components and ${software.length} software components. Each component is classified by type and assessed for its security capability requirements.`,
        },
        {
          title: "5. Component Security Requirements by Category",
          body: "Key component-level security requirements (Component Requirements — CR):",
          bullets: [
            "CR 1.1 — Human user identification and authentication: Components must support individual accounts and password enforcement",
            "CR 1.3 — Account management: Components must support account lockout and account lifecycle management",
            "CR 2.1 — Authorization enforcement: Components must enforce role-based access control",
            "CR 2.8 — Auditable events: Components must generate logs for security-relevant events",
            "CR 3.1 — Communication integrity: Components must support integrity verification for communications",
            "CR 4.1 — Information confidentiality: Components must support encryption for sensitive data",
            "CR 7.1 — Denial of service protection: Components must handle resource exhaustion gracefully",
            "CR 7.6 — Network and security configuration settings: Components must provide secure default configurations",
          ],
        },
        {
          title: "6. Supplier Conformance",
          body: "Each component supplier must provide evidence of IEC 62443-4-2 conformance:",
          bullets: [
            "Conformance statement specifying the achieved component security level (SL-C)",
            "Security capability documentation for each requirement",
            "Evidence of IEC 62443-4-1 secure development lifecycle compliance",
            "Vulnerability disclosure and patch management policy",
            "Security update availability timeline and delivery mechanism",
          ],
        },
        {
          title: "7. Gaps and Remediation",
          body: "Components with security capability gaps (FAIL assessments) require:",
          bullets: [
            "Formal non-conformance notice to supplier",
            "Compensating countermeasure at system level (documented and approved)",
            "Remediation timeline agreed with supplier",
            "Re-assessment after supplier delivers patch or update",
          ],
        },
      ];

    case "iec-zone-conduit":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This Zone and Conduit Record documents the security zones and conduits defined for the CBS of vessel "${project.vesselName}" in accordance with IEC 62443-3-2. Each zone groups assets with similar security requirements, and conduits define the controlled communication paths between zones.`,
        },
        {
          title: "2. Normative References",
          body: "This record references:",
          bullets: [
            "IEC 62443-3-2:2020 — Zone and conduit definition (Section 5)",
            "IEC 62443-3-3 — System security requirements (FR 5: Restricted Data Flow)",
            "IACS UR E26 — Network zone and conduit design requirements",
            "IEC 62443-2-1 — Zone and conduit management procedures",
          ],
        },
        {
          title: "3. Zone Definitions",
          body: `The CBS is divided into ${zones.size} security zone(s). Each zone is defined by its assets, trust level, target security level (SL-T), and boundary characteristics.`,
        },
        {
          title: "4. Zone Asset Assignments",
          body: `The following ${hardware.length} hardware assets are assigned to security zones. Zone assignment determines the security level requirements applicable to each asset and the controls that must be in place at zone boundaries.`,
        },
        {
          title: "5. Conduit Definitions",
          body: "Conduits are the controlled communication channels between zones. Each conduit is defined by:",
          bullets: [
            "Source zone and destination zone",
            "Protocols permitted through the conduit",
            "Direction of permitted data flow (unidirectional/bidirectional)",
            "Boundary device implementing the conduit control (firewall, data diode, gateway)",
            "Security level capability of the conduit device",
          ],
        },
        {
          title: "6. External Connections",
          body: "External network connections (outside the vessel CBS) require dedicated conduit definitions with the highest security controls:",
          bullets: [
            "Shore-based network connections (satellite, LTE, port connectivity)",
            "Vendor remote access connections",
            "Classification society survey connections",
            "Any connection to networks outside the vessel boundary",
          ],
        },
        {
          title: "7. Zone and Conduit Management",
          body: "Changes to zone or conduit definitions require:",
          bullets: [
            "Formal change request through the Change Management process (ref: E27-MOC)",
            "Security risk assessment of the proposed change",
            "Update to this Zone and Conduit Record",
            "Update to the Zones and Conduits Diagram (ref: E26-ZCD)",
            "Notification to classification society if change affects type-approved configuration",
          ],
        },
      ];

    // ─── NIST SP 800 documents ────────────────────────────────

    case "nist-baseline-config":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This Baseline Configuration Document establishes the approved baseline security configurations for all CBS components of vessel "${project.vesselName}" in accordance with NIST SP 800-53 (CM-2: Baseline Configuration) and NIST SP 800-128 (Guide for Security-Focused Configuration Management). It defines the approved, hardened configuration state that all components must maintain.`,
        },
        {
          title: "2. Normative References",
          body: "This document references:",
          bullets: [
            "NIST SP 800-53 Rev. 5 — CM-2 (Baseline Configuration), CM-6 (Configuration Settings)",
            "NIST SP 800-128 — Guide for Security-Focused Configuration Management",
            "NIST SP 800-70 — National Checklist Program for IT Products",
            "IACS UR E27 — Security configuration requirements (SC-1 to SC-13)",
            "CIS Benchmarks — Component-specific hardening guidelines",
          ],
        },
        {
          title: "3. Baseline Configuration Policy",
          body: "The baseline configuration policy requires:",
          bullets: [
            "All CBS components must be configured in accordance with approved baselines before deployment",
            "Deviations from baseline require formal approval through the change management process",
            "Baseline configurations must be updated following every major OS or firmware upgrade",
            "Annual review of all baselines against current security best practices",
            "Baseline configurations stored in version-controlled secure repository",
          ],
        },
        {
          title: "4. Component Inventory and Baseline Status",
          body: `The following ${hardware.length} hardware assets require baseline configuration documentation. Baseline status is tracked in the security capability assessment (SC-5: Least Functionality / SC-13: Patch Management).`,
        },
        {
          title: "5. Baseline Configuration Elements",
          body: "Each component baseline configuration must document:",
          bullets: [
            "Operating system and version, service pack/patch level",
            "Enabled/disabled services and protocols (principle of least functionality)",
            "Port configuration — open ports with justification for each",
            "User accounts — active accounts with assigned roles and privileges",
            "Password policy settings (minimum length, complexity, expiry, lockout)",
            "Audit logging configuration — enabled event types, log size, retention",
            "Network settings — IP address, VLAN, firewall rules",
            "Anti-malware configuration (if applicable)",
            "Encryption settings for data at rest and in transit",
          ],
        },
        {
          title: "6. Configuration Deviation Management",
          body: "When a deviation from baseline is identified or required:",
          bullets: [
            "Document the deviation with technical justification",
            "Perform risk assessment of the deviation",
            "Obtain approval from designated security authority",
            "Implement compensating control where baseline cannot be met",
            "Set remediation timeline if deviation is temporary",
            "Track in configuration management system",
          ],
        },
        {
          title: "7. Baseline Verification",
          body: "Baseline compliance is verified through:",
          bullets: [
            "Security capability assessment (SC-1 to SC-13) at commissioning and annually",
            "Automated configuration scanning where tools are available",
            "Post-change verification for all approved configuration changes",
            "Random spot-check sampling during classification society surveys",
          ],
        },
      ];

    case "nist-iam":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This Identity and Access Management (IAM) Policy defines the requirements for managing digital identities and controlling access to the CBS of vessel "${project.vesselName}" in accordance with NIST SP 800-53 (AC family and IA family controls). It covers user identity lifecycle management, authentication, authorization, and privileged access management.`,
        },
        {
          title: "2. Normative References",
          body: "This policy references:",
          bullets: [
            "NIST SP 800-53 Rev. 5 — AC (Access Control) and IA (Identification and Authentication) control families",
            "NIST SP 800-63B — Digital Identity Guidelines (authentication)",
            "NIST SP 800-162 — Guide to Attribute Based Access Control (ABAC)",
            "IACS UR E27 — SC-1 (Password), SC-2 (Account Management), SC-3 (Network Access), Cap. 1-7",
            "IEC 62443-3-3 — FR 1 (Identification and Authentication Control)",
          ],
        },
        {
          title: "3. Identity Lifecycle Management",
          body: "User identity lifecycle procedures:",
          bullets: [
            "PROVISION — Identity created upon formal request with minimum information required; approval by designated security authority",
            "ACTIVATE — Account activated only after completion of initial security training",
            "MAINTAIN — Quarterly account review; update roles upon personnel transfers",
            "SUSPEND — Account suspended within 24 hours of personnel departure or role change",
            "DEPROVISION — Account deleted and credentials invalidated; access removal verified",
          ],
        },
        {
          title: "4. Authentication Requirements",
          body: "Authentication standards for CBS access:",
          bullets: [
            "Password Authentication Level 1 — Standard users: minimum 8 characters, complexity required, 180-day maximum",
            "Password Authentication Level 2 — Privileged users: minimum 12 characters, complexity required, 90-day maximum, MFA required",
            "Certificate-based Authentication — Machine accounts and service accounts; PKI-based certificates with 1-year maximum validity",
            "MFA — Required for privileged accounts and all remote access (two independent factors)",
            "Biometric — Acceptable as second factor where technically available",
          ],
        },
        {
          title: "5. Authorization Framework",
          body: "Access authorization follows least privilege principles:",
          bullets: [
            "Role-Based Access Control (RBAC) — Access permissions assigned to roles, not individuals",
            "Defined roles: Administrator, Operator, Auditor, Service Technician (read-only, elevated, full access respectively)",
            "Segregation of duties — No single account combines conflicting privileges",
            "Time-based access — Service accounts automatically expire; temporary access has defined end date",
            "Attribute-based controls — Network zone and time-of-day restrictions where technically feasible",
          ],
        },
        {
          title: "6. Privileged Access Management (PAM)",
          body: "Elevated privilege controls for administrator accounts:",
          bullets: [
            "Dedicated privileged accounts separate from standard user accounts",
            "Privileged sessions logged with full audit trail",
            "Just-in-time access — Privileged access granted only for the duration of the task",
            "Break-glass procedure — Emergency privileged access with automatic notification and full logging",
            "Shared administration accounts prohibited — All privileged access individually assigned",
          ],
        },
        {
          title: "7. Access Review and Audit",
          body: "IAM compliance is maintained through:",
          bullets: [
            "Quarterly access review — All active accounts verified against current personnel roster",
            "Annual privilege review — Confirm appropriateness of all elevated privileges",
            "Automated alerts for dormant accounts (>30 days inactive)",
            "Access review results documented and retained for 2 years",
          ],
        },
        {
          title: "8. CBS IAM Status",
          body: `IAM controls are assessed across ${hardware.length} CBS assets through security capability checks SC-1 (Password Policy), SC-2 (Account Management), and SC-3 (Network Access Control). Current status: ${counts.pass} PASS, ${counts.fail} FAIL out of ${counts.total} checks.`,
        },
      ];

    case "nist-supply-chain":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This Supply Chain Risk Management (SCRM) Plan defines the processes for identifying, assessing, and managing cybersecurity risks in the supply chain for CBS components of vessel "${project.vesselName}" in accordance with NIST SP 800-161 Rev. 1 (Cybersecurity Supply Chain Risk Management Practices) and NIST SP 800-53 (SR family controls).`,
        },
        {
          title: "2. Normative References",
          body: "This plan references:",
          bullets: [
            "NIST SP 800-161 Rev. 1 — Cybersecurity Supply Chain Risk Management Practices",
            "NIST SP 800-53 Rev. 5 — SR (Supply Chain Risk Management) control family",
            "NIST Cybersecurity Framework — Identify / Supply Chain Risk Management",
            "IACS UR E27 — Supply chain security requirements",
            "IEC 62443-2-4 — Requirements for IACS solution suppliers",
          ],
        },
        {
          title: "3. Supply Chain Risk Context",
          body: `The CBS supply chain includes ${hardware.length} hardware components from ${new Set(hardware.map((h) => h.manufacturer).filter(Boolean)).size} manufacturer(s) and ${software.length} software components from ${new Set(software.map((s) => s.vendor).filter(Boolean)).size} vendor(s). Each introduces potential supply chain risks that must be managed throughout the component lifecycle.`,
        },
        {
          title: "4. Supplier Qualification",
          body: "Suppliers of CBS components must be qualified through:",
          bullets: [
            "Cybersecurity questionnaire covering: development security practices, incident response capability, vulnerability disclosure policy, update/patch commitment",
            "Review of relevant security certifications (IEC 62443-4-1/4-2, ISO 27001, CMMI)",
            "Reference checks with other maritime operators or classification societies",
            "OFAC/sanctions screening and country-of-origin assessment",
            "Annual re-qualification for critical suppliers",
          ],
        },
        {
          title: "5. Procurement Controls",
          body: "Cybersecurity requirements in procurement:",
          bullets: [
            "Security requirements specification included in procurement documents",
            "Contractual obligations: vulnerability disclosure, patch support period, end-of-life notification",
            "Authenticity requirements: tamper-evident packaging, certificate of conformity, component serial numbers",
            "Software integrity: digital signatures or checksums provided with all software deliverables",
            "Component provenance documentation: full supply chain documentation from origin to delivery",
          ],
        },
        {
          title: "6. Component Integrity Verification",
          body: "Upon receipt of CBS components:",
          bullets: [
            "Physical inspection — Verify packaging integrity, labels, serial numbers against order",
            "Software verification — Validate digital signatures or checksums before installation",
            "Authenticity verification — Confirm component is genuine (contact vendor if counterfeit suspected)",
            "Pre-installation scan — Malware scan of software media before deployment",
            "Documentation check — Verify security capability documentation is provided",
          ],
        },
        {
          title: "7. Ongoing Supplier Management",
          body: "Continuous supply chain risk management activities:",
          bullets: [
            "Monitor vendor security advisories and CVE publications for installed components",
            "Track end-of-life dates for all hardware and software — plan replacement before support ends",
            "Review and act on vendor vulnerability notifications within 30 days",
            "Assess impact of vendor security incidents on CBS components",
            "Maintain approved vendor list — remove suppliers failing to meet security obligations",
          ],
        },
      ];

    case "nist-system-assessment":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This System Security Assessment evaluates the security posture of the CBS of vessel "${project.vesselName}" in accordance with NIST SP 800-53A Rev. 5 (Assessing Security and Privacy Controls). It provides an independent evaluation of security control implementation and effectiveness to support authorization decisions.`,
        },
        {
          title: "2. Normative References",
          body: "This assessment references:",
          bullets: [
            "NIST SP 800-53A Rev. 5 — Assessing Security and Privacy Controls in Information Systems",
            "NIST SP 800-53 Rev. 5 — Security and Privacy Controls (baseline)",
            "NIST SP 800-37 Rev. 2 — Risk Management Framework (authorization process)",
            "IACS UR E27 — Security capability assessment (SC-1 to SC-13)",
            "IEC 62443-3-3 — System security requirements and security levels",
          ],
        },
        {
          title: "3. Assessment Methodology",
          body: "The assessment uses three assessment methods per NIST SP 800-53A:",
          bullets: [
            "EXAMINE — Review of policies, procedures, plans, and documentation",
            "INTERVIEW — Discussion with responsible personnel to verify implementation",
            "TEST — Direct testing of security controls using the SCS Platform assessment tools (SC-1 to SC-13)",
          ],
        },
        {
          title: "4. System Description",
          body: `The system under assessment is the CBS of vessel "${project.vesselName}". It includes ${hardware.length} hardware assets and ${software.length} software components across ${zones.size} security zone(s): ${[...zones.keys()].join(", ")}. The system supports vessel navigation, propulsion, cargo, and safety functions.`,
        },
        {
          title: "5. Control Assessment Summary",
          body: `Security control assessment results: ${counts.pass} controls satisfied (PASS), ${counts.fail} controls not satisfied (FAIL), ${counts.partial} controls partially satisfied (PARTIAL), ${counts.na} controls not applicable out of ${counts.total} assessed. Controls not yet assessed require assessment before authorization.`,
        },
        {
          title: "6. Assessment Findings",
          body: "Assessment findings are categorized by severity:",
          bullets: [
            "HIGH — FAIL results for controls protecting critical functions (propulsion, navigation, safety). Require immediate remediation before authorization.",
            "MODERATE — FAIL results for controls protecting operational functions. Require remediation plan with 90-day target.",
            "LOW — PARTIAL results where compensating controls are in place. Document acceptance and monitor.",
            "INFORMATIONAL — Observations and recommendations for security improvement beyond minimum requirements.",
          ],
        },
        {
          title: "7. Authorization Recommendation",
          body: "Based on the assessment findings, this system is recommended for:",
          bullets: [
            "AUTHORIZATION TO OPERATE (ATO) — If all HIGH findings are resolved and MODERATE findings have accepted plans",
            "PROVISIONAL AUTHORIZATION — If HIGH findings exist but compensating controls are documented and accepted",
            "DENIAL OF AUTHORIZATION — If critical HIGH findings remain unresolved with no accepted compensating controls",
            "(Final authorization decision is made by the designated authorizing official / classification society.)",
          ],
        },
        {
          title: "8. Plan of Action and Milestones",
          body: "Outstanding findings require a Plan of Action and Milestones (POA&M) documenting:",
          bullets: [
            "Finding description and reference to specific control(s) not met",
            "Responsible party for remediation",
            "Planned completion date",
            "Resources required",
            "Current status and progress",
          ],
        },
      ];

    // ─── ISO 27001 documents ──────────────────────────────────

    case "iso-soa":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This Statement of Applicability (SoA) identifies which ISO/IEC 27001:2022 Annex A controls are applicable to the CBS of vessel "${project.vesselName}" and documents the justification for inclusion or exclusion of each control. The SoA is a mandatory document for ISO 27001 certification.`,
        },
        {
          title: "2. Normative Reference",
          body: "This document is required by:",
          bullets: [
            "ISO/IEC 27001:2022 — Clause 6.1.3(d): Statement of Applicability",
            "ISO/IEC 27001:2022 — Annex A: Reference control set (93 controls in 4 themes)",
            "ISO/IEC 27002:2022 — Implementation guidance for controls",
          ],
        },
        {
          title: "3. ISMS Scope",
          body: `The Information Security Management System (ISMS) covers the CBS of vessel "${project.vesselName}", comprising ${hardware.length} hardware assets and ${software.length} software components across ${zones.size} security zone(s). The ISMS boundary includes all OT and IT systems that process or transmit information relevant to vessel safety and operations.`,
        },
        {
          title: "4. Control Selection Process",
          body: "Controls were selected based on:",
          bullets: [
            "Results of the information security risk assessment",
            "Legal, regulatory, and contractual requirements (IACS UR E26/E27, maritime law)",
            "Organizational objectives and existing security measures",
            "Threat landscape specific to maritime OT/IT environments",
          ],
        },
        {
          title: "5. Annex A Control Applicability Overview",
          body: "The 93 Annex A controls are organized in 4 themes. Applicability summary:",
          bullets: [
            "Theme A.5 Organizational Controls (37 controls) — APPLICABLE: Policy, roles, supplier security, incident management",
            "Theme A.6 People Controls (8 controls) — APPLICABLE: Screening, terms, awareness, training, disciplinary, remote work",
            "Theme A.7 Physical Controls (14 controls) — APPLICABLE: Physical security perimeters, equipment protection, media handling",
            "Theme A.8 Technological Controls (34 controls) — APPLICABLE: Access control, cryptography, vulnerability management, configuration management",
          ],
        },
        {
          title: "6. Excluded Controls",
          body: "The following control categories are excluded with justification:",
          bullets: [
            "Controls requiring internet-facing web services — Not applicable to isolated CBS OT network",
            "Human resources controls for onshore office environments — Covered by separate company ISMS",
            "Development environment controls — Not applicable where no in-house development occurs",
            "(Complete exclusion justification table to be maintained as an annex to this document.)",
          ],
        },
        {
          title: "7. Implementation Status",
          body: `Current implementation status based on security assessment: ${counts.pass} controls implemented (PASS), ${counts.fail} controls not yet implemented (FAIL), ${counts.partial} controls partially implemented (PARTIAL). Detailed status per Annex A control is maintained in the control implementation register.`,
        },
      ];

    case "iso-isms":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document defines the scope and policy of the Information Security Management System (ISMS) for the CBS of vessel "${project.vesselName}" in accordance with ISO/IEC 27001:2022 (Clauses 4 and 5). It establishes the organizational context, stakeholder requirements, ISMS boundary, and the information security policy.`,
        },
        {
          title: "2. Normative Reference",
          body: "This ISMS is established in accordance with:",
          bullets: [
            "ISO/IEC 27001:2022 — Information security management systems",
            "ISO/IEC 27002:2022 — Information security controls (implementation guidance)",
            "ISO/IEC 27019:2017 — OT/ICS security (applicable for maritime OT systems)",
            "IACS UR E26/E27 — Maritime cyber resilience (complementary requirements)",
            `${project.classification || "Classification Society"} — Applicable cybersecurity certification requirements`,
          ],
        },
        {
          title: "3. Organizational Context",
          body: `The vessel "${project.vesselName}" operates as part of the fleet of ${project.shipowner || "[Ship Owner]"}. The CBS supports critical vessel functions including navigation, propulsion, cargo management, and safety systems. The organizational context includes:`,
          bullets: [
            "Internal factors — Organizational structure, roles and responsibilities, existing SMS/ISM systems, CBS architecture",
            "External factors — Regulatory requirements (SOLAS, MARPOL, ISPS), classification society rules, flag state requirements, port state control",
            "Interested parties — Classification society, flag state, ship owner, charterers, port authorities, service vendors",
          ],
        },
        {
          title: "4. ISMS Scope",
          body: `The ISMS scope covers the CBS of vessel "${project.vesselName}", including: ${hardware.length} hardware assets and ${software.length} software components across ${zones.size} security zone(s): ${[...zones.keys()].join(", ")}. Shore-based systems that directly interface with the vessel CBS are included within scope. Shore office IT infrastructure is excluded (covered by separate company ISMS).`,
        },
        {
          title: "5. Information Security Policy",
          body: `The information security policy of vessel "${project.vesselName}" states:`,
          bullets: [
            "COMMITMENT — The Master and Ship Owner are committed to protecting the confidentiality, integrity, and availability of information processed by the CBS",
            "OBJECTIVES — Maintain cyber resilience of all CBS systems; comply with IACS UR E26/E27 and ISO 27001; protect vessel safety through information security",
            "RISK APPROACH — Manage information security risks systematically using a risk-based approach; define and achieve acceptable risk levels",
            "CONTINUAL IMPROVEMENT — Continuously improve the ISMS through monitoring, measurement, audit, and management review",
            "COMPLIANCE — Comply with all applicable legal, regulatory, and contractual requirements",
          ],
        },
        {
          title: "6. ISMS Roles and Responsibilities",
          body: "Top management has appointed the following ISMS roles (ISO 27001 Clause 5.3):",
          bullets: [
            "ISMS Owner — DPA/Master: Overall ISMS accountability, policy approval, resource provision",
            "Information Security Officer — CSO/SSO: ISMS implementation, monitoring, and reporting",
            "Risk Owner — Department Heads: Accept and manage risks within their operational area",
            "ISMS Coordinator — IT/OT Administrator: Day-to-day ISMS operation and maintenance",
          ],
        },
        {
          title: "7. ISMS Objectives",
          body: "The ISMS objectives for the current period are:",
          bullets: [
            "Achieve and maintain >80% PASS rate on security capability assessment (SC-1 to SC-13)",
            "Complete annual risk assessment and update risk treatment plan",
            "Maintain 100% crew cybersecurity awareness training completion",
            "Zero critical cyber incidents with unacceptable impact on vessel safety",
            "Achieve ISO 27001 certification / maintain IACS UR E26/E27 compliance",
          ],
        },
      ];

    case "iso-a5":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document implements ISO/IEC 27001:2022 Annex A, Theme A.5 (Organizational Controls) for the CBS of vessel "${project.vesselName}". It covers the 37 organizational controls addressing policies, information security roles, segregation of duties, supplier relationships, and incident management.`,
        },
        {
          title: "2. Key A.5 Controls Implemented",
          body: "The following organizational controls are implemented:",
          bullets: [
            "A.5.1 — Information security policies: Policies approved by management, communicated, reviewed annually",
            "A.5.2 — Information security roles: Roles defined (see ISMS document); responsibilities assigned to named individuals",
            "A.5.3 — Segregation of duties: No single person controls all aspects of CBS administration",
            "A.5.4 — Management responsibilities: Management actively supports information security",
            "A.5.5 — Contact with authorities: Contacts established with classification society, flag state, and CERTs",
            "A.5.7 — Threat intelligence: Maritime threat intelligence sources monitored (classification society bulletins, BIMCO advisories)",
            "A.5.8 — Information security in project management: CBS changes assessed for security impact before implementation",
          ],
        },
        {
          title: "3. Supplier and Third-Party Security (A.5.19–A.5.23)",
          body: "Supplier security controls:",
          bullets: [
            "A.5.19 — Information security in supplier relationships: Security requirements in all vendor contracts",
            "A.5.20 — Security in supplier agreements: Contractual security obligations for patch support, vulnerability disclosure",
            "A.5.21 — Managing security in ICT supply chain: Supply chain risk assessment for all critical components",
            "A.5.22 — Monitoring and review of supplier services: Annual supplier review against security obligations",
            "A.5.23 — Security for cloud services: Cloud service security assessed before adoption",
          ],
        },
        {
          title: "4. Incident Management (A.5.24–A.5.28)",
          body: "Incident management controls:",
          bullets: [
            "A.5.24 — Planning and preparation for information security incident management: Incident response plan documented (ref: E27-INC)",
            "A.5.25 — Assessment and decision on information security events: Classification criteria defined",
            "A.5.26 — Response to information security incidents: Step-by-step response procedures documented",
            "A.5.27 — Learning from information security incidents: Post-incident review process established",
            "A.5.28 — Collection of evidence: Evidence handling procedures for incidents defined",
          ],
        },
        {
          title: "5. Business Continuity and Compliance (A.5.29–A.5.37)",
          body: "Business continuity and compliance controls:",
          bullets: [
            "A.5.29 — Information security during disruption: Business continuity plan includes CBS degraded operation procedures",
            "A.5.30 — ICT readiness for business continuity: Backup and recovery procedures tested annually",
            "A.5.31 — Legal, statutory, regulatory, and contractual requirements: Compliance register maintained",
            "A.5.33 — Protection of records: Information security records retained per regulatory requirements",
            "A.5.36 — Compliance with policies, rules, and standards: Regular compliance checks performed",
            "A.5.37 — Documented operating procedures: Security operating procedures documented and accessible",
          ],
        },
        {
          title: "6. Implementation Status",
          body: `Organizational controls implementation status: assessed through management interviews, document review, and observation. Current assessment results relevant to A.5 controls: ${counts.total} checks performed across ${hardware.length} assets.`,
        },
      ];

    case "iso-a7":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document implements ISO/IEC 27001:2022 Annex A, Theme A.7 (People Controls) for the CBS of vessel "${project.vesselName}". It covers the 8 people controls addressing personnel security through the employment lifecycle, from pre-employment screening through termination.`,
        },
        {
          title: "2. A.7 People Controls Overview",
          body: "The following eight people controls are implemented:",
          bullets: [
            "A.7.1 — Screening: Background verification for personnel in roles with CBS access",
            "A.7.2 — Terms and conditions of employment: Security responsibilities in employment contracts and crew agreements",
            "A.7.3 — Information security awareness, education, and training: Annual security awareness training for all crew (ref: E26-TRA)",
            "A.7.4 — Disciplinary process: Disciplinary measures for personnel violating security policies",
            "A.7.5 — Responsibilities after termination or change of employment: Access revocation procedure on departure or role change",
            "A.7.6 — Confidentiality or non-disclosure agreements: NDAs for personnel with access to sensitive system information",
            "A.7.7 — Remote working: Security controls for remote access (ref: E26-RAP)",
            "A.7.8 — Information security event reporting: All personnel required to report suspicious events to SSO",
          ],
        },
        {
          title: "3. Personnel Screening (A.7.1)",
          body: "Background verification requirements for CBS access roles:",
          bullets: [
            "Verification of identity documents and qualifications (as required for maritime certificates)",
            "Reference checks for critical IT/OT administration roles",
            "Criminal background check where permitted by flag state law",
            "Vendor/contractor personnel screening verification required before system access",
          ],
        },
        {
          title: "4. Security Training Program (A.7.3)",
          body: `The security awareness and training program covers ${hardware.length > 0 ? hardware.length : "[number]"} CBS assets and is delivered to all personnel with system access. Training content, schedule, and records are documented in the Crew Cyber Security Training Record (E26-TRA). Key training elements:`,
          bullets: [
            "Annual mandatory security awareness training for all crew",
            "Role-specific training for operators and administrators",
            "Incident response procedures training",
            "Phishing and social engineering awareness",
            "Password and account security best practices",
          ],
        },
        {
          title: "5. Access Revocation Process (A.7.5)",
          body: "Upon personnel departure or role change:",
          bullets: [
            "SSO/HR notifies IT/OT Administrator on departure date (minimum 24 hours notice)",
            "All CBS user accounts deactivated within 24 hours of departure",
            "Physical access credentials (keys, badges) recovered on last day",
            "Service accounts and shared credentials changed if shared with departing personnel",
            "Access revocation confirmed and documented in IAM log",
          ],
        },
        {
          title: "6. Remote Working Security (A.7.7)",
          body: "Remote working security for personnel accessing CBS from shore:",
          bullets: [
            "Remote access subject to Remote Access Policy (ref: E26-RAP)",
            "Corporate-issued devices required for remote CBS access where possible",
            "VPN required for all remote connections to CBS management systems",
            "Clear-screen and lock policy when remote working in public spaces",
          ],
        },
      ];

    case "iso-a8":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document implements ISO/IEC 27001:2022 Annex A, Theme A.8 (Technological Controls) for the CBS of vessel "${project.vesselName}". It covers the 34 technology controls addressing access rights, configuration management, cryptography, network security, and vulnerability management.`,
        },
        {
          title: "2. Access Control Technology (A.8.1–A.8.6)",
          body: "Technology controls for access management:",
          bullets: [
            "A.8.2 — Privileged access rights: Privileged accounts documented; usage monitored (ref: IAM Policy NIST-IAM)",
            "A.8.3 — Information access restriction: Role-based access control implemented across CBS assets",
            "A.8.4 — Access to source code: Source code repositories access-controlled; not applicable if no in-house development",
            "A.8.5 — Secure authentication: MFA enforced for privileged and remote access (ref: E27-ACC, E26-RAP)",
            "A.8.6 — Capacity management: CBS system capacity monitored; alerts configured at 80% utilization",
          ],
        },
        {
          title: "3. Cryptography and Data Protection (A.8.24–A.8.25)",
          body: "Cryptographic controls:",
          bullets: [
            "A.8.24 — Use of cryptography: Cryptography policy defined; minimum TLS 1.2 for data in transit; AES-128 or better for data at rest",
            "A.8.25 — Secure development lifecycle: Secure development practices applied to any in-house CBS software (ref: E27-SDL)",
          ],
        },
        {
          title: "4. Malware and Technical Vulnerability Management (A.8.7–A.8.8)",
          body: "Protection against malicious code and vulnerabilities:",
          bullets: [
            "A.8.7 — Protection against malware: Anti-malware deployed on compatible assets; application whitelisting as alternative where AV not feasible (mapped to E27 SC-11)",
            "A.8.8 — Management of technical vulnerabilities: Vulnerability assessment performed (ref: E27-VUL); CVE monitoring for all registered software components",
          ],
        },
        {
          title: "5. Configuration and Change Management (A.8.9–A.8.10)",
          body: "Configuration controls:",
          bullets: [
            "A.8.9 — Configuration management: Baseline configurations documented (ref: NIST-CFG); deviations require approval",
            "A.8.10 — Information deletion: Secure deletion procedures for decommissioned equipment",
          ],
        },
        {
          title: "6. Logging, Monitoring, and Network Security (A.8.13–A.8.22)",
          body: "Security monitoring and network controls:",
          bullets: [
            "A.8.15 — Logging: Audit logging enabled on all CBS assets (ref: E27-MON, SC-7)",
            "A.8.16 — Monitoring activities: Security monitoring plan implemented; alerts for anomalous events",
            "A.8.17 — Clock synchronization: NTP time synchronization configured for audit log integrity",
            "A.8.20 — Networks security: Network security controls implemented per zone architecture (ref: E26-ZCD)",
            "A.8.21 — Security of network services: Network service security validated during commissioning",
            "A.8.22 — Segregation of networks: Network segmentation into security zones implemented (ref: zone-design)",
          ],
        },
        {
          title: "7. Implementation Status",
          body: `Technology control implementation status based on security capability assessment (SC-1 to SC-13): ${counts.pass} PASS, ${counts.fail} FAIL, ${counts.partial} PARTIAL out of ${counts.total} assessed across ${hardware.length} CBS hardware assets. Detailed control-by-control mapping to SC assessments is maintained in the control implementation register.`,
        },
      ];

    case "iso-cloud":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This Cloud Services Security Policy defines the security requirements for cloud services used in support of the CBS management of vessel "${project.vesselName}" in accordance with ISO/IEC 27001:2022 (A.5.23 — Security for use of cloud services) and ISO/IEC 27017:2015 (Code of practice for information security controls for cloud services).`,
        },
        {
          title: "2. Normative References",
          body: "This policy references:",
          bullets: [
            "ISO/IEC 27001:2022 — A.5.23: Security for use of cloud services",
            "ISO/IEC 27017:2015 — Code of practice for cloud service information security",
            "ISO/IEC 27018:2019 — Protection of personally identifiable information in public clouds",
            "NIST SP 800-144 — Guidelines on security and privacy in public cloud computing",
            "IACS UR E26 — Requirements for shore-based systems interfacing with vessel CBS",
          ],
        },
        {
          title: "3. Approved Cloud Use Cases",
          body: "The following cloud service use cases are approved for CBS-related functions:",
          bullets: [
            "CBS data backup — Encrypted backup storage for non-critical configuration data and logs",
            "Remote monitoring — Cloud-based dashboards for vessel performance and security monitoring (read-only, anonymized)",
            "Software distribution — Vendor-operated update repositories for CBS software patches",
            "Documentation management — Secure cloud storage for compliance documents (this system — SCS Platform)",
            "Classification society connectivity — Secure data exchange with classification society survey systems",
          ],
        },
        {
          title: "4. Prohibited Cloud Uses",
          body: "The following cloud uses are prohibited without specific risk assessment and DPA approval:",
          bullets: [
            "Direct cloud connectivity from operational CBS networks (OT zone isolation must be maintained)",
            "Processing of safety-critical control data in cloud environments",
            "Cloud storage of unencrypted vessel operational data",
            "Use of unsanctioned cloud services (shadow IT) by individual crew or administrators",
          ],
        },
        {
          title: "5. Cloud Service Provider Requirements",
          body: "Cloud service providers used for CBS-related functions must meet:",
          bullets: [
            "ISO/IEC 27001 certification or equivalent independently verified security standard",
            "Data residency requirements compatible with flag state and applicable law",
            "Encryption at rest (AES-256 or equivalent) and in transit (TLS 1.2+)",
            "Multi-factor authentication for administrative access to cloud management consoles",
            "Incident notification within 24 hours of security breach affecting vessel data",
            "Data portability — ability to retrieve and delete all vessel data upon contract termination",
          ],
        },
        {
          title: "6. CBS Network Isolation Requirements",
          body: "Cloud connectivity must not compromise CBS OT network isolation:",
          bullets: [
            "Direct internet access from OT zone is prohibited — all cloud connectivity through dedicated DMZ or management network",
            "Data diode or application-layer gateway used for OT-to-cloud data transfer where required",
            "Air gap maintained for safety-critical systems regardless of cloud architecture",
            "Cloud-connected systems classified in dedicated security zone (not within OT zone boundary)",
          ],
        },
        {
          title: "7. Cloud Service Risk Assessment",
          body: "Before adopting any new cloud service related to CBS management:",
          bullets: [
            "Risk assessment performed per IEC 62443-3-2 or ISO 27001 risk framework",
            "Data classification assessment — determine what data will be processed in the cloud",
            "CSP security assessment using standardized questionnaire (CSA CAIQ or equivalent)",
            "Legal review — data protection law compliance, contractual requirements",
            "DPA and Ship Owner approval required before deployment",
          ],
        },
      ];

    case "iso-ics":
      return [
        {
          title: "1. Purpose and Scope",
          body: `This document extends the ISMS of vessel "${project.vesselName}" to address the specific security requirements of industrial control systems (ICS) and operational technology (OT) in accordance with ISO/IEC 27019:2017 (Information security controls for the energy utility industry — applicable OT principles) and IEC 62443. It addresses the differences between IT security and OT security in the maritime CBS environment.`,
        },
        {
          title: "2. Normative References",
          body: "This extension references:",
          bullets: [
            "ISO/IEC 27019:2017 — Information security controls for the energy utility industry (OT controls applicable to maritime)",
            "IEC 62443-2-1 — Security management system for IACS",
            "IEC 62443-3-3 — System security requirements and security levels",
            "IACS UR E26/E27 — Maritime OT/ICS security requirements",
            "NIST SP 800-82 Rev. 3 — Guide to OT Security",
            "NERC CIP — Critical infrastructure protection (applicable principles)",
          ],
        },
        {
          title: "3. OT/ICS Security Challenges",
          body: "OT systems in maritime environments have characteristics that require security approaches different from standard IT:",
          bullets: [
            "Availability priority — OT systems must maintain high availability; patches and updates require careful planning to avoid downtime",
            "Long lifecycle — CBS hardware and software may remain operational for 10-30 years; legacy systems may lack modern security features",
            "Real-time constraints — Safety-critical systems operate under strict timing requirements; security controls must not impair real-time performance",
            "Proprietary protocols — Maritime OT uses specialized protocols (NMEA, Modbus, Profibus) with limited native security features",
            "Air gap expectation — Safety-critical systems traditionally isolated; but increasing connectivity creates new attack surfaces",
            "Safety-security interaction — Security controls must not degrade functional safety; safety always takes precedence",
          ],
        },
        {
          title: "4. OT-Specific Security Controls",
          body: `ISO 27019 extensions applied to the ${hardware.length} CBS assets across ${zones.size} zone(s):`,
          bullets: [
            "Patch management — Patches tested in isolated environment before deployment to operational systems; vendor-approved patches only; emergency patch procedures without full testing require safety officer sign-off",
            "Access management — Vendor/service access follows strict procedure (ref: E26-RAP); no anonymous or shared accounts; minimum required privilege principle",
            "Physical security — All OT equipment in physically secured locations; tamper-evident seals on cabinets; visual inspection during rounds",
            "Change management — All OT configuration changes follow formal change control (ref: E27-MOC); rollback procedures required before changes are applied",
            "Monitoring — Passive monitoring preferred for OT networks to avoid disrupting real-time operations; out-of-band management network for monitoring traffic",
            "Backup and recovery — Validated backup of all OT configurations; recovery procedures tested annually; recovery time targets compatible with safety requirements",
          ],
        },
        {
          title: "5. Legacy System Risk Management",
          body: "Legacy OT systems that cannot implement standard security controls require:",
          bullets: [
            "Compensating controls — Additional network isolation, monitoring, and physical access controls",
            "Formal risk acceptance — Documented acceptance of residual risk with DPA/Owner approval",
            "Upgrade/replacement planning — Lifecycle management plan targeting replacement before end of vendor support",
            "Enhanced monitoring — Increased monitoring frequency for legacy systems",
            "Restricted connectivity — Maximum isolation from other CBS zones and external networks",
          ],
        },
        {
          title: "6. Safety-Security Integration",
          body: "The interaction between functional safety and information security must be managed:",
          bullets: [
            "Safety system priority — Any security control that could degrade safety system performance is prohibited without safety engineer approval",
            "Fail-safe design — CBS security design ensures cyber incidents result in safe state (not dangerous state)",
            "Manual override — Manual override capabilities maintained for all safety-critical functions",
            "Joint assessment — Safety and security teams jointly assess proposed controls for safety-critical systems",
            "Reference: Vessel Safety Management System (SMS) and equipment safety manuals for specific safety requirements",
          ],
        },
        {
          title: "7. OT Security Monitoring",
          body: "Monitoring approaches adapted for OT environment:",
          bullets: [
            "Passive network monitoring — Traffic analysis without active probing of OT systems",
            "Industrial protocol analysis — Monitoring for anomalous commands in NMEA, Modbus, and other maritime protocols",
            "Behavioral baseline — Establish normal operational patterns; alert on deviations",
            "Log collection — Collect logs from OT systems that support logging; compensate with network monitoring for systems without logging capability",
            "Alert thresholds — Calibrated to minimize false positives that could distract operational personnel",
          ],
        },
      ];

    case "security-capabilities":
      return [
        { title: "1. Purpose", body: `This document describes the security capabilities implemented on CBS aboard vessel "${project.vesselName}" in accordance with IACS UR E27 §4.` },
        { title: "2. Regulatory Reference", body: "IACS UR E27 Rev.2 Section 4 — Security Capabilities Description\nIEC 62443-3-3 — System Security Requirements" },
        { title: "3. Access Control (SC-1, SC-2)", body: "Role-based access control (RBAC) is implemented on all CBS. Default and guest accounts are disabled at commissioning. Password policy enforces minimum 8 characters with complexity requirements. Account lockout threshold is set to ≤5 failed attempts." },
        { title: "4. Authentication (SC-1)", body: "Strong authentication is required for all local access. Multi-factor authentication (MFA) is enforced for remote access sessions. Session timeout is configured to lock after 15 minutes of inactivity." },
        { title: "5. Network Security (SC-5, SC-6)", body: "Network segmentation is implemented per IEC 62443 zone/conduit model. Legacy protocols (SMBv1, NetBIOS) are disabled. Windows Firewall is enabled on all profiles. RDP Network Level Authentication (NLA) is required for remote desktop connections." },
        { title: "6. Endpoint Protection (SC-10, SC-11)", body: "Anti-malware protection (Windows Defender) is enabled with real-time scanning. Automatic definition updates are configured. Screen lock timeout is set to ≤15 minutes. Ctrl+Alt+Del is required for logon." },
        { title: "7. Audit & Monitoring (SC-7)", body: "Security audit logging is enabled for all critical event categories (Success + Failure). Log retention period is ≥90 days. Security log minimum size is 196 MB. Monthly log review is conducted by IT Officer." },
        { title: "8. Update Management (SC-13)", body: "Patch management follows the procedure defined in E27-PAT. CAT I/II systems receive vendor-approved patches annually. CAT III systems receive automatic updates monthly. Critical vulnerabilities (CVSS ≥9.0) are patched within 30 days." },
        { title: "9. Capability Summary", body: "The table below maps implemented security capabilities to E27 Security Configuration (SC) requirements." },
      ];

    case "patch-management":
      return [
        { title: "1. Policy Statement", body: `This document defines the patch management procedure for all Computer Based Systems (CBS) aboard vessel "${project.vesselName}" in accordance with IACS UR E27 SC-13.` },
        { title: "2. Regulatory Reference", body: "IACS UR E27 Rev.2 — SC-13 (Software/Firmware Integrity)\nNIST SP 800-40 Rev.4 — Guide to Enterprise Patch Management\nCIS Controls v8 — Control 7 (Continuous Vulnerability Management)" },
        { title: "3. Scope", body: `This procedure applies to all ${hardware.length} CBS component(s) registered in the asset inventory. Systems are categorized per E26 Table 1 (CAT I, CAT II, CAT III) with different patch frequencies.` },
        { title: "4. Patch Schedule", body: "CAT I (Critical Navigation/Safety): Annually, vendor-approved media only, Chief Engineer responsible, Master + CSO approval required.\nCAT II (Essential Operations): Semi-annually, IT Officer responsible, CSO approval required.\nCAT III (Non-critical IT): Monthly automatic updates via WSUS/Windows Update, IT Officer responsible, CSO notification." },
        { title: "5. Patch Testing Process", body: "All patches for CAT I and CAT II systems must be tested in a controlled environment before deployment. Test results must be documented including system behavior verification and rollback capability confirmation. CAT III systems may receive automatic updates with post-deployment verification." },
        { title: "6. Emergency Patch Procedure", body: "For critical vulnerabilities (CVSS ≥9.0), emergency patching must be completed within 30 days. Emergency patches require CSO + Master approval. Post-implementation review must be conducted within 7 days. All emergency patches are logged in the Patch Log." },
        { title: "7. Patch Log", body: "All patch activities must be recorded in the following log format:\n(Date | System | Patch/KB ID | Version Before | Version After | Tested By | Applied By | Verified)" },
        { title: "8. Exceptions", body: "Systems that cannot be patched due to vendor restrictions, certification requirements, or operational constraints must be documented with compensating controls (network isolation, enhanced monitoring, additional access restrictions)." },
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
    // CVSS Priority Timeline
    content.push(heading2("Risk Prioritization Timeline"));
    content.push(buildTable(
      ["Severity", "CVSS Range", "Remediation Timeline", "Action Required"],
      [
        ["CRITICAL", "9.0 — 10.0", "Within 7 days", "Emergency patch, CSO + Master approval"],
        ["HIGH", "7.0 — 8.9", "Within 30 days", "Scheduled patch, CSO approval"],
        ["MEDIUM", "4.0 — 6.9", "Within 90 days", "Next maintenance window"],
        ["LOW", "0.1 — 3.9", "Quarterly review", "Monitor and assess during routine maintenance"],
      ],
    ));
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

  if (focus === "incident") {
    // Incident Classification with maritime examples
    content.push(heading2("Incident Classification"));
    content.push(buildTable(
      ["Level", "Description", "Maritime Example", "Response Time"],
      [
        ["CRITICAL", "Safety-critical system compromise", "Ransomware on ECDIS, GPS spoofing affecting navigation", "Immediate (< 1 hour)"],
        ["HIGH", "Essential system compromise", "Engine control system unauthorized access, AIS manipulation", "< 4 hours"],
        ["MEDIUM", "Non-critical system incident", "Unauthorized USB device connected, unauthorized access attempt", "< 24 hours"],
        ["LOW", "Minor security event", "Failed login attempts, policy violation, phishing email received", "< 72 hours"],
      ],
    ));
    // RPO/RTO by CAT
    content.push(heading2("Recovery Point/Time Objectives"));
    content.push(buildTable(
      ["System Category", "RPO (Max Data Loss)", "RTO (Max Downtime)", "Backup Location"],
      [
        ["CAT I (Navigation/Safety)", "24 hours", "4 hours", "Local encrypted backup + shore backup"],
        ["CAT II (Essential Operations)", "24 hours", "8 hours", "Local encrypted backup"],
        ["CAT III (Non-critical IT)", "48 hours", "24 hours", "Standard backup procedure"],
      ],
    ));
    // Emergency Contacts
    content.push(heading2("Emergency Contact List"));
    content.push(buildTable(
      ["Role", "Contact", "Availability", "Notes"],
      [
        ["IT Officer (Primary)", "[Name to be specified]", "24/7 onboard", "First responder for all cyber incidents"],
        ["CSO (Company)", "[Company CSO]", "Business hours + emergency", "Escalation contact for HIGH/CRITICAL"],
        ["Classification Society", project.classification || "[To be specified]", "Business hours", "Notify for class-relevant incidents"],
        ["National CERT / ISAC", "[Maritime CERT]", "24/7", "For critical incidents with national security implications"],
      ],
    ));
    // Incident Log template
    content.push(heading2("Incident Log Template"));
    content.push(buildTable(
      ["Date/Time", "Incident Type", "Level", "Systems Affected", "Actions Taken", "Resolution"],
      [["", "", "", "", "", ""], ["", "", "", "", "", ""], ["", "", "", "", "", ""]],
    ));
  }

  if (focus === "change") {
    // Change Categories table (from old system)
    content.push(heading2("Change Categories"));
    content.push(buildTable(
      ["Category", "Description", "Approval Required", "Lead Time", "Responsible"],
      [
        ["Standard", "Pre-approved routine changes (AV update, log rotation)", "IT Officer only", "N/A (pre-approved)", "IT Officer"],
        ["Normal", "Planned changes requiring review (HW replacement, SW upgrade)", "CSO + Chief Engineer", "≥ 5 working days", "IT Officer + Chief Engineer"],
        ["Emergency", "Urgent changes for safety/security (critical patch, containment)", "Master + CSO", "ASAP", "IT Officer"],
        ["Major", "Significant system changes (architecture, new CBS, zone redesign)", "Company IT + Classification Society", "≥ 30 days", "Company + Shipyard"],
      ],
    ));
    // Change Process table
    content.push(heading2("Change Process Steps"));
    content.push(buildTable(
      ["Step", "Activity", "Responsible", "Documentation"],
      [
        ["1", "Submit Change Request", "Requester", "Change Request Form (CR-XXX)"],
        ["2", "Impact Assessment", "IT Officer", "Impact Assessment Report"],
        ["3", "Approval", "As per category", "Change Approval Record"],
        ["4", "Implementation Plan", "IT Officer", "Implementation Plan + Rollback Plan"],
        ["5", "Testing & Verification", "IT Officer + Requester", "Test Report"],
        ["6", "Close & Document", "IT Officer", "Change Completion Record"],
      ],
    ));
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
    content.push(heading2("Change Log Template"));
    content.push(
      buildTable(
        ["CR No", "Date", "System", "Description", "Category", "Approved By", "Status"],
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

    // ── Risk Register with 12 pre-defined threats (from old E26-CSR) ──
    const preDefinedRisks: { id: string; cat: string; threat: string; l: number; i: number }[] = [
      { id: "R1", cat: "Network", threat: "Unauthorized Network Access", l: 4, i: 5 },
      { id: "R2", cat: "Malware", threat: "Malware Infection", l: 3, i: 5 },
      { id: "R3", cat: "Patch", threat: "Unpatched Software", l: 4, i: 4 },
      { id: "R4", cat: "Physical", threat: "USB-borne Malware", l: 3, i: 4 },
      { id: "R5", cat: "Insider", threat: "Insider Threat", l: 2, i: 4 },
      { id: "R6", cat: "Supply Chain", threat: "Supply Chain Compromise", l: 2, i: 5 },
      { id: "R7", cat: "DoS", threat: "DoS Attack", l: 3, i: 4 },
      { id: "R8", cat: "Spoofing", threat: "GPS/AIS Spoofing", l: 3, i: 5 },
      { id: "R9", cat: "Malware", threat: "Ransomware", l: 3, i: 5 },
      { id: "R10", cat: "Auth", threat: "Weak Authentication", l: 4, i: 3 },
      { id: "R11", cat: "Crypto", threat: "Unencrypted Communication", l: 3, i: 3 },
      { id: "R12", cat: "Physical", threat: "Physical Access Breach", l: 2, i: 3 },
    ];
    // Dynamic risks from assessment failures
    const failsByHw = new Map<string, string[]>();
    assessments.filter((a) => a.result === "FAIL").forEach((a) => {
      const hwName = a.hardware.name;
      if (!failsByHw.has(hwName)) failsByHw.set(hwName, []);
      failsByHw.get(hwName)!.push(a.checkId);
    });
    const dynamicRisks = [...failsByHw.entries()].map(([hwName, checks], idx) => ({
      id: `R${13 + idx}`,
      cat: "Assessment",
      threat: `${hwName}: FAIL on ${checks.join(", ")}`,
      l: checks.length >= 5 ? 4 : checks.length >= 3 ? 3 : 2,
      i: 4,
    }));
    const allRisks = [...preDefinedRisks, ...dynamicRisks];
    const getRiskLevel = (score: number) => score >= 20 ? "CRITICAL" : score >= 12 ? "HIGH" : score >= 6 ? "MEDIUM" : "LOW";
    const riskRows = allRisks.map((r) => {
      const score = r.l * r.i;
      return [r.id, r.cat, r.threat, String(r.l), String(r.i), String(score), getRiskLevel(score)];
    });
    content.push(heading2("Risk Register"));
    content.push(bodyText(`Risk assessment using 5×5 Likelihood × Impact matrix per IACS UR E26 §3.3. Scores: CRITICAL (≥20), HIGH (≥12), MEDIUM (≥6), LOW (<6). Total risks: ${allRisks.length} (${preDefinedRisks.length} baseline + ${dynamicRisks.length} from assessment findings).`));
    content.push(
      buildTable(
        ["ID", "Category", "Risk Description", "L", "I", "Score", "Level"],
        riskRows,
      ),
    );

    // Risk Summary
    const criticalCount = allRisks.filter((r) => r.l * r.i >= 20).length;
    const highCount = allRisks.filter((r) => { const s = r.l * r.i; return s >= 12 && s < 20; }).length;
    const mediumCount = allRisks.filter((r) => { const s = r.l * r.i; return s >= 6 && s < 12; }).length;
    const lowCount = allRisks.filter((r) => r.l * r.i < 6).length;
    content.push(heading2("Risk Summary"));
    content.push(
      buildTable(
        ["Level", "Count", "Required Action"],
        [
          ["CRITICAL", String(criticalCount), "Immediate action required — escalate to CSO within 48h"],
          ["HIGH", String(highCount), "Remediation plan required within 30 days"],
          ["MEDIUM", String(mediumCount), "Monitor and address in next maintenance cycle"],
          ["LOW", String(lowCount), "Accept or address as resources allow"],
        ],
      ),
    );
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
    // Structured Maintenance Schedule (matching old system)
    content.push(heading2("Maintenance Schedule"));
    content.push(buildTable(
      ["Activity", "Frequency", "Responsible", "Method", "Record"],
      [
        ["E27 SC Check (Hardening Audit)", "Annually", "IT Officer / CSO", "SCS Audit Tool", "E27-AUD Report"],
        ["Vulnerability Scan", "Semi-annually", "IT Officer", "CVE/NVD Scan", "E27-VUL Report"],
        ["CAT III Patch Deployment", "Monthly", "IT Officer", "Windows Update / WSUS", "Patch Log"],
        ["CAT I/II Patch Deployment", "Annually", "Chief Engineer", "Vendor-approved media", "Patch Log"],
        ["AV Definition Update", "Daily (automatic)", "IT Officer", "Windows Defender Update", "Auto-log"],
        ["Backup Verification", "Quarterly", "IT Officer", "Restore test on spare", "Backup Log"],
        ["User Account Review", "Quarterly", "IT Officer + CSO", "lusrmgr.msc review", "Account Audit"],
        ["Security Awareness Training", "Annually", "CSO", "Training module", "E26-TRA Record"],
      ],
    ));
    // Maintenance Log template
    content.push(heading2("Maintenance Log Template"));
    content.push(buildTable(
      ["Date", "Activity", "System", "Performed By", "Result", "Next Due"],
      [["", "", "", "", "", ""], ["", "", "", "", "", ""], ["", "", "", "", "", ""]],
    ));
  }

  if (focus === "system-test") {
    content.push(heading2("Test Matrix — CBS Assets"));
    content.push(
      buildTable(
        ["Asset", "Type", "Zone", "FAT Required", "HAT/SAT Required", "Test Status"],
        hardware.map((hw) => [hw.name, hw.type, hw.zone || "—", "Yes", "Yes", "[Pending]"]),
      ),
    );
    // 9 Specific Test Cases from old system
    content.push(heading2("Security Configuration Test Procedures"));
    content.push(buildTable(
      ["Test ID", "Test Item", "E27 Ref", "Test Method", "Pass Criteria"],
      [
        ["T-01", "Password complexity", "SC-1", "Attempt to set password 'abc123' (no complexity)", "Password rejected; min 8 chars + complexity enforced"],
        ["T-02", "Guest account disabled", "SC-2", "Run: Get-LocalUser -Name Guest | Select Enabled", "Enabled = False"],
        ["T-03", "SMBv1 disabled", "SC-5", "Run: Get-SmbServerConfiguration | Select EnableSMB1Protocol", "EnableSMB1Protocol = False"],
        ["T-04", "USB AutoRun disabled", "SC-5", "Insert USB drive with autorun.inf, verify no auto-execution", "No automatic execution occurs"],
        ["T-05", "RDP NLA enabled", "SC-6", "Check: HKLM\\...\\WinStations\\RDP-Tcp\\UserAuthentication", "UserAuthentication = 1"],
        ["T-06", "Audit logging active", "SC-7", "Run: auditpol /get /category:*", "Success and Failure enabled for all categories"],
        ["T-07", "Screen lock ≤15 min", "SC-10", "Check screen saver timeout GPO setting", "Timeout ≤ 900 seconds (15 min)"],
        ["T-08", "Antivirus active", "SC-11", "Run: Get-MpComputerStatus | Select RealTimeProtectionEnabled", "RealTimeProtectionEnabled = True"],
        ["T-09", "Windows Update configured", "SC-13", "Run: Get-WindowsUpdate or check WSUS configuration", "Updates configured per patch policy (CAT I/II/III)"],
      ],
    ));
    // Sign-off table
    content.push(heading2("Test Sign-off"));
    content.push(buildTable(
      ["Role", "Name", "Signature", "Date"],
      [["Tester / IT Officer", "", "", ""], ["Reviewer / CSO", "", "", ""], ["Master", "", "", ""]],
    ));
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
    // SC-by-SC detailed requirements
    content.push(heading2("SC Configuration Requirements"));
    content.push(buildTable(
      ["SC", "Requirement", "Configuration", "Method / Command"],
      [
        ["SC-1", "Password complexity", "Min 8 chars, uppercase+lowercase+digit+special, lockout ≤5", "secpol.msc → Account Policies → Password Policy"],
        ["SC-2", "Least privilege", "Disable Guest, restrict Administrators group", "lusrmgr.msc → Users; Disable-LocalUser -Name Guest"],
        ["SC-5", "SMBv1 disabled", "Disable legacy SMB protocol", "Set-SmbServerConfiguration -EnableSMB1Protocol $false"],
        ["SC-5", "AutoRun disabled", "Prevent automatic execution from removable media", "GPO: Computer Config → Admin Templates → Windows Components → AutoPlay"],
        ["SC-5", "USB storage blocked", "Block USB mass storage devices", "Set-ItemProperty HKLM:\\SYSTEM\\CurrentControlSet\\Services\\USBSTOR -Name Start -Value 4"],
        ["SC-6", "Firewall enabled", "Windows Firewall on all profiles (Domain/Private/Public)", "Set-NetFirewallProfile -All -Enabled True"],
        ["SC-6", "RDP NLA required", "Network Level Authentication for Remote Desktop", "UserAuthentication registry = 1"],
        ["SC-7", "Audit logging", "Success+Failure for all categories, Security log ≥196 MB, App ≥32 MB", "auditpol /set /category:* /success:enable /failure:enable"],
        ["SC-10", "Screen lock", "Idle timeout ≤15 minutes", "GPO: Screen saver timeout 900 seconds"],
        ["SC-11", "AV real-time", "Windows Defender real-time protection enabled", "Set-MpPreference -DisableRealtimeMonitoring $false"],
        ["SC-12", "Removable media", "Encrypt removable drives, restrict write access", "BitLocker To Go, GPO removable storage access"],
        ["SC-13", "Patch policy", "CAT I/II annually, CAT III monthly, CVSS≥9.0 within 30 days", "See E27-PAT document"],
      ],
    ));
    // Per-device SC status
    if (hardware.length > 0) {
      content.push(heading2("Per-Device Hardening Status"));
      const scIds = ["SC-1", "SC-2", "SC-5", "SC-6", "SC-7", "SC-10", "SC-11", "SC-13"];
      content.push(buildTable(
        ["Device", "Type", "Zone", ...scIds],
        hardware.map((hw) => {
          const vals = scIds.map((sc) => {
            const a = assessments.find((x) => x.hardwareId === hw.id && x.checkId === sc);
            return a ? resultLabel(a.result) : "—";
          });
          return [hw.name, hw.type, hw.zone || "—", ...vals];
        }),
      ));
    }
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

  // ─── Security Capabilities table ──────────────────────────
  if (focus === "security-capabilities") {
    const scGroups: [string, string, string][] = [
      ["SC-1", "Identification & Authentication", "Password policy, account management"],
      ["SC-2", "Use Control / Least Privilege", "RBAC, admin restriction"],
      ["SC-3", "System Integrity", "Application whitelisting, integrity checks"],
      ["SC-5", "Communication Integrity", "SMBv1 disabled, protocol hardening"],
      ["SC-6", "Network Security", "Firewall, RDP NLA, port control"],
      ["SC-7", "Audit & Accountability", "Event logging, log retention ≥90 days"],
      ["SC-10", "Resource Availability", "Screen lock ≤15 min, session control"],
      ["SC-11", "Malware Protection", "Windows Defender, real-time scanning"],
      ["SC-12", "Physical Security", "USB storage blocked, removable media policy"],
      ["SC-13", "Software Integrity", "Patch management, update verification"],
    ];
    const capRows = scGroups.map(([sc, cap, impl]) => {
      const scAssess = assessments.filter((a) => a.checkId.startsWith(sc));
      const passCount = scAssess.filter((a) => a.result === "PASS").length;
      const status = scAssess.length === 0 ? "Not Assessed" : passCount === scAssess.length ? "✅ Implemented" : passCount > 0 ? "⚠ Partial" : "❌ Not Implemented";
      return [cap, sc, impl, status];
    });
    content.push(heading2("Security Capability Summary"), buildTable(
      ["Capability", "E27 SC Ref", "Implementation", "Status"], capRows,
    ));
  }

  // ─── Patch Management tables ────────────────────────────
  if (focus === "patch-management") {
    // Scope — list devices
    if (hardware.length > 0) {
      content.push(heading2("CBS Components in Scope"), buildTable(
        ["#", "Device", "Type", "Zone", "Category"],
        hardware.map((hw, i) => [String(i + 1), hw.name, hw.type, hw.zone || "—", "CAT III"]),
      ));
    }
    // Patch Schedule table
    content.push(heading2("Patch Schedule Summary"), buildTable(
      ["Category", "Frequency", "Method", "Responsible", "Approval"],
      [
        ["CAT I (Navigation/Safety)", "Annually", "Vendor-approved media", "Chief Engineer", "Master + CSO"],
        ["CAT II (Essential Ops)", "Semi-annually", "Tested update package", "IT Officer", "CSO"],
        ["CAT III (Non-critical IT)", "Monthly", "Windows Update / WSUS", "IT Officer", "CSO notification"],
        ["Emergency (CVSS ≥9.0)", "Within 30 days", "Emergency procedure", "IT Officer", "CSO + Master"],
      ],
    ));
    // Patch Log template
    content.push(heading2("Patch Log Template"), buildTable(
      ["Date", "System", "Patch / KB ID", "Version Before", "Version After", "Tested By", "Applied By"],
      [["", "", "", "", "", "", ""], ["", "", "", "", "", "", ""], ["", "", "", "", "", "", ""]],
    ));
  }

  // ─── E26 Management Plan tables ────────────────────────────
  if (focus === "e26-management") {
    const zones = groupByZone(hardware);
    content.push(heading2("CBS Asset Summary"));
    content.push(
      buildTable(
        ["Zone", "HW Count", "SW Count", "Key Assets"],
        [...zones.entries()].map(([zone, assets]) => [
          zone, String(assets.length),
          String(assets.reduce((n, hw) => n + hw.software.length, 0)),
          assets.slice(0, 3).map((a) => a.name).join(", ") + (assets.length > 3 ? ` (+${assets.length - 3})` : ""),
        ]),
      ),
    );
    if (assessments.length > 0) {
      const counts = countResults(assessments);
      content.push(heading2("Current KPI Snapshot"));
      content.push(
        buildTable(
          ["KPI", "Value", "Target"],
          [
            ["Assessment PASS rate", counts.total > 0 ? `${Math.round((counts.pass / counts.total) * 100)}%` : "—", "> 80%"],
            ["FAIL items", String(counts.fail), "0"],
            ["PARTIAL items", String(counts.partial), "0"],
            ["Total checks", String(counts.total), "—"],
          ],
        ),
      );
    }
  }

  // ─── E26 Remote Access tables ─────────────────────────────
  if (focus === "e26-remote-access") {
    content.push(heading2("Approved Remote Access Methods"));
    content.push(
      buildTable(
        ["Method", "Protocol", "Authentication", "Encryption", "Status"],
        [
          ["VPN (IPsec)", "IKEv2 / ESP", "Certificate + MFA", "AES-256", "[Approved / Pending]"],
          ["VPN (SSL/TLS)", "TLS 1.2+", "Username + MFA", "AES-128+", "[Approved / Pending]"],
          ["SSH", "SSH-2", "Key-based + MFA", "AES-256-CTR", "[Approved / Pending]"],
          ["RDP (with NLA)", "TLS 1.2+", "NLA + MFA", "AES-128+", "[Approved / Pending]"],
        ],
      ),
    );
    content.push(heading2("CBS Assets with Remote Access Capability"));
    content.push(
      buildTable(
        ["Asset", "Type", "Zone", "IP Address", "Remote Capable", "Access Method"],
        hardware.map((hw) => [
          hw.name, hw.type, hw.zone || "—", hw.ipAddress || "—",
          hw.ipAddress ? "Yes" : "No", "[To be specified]",
        ]),
      ),
    );
  }

  // ─── IEC Risk Assessment tables ───────────────────────────
  if (focus === "iec-risk-assessment") {
    if (assessments.length > 0) {
      content.push(heading2("Risk Results by Zone"));
      const zones = groupByZone(hardware);
      content.push(
        buildTable(
          ["Zone", "Assets", "Checks", "PASS", "FAIL", "PARTIAL", "Risk Level"],
          [...zones.entries()].map(([zone, assets]) => {
            const ids = new Set(assets.map((a) => a.id));
            const za = assessments.filter((a) => ids.has(a.hardwareId));
            const zc = countResults(za);
            const risk = zc.fail > 0 ? "HIGH" : zc.partial > 0 ? "MEDIUM" : "LOW";
            return [zone, String(assets.length), String(zc.total), String(zc.pass), String(zc.fail), String(zc.partial), risk];
          }),
        ),
      );
    }
    content.push(heading2("Threat Category Summary"));
    content.push(
      buildTable(
        ["Threat Category", "Description", "Likelihood", "Impact", "Risk"],
        [
          ["Malware", "Ransomware, worms, trojans targeting OT", "Medium", "High", "High"],
          ["Unauthorized Access", "Weak credentials, network exploitation", "Medium", "High", "High"],
          ["Insider Threat", "Accidental or malicious personnel actions", "Low", "Medium", "Medium"],
          ["Supply Chain", "Malicious code in updates, counterfeit HW", "Low", "High", "Medium"],
          ["Physical Attack", "Unauthorized physical access to CBS", "Low", "Medium", "Low"],
          ["Denial of Service", "Resource exhaustion targeting CBS", "Medium", "Medium", "Medium"],
        ],
      ),
    );
  }

  // ─── IEC Security Level tables ────────────────────────────
  if (focus === "iec-security-level") {
    // FR1-FR7 compliance table
    const frChecks: [string, string, string[]][] = [
      ["FR 1", "Identification & Authentication (IAC)", ["SC-1", "SC-2", "SC-3"]],
      ["FR 2", "Use Control (UC)", ["SC-2", "SC-3", "SC-10"]],
      ["FR 3", "System Integrity (SI)", ["SC-11", "SC-12", "SC-13"]],
      ["FR 4", "Data Confidentiality (DC)", ["SC-6"]],
      ["FR 5", "Restricted Data Flow (RDF)", ["SC-3", "SC-5"]],
      ["FR 6", "Timely Response to Events (TRE)", ["SC-7"]],
      ["FR 7", "Resource Availability (RA)", ["SC-4", "SC-8", "SC-9"]],
    ];
    content.push(heading2("FR 1–7 Compliance Summary"));
    content.push(
      buildTable(
        ["FR", "Name", "Assessed", "PASS", "FAIL", "SL-T", "SL-A"],
        frChecks.map(([fr, name, scIds]) => {
          const rel = assessments.filter((a) => scIds.includes(a.checkId));
          const rc = countResults(rel);
          return [fr, name, String(rc.total), String(rc.pass), String(rc.fail), "[TBD]", rc.fail > 0 ? "Not met" : rc.total > 0 ? "Met" : "—"];
        }),
      ),
    );
    // Device-level status
    content.push(heading2("Device Security Level Status"));
    content.push(
      buildTable(
        ["Device", "Type", "Zone", "Checks", "PASS", "FAIL", "Gap"],
        hardware.map((hw) => {
          const ha = assessments.filter((a) => a.hardwareId === hw.id);
          const hc = countResults(ha);
          return [hw.name, hw.type, hw.zone || "—", String(hc.total), String(hc.pass), String(hc.fail), hc.fail > 0 ? "Yes" : "No"];
        }),
      ),
    );
  }

  // ─── IEC Capability Requirements tables ───────────────────
  if (focus === "iec-capability-req") {
    if (assessments.length > 0) {
      content.push(heading2("Requirement Compliance Status by Device"));
      content.push(
        buildTable(
          ["Device", "Type", "Zone", "Assessed", "PASS", "FAIL", "PARTIAL"],
          hardware.map((hw) => {
            const ha = assessments.filter((a) => a.hardwareId === hw.id);
            const hc = countResults(ha);
            return [hw.name, hw.type, hw.zone || "—", String(hc.total), String(hc.pass), String(hc.fail), String(hc.partial)];
          }),
        ),
      );
    }
  }

  // ─── IEC Component Security Requirements tables ───────────
  if (focus === "iec-component-req") {
    content.push(heading2("Component Inventory and Compliance"));
    content.push(
      buildTable(
        ["Component", "Type", "IEC 62443-4-2 Type", "Zone", "Assessed", "PASS", "FAIL", "Conformance"],
        hardware.map((hw) => {
          const iecType = hw.type === "NETWORK_DEVICE" ? "ND" : hw.type === "SERVER" || hw.type === "PC" ? "HD" : hw.type === "PLC" || hw.type === "SENSOR" ? "ED" : "SA";
          const ha = assessments.filter((a) => a.hardwareId === hw.id);
          const hc = countResults(ha);
          return [hw.name, hw.type, iecType, hw.zone || "—", String(hc.total), String(hc.pass), String(hc.fail), hc.fail > 0 ? "Non-conformant" : hc.total > 0 ? "Conformant" : "Not assessed"];
        }),
      ),
    );
    // CR requirement status
    const crChecks = ["SC-1", "SC-2", "SC-3", "SC-5", "SC-6", "SC-7", "SC-11", "SC-13"];
    content.push(heading2("Component Requirement (CR) Baseline Status"));
    content.push(
      buildTable(
        ["CR Requirement", "SC Check", "Devices Assessed", "PASS", "FAIL"],
        crChecks.map((sc) => {
          const rel = assessments.filter((a) => a.checkId === sc);
          const rc = countResults(rel);
          return [sc === "SC-1" ? "CR 1.1 — Authentication" : sc === "SC-2" ? "CR 1.3 — Account Mgmt" : sc === "SC-3" ? "CR 2.1 — Authorization" : sc === "SC-5" ? "CR 7.7 — Least Functionality" : sc === "SC-6" ? "CR 4.1 — Confidentiality" : sc === "SC-7" ? "CR 2.8 — Auditable Events" : sc === "SC-11" ? "CR 3.1 — Malware Protection" : "CR 7.6 — Patch Mgmt", sc, String(rc.total), String(rc.pass), String(rc.fail)];
        }),
      ),
    );
  }

  // ─── IEC Zone & Conduit tables ────────────────────────────
  if (focus === "iec-zone-conduit") {
    const zones = groupByZone(hardware);
    content.push(heading2("Zone Summary"));
    content.push(
      buildTable(
        ["Zone", "Asset Count", "Asset Types", "SL-T", "Key Assets"],
        [...zones.entries()].map(([zone, assets]) => [
          zone, String(assets.length),
          [...new Set(assets.map((a) => a.type))].join(", "),
          "[TBD]",
          assets.slice(0, 3).map((a) => a.name).join(", ") + (assets.length > 3 ? ` (+${assets.length - 3})` : ""),
        ]),
      ),
    );
    // Conduit registry — derive from DFD connections or show cross-zone assets
    const zoneNames = [...zones.keys()];
    const conduits: string[][] = [];
    for (let i = 0; i < zoneNames.length; i++) {
      for (let j = i + 1; j < zoneNames.length; j++) {
        conduits.push([`C-${i + 1}${j + 1}`, zoneNames[i], zoneNames[j], "Bidirectional", "Firewall", "[To be specified]"]);
      }
    }
    if (conduits.length > 0) {
      content.push(heading2("Conduit Registry"));
      content.push(
        buildTable(
          ["Conduit ID", "Source Zone", "Dest Zone", "Direction", "Boundary Device", "Protocols"],
          conduits,
        ),
      );
    }
    // SR requirements per zone
    content.push(heading2("System Requirement (SR) Applicability by Zone"));
    content.push(
      buildTable(
        ["Zone", "FR 5 (RDF) Applicable", "Boundary Control Required", "External Connection"],
        [...zones.entries()].map(([zone]) => [
          zone, "Yes", "Yes", zone.toLowerCase().includes("external") || zone.toLowerCase().includes("shore") ? "Yes" : "No",
        ]),
      ),
    );
  }

  // ─── NIST Baseline Config tables ──────────────────────────
  if (focus === "nist-baseline-config") {
    content.push(heading2("Device Baseline Status"));
    content.push(
      buildTable(
        ["Device", "Type", "Zone", "SC-5 (Least Func.)", "SC-13 (Patch)", "Baseline Documented"],
        hardware.map((hw) => {
          const sc5 = assessments.find((a) => a.hardwareId === hw.id && a.checkId === "SC-5");
          const sc13 = assessments.find((a) => a.hardwareId === hw.id && a.checkId === "SC-13");
          return [hw.name, hw.type, hw.zone || "—", sc5 ? resultLabel(sc5.result) : "—", sc13 ? resultLabel(sc13.result) : "—", "[Date]"];
        }),
      ),
    );
    content.push(heading2("Hardening Standards Reference"));
    content.push(
      buildTable(
        ["CM Control", "Description", "Status"],
        [
          ["CM-1", "Configuration Management Policy", "Documented"],
          ["CM-2", "Baseline Configuration", "Per asset (see above)"],
          ["CM-3", "Configuration Change Control", "Ref: E27-MOC"],
          ["CM-4", "Impact Analyses", "Per change request"],
          ["CM-5", "Access Restrictions for Change", "Role-based"],
          ["CM-6", "Configuration Settings", "Per hardening guide"],
          ["CM-7", "Least Functionality", "Ref: SC-5"],
          ["CM-8", "System Component Inventory", "Ref: E26-INV"],
        ],
      ),
    );
  }

  // ─── NIST IAM tables ──────────────────────────────────────
  if (focus === "nist-iam") {
    content.push(heading2("Authentication Requirements Matrix"));
    content.push(
      buildTable(
        ["Role", "Auth Level", "Min Password", "Max Age", "MFA Required", "Cert-based"],
        [
          ["Administrator", "Level 2", "12 chars", "90 days", "Yes", "Recommended"],
          ["Operator", "Level 1", "8 chars", "180 days", "Remote only", "No"],
          ["Service Technician", "Level 2", "12 chars", "Session-only", "Yes", "Recommended"],
          ["Auditor", "Level 1", "8 chars", "180 days", "Remote only", "No"],
        ],
      ),
    );
    // Current account status from HW inventory
    content.push(heading2("Current Account Status by Device"));
    content.push(
      buildTable(
        ["Device", "Type", "Zone", "SC-1 (Password)", "SC-2 (Account)", "SC-3 (Network)"],
        hardware.map((hw) => {
          const sc1 = assessments.find((a) => a.hardwareId === hw.id && a.checkId === "SC-1");
          const sc2 = assessments.find((a) => a.hardwareId === hw.id && a.checkId === "SC-2");
          const sc3 = assessments.find((a) => a.hardwareId === hw.id && a.checkId === "SC-3");
          return [hw.name, hw.type, hw.zone || "—", sc1 ? resultLabel(sc1.result) : "—", sc2 ? resultLabel(sc2.result) : "—", sc3 ? resultLabel(sc3.result) : "—"];
        }),
      ),
    );
  }

  // ─── NIST Supply Chain tables ─────────────────────────────
  if (focus === "nist-supply-chain") {
    // Group software by vendor
    const swVendors = new Map<string, typeof software>();
    software.forEach((sw) => {
      const v = sw.vendor || "Unknown";
      if (!swVendors.has(v)) swVendors.set(v, []);
      swVendors.get(v)!.push(sw);
    });
    content.push(heading2("Software Vendor Analysis"));
    content.push(
      buildTable(
        ["Vendor", "SW Count", "Products", "CPE Coverage", "CVE Matches"],
        [...swVendors.entries()].map(([vendor, sws]) => [
          vendor, String(sws.length),
          sws.map((s) => `${s.name} v${s.version || "?"}`).join("; "),
          `${sws.filter((s) => s.cpe).length}/${sws.length}`,
          String(sws.reduce((n, s) => n + s._count.cveMatches, 0)),
        ]),
      ),
    );
    // HW manufacturer summary
    const hwMfrs = new Map<string, typeof hardware>();
    hardware.forEach((hw) => {
      const m = hw.manufacturer || "Unknown";
      if (!hwMfrs.has(m)) hwMfrs.set(m, []);
      hwMfrs.get(m)!.push(hw);
    });
    content.push(heading2("Hardware Manufacturer Summary"));
    content.push(
      buildTable(
        ["Manufacturer", "Device Count", "Types", "Key Products"],
        [...hwMfrs.entries()].map(([mfr, hws]) => [
          mfr, String(hws.length),
          [...new Set(hws.map((h) => h.type))].join(", "),
          hws.slice(0, 3).map((h) => h.name).join(", ") + (hws.length > 3 ? ` (+${hws.length - 3})` : ""),
        ]),
      ),
    );
  }

  // ─── NIST System Assessment tables ────────────────────────
  if (focus === "nist-system-assessment") {
    // CSF scores
    const csfMapping: [string, string, string[]][] = [
      ["IDENTIFY", "Asset Mgmt, Risk Assessment", ["SC-5"]],
      ["PROTECT", "Access Control, Awareness, Data Security", ["SC-1", "SC-2", "SC-3", "SC-6", "SC-10", "SC-11"]],
      ["DETECT", "Anomalies, Monitoring, Detection", ["SC-7", "SC-12"]],
      ["RESPOND", "Response, Communication, Mitigation", ["SC-8"]],
      ["RECOVER", "Recovery, Improvements, Communication", ["SC-9", "SC-4"]],
    ];
    content.push(heading2("NIST CSF Function Scores"));
    content.push(
      buildTable(
        ["Function", "Focus Areas", "Checks", "PASS", "FAIL", "Score"],
        csfMapping.map(([fn, areas, scIds]) => {
          const rel = assessments.filter((a) => scIds.includes(a.checkId));
          const rc = countResults(rel);
          const score = rc.total > 0 ? `${Math.round((rc.pass / rc.total) * 100)}%` : "N/A";
          return [fn, areas, String(rc.total), String(rc.pass), String(rc.fail), score];
        }),
      ),
    );
    // Full system inventory
    content.push(heading2("System Inventory"));
    content.push(
      buildTable(
        ["#", "Asset", "Type", "Zone", "Manufacturer", "IP Address", "Assessed"],
        hardware.map((hw, i) => {
          const ha = assessments.filter((a) => a.hardwareId === hw.id);
          return [String(i + 1), hw.name, hw.type, hw.zone || "—", hw.manufacturer || "—", hw.ipAddress || "—", ha.length > 0 ? "Yes" : "No"];
        }),
      ),
    );
    // Conditional findings
    const fails = assessments.filter((a) => a.result === "FAIL");
    const partials = assessments.filter((a) => a.result === "PARTIAL");
    if (fails.length > 0 || partials.length > 0) {
      content.push(heading2("Findings & Recommendations"));
      content.push(
        buildTable(
          ["Finding", "Device", "Check", "Result", "Recommendation"],
          [...fails, ...partials].map((a, i) => [
            `F-${String(i + 1).padStart(3, "0")}`, a.hardware.name, a.checkId, resultLabel(a.result),
            a.result === "FAIL" ? "Immediate remediation required" : "Plan remediation within 90 days",
          ]),
        ),
      );
    }
    if (hardware.length > 0 && assessments.length === 0) {
      content.push(heading2("Data Gap Notice"));
      content.push(bodyText(`${hardware.length} hardware assets are registered but no security assessments have been performed. Complete SC-1 through SC-13 assessments before finalizing the system security assessment.`));
    }
  }

  // ─── ISO SoA tables ───────────────────────────────────────
  if (focus === "iso-soa") {
    content.push(heading2("Annex A Controls — Applicability Register"));
    const annexAControls: [string, string, string, string][] = [
      ["A.5.1", "Policies for information security", "Applicable", "E27-ACC, ISMS Policy"],
      ["A.5.2", "Information security roles and responsibilities", "Applicable", "ISMS Roles"],
      ["A.5.3", "Segregation of duties", "Applicable", "E27-ACC"],
      ["A.5.7", "Threat intelligence", "Applicable", "CVE monitoring"],
      ["A.5.8", "Security in project management", "Applicable", "E27-MOC"],
      ["A.5.19", "Supplier relationships", "Applicable", "E26-SSL"],
      ["A.5.20", "Supplier agreements", "Applicable", "E26-SSL"],
      ["A.5.21", "ICT supply chain", "Applicable", "NIST-SUP"],
      ["A.5.23", "Cloud services", "Applicable", "ISO-CLOUD"],
      ["A.5.24", "Incident planning", "Applicable", "E27-INC"],
      ["A.5.25", "Incident assessment", "Applicable", "E27-INC"],
      ["A.5.26", "Incident response", "Applicable", "E27-INC, E26 IRP"],
      ["A.5.29", "Business continuity", "Applicable", "E27-MNT"],
      ["A.5.30", "ICT readiness", "Applicable", "E27-MNT"],
      ["A.6.1", "Screening", "Applicable", "ISO-A7"],
      ["A.6.3", "Awareness training", "Applicable", "E26-TRA"],
      ["A.7.1", "Physical security perimeters", "Applicable", "Physical security"],
      ["A.7.4", "Physical security monitoring", "Applicable", "Physical security"],
      ["A.8.1", "User endpoint devices", "Applicable", "E27-CFG"],
      ["A.8.2", "Privileged access rights", "Applicable", "E27-ACC, NIST-IAM"],
      ["A.8.5", "Secure authentication", "Applicable", "SC-1, SC-2"],
      ["A.8.7", "Malware protection", "Applicable", "SC-11"],
      ["A.8.8", "Vulnerability management", "Applicable", "E27-VUL"],
      ["A.8.9", "Configuration management", "Applicable", "NIST-CFG"],
      ["A.8.15", "Logging", "Applicable", "SC-7, E27-MON"],
      ["A.8.16", "Monitoring", "Applicable", "E27-MON"],
      ["A.8.20", "Network security", "Applicable", "SC-3, E26-ZCD"],
      ["A.8.22", "Network segregation", "Applicable", "Zone design"],
      ["A.8.24", "Cryptography", "Applicable", "SC-6"],
      ["A.8.25", "Secure development lifecycle", "Applicable", "E27-SDL"],
    ];
    content.push(
      buildTable(
        ["Control", "Description", "Applicability", "E27 Cross-reference"],
        annexAControls,
      ),
    );
    content.push(heading2("Excluded Controls"));
    content.push(
      buildTable(
        ["Control", "Description", "Justification"],
        [
          ["A.5.6", "Contact with special interest groups", "Not applicable — no relevant industry SIG membership"],
          ["A.8.4", "Access to source code", "No in-house software development on vessel"],
          ["A.8.11", "Data masking", "Not applicable — no PII processing in CBS"],
          ["A.8.12", "Data leakage prevention", "CBS operates in isolated OT network"],
          ["A.8.23", "Web filtering", "No web browsing from CBS OT zone"],
          ["A.8.28", "Secure coding", "No in-house development on vessel CBS"],
        ],
      ),
    );
  }

  // ─── ISO ISMS tables ──────────────────────────────────────
  if (focus === "iso-isms") {
    const zones = groupByZone(hardware);
    content.push(heading2("ISMS Scope Summary"));
    content.push(
      buildTable(
        ["Metric", "Count"],
        [
          ["Hardware assets", String(hardware.length)],
          ["Software components", String(software.length)],
          ["Security zones", String(zones.size)],
          ["Network connections", String(hardware.filter((h) => h.ipAddress).length)],
          ["Assessment checks performed", String(assessments.length)],
        ],
      ),
    );
  }

  // ─── ISO A.5 tables ───────────────────────────────────────
  if (focus === "iso-a5") {
    content.push(heading2("A.5 Control Implementation Status"));
    const a5Areas: [string, string, string][] = [
      ["A.5.1–A.5.8", "Policies, Roles, Threat Intel", "Documented"],
      ["A.5.9–A.5.13", "Asset Management, Acceptable Use", hardware.length > 0 ? "Implemented" : "Pending"],
      ["A.5.14–A.5.18", "Information Transfer, Access", assessments.length > 0 ? "Assessed" : "Pending"],
      ["A.5.19–A.5.23", "Supplier Security, Cloud", software.length > 0 ? "Tracked" : "Pending"],
      ["A.5.24–A.5.28", "Incident Management", "Documented (ref: E27-INC)"],
      ["A.5.29–A.5.37", "Business Continuity, Compliance", "Documented"],
    ];
    content.push(
      buildTable(
        ["Control Range", "Area", "Status"],
        a5Areas,
      ),
    );
  }

  // ─── ISO A.7 tables ───────────────────────────────────────
  if (focus === "iso-a7") {
    content.push(heading2("A.7 People Controls Implementation Matrix"));
    content.push(
      buildTable(
        ["Control", "Description", "Implementation Status", "Reference"],
        [
          ["A.7.1", "Screening", "Procedure documented", "HR / Manning agent"],
          ["A.7.2", "Terms and conditions", "Included in crew agreements", "Crew contracts"],
          ["A.7.3", "Awareness and training", hardware.length > 0 ? "Active — CBS scope documented" : "Pending", "E26-TRA"],
          ["A.7.4", "Disciplinary process", "Defined in SMS", "ISM Code"],
          ["A.7.5", "Termination responsibilities", "Procedure documented", "Access revocation SOP"],
          ["A.7.6", "Confidentiality agreements", "Template in use", "NDA template"],
          ["A.7.7", "Remote working", "Policy in place", "E26-RAP"],
          ["A.7.8", "Event reporting", "Procedure documented", "E27-INC"],
        ],
      ),
    );
  }

  // ─── ISO A.8 tables ───────────────────────────────────────
  if (focus === "iso-a8") {
    const serverCount = hardware.filter((h) => h.type === "SERVER" || h.type === "PC").length;
    const networkCount = hardware.filter((h) => h.type === "NETWORK_DEVICE").length;
    const otherCount = hardware.length - serverCount - networkCount;
    content.push(heading2("Endpoint Protection Summary"));
    content.push(
      buildTable(
        ["Device Category", "Count", "SC-11 (Malware)", "SC-13 (Patch)"],
        [
          ["Servers / PCs", String(serverCount),
            String(assessments.filter((a) => a.checkId === "SC-11" && hardware.find((h) => h.id === a.hardwareId && (h.type === "SERVER" || h.type === "PC"))).filter((a) => a.result === "PASS").length) + " PASS",
            String(assessments.filter((a) => a.checkId === "SC-13" && hardware.find((h) => h.id === a.hardwareId && (h.type === "SERVER" || h.type === "PC"))).filter((a) => a.result === "PASS").length) + " PASS"],
          ["Network Devices", String(networkCount), "N/A (typically)", "Per vendor policy"],
          ["OT Devices", String(otherCount), "Application whitelist", "Per vendor policy"],
        ],
      ),
    );
    content.push(heading2("Software Vulnerability Management Summary"));
    content.push(
      buildTable(
        ["Metric", "Value"],
        [
          ["Total software components", String(software.length)],
          ["With CPE registered", String(software.filter((s) => s.cpe).length)],
          ["Without CPE (manual review needed)", String(software.filter((s) => !s.cpe).length)],
          ["Total CVE matches found", String(software.reduce((n, s) => n + s._count.cveMatches, 0))],
        ],
      ),
    );
  }

  // ─── ISO Cloud tables ─────────────────────────────────────
  if (focus === "iso-cloud") {
    content.push(heading2("Cloud Service Inventory"));
    content.push(
      buildTable(
        ["Service Name", "Provider", "Service Type", "Data Classification", "Encryption", "Status"],
        [
          ["[Service 1]", "[Provider]", "IaaS / PaaS / SaaS", "[Confidential / Internal / Public]", "TLS 1.2+ / AES-256", "[Active / Planned]"],
          ["[Service 2]", "[Provider]", "IaaS / PaaS / SaaS", "[Confidential / Internal / Public]", "TLS 1.2+ / AES-256", "[Active / Planned]"],
          ["SCS Platform", "SCS Provider", "SaaS", "Internal", "TLS 1.2+, AES-256", "Active"],
        ],
      ),
    );
    content.push(heading2("OT Cloud Connection Policy Matrix"));
    content.push(
      buildTable(
        ["Connection Type", "Permitted", "Condition", "Zone Restriction"],
        [
          ["OT Zone → Cloud (direct)", "No", "Air gap required", "OT Zone"],
          ["DMZ → Cloud", "Conditional", "Via application gateway", "DMZ Zone"],
          ["Management → Cloud", "Yes", "VPN required, MFA", "Management Zone"],
          ["Shore Office → Cloud", "Yes", "Standard IT controls", "N/A (shore)"],
        ],
      ),
    );
  }

  // ─── ISO ICS/OT Extension tables ──────────────────────────
  if (focus === "iso-ics") {
    const serverWs = hardware.filter((h) => h.type === "SERVER" || h.type === "PC");
    const plcSensor = hardware.filter((h) => h.type === "PLC" || h.type === "SENSOR");
    const netDev = hardware.filter((h) => h.type === "NETWORK_DEVICE");
    content.push(heading2("OT Asset Scope"));
    content.push(
      buildTable(
        ["Category", "Count", "Examples"],
        [
          ["Servers / Workstations", String(serverWs.length), serverWs.slice(0, 3).map((h) => h.name).join(", ") || "—"],
          ["PLCs / Sensors", String(plcSensor.length), plcSensor.slice(0, 3).map((h) => h.name).join(", ") || "—"],
          ["Network Devices", String(netDev.length), netDev.slice(0, 3).map((h) => h.name).join(", ") || "—"],
          ["Other OT Devices", String(hardware.length - serverWs.length - plcSensor.length - netDev.length), "—"],
        ],
      ),
    );
    // Security zones from data
    const zones = groupByZone(hardware);
    content.push(heading2("Security Zones — OT Context"));
    content.push(
      buildTable(
        ["Zone", "Assets", "OT Devices", "IT Devices", "SL-T"],
        [...zones.entries()].map(([zone, assets]) => {
          const ot = assets.filter((a) => a.type === "PLC" || a.type === "SENSOR" || a.type === "OTHER_DEVICE").length;
          return [zone, String(assets.length), String(ot), String(assets.length - ot), "[TBD]"];
        }),
      ),
    );
  }

  // ─── Risk Policy tables ───────────────────────────────────
  if (focus === "risk-policy") {
    if (assessments.length > 0) {
      const counts = countResults(assessments);
      content.push(heading2("Current Security Posture"));
      content.push(
        buildTable(
          ["Metric", "Value"],
          [
            ["Total assessments", String(counts.total)],
            ["PASS", String(counts.pass)],
            ["FAIL", String(counts.fail)],
            ["PARTIAL", String(counts.partial)],
            ["Compliance rate", counts.total > 0 ? `${Math.round((counts.pass / counts.total) * 100)}%` : "N/A"],
          ],
        ),
      );
    }
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
