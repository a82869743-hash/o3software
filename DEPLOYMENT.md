# O3 Car Spaa — Hostinger VPS Deployment Guide

Complete step-by-step production deployment manual from a fresh **Hostinger KVM VPS** running Ubuntu 22.04 LTS to a live, SSL-secured application on your custom domain.

---

## 📋 Pre-Deployment Checklist

Before beginning, ensure you have:
1. **Hostinger KVM VPS Plan**: Minimum 2 vCPU, 4GB RAM, Ubuntu 22.04 / 24.04 LTS 64-bit.
2. **Domain DNS Access**: A-records pointing to your Hostinger VPS Public IP:
   - `app.o3carspaa.com` ➔ `<VPS_IP>`
   - `api.o3carspaa.com` ➔ `<VPS_IP>`
3. **Database Credentials**: Secure password chosen for production MySQL `o3_car_spa` user.
4. **Git Repository Access**: SSH deploy key or HTTPS access token.

---

## 🚀 Step 1: Initial Server Connection & Host Provisioning

Connect to your VPS via SSH as `root`:

```bash
ssh root@<YOUR_VPS_IP>
```

Clone the repository or upload the release package into `/var/www/o3-car-spaa`:

```bash
mkdir -p /var/www/o3-car-spaa
cd /var/www/o3-car-spaa
git clone <YOUR_GIT_REPO_URL> .
```

Make all deployment scripts executable and run the automated host provisioning:

```bash
chmod +x deploy/*.sh scripts/*.sh
sudo bash deploy/setup-host.sh
```

> **What `setup-host.sh` does automatically:**
> - Updates all system packages (`apt-get upgrade`)
> - Configures UFW firewall (permitting only ports 22, 80, and 443)
> - Installs Node.js 20.x LTS, PM2 cluster manager, and PM2 log rotation
> - Installs MySQL 8.0 configured for `utf8mb4` and Indian Standard Time (`+05:30`)
> - Installs Nginx and Certbot
> - Installs Chromium headless OS dependencies required for Puppeteer PDF invoice rendering

---

## 🗄️ Step 2: Configure Production MySQL Database

Log in to the local MySQL root shell:

```bash
sudo mysql
```

Execute the following commands (replace `YOUR_SECURE_DB_PASSWORD` with a strong 24+ character password):

```sql
CREATE DATABASE IF NOT EXISTS o3_car_spa CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'o3_prod_user'@'localhost' IDENTIFIED BY 'YOUR_SECURE_DB_PASSWORD';
GRANT ALL PRIVILEGES ON o3_car_spa.* TO 'o3_prod_user'@'localhost';
FLUSH PRIVILEGES;

EXIT;
```

---

## ⚙️ Step 3: Configure Environment Variables

Copy the master environment template:

```bash
cd /var/www/o3-car-spaa
cp .env.example .env
```

Edit `.env` using `nano`:

```bash
nano .env
```

Ensure the following critical production variables are set:

```ini
# Environment Target
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://app.o3carspaa.com

# Database Connection
DB_HOST=localhost
DB_PORT=3306
DB_NAME=o3_car_spa
DB_USER=o3_prod_user
DB_PASSWORD=YOUR_SECURE_DB_PASSWORD
DB_TIMEZONE=+05:30

# Security Secrets (Generate using: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_SECRET=YOUR_64_CHAR_HEX_SECRET_KEY
ENCRYPTION_KEY=YOUR_64_CHAR_HEX_ENCRYPTION_KEY

# Storage Driver (local or cloudinary)
STORAGE_DRIVER=local
UPLOADS_DIR=/var/www/o3-car-spaa/server/uploads

# WhatsApp Production Provider
WHATSAPP_PROVIDER=meta_cloud
ENABLE_BAILEYS_DEMO=false

# Meta WhatsApp Cloud API (From Meta Developers Portal)
META_WA_PHONE_NUMBER_ID=YOUR_PHONE_NUMBER_ID
META_WA_BUSINESS_ACCOUNT_ID=YOUR_WABA_ID
META_WA_ACCESS_TOKEN=YOUR_SYSTEM_USER_PERMANENT_ACCESS_TOKEN
META_WA_WEBHOOK_VERIFY_TOKEN=YOUR_WEBHOOK_VERIFY_TOKEN
```

Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X`). Secure the file permissions:

```bash
chmod 600 /var/www/o3-car-spaa/.env
```

---

## 📦 Step 4: Install Dependencies & Run Database Migrations

Install dependencies and run migrations:

```bash
cd /var/www/o3-car-spaa
npm install --prefix server --omit=dev
npm install --prefix client

# Load the clean studio data (staff logins, services, prices, packages, stock, roles, settings).
# Copy these two files from the PC's backups/golive/ folder to /root/ first (WinSCP or scp):
#   o3_golive_clean_20261111.sql   o3_golive_uploads.tar.gz
mysql -u o3_prod_user -p o3_car_spa < /root/o3_golive_clean_20261111.sql
tar -xzf /root/o3_golive_uploads.tar.gz -C /var/www/o3-car-spaa/server   # product pictures + UPI QR

# Records the schema as current. Later deploys run only NEW migration files, once each.
npm run db:migrate --prefix server

# Do NOT run db:seed or scripts/seed_*.js on the live server: they add test logins and old sample data.
```

Build the optimized client bundle:

```bash
npm run build --prefix client
```

---

## 🌐 Step 5: Configure Nginx & Let's Encrypt SSL

Copy the production Nginx site configuration:

```bash
sudo cp deploy/nginx/o3carspaa.conf /etc/nginx/sites-available/o3carspaa.conf
sudo ln -sf /etc/nginx/sites-available/o3carspaa.conf /etc/nginx/sites-enabled/o3carspaa.conf
sudo rm -f /etc/nginx/sites-enabled/default
```

Obtain free Let's Encrypt SSL certificates:

```bash
sudo certbot --nginx -d app.o3carspaa.com -d api.o3carspaa.com --non-interactive --agree-tos -m admin@o3carspaa.com
```

Test and reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## ⚡ Step 6: Start Application with PM2 Cluster

Start the application cluster under PM2:

```bash
cd /var/www/o3-car-spaa
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup systemd
```

Copy and run the `sudo env PATH=...` command generated by `pm2 startup` to enable auto-boot on system restarts.

Verify cluster status:

```bash
pm2 status
```

---

## ⏰ Step 7: Configure Automated Backups & Cron Schedule

Install the automated backup crontab schedule:

```bash
crontab /var/www/o3-car-spaa/deploy/crontab.txt
```

Verify crontab is active:

```bash
crontab -l
```

---

## ✅ Step 8: Post-Deployment Smoke Test

Verify the application health endpoint:

```bash
curl -I https://app.o3carspaa.com
curl https://api.o3carspaa.com/api/health
```

Expected JSON response:
```json
{
  "status": "healthy",
  "message": "O3 Car Spaa API is running",
  "database": {
    "status": "connected",
    "latencyMs": 2
  },
  "pm2_worker_id": "0",
  "cluster_mode": true
}
```

Congratulations! Your O3 Car Spaa ERP platform is now 100% live and production-ready on Hostinger VPS!
