# O3 Car Spaa — Phase 1 Handover

Code changes for all 28 items in the Phase 1 list are complete. The client type-checks clean, the API boots with no errors, and the new endpoints passed a light smoke check.
**Full click-through testing was not done** (as agreed). Please test using the checklist at the bottom.

---

## 1. What you must do manually

### A. Logins (do this first)
| Who | Login | Where to find the password |
|---|---|---|
| Super Admin (HQ) | mobile `9000000001` | `LOGINS.local.txt` in the project root (git-ignored) |
| Anand franchise admin | mobile `9316668760` | `LOGINS.local.txt` |

1. Log in as the Super Admin and change the password: **Settings → My Profile**, or use **Forgot password** with OTP.
2. The Super Admin mobile `9000000001` is a placeholder. Use a real mobile, or you can't receive OTPs. To change it, run this once in MySQL:
   `UPDATE users SET mobile='<your 10-digit mobile>' WHERE role='super_admin';`
3. Every other user (staff, managers, new franchise admins) is created inside the app and gets a temporary password. They must change it at first login.

### B. API keys and accounts to set up (in `server/.env`)

> **Full step-by-step for WhatsApp, email, OTP and the AI agent (with costs): see [INTEGRATIONS_SETUP.md](INTEGRATIONS_SETUP.md).** After adding keys, check **Settings → Integrations** (super admin) for green ticks + Test buttons.

| Purpose | Variable(s) | Where to get it |
|---|---|---|
| **OTP SMS** (login, forgot password, registration — the only SMS used) | `TWOFACTOR_API_KEY` (old name `MSG91_AUTH_KEY` still works) or `OTP_PROVIDER=msg91` | 2factor.in → API key. Register a DLT sender ID / OTP template for India. |
| **WhatsApp (production)** | `WHATSAPP_PROVIDER=meta_cloud`, then enter Phone Number ID, WABA ID and access token in **WhatsApp → Settings** (stored encrypted) | Meta Business Manager → WhatsApp Cloud API. Approve templates for booking/job updates. |
| WhatsApp (alternative) | `WHATSAPP_PROVIDER=aisensy` + AiSensy key | aisensy.com |
| ⚠ WhatsApp demo engine | `ENABLE_BAILEYS_DEMO=true` is **ON right now** and a phone is paired. It is already receiving real messages (1 lead arrived). Turn it **off** (`false`) before launch. It is unofficial and can get the number banned. | — |
| Email (warranty certificates) | `SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM` | Gmail app password or any SMTP provider |
| Online payments (optional) | `RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET` | Razorpay dashboard. The webhook now refuses requests if no secret is set. |
| Photo storage (optional) | `CLOUDINARY_*` | cloudinary.com. Without it, files are stored on the server disk in `server/uploads`. |
| AI leads agent (optional) | `OPENAI_API_KEY` | Without it the agent uses the built-in rule-based replies |
| Production | `NODE_ENV=production`, strong `JWT_SECRET`, `CLIENT_URL=https://your-domain`, `APP_BASE_URL=https://your-domain` | — |
| Local testing without SMS | `OTP_DEV_ECHO=true` (never in production): the OTP is shown in a toast | — |

### C. Data you need to enter (the app starts empty, as you asked)
1. **Services and prices** (Super Admin): **Excel Import → Services & Prices** (download the template first), or **Services → Add**. Each service has a price per car type: Hatchback, Premium Hatchback, Sedan, Premium Sedan, SUV, Luxury.
2. **Products / inventory** (Super Admin sets the prices): **Inventory** or **Excel Import → Inventory**.
3. **Packages / memberships**: **Packages**.
4. **Payment QR**: **Settings → Payment QR codes → Add → Upload QR**. It then appears automatically on job cards, invoices, PDFs, the Payments page, customer checkout and package purchases. Without an uploaded image, a UPI QR is generated from the UPI ID.
5. **Studio details** (GSTIN, invoice prefix, Google review link): **Settings**.
6. **Referral rewards**: **Referrals → Reward rules**. The default is ₹200 per referral for staff, customers and others.
7. **Staff**: **Staff → Add Staff / Manager**. Set the salary method (monthly / per day / per hour), the rate and the paid leaves per month.
8. **Staff roles**: **Staff Roles & Permissions → Create role**. Tick what each role may view, create, edit or delete.
9. **Lead sources**: **Leads → Connect sources**. This gives you a webhook URL and key for your website form, Instagram/Facebook Lead Ads, Google lead forms and JustDial (via Zapier/Make).

---

## 2. What changed (by your list)

| # | Item | What was done |
|---|---|---|
| 1 | One franchise (Anand) | Removed the Ahmedabad franchise. Franchise #1 is now **O3 Car Spaa - Anand** (GIDC Vitthal Udyognagar address, phone, email, GPS coordinates). |
| 2, 26, 18 | Super Admin / RBAC | Every API call is now checked centrally: **Super Admin → modules enabled per franchise → role permissions per staff**. Super Admin: **Franchises & Access** has Module Access, **Logins & Admins** (create franchise admin, reset password, disable, force logout) and **Price Visibility**. Franchise admins manage only their own staff and roles, within what the Super Admin enabled. Sidebar and pages are hidden when a user lacks permission, and the server blocks the request anyway. Staff and managers now use the same app with a **My Workspace** section. |
| 3, 10, 16 | GK Autoherb | Removed all GK text, logo, product images (moved to `backups/gk_assets`), the hard-coded GK product catalog, the GK referral-code prefix and the GK SMS sender. All old services, packages and products were wiped. **The car dataset is kept.** |
| 4 | No fake data | All demo customers, staff, job cards, bills, leads, logs and metrics were wiped (backup: `backups/pre_phase1_cleanup_*.sql`). Removed the fake MRP and ratings on products and the fake GPS "simulation". Dashboard counts are now scoped to the franchise. |
| 5 | Security / glitches | Fixed: a universal `123456`/`12345` password worked for **every** account; customers auto-created with password `123456` or "last 4 digits + GKA"; cross-franchise data access through the `x-franchise-id` header and on job cards, deliveries and dashboard; public job tracking exposed mobile/email by ID (now uses a secret token); socket events broadcast customer data to everyone; OTP shown in API responses; OTPs in memory (broke under PM2); weak passwords; a hard-coded Razorpay webhook secret; stale role/franchise trusted from old tokens; token refresh logging users out. |
| 6 | Reg number format | Strict Indian format, e.g. `GJ06AB1234` or BH series `22BH1234AB`. Valid state codes only and no `0000`. Enforced on job cards, quick wash, vehicles, add car, registration, manual customer entry and Excel import, on both the server and the client. |
| 7 | Referrals module | New **Referrals** page: ledger, top referrers, top referred customers, paid/unpaid, mark paid (cash/UPI/bank/wallet), reward rules and Excel export. **Referred by** (staff / customer / other) is on job cards and quick wash. Codes customers use at sign-up attach to their first job card. **Salary → "Add to salary"** pays a staff member's referral earnings with salary, and they show as *paid via salary* everywhere. |
| 8 | Discount approval | "Approved by" is now a dropdown of the Super Admin and this franchise's admins (validated on the server). |
| 9 | Save draft / submit | Job card creation is a single transaction (customer, car, services, referral). Clear errors replace "Duplicate entry". A double-click or retry no longer creates a second card. |
| 11 | Pipeline | **One** pipeline per job card. One click moves the car to that stage. The customer's tracking page updates live and they get an automatic WhatsApp message on every stage change. |
| 12 | SMS only for OTP | All other messages go out on WhatsApp through the queue. The SMS option was removed from Notification History and Messages. Added **Login with OTP**, OTP on registration, and OTP forgot-password (database-backed, 6 digits, expiry, attempt limits). |
| 13 | Car dataset | The full brand/model/variant dataset now appears in **every** car dropdown (quick wash, job card, booking, add car, registration). |
| 14 | Live GPS | The driver taps **Start live location** under **My Deliveries** and real phone GPS streams live. If GPS is off or blocked, a **"GPS is not turned on"** popup shows phone-specific steps and Try again. The customer sees "driver's GPS is off — call driver". The fake simulation was removed. |
| 15 | Leads agent | Leads come from WhatsApp (AI agent), website, Instagram, Facebook, Google, JustDial (webhook), walk-in, phone, referral, Excel import and outbound lists. Duplicates are merged and leads are scored. Automatic WhatsApp first-touch, scheduled follow-ups (up to 3), follow-up and convert-to-customer/job-card buttons, and Excel export. |
| 17 | Price visibility | The Super Admin sets which of cost / franchise / customer / staff price each role sees. The server strips hidden prices. Only the Super Admin can change product prices. |
| 19 | Excel | Imports match columns by meaning, validate rows and report row-level errors. New Services & Prices import and downloadable templates. Exports have the same layout everywhere: title row, frozen bold header, ₹ format, dates, totals and filters. |
| 20 | Buy & Sell invoice | Fixed: the PDF generator never loaded the record, so every download failed. |
| 21 | Quotations | Per-franchise quotation numbers (no duplicate errors). Totals are recalculated on the server. Added Send on WhatsApp (clearly marked "estimate, not a bill"), Accept/Decline, and Convert → job card with services prefilled. |
| 22 | Salary | Each employee has a salary method (monthly pro-rated / per day / per hour), a rate, working days and paid leaves. **Generate salary** calculates from attendance, approved leave and incentives. Added adjust, pay (cash/UPI/bank, optionally including referrals), PDF slip and Excel export. |
| 23 | HR | Leave requests (overlap checks, reasons) feed salary when approved. Tasks are assigned and updated by staff. Employees get **My Leaves & Tasks** and **My Salary & Referrals**. Fixed: attendance selfies were too large for the database, so check-in always failed. |
| 24 | Inquiries vs Leads | **Leads** = new business (unknown numbers, every source). **Inquiries** = support questions from existing customers, with WhatsApp reply. A website enquiry from an unknown number now becomes a lead. |
| 25 | Feedback | After a job card or quick wash is completed, the customer gets a WhatsApp rating link and also sees **"How was your service?"** on their dashboard. Ratings appear in **Feedback & Reviews**. |
| 27 | Payment QR | The Settings QR upload was broken (the endpoint didn't exist); fixed. The QR now appears on invoice PDFs, job-card PDFs and print, booking invoices, the payments page and customer checkout, with an exact-amount UPI QR where an amount is known. |
| 28 | Customer dashboard | Live "Your car right now" (job stage and quick-wash queue with live tracking link), pending ratings, referral code with a share/copy invite plus earnings, and loyalty points. |

---

## 3. Testing checklist (please click through)
1. **Super Admin:** create a franchise admin under Logins & Admins → log in as them → confirm only the enabled modules show → turn a module off → it disappears within a minute.
2. **Admin:** add a staff member and a custom role → log in as staff → only the permitted menu items show.
3. **Job card:** a fake reg like `GH5555555` is rejected → create with a referrer and a discount (pick an approver) → Save draft → Submit → click pipeline stages → customer receives WhatsApp → Complete & bill → the referral shows *unpaid* in Referrals.
4. **Salary:** set the staff salary method → Generate → tick "Add to salary" → Pay → the referral shows *paid via salary*.
5. **Quick wash** with the car dataset → complete → feedback request arrives.
6. **Delivery:** assign a driver → driver opens My Deliveries → Start live location (try with GPS off) → customer tracking page.
7. **Settings:** add a payment QR + upload image → check the invoice PDF, job card print and payments page.
8. **Excel:** import services, inventory and customers with the templates → try a bad row.
9. **Customer:** register (OTP) → dashboard → login with OTP → rate a service.

## 4. Backups and safety
- Full DB dump before the cleanup: `backups/pre_phase1_cleanup_20261016_014046.sql`
- Old demo uploads: `backups/demo_uploads_20261016/`; GK assets: `backups/gk_assets/`
- Nothing has been committed to git. Review the diff and commit when happy.

## 5. Before converting to Play Store / App Store (Phase 2)
- Set `VITE_SERVER_ORIGIN=https://api.your-domain` and `VITE_API_URL=https://api.your-domain/api` for the mobile build. All URLs, sockets and file links now go through `client/src/utils/endpoints.ts`, so a Capacitor build will work.
- The app needs HTTPS, location permission (deliveries and attendance) and camera permission (attendance selfie, job photos).
