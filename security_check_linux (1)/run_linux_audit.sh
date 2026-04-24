#!/bin/sh
# SCS Linux Hardening Audit + SBOM Launcher
# IACS UR E27 | IEC 62443-3-3 | CycloneDX 1.4
#
# POSIX-sh compatible — previous version used bashisms (&>, [[ ]], $EUID).
# Running it via `sh run_linux_audit.sh` on Ubuntu (where /bin/sh is dash)
# silently broke the `command -v` check because dash parses `&>` as
# "background + redirect" instead of "redirect stdout+stderr", which made
# the python3 detection print the path yet still fall into the error branch.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PY="$SCRIPT_DIR/linux_audit.py"

echo "============================================================"
echo "  SCS Linux Hardening Audit + SBOM"
echo "  Checking requirements..."
echo "============================================================"

# Check Python3 — POSIX redirection so it works under dash too.
if ! command -v python3 >/dev/null 2>&1; then
    echo "ERROR: python3 not found."
    echo "  Ubuntu/Debian: sudo apt install python3"
    echo "  RHEL/CentOS:   sudo yum install python3"
    echo "  Arch:          sudo pacman -S python"
    exit 1
fi
PY3_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "  python3 $PY3_VER  ... OK"

# Check cryptography library (for AES-256 encryption)
if ! python3 -c "import cryptography" >/dev/null 2>&1; then
    echo "  'cryptography' library not found."
    echo "  Installing..."
    if command -v pip3 >/dev/null 2>&1; then
        pip3 install cryptography --quiet 2>/dev/null || pip3 install cryptography --break-system-packages --quiet
    elif command -v pip >/dev/null 2>&1; then
        pip install cryptography --quiet
    else
        echo "WARNING: pip not found — encryption will use base64 fallback."
        echo "  To install: sudo apt install python3-cryptography"
    fi
fi

# Check root — $EUID is bash-only; `id -u` is POSIX and works everywhere.
if [ "$(id -u)" -ne 0 ]; then
    echo "  Requesting sudo..."
    exec sudo python3 "$PY"
fi

python3 "$PY"
