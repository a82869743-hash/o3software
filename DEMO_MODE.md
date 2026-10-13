# Baileys WhatsApp Demo Mode — Operational Runbook & Safety Checklist

> **CRITICAL DIRECTIVE**: Baileys is an unofficial, reverse-engineered WhatsApp Web library. It carries a significant risk of WhatsApp account ban and protocol breakage. This mode exists **strictly and exclusively** for a **one-time client demonstration** of automated messaging workflows. It must **NEVER** be used in live commercial production.

---

## 1. Built-in Demo Mode Safeguards

The ERP implements defense-in-depth safeguards at the backend adapter layer:

| Safeguard | Implementation & Behavior |
| :--- | :--- |
| **Fail-Closed by Default** | `ENABLE_BAILEYS_DEMO=false` by default. If `NODE_ENV=production` or flag is absent, all Baileys routines are deactivated. Requests automatically fall back to official providers or mock. |
| **Strict Recipient Whitelist** | Message dispatch checks both `process.env.DEMO_WHITELIST` and the franchise database setting. Any message targeting a non-whitelisted number is **aborted immediately** with `[DEMO MODE SAFEGUARD] Sending blocked`. |
| **Bulk Broadcast Suppression** | Bulk marketing blasts and mass campaigns are disabled when Baileys is the active provider. |
| **Human-like Rate Pacing** | Outbound messages are queued through an anti-ban rate limiter with randomized delays between 2,500ms and 6,000ms. |
| **UI Visual Disclosure** | A high-contrast amber banner (`DEMO MODE (Unofficial)`) is displayed persistently across the WhatsApp management views. |
| **Isolated Session Storage** | Authentication credentials reside in `server/sessions/whatsapp/`, which is excluded in `.gitignore` and omitted from database dumps and cloud backups. |
| **One-Click Session Wipe** | The `POST /api/whatsapp/baileys/wipe` endpoint and Admin UI button terminate the WebSocket socket and recursively delete all session tokens from disk. |

---

## 2. Pre-Demo Preparation Checklist

### A. Dedicated Test SIM Card
- [ ] **NEVER** use the owner's personal number or the studio's primary customer phone number.
- [ ] Use a dedicated spare SIM card registered on a test smartphone with WhatsApp installed.
- [ ] Ensure the phone has active cellular/Wi-Fi internet and WhatsApp can send/receive standard messages.

### B. Environment Configuration
Ensure your `server/.env` includes the demo flags and your test numbers:
```env
# Enable demo adapter
ENABLE_BAILEYS_DEMO=true
WHATSAPP_PROVIDER=baileys_demo

# Whitelist: Comma-separated international phone numbers allowed to receive demo messages
DEMO_WHITELIST=919876543210,919123456789
ADMIN_WHATSAPP_NUMBER=919876543210
```

---

## 3. Step-by-Step Demo Execution

### Step 1: Boot the Application
1. Start backend server: `node src/app.js` (or `pm2 start ecosystem.config.js`).
2. Log into the ERP as Super Admin or Franchise Admin.
3. Observe the amber notification banner: `⚠️ DEMO MODE ACTIVE (Unofficial Baileys Engine)`.

### Step 2: Establish Pairing
1. Navigate to **Admin Settings > WhatsApp**.
2. Select **Baileys Demo Mode** tab.
3. Choose your preferred connection method:
   - **QR Code**: Scan the displayed QR code via WhatsApp > Linked Devices > Link a Device.
   - **8-Digit Pairing Code**: Enter the test phone number to receive an 8-character numeric pairing code in the mobile WhatsApp notification.
4. Verify connection status changes to **Connected (demo_active)**.

### Step 3: Run the Demonstration Scenarios
Execute these test flows to demonstrate the ERP automations to your client:
1. **Booking Confirmation**: Create a quick booking for a whitelisted phone number. Confirm instant delivery of formatted booking time, vehicle details, and franchise address.
2. **Job Card Status Update**: Transition a test Job Card to "In Progress" or "Quality Check". Observe status notification with vehicle registration.
3. **Bill / Invoice PDF Delivery**: Finalize a bill and click "Send WhatsApp Invoice". Verify delivery of the generated PDF document attachment.
4. **Whitelist Protection Demonstration**: Attempt to trigger a manual test message to a non-whitelisted number. Observe the clear error response showing the whitelist shield in action.

---

## 4. Post-Demo Teardown & Permanent Session Wipe

Immediately after completing the presentation:

1. In the WhatsApp Admin screen, click **"Disconnect & Wipe Session"**.
2. Confirm the modal prompt.
3. The server immediately:
   - Closes the active Baileys socket.
   - Emits a disconnect event via Socket.io.
   - Recursively deletes the `server/sessions/whatsapp/` directory.
4. On the test smartphone, open **WhatsApp > Linked Devices**, verify the web session is logged out.
5. In `server/.env`, restore:
   ```env
   ENABLE_BAILEYS_DEMO=false
   WHATSAPP_PROVIDER=meta_cloud
   ```
6. Restart the backend process.

---

## 5. Security & Legal Notice

Antigravity and O3 Car Spaa software do not endorse unauthorized commercial scraping or reverse-engineered messaging in production. WhatsApp / Meta Platforms Inc. actively monitors traffic signatures and will permanently blacklist numbers violating their Business Terms of Service. Always transition to the Meta WhatsApp Cloud API or an authorized BSP (AiSensy) prior to public rollout as documented in [CUTOVER.md](file:///c:/Users/Divya/Desktop/handoff-export/CUTOVER.md).
