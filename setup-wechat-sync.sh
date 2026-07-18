#!/bin/bash
# ORI-LIN WeChat Sync - Server Setup Script
# Run this on the Tencent Cloud HK server as root
# Usage: bash setup-wechat-sync.sh

set -e

SITE_DIR="/var/www/ori-lin-site"
ENV_FILE="$SITE_DIR/.env"
CRON_SCRIPT="/usr/local/bin/wechat-sync.sh"
GIT_REPO="https://github.com/xiaode12362/ori-lin-site.git"

echo "========================================="
echo "  ORI-LIN WeChat Sync Setup"
echo "========================================="

# 1. Check if site directory exists, clone if not
if [ ! -d "$SITE_DIR" ]; then
    echo "Site directory not found, cloning from GitHub..."
    mkdir -p "$(dirname "$SITE_DIR")"
    git clone "$GIT_REPO" "$SITE_DIR"
    echo "[OK] Site cloned to $SITE_DIR"
else
    echo "[OK] Site directory: $SITE_DIR"
    # Pull latest code
    echo ""
    echo "--- Pulling latest code from GitHub ---"
    cd "$SITE_DIR"
    git pull origin main 2>/dev/null || echo "[WARN] git pull failed, continuing anyway"
fi

# 2. Check wechat_sync.py exists
if [ ! -f "$SITE_DIR/wechat_sync.py" ]; then
    echo "ERROR: wechat_sync.py not found in $SITE_DIR"
    echo "Make sure git pull succeeded"
    exit 1
fi
echo "[OK] wechat_sync.py found"

# 3. Install Python 3 and pip
echo ""
echo "--- Checking Python 3 ---"
if command -v python3 &>/dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1)
    echo "[OK] Python 3 installed: $PYTHON_VERSION"
else
    echo "Installing Python 3..."
    if command -v apt-get &>/dev/null; then
        apt-get update -qq && apt-get install -y -qq python3 python3-pip
    elif command -v yum &>/dev/null; then
        yum install -y python3 python3-pip
    elif command -v dnf &>/dev/null; then
        dnf install -y python3 python3-pip
    else
        echo "ERROR: Cannot install Python 3 - unknown package manager"
        exit 1
    fi
    echo "[OK] Python 3 installed"
fi

# 4. Install Python packages
echo ""
echo "--- Installing Python packages ---"
python3 -m pip install --quiet requests Pillow 2>/dev/null || python3 -m pip install --break-system-packages --quiet requests Pillow 2>/dev/null || {
    echo "Trying with --user flag..."
    python3 -m pip install --user --quiet requests Pillow
}
echo "[OK] Python packages installed"

# 5. Create .env file
echo ""
echo "--- Setting up .env file ---"
read -r -p "WeChat AppID: " APPID
read -r -s -p "WeChat AppSecret: " SECRET
echo ""

if [ -z "$APPID" ] || [ -z "$SECRET" ]; then
    echo "ERROR: AppID and AppSecret are required"
    exit 1
fi

cat > "$ENV_FILE" << EOF
# ORI-LIN WeChat Sync Configuration
WECHAT_APPID=$APPID
WECHAT_APPSECRET=$SECRET
EOF
chmod 600 "$ENV_FILE"
echo "[OK] .env file created at $ENV_FILE"

# 6. Get server public IP
echo ""
echo "--- Server Public IP ---"
SERVER_IP=$(curl -s https://ifconfig.me 2>/dev/null || curl -s https://api.ipify.org 2>/dev/null || curl -s https://checkip.amazonaws.com 2>/dev/null)
if [ -n "$SERVER_IP" ]; then
    echo "[IMPORTANT] Add this IP to WeChat MP whitelist:"
    echo "  >>> $SERVER_IP <<<"
    echo "  mp.weixin.qq.com -> 设置与开发 -> 基本配置 -> IP白名单"
else
    echo "[WARN] Could not auto-detect public IP. Check manually."
fi

# 7. Create cron wrapper script
echo ""
echo "--- Creating sync script ---"
cat > "$CRON_SCRIPT" << 'CRON_EOF'
#!/bin/bash
# WeChat sync - called by cron daily
SITE_DIR="/var/www/ori-lin-site"
LOG_FILE="$SITE_DIR/wechat_sync.log"
ENV_FILE="$SITE_DIR/.env"

cd "$SITE_DIR"

# Credentials are local-only and must be provisioned before the cron runs.
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: $ENV_FILE is missing; run setup-wechat-sync.sh again" >> "$LOG_FILE"
    exit 1
fi

# Pull latest code
/usr/bin/git pull origin main >> "$LOG_FILE" 2>&1

# The ignored .env file should survive git pull; fail closed if it does not.
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: $ENV_FILE disappeared after git pull" >> "$LOG_FILE"
    exit 1
fi

# Run sync (draft-only: personal subscription accounts can't auto-publish)
/usr/bin/python3 wechat_sync.py --draft-only >> "$LOG_FILE" 2>&1

# Clean up cover image
rm -f "$SITE_DIR/wechat_cover.png" 2>/dev/null
CRON_EOF
chmod +x "$CRON_SCRIPT"
echo "[OK] Sync script created at $CRON_SCRIPT"

# 8. Add cron job (daily at 22:00)
echo ""
echo "--- Setting up cron job ---"
# Remove existing entry if any
(crontab -l 2>/dev/null | grep -v "wechat-sync" ; echo "0 22 * * * $CRON_SCRIPT") | crontab -
echo "[OK] Cron job added: daily at 22:00 (server time)"

# 9. Test run
echo ""
echo "--- Testing sync (dry-run) ---"
cd "$SITE_DIR"
python3 wechat_sync.py --dry-run 2>&1 | tail -5

echo ""
echo "========================================="
echo "  Setup Complete!"
echo "========================================="
echo ""
if [ -n "$SERVER_IP" ]; then
    echo "NEXT STEP: Add IP $SERVER_IP to WeChat whitelist"
    echo "  mp.weixin.qq.com -> 设置与开发 -> 基本配置 -> IP白名单"
    echo ""
fi
echo "To test full sync (creates draft, personal accounts can't auto-publish):"
echo "  cd $SITE_DIR && python3 wechat_sync.py --draft-only"
echo ""
echo "Cron runs daily at 22:00 server time (draft-only mode)."
echo "Check logs: tail -f $SITE_DIR/wechat_sync.log"
