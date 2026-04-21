import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError, isWriteRole } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

// ─── Rule-based response engine ─────────────────────────────────────────────

interface KeywordRule {
  keywords: string[];
  scId: string;
  responseKo: string;
  responseEn: string;
  intent: string;
  contextHint?: string; // used to enrich responses with project data
}

const KEYWORD_RULES: KeywordRule[] = [
  // SC-1: Password Policy
  {
    keywords: ["password", "비밀번호", "패스워드", "pw", "credential", "자격증명"],
    scId: "SC-1",
    intent: "password_policy",
    contextHint: "password",
    responseKo:
      "SC-1 비밀번호 정책 관련 안내입니다.\n\n" +
      "IACS UR E27에 따르면 CBS는 다음 비밀번호 정책을 지원해야 합니다:\n\n" +
      "1. 최소 길이 설정 가능 (8자 이상 권장)\n" +
      "2. 복잡도 요구사항 적용 (대문자, 소문자, 숫자, 특수문자)\n" +
      "3. 비밀번호 만료 설정 가능\n" +
      "4. 비밀번호 이력 유지 (재사용 방지)\n" +
      "5. 하드코딩/기본 비밀번호 제거\n\n" +
      "📋 구체적 조치 사항:\n" +
      "- Windows: 로컬 보안 정책 → 계정 정책 → 비밀번호 정책에서 설정\n" +
      "- Linux: /etc/pam.d/common-password 또는 /etc/security/pwquality.conf 편집\n" +
      "- 네트워크 장비: 장비별 CLI를 통해 비밀번호 정책 설정\n" +
      "- PLC/센서: 제조사 설정 도구를 통해 기본 비밀번호 변경 (가용성 주의)\n\n" +
      "평가 시 각 CBS의 비밀번호 설정 화면 스크린샷을 증빙 자료로 첨부하세요.",
    responseEn:
      "Here is guidance for SC-1 Password Policy.\n\n" +
      "Per IACS UR E27, the CBS must support the following password policies:\n\n" +
      "1. Minimum length configurable (8+ characters recommended)\n" +
      "2. Complexity requirements enforceable (upper, lower, numbers, special chars)\n" +
      "3. Password expiration configurable\n" +
      "4. Password history maintained (prevent reuse)\n" +
      "5. No hardcoded/default passwords\n\n" +
      "Specific remediation steps:\n" +
      "- Windows: Local Security Policy → Account Policies → Password Policy\n" +
      "- Linux: Edit /etc/pam.d/common-password or /etc/security/pwquality.conf\n" +
      "- Network devices: Configure via device-specific CLI\n" +
      "- PLC/sensors: Change default passwords via manufacturer tool (mind availability)\n\n" +
      "During assessment, attach screenshots of each CBS password configuration screen as evidence.",
  },
  // SC-2: Account Security
  {
    keywords: ["account", "계정", "user", "사용자", "role", "역할", "lockout", "잠금정책", "인증"],
    scId: "SC-2",
    intent: "account_security",
    contextHint: "account",
    responseKo:
      "SC-2 계정 보안 관련 안내입니다.\n\n" +
      "IACS UR E27은 다음 사용자 계정 관리 요구사항을 명시합니다:\n\n" +
      "1. 각 사용자에 대한 고유 사용자 ID\n" +
      "2. 로그인 실패 후 계정 잠금 (설정 가능, 보통 3~5회)\n" +
      "3. 미사용 계정 비활성화/제거 가능\n" +
      "4. 역할 분리 (운영자, 관리자, 서비스 기술자)\n" +
      "5. 운영 중 공유 일반 계정 없음\n\n" +
      "📋 구체적 조치 사항:\n" +
      "- Windows: 로컬 보안 정책 → 계정 잠금 정책 설정 (임계값 5회, 기간 30분)\n" +
      "- Linux: /etc/pam.d/common-auth에서 pam_tally2 또는 pam_faillock 설정\n" +
      "- Guest 계정, 기본 관리자 계정 비활성화 확인\n" +
      "- 각 CBS별 사용자 목록과 역할 할당 현황 문서화\n\n" +
      "사용자 계정 목록과 역할 설정 화면을 증빙으로 캡처하세요.",
    responseEn:
      "Here is guidance for SC-2 Account Security.\n\n" +
      "IACS UR E27 specifies the following user account management requirements:\n\n" +
      "1. Unique user IDs for each human user\n" +
      "2. Account lockout after failed login attempts (configurable, typically 3-5 attempts)\n" +
      "3. Ability to disable/remove unused accounts\n" +
      "4. Role separation (operator, administrator, service technician)\n" +
      "5. No shared generic accounts in operational use\n\n" +
      "Specific remediation steps:\n" +
      "- Windows: Local Security Policy → Account Lockout Policy (threshold 5, duration 30 min)\n" +
      "- Linux: Configure pam_tally2 or pam_faillock in /etc/pam.d/common-auth\n" +
      "- Verify Guest account and default admin accounts are disabled\n" +
      "- Document user lists and role assignments for each CBS\n\n" +
      "Capture user account lists and role configuration screens as evidence.",
  },
  // SC-3: Access Control
  {
    keywords: ["access", "접근", "권한", "permission", "acl", "authorization", "인가"],
    scId: "SC-3",
    intent: "access_control",
    contextHint: "access",
    responseKo:
      "SC-3 접근 제어 관련 안내입니다.\n\n" +
      "IACS UR E27은 다음 접근 제어 요구사항을 명시합니다:\n\n" +
      "1. 역할 기반 접근 제어(RBAC) 구현\n" +
      "2. 최소 권한 원칙(Least Privilege) 적용\n" +
      "3. 파일 시스템 접근 권한 제한\n" +
      "4. 관리자 권한 사용 제한 및 모니터링\n" +
      "5. 불필요한 공유 폴더 제거\n\n" +
      "📋 구체적 조치 사항:\n" +
      "- Windows: 파일/폴더 ACL 점검, 공유 폴더 권한 검토\n" +
      "- Linux: chmod/chown 설정 검토, sudo 권한 최소화\n" +
      "- 네트워크 장비: 관리 접근용 ACL 설정\n" +
      "- 애플리케이션: 사용자별 메뉴/기능 접근 제한 확인\n\n" +
      "각 CBS의 접근 제어 설정 현황을 문서화하세요.",
    responseEn:
      "Here is guidance for SC-3 Access Control.\n\n" +
      "IACS UR E27 specifies the following access control requirements:\n\n" +
      "1. Role-Based Access Control (RBAC) implemented\n" +
      "2. Least Privilege principle applied\n" +
      "3. File system access permissions restricted\n" +
      "4. Administrator privilege usage limited and monitored\n" +
      "5. Unnecessary shared folders removed\n\n" +
      "Specific remediation steps:\n" +
      "- Windows: Review file/folder ACLs, audit shared folder permissions\n" +
      "- Linux: Review chmod/chown settings, minimize sudo privileges\n" +
      "- Network devices: Set ACLs for management access\n" +
      "- Applications: Verify per-user menu/function access restrictions\n\n" +
      "Document access control configurations for each CBS.",
  },
  // SC-4: Data Integrity
  {
    keywords: ["integrity", "무결성", "checksum", "hash", "데이터 보호", "data protection", "체크섬"],
    scId: "SC-4",
    intent: "data_integrity",
    contextHint: "integrity",
    responseKo:
      "SC-4 데이터 무결성 관련 안내입니다.\n\n" +
      "IACS UR E27은 다음 데이터 무결성 요구사항을 명시합니다:\n\n" +
      "1. 중요 구성 파일의 무결성 검증 메커니즘\n" +
      "2. 소프트웨어/펌웨어 업데이트 시 무결성 검증\n" +
      "3. 데이터 전송 시 무결성 보호 (TLS, 체크섬 등)\n" +
      "4. 중요 데이터의 백업 및 복구 기능\n" +
      "5. 무단 변경 탐지 능력\n\n" +
      "📋 구체적 조치 사항:\n" +
      "- Windows: Windows File Integrity Monitoring (FIM) 설정\n" +
      "- Linux: AIDE 또는 Tripwire 같은 FIM 도구 설치\n" +
      "- 통신 프로토콜: TLS 1.2 이상 사용 확인\n" +
      "- 백업: 정기 백업 스케줄 및 복구 테스트 문서화\n\n" +
      "무결성 검증 설정 및 백업 정책을 증빙으로 준비하세요.",
    responseEn:
      "Here is guidance for SC-4 Data Integrity.\n\n" +
      "IACS UR E27 specifies the following data integrity requirements:\n\n" +
      "1. Integrity verification mechanism for critical configuration files\n" +
      "2. Integrity verification during software/firmware updates\n" +
      "3. Data integrity protection in transit (TLS, checksums, etc.)\n" +
      "4. Backup and recovery capability for critical data\n" +
      "5. Unauthorized modification detection\n\n" +
      "Specific remediation steps:\n" +
      "- Windows: Configure File Integrity Monitoring (FIM)\n" +
      "- Linux: Install AIDE or Tripwire for FIM\n" +
      "- Communication: Verify TLS 1.2+ is used\n" +
      "- Backup: Document regular backup schedules and recovery tests\n\n" +
      "Prepare integrity verification settings and backup policies as evidence.",
  },
  // SC-5: Network Security
  {
    keywords: ["network", "네트워크", "smb", "port", "포트", "firewall", "방화벽", "vlan", "세그먼트", "segment"],
    scId: "SC-5",
    intent: "network_security",
    contextHint: "network",
    responseKo:
      "SC-5 네트워크 보안 관련 안내입니다.\n\n" +
      "IACS UR E27은 다음 네트워크 보안 구성을 요구합니다:\n\n" +
      "1. SMBv1 비활성화\n" +
      "2. 이동식 미디어에 대한 AutoRun/AutoPlay 비활성화\n" +
      "3. 불필요한 네트워크 서비스 비활성화 (Telnet, FTP 등)\n" +
      "4. 필요한 네트워크 프로토콜만 활성화\n" +
      "5. 미사용 네트워크 포트 폐쇄\n\n" +
      "📋 구체적 조치 사항:\n" +
      "- Windows: PowerShell로 SMBv1 비활성화 — Set-SmbServerConfiguration -EnableSMB1Protocol $false\n" +
      "- 방화벽: 인바운드/아웃바운드 규칙 검토, 불필요 포트 차단\n" +
      "- 네트워크 장비: VLAN 세그먼테이션 구성, 미사용 포트 셧다운\n" +
      "- 주의: PLC/센서에 대해 네트워크 스캔 절대 금지 (가용성 위험)\n\n" +
      "네트워크 스캔 결과와 서비스 목록을 증빙 자료로 준비하세요.",
    responseEn:
      "Here is guidance for SC-5 Network Security.\n\n" +
      "IACS UR E27 requires the following network security configurations:\n\n" +
      "1. SMBv1 must be disabled\n" +
      "2. AutoRun/AutoPlay disabled for removable media\n" +
      "3. Unnecessary network services disabled (Telnet, FTP, etc.)\n" +
      "4. Only required network protocols enabled\n" +
      "5. Unused network ports closed\n\n" +
      "Specific remediation steps:\n" +
      "- Windows: Disable SMBv1 via PowerShell — Set-SmbServerConfiguration -EnableSMB1Protocol $false\n" +
      "- Firewall: Review inbound/outbound rules, block unnecessary ports\n" +
      "- Network devices: Configure VLAN segmentation, shut down unused ports\n" +
      "- CAUTION: NEVER network scan PLC/sensors (availability risk)\n\n" +
      "Prepare network scan results and service listings as evidence.",
  },
  // SC-6: RDP Security
  {
    keywords: ["rdp", "원격", "remote", "desktop", "데스크톱", "vnc", "ssh", "원격접속"],
    scId: "SC-6",
    intent: "rdp_security",
    contextHint: "rdp",
    responseKo:
      "SC-6 원격 접속 보안 관련 안내입니다.\n\n" +
      "IACS UR E27은 원격 데스크톱 프로토콜에 대해 다음을 요구합니다:\n\n" +
      "1. 불필요 시 RDP/VNC/SSH 비활성화\n" +
      "2. 활성화 시 네트워크 수준 인증(NLA) 필수\n" +
      "3. TLS 암호화 적용\n" +
      "4. RDP 접근이 특정 IP 범위/VLAN으로 제한\n" +
      "5. 세션 타임아웃 구성됨\n\n" +
      "📋 구체적 조치 사항:\n" +
      "- Windows RDP: 그룹 정책 → 원격 데스크톱 서비스 → NLA 요구 활성화\n" +
      "- SSH: /etc/ssh/sshd_config에서 PermitRootLogin no, PasswordAuthentication 설정\n" +
      "- VNC: 미사용 시 서비스 비활성화, 사용 시 VPN 통한 접근만 허용\n" +
      "- 방화벽에서 원격 접속 포트(3389, 22, 5900)를 특정 IP만 허용\n\n" +
      "RDP 설정 화면과 방화벽 규칙을 증빙으로 캡처하세요.",
    responseEn:
      "Here is guidance for SC-6 Remote Access Security.\n\n" +
      "IACS UR E27 requires the following for Remote Desktop Protocol:\n\n" +
      "1. RDP/VNC/SSH disabled if not required\n" +
      "2. Network Level Authentication (NLA) required if enabled\n" +
      "3. TLS encryption enforced\n" +
      "4. RDP access restricted to specific IP ranges/VLANs\n" +
      "5. Session timeout configured\n\n" +
      "Specific remediation steps:\n" +
      "- Windows RDP: Group Policy → Remote Desktop Services → Enable NLA requirement\n" +
      "- SSH: Configure /etc/ssh/sshd_config — PermitRootLogin no, PasswordAuthentication settings\n" +
      "- VNC: Disable service if unused, require VPN if used\n" +
      "- Firewall: Restrict remote access ports (3389, 22, 5900) to specific IPs\n\n" +
      "Capture RDP configuration screens and firewall rules as evidence.",
  },
  // SC-7: Audit Logging
  {
    keywords: ["log", "로그", "audit", "감사", "logging", "로깅", "siem", "이벤트"],
    scId: "SC-7",
    intent: "audit_logging",
    contextHint: "logging",
    responseKo:
      "SC-7 감사 로깅 관련 안내입니다.\n\n" +
      "IACS UR E27은 CBS에 대해 다음 감사 로깅 요구사항을 명시합니다:\n\n" +
      "1. 로그인/로그아웃 이벤트 기록\n" +
      "2. 인증 실패 시도 기록\n" +
      "3. 구성 변경 기록\n" +
      "4. 타임스탬프 동기화 (NTP)\n" +
      "5. 최소 로그 보존 기간 충족 (90일)\n" +
      "6. 로그 무단 수정 방지\n\n" +
      "📋 구체적 조치 사항:\n" +
      "- Windows: 감사 정책 → 로그온 이벤트 감사, 계정 관리 감사 활성화\n" +
      "- Windows 이벤트 로그 최대 크기 확장 (최소 100MB)\n" +
      "- Linux: auditd 설정 (/etc/audit/audit.rules)\n" +
      "- NTP 서버 설정 확인 (w32tm /query /status 또는 ntpq -p)\n" +
      "- 중앙 로그 서버(syslog) 전송 구성 권장\n\n" +
      "로그 설정 화면과 샘플 로그를 증빙으로 수집하세요.",
    responseEn:
      "Here is guidance for SC-7 Audit Logging.\n\n" +
      "IACS UR E27 specifies the following audit logging requirements for CBS:\n\n" +
      "1. Login/logout events logged\n" +
      "2. Failed authentication attempts logged\n" +
      "3. Configuration changes logged\n" +
      "4. Timestamps synchronized (NTP)\n" +
      "5. Log retention meets minimum (90 days)\n" +
      "6. Logs protected from unauthorized modification\n\n" +
      "Specific remediation steps:\n" +
      "- Windows: Audit Policy → Enable Logon Event Audit, Account Management Audit\n" +
      "- Expand Windows Event Log max size (minimum 100MB)\n" +
      "- Linux: Configure auditd (/etc/audit/audit.rules)\n" +
      "- Verify NTP server config (w32tm /query /status or ntpq -p)\n" +
      "- Recommend central syslog server forwarding\n\n" +
      "Collect log configuration screens and sample logs as evidence.",
  },
  // SC-8: Communication Integrity
  {
    keywords: ["communication", "통신", "encryption", "암호화", "tls", "ssl", "https", "인증서", "certificate"],
    scId: "SC-8",
    intent: "communication_integrity",
    contextHint: "communication",
    responseKo:
      "SC-8 통신 무결성 관련 안내입니다.\n\n" +
      "IACS UR E27은 다음 통신 보안 요구사항을 명시합니다:\n\n" +
      "1. 네트워크 통신 시 암호화 적용 (TLS 1.2 이상)\n" +
      "2. 인증서 기반 통신 인증\n" +
      "3. 비인가 통신 차단 메커니즘\n" +
      "4. 네트워크 세그먼테이션 (IT/OT 분리)\n" +
      "5. 무선 통신 보안 설정 (WPA2/WPA3)\n\n" +
      "📋 구체적 조치 사항:\n" +
      "- 웹 서비스: HTTPS 전용, 자체 서명 인증서 교체\n" +
      "- OT 프로토콜: 암호화를 지원하지 않는 경우 네트워크 분리로 보상\n" +
      "- 무선 AP: WPA2-Enterprise 이상, WEP/WPA 사용 금지\n" +
      "- VPN: IPsec 또는 OpenVPN으로 원격 연결 보호\n\n" +
      "통신 암호화 설정 및 네트워크 구성도를 증빙으로 준비하세요.",
    responseEn:
      "Here is guidance for SC-8 Communication Integrity.\n\n" +
      "IACS UR E27 specifies the following communication security requirements:\n\n" +
      "1. Encryption for network communications (TLS 1.2+)\n" +
      "2. Certificate-based communication authentication\n" +
      "3. Mechanism to block unauthorized communications\n" +
      "4. Network segmentation (IT/OT separation)\n" +
      "5. Wireless communication security settings (WPA2/WPA3)\n\n" +
      "Specific remediation steps:\n" +
      "- Web services: HTTPS only, replace self-signed certificates\n" +
      "- OT protocols: If encryption not supported, compensate with network segmentation\n" +
      "- Wireless APs: WPA2-Enterprise or higher, no WEP/WPA\n" +
      "- VPN: Protect remote connections with IPsec or OpenVPN\n\n" +
      "Prepare communication encryption settings and network diagrams as evidence.",
  },
  // SC-9: Resource Availability
  {
    keywords: ["availability", "가용성", "dos", "denial", "리소스", "resource", "backup", "백업", "복구", "recovery"],
    scId: "SC-9",
    intent: "resource_availability",
    contextHint: "availability",
    responseKo:
      "SC-9 자원 가용성 관련 안내입니다.\n\n" +
      "IACS UR E27은 다음 자원 가용성 요구사항을 명시합니다:\n\n" +
      "1. 시스템 백업 및 복구 절차 문서화\n" +
      "2. DoS 공격에 대한 보호 메커니즘\n" +
      "3. 디스크 공간 모니터링 및 알림\n" +
      "4. 중요 서비스의 자동 재시작 설정\n" +
      "5. 시스템 복원 지점 관리\n\n" +
      "📋 구체적 조치 사항:\n" +
      "- 정기 백업 스케줄 수립 (전체/증분)\n" +
      "- 백업 복구 테스트 정기 실시 (최소 반년 1회)\n" +
      "- 디스크 사용량 모니터링 설정 (80% 알림)\n" +
      "- Windows: 시스템 복원 활성화, Linux: LVM 스냅샷 활용\n" +
      "- 네트워크 장비: 구성 파일 정기 백업\n\n" +
      "백업 정책 문서와 복구 테스트 결과를 증빙으로 준비하세요.",
    responseEn:
      "Here is guidance for SC-9 Resource Availability.\n\n" +
      "IACS UR E27 specifies the following resource availability requirements:\n\n" +
      "1. System backup and recovery procedures documented\n" +
      "2. Protection mechanisms against DoS attacks\n" +
      "3. Disk space monitoring and alerts\n" +
      "4. Auto-restart settings for critical services\n" +
      "5. System restore point management\n\n" +
      "Specific remediation steps:\n" +
      "- Establish regular backup schedule (full/incremental)\n" +
      "- Conduct backup recovery tests regularly (at least semi-annually)\n" +
      "- Configure disk usage monitoring (alert at 80%)\n" +
      "- Windows: Enable System Restore, Linux: Use LVM snapshots\n" +
      "- Network devices: Regular config file backups\n\n" +
      "Prepare backup policy documents and recovery test results as evidence.",
  },
  // SC-10: Screen Lock
  {
    keywords: ["lock", "잠금", "screen", "화면", "session", "세션", "timeout", "타임아웃", "screensaver", "화면보호기"],
    scId: "SC-10",
    intent: "screen_lock",
    contextHint: "screenlock",
    responseKo:
      "SC-10 화면 잠금 관련 안내입니다.\n\n" +
      "IACS UR E27은 다음 자동 세션 잠금 요구사항을 명시합니다:\n\n" +
      "1. 설정 가능한 비활성 시간 후 화면 잠금 (비 브릿지 시스템 최대 15분)\n" +
      "2. 잠금 해제 시 재인증 필요\n" +
      "3. 수동 잠금 기능 사용 가능\n" +
      "4. 타임아웃 기간 설정 가능\n\n" +
      "📋 구체적 조치 사항:\n" +
      "- Windows: 그룹 정책 → 화면 보호기 → 대기 시간 설정 (900초 = 15분)\n" +
      "- Windows: 그룹 정책 → 화면 보호기 다시 시작 시 로그온 화면 표시 활성화\n" +
      "- Linux: xautolock 또는 xss-lock 설정\n" +
      "- 서버: 콘솔 타임아웃 설정\n\n" +
      "브릿지 시스템의 경우 안전상의 이유로 연장된 타임아웃이 허용될 수 있습니다.\n" +
      "화면 잠금 설정 화면을 증빙으로 캡처하세요.",
    responseEn:
      "Here is guidance for SC-10 Screen Lock.\n\n" +
      "IACS UR E27 specifies the following automatic session lock requirements:\n\n" +
      "1. Screen lock after configurable inactivity (max 15 min for non-bridge)\n" +
      "2. Re-authentication required to unlock\n" +
      "3. Manual lock capability available\n" +
      "4. Configurable timeout period\n\n" +
      "Specific remediation steps:\n" +
      "- Windows: Group Policy → Screen Saver → Set wait time (900 sec = 15 min)\n" +
      "- Windows: Group Policy → Enable 'On resume, display logon screen'\n" +
      "- Linux: Configure xautolock or xss-lock\n" +
      "- Servers: Configure console timeout\n\n" +
      "Bridge systems may have extended timeout for safety reasons.\n" +
      "Capture screen lock settings as evidence.",
  },
  // SC-11: Malware Protection
  {
    keywords: ["malware", "악성코드", "바이러스", "virus", "antivirus", "안티바이러스", "백신", "whitelist", "화이트리스트"],
    scId: "SC-11",
    intent: "antivirus",
    contextHint: "malware",
    responseKo:
      "SC-11 악성코드 방어 관련 안내입니다.\n\n" +
      "IACS UR E27은 다음 악성코드 방어 요구사항을 명시합니다:\n\n" +
      "1. 안티바이러스/안티멀웨어 설치 (또는 애플리케이션 화이트리스트 대안)\n" +
      "2. 시그니처/정의 업데이트 적용 가능\n" +
      "3. 실시간 검사 활성화 또는 보상 통제\n" +
      "4. 이동식 미디어 검사 구성됨\n" +
      "5. 격리 기능 존재\n\n" +
      "📋 구체적 조치 사항:\n" +
      "- Windows PC/서버: Windows Defender 또는 기업용 AV 설치 및 실시간 보호 활성화\n" +
      "- 오프라인 환경: USB를 통한 시그니처 수동 업데이트 절차 수립\n" +
      "- OT 시스템: 화이트리스트 방식 적용 (AppLocker, Software Restriction Policy)\n" +
      "- PLC/센서: 안티바이러스 설치 불가 시 네트워크 분리로 보상\n" +
      "- USB 자동실행 비활성화 필수\n\n" +
      "AV 설치 현황 및 실시간 보호 설정 화면을 증빙으로 수집하세요.",
    responseEn:
      "Here is guidance for SC-11 Malware Protection.\n\n" +
      "IACS UR E27 specifies the following malware protection requirements:\n\n" +
      "1. Antivirus/anti-malware installed (or application whitelisting as alternative)\n" +
      "2. Signature/definition updates can be applied\n" +
      "3. Real-time scanning enabled or compensating controls\n" +
      "4. Removable media scanning configured\n" +
      "5. Quarantine capability exists\n\n" +
      "Specific remediation steps:\n" +
      "- Windows PC/Server: Install Windows Defender or enterprise AV, enable real-time protection\n" +
      "- Offline environments: Establish manual signature update procedure via USB\n" +
      "- OT systems: Apply whitelisting (AppLocker, Software Restriction Policy)\n" +
      "- PLC/sensors: If AV not possible, compensate with network isolation\n" +
      "- USB autorun must be disabled\n\n" +
      "Collect AV installation status and real-time protection settings as evidence.",
  },
  // SC-12: Physical Security
  {
    keywords: ["physical", "물리", "usb", "port", "bios", "부팅", "boot", "물리적"],
    scId: "SC-12",
    intent: "physical_security",
    contextHint: "physical",
    responseKo:
      "SC-12 물리적 보안 관련 안내입니다.\n\n" +
      "IACS UR E27은 다음 물리적 보안 요구사항을 명시합니다:\n\n" +
      "1. USB 포트 접근 제어 (물리적 또는 소프트웨어적)\n" +
      "2. BIOS/UEFI 비밀번호 설정\n" +
      "3. 부팅 순서 제한 (하드디스크 우선)\n" +
      "4. 불필요한 물리 포트 비활성화\n" +
      "5. 장비 물리적 접근 제한 (잠금장치)\n\n" +
      "📋 구체적 조치 사항:\n" +
      "- BIOS: 관리자 비밀번호 설정, USB/CD 부팅 비활성화\n" +
      "- Windows: 그룹 정책으로 이동식 저장장치 접근 제한\n" +
      "- Linux: udev 규칙으로 USB 저장장치 차단\n" +
      "- 서버실/장비실 물리적 잠금 및 출입 기록\n" +
      "- 네트워크 장비: 미사용 콘솔 포트 비활성화\n\n" +
      "BIOS 설정 및 물리적 보안 현황 사진을 증빙으로 수집하세요.",
    responseEn:
      "Here is guidance for SC-12 Physical Security.\n\n" +
      "IACS UR E27 specifies the following physical security requirements:\n\n" +
      "1. USB port access control (physical or software)\n" +
      "2. BIOS/UEFI password set\n" +
      "3. Boot order restricted (hard disk priority)\n" +
      "4. Unnecessary physical ports disabled\n" +
      "5. Equipment physical access restrictions (locks)\n\n" +
      "Specific remediation steps:\n" +
      "- BIOS: Set admin password, disable USB/CD boot\n" +
      "- Windows: Group Policy to restrict removable storage access\n" +
      "- Linux: udev rules to block USB storage devices\n" +
      "- Server/equipment room: Physical locks and access logs\n" +
      "- Network devices: Disable unused console ports\n\n" +
      "Collect BIOS settings and physical security photos as evidence.",
  },
  // SC-13: Patch Management
  {
    keywords: ["patch", "패치", "update", "업데이트", "hotfix", "핫픽스", "wsus", "vulnerability", "취약점"],
    scId: "SC-13",
    intent: "patch_management",
    contextHint: "patch",
    responseKo:
      "SC-13 패치 관리 관련 안내입니다.\n\n" +
      "IACS UR E27은 다음 패치 관리 요구사항을 명시합니다:\n\n" +
      "1. 문서화된 패치 관리 절차\n" +
      "2. 통제된 방식으로 패치 적용 가능\n" +
      "3. 배포 전 패치 테스트 프로세스 정의\n" +
      "4. 롤백 기능 존재\n" +
      "5. 정기적인 패치 검토 주기 증명\n\n" +
      "📋 구체적 조치 사항:\n" +
      "- Windows: WSUS 또는 수동 패치 관리 프로세스 수립\n" +
      "- 패치 적용 전 테스트 환경에서 검증 절차 문서화\n" +
      "- 시스템 복원 지점 생성 후 패치 적용 (롤백 대비)\n" +
      "- 분기별 패치 검토 회의 및 결과 기록\n" +
      "- OT 시스템: 제조사 승인 패치만 적용, 미승인 시 보상 통제\n\n" +
      "패치 관리 정책 문서와 최근 패치 이력을 준비하세요.",
    responseEn:
      "Here is guidance for SC-13 Patch Management.\n\n" +
      "IACS UR E27 specifies the following patch management requirements:\n\n" +
      "1. Documented patch management procedure\n" +
      "2. Patches can be applied in a controlled manner\n" +
      "3. Patch testing process defined before deployment\n" +
      "4. Rollback capability exists\n" +
      "5. Regular patch review cycle evidenced\n\n" +
      "Specific remediation steps:\n" +
      "- Windows: Establish WSUS or manual patch management process\n" +
      "- Document verification procedures in test environment before applying\n" +
      "- Create system restore point before patching (rollback readiness)\n" +
      "- Quarterly patch review meetings and recorded results\n" +
      "- OT systems: Apply only manufacturer-approved patches, compensating controls if not\n\n" +
      "Prepare your patch management policy document and recent patch history.",
  },
  // E26 / general compliance
  {
    keywords: ["e26", "선박", "ship", "vessel", "iacs", "ur", "규정", "compliance", "준수"],
    scId: "E26",
    intent: "general_compliance",
    contextHint: "compliance",
    responseKo:
      "IACS UR E26 선박 사이버 복원력 관련 안내입니다.\n\n" +
      "E26은 선박 수준의 사이버 복원력 요구사항을 정의합니다:\n\n" +
      "1. 사이버 보안 관리 계획 (Cybersecurity Management Plan)\n" +
      "2. 자산 식별 및 네트워크 토폴로지 문서화\n" +
      "3. 구역(Zone) 및 통로(Conduit) 정의\n" +
      "4. 위험 평가 (Risk Assessment)\n" +
      "5. 설계 검증 및 보안 테스트\n\n" +
      "E26은 선박 통합 수준, E27은 개별 CBS(Computer Based System) 수준의 요구사항입니다.\n" +
      "본 시스템은 E27 보안 구성 점검(SC-1~SC-13)을 지원합니다.\n\n" +
      "특정 SC 항목에 대해 질문하시면 상세 안내를 드립니다.",
    responseEn:
      "Here is guidance on IACS UR E26 Cyber Resilience of Ships.\n\n" +
      "E26 defines ship-level cyber resilience requirements:\n\n" +
      "1. Cybersecurity Management Plan\n" +
      "2. Asset identification and network topology documentation\n" +
      "3. Zone and Conduit definitions\n" +
      "4. Risk Assessment\n" +
      "5. Design verification and security testing\n\n" +
      "E26 covers ship integration level; E27 covers individual CBS (Computer Based System) level.\n" +
      "This system supports E27 Security Configuration checks (SC-1 through SC-13).\n\n" +
      "Ask about a specific SC item for detailed guidance.",
  },
  // DFD / Network Diagram
  {
    keywords: ["dfd", "diagram", "다이어그램", "데이터 흐름", "data flow", "토폴로지", "topology"],
    scId: "E26",
    intent: "dfd_guidance",
    contextHint: "dfd",
    responseKo:
      "DFD (데이터 흐름도) 작성 관련 안내입니다.\n\n" +
      "IACS UR E26에서는 선박 네트워크 토폴로지와 데이터 흐름을 문서화하도록 요구합니다:\n\n" +
      "1. 모든 CBS(Computer Based System) 식별 및 매핑\n" +
      "2. 네트워크 연결 관계 표시\n" +
      "3. 구역(Zone) 별 장비 그룹화\n" +
      "4. 통로(Conduit) — 구역 간 통신 경로 표시\n" +
      "5. 외부 연결 지점 명시\n\n" +
      "본 시스템의 'DFD 자동 생성' 기능을 사용하면 등록된 하드웨어를 기반으로 " +
      "자동으로 다이어그램을 생성할 수 있습니다.\n\n" +
      "하드웨어 목록을 먼저 등록한 후 AI DFD 생성을 시도해 보세요.",
    responseEn:
      "Here is guidance on DFD (Data Flow Diagram) creation.\n\n" +
      "IACS UR E26 requires documentation of ship network topology and data flows:\n\n" +
      "1. Identify and map all CBS (Computer Based Systems)\n" +
      "2. Show network connection relationships\n" +
      "3. Group equipment by Zone\n" +
      "4. Show Conduits — communication paths between zones\n" +
      "5. Identify external connection points\n\n" +
      "Use the 'Generate DFD' feature to automatically create a diagram based on " +
      "your registered hardware inventory.\n\n" +
      "Register your hardware list first, then try AI DFD generation.",
  },
  // SBOM
  {
    keywords: ["sbom", "소프트웨어", "software", "bom", "inventory", "인벤토리", "설치"],
    scId: "E27",
    intent: "sbom_guidance",
    contextHint: "sbom",
    responseKo:
      "SBOM (소프트웨어 자재 목록) 관련 안내입니다.\n\n" +
      "IACS UR E27에서는 CBS의 설치된 소프트웨어 목록(Install SBOM)을 요구합니다:\n\n" +
      "1. 설치된 모든 실행 파일/프로그램 식별\n" +
      "2. 각 소프트웨어의 버전, 벤더 정보\n" +
      "3. 불필요한 소프트웨어 식별 및 제거\n" +
      "4. 알려진 취약점(CVE) 확인\n\n" +
      "참고: 'Install SBOM'은 운영 중인 시스템의 설치된 소프트웨어만 포함합니다 " +
      "(개발 단계 종속성이 아님).\n\n" +
      "하드웨어별 소프트웨어를 등록하면 CVE 자동 매칭 기능을 활용할 수 있습니다.",
    responseEn:
      "Here is guidance on SBOM (Software Bill of Materials).\n\n" +
      "IACS UR E27 requires an Install SBOM for CBS:\n\n" +
      "1. Identify all installed executables/programs\n" +
      "2. Version and vendor info for each software\n" +
      "3. Identify and remove unnecessary software\n" +
      "4. Check for known vulnerabilities (CVE)\n\n" +
      "Note: 'Install SBOM' covers only installed software on operational systems " +
      "(not dev-stage dependencies).\n\n" +
      "Register software per hardware to leverage automatic CVE matching.",
  },
];

const FALLBACK_RESPONSE_KO =
  "죄송합니다, 질문을 정확히 이해하지 못했습니다.\n\n" +
  "다음과 같은 주제에 대해 도움을 드릴 수 있습니다:\n\n" +
  "📌 보안 구성 점검 (SC-1 ~ SC-13):\n" +
  "- '비밀번호 정책' 또는 'SC-1'\n" +
  "- '계정 보안' 또는 'SC-2'\n" +
  "- '접근 제어' 또는 'SC-3'\n" +
  "- '데이터 무결성' 또는 'SC-4'\n" +
  "- '네트워크 보안' 또는 'SC-5'\n" +
  "- 'RDP 보안' 또는 'SC-6'\n" +
  "- '감사 로깅' 또는 'SC-7'\n" +
  "- '통신 암호화' 또는 'SC-8'\n" +
  "- '가용성' 또는 'SC-9'\n" +
  "- '화면 잠금' 또는 'SC-10'\n" +
  "- '악성코드 방어' 또는 'SC-11'\n" +
  "- '물리적 보안' 또는 'SC-12'\n" +
  "- '패치 관리' 또는 'SC-13'\n\n" +
  "📌 기타:\n" +
  "- 'IACS', 'E26', 'E27' — 규정 개요\n" +
  "- 'DFD', '다이어그램' — DFD 작성 가이드\n" +
  "- 'SBOM', '소프트웨어' — 소프트웨어 자재 목록\n\n" +
  "위 키워드를 포함하여 질문해 주세요.";

const FALLBACK_RESPONSE_EN =
  "I'm sorry, I didn't quite understand your question.\n\n" +
  "I can help with the following topics:\n\n" +
  "Security Configuration Checks (SC-1 through SC-13):\n" +
  "- 'password policy' or 'SC-1'\n" +
  "- 'account security' or 'SC-2'\n" +
  "- 'access control' or 'SC-3'\n" +
  "- 'data integrity' or 'SC-4'\n" +
  "- 'network security' or 'SC-5'\n" +
  "- 'RDP security' or 'SC-6'\n" +
  "- 'audit logging' or 'SC-7'\n" +
  "- 'communication encryption' or 'SC-8'\n" +
  "- 'availability' or 'SC-9'\n" +
  "- 'screen lock' or 'SC-10'\n" +
  "- 'malware protection' or 'SC-11'\n" +
  "- 'physical security' or 'SC-12'\n" +
  "- 'patch management' or 'SC-13'\n\n" +
  "Other topics:\n" +
  "- 'IACS', 'E26', 'E27' — Regulation overview\n" +
  "- 'DFD', 'diagram' — DFD creation guide\n" +
  "- 'SBOM', 'software' — Software Bill of Materials\n\n" +
  "Please include one of these keywords in your question.";

// SC-ID pattern matching (e.g., "SC-1", "sc1", "SC 1")
const SC_ID_PATTERN = /sc[-\s]?(\d{1,2})/i;

const SC_ID_MAP: Record<string, string> = {
  "1": "SC-1",
  "2": "SC-2",
  "3": "SC-3",
  "4": "SC-4",
  "5": "SC-5",
  "6": "SC-6",
  "7": "SC-7",
  "8": "SC-8",
  "9": "SC-9",
  "10": "SC-10",
  "11": "SC-11",
  "12": "SC-12",
  "13": "SC-13",
};

interface HardwareSummary {
  total: number;
  byType: Record<string, number>;
  zones: string[];
}

function buildContextSuffix(
  isKorean: boolean,
  hw: HardwareSummary,
): string {
  if (hw.total === 0) return "";

  const typeCounts = Object.entries(hw.byType)
    .map(([t, c]) => `${t}: ${c}`)
    .join(", ");
  const zoneList = hw.zones.length > 0 ? hw.zones.join(", ") : (isKorean ? "미설정" : "Not set");

  if (isKorean) {
    return (
      "\n\n─── 현재 프로젝트 현황 ───\n" +
      `등록된 하드웨어: ${hw.total}개\n` +
      `유형별: ${typeCounts}\n` +
      `구역(Zone): ${zoneList}\n\n` +
      "위 하드웨어에 대해 해당 SC 항목 점검을 진행하시기 바랍니다."
    );
  }
  return (
    "\n\n--- Current Project Context ---\n" +
    `Registered hardware: ${hw.total}\n` +
    `By type: ${typeCounts}\n` +
    `Zones: ${zoneList}\n\n` +
    "Please proceed with the SC check for the hardware listed above."
  );
}

async function getProjectHardwareSummary(projectId: string): Promise<HardwareSummary> {
  const hardware = await prisma.hardware.findMany({
    where: { projectId },
    select: { type: true, zone: true },
  });

  const byType: Record<string, number> = {};
  const zoneSet = new Set<string>();

  for (const hw of hardware) {
    byType[hw.type] = (byType[hw.type] || 0) + 1;
    if (hw.zone) zoneSet.add(hw.zone);
  }

  return {
    total: hardware.length,
    byType,
    zones: Array.from(zoneSet),
  };
}

async function generateResponse(
  content: string,
  projectId: string,
): Promise<{
  response: string;
  intent: string;
  confidence: number;
}> {
  const lowerContent = content.toLowerCase();
  const isKorean = /[\uac00-\ud7af]/.test(content);

  // 1. Try direct SC-ID match first (e.g., "SC-5", "sc5", "SC 5")
  const scIdMatch = content.match(SC_ID_PATTERN);
  if (scIdMatch) {
    const scNum = scIdMatch[1];
    const scId = SC_ID_MAP[scNum];
    if (scId) {
      const rule = KEYWORD_RULES.find((r) => r.scId === scId);
      if (rule) {
        const hwSummary = await getProjectHardwareSummary(projectId);
        const contextSuffix = buildContextSuffix(isKorean, hwSummary);
        return {
          response: (isKorean ? rule.responseKo : rule.responseEn) + contextSuffix,
          intent: rule.intent,
          confidence: 0.95,
        };
      }
    }
  }

  // 2. Keyword matching with scoring — pick the best match
  let bestRule: KeywordRule | null = null;
  let bestScore = 0;

  for (const rule of KEYWORD_RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (lowerContent.includes(kw.toLowerCase())) {
        // Longer keywords get higher weight
        score += kw.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestRule = rule;
    }
  }

  if (bestRule && bestScore > 0) {
    const hwSummary = await getProjectHardwareSummary(projectId);
    const contextSuffix = buildContextSuffix(isKorean, hwSummary);
    // Confidence is higher when more/longer keywords match
    const confidence = Math.min(0.95, 0.7 + bestScore * 0.02);
    return {
      response: (isKorean ? bestRule.responseKo : bestRule.responseEn) + contextSuffix,
      intent: bestRule.intent,
      confidence,
    };
  }

  // 3. Fallback — helpful suggestions listing all available topics
  return {
    response: isKorean ? FALLBACK_RESPONSE_KO : FALLBACK_RESPONSE_EN,
    intent: "unrecognized",
    confidence: 0.2,
  };
}

// ─── GET: List conversations ────────────────────────────────────────────────

export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);
  if (!isWriteRole(user.role)) return apiError("Read-only role cannot modify this resource", 403);

  const conversations = await prisma.aiConversation.findMany({
    where: {
      userId: user.id,
      projectId,
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      intent: true,
      confidence: true,
      createdAt: true,
    },
  });

  return NextResponse.json(conversations);
}

// ─── POST: Send a message ───────────────────────────────────────────────────

export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);
  if (!isWriteRole(user.role)) return apiError("Read-only role cannot modify this resource", 403);

  let body: { content?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const content = body.content?.trim();
  if (!content) {
    return apiError("Content is required", 400);
  }

  if (content.length > 2000) {
    return apiError("Content too long (max 2000 characters)", 400);
  }

  // Generate rule-based response (now async with project context)
  const { response, intent, confidence } = await generateResponse(content, projectId);

  // Save user message and assistant response in a transaction
  const [userMessage, assistantMessage] = await prisma.$transaction([
    prisma.aiConversation.create({
      data: {
        userId: user.id,
        projectId,
        role: "user",
        content,
        intent,
        confidence,
      },
    }),
    prisma.aiConversation.create({
      data: {
        userId: user.id,
        projectId,
        role: "assistant",
        content: response,
        intent,
        confidence,
      },
    }),
  ]);

  return NextResponse.json({
    userMessage: {
      id: userMessage.id,
      role: userMessage.role,
      content: userMessage.content,
      intent: userMessage.intent,
      confidence: userMessage.confidence,
      createdAt: userMessage.createdAt,
    },
    assistantMessage: {
      id: assistantMessage.id,
      role: assistantMessage.role,
      content: assistantMessage.content,
      intent: assistantMessage.intent,
      confidence: assistantMessage.confidence,
      createdAt: assistantMessage.createdAt,
    },
  });
}
