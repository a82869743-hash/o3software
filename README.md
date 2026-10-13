# O3 Car Spaa — Multi-Franchise Detailing Studio ERP & WhatsApp Hub

[![Node.js Version](https://img.shields.io/badge/Node.js-20.x%20LTS-green.svg)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/MySQL-8.0-blue.svg)](https://www.mysql.com/)
[![React](https://img.shields.io/badge/React-18-cyan.svg)](https://react.dev/)
[![Production Ready](https://img.shields.io/badge/Deployment-Hostinger%20VPS%20Ready-emerald.svg)]()

Production-grade, enterprise Multi-Franchise Automotive Detailing Studio ERP, CRM, Billing Engine, and Inbound Leads Agent designed specifically for **O3 Car Spaa**.

---

## 🌟 Key Features

- **Multi-Tenant Franchise Isolation**: Super Admin HQ view vs. strict per-franchise data scoping (`franchise_id` filtering on all transactions, customers, leads, inventory, and job cards).
- **Pluggable WhatsApp Architecture**: Unified adapter interface supporting **Meta WhatsApp Cloud API** (production default), **AiSensy REST API**, **Baileys Demo Mode** (isolated sandbox), and **Mock Adapter** (automated QA).
- **Inbound AI Leads Agent**: RAG grounded on franchise detailing catalogs, 24-hour customer service window management, auto slot scheduling proposals, and 1-click human takeover.
- **Full Detailing Studio Workflows**: Job cards with stage transitions, vehicle pre-inspection checklist, automated invoice & warranty PDF generation via Puppeteer Chromium, and inventory tracking.
- **Enterprise Observability**: PM2 cluster leader election for background jobs, structured JSON logging with PII phone redactor, and `/api/health` deep telemetry probe.
- **Zero-Downtime Deployment**: Hardened Nginx reverse proxy, automated SSL cert rotation, and idempotent database migration & restore engine.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Backend Runtime** | Node.js 20.x LTS, Express 4.19 |
| **Database** | MySQL 8.0 (InnoDB, `utf8mb4_unicode_ci`, IST `+05:30` timezone) |
| **Realtime Engine** | Socket.io 4.7 (WebSocket & polling fallback) |
| **Document Generation** | Puppeteer 22 (Chromium headless PDF engine) |
| **Frontend SPA** | React 18, Vite 5, TypeScript 5, TailwindCSS, TanStack Query |
| **PWA & Offline** | Web App Manifest, Service Worker (`sw.js`) |
| **Process Manager** | PM2 Cluster Mode (1GB max-memory restart, logrotate) |
| **Reverse Proxy** | Nginx (Let's Encrypt SSL, Gzip, 25MB body limit, rate limiting) |

---

## 📁 Repository Directory Structure

```text
handoff-export/
├── .env.example              # Master 46-variable documented environment template
├── ecosystem.config.js       # PM2 production cluster configuration
├── package.json              # Root workspace convenience scripts
│
├── client/                   # React 18 + Vite TypeScript Frontend SPA
│   ├── dist/                 # Production compiled client bundle
│   ├── public/               # Static assets, PWA manifest.json, sw.js
│   └── src/                  # Components, pages, stores, and API hooks
│
├── server/                   # Express REST API & WebSocket Backend
│   ├── migrations/           # 104 ordered, versioned, idempotent SQL migrations
│   ├── scripts/              # Migration runner, idempotent seed, database utilities
│   ├── src/
│   │   ├── config/           # DB pool, validateEnv.js fail-fast validator
│   │   ├── controllers/      # REST API route controllers
│   │   ├── middleware/       # JWT auth, tenant isolation, rate limiters, requestLogger
│   │   ├── routes/           # Express API endpoints
│   │   └── services/         # WhatsAppManager, LeadsAgentService, NotificationQueue
│   └── test_*.js             # Automated contract, security & acid test suites
│
├── deploy/                   # Hostinger VPS Deployment Package
│   ├── setup-host.sh         # One-shot Ubuntu VPS provisioning script
│   ├── deploy.sh             # Zero-downtime deployment runner with healthcheck
│   ├── rollback.sh           # One-click git rollback script
│   ├── crontab.txt           # Automated backup and certbot renewal schedules
│   ├── nginx/o3carspaa.conf  # Production Nginx SSL reverse proxy configuration
│   └── systemd/              # Systemd unit file template
│
└── scripts/                  # Automated backup, restore verification & security audit
    ├── backup.js / .sh / .ps1
    ├── test_restore.js / .sh / .ps1
    └── security_audit.js
```

---

## ⚡ Quick Start (Local Development)

### 1. Prerequisites
- Node.js 20.x LTS installed
- MySQL 8.0 running locally on port 3306

### 2. Setup Environment
```bash
# Copy documented environment template
cp .env.example .env
# Edit .env with your local MySQL credentials
```

### 3. Install Dependencies & Migrate
```bash
# Install server and client packages
npm install --prefix server
npm install --prefix client

# Run database migrations and seed clean data
npm run db:migrate
npm run db:seed
```

### 4. Start Development Servers
```bash
# Start backend API (Port 5000)
npm run dev --prefix server

# In another terminal, start client Vite dev server (Port 5173)
npm run dev --prefix client
```

---

## 🧪 Testing & Verification

Run any of the automated test suites:

```bash
# Phase 1: Stability & Database Connectivity Test
node server/test_phase1_stability.js

# Phase 2: WhatsApp Adapters Contract & Opt-out Test
node server/test_phase2_whatsapp_adapters.js

# Phase 3: Leads Agent RAG & 50-Message Evaluation Set
node server/test_phase3_leads_agent.js

# Phase 5: Backup, Restore Verification & Secrets Audit
node server/test_phase5_database_security.js

# Phase 6: Full Acid Test & High-Concurrency Benchmark (617 RPS, 0% Error)
node server/test_phase6_full_qa.js
```

---

## 📖 Operational Documentation

- [DEPLOYMENT.md](DEPLOYMENT.md): Step-by-step Hostinger VPS provisioning and cutover guide.
- [RUNBOOK.md](RUNBOOK.md): Day-2 operations, logs inspection, backups, secret rotations, and emergency runbooks.
- [ARCHITECTURE.md](ARCHITECTURE.md): System design, multi-tenant isolation model, and data flow diagrams.
- [WHATSAPP_GUIDE.md](WHATSAPP_GUIDE.md): Meta Cloud API onboarding, AiSensy, Baileys Demo Mode, and pricing breakdown.
- [LEADS_AGENT.md](LEADS_AGENT.md): Inbound AI CRM workflow, prompt templates, RAG groundings, and human handover.
