# WhatsApp Production Cutover Guide — Meta Cloud API & AiSensy

This guide documents the complete end-to-end migration process from the temporary Baileys Demo Mode to an official, Meta-approved WhatsApp Business API integration (Meta Cloud API direct or AiSensy BSP).

---

## 1. Architectural Architecture & Zero-Code Switch

The O3 Car Spaa ERP is built with a pluggable adapter pattern orchestrated by `WhatsAppManager`:

```
               ┌────────────────────────────────────────────────────────┐
               │               O3 Car Spaa Notifications                │
               │  (Booking Reminders, Job Cards, Invoices, Warranties)  │
               └──────────────────────────┬─────────────────────────────┘
                                          │
                                          ▼
                         ┌─────────────────────────────────┐
                         │         WhatsAppManager         │
                         │   • Opt-out Gate (STOP)         │
                         │   • Franchise Isolation         │
                         │   • Cost & Usage Accounting     │
                         └────────────────┬────────────────┘
                                          │
       ┌──────────────────┬───────────────┴───────────────┬──────────────────┐
       ▼                  ▼                               ▼                  ▼
┌──────────────┐   ┌──────────────┐              ┌─────────────────┐   ┌──────────────┐
│  meta_cloud  │   │   aisensy    │              │  baileys_demo   │   │     mock     │
│ Direct Graph │   │ Official BSP │              │ Gated Demo Only │   │ Automated QA │
│ (Recommended)│   │  Dashboard   │              │   (Temporary)   │   │  Staging CI  │
└──────────────┘   └──────────────┘              └─────────────────┘   └──────────────┘
```

**Switching providers requires ZERO code modifications.** It is executed instantly via environment variables or the Admin UI Settings panel.

---

## 2. External Prerequisites (Outside the Code)

Before activating official messaging, complete these mandatory prerequisites with Meta:

### A. Dedicated Business Phone Number
- **Requirement**: A phone number that can receive an SMS or voice OTP for verification.
- **Critical Rule**: The number **cannot be currently registered** on any personal or business WhatsApp app. If it is already on WhatsApp, you must open WhatsApp on the phone, go to **Settings > Account > Delete my account** prior to linking it to the API.

### B. Meta Business Portfolio Verification
1. Navigate to [Meta Business Suite](https://business.facebook.com/).
2. Under **Business Settings > Security Center**, submit verification documents:
   - Certificate of Incorporation or GST Registration Certificate.
   - Utility bill or bank statement showing legal business name and physical address matching your license.
   - Official website domain (`o3carspaa.com`).

### C. Meta Developer App Setup (For Direct Meta Cloud API)
1. Go to [Meta for Developers](https://developers.facebook.com/) and create a new App of type **Business**.
2. Add the **WhatsApp** product.
3. In **WhatsApp > API Setup**, link your verified WhatsApp Business Account (WABA).
4. Register your phone number and complete the 6-digit SMS verification.
5. Record your identifiers:
   - **Phone Number ID**: (e.g. `104829102948192`)
   - **WhatsApp Business Account ID**: (e.g. `204810293847192`)
6. In **Business Settings > Users > System Users**:
   - Create a System User (role: Admin).
   - Generate a permanent token with permissions: `whatsapp_business_messaging`, `whatsapp_business_management`.
   - Copy this permanent token.

### D. Webhook Configuration
1. In Meta App Settings > WhatsApp > Configuration:
   - **Callback URL**: `https://your-domain.com/api/whatsapp/webhook`
   - **Verify Token**: A secure random secret matching `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in your server `.env`.
2. Under Webhook Fields, subscribe to:
   - `messages` (inbound chats & STOP opt-outs)
   - `message_template_status_update` (template approvals)

---

## 3. Pre-Approved Official Message Templates

Official WhatsApp accounts require pre-approved templates for business-initiated conversations. Create these in Meta WhatsApp Manager or AiSensy:

### 1. Booking Confirmation (`BOOKING_CONFIRMED`)
* **Category**: `UTILITY`
* **Body**:
  ```text
  Hello {{1}}, your car detailing session for {{2}} is confirmed at O3 Car Spaa on {{3}} at {{4}}. Booking ID: #{{5}}. Thank you for choosing us!
  ```

### 2. Service Complete (`SERVICE_COMPLETED`)
* **Category**: `UTILITY`
* **Body**:
  ```text
  Dear {{1}}, great news! The detailing service for your vehicle {{2}} is completed and ready for pickup at O3 Car Spaa. Job Card: {{3}}.
  ```

### 3. Invoice & Bill Delivery (`INVOICE_BILL`)
* **Category**: `UTILITY`
* **Header**: Document (PDF attached dynamically)
* **Body**:
  ```text
  Dear {{1}}, please find attached your official tax invoice #{{2}} for amount ₹{{3}}. Thank you for your patronage!
  ```

### 4. Warranty Certificate (`WARRANTY_CERTIFICATE`)
* **Category**: `UTILITY`
* **Header**: Document (PDF attached dynamically)
* **Body**:
  ```text
  Dear {{1}}, congratulations! Your Ceramic / PPF coating warranty certificate #{{2}} for {{3}} is now active. Document attached below.
  ```

---

## 4. One-Click Cutover Execution

### Method 1: Via Admin UI (Zero Restart)
1. Log into ERP as **Super Admin** or **Franchise Admin**.
2. Go to **Settings > WhatsApp Management**.
3. Select **Provider Configuration** tab.
4. Set Provider dropdown to `Meta Cloud API (Official)` or `AiSensy BSP`.
5. Enter:
   - **Phone Number ID**: Your Meta Phone Number ID
   - **Business Account ID**: Your WABA ID
   - **Access Token**: Your Meta System User Permanent Token (stored encrypted via AES-256-GCM)
6. Click **Save & Test Connection**.
7. The system sends a live test ping and displays the verified business quality rating.

### Method 2: Via Server Environment (`.env`)
Update `/server/.env`:
```env
# Switch provider to Meta Cloud
WHATSAPP_PROVIDER=meta_cloud
ENABLE_BAILEYS_DEMO=false

# Meta Cloud Credentials
WHATSAPP_PHONE_NUMBER_ID=104829102948192
WHATSAPP_BUSINESS_ACCOUNT_ID=204810293847192
WHATSAPP_ACCESS_TOKEN=EAAG...your_permanent_system_user_token...
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_secure_verify_secret
```
Restart server process: `pm2 reload ecosystem.config.js`.

---

## 5. Instant Rollback Procedure

If an external Meta outage or API credential issue occurs during production launch:
1. **Instant UI Rollback**: Switch Provider dropdown to `mock` in Admin Settings. The ERP will safely log all outgoing messages in database logs without throwing runtime exceptions to customers.
2. **Revert to Demo**: If needed for emergency client visual testing, switch to `baileys_demo` (provided `ENABLE_BAILEYS_DEMO=true`).
3. Database records and queued notifications are preserved; no messages or customer histories are destroyed.
