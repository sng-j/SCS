/**
 * E27 compliance evaluation from a decrypted audit result payload.
 *
 * Pure function — shared by the vendor upload route (server) and the
 * HwSlidePanel renderer (client) so the same checks appear in both contexts.
 *
 * Supports two payload shapes:
 *   - Windows (PowerShell `.ps1` tool): AccountPolicy/LocalAccounts/RDP/
 *     AuditPolicy/ScreenLock/Antivirus.WindowsDefender/PatchStatus.AutoUpdateOff
 *   - Linux (`linux_audit.py`): AccountPolicy/LocalAccounts/SSHConfig/Firewall/
 *     AuditLog/USBPolicy/Antivirus.clamav/PatchStatus.auto_update
 *
 * Previous versions only ran the Windows check list. A Linux upload would
 * produce an all-FAIL result with Windows-themed item labels (e.g. "NLA
 * Required", "Windows Defender Enabled"), making reviewers think the tool
 * misidentified the platform. We now dispatch on SystemInfo.Platform and
 * fall back to content sniffing if that field is absent.
 */

export interface E27Item {
  cat: string;
  item: string;
  detail: string;
  pass: boolean;
}

export interface E27Result {
  pass: number;
  fail: number;
  total: number;
  items: E27Item[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function detectPlatform(data: any): "linux" | "windows" {
  const sysinfo = (data?.SystemInfo ?? {}) as AnyObj;
  const plat = String(sysinfo.Platform ?? "").toLowerCase();
  if (plat === "linux") return "linux";
  if (plat === "windows") return "windows";

  const osStr = String(sysinfo.OS ?? "").toLowerCase();
  if (/linux|ubuntu|centos|debian|rhel|fedora|arch|suse|alpine/.test(osStr)) return "linux";
  if (/windows/.test(osStr)) return "windows";

  // Last resort: sniff Linux-only keys. These only exist in the Python script
  // output, so their presence is a reliable Linux signal even if SystemInfo
  // is stripped.
  if (data?.SSHConfig || data?.AuditLog || data?.Firewall?.type) return "linux";
  return "windows";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildWindowsE27(data: any): E27Item[] {
  const items: E27Item[] = [];
  const ap = data?.AccountPolicy ?? {};
  const la = data?.LocalAccounts ?? {};
  const net = data?.NetworkSettings ?? {};
  const usb = data?.USBPolicy ?? {};
  const rdp = data?.RDP ?? {};
  const aud = data?.AuditPolicy ?? {};
  const sl = data?.ScreenLock ?? {};
  const av = data?.Antivirus?.WindowsDefender ?? data?.Antivirus ?? {};
  const pat = data?.PatchStatus ?? {};

  const chk = (pass: boolean, cat: string, item: string, detail: unknown) => {
    items.push({ cat, item, detail: String(detail), pass });
  };

  chk(ap.PasswordComplexity === "Enabled", "SC-1", "Password Complexity", ap.PasswordComplexity ?? "N/A");
  chk(parseInt(ap.MinPwdLen ?? "0") >= 8, "SC-1", "Min Length >= 8", ap.MinPwdLen ?? "N/A");
  chk(parseInt(ap.MaxPwdAge ?? "999") <= 90, "SC-1", "Max Age <= 90d", ap.MaxPwdAge ?? "N/A");
  const lt = parseInt(ap.LockoutThreshold ?? "0");
  chk(lt > 0 && lt <= 10, "SC-1", "Lockout Threshold", ap.LockoutThreshold ?? "N/A");

  const ge = la.GuestEnabled;
  chk(ge === false || ge === "False" || ge === "0" || ge === 0, "SC-2", "Guest Disabled", ge ?? "N/A");

  chk(!!net.SMBv1Disabled, "SC-5", "SMBv1 Disabled", net.SMBv1Disabled ? "Yes" : "No");
  chk(parseInt(usb.AutoRunDisabled ?? "0") > 0, "SC-5", "AutoRun Disabled", usb.AutoRunDisabled ?? "N/A");

  chk(!!rdp.NLARequired, "SC-6", "NLA Required", rdp.NLARequired ? "Yes" : "No");
  chk(parseInt(rdp.EncryptionLevel ?? "0") >= 3, "SC-6", "RDP Encryption >= 3", rdp.EncryptionLevel ?? "N/A");

  let hasLogon = false, hasProc = false;
  for (const [k, v] of Object.entries(aud)) {
    if (/logon/i.test(k) && v !== "No Auditing") hasLogon = true;
    if (/process/i.test(k) && v !== "No Auditing") hasProc = true;
  }
  chk(hasLogon, "SC-7", "Logon Auditing", hasLogon ? "Enabled" : "No");
  chk(hasProc, "SC-7", "Process Auditing", hasProc ? "Enabled" : "No");

  chk(sl.ScreenSaverEnabled === "1", "SC-10", "Screen Saver", sl.ScreenSaverEnabled ?? "0");
  chk(sl.ScreenSaverSecure === "1", "SC-10", "Password on Resume", sl.ScreenSaverSecure ?? "0");
  chk(parseInt(sl.ScreenSaverTimeout ?? "9999") <= 600, "SC-10", "Timeout <= 600s", sl.ScreenSaverTimeout ?? "N/A");

  chk(!!av.Enabled, "SC-11", "AV Enabled", av.Enabled ? "Yes" : "No");
  chk(!!av.RealTimeProtection, "SC-11", "Real-time Protection", av.RealTimeProtection ? "Yes" : "No");
  chk(parseInt(av.SignatureAge_Days ?? "999") <= 7, "SC-11", "Signature <= 7d", av.SignatureAge_Days ?? "N/A");

  chk(!(pat.AutoUpdateOff ?? true), "SC-13", "Auto-update", (pat.AutoUpdateOff ?? true) ? "Off" : "On");

  return items;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildLinuxE27(data: any): E27Item[] {
  const items: E27Item[] = [];
  const ap = data?.AccountPolicy ?? {};
  const la = data?.LocalAccounts ?? {};
  const ssh = data?.SSHConfig ?? {};
  const fw = data?.Firewall ?? {};
  const audl = data?.AuditLog ?? {};
  const usb = data?.USBPolicy ?? {};
  const av = data?.Antivirus ?? {};
  const clam = av.clamav ?? {};
  const rkh = av.rkhunter ?? {};
  const chkrk = av.chkrootkit ?? {};
  const pat = data?.PatchStatus ?? {};
  const net = data?.NetworkSettings ?? {};

  const chk = (pass: boolean, cat: string, item: string, detail: unknown) => {
    items.push({ cat, item, detail: String(detail ?? "N/A"), pass });
  };

  // SC-1 Identification & Authentication
  const minLen = parseInt(String(ap.min_length ?? "0"));
  chk(minLen >= 8, "SC-1", "Min Length >= 8", ap.min_length);
  const maxAge = parseInt(String(ap.max_age ?? "999"));
  chk(maxAge > 0 && maxAge <= 90, "SC-1", "Max Age <= 90d", ap.max_age);
  chk(!!ap.complexity, "SC-1", "Password Complexity (pwquality)", ap.complexity);
  chk(ap.sha512_hash === true, "SC-1", "Strong Password Hash", ap.sha512_hash ? "sha512/yescrypt" : "weak/unknown");
  const lockoutAtt = parseInt(String(ap.lockout_attempts ?? "0"));
  chk(lockoutAtt > 0 && lockoutAtt <= 10, "SC-1", "Lockout Attempts", ap.lockout_attempts);

  // SC-2 Account Management
  const uid0 = Array.isArray(la.uid0_accounts) ? la.uid0_accounts : [];
  chk(uid0.length === 1 && uid0[0] === "root", "SC-2", "Single UID-0 Account", uid0.join(",") || "None");
  const sudoers = Array.isArray(la.sudo_members) ? la.sudo_members.length : 0;
  chk(sudoers > 0 && sudoers <= 5, "SC-2", "Sudoers (<=5)", String(sudoers));
  const loginUsers = Array.isArray(la.login_users) ? la.login_users.length : 0;
  chk(loginUsers > 0 && loginUsers <= 20, "SC-2", "Login User Count", String(loginUsers));

  // SC-4 Session Control — SSH ClientAliveInterval
  const idleTimeout = parseInt(String(ssh.idle_timeout ?? "0"));
  chk(idleTimeout > 0 && idleTimeout <= 900, "SC-4", "SSH Idle Timeout", ssh.idle_timeout);

  // SC-5 Network Segmentation — IPv6 disabled is a common hardening baseline
  chk(net.ipv6_disabled === true, "SC-5", "IPv6 Disabled (if unused)", net.ipv6_disabled ? "Yes" : "No");

  // SC-6 Boundary Protection — firewall + SSH hardening
  chk(fw.enabled === true, "SC-6", "Firewall Enabled", `${fw.type ?? "none"}: ${fw.enabled ? "active" : "inactive"}`);
  const defInput = String(fw.default_input ?? "").toLowerCase();
  chk(/deny|drop|reject/.test(defInput), "SC-6", "Firewall Default Deny", fw.default_input);
  const rootLogin = String(ssh.root_login ?? "").toLowerCase();
  chk(rootLogin === "no" || rootLogin === "prohibit-password", "SC-6", "SSH PermitRootLogin", ssh.root_login);
  const pwAuth = String(ssh.password_auth ?? "").toLowerCase();
  chk(pwAuth === "no", "SC-6", "SSH PasswordAuthentication", ssh.password_auth);
  // Default OpenSSH value is "no" (safe) when the directive is not
  // configured; the audit script now fills that default explicitly, but we
  // also treat missing/empty/null as safe to cover legacy payloads.
  const permitEmpty = String(ssh.permit_empty ?? "").toLowerCase();
  chk(permitEmpty === "no" || permitEmpty === "" || ssh.permit_empty == null, "SC-6", "SSH PermitEmptyPasswords", ssh.permit_empty ?? "default (no)");

  // SC-7 Audit Log & Monitoring — auditd
  chk(audl.auditd_running === true, "SC-7", "auditd Running", audl.auditd_running ? "active" : "inactive");
  chk(audl.auditd_enabled === true, "SC-7", "auditd Enabled on Boot", audl.auditd_enabled ? "enabled" : "disabled");
  chk(parseInt(String(audl.rules_count ?? "0")) > 0, "SC-7", "Audit Rules Loaded", audl.rules_count);
  chk(audl.syslog_enabled === true, "SC-7", "syslog Configured", audl.syslog_enabled ? "yes" : "no");

  // SC-10 Malicious Code Protection — ClamAV
  chk(clam.installed === true, "SC-10", "ClamAV Installed", clam.installed ? (clam.version || "yes") : "no");
  chk(clam.daemon_running === true, "SC-10", "ClamAV Daemon Running", clam.daemon_running ? "active" : "inactive");
  const sigAge = parseInt(String(clam.signature_age_days ?? "999"));
  chk(sigAge <= 7, "SC-10", "Signature <= 7d", clam.signature_age_days);

  // SC-11 System Integrity — rootkit hunters
  chk(rkh.installed === true || chkrk.installed === true, "SC-11", "Rootkit Scanner Installed", `rkhunter=${rkh.installed ? "yes" : "no"}, chkrootkit=${chkrk.installed ? "yes" : "no"}`);

  // SC-12 Removable Media Control
  chk(usb.usb_storage_blocked === true, "SC-12", "USB Storage Blocked", usb.usb_storage_blocked ? "Yes" : "No");
  chk(usb.automount_disabled === true, "SC-12", "Automount Disabled", usb.automount_disabled ? "Yes" : "No");

  // SC-13 Software / Firmware Updates
  chk(pat.auto_update === true, "SC-13", "Auto-update Enabled", pat.auto_update ? "Yes" : "No");
  const upgradable = parseInt(String(pat.upgradable ?? "0"));
  chk(upgradable < 20, "SC-13", "Pending Upgrades < 20", pat.upgradable);

  return items;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildE27(data: any): E27Result {
  const platform = detectPlatform(data);
  const items = platform === "linux" ? buildLinuxE27(data) : buildWindowsE27(data);
  const passCount = items.filter((i) => i.pass).length;
  return { pass: passCount, fail: items.length - passCount, total: items.length, items };
}
