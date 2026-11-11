# O3 Car Spaa — Integrations Setup (WhatsApp · Email · OTP · AI Leads Agent)

All code is in place. **Only API keys are missing.** You put the keys in `server/.env` and restart the server (`pm2 reload all`). Then open **Admin → Settings → Integrations** (super admin only). It shows what is connected and has a **Test** button for each service.

Without a key, each feature still works safely:
- WhatsApp and email are only logged (sandbox).
- OTPs print in the server console.
- The AI agent uses built-in rule-based replies.

---

## 1. What to use (cheapest and safest choice)

| Feature | Recommended | Why | Approx. cost* |
|---|---|---|---|
| WhatsApp (all notifications, auto-replies, inbox) | **Meta WhatsApp Cloud API, connected directly** | Official, so there is no ban risk. No monthly fee. Already coded. | Replies to a customer within 24h of their message are **free**. Business-started *utility* messages (job updates, invoices, reminders) cost about ₹0.12 each. *Marketing* messages cost about ₹0.80 each. |
| Email (invoices, reports) | **Your Hostinger domain mailbox** (e.g. notifications@o3carspaa.com), or a **Gmail app password** | Free. The domain mailbox lands in inboxes better. | ₹0 (Gmail limit about 500 emails/day) |
| OTP SMS (login, register, forgot password only) | **2Factor.in** (MSG91 is supported as an alternative) | Cheapest Indian OTP route. Already coded. | About ₹0.15–0.25 per SMS. One-time DLT registration is needed. |
| AI leads agent and WhatsApp auto-reply | **Claude API, model `claude-haiku-5-5`** | Very cheap, good Hinglish and Gujarati-English, fast. You can switch to `claude-opus-5-5` for the smartest replies by changing one line. | Haiku: about $0.10 / $0.50 per million input/output tokens. That is roughly **₹0.05 per reply**, or about ₹100–200/month for 2–3k chats. |
| AI alternative | OpenAI `gpt-4o-mini` | Also supported. Set `OPENAI_API_KEY`. | Similar cost |

\*Prices change. Check Meta's WhatsApp rate card for India, Anthropic's pricing page, and your SMS provider's dashboard.

**Not recommended:**
- **Baileys / WhatsApp-Web demo** (`ENABLE_BAILEYS_DEMO`). It is unofficial, and Meta can ban the number. Use it for demos only and keep it `false` in production.
- **AiSensy / Interakt / WATI.** They work, but add ₹1,500–3,500/month on top of Meta's charges, with no real benefit, because the CRM already has the inbox, templates and automation.

---

## 2. Should the leads / WhatsApp agent live inside the CRM or separately?

**Keep it inside the CRM. This is already how it is built.**

- **It needs CRM data.** The agent has to know customers, cars, bookings, prices, packages and the knowledge base. Inside the CRM it reads them directly. A separate bot would need to sync all of this, and it would go out of date.
- **One WhatsApp number, one webhook, one inbox.** Staff see AI and human chats together in the Unified Inbox. They can take over a chat (agent mode) and every lead lands in Leads automatically.
- **Cheaper and simpler.** There is one server, one deployment and one bill. Running it separately would mean a second server, a second database and an integration to maintain.
- **It is still isolated where it matters:**
  - the agent code is its own module (`server/src/services/ai/`);
  - the webhook answers Meta instantly and processes afterwards;
  - if the AI vendor fails, it falls back to rule-based replies;
  - the follow-up cron runs on one PM2 instance only.

Move it to a separate service only if you later run many brands, or handle thousands of chats per hour.

---

## 3. Step-by-step setup

### 3.1 WhatsApp — Meta Cloud API (about 1–3 days, mostly Meta's verification)

1. **Create the Meta business and app.**
   - Create or verify a **Meta Business Portfolio** at business.facebook.com, with the business name, GST and website.
   - At developers.facebook.com, choose **Create App → Business** and add the **WhatsApp** product.
2. **Add your number.** Go to WhatsApp → API Setup → **Add phone number**.
   - Use a number that is **not** currently on the WhatsApp app, or delete WhatsApp from it first.
   - Verify it by SMS or call.
   - Set the display name to "O3 Car Spaa".
3. **Copy the two IDs** into `.env`:
   ```
   WHATSAPP_PHONE_NUMBER_ID=...
   WHATSAPP_BUSINESS_ACCOUNT_ID=...
   ```
   *(Or enter the IDs and token in **Admin → WhatsApp → Settings**. They are stored encrypted for each franchise and override `.env`.)*
4. **Create a permanent token.**
   - Go to Business Settings → Users → **System users** → Add (Admin).
   - Choose **Add assets** → your app and your WhatsApp account (full control).
   - Choose **Generate token** with the permissions `whatsapp_business_messaging` and `whatsapp_business_management`, and expiry **Never**. Then set:
   ```
   WHATSAPP_ACCESS_TOKEN=EAAG...
   ```
5. **Copy the app secret** from App → Settings → Basic → App secret:
   ```
   WHATSAPP_APP_SECRET=...
   ```
6. **Connect the webhook.**
   - Go to WhatsApp → Configuration → Webhook → Edit, and enter:
     - Callback URL: `https://api.YOURDOMAIN/api/whatsapp/webhook` (your live API domain, with HTTPS)
     - Verify token: any long random string. Use the same value in `.env`: `WHATSAPP_WEBHOOK_VERIFY_TOKEN=...`
   - Then choose **Manage → subscribe to `messages`**.
7. **Create the message template.** Go to WhatsApp Manager → Message templates → Create:
   - Name: `o3_service_update`
   - Category: **Utility**
   - Language: **English**
   - Body: `Hi {{1}}, {{2}} — O3 Car Spaa`
   - Samples: `{{1}}` = `Rahul`; `{{2}}` = `your car GJ06AB1234 is ready for delivery. Invoice: https://…`
   - After it is approved, keep these in `.env` (they are the defaults):
     ```
     WHATSAPP_UTILITY_TEMPLATE=o3_service_update
     WHATSAPP_TEMPLATE_LANG=en
     ```
   - The system **automatically** chooses how to send:
     - **free text** if the customer messaged in the last 24h;
     - **this template** otherwise, with the message inserted as `{{2}}`.
   - You do not need a separate template per message.
8. **Payment.** Add a payment method in WhatsApp Manager → Settings → Payment.
9. **Test.** Restart the server, open Settings → Integrations, and run **WhatsApp Test** with your own number.
   - Then send "Hi" from your phone to the business number. The AI agent should reply, and the chat should appear in the Unified Inbox and Leads.

### 3.2 Email — SMTP (10 minutes)

**Option A — Hostinger mailbox (recommended):**
```
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=notifications@o3carspaa.com
SMTP_PASS=<mailbox password>
SMTP_FROM="O3 Car Spaa" <notifications@o3carspaa.com>
```
Also add SPF and DKIM DNS records from Hostinger's email panel, so mail does not go to spam.

**Option B — Gmail:**
1. Turn on 2-step verification.
2. Go to myaccount.google.com → **App passwords** and create one called "O3 CRM".
3. Set:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=yourgmail@gmail.com
SMTP_PASS=<16-letter app password>
SMTP_FROM="O3 Car Spaa" <yourgmail@gmail.com>
```
To test, open Settings → Integrations and run **Email Test**.

### 3.3 OTP SMS — 2Factor.in (DLT takes 2–7 days)

1. **DLT registration (mandatory in India for any SMS).**
   - Register as Principal Entity on a DLT portal (e.g. Jio TrueConnect or Vilpower). It costs about ₹5,900 one-time.
   - Register the sender ID / header, e.g. `OTHREE`.
   - Register an OTP content template, e.g.: `{#var#} is your O3 Car Spaa verification code. Valid for 10 minutes. Do not share it with anyone.`
2. **Set up 2Factor.**
   - Sign up at 2factor.in and add your DLT entity ID, header and template in their dashboard.
   - Add credit.
3. Fill in `.env`:
   ```
   OTP_PROVIDER=2factor
   TWOFACTOR_API_KEY=<your 2Factor API key>
   TWOFACTOR_TEMPLATE=<template name as saved in 2Factor, optional>
   ```
   *(MSG91 instead: `OTP_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_OTP_TEMPLATE_ID`.)*
4. To test, open Settings → Integrations and run **OTP Test**. Then try "Login with OTP" on the app.

OTPs are generated and checked in our own database (6 digits, expiry, cooldown, attempt limit). The SMS provider only delivers them, so you can switch provider at any time.

### 3.4 AI leads agent — Claude API (5 minutes)

1. Go to console.anthropic.com → sign up → **Billing** (add about $5 credit and set a monthly spend limit) → **API keys → Create key**.
2. Fill in `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ANTHROPIC_MODEL=claude-haiku-5-5     # cheapest; use claude-opus-5-5 for best quality
   ANTHROPIC_EFFORT=low
   AI_PROVIDER=                         # blank = auto-detect
   ```
3. Fill in **Admin → Leads Agent → Knowledge Base**: services, prices, timings, address, FAQs. The agent answers only from this information and the CRM's live data.
4. To test, open Settings → Integrations and run **AI Test**. The reply appears on screen.

What the agent does once the keys are in:
- Answers WhatsApp messages from new and existing customers.
- Creates and updates leads.
- Hands the chat to staff when asked, or when it is unsure.
- Runs follow-up messages through the cron.

If the AI key is missing or the vendor is down, it falls back to rule-based replies.

### 3.6 AI pictures for new services & packages — Google Gemini (optional, 5 minutes)
Without this key, new services/packages automatically get a matching picture from the app's built-in library (by name), and admins can pick one or upload a photo.
With the key, every new service/package saved **without** a picture gets its own picture made in the app's 3D style, and admins get a working **"Create with AI"** button.
1. Go to **aistudio.google.com** → sign in → **Get API key** → **Create API key**.
2. In **server/.env** add:
   ```
   GEMINI_API_KEY=<your key>
   GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
   ```
3. Restart the server. **Settings → Connections** shows "AI pictures for new services" with a green tick.
Cost: roughly ₹3–4 per picture, once per new service/package (check Google's current pricing).

### 3.5 Lead sources (website, Instagram/Facebook Lead Ads, Google, JustDial)

1. Open **Admin → Leads → Connect lead sources** to get your secret lead key and the URL `https://api.YOURDOMAIN/api/leads/capture`.
2. **Website form:** POST `{name, mobile, message, source:"website"}` with the header `x-lead-key: <key>`.
3. **Meta Lead Ads, Google Ads lead forms, JustDial, IndiaMART:** connect them with **Zapier**, **Make** or **Pabbly Connect** (Pabbly is the cheapest, with a one-time plan).
   - Trigger: "New lead".
   - Action: Webhook POST to the URL above, with the same header and fields.
4. Leads that arrive on WhatsApp are captured automatically.

---

## 4. Go-live checklist

Everything else in the app is built and tested. Only the items below remain.

### 4.1 Keys to add in `server/.env` (what each one switches on)

| Key(s) | Turns on | Without it |
|---|---|---|
| `JWT_SECRET` (long random text) | Secure logins | **Must set**: the server refuses to start in production |
| `DB_*` | Live database | **Must set** |
| `CLIENT_URL`, `APP_BASE_URL` | Your live web address (logins, links, webhooks) | **Must set** |
| `WHATSAPP_*` (Meta Cloud API, see 3.1) | Job card updates, invoices, reminders and the leads inbox on WhatsApp | Messages are logged only, nothing is sent |
| `SMTP_*` (see 3.2) | Email copies of invoices and alerts | No emails |
| `TWOFACTOR_API_KEY`, `TWOFACTOR_TEMPLATE` (see 3.3) | OTP by SMS (sign-up, OTP login, forgot password) | Customers can only sign in with a password |
| `ANTHROPIC_API_KEY` (see 3.4) | AI replies in the leads / WhatsApp agent | Rule-based replies (still works, less smart) |
| `GEMINI_API_KEY` (see 3.6, optional) | "Create with AI" pictures for new services and packages | Library pictures and automatic pictures (33 built in) |


### 4.2 Switch off the test modes

```
NODE_ENV=production
ENABLE_BAILEYS_DEMO=false
NOTIFICATION_SANDBOX=false
OTP_DEV_ECHO=false
WHATSAPP_PROVIDER=meta
```

### 4.3 Your data (in the admin, after login)
1. **Settings**: studio name, address, phone, GST number, invoice details, payment QR, banners and offer pop-up.
2. **Services**: add your real services and prices. Use **Categories & home** to choose the home-screen tiles, ★ to feature services under "Popular services", the arrows to set the order, and the eye button to hide staff-only services from the app.
3. **Packages**, **Loyalty** and **Referral** settings.
4. **Staff**: add your team, then **Roles & permissions**. Note: the studio admin login can only *view* services until the super admin turns on *Services Catalog → Create / Edit*.
5. Delete the test records (Test Foam Wash…, Test Staff…, Flow Two…). Or ask me to reset to a clean database and keep only your admin logins.

### 4.4 Final check on the live server
1. `pm2 reload all`.
2. Settings → Integrations: every row green, then press each **Test** button once.
3. One real flow: customer books → admin approves → job card → stages → complete → invoice on WhatsApp → feedback request.
4. Check the nightly backup ran: `/var/www/o3-car-spaa/backups` should hold a `.sql.gz` (database) **and** an `o3_uploads_….tar.gz` (photos and pictures) each day.

### 4.5 For the phone apps (Play Store / App Store)
- Build the app with `VITE_SERVER_ORIGIN`, `VITE_API_URL` and `VITE_PUBLIC_URL` set to your live site (see `client/.env.example`).
- The server already accepts requests from the app.

## 5. Monthly running cost (estimate, about 300 cars/month)

| Item | Estimate |
|---|---|
| WhatsApp utility messages (about 6 per car) | ₹200–250 |
| WhatsApp replies inside 24h | ₹0 |
| OTP SMS (about 300) | ₹50–75 |
| AI agent (Claude Haiku 5.5) | ₹100–300 |
| Email | ₹0 |
| **Total** | **≈ ₹400–650 / month** + VPS |
