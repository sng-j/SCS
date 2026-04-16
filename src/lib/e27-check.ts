// E27 Hardening Check — shared between upload and page load

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
export function buildE27(data: any): E27Result {
  const items: E27Item[] = [];
  const ap = data.AccountPolicy ?? {};
  const la = data.LocalAccounts ?? {};
  const net = data.NetworkSettings ?? {};
  const usb = data.USBPolicy ?? {};
  const rdp = data.RDP ?? {};
  const aud = data.AuditPolicy ?? {};
  const sl = data.ScreenLock ?? {};
  const av = data.Antivirus?.WindowsDefender ?? data.Antivirus ?? {};
  const pat = data.PatchStatus ?? {};

  const chk = (pass: boolean, cat: string, item: string, detail: string) => {
    items.push({ cat, item, detail: String(detail), pass });
  };

  chk(ap.PasswordComplexity === "Enabled", "SC-1", "Password Complexity", ap.PasswordComplexity ?? "N/A");
  chk(parseInt(ap.MinPwdLen ?? "0") >= 8, "SC-1", "Min Length >= 8", `${ap.MinPwdLen ?? "N/A"}`);
  chk(parseInt(ap.MaxPwdAge ?? "999") <= 90, "SC-1", "Max Age <= 90d", `${ap.MaxPwdAge ?? "N/A"}`);
  const lt = parseInt(ap.LockoutThreshold ?? "0");
  chk(lt > 0 && lt <= 10, "SC-1", "Lockout Threshold", `${ap.LockoutThreshold ?? "N/A"}`);

  const ge = la.GuestEnabled;
  chk(ge === false || ge === "False" || ge === "0" || ge === 0, "SC-2", "Guest Disabled", String(ge ?? "N/A"));

  chk(!!net.SMBv1Disabled, "SC-5", "SMBv1 Disabled", net.SMBv1Disabled ? "Yes" : "No");
  chk(parseInt(usb.AutoRunDisabled ?? "0") > 0, "SC-5", "AutoRun Disabled", String(usb.AutoRunDisabled ?? "N/A"));

  chk(!!rdp.NLARequired, "SC-6", "NLA Required", rdp.NLARequired ? "Yes" : "No");
  chk(parseInt(rdp.EncryptionLevel ?? "0") >= 3, "SC-6", "RDP Encryption >= 3", String(rdp.EncryptionLevel ?? "N/A"));

  let hasLogon = false, hasProc = false;
  for (const [k, v] of Object.entries(aud)) {
    if (/logon/i.test(k) && v !== "No Auditing") hasLogon = true;
    if (/process/i.test(k) && v !== "No Auditing") hasProc = true;
  }
  chk(hasLogon, "SC-7", "Logon Auditing", hasLogon ? "Enabled" : "No");
  chk(hasProc, "SC-7", "Process Auditing", hasProc ? "Enabled" : "No");

  chk(sl.ScreenSaverEnabled === "1", "SC-10", "Screen Saver", String(sl.ScreenSaverEnabled ?? "0"));
  chk(sl.ScreenSaverSecure === "1", "SC-10", "Password on Resume", String(sl.ScreenSaverSecure ?? "0"));
  chk(parseInt(sl.ScreenSaverTimeout ?? "9999") <= 600, "SC-10", "Timeout <= 600s", `${sl.ScreenSaverTimeout ?? "N/A"}`);

  chk(!!av.Enabled, "SC-11", "AV Enabled", av.Enabled ? "Yes" : "No");
  chk(!!av.RealTimeProtection, "SC-11", "Real-time Protection", av.RealTimeProtection ? "Yes" : "No");
  chk(parseInt(av.SignatureAge_Days ?? "999") <= 7, "SC-11", "Signature <= 7d", `${av.SignatureAge_Days ?? "N/A"}`);

  chk(!(pat.AutoUpdateOff ?? true), "SC-13", "Auto-update", (pat.AutoUpdateOff ?? true) ? "Off" : "On");

  const passCount = items.filter((i) => i.pass).length;
  return { pass: passCount, fail: items.length - passCount, total: items.length, items };
}
