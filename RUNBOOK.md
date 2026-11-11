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
Backups run automatically at **02:00 and 14:00 IST** (`deploy/crontab.txt`) and before every deploy.
They are saved in `/var/www/o3-car-spaa/backups/`:

| Folder | What | Kept |
|---|---|---|
| `daily/` | every backup (database `.sql.gz` + photos/uploads `.tar.gz`) | 14 days |
| `weekly/` | Sunday copy | 8 weeks |
| `monthly/` | 1st-of-month copy | 12 months |

**Off-server copy (strongly recommended).** If the VPS itself is lost, backups on it are lost too. One-time setup:
```bash
apt-get install -y rclone
rclone config            # create a remote, e.g. "gdrive" (Google Drive) — follow the prompts
# then add to server/.env:
BACKUP_REMOTE=gdrive:o3-backups
```
From then on every backup is also copied there. `GET /api/health` shows `"backup": "ok"` while the last
backup is under 26 hours old (`"stale"` otherwise) — point an uptime monitor (e.g. UptimeRobot keyword "backup\":\"ok") at it.

### Verifying Backup Integrity (Dry-Run Restore)
Runs every Sunday 03:00 automatically; to run now:
```bash
cd /var/www/o3-car-spaa
bash scripts/test-restore.sh
```
*Restores the newest backup into a temporary database, checks every table came back, then drops the temporary database. Production is not touched.*

### Undo an accidental deletion (one record / a few records)
Most deletes in the app are **soft deletes** — open **Super Admin → Recycle Bin** and press Restore. No backup needed.

### Get back a record that was really removed (without overwriting today's work)
```bash
cd /var/www/o3-car-spaa/backups/daily
ls -lt | head                                    # pick the backup from before the mistake
mysql -u root -p -e "CREATE DATABASE o3_recover"
zcat o3_car_spaa_YYYYMMDD_HHMMSS.sql.gz | mysql -u root -p o3_recover
# copy just the rows you need back, e.g. one customer:
mysql -u root -p -e "INSERT INTO o3_car_spa.users SELECT * FROM o3_recover.users WHERE id = 123"
mysql -u root -p -e "DROP DATABASE o3_recover"
```

### Restoring the whole database (disaster recovery — loses changes made after that backup)
```bash
pm2 stop o3-car-spaa-api                         # 1. stop writes
bash scripts/backup.sh                           # 2. backup of the current (bad) state, just in case
cd backups/daily
zcat o3_car_spaa_TARGET.sql.gz | mysql -u root -p o3_car_spa     # 3. restore
tar -xzf o3_uploads_TARGET.tar.gz -C /var/www/o3-car-spaa/server  # 4. photos (optional)
cd /var/www/o3-car-spaa && pm2 start ecosystem.config.js --env production
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
