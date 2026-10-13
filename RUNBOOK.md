# O3 Car Spaa — Day-2 Operations Runbook

Operational procedures, monitoring commands, secret rotation runbooks, and disaster recovery playbooks for Hostinger VPS production.

---

## 📑 Quick Reference Commands

| Task | Command |
| :--- | :--- |
| **Check App Status** | `pm2 status` |
| **View Realtime Logs** | `pm2 logs o3-car-spaa-api` |
| **Zero-Downtime Reload** | `pm2 reload ecosystem.config.js --env production` |
| **Check Health Endpoint** | `curl -s http://127.0.0.1:5000/api/health \| jq .` |
| **Run Manual Backup** | `bash /var/www/o3-car-spaa/scripts/backup.sh` |
| **Test Backup Integrity** | `bash /var/www/o3-car-spaa/scripts/test-restore.sh` |
| **Nginx Access Logs** | `tail -f /var/log/nginx/access.log` |
| **Nginx Error Logs** | `tail -f /var/log/nginx/error.log` |
| **Check MySQL Status** | `systemctl status mysql` |

---

## 🔍 1. Viewing Logs & Telemetry

### Application & PM2 Logs
- Stream all cluster workers:
  ```bash
  pm2 logs o3-car-spaa-api --lines 100
  ```
- Inspect raw stdout logs (structured JSON):
  ```bash
  tail -f /var/www/o3-car-spaa/logs/pm2-out.log
  ```
- Inspect application error log:
  ```bash
  tail -f /var/www/o3-car-spaa/logs/pm2-error.log
  ```

### Nginx Logs
- Monitor incoming HTTP/HTTPS traffic & rate-limited requests:
  ```bash
  tail -f /var/log/nginx/access.log
  ```
- Filter rate-limited requests:
  ```bash
  grep "limiting requests" /var/log/nginx/error.log
  ```

---

## 🔄 2. Zero-Downtime Deployments & Restarts

When deploying new code updates or configuration adjustments:

```bash
cd /var/www/o3-car-spaa
sudo bash deploy/deploy.sh
```

To gracefully reload without deploying code:
```bash
pm2 reload ecosystem.config.js --env production
```
*PM2 cluster mode reloads workers sequentially with a 5000ms grace window, ensuring zero in-flight customer transactions are interrupted.*

---

## 💾 3. Backup & Restore Operations

### Taking an Immediate Manual Backup
```bash
cd /var/www/o3-car-spaa
bash scripts/backup.sh
```
*Backups are saved to `/var/www/o3-car-spaa/backups/o3_car_spaa_YYYYMMDD_HHMMSS.sql.gz` and automatically rotated (last 7 daily backups retained).*

### Verifying Backup Integrity (Dry-Run Restore)
To prove the backup is healthy without touching production:
```bash
cd /var/www/o3-car-spaa
bash scripts/test-restore.sh
```
*This restores the latest snapshot into a temporary database `o3_car_spa_restore_test`, verifies row counts across all 119 tables against primary DB, and tears down the temporary database.*

### Restoring a Backup to Production (Disaster Recovery)
If database recovery is required:
```bash
# 1. Stop application to prevent inbound writes
pm2 stop o3-car-spaa-api

# 2. Decompress target backup
cd /var/www/o3-car-spaa/backups
gunzip -k o3_car_spaa_TARGET_FILE.sql.gz

# 3. Restore snapshot into MySQL
mysql -u o3_prod_user -p o3_car_spa < o3_car_spaa_TARGET_FILE.sql

# 4. Restart application
pm2 start ecosystem.config.js --env production
```

---

## 🔑 4. Zero-Downtime Secret Rotation

### Rotating JWT_SECRET
1. Generate new 64-character secret:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Update `JWT_SECRET` in `.env`.
3. Reload cluster:
   ```bash
   pm2 reload ecosystem.config.js --env production
   ```
*Active user sessions will be prompted to re-authenticate with their credentials.*

### Rotating MySQL Database Password
1. In MySQL shell:
   ```sql
   ALTER USER 'o3_prod_user'@'localhost' IDENTIFIED BY 'NEW_STRONG_PASSWORD';
   FLUSH PRIVILEGES;
   ```
2. Update `DB_PASSWORD=NEW_STRONG_PASSWORD` in `.env`.
3. Reload cluster:
   ```bash
   pm2 reload ecosystem.config.js --env production
   ```

---

## 📱 5. Switching WhatsApp Providers

The platform supports hot provider switching via `.env` or the Super Admin UI:

### Option A: Meta WhatsApp Cloud API (Production Default)
In `.env`:
```ini
WHATSAPP_PROVIDER=meta_cloud
ENABLE_BAILEYS_DEMO=false
META_WA_PHONE_NUMBER_ID=...
META_WA_ACCESS_TOKEN=...
```
Reload: `pm2 reload ecosystem.config.js --env production`.

### Option B: AiSensy BSP
In `.env`:
```ini
WHATSAPP_PROVIDER=aisensy
AISENSY_API_KEY=...
```
Reload: `pm2 reload ecosystem.config.js --env production`.

### Option C: Baileys Demo Mode (Isolated Client Demo)
In `.env`:
```ini
WHATSAPP_PROVIDER=baileys_demo
ENABLE_BAILEYS_DEMO=true
DEMO_PHONE_WHITELIST=917225030303,919876543210
```
Reload: `pm2 reload ecosystem.config.js --env production`.
*When demo finishes, click "Wipe Demo Session" in Admin Settings or call `POST /api/whatsapp/baileys/wipe` to delete disk session tokens.*

---

## 🚨 6. Troubleshooting Playbooks

### Issue 1: Database Connection Refused (`ECONNREFUSED 3306`)
- Verify MySQL service is running:
  ```bash
  systemctl status mysql
  ```
- If stopped, check disk space (`df -h`) and restart:
  ```bash
  systemctl restart mysql
  ```

### Issue 2: PM2 Crash Loops (`ER_NO_DEFAULT_FOR_FIELD` or Uncaught Exception)
- Check last 50 lines of crash log:
  ```bash
  pm2 logs o3-car-spaa-api --err --lines 50
  ```
- If a migration was missed:
  ```bash
  npm run db:migrate --prefix server
  pm2 reload ecosystem.config.js --env production
  ```

### Issue 3: High Memory Usage (> 900MB on Worker)
- PM2 automatically recycles workers exceeding `max_memory_restart: 1G`.
- To manually clear cached memory:
  ```bash
  pm2 reload ecosystem.config.js --env production
  ```

### Issue 4: Disk Space Running Low on `/`
- Check largest directories:
  ```bash
  du -sh /var/www/o3-car-spaa/*
  ```
- Prune old backups older than 7 days (handled automatically by `backup.sh`).
- Flush old PM2 logs:
  ```bash
  pm2 flush
  ```

---

## 🆘 7. Emergency Procedures

### Scenario A: Compromised API Key or Database Secret
1. Immediately generate new credential on provider portal (Meta, Cloudinary, MySQL).
2. Update `.env`.
3. Execute graceful cluster reload: `pm2 reload ecosystem.config.js --env production`.
4. Check Git log to ensure secret was not committed: `git log -S "LEAKED_KEY"`.

### Scenario B: Accidental Data Deletion or Table Corruption
1. Check available snapshots: `ls -lh /var/www/o3-car-spaa/backups`.
2. Follow **Restoring a Backup to Production** in Section 3 above.

### Scenario C: Complete VPS Hardware Failure (Total Server Recovery)
1. Provision new Hostinger VPS with Ubuntu 22.04 LTS.
2. Run `setup-host.sh` as documented in [DEPLOYMENT.md](DEPLOYMENT.md).
3. Restore database from offsite backup archive.
4. Update DNS A-records to new VPS IP.
5. Re-run `certbot --nginx` to issue SSL certificates.
