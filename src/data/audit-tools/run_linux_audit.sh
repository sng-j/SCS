#!/bin/bash
# SCS Linux Hardening Audit + SBOM Launcher
# IACS UR E27 | IEC 62443-3-3 | CycloneDX 1.4

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PY="$SCRIPT_DIR/linux_audit.py"

echo "============================================================"
echo "  SCS Linux Hardening Audit + SBOM"
echo "  Checking requirements..."
echo "============================================================"

# Check Python3
if ! command -v python3 &>/dev/null; then
    echo "ERROR: python3 not found."
    echo "  Ubuntu/Debian: sudo apt install python3"
    echo "  RHEL/CentOS:   sudo yum install python3"
    echo "  Arch:          sudo pacman -S python"
    exit 1
fi
PY3_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "  python3 $PY3_VER  ... OK"

# Check cryptography library (for AES-256 encryption)
if ! python3 -c "import cryptography" 2>/dev/null; then
    echo "  'cryptography' library not found."
    echo "  Installing..."
    if command -v pip3 &>/dev/null; then
        pip3 install cryptography --quiet || pip3 install cryptography --break-system-packages --quiet
    elif command -v pip &>/dev/null; then
        pip install cryptography --quiet
    else
        echo "WARNING: pip not found — encryption will use base64 fallback."
        echo "  To install: sudo apt install python3-cryptography"
    fi
fi

# Check root
if [[ $EUID -ne 0 ]]; then
    echo "  Requesting sudo..."
    exec sudo python3 "$PY"
fi

python3 "$PY"
