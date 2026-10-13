#!/usr/bin/env bash
# ==============================================================================
# deploy/setup-host.sh — Hostinger VPS One-Shot Automated Provisioning Script
# Target OS: Ubuntu 22.04 LTS / 24.04 LTS (x86_64)
# Installs: Node.js 20 LTS, MySQL 8.0, PM2, Nginx, Certbot, UFW, Fail2ban, Puppeteer OS Deps
# ==============================================================================

set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

echo "=================================================================="
echo "🚀 O3 CAR SPAA — HOSTINGER VPS AUTOMATED PROVISIONING"
echo "=================================================================="

# Check root privileges
if [ "$(id -u)" -ne 0 ]; then
    echo "❌ This script must be executed as root or with sudo privileges." >&2
    exit 1
fi

# ── 1. Update OS Packages & Basic Utilities ──────────────────────────────────
echo "📦 [1/8] Updating package indices and installing core tools..."
apt-get update -y
apt-get upgrade -y
apt-get install -y \
    curl \
    wget \
    git \
    ufw \
    fail2ban \
    tar \
    gzip \
    unzip \
    jq \
    software-properties-common \
    build-essential \
    ca-certificates \
    gnupg

# ── 2. Configure Firewall (UFW) & Fail2ban ────────────────────────────────────
echo "🛡️ [2/8] Hardening server firewall (UFW & Fail2ban)..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH Access'
ufw allow 80/tcp comment 'HTTP Let’s Encrypt'
ufw allow 443/tcp comment 'HTTPS Production'
ufw --force enable

systemctl enable fail2ban
systemctl restart fail2ban

# ── 3. Install Node.js 20 LTS & PM2 ──────────────────────────────────────────
echo "⚡ [3/8] Installing Node.js 20.x LTS and PM2 Cluster Manager..."
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list

apt-get update -y
apt-get install -y nodejs

# Verify Node & NPM versions
NODE_VER=$(node -v)
NPM_VER=$(npm -v)
echo "   ✓ Node.js installed: ${NODE_VER}"
echo "   ✓ NPM installed: ${NPM_VER}"

# Install PM2 and PM2 log-rotator globally
npm install -g pm2 pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 10
pm2 set pm2-logrotate:compress true

# ── 4. Install & Configure MySQL 8.0 ─────────────────────────────────────────
echo "🗄️ [4/8] Installing MySQL 8.0 Database Server..."
apt-get install -y mysql-server

systemctl enable mysql
systemctl start mysql

# Optimize MySQL configuration for utf8mb4 and IST timezone
cat << 'EOF' > /etc/mysql/conf.d/o3carspaa.cnf
[mysqld]
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
default-time-zone = '+05:30'
max_connections = 150
connect_timeout = 10
wait_timeout = 600
interactive_timeout = 600
EOF

systemctl restart mysql
echo "   ✓ MySQL 8.0 installed and running with utf8mb4 + IST timezone."

# ── 5. Install Nginx & Certbot ────────────────────────────────────────────────
echo "🌐 [5/8] Installing Nginx and Certbot SSL..."
apt-get install -y nginx certbot python3-certbot-nginx

systemctl enable nginx
systemctl start nginx

# ── 6. Install Chromium / Puppeteer OS Dependencies ──────────────────────────
echo "🖨️ [6/8] Installing Puppeteer Chromium OS libraries for PDF billing & warranties..."
apt-get install -y \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    fonts-liberation \
    libappindicator3-1 \
    xdg-utils

# ── 7. Setup Directory Structures & Permissions ──────────────────────────────
echo "📁 [7/8] Creating deployment root and permissions..."
APP_ROOT="/var/www/o3-car-spaa"
mkdir -p "${APP_ROOT}"
mkdir -p "${APP_ROOT}/server/uploads"
mkdir -p "${APP_ROOT}/backups"
mkdir -p "${APP_ROOT}/logs"
mkdir -p "/var/www/certbot"

# Set permissions
chown -R www-data:www-data "${APP_ROOT}" || true
chmod -R 775 "${APP_ROOT}/server/uploads" || true
chmod -R 700 "${APP_ROOT}/backups" || true

# ── 8. Summary & Next Steps ──────────────────────────────────────────────────
echo "=================================================================="
echo "✅ HOST PROVISIONING COMPLETED SUCCESSFULLY!"
echo "=================================================================="
echo "Next steps:"
echo "1. Clone project repository into: /var/www/o3-car-spaa"
echo "2. Copy .env.example to .env and configure secrets"
echo "3. Run deployment script: bash /var/www/o3-car-spaa/deploy/deploy.sh"
echo "=================================================================="
