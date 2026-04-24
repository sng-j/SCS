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
import platform, re, secrets, socket, pwd
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

# ─────────────────────────────────────────────────────────────────────
# CPE DICTIONARY — curated mapping from common package / product names to
# their canonical NVD (vendor, product) pair. The server-side CVE matcher
# prefers exact CPE matches and falls back to noisy name heuristics when
# CPE is blank; populating CPE at audit time is the single biggest lever
# for matching accuracy. Add rows as new common software appears on
# customer fleets. Keys are lowercase — the lookup lowercases the input.
# Values: (cpe_vendor, cpe_product[, cpe_part]). cpe_part defaults to 'a'.
# ─────────────────────────────────────────────────────────────────────
CPE_MAP = {
    # — Web / reverse proxy —
    'nginx':               ('nginx', 'nginx'),
    'apache2':             ('apache', 'http_server'),
    'apache2-bin':         ('apache', 'http_server'),
    'httpd':               ('apache', 'http_server'),
    'lighttpd':            ('lighttpd', 'lighttpd'),
    'caddy':               ('caddyserver', 'caddy'),
    'haproxy':             ('haproxy', 'haproxy'),
    'varnish':             ('varnish_cache_project', 'varnish_cache'),
    'squid':               ('squid-cache', 'squid'),
    # — Databases —
    'mysql':               ('mysql', 'mysql'),
    'mysql-server':        ('mysql', 'mysql'),
    'mysql-client':        ('mysql', 'mysql'),
    'mariadb':             ('mariadb', 'mariadb'),
    'mariadb-server':      ('mariadb', 'mariadb'),
    'postgresql':          ('postgresql', 'postgresql'),
    'postgresql-server':   ('postgresql', 'postgresql'),
    'mongodb':             ('mongodb', 'mongodb'),
    'mongodb-server':      ('mongodb', 'mongodb'),
    'mongod':              ('mongodb', 'mongodb'),
    'redis':               ('redis', 'redis'),
    'redis-server':        ('redis', 'redis'),
    'memcached':           ('memcached', 'memcached'),
    'elasticsearch':       ('elastic', 'elasticsearch'),
    'kibana':              ('elastic', 'kibana'),
    'influxdb':            ('influxdata', 'influxdb'),
    # — TLS / SSH —
    'openssh':             ('openbsd', 'openssh'),
    'openssh-server':      ('openbsd', 'openssh'),
    'openssh-client':      ('openbsd', 'openssh'),
    'openssh-sftp-server': ('openbsd', 'openssh'),
    'openssl':             ('openssl', 'openssl'),
    'libssl3':             ('openssl', 'openssl'),
    'libssl1.1':           ('openssl', 'openssl'),
    'gnutls':              ('gnu', 'gnutls'),
    'libgnutls30':         ('gnu', 'gnutls'),
    # — Runtime / languages —
    'python':              ('python', 'python'),
    'python3':             ('python', 'python'),
    'python3.12':          ('python', 'python'),
    'python3.11':          ('python', 'python'),
    'php':                 ('php', 'php'),
    'php8.1':              ('php', 'php'),
    'php8.2':              ('php', 'php'),
    'ruby':                ('ruby-lang', 'ruby'),
    'perl':                ('perl', 'perl'),
    'node':                ('nodejs', 'node.js'),
    'nodejs':              ('nodejs', 'node.js'),
    'npm':                 ('npmjs', 'npm'),
    'go':                  ('golang', 'go'),
    'golang':              ('golang', 'go'),
    'golang-go':           ('golang', 'go'),
    'rustc':               ('rust-lang', 'rust'),
    'openjdk-17':          ('oracle', 'openjdk'),
    'openjdk-11':          ('oracle', 'openjdk'),
    'openjdk-8':           ('oracle', 'openjdk'),
    'java':                ('oracle', 'jre'),
    # — Containers / orchestration —
    'docker':              ('docker', 'docker'),
    'docker-ce':           ('docker', 'docker'),
    'docker.io':           ('docker', 'docker'),
    'containerd':          ('linuxfoundation', 'containerd'),
    'podman':              ('podman_project', 'podman'),
    'kubectl':             ('kubernetes', 'kubernetes'),
    'kubelet':             ('kubernetes', 'kubernetes'),
    # — Mail / DNS —
    'postfix':             ('postfix', 'postfix'),
    'dovecot':             ('dovecot', 'dovecot'),
    'exim4':               ('exim', 'exim'),
    'bind9':               ('isc', 'bind'),
    'unbound':             ('nlnetlabs', 'unbound'),
    'dnsmasq':             ('thekelleys', 'dnsmasq'),
    # — File / share / remote —
    'samba':               ('samba', 'samba'),
    'vsftpd':              ('vsftpd_project', 'vsftpd'),
    'proftpd':             ('proftpd', 'proftpd'),
    'rsync':               ('samba', 'rsync'),
    'openvpn':             ('openvpn', 'openvpn'),
    'wireguard':           ('wireguard', 'wireguard'),
    # — Utilities / tools —
    'curl':                ('haxx', 'curl'),
    'libcurl4':            ('haxx', 'curl'),
    'wget':                ('gnu', 'wget'),
    'git':                 ('git-scm', 'git'),
    'subversion':          ('apache', 'subversion'),
    'bash':                ('gnu', 'bash'),
    'sudo':                ('sudo_project', 'sudo'),
    'cron':                ('cron_project', 'cron'),
    # — Monitoring / security —
    'fail2ban':            ('fail2ban', 'fail2ban'),
    'clamav':              ('clamav', 'clamav'),
    'rkhunter':            ('rkhunter', 'rkhunter'),
    'zabbix-agent':        ('zabbix', 'zabbix'),
    'prometheus':          ('prometheus', 'prometheus'),
    'grafana':             ('grafana', 'grafana'),
    # — System base (OS part = 'o') —
    'systemd':             ('systemd_project', 'systemd'),
    'linux':               ('linux', 'linux_kernel', 'o'),
    'linux-image':         ('linux', 'linux_kernel', 'o'),
    'glibc':               ('gnu', 'glibc'),
    'libc6':               ('gnu', 'glibc'),
    # — Windows-side common apps (matched by DisplayName keyword) —
    'google chrome':       ('google', 'chrome'),
    'mozilla firefox':     ('mozilla', 'firefox'),
    'microsoft edge':      ('microsoft', 'edge_chromium'),
    '7-zip':               ('7-zip', '7-zip'),
    'winrar':              ('rarlab', 'winrar'),
    'putty':               ('putty', 'putty'),
    'vlc':                 ('videolan', 'vlc_media_player'),
    'vlc media player':    ('videolan', 'vlc_media_player'),
    'notepad++':           ('notepad-plus-plus', 'notepad\\+\\+'),
    'adobe acrobat reader dc': ('adobe', 'acrobat_reader_dc'),
    'windows 10':          ('microsoft', 'windows_10', 'o'),
    'windows 11':          ('microsoft', 'windows_11', 'o'),
    'windows server 2022': ('microsoft', 'windows_server_2022', 'o'),
    'windows server 2019': ('microsoft', 'windows_server_2019', 'o'),
}

def resolve_cpe(name, ver):
    """Look up a package/product name in CPE_MAP; return a canonical CPE
    string if found, otherwise ''. Version is lowercased and stripped to
    the first dotted-numeric chunk by make_cpe's sanitiser, which is the
    form NVD uses for most entries."""
    if not name: return ''
    key = name.lower().strip()
    entry = CPE_MAP.get(key)
    if not entry:
        # common suffix strip (e.g. "python3-pip" -> no match, but "python3" does)
        base = re.split(r'[:\s]', key)[0]
        if base != key:
            entry = CPE_MAP.get(base)
    if not entry: return ''
    vendor, product = entry[0], entry[1]
    part = entry[2] if len(entry) > 2 else 'a'
    v = re.sub(r'[^a-z0-9_.\\-]', '', (ver or '').lower().replace(' ', '_')) or '*'
    return f'cpe:2.3:{part}:{vendor}:{product}:{v}:*:*:*:*:*:*:*'

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
    # OpenSSH applies the FIRST matching directive, so the correct way to
    # know the effective config is to walk sshd_config AND every file under
    # sshd_config.d (Ubuntu 22.04+ cloud images keep the real config in
    # /etc/ssh/sshd_config.d/50-cloud-init.conf — scanning only sshd_config
    # made every SSH field come back as N/A).
    r = {'enabled': False, 'port': 22, 'root_login': None,
         'pubkey_auth': None, 'password_auth': None, 'permit_empty': None,
         'x11_forwarding': None, 'max_auth_tries': None, 'idle_timeout': None}

    files = ['/etc/ssh/sshd_config']
    conf_d = '/etc/ssh/sshd_config.d'
    if os.path.isdir(conf_d):
        try:
            # OpenSSH sorts include files lexicographically.
            for fname in sorted(os.listdir(conf_d)):
                if fname.endswith('.conf'):
                    files.append(os.path.join(conf_d, fname))
        except OSError:
            pass

    keys = [('Port', 'port'), ('PermitRootLogin', 'root_login'),
            ('PubkeyAuthentication', 'pubkey_auth'),
            ('PasswordAuthentication', 'password_auth'),
            ('PermitEmptyPasswords', 'permit_empty'),
            ('X11Forwarding', 'x11_forwarding'),
            ('MaxAuthTries', 'max_auth_tries'),
            ('ClientAliveInterval', 'idle_timeout')]

    # OpenSSH honours the first occurrence, so we stop at the first match
    # per field instead of letting later files overwrite it.
    for path in files:
        c = read_file(path)
        if not c:
            continue
        for line in c.splitlines():
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            for key, field in keys:
                if r[field] is not None and field != 'port':
                    continue
                m = re.match(rf'^{key}\s+(\S+)', line, re.I)
                if m:
                    val = m.group(1)
                    r[field] = int(val) if field == 'port' and val.isdigit() else val

    # OpenSSH defaults when nothing was explicitly configured. These match
    # the compiled-in defaults of the mainline openssh-server package.
    defaults = {
        'root_login':    'prohibit-password',
        'pubkey_auth':   'yes',
        'password_auth': 'yes',
        'permit_empty':  'no',
        'x11_forwarding':'no',
    }
    for field, default in defaults.items():
        if r[field] is None:
            r[field] = default

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
    # Presence is determined by binary availability (`command -v`) rather
    # than `--version` output, which can be empty when the process exits
    # non-zero (happens on some minimal images) and then produced the
    # "installed=no but daemon_running=yes" contradiction reviewers noticed.
    r = {'clamav': {}, 'rkhunter': {}, 'chkrootkit': {}}

    clam_present = bool(run("command -v clamscan 2>/dev/null")) or os.path.exists('/usr/bin/clamscan')
    clam_daemon = 'active' in run("systemctl is-active clamav-daemon 2>/dev/null || systemctl is-active clamd 2>/dev/null")
    sig = '/var/lib/clamav/daily.cvd'
    sig_cld = '/var/lib/clamav/daily.cld'
    sig_path = sig if os.path.exists(sig) else (sig_cld if os.path.exists(sig_cld) else None)
    # Having the daemon active or signatures on disk is a strong install signal too.
    r['clamav']['installed'] = clam_present or clam_daemon or sig_path is not None
    r['clamav']['version'] = run("clamscan --version 2>/dev/null").split()[1:2]
    r['clamav']['version'] = r['clamav']['version'][0] if r['clamav']['version'] else ''
    r['clamav']['daemon_running'] = clam_daemon
    if sig_path:
        r['clamav']['signature_age_days'] = int((time.time() - os.path.getmtime(sig_path)) / 86400)

    rkh_present = bool(run("command -v rkhunter 2>/dev/null")) or os.path.exists('/usr/bin/rkhunter')
    r['rkhunter']['installed'] = rkh_present
    r['rkhunter']['version']   = run("rkhunter --version 2>/dev/null | head -1")

    chk_present = bool(run("command -v chkrootkit 2>/dev/null")) or os.path.exists('/usr/sbin/chkrootkit')
    r['chkrootkit']['installed'] = chk_present
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
    # DMI (Desktop Management Interface) exposes board/vendor/product info
    # via /sys/class/dmi/id/. It's readable by root; on cloud VMs you get
    # "Amazon EC2" / "Xen" etc., on physical servers you get the actual
    # vendor + model. This lets the SCS dashboard auto-fill the Manufacturer
    # and Model fields on the HW card when an audit is uploaded.
    def _dmi(path):
        try:
            return read_file(f'/sys/class/dmi/id/{path}').strip()
        except Exception:
            return ''
    manufacturer = _dmi('sys_vendor') or _dmi('board_vendor') or _dmi('chassis_vendor')
    product_name = _dmi('product_name') or _dmi('board_name')

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
        'Manufacturer': manufacturer,
        'Model':        product_name,
        'BoardSerial':  _dmi('product_serial') or _dmi('board_serial'),
        'BIOSVendor':   _dmi('bios_vendor'),
        'BIOSVersion':  _dmi('bios_version'),
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
    """Return only packages the operator explicitly installed (not transitive
    OS dependencies). Vanilla Ubuntu has ~700 packages but the admin only
    chose ~30–80 — the rest is libc/systemd/coreutils noise that dilutes CVE
    matching. We still fall back to the full list if the manual-install
    query returns nothing (older distros, corrupted dpkg DB, etc.)."""
    result = []
    manual = manually_installed_names(pkg_mgr)
    if pkg_mgr == 'apt':
        raw = run("dpkg-query -W -f='${Package}|${Version}|${Maintainer}|${Status}\\n' 2>/dev/null")
        for line in raw.splitlines():
            parts = line.split('|')
            if len(parts) < 4: continue
            name, ver, maint, status = parts[0], parts[1], parts[2], parts[3]
            if 'installed' not in status.lower(): continue
            if manual and name not in manual: continue
            pub = maint.split('<')[0].strip() if '<' in maint else maint
            ver = norm_ver(re.split(r'[+~]', ver)[0])
            result.append({'name': name, 'version': ver, 'publisher': pub,
                           'install_date': '', 'install_location': '',
                           'source': 'dpkg', 'type': 'library',
                           'cpe': (resolve_cpe(name, ver) or make_cpe(pub, name, ver)),
                           'purl': f'pkg:deb/debian/{name}@{ver}' if ver else f'pkg:deb/debian/{name}'})
    elif pkg_mgr == 'rpm':
        raw = run("rpm -qa --queryformat '%{NAME}|%{VERSION}|%{VENDOR}|%{INSTALLTIME:date}\\n' 2>/dev/null")
        for line in raw.splitlines():
            parts = line.split('|')
            if len(parts) < 4: continue
            name, ver, pub, idate = parts[0], parts[1], parts[2], parts[3]
            if manual and name not in manual: continue
            result.append({'name': name, 'version': norm_ver(ver), 'publisher': pub,
                           'install_date': idate, 'install_location': '',
                           'source': 'rpm', 'type': 'library',
                           'cpe': (resolve_cpe(name, ver) or make_cpe(pub, name, ver)),
                           'purl': f'pkg:rpm/{name}@{ver}' if ver else f'pkg:rpm/{name}'})
    elif pkg_mgr == 'pacman':
        raw = run("pacman -Q 2>/dev/null")
        for line in raw.splitlines():
            parts = line.split()
            if len(parts) < 2: continue
            name, ver = parts[0], parts[1]
            if manual and name not in manual: continue
            result.append({'name': name, 'version': norm_ver(ver), 'publisher': '',
                           'install_date': '', 'install_location': '',
                           'source': 'pacman', 'type': 'library',
                           'cpe': (resolve_cpe(name, ver) or make_cpe('', name, ver)),
                           'purl': f'pkg:arch/{name}@{ver}'})
    return result

# ── SBOM filter helpers ─────────────────────────────────────────────────────
# A stock Ubuntu returns ~700 packages and ~300 binaries — most of them are
# libc/systemd/coreutils noise that dilutes CVE matching with OS-distro
# boilerplate. We keep:
#   * manually-installed packages (apt-mark showmanual, dnf userinstalled)
#   * known server/application binaries discovered at runtime
#   * running systemd services (already narrow)
# and drop the /usr/bin ELF dump that was previously the worst offender.

# Curated list of server/runtime applications worth tracking for CVE match.
# Each entry: (command, friendly_name, vendor). The command must accept a
# reasonable `--version` flag. Expand this list over time rather than scanning
# every binary in /usr/bin.
APPLICATION_PROBES = [
    ('nginx',          'nginx',         'nginx'),
    ('apache2',        'apache2',       'apache'),
    ('httpd',          'httpd',         'apache'),
    ('node',           'node',          'nodejs'),
    ('npm',            'npm',           'npm'),
    ('pnpm',           'pnpm',          'pnpm'),
    ('yarn',           'yarn',          'yarn'),
    ('python3',        'python3',       'python'),
    ('python',         'python',        'python'),
    ('php',            'php',           'php'),
    ('ruby',           'ruby',          'ruby'),
    ('java',           'java',          'oracle'),
    ('go',             'go',            'golang'),
    ('rustc',          'rustc',         'rust-lang'),
    ('docker',         'docker',        'docker'),
    ('containerd',     'containerd',    'containerd'),
    ('podman',         'podman',        'podman'),
    ('kubectl',        'kubectl',       'kubernetes'),
    ('mysql',          'mysql',         'mysql'),
    ('mariadb',        'mariadb',       'mariadb'),
    ('psql',           'postgresql',    'postgresql'),
    ('mongod',         'mongodb',       'mongodb'),
    ('redis-server',   'redis',         'redis'),
    ('memcached',      'memcached',     'memcached'),
    ('elasticsearch',  'elasticsearch', 'elastic'),
    ('rabbitmq-server','rabbitmq',      'rabbitmq'),
    ('haproxy',        'haproxy',       'haproxy'),
    ('varnishd',       'varnish',       'varnish'),
    ('vsftpd',         'vsftpd',        'vsftpd'),
    ('proftpd',        'proftpd',       'proftpd'),
    ('sshd',           'openssh',       'openssh'),
    ('samba',          'samba',         'samba'),
    ('named',          'bind',          'isc'),
    ('unbound',        'unbound',       'nlnetlabs'),
    ('dnsmasq',        'dnsmasq',       'dnsmasq'),
    ('fail2ban-server','fail2ban',      'fail2ban'),
    ('clamscan',       'clamav',        'clamav'),
    ('openssl',        'openssl',       'openssl'),
    ('curl',           'curl',          'curl'),
    ('wget',           'wget',          'gnu'),
    ('git',            'git',           'git-scm'),
    ('gcc',            'gcc',           'gnu'),
    ('make',           'make',          'gnu'),
]

# Path roots scanned for user-installed extras. /usr/bin is intentionally
# excluded — it duplicates the manually-installed pkg manager output.
ELF_SCAN_DIRS = ['/usr/local/bin', '/usr/local/sbin', '/opt']


def manually_installed_names(pkg_mgr):
    """Return a set of package names the admin explicitly installed (not
    transitive dependencies). Empty set means "no filter applied" so the
    caller can fall back to the full list."""
    if pkg_mgr == 'apt':
        raw = run("apt-mark showmanual 2>/dev/null")
        names = {l.strip() for l in raw.splitlines() if l.strip()}
        return names
    if pkg_mgr == 'rpm':
        # dnf is RHEL 8+; older yum uses "history userinstalled"
        raw = run("dnf repoquery --userinstalled --qf '%{name}' 2>/dev/null")
        if not raw:
            raw = run("yum history userinstalled 2>/dev/null")
        names = {l.strip() for l in raw.splitlines() if l.strip() and not l.startswith('#')}
        return names
    # pacman: "explicit" group via pacman -Qe
    if pkg_mgr == 'pacman':
        raw = run("pacman -Qe 2>/dev/null")
        return {l.split()[0] for l in raw.splitlines() if l.strip()}
    return set()


def sbom_src5_applications():
    """Targeted probe of known server/runtime applications regardless of
    package manager registration — catches binaries installed manually, via
    nvm, rbenv, ASDF, or tarballs."""
    result = []
    seen = set()
    for cmd, name, vendor in APPLICATION_PROBES:
        path = run(f"command -v {cmd} 2>/dev/null")
        if not path or not os.path.exists(path):
            continue
        # Most tools accept --version; a few (java) print to stderr.
        vr = run(f"{path} --version 2>&1 | head -1", timeout=3)
        if not vr:
            vr = run(f"{path} -v 2>&1 | head -1", timeout=3)
        m = re.search(r'(\d+\.\d+[\.\d]*)', vr)
        ver = norm_ver(m.group(1)) if m else ''
        key = f'{name}|{ver}'
        if key in seen:
            continue
        seen.add(key)
        result.append({'name': name, 'version': ver, 'publisher': vendor,
                       'install_date': '', 'install_location': path,
                       'source': 'application', 'type': 'application',
                       'cpe': (resolve_cpe(name, ver) or make_cpe(vendor, name, ver)),
                       'purl': make_purl(name, ver, vendor)})
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
                       'cpe': (resolve_cpe(name, ver) or make_cpe('', name, ver)), 'purl': make_purl(name, ver)})
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
                           'cpe': (resolve_cpe(svc, ver) or make_cpe('', svc, ver)), 'purl': make_purl(svc, ver)})
    return result

def sbom_src4_elf():
    """Scan user-installed extra binary locations only. /usr/bin and
    /usr/sbin are owned by the package manager and fully covered by the
    (filtered) dpkg/rpm/pacman listing, so including them here only added
    duplicates of coreutils / bash / grep / etc. /usr/local/* and /opt are
    where manual tarball installs typically land."""
    result = []; seen = set()
    for d in ELF_SCAN_DIRS:
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
                                   'cpe': (resolve_cpe(name, ver) or make_cpe('', name, ver)), 'purl': make_purl(name, ver)})
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
    p(57, f'SBOM Source 1/5: {pkg_mgr} manually-installed packages...')
    src1 = sbom_src1_pkgmgr(pkg_mgr)
    p(62, 'SBOM Source 2/5: Flatpak / Snap...')
    src2 = sbom_src2_flatpak_snap()
    p(66, 'SBOM Source 3/5: systemd services...')
    src3 = sbom_src3_services()
    p(70, 'SBOM Source 4/5: /usr/local + /opt binaries...')
    src4 = sbom_src4_elf()
    p(74, 'SBOM Source 5/5: server / runtime applications...')
    src5 = sbom_src5_applications()
    # Dedup by name (case-insensitive) — prefer the "application" source so
    # nginx/node/etc. show up with vendor metadata rather than a bare dpkg
    # line.  src5 is iterated first so it wins the name collision.
    all_comps, seen = [], set()
    for src in [src5, src1, src2, src3, src4]:
        for item in src:
            k = item['name'].lower()
            if k in seen: continue
            seen.add(k)
            all_comps.append(item)
    stats = {
        'pkg_mgr':     sum(1 for c in all_comps if c['source'] in ('dpkg','rpm','pacman')),
        'flatpak':     sum(1 for c in all_comps if c['source'] == 'flatpak'),
        'snap':        sum(1 for c in all_comps if c['source'] == 'snap'),
        'service':     sum(1 for c in all_comps if c['source'] == 'service'),
        'elf':         sum(1 for c in all_comps if c['source'] == 'elf-metadata'),
        'application': sum(1 for c in all_comps if c['source'] == 'application'),
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
  Source 1  Manually-installed pkgs (apt-mark showmanual / dnf userinstalled)
  Source 2  Flatpak and Snap packages
  Source 3  Running systemd services
  Source 4  ELF binaries in /usr/local/bin, /opt (user-installed extras)
  Source 5  Server / runtime apps (nginx, node, mysql, docker, …)

  OS base packages (libc, systemd, coreutils, …) are intentionally skipped
  to keep the CVE match list focused on what the operator actually runs.
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

    # When running under sudo, Path.home() points to /root — the invoking
    # user then has to chown the file back to themselves just to upload it.
    # Use SUDO_USER to save under the real user's home and chown the tree
    # after writing.
    sudo_user = os.environ.get('SUDO_USER')
    if sudo_user:
        try:
            pw = pwd.getpwnam(sudo_user)
            target_home = Path(pw.pw_dir)
            target_uid, target_gid = pw.pw_uid, pw.pw_gid
        except KeyError:
            target_home = Path.home()
            target_uid, target_gid = None, None
    else:
        target_home = Path.home()
        target_uid, target_gid = None, None

    desktop = target_home / 'Desktop'
    if not desktop.is_dir():
        desktop = target_home  # fallback if no Desktop
    out_dir  = desktop / 'SCS_Audit'
    out_dir.mkdir(exist_ok=True, parents=True)
    out_file = out_dir / f'audit_{ts}.scsaudit'
    out_file.write_text(enc)

    # Hand ownership back to the invoking user so they can upload without sudo.
    if target_uid is not None:
        try:
            os.chown(out_dir, target_uid, target_gid)
            os.chown(out_file, target_uid, target_gid)
        except OSError:
            pass  # non-fatal; file is written, permissions are just tighter
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
    print(f"    Services   : {stats.get('service',0)}   ELF meta: {stats.get('elf',0)}   Apps: {stats.get('application',0)}")
    if diff.get('PreviousSnapshot'):
        print(f"    Diff vs {diff['PreviousSnapshot']}:")
        print(f"      +Added:{len(diff.get('added',[]))}  -Removed:{len(diff.get('removed',[]))}  ~Changed:{len(diff.get('changed',[]))}")
    print()
    print("  Upload the .scsaudit file to SCS Dashboard.")
    print("=" * 60)

if __name__ == '__main__':
    main()
