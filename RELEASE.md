# Release Documentation: GK AutoHerb Detaining Bay Studio System

**Version**: `v1.0.0`  
**Release Date**: `June 28, 2026`  

---

## 1. System Requirements
- **Node.js**: v18.x or higher (v24.x tested and compatible)
- **Database**: MySQL 8.0+
- **PDF Engine**: Chromium/Chrome browser (required by Puppeteer for HTML-to-PDF rendering)

---

## 2. Installation & Quick Start

Follow these steps for a clean installation:

### Step 1: Clone the Repository
```bash
git clone <repository_url>
cd Software
```

### Step 2: Install Dependencies
Install dependencies for both the frontend client and the backend server:
```bash
# Install root/general dev tools
npm install

# Install client packages
cd client
npm install

# Install server packages
cd ../server
npm install
```

### Step 3: Configure Environment Variables
Copy the env template inside the server folder and populate secrets:
```bash
cp .env.example .env
```
Ensure database credentials, JWT secret, and the exact absolute path to your local Chrome/Chromium executable (`PUPPETEER_EXECUTABLE_PATH`) are provided.

### Step 4: Database Initialization
Initialize tables and constraints:
```bash
# From server folder
npm run migrate
```

To seed development/test data (e.g., test logins and sample services):
```bash
# From server folder (Development only)
npm run seed
```

### Step 5: Build Frontend Production Assets
Compile the React TypeScript app into compressed static files:
```bash
# From client folder
npm run build
```
This produces optimized production assets inside `client/dist`.

### Step 6: Start Server
Start the production server:
```bash
# From server folder
npm start
```

---

## 3. Environment Variables (.env)

The backend server is configured via the `.env` file inside the `server/` directory:

| Variable Name | Description | Required | Default Value |
| :--- | :--- | :--- | :--- |
| `DB_HOST` | MySQL server hostname | Yes | `127.0.0.1` |
| `DB_PORT` | MySQL port | Yes | `3306` |
| `DB_NAME` | MySQL database name | Yes | `o3_car_spa` |
| `DB_USER` | MySQL user | Yes | `root` |
| `DB_PASSWORD` | MySQL password | Yes | |
| `JWT_SECRET` | Secret token to sign and verify JWT authorization | Yes | |
| `JWT_EXPIRES_IN` | JWT token lifetime | Yes | `7d` |
| `CLIENT_URL` | Frontend client origin (CORS allowance) | Yes | `http://localhost:5173` |
| `SERVER_URL` | Self server origin | Yes | `http://localhost:5000` |
| `NODE_ENV` | Environment identifier (`production`/`development`) | Yes | `development` |
| `PORT` | Backend port | Yes | `5000` |
| `PUPPETEER_EXECUTABLE_PATH` | Path to local Chrome/Chromium binary | Yes | |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary name for image hosting | No | |
| `CLOUDINARY_API_KEY` | Cloudinary API Key | No | |
| `CLOUDINARY_API_SECRET` | Cloudinary Secret Key | No | |
| `MSG91_AUTH_KEY` | MSG91 / 2Factor SMS portal authentication key | No | |
| `RAZORPAY_KEY_ID` | Razorpay API Key ID for orders | No | |
| `RAZORPAY_KEY_SECRET` | Razorpay API Secret Key | No | |

---

## 4. Deployment Checklist
1. **Security Settings**: Ensure `NODE_ENV` is set to `production`. Mocks, local bypasses, and fake transaction features are disabled in this mode.
2. **Directory Permissions**: Grant write access to the uploads folder so static images can be read/stored if Cloudinary is not used:
   ```bash
   chmod -R 755 server/public/uploads
   ```
3. **Reverse Proxy (Nginx)**: Configure Nginx to route `/api` and `/uploads` to port 5000, and serve `client/dist` static files directly.
4. **SSL/HTTPS**: Terminate SSL at the Nginx reverse-proxy level. Set `secure: true` on cookies and socket handshakes.
5. **Process Manager**: Use PM2 to run the server in cluster mode for auto-restart on crashes:
   ```bash
   pm2 start server/src/app.js --name gk-autoherb-api
   ```

---

## 5. Database Backup and Restore

### Backup Procedure
To perform a hot backup of the MySQL database:
```bash
mysqldump -u <DB_USER> -p<DB_PASSWORD> o3_car_spa > backup_$(date +%F).sql
```

### Restore Procedure
To restore from a backup file:
```bash
mysql -u <DB_USER> -p<DB_PASSWORD> o3_car_spa < backup_file.sql
```

---

## 6. Rollback Procedure
If a deployment fails:
1. Revert the codebase to the previous stable release tag:
   ```bash
   git checkout tags/vX.Y.Z
   ```
2. Re-run client asset compilation:
   ```bash
   cd client && npm run build
   ```
3. If database migrations changed schemas incompatibly, restore the database from the backup snapshot captured immediately before deployment:
   ```bash
   mysql -u root -p o3_car_spa < pre_deploy_backup.sql
   ```
4. Restart the API process:
   ```bash
   pm2 restart gk-autoherb-api
   ```

---

## 7. Known Limitations
- **Vulnerable Packages**:
  - `xlsx` (SheetJS) contains a moderate prototype pollution vulnerability that does not affect current server operations, but has no official security fix.
  - `esbuild` contains a moderate dev-server vulnerability which is not active in the production build output.
- **In-Memory Rate Limiting**: The rate-limiter is stored in-memory. If the server node process restarts or scales horizontally across multiple servers, the rate-limits will reset per instance. For cluster deployments, configure a Redis-backed rate-limiter store.
