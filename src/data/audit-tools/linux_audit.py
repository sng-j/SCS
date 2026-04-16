#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SCS Linux Hardening Audit + SBOM  v1.0
IACS UR E27 / IEC 62443-3-3  |  CycloneDX 1.4

Injected at runtime by SCS server:
  _AK = "XXXXXX"  (6-digit audit key)
  _GI = 7          (garbage interval)
"""
import sys, os, json, subprocess, hashlib, base64, time, datetime
import platform, re, secrets, socket
from pathlib import Path

# ── injected by SCS server ───────────────────────────────────────────
_AK = "000000"
_GI = 7

# ─────────────────────────────────────────────────────────────────────
# ENCRYPTION  (SCSDAT2 format — same PHP decryptor as Windows)
# ─────────────────────────────────────────────────────────────────────
def protect_data(json_str, pwd, gi):
    try:
        from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
        from cryptography.hazmat.primitives import hashes, padding as apad
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        salt     = bytes([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16])
        kdf      = PBKDF2HMAC(algorithm=hashes.SHA256(), length=48, salt=salt, iterations=100000)
        key_iv   = kdf.derive(pwd.encode())
        key, iv  = key_iv[:32], key_iv[32:48]
        padder   = apad.PKCS7(128).padder()
        plain    = json_str.encode('utf-8')
        padded   = padder.update(plain) + padder.finalize()
        cipher   = Cipher(algorithms.AES(key), modes.CBC(iv))
        enc      = cipher.encryptor()
        ct       = enc.update(padded) + enc.finalize()
        result   = bytearray()
        cnt      = 0
        for b in ct:
            result.append(b)
            cnt += 1
            if cnt % gi == 0:
                result.append(secrets.randbits(8))
        hdr   = b"SCSDAT2" + bytes([gi])
        salt2 = bytes([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16])
        final = hdr + salt2 + iv + bytes(result)
        return base64.b64encode(final).decode('ascii')
    except Exception as e:
        # Fallback: no encryption
        payload = b"SCSPLAIN" + json_str.encode('utf-8')
        return base64.b64encode(payload).decode('ascii')

# ─────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────
def run(cmd, timeout=10):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip()
    except Exception:
        return ""

def read_file(path):
    try:
        return Path(path).read_text(errors='replace').strip()
    except Exception:
        return ""

def norm_ver(v):
    if not v: return ""
    v = v.strip().lstrip('v')
    m = re.match(r'(\d+\.\d+\.\d+\.\d+|\d+\.\d+\.\d+|\d+\.\d+)', v)
    return m.group(1) if m else v[:40]

def make_cpe(pub, name, ver):
    def s(x):
        if not x: return '*'
        return re.sub(r'[^a-z0-9_.\\-]', '', x.lower().replace(' ', '_'))
    p, n, v = s(pub), s(name), s(ver) or '*'
    if not n: return ''
    return f'cpe:2.3:a:{p}:{n}:{v}:*:*:*:*:*:*:*'

def make_purl(name, ver, pub='', pkg_type='generic'):
    from urllib.parse import quote as uq
    n  = uq(name.replace(' ', '_'), safe='')
    ns = uq(pub.lower().replace(' ', '_'), safe='') if pub else ''
    v  = f'@{uq(ver, safe="")}' if ver else ''
    if ns: return f'pkg:{pkg_type}/{ns}/{n}{v}'
    return f'pkg:{pkg_type}/{n}{v}'

# ─────────────────────────────────────────────────────────────────────
# DISTRO DETECTION
# ─────────────────────────────────────────────────────────────────────
def get_distro():
    info = {}
    for line in read_file('/etc/os-release').splitlines():
        if '=' in line:
            k, _, v = line.partition('=')
            info[k.strip()] = v.strip().strip('"')
    name    = info.get('NAME', platform.system())
    version = info.get('VERSION_ID', '')
    pretty  = info.get('PRETTY_NAME', f'{name} {version}')
    id_like = (info.get('ID_LIKE', '') + ' ' + info.get('ID', '')).lower()
    if 'debian' in id_like or 'ubuntu' in id_like:
        pkg_mgr = 'apt'
    elif 'rhel' in id_like or 'fedora' in id_like or 'centos' in id_like or 'suse' in id_like:
        pkg_mgr = 'rpm'
    elif 'arch' in id_like:
        pkg_mgr = 'pacman'
    else:
        pkg_mgr = 'unknown'
    return {'name': name, 'version': version, 'pretty': pretty,
            'pkg_mgr': pkg_mgr, 'id_like': id_like.strip()}

# ─────────────────────────────────────────────────────────────────────
# HARDENING CHECKS
# ─────────────────────────────────────────────────────────────────────
def check_password_policy():
    r = {'min_length': None, 'max_age': None, 'min_age': None,
         'complexity': None, 'lockout_attempts': None, 'lockout_duration': None,
         'sha512_hash': False, 'password_history': None}
    for line in read_file('/etc/login.defs').splitlines():
        line = line.strip()
        if line.startswith('PASS_MIN_LEN'):  r['min_length'] = line.split()[-1]
        if line.startswith('PASS_MAX_DAYS'): r['max_age']    = line.split()[-1]
        if line.startswith('PASS_MIN_DAYS'): r['min_age']    = line.split()[-1]
    for pam_file in ['/etc/security/pwquality.conf',
                     '/etc/pam.d/common-password', '/etc/pam.d/password-auth',
                     '/etc/pam.d/system-auth']:
        c = read_file(pam_file)
        if not r['min_length']:
            m = re.search(r'minlen\s*=\s*(\d+)', c)
            if m: r['min_length'] = m.group(1)
        if not r['complexity']:
            m = re.search(r'dcredit\s*=\s*(-?\d+)', c)
            if m: r['complexity'] = f'dcredit={m.group(1)}'
        if not r['password_history']:
            m = re.search(r'remember\s*=\s*(\d+)', c)
            if m: r['password_history'] = m.group(1)
        if 'sha512' in c or 'yescrypt' in c: r['sha512_hash'] = True
    for pam_file in ['/etc/security/faillock.conf',
                     '/etc/pam.d/common-auth', '/etc/pam.d/password-auth']:
        c = read_file(pam_file)
        if not r['lockout_attempts']:
            m = re.search(r'deny\s*=\s*(\d+)', c)
            if m: r['lockout_attempts'] = m.group(1)
        if not r['lockout_duration']:
            m = re.search(r'unlock_time\s*=\s*(\d+)', c)
            if m: r['lockout_duration'] = m.group(1)
    return r

def check_local_accounts():
    users, uid0 = [], []
    for line in read_file('/etc/passwd').splitlines():
        parts = line.split(':')
        if len(parts) < 7: continue
        name, pw, uid, gid, gecos, home, shell = parts
        uid_i = int(uid) if uid.isdigit() else -1
        login_ok = shell not in ['/sbin/nologin', '/bin/false', '/usr/sbin/nologin', '']
        users.append({'name': name, 'uid': uid_i, 'home': home,
                      'shell': shell, 'login_ok': login_ok})
        if uid_i == 0: uid0.append(name)
    sudo_raw = run("getent group sudo 2>/dev/null || getent group wheel 2>/dev/null")
    admins = sudo_raw.split(':')[-1].split(',') if sudo_raw else []
    admins = [a.strip() for a in admins if a.strip()]
    login_users = [u['name'] for u in users if u['login_ok'] and u['uid'] >= 1000]
    return {'users': users, 'uid0_accounts': uid0,
            'sudo_members': admins, 'login_users': login_users}

def check_ssh():
    r = {'enabled': False, 'port': 22, 'root_login': None,
         'pubkey_auth': None, 'password_auth': None, 'permit_empty': None,
         'x11_forwarding': None, 'max_auth_tries': None, 'idle_timeout': None}
    c = read_file('/etc/ssh/sshd_config')
    if not c: return r
    for line in c.splitlines():
        line = line.strip()
        if line.startswith('#'): continue
        for key, field in [('Port', 'port'), ('PermitRootLogin', 'root_login'),
                           ('PubkeyAuthentication', 'pubkey_auth'),
                           ('PasswordAuthentication', 'password_auth'),
                           ('PermitEmptyPasswords', 'permit_empty'),
                           ('X11Forwarding', 'x11_forwarding'),
                           ('MaxAuthTries', 'max_auth_tries'),
                           ('ClientAliveInterval', 'idle_timeout')]:
            m = re.match(rf'^{key}\s+(\S+)', line, re.I)
            if m:
                r[field] = int(m.group(1)) if field == 'port' and m.group(1).isdigit() else m.group(1)
    r['enabled'] = 'active' in run("systemctl is-active sshd 2>/dev/null || systemctl is-active ssh 2>/dev/null")
    return r

def check_firewall():
    r = {'type': None, 'enabled': False, 'default_input': None,
         'rules_count': 0, 'raw': ''}
    ufw = run("ufw status verbose 2>/dev/null")
    if 'Status: active' in ufw:
        r['type'] = 'ufw'; r['enabled'] = True
        m = re.search(r'Default.*?incoming.*?(\w+)', ufw, re.I)
        if m: r['default_input'] = m.group(1)
        r['rules_count'] = ufw.count('ALLOW') + ufw.count('DENY')
        r['raw'] = ufw[:500]; return r
    fwd = run("firewall-cmd --state 2>/dev/null")
    if fwd == 'running':
        r['type'] = 'firewalld'; r['enabled'] = True
        r['default_input'] = run("firewall-cmd --get-default-zone 2>/dev/null")
        r['raw'] = run("firewall-cmd --list-all 2>/dev/null")[:500]; return r
    ipt = run("iptables -L INPUT -n 2>/dev/null | head -5")
    if ipt:
        r['type'] = 'iptables'
        r['enabled'] = 'DROP' in ipt or 'REJECT' in ipt
        m = re.search(r'policy (\w+)', ipt)
        r['default_input'] = m.group(1) if m else 'ACCEPT'
        r['raw'] = ipt
    return r

def check_audit_log():
    r = {'auditd_running': False, 'auditd_enabled': False,
         'rules_count': 0, 'log_file': '', 'syslog_enabled': False}
    r['auditd_running'] = 'active' in run("systemctl is-active auditd 2>/dev/null")
    r['auditd_enabled'] = 'enabled' in run("systemctl is-enabled auditd 2>/dev/null")
    rules = run("auditctl -l 2>/dev/null")
    r['rules_count'] = len([l for l in rules.splitlines() if l.strip() and not l.startswith('#')])
    for line in read_file('/etc/audit/auditd.conf').splitlines():
        if 'log_file' in line.lower(): r['log_file'] = line.split('=')[-1].strip()
    r['syslog_enabled'] = bool(run("grep -r syslog /etc/rsyslog.conf /etc/rsyslog.d/ 2>/dev/null | head -1"))
    return r

def check_usb_policy():
    r = {'usb_storage_blocked': False, 'usb_blacklist': '', 'automount_disabled': False}
    for f in ['/etc/modprobe.d/blacklist.conf', '/etc/modprobe.d/usb-storage.conf',
              '/etc/modprobe.d/disable-usb-storage.conf']:
        c = read_file(f)
        if 'usb-storage' in c and 'blacklist' in c:
            r['usb_storage_blocked'] = True; r['usb_blacklist'] = f
    r['automount_disabled'] = (
        'masked'   in run("systemctl is-enabled udisks2 2>/dev/null") or
        'inactive' in run("systemctl is-active  udisks2 2>/dev/null")
    )
    return r

def check_antivirus():
    r = {'clamav': {}, 'rkhunter': {}, 'chkrootkit': {}}
    clam = run("clamscan --version 2>/dev/null")
    r['clamav']['installed']     = bool(clam)
    r['clamav']['version']       = clam.split()[1] if clam and len(clam.split()) > 1 else clam
    r['clamav']['daemon_running'] = 'active' in run("systemctl is-active clamav-daemon 2>/dev/null || systemctl is-active clamd 2>/dev/null")
    sig = '/var/lib/clamav/daily.cvd'
    if os.path.exists(sig):
        r['clamav']['signature_age_days'] = int((time.time() - os.path.getmtime(sig)) / 86400)
    rkh = run("rkhunter --version 2>/dev/null | head -1")
    r['rkhunter']['installed'] = bool(rkh); r['rkhunter']['version'] = rkh
    chk = run("chkrootkit -V 2>/dev/null | head -1")
    r['chkrootkit']['installed'] = bool(chk)
    return r

def check_patch_status(pkg_mgr):
    r = {'manager': pkg_mgr, 'upgradable': 0, 'auto_update': False,
         'last_update': '', 'recent_packages': []}
    if pkg_mgr == 'apt':
        out = run("apt list --upgradable 2>/dev/null")
        r['upgradable'] = max(0, len(out.splitlines()) - 1)
        r['auto_update'] = os.path.exists('/etc/apt/apt.conf.d/20auto-upgrades')
        r['last_update'] = run("stat -c %y /var/lib/apt/lists/ 2>/dev/null").split('.')[0]
    elif pkg_mgr == 'rpm':
        out = run("yum check-update --quiet 2>/dev/null | wc -l || dnf check-update --quiet 2>/dev/null | wc -l")
        r['upgradable'] = int(out.strip()) if out.strip().isdigit() else 0
        r['last_update'] = run("rpm -qa --last 2>/dev/null | head -1")
    elif pkg_mgr == 'pacman':
        out = run("checkupdates 2>/dev/null | wc -l")
        r['upgradable'] = int(out.strip()) if out.strip().isdigit() else 0
    return r

def check_network():
    r = {'interfaces': [], 'ipv6_disabled': False, 'hostname': socket.gethostname()}
    raw = run("ip -j addr show 2>/dev/null")
    if raw:
        try:
            for iface in json.loads(raw):
                r['interfaces'].append({
                    'name':  iface.get('ifname', ''),
                    'mac':   iface.get('address', ''),
                    'state': iface.get('operstate', ''),
                    'mtu':   iface.get('mtu', ''),
                    'addrs': [f"{a.get('local','')}/{a.get('prefixlen','')}"
                              for a in iface.get('addr_info', [])],
                })
        except Exception: pass
    r['ipv6_disabled'] = '1' in read_file('/proc/sys/net/ipv6/conf/all/disable_ipv6')
    return r

def check_open_ports():
    result = []
    raw = run("ss -tlnp 2>/dev/null")
    for line in raw.splitlines()[1:]:
        parts = line.split()
        if len(parts) < 4: continue
        addr_port = parts[3]
        if ':' in addr_port:
            addr, _, port = addr_port.rpartition(':')
            proc_info = ' '.join(parts[5:]) if len(parts) > 5 else ''
            pm = re.search(r'users:\(\("([^"]+)"', proc_info)
            result.append({'addr': addr, 'port': port,
                           'process': pm.group(1) if pm else ''})
    return result

def get_system_info(distro):
    uname = platform.uname()
    ram   = 0
    mem   = read_file('/proc/meminfo')
    m = re.search(r'MemTotal:\s+(\d+)', mem)
    if m: ram = round(int(m.group(1)) / 1024 / 1024, 2)
    cpu = read_file('/proc/cpuinfo')
    m = re.search(r'model name\s*:\s*(.+)', cpu)
    cpu_name = m.group(1).strip() if m else ''
    r = {
        'ComputerName': socket.gethostname(),
        'OS':           distro['pretty'],
        'OSVersion':    distro['version'],
        'Architecture': uname.machine,
        'Kernel':       uname.release,
        'AuditTime':    datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'Platform':     'linux',
        'Uptime':       run("uptime -p 2>/dev/null"),
        'CPU':          cpu_name,
        'TotalRAM_GB':  ram,
        'Domain':       run("hostname -d 2>/dev/null"),
        'Disks':        [],
    }
    lsblk = run("lsblk -J -o NAME,SIZE,TYPE,VENDOR,MODEL,SERIAL 2>/dev/null")
    if lsblk:
        try:
            bd = json.loads(lsblk)
            for dev in bd.get('blockdevices', []):
                if dev.get('type') == 'disk':
                    r['Disks'].append({
                        'Model':  (dev.get('vendor','').strip() + ' ' + dev.get('model','').strip()).strip(),
                        'SerialNumber': dev.get('serial','').strip(),
                        'Size_GB': dev.get('size',''),
                        'Interface': '',
                    })
        except Exception: pass
    return r

# ─────────────────────────────────────────────────────────────────────
# SBOM  —  4 SOURCES
# ─────────────────────────────────────────────────────────────────────
def sbom_src1_pkgmgr(pkg_mgr):
    result = []
    if pkg_mgr == 'apt':
        raw = run("dpkg-query -W -f='${Package}|${Version}|${Maintainer}|${Status}\\n' 2>/dev/null")
        for line in raw.splitlines():
            parts = line.split('|')
            if len(parts) < 4: continue
            name, ver, maint, status = parts[0], parts[1], parts[2], parts[3]
            if 'installed' not in status.lower(): continue
            pub = maint.split('<')[0].strip() if '<' in maint else maint
            ver = norm_ver(re.split(r'[+~]', ver)[0])
            result.append({'name': name, 'version': ver, 'publisher': pub,
                           'install_date': '', 'install_location': '',
                           'source': 'dpkg', 'type': 'library',
                           'cpe': make_cpe(pub, name, ver),
                           'purl': f'pkg:deb/debian/{name}@{ver}' if ver else f'pkg:deb/debian/{name}'})
    elif pkg_mgr == 'rpm':
        raw = run("rpm -qa --queryformat '%{NAME}|%{VERSION}|%{VENDOR}|%{INSTALLTIME:date}\\n' 2>/dev/null")
        for line in raw.splitlines():
            parts = line.split('|')
            if len(parts) < 4: continue
            name, ver, pub, idate = parts[0], parts[1], parts[2], parts[3]
            result.append({'name': name, 'version': norm_ver(ver), 'publisher': pub,
                           'install_date': idate, 'install_location': '',
                           'source': 'rpm', 'type': 'library',
                           'cpe': make_cpe(pub, name, ver),
                           'purl': f'pkg:rpm/{name}@{ver}' if ver else f'pkg:rpm/{name}'})
    elif pkg_mgr == 'pacman':
        raw = run("pacman -Q 2>/dev/null")
        for line in raw.splitlines():
            parts = line.split()
            if len(parts) < 2: continue
            name, ver = parts[0], parts[1]
            result.append({'name': name, 'version': norm_ver(ver), 'publisher': '',
                           'install_date': '', 'install_location': '',
                           'source': 'pacman', 'type': 'library',
                           'cpe': make_cpe('', name, ver),
                           'purl': f'pkg:arch/{name}@{ver}'})
    return result

def sbom_src2_flatpak_snap():
    result = []
    fp = run("flatpak list --columns=application,version 2>/dev/null")
    for line in fp.splitlines()[1:]:
        parts = line.split('\t')
        if not parts: continue
        name = parts[0].strip(); ver = parts[1].strip() if len(parts) > 1 else ''
        result.append({'name': name, 'version': norm_ver(ver), 'publisher': '',
                       'install_date': '', 'install_location': '',
                       'source': 'flatpak', 'type': 'application',
                       'cpe': make_cpe('', name, ver), 'purl': make_purl(name, ver)})
    sn = run("snap list 2>/dev/null")
    for line in sn.splitlines()[1:]:
        parts = line.split()
        if len(parts) < 2: continue
        name, ver = parts[0], parts[1]
        pub = parts[4] if len(parts) > 4 else ''
        result.append({'name': name, 'version': norm_ver(ver), 'publisher': pub,
                       'install_date': '', 'install_location': '',
                       'source': 'snap', 'type': 'application',
                       'cpe': make_cpe(pub, name, ver), 'purl': make_purl(name, ver, pub)})
    return result

def sbom_src3_services():
    result = []; seen = set()
    raw = run("systemctl list-units --type=service --state=running --no-legend --no-pager 2>/dev/null")
    for line in raw.splitlines():
        parts = line.split()
        if not parts: continue
        svc = parts[0].replace('.service', '')
        exec_raw = run(f"systemctl show -p ExecStart {svc}.service 2>/dev/null")
        m = re.search(r'path=([^;]+)', exec_raw)
        exe = m.group(1).strip() if m else run(f"which {svc} 2>/dev/null")
        ver = ''
        if exe and os.path.exists(exe):
            vr = run(f"{exe} --version 2>&1 | head -1", timeout=3)
            m2 = re.search(r'(\d+\.\d+[\.\d]*)', vr)
            ver = norm_ver(m2.group(1)) if m2 else ''
        k = f'{svc}|{ver}'
        if k not in seen:
            seen.add(k)
            result.append({'name': svc, 'version': ver, 'publisher': '',
                           'install_date': '', 'install_location': exe or '',
                           'source': 'service', 'type': 'library',
                           'cpe': make_cpe('', svc, ver), 'purl': make_purl(svc, ver)})
    return result

def sbom_src4_elf():
    result = []; seen = set()
    for d in ['/usr/bin', '/usr/local/bin', '/usr/sbin', '/usr/local/sbin']:
        if not os.path.isdir(d): continue
        try: entries = list(os.scandir(d))
        except PermissionError: continue
        for entry in entries[:200]:
            try:
                if not entry.is_file(follow_symlinks=True): continue
                if entry.stat().st_size < 4096: continue
                name = entry.name
                if name in ('su', 'sudo', 'passwd', 'shadow'): continue
                vr = run(f"{entry.path} --version 2>&1 | head -1", timeout=3)
                m = re.search(r'(\d+\.\d+[\.\d]*)', vr)
                ver = norm_ver(m.group(1)) if m else ''
                k = f'{name}|{ver}'
                if k not in seen:
                    seen.add(k)
                    result.append({'name': name, 'version': ver, 'publisher': '',
                                   'install_date': '', 'install_location': entry.path,
                                   'source': 'elf-metadata', 'type': 'application',
                                   'cpe': make_cpe('', name, ver), 'purl': make_purl(name, ver)})
            except Exception: continue
    return result

def build_diff(all_comps):
    diff = {'added': [], 'removed': [], 'changed': [], 'PreviousSnapshot': ''}
    snap_path = Path.home() / '.cache' / 'scs_sbom_snapshot.json'
    cur_map = {c['name'].lower(): c['version'] for c in all_comps}
    if snap_path.exists():
        try:
            prev     = json.loads(snap_path.read_text())
            diff['PreviousSnapshot'] = prev.get('snapshot_date', '')
            prev_map = {c['name'].lower(): c['version'] for c in prev.get('components', [])}
            for k in cur_map:
                if k not in prev_map: diff['added'].append(k)
            for k in prev_map:
                if k not in cur_map: diff['removed'].append(k)
            for k in cur_map:
                if k in prev_map and cur_map[k] != prev_map[k] and cur_map[k]:
                    diff['changed'].append({'Name': k, 'From': prev_map[k], 'To': cur_map[k]})
        except Exception: pass
    try:
        snap_path.parent.mkdir(parents=True, exist_ok=True)
        snap_path.write_text(json.dumps({
            'snapshot_date': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'components': [{'name': c['name'], 'version': c['version']} for c in all_comps]
        }))
    except Exception: pass
    return diff

def build_sbom(sys_info, distro, prog_cb=None):
    def p(pct, msg):
        if prog_cb: prog_cb(pct, msg)
        else: print(f'  [{pct:3d}%] {msg}')
    pkg_mgr = distro['pkg_mgr']
    p(57, f'SBOM Source 1/4: {pkg_mgr} packages...')
    src1 = sbom_src1_pkgmgr(pkg_mgr)
    p(63, 'SBOM Source 2/4: Flatpak / Snap...')
    src2 = sbom_src2_flatpak_snap()
    p(69, 'SBOM Source 3/4: systemd services...')
    src3 = sbom_src3_services()
    p(75, 'SBOM Source 4/4: ELF binary metadata...')
    src4 = sbom_src4_elf()
    all_comps, seen = [], set()
    for src in [src1, src2, src3, src4]:
        for item in src:
            k = f"{item['name'].lower()}|{item['version']}"
            if k not in seen: seen.add(k); all_comps.append(item)
    stats = {
        'pkg_mgr':  sum(1 for c in all_comps if c['source'] in ('dpkg','rpm','pacman')),
        'flatpak':  sum(1 for c in all_comps if c['source'] == 'flatpak'),
        'snap':     sum(1 for c in all_comps if c['source'] == 'snap'),
        'service':  sum(1 for c in all_comps if c['source'] == 'service'),
        'elf':      sum(1 for c in all_comps if c['source'] == 'elf-metadata'),
    }
    p(78, 'Computing diff vs previous snapshot...')
    diff = build_diff(all_comps)
    sbom = {
        'bomFormat':       'CycloneDX',
        'specVersion':     '1.4',
        'serialNumber':    f'urn:uuid:{secrets.token_hex(16)}',
        'version':         1,
        'metadata': {
            'timestamp': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
            'component': {'type': 'device', 'name': sys_info['ComputerName'], 'version': sys_info['OS']}
        },
        'totalComponents': len(all_comps),
        'sources':         stats,
        'diff':            diff,
        'components':      sorted(all_comps, key=lambda c: c['name'].lower()),
    }
    flat_sw = [{'Name': c['name'], 'Version': c['version'],
                'Publisher': c['publisher'], 'InstallDate': c['install_date']}
               for c in src1]
    return sbom, flat_sw

# ─────────────────────────────────────────────────────────────────────
# MAIN COLLECTION
# ─────────────────────────────────────────────────────────────────────
def collect_all(prog_cb=None):
    def p(pct, msg):
        if prog_cb: prog_cb(pct, msg)
        else: print(f'  [{pct:3d}%] {msg}')
    distro = get_distro(); pkg_mgr = distro['pkg_mgr']
    report = {}
    p(5,  'Collecting system information...')
    si = get_system_info(distro)
    si['distro'] = distro
    report['SystemInfo'] = si
    p(12, 'Checking password policy (SC-1)...')
    report['AccountPolicy'] = check_password_policy()
    p(20, 'Checking local accounts (SC-2)...')
    report['LocalAccounts'] = check_local_accounts()
    p(27, 'Checking SSH configuration (SC-6)...')
    report['SSHConfig'] = check_ssh()
    p(33, 'Checking firewall status (SC-6)...')
    report['Firewall'] = check_firewall()
    p(40, 'Checking audit logging (SC-7)...')
    report['AuditLog'] = check_audit_log()
    p(46, 'Checking USB policy (SC-10)...')
    report['USBPolicy'] = check_usb_policy()
    p(50, 'Checking antivirus (SC-11)...')
    report['Antivirus'] = check_antivirus()
    p(54, 'Checking patch status (SC-13)...')
    report['PatchStatus'] = check_patch_status(pkg_mgr)
    p(56, 'Checking network settings (SC-5/6)...')
    report['NetworkSettings'] = check_network()
    p(57, 'Scanning open ports...')
    report['OpenPorts'] = check_open_ports()
    sbom, flat_sw = build_sbom(si, distro, prog_cb)
    report['SBOM'] = sbom
    report['InstalledSoftware'] = flat_sw
    p(82, 'Scanning running services...')
    svc_raw = run("systemctl list-units --type=service --state=running --no-legend --no-pager 2>/dev/null")
    report['RunningServices'] = []
    for line in svc_raw.splitlines():
        parts = line.split(None, 4)
        if parts:
            report['RunningServices'].append({
                'Name': parts[0], 'Active': parts[2] if len(parts) > 2 else '',
                'Description': parts[4] if len(parts) > 4 else ''})
    return report

# ─────────────────────────────────────────────────────────────────────
# GUI  (tkinter + terminal fallback)
# ─────────────────────────────────────────────────────────────────────
CONSENT_TEXT = """\
[ Purpose ]
Audits cyber security hardening of Linux systems per IACS UR E27 / IEC 62443-3-3,
and generates a Host Inventory SBOM (Software Bill of Materials).

[ Hardening Checks ]
  Password/lockout policy  (SC-1, SR 1.1-1.3)
  Local accounts & sudo    (SC-2, SR 1.5)
  SSH configuration        (SC-6, SR 1.10)
  Firewall / iptables      (SC-6, SR 2.1)
  Audit logging (auditd)   (SC-7, SR 2.8-2.9)
  USB storage policy       (SC-10, SR 2.4)
  Antivirus / rootkit      (SC-11, SR 3.2)
  Patch / upgrade status   (SC-13, SR 2.3)
  Network interfaces + MAC (SC-5, SC-6)
  Open ports (ss -tlnp)    (SC-6)

[ SBOM Collection  -  CycloneDX 1.4 ]
  Source 1  Package manager (dpkg / rpm / pacman)
  Source 2  Flatpak and Snap packages
  Source 3  Running systemd services
  Source 4  ELF binary metadata (/usr/bin, /usr/local/bin)

  Each component: Name, Version, Publisher, CPE 2.3, PURL,
  InstallLocation, Source tag, Diff vs previous snapshot.

[ Output ]
  Results saved to:  ~/Desktop/SCS_Audit/audit_YYYYMMDD_HHmmss.scsaudit
  AES-256 encrypted .scsaudit file (same format as Windows tool).
  Upload to SCS Dashboard for CVE mapping and SBOM report.

[ Not collected ]  File contents, emails, documents, personal data."""

def run_terminal():
    print('=' * 60)
    print('  SCS Hardening Audit + SBOM  (Linux)')
    print('  IACS UR E27 | IEC 62443-3-3 | CycloneDX 1.4')
    print('=' * 60)
    print()
    print(CONSENT_TEXT)
    print()
    consent = input("Type YES to proceed: ").strip()
    if consent.upper() != 'YES':
        print('Cancelled.'); sys.exit(0)
    print()
    return collect_all()

def run_gui():
    import tkinter as tk
    from tkinter import ttk, scrolledtext
    root = tk.Tk(); root.withdraw()
    consent_done = [False]

    def show_consent():
        dlg = tk.Toplevel()
        dlg.title("SCS Hardening Audit + SBOM  -  IACS UR E27 / IEC 62443-3-3")
        dlg.geometry("680x560"); dlg.configure(bg="#0f172a")
        dlg.resizable(False, False); dlg.grab_set()
        tk.Label(dlg, text="Ship Cyber Security  -  Hardening Audit + SBOM",
                 font=("Segoe UI", 14, "bold"), fg="#60a5fa", bg="#0f172a").pack(anchor="w", padx=20, pady=(16,2))
        tk.Label(dlg, text="IACS UR E27 Rev.2  |  IEC 62443-3-3  |  CycloneDX SBOM 1.4",
                 font=("Segoe UI", 9), fg="#94a3b8", bg="#0f172a").pack(anchor="w", padx=22)
        tk.Frame(dlg, bg="#334155", height=1).pack(fill="x", padx=20, pady=6)
        box = scrolledtext.ScrolledText(dlg, bg="#1e293b", fg="#e2e8f0",
                                        font=("Courier New", 9), relief="flat", wrap="word",
                                        height=16)
        box.pack(fill="both", expand=True, padx=20)
        box.insert("end", CONSENT_TEXT); box.configure(state="disabled")
        chk_var = tk.BooleanVar()
        tk.Checkbutton(dlg, text="I have read the above and agree to run this audit and SBOM collection.",
                       variable=chk_var, fg="#e2e8f0", bg="#0f172a",
                       activeforeground="#60a5fa", activebackground="#0f172a",
                       selectcolor="#334155", font=("Segoe UI", 9)).pack(anchor="w", padx=20, pady=6)
        bf = tk.Frame(dlg, bg="#0f172a"); bf.pack(fill="x", padx=20, pady=(0,14))
        def on_run():
            if chk_var.get(): consent_done[0] = True; dlg.destroy()
        def on_cancel(): dlg.destroy(); root.destroy(); sys.exit(0)
        tk.Button(bf, text="Run Audit + SBOM", command=on_run, bg="#2563eb", fg="white",
                  font=("Segoe UI", 10, "bold"), relief="flat", padx=18, pady=7).pack(side="right", padx=(6,0))
        tk.Button(bf, text="Cancel", command=on_cancel, bg="#334155", fg="white",
                  font=("Segoe UI", 9), relief="flat", padx=14, pady=7).pack(side="right")
        dlg.protocol("WM_DELETE_WINDOW", on_cancel); dlg.wait_window()

    show_consent()
    if not consent_done[0]: root.destroy(); sys.exit(0)

    pw = tk.Toplevel(); pw.title("SCS Audit - Running...")
    pw.geometry("520x160"); pw.configure(bg="#0f172a")
    pw.resizable(False, False); pw.grab_set()
    lm = tk.Label(pw, text="Initializing...", font=("Segoe UI", 10), fg="#e2e8f0", bg="#0f172a")
    lm.pack(anchor="w", padx=16, pady=(14,2))
    bar = ttk.Progressbar(pw, length=488, mode="determinate", maximum=100)
    bar.pack(padx=16, pady=4)
    lp = tk.Label(pw, text="0%", font=("Courier New", 9), fg="#60a5fa", bg="#0f172a")
    lp.pack(anchor="w", padx=16)
    ld = tk.Label(pw, text="", font=("Courier New", 8), fg="#64748b", bg="#0f172a")
    ld.pack(anchor="w", padx=16)
    pw.update()

    def prog_cb(pct, msg):
        bar["value"] = pct; lm["text"] = msg; lp["text"] = f"{pct}%  -  {msg}"; pw.update()

    report = collect_all(prog_cb)
    pw.destroy(); root.destroy()
    return report

# ─────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────────
def main():
    if os.geteuid() != 0:
        print("ERROR: Please run as root:  sudo python3 linux_audit.py"); sys.exit(1)
    has_display = bool(os.environ.get('DISPLAY') or os.environ.get('WAYLAND_DISPLAY'))
    has_tk = False
    if has_display:
        try: import tkinter; has_tk = True
        except ImportError: pass
    if has_tk: report = run_gui()
    else:       report = run_terminal()
    if not report: print("No report."); sys.exit(1)
    print(f"  [ 93%] Encrypting ({report['SBOM']['totalComponents']} SBOM components)...")
    json_str = json.dumps(report, ensure_ascii=False, default=str)
    enc = protect_data(json_str, _AK, _GI)
    ts       = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    desktop  = Path.home() / 'Desktop'
    if not desktop.is_dir():
        desktop = Path.home()  # fallback if Desktop doesn't exist
    out_dir  = desktop / 'SCS_Audit'
    out_dir.mkdir(exist_ok=True)
    out_file = out_dir / f'audit_{ts}.scsaudit'
    out_file.write_text(enc)
    sb = report.get('SBOM', {}); diff = sb.get('diff', {}); stats = sb.get('sources', {})
    print("  [100%] Done!")
    print()
    print("=" * 60)
    print("  Audit + SBOM complete!")
    print(f"  File: {out_file}")
    print()
    print(f"  SBOM Summary:")
    print(f"    Total      : {sb.get('totalComponents',0)} components")
    print(f"    Pkg manager: {stats.get('pkg_mgr',0)}   Flatpak: {stats.get('flatpak',0)}   Snap: {stats.get('snap',0)}")
    print(f"    Services   : {stats.get('service',0)}   ELF meta: {stats.get('elf',0)}")
    if diff.get('PreviousSnapshot'):
        print(f"    Diff vs {diff['PreviousSnapshot']}:")
        print(f"      +Added:{len(diff.get('added',[]))}  -Removed:{len(diff.get('removed',[]))}  ~Changed:{len(diff.get('changed',[]))}")
    print()
    print("  Upload the .scsaudit file to SCS Dashboard.")
    print("=" * 60)

if __name__ == '__main__':
    main()
