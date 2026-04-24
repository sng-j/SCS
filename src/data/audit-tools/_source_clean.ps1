#Requires -Version 5.1
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Security

# _AK and _GI injected at runtime by SCS download server

# ============================================================
# CONSENT DIALOG
# ============================================================
function Show-ConsentDialog {
    $f = New-Object System.Windows.Forms.Form
    $f.Text = "SCS Hardening Audit  -  IACS UR E27 / IEC 62443-3-3"
    $f.Size = New-Object System.Drawing.Size(660,530)
    $f.StartPosition = "CenterScreen"
    $f.FormBorderStyle = "FixedDialog"
    $f.MaximizeBox = $false; $f.TopMost = $true
    $f.BackColor = [System.Drawing.Color]::FromArgb(15,23,42)
    $lt = New-Object System.Windows.Forms.Label
    $lt.Text = "Ship Cyber Security - Hardening Audit + SBOM"
    $lt.Font = New-Object System.Drawing.Font("Segoe UI",13,[System.Drawing.FontStyle]::Bold)
    $lt.ForeColor = [System.Drawing.Color]::FromArgb(96,165,250)
    $lt.Location = New-Object System.Drawing.Point(20,16)
    $lt.Size = New-Object System.Drawing.Size(620,28)
    $ls = New-Object System.Windows.Forms.Label
    $ls.Text = "IACS UR E27 Rev.2  |  IEC 62443-3-3  |  CycloneDX SBOM 1.4"
    $ls.Font = New-Object System.Drawing.Font("Segoe UI",9)
    $ls.ForeColor = [System.Drawing.Color]::FromArgb(148,163,184)
    $ls.Location = New-Object System.Drawing.Point(22,48)
    $ls.Size = New-Object System.Drawing.Size(620,20)
    $div = New-Object System.Windows.Forms.Label
    $div.BorderStyle = "FixedSingle"
    $div.BackColor = [System.Drawing.Color]::FromArgb(51,65,85)
    $div.Location = New-Object System.Drawing.Point(20,74)
    $div.Size = New-Object System.Drawing.Size(618,1)
    $rtb = New-Object System.Windows.Forms.RichTextBox
    $rtb.ReadOnly = $true
    $rtb.BackColor = [System.Drawing.Color]::FromArgb(30,41,59)
    $rtb.ForeColor = [System.Drawing.Color]::FromArgb(226,232,240)
    $rtb.Font = New-Object System.Drawing.Font("Consolas",9)
    $rtb.Location = New-Object System.Drawing.Point(20,82)
    $rtb.Size = New-Object System.Drawing.Size(618,300)
    $rtb.BorderStyle = "None"
    $rtb.Text = "[ Purpose ]`r`nAudits cyber security hardening of shipboard PCs (IACS UR E27, IEC 62443-3-3)`r`nand generates a Host Inventory SBOM (Software Bill of Materials).`r`n`r`n[ Hardening Checks ]`r`n  Account/password policy   (SC-1, SR 1.1~1.3)`r`n  Local users & groups      (SC-2, SR 1.5)`r`n  Firewall / open ports     (SC-6, SR 2.1)`r`n  Audit log policy          (SC-7, SR 2.8~2.9)`r`n  RDP settings              (SC-6, SR 1.10)`r`n  Screen lock / saver       (SC-10, SR 3.1)`r`n  USB / AutoRun policy      (SC-10, SR 2.4)`r`n  Antivirus status          (SC-11, SR 3.2)`r`n  Patch status              (SC-13, SR 2.3)`r`n  Network / MAC / SMBv1     (SC-5, SC-6)`r`n  HW serial numbers         (HW ID)`r`n`r`n[ SBOM Collection  -  CycloneDX 1.4 ]`r`n  Source 1  Registry Uninstall keys  (HKLM 64-bit, 32-bit, HKCU)`r`n  Source 2  AppX / MSIX package list`r`n  Source 3  Windows Services and Kernel Drivers`r`n  Source 4  Program Files EXE file version metadata`r`n`r`n  Each component includes: Name, Version, Publisher, InstallDate,`r`n  InstallLocation, Source tag, CPE 2.3, Package URL (PURL),`r`n  and Diff vs previous snapshot (Added / Removed / Changed).`r`n`r`n[ Output ]`r`n  Results saved to:  Desktop\SCS_Audit\audit_YYYYMMDD_HHmmss.scsaudit`r`n  AES-256 encrypted .scsaudit file.`r`n  Upload to SCS Dashboard for CVE mapping and report generation.`r`n`r`n[ Not collected ]  File contents, emails, documents, personal data."
    $chk = New-Object System.Windows.Forms.CheckBox
    $chk.Text = "I have read the above and agree to run this audit and SBOM collection."
    $chk.ForeColor = [System.Drawing.Color]::FromArgb(226,232,240)
    $chk.Font = New-Object System.Drawing.Font("Segoe UI",9)
    $chk.Location = New-Object System.Drawing.Point(20,392)
    $chk.Size = New-Object System.Drawing.Size(620,22)
    $bRun = New-Object System.Windows.Forms.Button
    $bRun.Text = "Run Audit + SBOM"
    $bRun.Size = New-Object System.Drawing.Size(160,36)
    $bRun.Location = New-Object System.Drawing.Point(358,440)
    $bRun.FlatStyle = "Flat"
    $bRun.BackColor = [System.Drawing.Color]::FromArgb(37,99,235)
    $bRun.ForeColor = [System.Drawing.Color]::White
    $bRun.Font = New-Object System.Drawing.Font("Segoe UI",10,[System.Drawing.FontStyle]::Bold)
    $bRun.Enabled = $false
    $bRun.Add_Click({ $f.Tag = "RUN"; $f.Close() })
    $bCan = New-Object System.Windows.Forms.Button
    $bCan.Text = "Cancel"
    $bCan.Size = New-Object System.Drawing.Size(110,36)
    $bCan.Location = New-Object System.Drawing.Point(528,440)
    $bCan.FlatStyle = "Flat"
    $bCan.BackColor = [System.Drawing.Color]::FromArgb(51,65,85)
    $bCan.ForeColor = [System.Drawing.Color]::White
    $bCan.Font = New-Object System.Drawing.Font("Segoe UI",9)
    $bCan.Add_Click({ $f.Tag = "CANCEL"; $f.Close() })
    $chk.Add_CheckedChanged({ $bRun.Enabled = $chk.Checked })
    $f.Controls.AddRange(@($lt,$ls,$div,$rtb,$chk,$bRun,$bCan))
    $f.ShowDialog() | Out-Null
    return $f.Tag
}

# ============================================================
# PROGRESS WINDOW
# ============================================================
function New-ProgressWindow {
    $f = New-Object System.Windows.Forms.Form
    $f.Text = "SCS Hardening Audit + SBOM - Running..."
    $f.Size = New-Object System.Drawing.Size(520,180)
    $f.StartPosition = "CenterScreen"
    $f.FormBorderStyle = "FixedToolWindow"
    $f.BackColor = [System.Drawing.Color]::FromArgb(15,23,42)
    $f.TopMost = $true
    $ls = New-Object System.Windows.Forms.Label
    $ls.Text = "Initializing..."
    $ls.ForeColor = [System.Drawing.Color]::FromArgb(226,232,240)
    $ls.Font = New-Object System.Drawing.Font("Segoe UI",10)
    $ls.Location = New-Object System.Drawing.Point(16,12)
    $ls.Size = New-Object System.Drawing.Size(488,22)
    $bar = New-Object System.Windows.Forms.ProgressBar
    $bar.Location = New-Object System.Drawing.Point(16,44)
    $bar.Size = New-Object System.Drawing.Size(488,18)
    $bar.Minimum = 0; $bar.Maximum = 100; $bar.Value = 0; $bar.Style = "Continuous"
    $lp = New-Object System.Windows.Forms.Label
    $lp.Text = "0%"
    $lp.ForeColor = [System.Drawing.Color]::FromArgb(96,165,250)
    $lp.Font = New-Object System.Drawing.Font("Consolas",9)
    $lp.Location = New-Object System.Drawing.Point(16,70)
    $lp.Size = New-Object System.Drawing.Size(488,18)
    $lc = New-Object System.Windows.Forms.Label
    $lc.Text = ""
    $lc.ForeColor = [System.Drawing.Color]::FromArgb(100,116,139)
    $lc.Font = New-Object System.Drawing.Font("Consolas",8)
    $lc.Location = New-Object System.Drawing.Point(16,94)
    $lc.Size = New-Object System.Drawing.Size(488,16)
    $f.Controls.AddRange(@($ls,$bar,$lp,$lc))
    $f.Show()
    $f | Add-Member -NotePropertyName SL -NotePropertyValue $ls
    $f | Add-Member -NotePropertyName PB -NotePropertyValue $bar
    $f | Add-Member -NotePropertyName PL -NotePropertyValue $lp
    $f | Add-Member -NotePropertyName LC -NotePropertyValue $lc
    return $f
}
function UpdProg($w,[int]$p,[string]$m,[string]$c=""){
    $w.PB.Value=[Math]::Min($p,100); $w.SL.Text=$m; $w.PL.Text="$p%  -  $m"
    if($c){ $w.LC.Text=$c }
    $w.Refresh(); [System.Windows.Forms.Application]::DoEvents()
}

# ============================================================
# HELPERS
# ============================================================
function GR($path,$name){ try{return(Get-ItemProperty -Path $path -Name $name -EA Stop).$name}catch{return $null} }

function Get-NewGuid {
    try { return [System.Guid]::NewGuid().ToString() }
    catch { return (Get-Random -Min 100000000 -Max 999999999).ToString("x8")+"-0000-0000" }
}

function Normalize-Version([string]$v) {
    if(-not $v){ return "" }
    $v = $v.Trim() -replace "^v","" -replace "^Version\s+",""
    if($v -match "^(\d+\.\d+\.\d+\.\d+)"){ return $Matches[1] }
    if($v -match "^(\d+\.\d+\.\d+)"){ return $Matches[1] }
    if($v -match "^(\d+\.\d+)"){ return $Matches[1] }
    return $v
}

function Make-CPE([string]$pub,[string]$name,[string]$ver) {
    # cpe:2.3:a:vendor:product:version:*:*:*:*:*:*:*
    function cSafe([string]$s){ return ($s.ToLower() -replace "\s+","_" -replace "[^a-z0-9_.\-]","") }
    $p = cSafe $pub; $n = cSafe $name; $v = cSafe $ver
    if(-not $p){ $p="*" }; if(-not $n){ return "" }; if(-not $v){ $v="*" }
    return "cpe:2.3:a:${p}:${n}:${v}:*:*:*:*:*:*:*"
}

# ============================================================
# CPE DICTIONARY — curated mapping from common Windows product
# display names (registry / AppX) to their canonical NVD
# (vendor, product) pair. Populating CPE at audit time lets the
# SCS dashboard hit its exact-match CVE path instead of the noisy
# name heuristic. Keys are lowercase; partial-prefix match handles
# versioned names like "Google Chrome 120.0.6099.218".
# Keep in sync with CPE_MAP in linux_audit.py.
# ============================================================
$script:CPE_MAP = @{
    "google chrome"                  = @("google","chrome")
    "mozilla firefox"                = @("mozilla","firefox")
    "microsoft edge"                 = @("microsoft","edge_chromium")
    "7-zip"                          = @("7-zip","7-zip")
    "winrar"                         = @("rarlab","winrar")
    "putty"                          = @("putty","putty")
    "vlc media player"               = @("videolan","vlc_media_player")
    "notepad++"                      = @("notepad-plus-plus","notepad++")
    "adobe acrobat reader dc"        = @("adobe","acrobat_reader_dc")
    "adobe acrobat reader"           = @("adobe","acrobat_reader_dc")
    "wireshark"                      = @("wireshark","wireshark")
    "git"                            = @("git-scm","git")
    "git for windows"                = @("git-scm","git")
    "node.js"                        = @("nodejs","node.js")
    "python"                         = @("python","python")
    "python 3"                       = @("python","python")
    "java"                           = @("oracle","jre")
    "java(tm)"                       = @("oracle","jre")
    "openjdk"                        = @("oracle","openjdk")
    "mysql"                          = @("mysql","mysql")
    "mysql server"                   = @("mysql","mysql")
    "postgresql"                     = @("postgresql","postgresql")
    "mariadb"                        = @("mariadb","mariadb")
    "mongodb"                        = @("mongodb","mongodb")
    "redis"                          = @("redis","redis")
    "nginx"                          = @("nginx","nginx")
    "apache http server"             = @("apache","http_server")
    "apache tomcat"                  = @("apache","tomcat")
    "docker desktop"                 = @("docker","desktop")
    "openssh"                        = @("openbsd","openssh")
    "openssl"                        = @("openssl","openssl")
    "filezilla"                      = @("filezilla-project","filezilla_client")
    "teamviewer"                     = @("teamviewer","teamviewer")
    "anydesk"                        = @("anydesk","anydesk")
    "zoom"                           = @("zoom","zoom")
    "microsoft teams"                = @("microsoft","teams")
    "vmware workstation"             = @("vmware","workstation")
    "virtualbox"                     = @("oracle","vm_virtualbox")
    "openvpn"                        = @("openvpn","openvpn")
}
# Separate part map for entries that are OS ('o') instead of app ('a').
$script:CPE_OS_MAP = @{
    "windows 10"                     = @("microsoft","windows_10")
    "windows 11"                     = @("microsoft","windows_11")
    "windows server 2019"            = @("microsoft","windows_server_2019")
    "windows server 2022"            = @("microsoft","windows_server_2022")
    "windows server 2016"            = @("microsoft","windows_server_2016")
}

function Resolve-CPE([string]$name,[string]$ver) {
    # Curated-map lookup. Returns a canonical cpe:2.3 string or "" when
    # the display name isn't in the dictionary, so callers can fall back
    # to Make-CPE.
    if(-not $name){ return "" }
    $key = $name.ToLower().Trim()
    # Direct hit.
    $entry = $script:CPE_MAP[$key]; $part = "a"
    if(-not $entry){
        $entry = $script:CPE_OS_MAP[$key]
        if($entry){ $part = "o" }
    }
    # Prefix match: "Google Chrome 120.x" -> "google chrome".
    if(-not $entry){
        foreach($k in $script:CPE_MAP.Keys){
            if($key.StartsWith($k + " ")){ $entry = $script:CPE_MAP[$k]; break }
        }
    }
    if(-not $entry){
        foreach($k in $script:CPE_OS_MAP.Keys){
            if($key.StartsWith($k + " ")){ $entry = $script:CPE_OS_MAP[$k]; $part = "o"; break }
        }
    }
    if(-not $entry){ return "" }
    $vendor = $entry[0]; $product = $entry[1]
    $v = ($ver.ToLower() -replace "\s+","_" -replace "[^a-z0-9_.\-]","")
    if(-not $v){ $v = "*" }
    return "cpe:2.3:${part}:${vendor}:${product}:${v}:*:*:*:*:*:*:*"
}

function Make-PURL([string]$nm,[string]$ver,[string]$pub) {
    # pkg:generic/vendor/name@version
    $n = [Uri]::EscapeDataString(($nm -replace "\s+","_"))
    $ns = if($pub){ [Uri]::EscapeDataString(($pub.ToLower() -replace "\s+","_")) }else{ "" }
    $vs = if($ver){ "@"+[Uri]::EscapeDataString($ver) }else{ "" }
    if($ns){ return "pkg:generic/$ns/$n$vs" }
    return "pkg:generic/$n$vs"
}

# ============================================================
# HARDENING AUDIT FUNCTIONS (unchanged)
# ============================================================
function Get-AccountPolicy {
    $raw = net accounts 2>&1 | Out-String; $r = @{}
    foreach($l in ($raw -split "`n")) {
        if($l -match "Maximum password age.*?(\d+)"){ $r.MaxPwdAge=$Matches[1] }
        if($l -match "Minimum password age.*?(\d+)"){ $r.MinPwdAge=$Matches[1] }
        if($l -match "Minimum password length.*?(\d+)"){ $r.MinPwdLen=$Matches[1] }
        if($l -match "Lockout threshold.*?(\d+)"){ $r.LockoutThreshold=$Matches[1] }
        if($l -match "Lockout duration.*?(\d+)"){ $r.LockoutDuration=$Matches[1] }
    }
    $t="$env:TEMP\sec$(Get-Random).cfg"; secedit /export /cfg $t /quiet 2>&1|Out-Null
    if(Test-Path $t){
        $s=Get-Content $t -EA SilentlyContinue
        $r.PasswordComplexity=if($s -match "PasswordComplexity\s*=\s*1"){"Enabled"}else{"Disabled"}
        Remove-Item $t -Force -EA SilentlyContinue
    }else{ $r.PasswordComplexity="Unknown" }
    return $r
}
function Get-LocalAccounts {
    $u=Get-LocalUser|Select-Object Name,Enabled,PasswordRequired,PasswordNeverExpires,Description
    $a=(Get-LocalGroupMember -Group "Administrators" -EA SilentlyContinue).Name
    return @{Users=$u;Admins=$a;GuestEnabled=(Get-LocalUser -Name "Guest" -EA SilentlyContinue).Enabled}
}
function Get-AuditPolicy {
    $raw=auditpol /get /category:* 2>&1|Out-String; $r=@{}
    $raw -split "`n" | ForEach-Object{
        if($_ -match "^\s{2,}(.+?)\s{2,}(No Auditing|Success|Failure|Success and Failure)")
        { $r[$Matches[1].Trim()]=$Matches[2].Trim() }
    }
    return $r
}
function Get-FirewallStatus {
    $p=Get-NetFirewallProfile -EA SilentlyContinue
    if($p){return $p|Select-Object Name,Enabled,DefaultInboundAction,DefaultOutboundAction}
    return @{Raw=(netsh advfirewall show allprofiles 2>&1|Out-String)}
}
function Get-OpenPorts {
    $r=@()
    try{
        netstat -ano 2>&1|Out-String|ForEach-Object{$_ -split "`n"}|Where-Object{$_ -match "LISTENING"}|ForEach-Object{
            if($_ -match "\s+([\d.:]+):(\d+)\s+[\d.:]+\s+LISTENING\s+(\d+)"){
                $pid_=$Matches[3]; $proc=try{(Get-Process -Id([int]$pid_) -EA Stop).Name}catch{"N/A"}
                $r+=[PSCustomObject]@{IP=$Matches[1];Port=[int]$Matches[2];PID=$pid_;Process=$proc}
            }
        }
    }catch{}
    return @($r)
}
function Get-RDPSettings {
    return @{
        Enabled=(GR "HKLM:\System\CurrentControlSet\Control\Terminal Server" "fDenyTSConnections") -eq 0
        EncryptionLevel=GR "HKLM:\System\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp" "MinEncryptionLevel"
        NLARequired=GR "HKLM:\System\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp" "UserAuthentication"
        MaxIdleTime=GR "HKLM:\System\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp" "MaxIdleTime"
    }
}
function Get-ScreenLockPolicy {
    return @{
        ScreenSaverEnabled=GR "HKCU:\Control Panel\Desktop" "ScreenSaveActive"
        ScreenSaverTimeout=GR "HKCU:\Control Panel\Desktop" "ScreenSaveTimeOut"
        ScreenSaverSecure=GR "HKCU:\Control Panel\Desktop" "ScreenSaverIsSecure"
        InactivityLock=GR "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" "InactivityTimeoutSecs"
    }
}
function Get-USBPolicy {
    return @{
        StorageDisabled=GR "HKLM:\SYSTEM\CurrentControlSet\Services\USBSTOR" "Start"
        WriteProtect=GR "HKLM:\SYSTEM\CurrentControlSet\Control\StorageDevicePolicies" "WriteProtect"
        AutoRunDisabled=GR "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer" "NoDriveTypeAutoRun"
    }
}
function Get-AntivirusStatus {
    $r=@{WindowsDefender=@{};ThirdParty=@()}
    try{
        $mp=Get-MpComputerStatus -EA Stop
        $r.WindowsDefender=@{Enabled=$mp.AntivirusEnabled;SignatureVersion=$mp.AntivirusSignatureVersion;
            SignatureAge_Days=$mp.AntivirusSignatureAge;LastFullScan=($mp.FullScanEndTime -as [string]);
            RealTimeProtection=$mp.RealTimeProtectionEnabled;BehaviorMonitor=$mp.BehaviorMonitorEnabled}
    }catch{}
    try{$r.ThirdParty=Get-CimInstance -Namespace "root\SecurityCenter2" -ClassName "AntiVirusProduct" -EA Stop|
        Select-Object displayName,productState,pathToSignedProductExe}catch{}
    return $r
}
function Get-PatchStatus {
    try{
        $hf=Get-HotFix -EA SilentlyContinue|Sort-Object InstalledOn -Descending
        $h=@($hf|Select-Object -First 20|ForEach-Object{
            [PSCustomObject]@{HotFixID=$_.HotFixID;Description=$_.Description;InstalledOn=($_.InstalledOn -as [string])}
        })
        $last=($hf|Select-Object -First 1).InstalledOn
    }catch{$h=@();$last=$null}
    return [PSCustomObject]@{
        RecentPatches=$h
        AutoUpdateOff=(GR "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU" "NoAutoUpdate") -eq 1
        TotalInstalled=(Get-HotFix -EA SilentlyContinue).Count
        LastPatch=($last -as [string])
    }
}
function Get-NetworkSettings {
    $adapters=@()
    $ifaces=@()
    try{
        # Build the same `interfaces` shape the Linux audit emits — name,
        # mac, state, and a CIDR-formatted addrs[] — so the SCS backend
        # only has to deal with one payload layout for IP / MAC backfill
        # into the inventory form.
        $adapters=@(Get-NetAdapter -EA SilentlyContinue|ForEach-Object{
            [PSCustomObject]@{Name=$_.Name;Status=($_.Status -as [string]);MacAddress=$_.MacAddress;
                LinkSpeed=($_.LinkSpeed -as [string]);MediaType=$_.MediaType;InterfaceDescription=$_.InterfaceDescription}
        })
        $ipMap=@{}
        foreach($ip in (Get-NetIPAddress -EA SilentlyContinue|Where-Object{$_.IPAddress -and $_.IPAddress -notlike "169.254.*" -and $_.IPAddress -notlike "fe80*"})){
            $key=$ip.InterfaceAlias
            if(-not $ipMap.ContainsKey($key)){ $ipMap[$key]=@() }
            $ipMap[$key] += "$($ip.IPAddress)/$($ip.PrefixLength)"
        }
        foreach($a in $adapters){
            $ifaces += [PSCustomObject]@{
                name    = $a.Name
                mac     = ($a.MacAddress -replace "-",":")
                state   = if($a.Status -eq "Up"){"up"}else{"down"}
                addrs   = @($ipMap[$a.Name])
                mtu     = ""
            }
        }
    }catch{}
    return @{
        SMBv1Disabled=(GR "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" "SMB1") -eq 0
        LMAuthLevel=GR "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" "LmCompatibilityLevel"
        NullSessionBlocked=(GR "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" "RestrictAnonymous") -ge 1
        Adapters=$adapters
        interfaces=$ifaces
    }
}
function Get-RunningServices {
    return @(Get-Service -EA SilentlyContinue|Where-Object{$_.Status -eq "Running"}|Sort-Object Name|ForEach-Object{
        [PSCustomObject]@{Name=$_.Name;DisplayName=$_.DisplayName;StartType=($_.StartType -as [string])}
    })
}
function Get-SystemInfo {
    $os=Get-CimInstance Win32_OperatingSystem -EA SilentlyContinue
    $cs=Get-CimInstance Win32_ComputerSystem -EA SilentlyContinue
    $allVols=@(); $volSerial=$null
    try{
        $vols=Get-CimInstance Win32_LogicalDisk -EA SilentlyContinue|Where-Object{$_.DriveType -eq 3}
        $allVols=@($vols|ForEach-Object{[PSCustomObject]@{Drive=$_.DeviceID;Label=$_.VolumeName;Serial=$_.VolumeSerialNumber;Size_GB=[Math]::Round($_.Size/1GB,1)}})
        $cDrive=$allVols|Where-Object{$_.Drive -eq "C:"}|Select-Object -First 1
        $volSerial=if($cDrive){$cDrive.Serial}else{($allVols|Select-Object -First 1).Serial}
    }catch{}
    $disks=@()
    try{
        $disks=@(Get-CimInstance Win32_DiskDrive -EA SilentlyContinue|ForEach-Object{
            [PSCustomObject]@{Model=$_.Model;SerialNumber=($_.SerialNumber -as [string]).Trim();
                Size_GB=[Math]::Round($_.Size/1GB,1);Interface=$_.InterfaceType;MediaType=$_.MediaType}
        })
    }catch{}
    # Pull BIOS / baseboard detail so Manufacturer/Model backfill is more
    # accurate on systems where Win32_ComputerSystem reports generic values
    # (e.g. "System manufacturer" / "System Product Name" on OEM builds).
    $bios=$null; $board=$null
    try{$bios=Get-CimInstance Win32_BIOS -EA SilentlyContinue}catch{}
    try{$board=Get-CimInstance Win32_BaseBoard -EA SilentlyContinue}catch{}

    return @{
        # Platform field makes platform detection symmetric with the Linux
        # tool — previously we relied on sniffing `OS` for "Windows", which
        # works but breaks on localised builds.
        Platform="windows"
        ComputerName=$env:COMPUTERNAME; OS=$os.Caption; OSVersion=$os.Version; OSBuild=$os.BuildNumber
        Architecture=$os.OSArchitecture; LastBoot=($os.LastBootUpTime -as [string])
        Manufacturer=$cs.Manufacturer; Model=$cs.Model; TotalRAM_GB=[Math]::Round($cs.TotalPhysicalMemory/1GB,2)
        BoardManufacturer=if($board){$board.Manufacturer}else{""}
        BoardProduct=if($board){$board.Product}else{""}
        BoardSerial=if($board){$board.SerialNumber}else{""}
        BIOSVendor=if($bios){$bios.Manufacturer}else{""}
        BIOSVersion=if($bios){$bios.SMBIOSBIOSVersion}else{""}
        Domain=$cs.Domain; AuditTime=(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        VolumeSerial=$volSerial; Volumes=$allVols; Disks=$disks
    }
}

# ============================================================
# SBOM COLLECTION  -  4 SOURCES
# ============================================================

# -- Source 1: Registry Uninstall Keys -----------------------
function Get-RegistrySoftware {
    $paths = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    $seen=@{}; $result=@()
    foreach($p in $paths) {
        $arch = if($p -match "WOW6432"){"x86"} elseif($p -match "HKCU:"){"user"} else{"x64"}
        try{
            Get-ItemProperty $p -EA SilentlyContinue | Where-Object {
                $_.DisplayName -and $_.DisplayName.Trim() -and
                ($_.SystemComponent -ne 1) -and
                ($_.ReleaseType -notmatch "Update|Hotfix|ServicePack")
            } | ForEach-Object {
                $nm  = $_.DisplayName.Trim()
                $ver = Normalize-Version ($_.DisplayVersion -as [string])
                $key = "$nm|$ver"
                if(-not $seen[$key]) {
                    $seen[$key]=$true
                    $pub = ($_.Publisher -as [string]).Trim()
                    $result += [PSCustomObject]@{
                        Name=$nm; Version=$ver; Publisher=$pub
                        InstallDate=($_.InstallDate -as [string])
                        InstallLocation=($_.InstallLocation -as [string])
                        Source="registry-$arch"; Type="application"
                        CPE=$(if($r=Resolve-CPE $nm $ver){$r}else{Make-CPE $pub $nm $ver})
                        PURL=(Make-PURL $nm $ver $pub)
                    }
                }
            }
        }catch{}
    }
    return $result
}

# -- Source 2: AppX / MSIX Packages --------------------------
function Get-AppXSoftware {
    $result=@()
    try{
        Get-AppxPackage -AllUsers -EA SilentlyContinue | Where-Object {
            ($_.IsFramework -eq $false) -and ($_.SignatureKind -ne "System")
        } | ForEach-Object {
            $nm  = $_.Name; $ver = $_.Version
            $pub = $_.Publisher -replace "^CN=","" -replace ",.*$",""
            $result += [PSCustomObject]@{
                Name=$nm; Version=$ver; Publisher=$pub; InstallDate=""
                InstallLocation=($_.InstallLocation -as [string])
                Source="appx-msix"; Type="application"
                CPE=$(if($r=Resolve-CPE $nm $ver){$r}else{Make-CPE $pub $nm $ver}); PURL=(Make-PURL $nm $ver $pub)
            }
        }
    }catch{}
    return $result
}

# -- Source 3: Windows Services + Kernel Drivers --------------
function Get-ServiceDriverSoftware {
    $result=@(); $seen=@{}
    # Services: extract EXE path and read FileVersionInfo
    try{
        Get-CimInstance Win32_Service -EA SilentlyContinue | Where-Object {
            $_.PathName -and ($_.StartMode -ne "Disabled")
        } | ForEach-Object {
            $raw = $_.PathName -replace '"',""
            if($raw -match "^([A-Za-z]:\\[^`"]+?\.exe)"){ $exe=$Matches[1] }
            elseif($raw -match "^([A-Za-z]:\\.+?\.exe)"){ $exe=$Matches[1] }
            else{ return }
            if(-not(Test-Path $exe)){ return }
            try{
                $fv=[System.Diagnostics.FileVersionInfo]::GetVersionInfo($exe)
                $pnm=if($fv.ProductName){$fv.ProductName.Trim()}else{$_.Name}
                $ver=Normalize-Version($fv.ProductVersion -as [string])
                $pub=if($fv.CompanyName){$fv.CompanyName.Trim()}else{""}
                $k="$pnm|$ver|svc"
                if($pnm -and -not $seen[$k]){
                    $seen[$k]=$true
                    $result+=[PSCustomObject]@{
                        Name=$pnm;Version=$ver;Publisher=$pub;InstallDate="";InstallLocation=$exe
                        Source="service";Type="library"
                        CPE=$(if($r=Resolve-CPE $pnm $ver){$r}else{Make-CPE $pub $pnm $ver});PURL=(Make-PURL $pnm $ver $pub)
                    }
                }
            }catch{}
        }
    }catch{}
    # Kernel Drivers (running .sys files)
    try{
        Get-CimInstance Win32_SystemDriver -EA SilentlyContinue | Where-Object {
            ($_.State -eq "Running") -and $_.PathName
        } | ForEach-Object {
            $exe=$_.PathName -replace '"',""
            $dname=if($exe -match "\\([^\\]+)\.sys$"){ $Matches[1] }else{ $_.Name }
            $ver=""; $pub=""
            try{
                if(Test-Path $exe){
                    $fv=[System.Diagnostics.FileVersionInfo]::GetVersionInfo($exe)
                    $ver=Normalize-Version($fv.FileVersion -as [string])
                    $pub=if($fv.CompanyName){$fv.CompanyName.Trim()}else{""}
                }
            }catch{}
            $k="$dname|$ver|drv"
            if(-not $seen[$k]){
                $seen[$k]=$true
                $result+=[PSCustomObject]@{
                    Name=$dname;Version=$ver;Publisher=$pub;InstallDate="";InstallLocation=$exe
                    Source="driver";Type="firmware"
                    CPE=$(if($r=Resolve-CPE $dname $ver){$r}else{Make-CPE $pub $dname $ver});PURL=(Make-PURL $dname $ver $pub)
                }
            }
        }
    }catch{}
    return $result
}

# -- Source 4: Program Files EXE Metadata --------------------
function Get-ExeMetadataSoftware {
    $result=@(); $seen=@{}
    $dirs=@($env:ProgramFiles,"${env:ProgramFiles(x86)}",$env:ProgramData)|Where-Object{$_ -and (Test-Path $_)}
    foreach($dir in $dirs){
        try{
            Get-ChildItem -Path $dir -Filter "*.exe" -Recurse -Depth 2 -EA SilentlyContinue |
            Where-Object{$_.Length -gt 50000} | ForEach-Object {
                try{
                    $fv=[System.Diagnostics.FileVersionInfo]::GetVersionInfo($_.FullName)
                    $pnm=if($fv.ProductName -and $fv.ProductName.Trim()){$fv.ProductName.Trim()}else{$_.BaseName}
                    $ver=Normalize-Version($fv.ProductVersion -as [string])
                    $pub=if($fv.CompanyName){$fv.CompanyName.Trim()}else{""}
                    if(-not $pnm -or $pnm.Length -lt 2){ return }
                    $k="$pnm|$ver|exe"
                    if(-not $seen[$k]){
                        $seen[$k]=$true
                        $result+=[PSCustomObject]@{
                            Name=$pnm;Version=$ver;Publisher=$pub
                            InstallDate=$_.LastWriteTime.ToString("yyyyMMdd")
                            InstallLocation=$_.FullName
                            Source="exe-metadata";Type="application"
                            CPE=$(if($r=Resolve-CPE $pnm $ver){$r}else{Make-CPE $pub $pnm $ver});PURL=(Make-PURL $pnm $ver $pub)
                        }
                    }
                }catch{}
            }
        }catch{}
    }
    return $result
}

# ============================================================
# SBOM BUILDER  -  CycloneDX 1.4
# ============================================================
function Build-SBOM {
    param($ProgWindow,$SysInfo)

    UpdProg $ProgWindow 57 "SBOM Source 1/4: Registry Uninstall keys..." "HKLM 64-bit + 32-bit + HKCU..."
    $src1=Get-RegistrySoftware

    UpdProg $ProgWindow 63 "SBOM Source 2/4: AppX / MSIX packages..." "Get-AppxPackage -AllUsers..."
    $src2=Get-AppXSoftware

    UpdProg $ProgWindow 69 "SBOM Source 3/4: Services and Drivers..." "Win32_Service + Win32_SystemDriver..."
    $src3=Get-ServiceDriverSoftware

    UpdProg $ProgWindow 75 "SBOM Source 4/4: Program Files EXE metadata..." "ProgramFiles depth:2 *.exe FileVersionInfo..."
    $src4=Get-ExeMetadataSoftware

    # Merge + deduplicate (Registry wins on conflict)
    $all=@(); $masterIdx=@{}
    foreach($src in @($src1,$src2,$src3,$src4)){
        foreach($item in $src){
            $k=($item.Name+"|"+$item.Version).ToLower().Trim()
            if(-not $masterIdx.ContainsKey($k)){ $masterIdx[$k]=$true; $all+=$item }
        }
    }

    $stats=@{
        registry=($all|Where-Object{$_.Source -like "registry*"}).Count
        appx=($all|Where-Object{$_.Source -eq "appx-msix"}).Count
        service=($all|Where-Object{$_.Source -eq "service"}).Count
        driver=($all|Where-Object{$_.Source -eq "driver"}).Count
        exe=($all|Where-Object{$_.Source -eq "exe-metadata"}).Count
    }

    # -- Diff vs previous snapshot (HKCU registry) ----------
    $diff=@{Added=@();Removed=@();Changed=@();PreviousSnapshot=""}
    $snapKey="HKCU:\SOFTWARE\SCS\Audit\SBOM"
    try{
        $curMap=@{}; $all|ForEach-Object{$curMap[$_.Name.ToLower()]=$_.Version}
        $prevJson=GR $snapKey "LastSnapshot"
        if($prevJson){
            $prev=$prevJson|ConvertFrom-Json
            $diff.PreviousSnapshot=($prev.SnapshotDate -as [string])
            $prevMap=@{}; $prev.Components|ForEach-Object{$prevMap[$_.Name.ToLower()]=$_.Version}
            foreach($k in $curMap.Keys){ if(-not $prevMap.ContainsKey($k)){$diff.Added+=$k} }
            foreach($k in $prevMap.Keys){ if(-not $curMap.ContainsKey($k)){$diff.Removed+=$k} }
            foreach($k in $curMap.Keys){
                if($prevMap.ContainsKey($k) -and $prevMap[$k] -ne $curMap[$k] -and $curMap[$k]){
                    $diff.Changed+=[PSCustomObject]@{Name=$k;From=$prevMap[$k];To=$curMap[$k]}
                }
            }
        }
        # Save new snapshot
        if(-not(Test-Path $snapKey)){New-Item -Path $snapKey -Force|Out-Null}
        $snap=@{SnapshotDate=(Get-Date -Format "yyyy-MM-dd HH:mm:ss");
            Components=($all|Select-Object Name,Version)}|ConvertTo-Json -Compress
        Set-ItemProperty -Path $snapKey -Name "LastSnapshot" -Value $snap -Force -EA SilentlyContinue
    }catch{}

    # -- Build CycloneDX 1.4 structure ----------------------
    $sbom=@{
        bomFormat="CycloneDX"; specVersion="1.4"
        serialNumber="urn:uuid:$(Get-NewGuid)"; version=1
        metadata=@{
            timestamp=(Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
            component=@{type="device";name=$SysInfo.ComputerName;version=$SysInfo.OS}
        }
        totalComponents=$all.Count
        sources=$stats
        diff=$diff
        components=@($all|Sort-Object Name|ForEach-Object{
            @{type=$_.Type;name=$_.Name;version=$_.Version;publisher=$_.Publisher;
              installDate=$_.InstallDate;installLocation=$_.InstallLocation;
              source=$_.Source;cpe=$_.CPE;purl=$_.PURL}
        })
    }

    # Backward compat: flat InstalledSoftware (registry-only, for CVE tab)
    $flatSW=@($src1|Select-Object Name,Version,Publisher,InstallDate)
    return @{SBOM=$sbom;InstalledSoftware=$flatSW}
}

# ============================================================
# ENCRYPT + SAVE
# ============================================================
function Protect-Data([string]$json,[string]$pwd,[int]$gi) {
    $salt=[byte[]](1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16)
    $d=New-Object System.Security.Cryptography.Rfc2898DeriveBytes($pwd,$salt,100000,[System.Security.Cryptography.HashAlgorithmName]::SHA256)
    $key=$d.GetBytes(32); $iv=$d.GetBytes(16)
    $aes=[System.Security.Cryptography.Aes]::Create()
    $aes.Key=$key; $aes.IV=$iv; $aes.Mode="CBC"; $aes.Padding="PKCS7"
    $enc=$aes.CreateEncryptor()
    $plain=[System.Text.Encoding]::UTF8.GetBytes($json)
    $cipher=$enc.TransformFinalBlock($plain,0,$plain.Length); $aes.Dispose()
    $rng=[System.Security.Cryptography.RandomNumberGenerator]::Create()
    $result=New-Object System.Collections.Generic.List[byte]; $cnt=0
    foreach($b in $cipher){
        $result.Add($b); $cnt++
        if($cnt % $gi -eq 0){$rb=[byte[]](1);$rng.GetBytes($rb);$result.Add($rb[0])}
    }
    $hdr=[System.Text.Encoding]::ASCII.GetBytes("SCSDAT2")
    $hdr+=[byte]$gi; $salt2=[byte[]](1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16)
    return [Convert]::ToBase64String($hdr+$salt2+$iv+$result.ToArray())
}
function Get-SavePath {
    if($env:SCS_SAVE_DIR -and (Test-Path $env:SCS_SAVE_DIR)){return $env:SCS_SAVE_DIR}
    $d=[Environment]::GetFolderPath("Desktop"); if($d){return $d}
    return $env:USERPROFILE
}

# ============================================================
# MAIN
# ============================================================
$pr=[Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if(-not $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){
    [System.Windows.Forms.MessageBox]::Show("Please run this tool as Administrator.","Permission Error",[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Error)|Out-Null
    exit 1
}
$consent=Show-ConsentDialog
if($consent -ne "RUN"){
    [System.Windows.Forms.MessageBox]::Show("Audit cancelled.","Cancelled",[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Information)|Out-Null
    exit 0
}

$prog=New-ProgressWindow; $rpt=@{}

UpdProg $prog 5  "Collecting system information..."
$rpt.SystemInfo=Get-SystemInfo
UpdProg $prog 12 "Checking account policies (SC-1)..."
$rpt.AccountPolicy=Get-AccountPolicy
UpdProg $prog 20 "Checking local accounts (SC-2)..."
$rpt.LocalAccounts=Get-LocalAccounts
UpdProg $prog 27 "Checking audit policies (SC-7)..."
$rpt.AuditPolicy=Get-AuditPolicy
UpdProg $prog 33 "Checking firewall status (SC-6)..."
$rpt.Firewall=Get-FirewallStatus
UpdProg $prog 38 "Checking RDP settings (SC-6)..."
$rpt.RDP=Get-RDPSettings
UpdProg $prog 42 "Checking screen lock policy (SC-10)..."
$rpt.ScreenLock=Get-ScreenLockPolicy
UpdProg $prog 45 "Checking USB / AutoRun policy (SC-10)..."
$rpt.USBPolicy=Get-USBPolicy
UpdProg $prog 49 "Checking antivirus status (SC-11)..."
$rpt.Antivirus=Get-AntivirusStatus
UpdProg $prog 53 "Checking patch status (SC-13)..."
$rpt.PatchStatus=Get-PatchStatus
UpdProg $prog 55 "Checking network settings (SC-5/6)..."
$rpt.NetworkSettings=Get-NetworkSettings
UpdProg $prog 56 "Scanning open ports..."
$rpt.OpenPorts=Get-OpenPorts

# SBOM collection (Sources 1-4, progress 57-80)
$sbomResult=Build-SBOM -ProgWindow $prog -SysInfo $rpt.SystemInfo
$rpt.SBOM=$sbomResult.SBOM
$rpt.InstalledSoftware=$sbomResult.InstalledSoftware

UpdProg $prog 83 "Scanning running services..."
$rpt.RunningServices=Get-RunningServices
UpdProg $prog 93 "Encrypting and saving..." "Serializing $($rpt.SBOM.totalComponents) SBOM components..."

if($rpt.InstalledSoftware -isnot [System.Array]){$rpt.InstalledSoftware=@($rpt.InstalledSoftware)}
if($rpt.RunningServices   -isnot [System.Array]){$rpt.RunningServices=@($rpt.RunningServices)}
if($rpt.OpenPorts         -isnot [System.Array]){$rpt.OpenPorts=@($rpt.OpenPorts)}

$json=$rpt|ConvertTo-Json -Depth 15 -Compress
$gi=if($global:_GI -and $global:_GI -gt 0){[int]$global:_GI}else{7}
$ak=if($global:_AK){$global:_AK}else{"000000"}
$enc=$null
try{$enc=Protect-Data $json $ak $gi}
catch{$enc=[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($json))}

$base=Get-SavePath
if(-not $base -or -not(Test-Path $base)){$base=[Environment]::GetFolderPath("Desktop")}
$ts=Get-Date -Format "yyyyMMdd_HHmmss"
$dir=Join-Path $base "SCS_Audit"
try{if(-not(Test-Path $dir)){New-Item -ItemType Directory -Path $dir -Force|Out-Null}}catch{$dir=$base}
$out=Join-Path $dir "audit_${ts}.scsaudit"
try{[IO.File]::WriteAllText($out,$enc,[System.Text.Encoding]::ASCII)}
catch{
    $out=Join-Path([Environment]::GetFolderPath("Desktop")) "audit_${ts}.scsaudit"
    [IO.File]::WriteAllText($out,$enc,[System.Text.Encoding]::ASCII)
}

$d=$rpt.SBOM.diff
$added=if($d.Added){$d.Added.Count}else{0}
$rmved=if($d.Removed){$d.Removed.Count}else{0}
$msg ="Audit + SBOM complete!`n`nFile: $out`n`n"
$msg+="SBOM Summary (`n"
$msg+="  Total      : $($rpt.SBOM.totalComponents) components`n"
$msg+="  Registry   : $($rpt.SBOM.sources.registry)    AppX/MSIX: $($rpt.SBOM.sources.appx)`n"
$msg+="  Services   : $($rpt.SBOM.sources.service)    Drivers: $($rpt.SBOM.sources.driver)    EXE: $($rpt.SBOM.sources.exe)`n"
if($d.PreviousSnapshot){
    $msg+="`nDiff vs $($d.PreviousSnapshot):`n"
    $msg+="  + Added: $added    - Removed: $rmved    ~ Changed: $($d.Changed.Count)`n"
}
$msg+="`nUpload the .scsaudit file to SCS Dashboard."
$prog.Close()
[System.Windows.Forms.MessageBox]::Show($msg,"Audit Complete",[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Information)|Out-Null