# GK AUTOHERB

# Software Feature Specification Document

### 31 Client Requirement Updates — Full AI Coding Agent Brief

| Field | Details |
| --- | --- |
| **Project** | GK AutoHerb — Car Studio Management Platform |
| **Domain** | http://localhost:5000 |
| **Stack** | React 18 + TypeScript + Node.js/Express + MySQL |
| **Auth** | JWT (7-day token) \| Roles: admin, staff, customer |
| **Document Purpose** | Per-update description for AI coding agent implementation |
| **Total Updates** | 31 Feature Updates / Modules |
| **Date** | June 15, 2026 |

> [!IMPORTANT]![alt text](image.png)
> **IMPORTANT NOTE FOR AI CODING AGENT:**
> All new backend features must follow:
> 1. New migration file in `server/migrations/` with next sequential prefix.
> 2. New controller in `server/src/controllers/`.
> 3. New route file in `server/src/routes/` mounted in `app.js`.
> 4. TypeScript interfaces in `client/src/types/index.ts`.
> 5. React Query hooks in `client/src/api/hooks/`.
> 6. Do NOT modify any existing UI layout or Tailwind config.

## Table of Contents

| # | Feature Update |
| --- | --- |
| 1 | [PAYMENT GATEWAY — RAZORPAY](#update-1-payment-gateway-razorpay) |
| 2 | [PACKAGE RENEWAL SYSTEM](#update-2-package-renewal-system) |
| 3 | [SERVICE UPDATE — CHANGE WITHIN 1 DAY](#update-3-service-update-change-within-1-day) |
| 4 | [ADVANCE PAYMENT](#update-4-advance-payment) |
| 5 | [CAR REGISTRATION YEAR — DROPDOWN](#update-5-car-registration-year-dropdown) |
| 6 | [UI/UX IMPROVEMENTS](#update-6-ui-ux-improvements) |
| 7 | [STAFF LOGIN — TODAY'S ENTRY + NEW ENTRY ONLY](#update-7-staff-login-today-s-entry-new-entry-only) |
| 8 | [WASH SEQUENCE — CURRENT PHASE DISPLAY WITH RATES](#update-8-wash-sequence-current-phase-display-with-rates) |
| 9 | [REFERRAL PROGRAM — CODE GENERATION + REWARDS](#update-9-referral-program-code-generation-rewards) |
| 10 | [BALANCE SHEET CREATION](#update-10-balance-sheet-creation) |
| 11 | [BOOK BUTTON AVAILABILITY](#update-11-book-button-availability) |
| 12 | [WHATSAPP INTEGRATION — FULL](#update-12-whatsapp-integration-full) |
| 13 | [WHATSAPP REMINDER / CONFIRMATION](#update-13-whatsapp-reminder-confirmation) |
| 14 | [ROLE-BASED ACCESS CONTROL — EXTENDED](#update-14-role-based-access-control-extended) |
| 15 | [PICKUP OPTIONS](#update-15-pickup-options) |
| 16 | [MANUAL SLOT BOOKING — OFFLINE CLIENT](#update-16-manual-slot-booking-offline-client) |
| 17 | [CAR DETAILS IN MANUAL BILLING WITHOUT JOB CARD](#update-17-car-details-in-manual-billing-without-job-card) |
| 18 | [CUSTOM PACKAGE CREATION MODULE](#update-18-custom-package-creation-module) |
| 19 | [OLD CUSTOMER PACKAGE HISTORY DATA EXPORT](#update-19-old-customer-package-history-data-export) |
| 20 | [OFFLINE SLOT BOOKING VIA ADMIN](#update-20-offline-slot-booking-via-admin) |
| 21 | [LIVE TRACKING OF SERVICE](#update-21-live-tracking-of-service) |
| 22 | [SHARE / SEND FILES FROM WEBAPP](#update-22-share-send-files-from-webapp) |
| 23 | [SHOW SERVICES WITH DURATION](#update-23-show-services-with-duration) |
| 24 | [NEW CUSTOMER DISCOUNT REWARDS](#update-24-new-customer-discount-rewards) |
| 25 | [SMS AND WHATSAPP MESSAGES — JOB EVENTS](#update-25-sms-and-whatsapp-messages-job-events) |
| 26 | [CUSTOMER PACKAGE DETAILS FROM ADMIN](#update-26-customer-package-details-from-admin) |
| 27 | [MULTIPLE PACKAGES FOR MULTIPLE CARS](#update-27-multiple-packages-for-multiple-cars) |
| 28 | [INVENTORY MANAGEMENT WITH ACCESSORIES IMAGES](#update-28-inventory-management-with-accessories-images) |
| 29 | [ACCOUNTS MANAGEMENT — FULL MODULE](#update-29-accounts-management-full-module) |
| 30 | [STAFF SEPARATE LOGIN AND HR MODULES](#update-30-staff-separate-login-and-hr-modules) |
| 31 | [FEEDBACK COLLECTION VIA CRM](#update-31-feedback-collection-via-crm) |

---

## UPDATE 1 | PAYMENT GATEWAY — RAZORPAY

### OVERVIEW
Activate the stubbed Razorpay integration so customers can pay for packages and services online. The v2_payments, v2_payment_transactions, and v2_refunds tables already exist. The Razorpay keys are in the .env. The checkout loop and webhook verification are not yet wired.

### WHAT IT DOES
- Customers can pay for packages (Bronze, Silver, Gold, Diamond, Platinum) online via Razorpay checkout popup.
- Supported modes: UPI, Card, Net Banking, QR Code — all routed through Razorpay.
- Admin can also collect payments offline (cash / UPI manual entry) from the admin panel.
- Payment status (pending → captured → failed) is tracked per transaction in v2_payments table.
- Webhook from Razorpay confirms payment server-side — not relying only on frontend callback.
- Successful payment auto-approves the package_request and creates user_packages entry.
- Failed/partial payments are logged in v2_payment_transactions with gateway JSON response.
- Refunds can be initiated by admin and tracked via v2_refunds table and Razorpay refund API.

### HOW IT WORKS
1. Customer selects a package → clicks "Buy Now / Pay Online" → backend creates Razorpay Order (POST /v1/orders) → returns order_id.
2. Frontend loads Razorpay checkout SDK with order_id, key_id, prefill data (name, mobile, email).
3. On payment success, frontend sends { razorpay_order_id, razorpay_payment_id, razorpay_signature } to backend.
4. Backend verifies HMAC-SHA256 signature: crypto.createHmac("sha256", RAZORPAY_SECRET).update(order_id + "|" + payment_id).digest("hex") must match razorpay_signature.
5. On valid signature → update v2_payments status to "captured" → auto-approve package_request → create user_packages → send WhatsApp/SMS confirmation.
6. Razorpay Webhook (POST /api/payments/webhook) handles edge cases like delayed payment capture. Verify webhook signature using X-Razorpay-Signature header.
7. Admin refund: admin panel shows "Initiate Refund" button → calls Razorpay refund API → inserts into v2_refunds.

### EXAMPLE / USER SCENARIO
> Customer selects "Gold Package" for their SUV at ₹12,000.
> Clicks "Pay Online" → Razorpay popup appears → customer pays via UPI.
> Razorpay calls webhook → backend verifies → package_request approved → user_packages entry created.
> Customer sees "Package Active" on their dashboard. WhatsApp message received: "Your Gold Package is now active!".
> If payment fails (network drop) → v2_payments shows status = "failed" → customer can retry.

### DATABASE CHANGES (Migration File Required)
- No new migration needed. Tables v2_payments, v2_payment_transactions, v2_refunds already exist.
- Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env (already present per context).

### BACKEND / API REQUIREMENTS
- Install razorpay npm package: npm install razorpay.
- Create server/src/controllers/paymentsController.js — methods: createOrder, verifyPayment, webhook, initiateRefund.
- Create server/src/routes/payments.js — POST /api/payments/create-order, POST /api/payments/verify, POST /api/payments/webhook (public, no auth), POST /api/payments/:id/refund (admin only).
- Mount payments route in app.js.
- In packagesController.approveRequest: after payment verification, call auto-approve logic inside a DB transaction.
- Add RAZORPAY_KEY_SECRET to crypto HMAC verification in paymentsController.

### FRONTEND REQUIREMENTS
- Add "Pay Online" button on the Packages page (customer portal) — trigger Razorpay checkout using razorpay script tag in index.html.
- Add usePayments hook in client/src/api/hooks/usePayments.ts — mutations: createOrder, verifyPayment.
- Show payment status badge (Pending / Paid / Failed) on package request cards.
- Admin panel: PaymentsPage.tsx should show all v2_payments with filter by status. Add "Initiate Refund" action.
- Do NOT change any existing layout. Add payment UI within existing card/modal patterns.

> [!NOTE]
> **AGENT NOTES:** Razorpay test keys available on dashboard.razorpay.com. Use test card 4111 1111 1111 1111 for dev testing. | Mount webhook route BEFORE express.json() middleware so raw body is available for signature verification.

---

## UPDATE 2 | PACKAGE RENEWAL SYSTEM

### OVERVIEW
Allow customers to renew expiring/expired packages from their portal, and allow admins to renew on behalf of customers. The v2_package_renewals table and POST /api/user-packages/:id/renew endpoint already exist but are not wired to payment or UI flow.

### WHAT IT DOES
- Customer sees "Renew Package" button when their package is within 30 days of expiry or already expired.
- Renewal supports online payment (Razorpay) or offline (admin manual renewal).
- On renewal: wash_count, wax_count, and all service entitlements are reset to package defaults.
- Renewal history is stored in v2_package_renewals for audit and customer history view.
- Admin can renew any customer package from the CustomerDetailPage.
- Auto-reminder: cron job sends WhatsApp/SMS 7 days and 1 day before expiry.

### HOW IT WORKS
1. Customer goes to "My Package" section → sees "Expires in 5 days" badge + "Renew" button.
2. Clicking "Renew" triggers Razorpay payment for the same package price (based on car type).
3. On payment success → backend calls POST /api/user-packages/:id/renew → resets counters → inserts v2_package_renewals record.
4. Admin renewal: admin opens CustomerDetailPage → clicks "Renew Package" → selects payment mode (cash/online) → confirms.
5. Cron in cronService.js: every day at 9 AM, find user_packages expiring in 7 days → send reminder via messagingService.

### EXAMPLE / USER SCENARIO
> Priya's Silver Package expires on June 22. On June 15, she gets a WhatsApp: "Your Silver Package expires in 7 days. Renew now to keep your benefits!".
> She opens the app → sees "Renew" button on dashboard → pays ₹8,000 via UPI.
> System resets her remaining_washes to 12, wax_count to 2. Renewal logged in v2_package_renewals.
> Admin can see the renewal in CustomerDetailPage under "Package History".

### DATABASE CHANGES (Migration File Required)
- v2_package_renewals table exists. Verify columns: customer_id, package_id, customer_package_id, renewal_date, amount_paid, payment_id, renewed_by, notes.
- No additional migration needed unless you want to add renewal_source column.

### BACKEND / API REQUIREMENTS
- Update POST /api/user-packages/:id/renew in userPackagesController.js to: validate payment (if online), reset user_packages counters (washes, wax, service entitlements) to package defaults, insert v2_package_renewals record, send confirmation message.
- Add GET /api/user-packages/expiring endpoint (admin only) — returns packages expiring in next 30 days.
- Update cronService.js to include renewal reminder job (7-day and 1-day warnings).

### FRONTEND REQUIREMENTS
- Show renewal banner on customer dashboard when package expires within 30 days.
- PackageRenewModal.tsx already exists (shared component) — wire it to the new payment + renewal flow.
- Admin CustomerDetailPage: add "Renew Package" button in the package section with modal for payment mode selection.
- Display v2_package_renewals history as a collapsible timeline in CustomerDetailPage.

> [!NOTE]
> **AGENT NOTES:** The userPackagesController.renewPackage controller method already exists — extend it with payment linkage and counter reset logic rather than creating a new one.

---

## UPDATE 3 | SERVICE UPDATE — CHANGE WITHIN 1 DAY

### OVERVIEW
Allow customers to modify their selected service(s) for an upcoming confirmed booking within a 1-day window (24 hours before the slot). After the 24-hour cutoff, no changes are allowed and admin must intervene manually.

### WHAT IT DOES
- Customer can change/swap service(s) on a confirmed booking up to 24 hours before the slot time.
- After 24-hour cutoff, the "Change Service" button is hidden and the booking is locked.
- Service change updates booking_services table (delete old → insert new) and recalculates total_duration.
- Both old and new service values are logged in v2_audit_logs for admin traceability.
- Admin receives a notification (WhatsApp/in-app) when a customer changes their service.
- Customer receives confirmation of the change via WhatsApp/SMS.

### HOW IT WORKS
1. Check window: diff between now and slot start_time must be > 1440 minutes (24 hours) for change to be allowed.
2. Customer opens "My Bookings" → selects confirmed booking → clicks "Change Service" (visible only if within window).
3. Service selection modal opens → customer picks new service(s) → submits.
4. Backend: DELETE from booking_services WHERE booking_id = ? → INSERT new service IDs → UPDATE bookings.total_duration.
5. Log action in v2_audit_logs with old_value = old service IDs, new_value = new service IDs.
6. Send WhatsApp template "service_changed" to customer and admin notification.

### EXAMPLE / USER SCENARIO
> Rajan booked a "Full Interior Cleaning" for tomorrow at 11 AM. Today at 9 AM (26 hours before), he wants to change to "Ceramic Coating" instead.
> He opens the app → My Bookings → sees "Change Service" button (26 hours remaining).
> He selects "Ceramic Coating" → confirms → receives WhatsApp: "Your service has been updated to Ceramic Coating.".
> If he tries again at 10:30 AM the next day (30 min before) → button is hidden → "Service locked. Contact studio for changes."

### DATABASE CHANGES (Migration File Required)
- No new table needed. Uses existing booking_services, bookings, v2_audit_logs.
- Add index on booking_services(booking_id) if not already present.

### BACKEND / API REQUIREMENTS
- Create new endpoint: PATCH /api/bookings/:id/change-services (protect + role customer).
- Controller: validate 24-hour window by comparing slot.start_time with current time. If within 1 day, return 400 error. Else: begin transaction → delete old booking_services → insert new → update total_duration → log audit → send messages → commit.
- Add optionally: GET /api/bookings/:id/can-change — returns { canChange: true/false, hoursRemaining: X }.

### FRONTEND REQUIREMENTS
- In customer "My Bookings" page, compute canChange flag from slot date/time.
- Show "Change Service" button (active/disabled) with countdown: "2h 30m left to change".
- Service selection modal reuses existing service picker component — show only active services.
- After change: invalidate React Query cache for useBookings and show success toast.

> [!NOTE]
> **AGENT NOTES:** Use date-fns differenceInMinutes(slotDateTime, new Date()) to compute the time window on both frontend and backend independently for security.

---

## UPDATE 4 | ADVANCE PAYMENT

### OVERVIEW
Allow customers to pay a partial advance amount when booking a service or package, with the balance collected at the studio. Admin can also record advance payments against bookings or job carts manually.

### WHAT IT DOES
- Customer can pay an advance (fixed or percentage) when creating a booking.
- Advance amount is stored against the booking and shown in the job cart and invoice.
- Remaining balance is shown clearly on the invoice and in admin job cart view.
- Admin can record advance payment collected at counter against any booking or job cart.
- Full payment history (advance + balance) is visible in customer profile and job cart detail.
- Advance amounts flow into the transactions table as direction = "in".

### HOW IT WORKS
1. Admin sets advance requirement in Settings: e.g., "Premium services require 30% advance" or "Fixed ₹500 advance for all bookings".
2. During booking creation, if advance is required, customer sees "Pay Advance ₹X" step via Razorpay.
3. On payment: record in v2_payments with a note field "advance_payment", link to booking_id.
4. Job cart creation pulls booking's advance_paid amount and displays "Advance Received: ₹X | Balance Due: ₹Y".
5. Admin can manually add advance via job cart page: "Mark Advance Collected" → enters amount + mode (cash/UPI) → updates advance record.

### EXAMPLE / USER SCENARIO
> Sneha books a Ceramic Coating (₹15,000). Studio requires 50% advance.
> Booking page shows "Advance Required: ₹7,500". She pays via Razorpay.
> Admin creates job cart → sees "Advance: ₹7,500 received. Balance due: ₹7,500".
> After service, admin completes job cart → invoice shows: Service Total ₹15,000, Advance ₹7,500, Balance Collected ₹7,500.

### DATABASE CHANGES (Migration File Required)
- Add columns to bookings: advance_amount DECIMAL(10,2) DEFAULT 0.00, advance_payment_id INT (FK to v2_payments), advance_collected_by INT (FK to users).
- Add to job_carts: advance_amount DECIMAL(10,2) DEFAULT 0.00, balance_due DECIMAL(10,2) DEFAULT 0.00.
- Add to settings table: keys "advance_type" (none/fixed/percentage), "advance_value" (amount or %).
- Create migration: server/migrations/058_add_advance_payment.sql

### BACKEND / API REQUIREMENTS
- Add advance_amount and advance_payment_id fields to bookingsController.create.
- Add POST /api/job-carts/:id/advance-payment endpoint: records advance collection, updates job_cart.advance_amount, inserts transactions record.
- Update invoiceService.js to display advance and balance_due on invoice PDF.
- Update settingsController to handle advance_type and advance_value keys.

### FRONTEND REQUIREMENTS
- Booking flow: if settings show advance required, add "Pay Advance" step after slot selection.
- Job Cart Detail page: show advance section — "Advance Paid: ₹X" + "Mark Balance Collected" button.
- Invoice PDF: show line items for advance and balance.
- Admin SettingsPage: add Advance Payment section with type selector (None / Fixed / Percentage) + amount field.

> [!NOTE]
> **AGENT NOTES:** Keep advance payment optional (controlled by settings flag). Default = none so existing bookings are not affected.

---

## UPDATE 5 | CAR REGISTRATION YEAR — DROPDOWN

### OVERVIEW
Add a "Year of Registration/Manufacture" field to the vehicle profile. Currently the vehicles table has brand, model, registration_no but no year field. This is needed for accurate service recommendations and billing (older cars may need different service variants).

### WHAT IT DOES
- Vehicle registration/manufacture year is captured when adding a new vehicle.
- Year is displayed in job cart header, customer profile, and admin vehicle lookup.
- Dropdown shows years from 1990 to current year in descending order.
- Year is also editable from the customer's "My Vehicles" section.
- Admin sees year in vehicle lookup (job cart creation) and customer detail page.

### HOW IT WORKS
1. Frontend: Replace any year text input with a <select> dropdown populated dynamically: Array.from({length: currentYear - 1989}, (_, i) => currentYear - i).
2. Backend: Add year column to vehicles table. All vehicle create/update endpoints accept and store year.
3. Display format: "2019 Hyundai i20" in job cart headers and customer profile.
4. Vehicle master (vehicle_master table) does not need year — it's catalog-level, year is per-customer-vehicle.

### EXAMPLE / USER SCENARIO
> Customer Rajesh adds his car: Brand = Maruti, Model = Swift, Reg No = GJ01AB1234, Year = 2018.
> Admin creates a job cart → vehicle lookup shows: "GJ01AB1234 | Maruti Swift | 2018 | Visit #3".
> Staff sees year in their job card view for reference.

### DATABASE CHANGES (Migration File Required)
- Add column to vehicles: manufacture_year SMALLINT UNSIGNED DEFAULT NULL.
- Create migration: server/migrations/058_add_vehicle_year.sql — ALTER TABLE vehicles ADD COLUMN manufacture_year SMALLINT UNSIGNED DEFAULT NULL;

### BACKEND / API REQUIREMENTS
- Update vehiclesController.create and vehiclesController.update to accept and store manufacture_year.
- Update vehiclesController.getOne and list responses to include manufacture_year.
- Update jobCartController.lookup response to include manufacture_year.

### FRONTEND REQUIREMENTS
- AddCarModal.tsx: replace year text input (if any) with dropdown. Generate years dynamically.
- Customer "My Vehicles" edit form: add year dropdown.
- Job Cart Create/Detail: show manufacture_year next to vehicle info.
- Customer Detail Page: show year in vehicle card.
- TypeScript: add manufacture_year?: number to Vehicle interface in types/index.ts.

> [!NOTE]
> **AGENT NOTES:** If year is null (old vehicles without year), display "Year N/A" gracefully — do not break existing vehicle records.

---

## UPDATE 6 | UI/UX IMPROVEMENTS

### OVERVIEW
A set of polish improvements across the customer portal and admin panel to improve usability, information density, and visual consistency. Frozen layout rule still applies — improvements are additive within existing containers.

### WHAT IT DOES
- Service cards show price per car type (hatchback, sedan, SUV) in a clear price matrix.
- Package cards show included service count + wash count prominently.
- Customer dashboard shows active package countdown timer ("12 days left").
- Admin dashboard shows today's booked vs available slots in a visual progress bar.
- All tables: empty states have contextual illustrations (not just plain text).
- Mobile: bottom nav shows unread notification badge count.
- Form inputs: real-time validation feedback (green tick / red border) on blur.
- Loading skeletons on all data fetch states (currently some pages show blank).

### HOW IT WORKS
1. Service pricing table: on the Services page and booking flow, render a grid showing price_hatchback / price_sedan / price_suv per service. Existing prices are already in the services table per car category.
2. Package countdown: GET /api/user-packages/active returns expiry_date — compute diff in days on frontend using date-fns differenceInDays.
3. Admin slot progress: existing /api/slots endpoint returns booked_count and max_capacity per slot — render as progress bar.
4. Form validation: React Hook Form already integrated — add mode: "onBlur" to useForm() and show field-level error messages.

### EXAMPLE / USER SCENARIO
> Customer opens Packages page → Silver Package card shows: "✓ 12 Washes | ✓ 2 Waxing | ✓ Interior Cleaning x4" with pricing table for each car type.
> Dashboard: "Silver Package — 18 days remaining" with a progress ring.
> Admin opens dashboard → sees "Today: 4 of 6 slots booked" as a progress bar.

### DATABASE CHANGES (Migration File Required)
- No database changes needed for this update — all data already exists.

### BACKEND / API REQUIREMENTS
- No new API endpoints. Minor response shape improvements: ensure services list includes all 6 price columns (already in schema).
- Verify /api/user-packages/active returns expiry_date and remaining service counts.

### FRONTEND REQUIREMENTS
- Services page and booking modal: add price matrix table (hatchback / medium hatchback / sedan / premium sedan / SUV / luxury) per service.
- Customer dashboard: add package countdown component using date-fns.
- Admin DashboardPage: add slot utilization progress bar using booked_count / max_capacity.
- Add SkeletonLoader (existing component) to all pages missing loading states.
- Add Framer Motion fade-in animation on data table rows (Framer Motion already installed).

> [!NOTE]
> **AGENT NOTES:** UI improvements must be additive. Do NOT restructure any existing page layout. Add new sub-components as children of existing containers.

---

## UPDATE 7 | STAFF LOGIN — TODAY'S ENTRY + NEW ENTRY ONLY

### OVERVIEW
The staff role already exists in the system with StaffLayout, StaffSidebar, and a set of staff routes. However, staff access needs to be further restricted: staff should only see today's job carts and bookings, and should only be able to create new entries — not edit or delete historical records.

### WHAT IT DOES
- Staff login via /staff/login route — same JWT auth, role = "staff".
- Staff dashboard shows only today's job carts (visit_date = today).
- Staff can create new job carts for today's vehicles.
- Staff can update job cart status (draft → open → complete) for today's carts.
- Staff CANNOT see other days' job carts, financial data, customer PII, or pricing.
- Staff CAN see the wash queue (Quick Wash) and update wash status.
- Staff CAN clock in/out (already implemented in staffController).

### HOW IT WORKS
1. Backend: add date filter to jobCartController.list — when role = "staff", automatically apply WHERE DATE(visit_date) = CURDATE() filter.
2. Backend: in jobCartController.getOne — when role = "staff", strip out discount_value, service_price, labor_charges, invoice_notes before sending response (already partially done per context).
3. Backend: restrict PUT /api/job-carts/:id to TODAY only when role = "staff" — return 403 if visit_date is not today.
4. Staff sidebar: only show Today's Jobs, New Job Cart, Quick Wash Queue, Check In/Out.

### EXAMPLE / USER SCENARIO
> Washer Suresh logs in at 8 AM → sees "Today's Jobs: 3 vehicles".
> He opens Job Cart #45 for a Honda City → changes status to "In Progress".
> He cannot see Job Cart #40 from last Thursday.
> He cannot see the ₹3,500 service price on the cart (price is hidden).
> He creates a new Job Cart for a walk-in vehicle by entering the registration number.

### DATABASE CHANGES (Migration File Required)
- No DB changes. Uses existing role enum (staff) on users table.

### BACKEND / API REQUIREMENTS
- Update jobCartController.list: add if (req.user.role === "staff") { query += " AND DATE(jc.visit_date) = CURDATE()"; }.
- Update jobCartController.getOne: strip financial fields when role = "staff" (extend existing partial logic).
- Update jobCartController.update: add check — if (req.user.role === "staff" && !isToday(cart.visit_date)) return 403.
- Audit: log staff actions in v2_audit_logs using the auditLog middleware already available.

### FRONTEND REQUIREMENTS
- StaffSidebar.tsx: remove any links to historical data pages, packages, customers list, financials.
- Staff Dashboard: replace generic dashboard with a Today's Queue view — list of today's job carts with status chips.
- Add "+ New Job Cart" primary button on staff dashboard.
- Job Cart Detail (staff view): hide all price columns, show only service names, status controls, and photo upload.

> [!NOTE]
> **AGENT NOTES:** Staff password should be set by admin (already handled by POST /api/staff endpoint). Ensure staff can change own password via /api/auth/change-password.

---

## UPDATE 8 | WASH SEQUENCE — CURRENT PHASE DISPLAY WITH RATES

### OVERVIEW
Enhance the Quick Wash queue to show the current phase of washing (e.g., Pre-wash → Foam → Rinse → Dry → Done) as a visual progress tracker. Also display service rates with prices for each car category (primary car vs all categories) on service cards and booking pages.

### WHAT IT DOES
- Quick Wash queue shows a visual step-by-step progress bar: Pre-wash → Soap Foam → Pressure Rinse → Interior Vacuum → Dry & Polish → Done.
- Each wash phase can be advanced by admin/staff with a single button click.
- Current phase is visible to the customer on their tracking page in real-time (via Socket.io).
- Service catalog pages show price for each car category in a structured table.
- On booking, customer selects their car type → system shows the applicable price automatically.
- Admin can mark a service as having a "primary" price (most common category) shown prominently.

### HOW IT WORKS
1. Wash phases are predefined: ["pre_wash", "foam_apply", "pressure_rinse", "interior_clean", "dry_polish", "complete"]. Stored in bookings.wash_status (existing column) — extend it to support granular phases or add a current_phase column.
2. Admin/staff clicks "Next Phase" button → PATCH /api/quick-wash/:id/phase → updates phase → emits Socket.io event "wash:phase_updated".
3. Customer's tracking page listens on "wash:phase_updated" → updates phase indicator in real-time.
4. Rate display: services table already has price_hatchback, price_sedan, price_suv etc. — render as a comparison table on service cards.

### EXAMPLE / USER SCENARIO
> Admin creates a Quick Wash entry for GJ01AB1234. Phase tracker shows: [Pre-wash ✓] → [Foam → current] → [Rinse] → [Dry] → [Done].
> Customer Anil checks his app → sees "Your car is being foam-washed. Est. 15 min.".
> Admin clicks "Next Phase" → phase moves to Rinse → Anil's app updates instantly.
> On Services page, customer sees: Interior Cleaning → Hatchback ₹800 | Sedan ₹1,000 | SUV ₹1,200.

### DATABASE CHANGES (Migration File Required)
- Add column to bookings: current_phase VARCHAR(30) DEFAULT "pre_wash".
- Add column to bookings: phase_updated_at TIMESTAMP DEFAULT NULL.
- Create migration: server/migrations/059_add_wash_phase.sql.

### BACKEND / API REQUIREMENTS
- Add PATCH /api/quick-wash/:id/phase endpoint in quickWashController.js.
- Define WASH_PHASES constant: ["pre_wash","foam_apply","pressure_rinse","interior_clean","dry_polish","complete"].
- On phase update: update bookings.current_phase and phase_updated_at → emit socket event io.emit("wash:phase_updated", { bookingId, phase, timestamp }).
- Add GET /api/quick-wash/:id/phase for customer to poll or receive via socket.

### FRONTEND REQUIREMENTS
- Quick Wash admin page: add phase stepper component (5 steps) per wash entry. "Next Phase" button advances it.
- Customer tracking page: add real-time phase indicator using existing Socket.io client.
- Services page / booking modal: add price matrix showing all car categories per service.
- Use existing StatusBadge component style for phase chips.

> [!NOTE]
> **AGENT NOTES:** current_phase is separate from wash_status (which tracks pending/washing/completed/delivered). Phase is granular sub-status of the "washing" macro-status.

---

## UPDATE 9 | REFERRAL PROGRAM — CODE GENERATION + REWARDS

### OVERVIEW
Activate the referral system. The v2_referrals, v2_reward_logs, and v2_wallets tables are schema-ready. The frontend hooks useReferrals.ts and useCustomerRewards.ts exist. The backend controllers referralController.js and customerRewardsController.js exist but are not mounted in app.js.

### WHAT IT DOES
- Each customer has a unique referral code (e.g., GKRJ8X2) visible in their profile.
- New customers enter a referral code during registration to get a welcome discount (₹50 or configurable reward points).
- Referrer gets reward points / cashback when their referred customer completes their first booking.
- Referral status: pending (registered) → completed (booked) → rewarded (points credited).
- Admin can view all referrals, their status, and reward distribution in a referrals dashboard.
- Referral code is shareable via WhatsApp/Copy link from the customer portal.

### HOW IT WORKS
1. At registration: customer provides referral_code (optional) → backend looks up v2_referrals for matching referrer → creates v2_referrals entry with status = "pending".
2. Referral code generation: SHA-based or random 6-char alphanumeric code stored in users table (or a new column referral_code).
3. On new customer's first confirmed booking → trigger reward: update v2_referrals.status to "completed" → credit referrer's v2_wallets.reward_points → insert v2_reward_logs → update to "rewarded".
4. Admin panel: referrals list with columns — Referrer, Referred Customer, Date, Status, Reward Given.

### EXAMPLE / USER SCENARIO
> Customer Priya has referral code: GKPR7A2. She shares it with her friend Meera.
> Meera registers using code GKPR7A2 → gets ₹50 discount on first booking.
> After Meera's first confirmed booking → Priya gets 200 reward points credited to her wallet.
> Priya's wallet shows: "200 points earned — Referral Reward (Meera)" on her rewards page.

### DATABASE CHANGES (Migration File Required)
- Add column to users: referral_code VARCHAR(20) UNIQUE DEFAULT NULL.
- Create migration: server/migrations/060_add_referral_code.sql.
- v2_referrals, v2_wallets, v2_reward_logs already exist.

### BACKEND / API REQUIREMENTS
- Generate referral_code on user registration: random 6-char alphanumeric — store in users.referral_code.
- Mount referralController routes in app.js: GET /api/referrals/my-code, GET /api/referrals/my-referrals, POST /api/referrals/apply-code, GET /api/referrals (admin), POST /api/referrals/:id/reward (admin).
- Mount customerRewardsController routes: GET /api/rewards/wallet, GET /api/rewards/history.
- In bookingsController.approve: check if customer has a referral in "pending" state → trigger reward.

### FRONTEND REQUIREMENTS
- Customer profile page: show referral code with "Copy Code" and "Share via WhatsApp" buttons.
- Registration form: add optional "Referral Code" field.
- Customer dashboard: add "My Rewards" section showing wallet points and referral count.
- Admin panel: CustomerRewardsPage.tsx exists — wire it to the now-mounted endpoints.

> [!NOTE]
> **AGENT NOTES:** Referral reward amounts should be configurable in the settings table: keys "referral_referrer_points", "referral_new_customer_discount".

---

## UPDATE 10 | BALANCE SHEET CREATION

### OVERVIEW
Activate the balance sheet module. The balanceSheetController.js and balanceSheet.js route exist and are likely already mounted. The BalanceSheetPage.tsx exists in the admin panel. Ensure it shows: Total Revenue, Total Expenses, Net Profit/Loss, with date range filtering and PDF export.

### WHAT IT DOES
- Admin views a real-time balance sheet with Income vs Expenses for any date range.
- Income sources: job cart completions (job_services), package sales, manual bills, buy-sell.
- Expense sources: v2_expenses, staff salaries (staff_salary), inventory purchases (v2_purchases).
- Balance sheet shows Net Profit = Total Income − Total Expenses.
- Filter by: Today / This Week / This Month / Custom Date Range.
- Export to PDF and Excel.
- Charts: Income vs Expense bar chart per month (using Recharts — already installed).

### HOW IT WORKS
1. Backend aggregates income: SUM of job_services.service_price + job_services.labor_charges from completed job_carts, plus manual_bills.amount, plus package sales from user_packages.
2. Backend aggregates expenses: v2_expenses.amount + staff_salary.final_salary (paid) + v2_purchases.total_amount.
3. Response shape: { income: { services: X, packages: X, manualBills: X, total: X }, expenses: { operations: X, salaries: X, purchases: X, total: X }, netProfit: X, dateRange: {...} }.
4. balanceSheetController.js: build SQL queries with date range filters passed as query params.

### EXAMPLE / USER SCENARIO
> Admin opens Balance Sheet for May 2026:
> Income: Services ₹45,000 | Packages ₹38,000 | Manual Bills ₹12,000 → Total: ₹95,000.
> Expenses: Operations ₹18,000 | Salaries ₹25,000 | Purchases ₹8,000 → Total: ₹51,000.
> Net Profit: ₹44,000. Charts show monthly trends.
> Admin clicks "Export PDF" → gets a formatted balance sheet PDF.

### DATABASE CHANGES (Migration File Required)
- No new tables. Uses existing: job_services, job_carts, manual_bills, user_packages, v2_expenses, staff_salary, v2_purchases.
- Ensure v2_expenses has an expense_date column (it does per schema).

### BACKEND / API REQUIREMENTS
- Verify balanceSheetController.js has: getBalanceSheet(req, res) method with date_from and date_to query params.
- SQL: aggregate income from job_services JOIN job_carts WHERE status="complete" AND visit_date BETWEEN ? AND ?.
- SQL: aggregate expenses from v2_expenses WHERE expense_date BETWEEN ? AND ? UNION staff_salary UNION v2_purchases.
- Add PDF export endpoint: GET /api/balance-sheet/pdf → use Puppeteer (already used in invoiceService) to render.
- Add Excel export: GET /api/balance-sheet/excel → use ExcelJS (already installed).

### FRONTEND REQUIREMENTS
- BalanceSheetPage.tsx: ensure date range picker is wired to API query params.
- Show 3-column summary cards: Total Income (green), Total Expenses (red), Net Profit (blue/green).
- Add Recharts bar chart: monthly income vs expense for last 6 months.
- Add "Export PDF" and "Export Excel" buttons.

> [!NOTE]
> **AGENT NOTES:** Check if /api/balance-sheet route is already mounted in app.js. If yes, just fix the controller logic. If not, mount it.

---

## UPDATE 11 | BOOK BUTTON AVAILABILITY

### OVERVIEW
Control the visibility and availability of the "Book Now" button on the customer portal based on slot availability, package status, and admin-controlled booking windows. The button should reflect real-time availability.

### WHAT IT DOES
- Book button is visible only when active slots exist for future dates.
- If all slots are full (booked_count >= max_capacity), button shows "Slots Full" and is disabled.
- If customer has an active package with remaining credits, button is enabled for package-based booking.
- Admin can globally pause bookings (settings flag "bookings_paused") — button shows "Bookings Paused".
- Button shows a real-time count: "3 slots available today".
- Clicking book goes through the existing booking flow (slot selection → service selection → confirm).

### HOW IT WORKS
1. Frontend: on page load, GET /api/slots?date=today and /api/user-packages/active → compute availability.
2. If available slots > 0 AND (customer has package credits OR direct booking allowed) → button is active.
3. Backend: add settings key "bookings_paused" (boolean). settingsController handles this.
4. Admin: SettingsPage has a toggle "Pause All Bookings" that sets this flag.

### EXAMPLE / USER SCENARIO
> It's a Monday and all 6 slots are full. Customer opens app → "Book Now" button shows "Fully Booked Today — Check Tomorrow".
> Admin pauses bookings for a holiday → all customers see "Bookings Paused — We're closed. See you soon!".
> Customer has active Silver Package with 3 washes remaining → "Book" button is green and active.

### DATABASE CHANGES (Migration File Required)
- Add settings key: "bookings_paused" with value "0" or "1".
- No new tables needed.

### BACKEND / API REQUIREMENTS
- GET /api/slots: ensure response includes slot-level booked_count and max_capacity.
- GET /api/settings: return bookings_paused flag.
- Update slot availability logic to exclude past slots and blocked slots.

### FRONTEND REQUIREMENTS
- Customer portal booking button component: check 3 conditions before enabling: (1) bookings_paused = false, (2) available slots exist, (3) customer has credits or cash booking allowed.
- Show contextual disabled message: "Slots Full", "Bookings Paused", "Package Expired".
- Animate button with a subtle pulse when slots are limited (e.g., 1 slot left).

> [!NOTE]
> **AGENT NOTES:** Use React Query to auto-refresh slot availability every 60 seconds so customers see live updates.

---

## UPDATE 12 | WHATSAPP INTEGRATION — FULL

### OVERVIEW
Fully wire WhatsApp messaging. The v2_whatsapp_templates, v2_notification_logs tables exist. The whatsappController.js and messagingService.js exist. WhatsApp templates are defined in DB but the messaging service currently falls back to SMS.

### WHAT IT DOES
- WhatsApp messages sent via official WhatsApp Business API (Meta Cloud API) or via 2Factor/MSG91 WhatsApp gateway.
- All transactional events trigger WhatsApp first, SMS as fallback.
- Template messages for: booking confirmed, booking cancelled, package activated, service started, service done, delivery started, payment received, renewal reminder.
- Admin can send bulk WhatsApp to all customers or filtered segments.
- All sent messages logged in v2_notification_logs with status tracking.
- Admin panel shows WhatsApp delivery status (sent, delivered, read, failed).

### HOW IT WORKS
1. messagingService.js: update sendWhatsApp() to make a real API call to the WhatsApp gateway (2Factor or MSG91 WhatsApp API) instead of falling back to SMS.
2. Template variables are filled from the event context: { customerName, vehicleModel, serviceName, bookingDate, amount, etc. }.
3. For each event trigger, call messagingService.sendWhatsApp(mobile, templateName, variables).
4. Store result (success/fail) and message_id from gateway in v2_notification_logs.
5. Retry failed messages: cron job checks v2_notification_logs WHERE status = "failed" AND attempts < 3 → retry.

### EXAMPLE / USER SCENARIO
> Customer Anita books → WhatsApp arrives: "Hi Anita! Your booking for Body Wash is confirmed for 15 Jun at 10 AM. GK AutoHerb."
> Admin sends bulk message → all active package customers receive: "Reminder: Monsoon Special 20% off on all interior services this week!".
> Delivery failed → system retries after 30 min → if still failed, flags in notification_logs for admin review.

### DATABASE CHANGES (Migration File Required)
- All tables exist. Add WHATSAPP_API_KEY and WHATSAPP_PHONE_NUMBER_ID to .env.

### BACKEND / API REQUIREMENTS
- Update messagingService.js sendWhatsApp(): replace stub with real fetch() call to https://graph.facebook.com/v18.0/{phone_number_id}/messages (Meta API) or MSG91 WhatsApp endpoint.
- Map template names (from v2_whatsapp_templates) to Meta template IDs.
- Mount whatsappController routes in app.js if not already done: GET /api/whatsapp/templates, POST /api/whatsapp/send-bulk, GET /api/whatsapp/logs.
- Add retry cron job in cronService.js: every 30 min, retry failed notifications.

### FRONTEND REQUIREMENTS
- Admin MessagesPage: show WhatsApp vs SMS toggle. Show delivery status per message in logs.
- Add "Send WhatsApp Blast" button in MessagesPage for bulk campaigns.
- Show template preview before sending bulk messages.

> [!NOTE]
> **AGENT NOTES:** Use test sandbox (Meta) or MSG91 trial account during development. Do not use production credits for testing.

---

## UPDATE 13 | WHATSAPP REMINDER / CONFIRMATION

### OVERVIEW
Automate WhatsApp and SMS notifications for key lifecycle events: booking created, booking confirmed, service started, service done/delivered, package expiry reminder.

### WHAT IT DOES
- Booking Created (pending): "Your booking request has been received. We'll confirm shortly."
- Booking Confirmed (approved): "Confirmed! Your appointment on [date] at [time] for [service]."
- Service Started: "Your vehicle is now being serviced. Expected completion: [time]."
- Service Done: "Service complete! Your vehicle is ready for pickup / being dispatched."
- Package Expiry (7 days): "Your [Package Name] expires in 7 days. Renew to keep your benefits!"
- Package Expiry (1 day): "Last chance! Your package expires tomorrow. Renew now."
- Payment Received: "Payment of ₹[amount] received for [service/package]. Thank you!"

### HOW IT WORKS
1. Each trigger is called from its respective controller: bookingsController triggers booking messages, jobCartController triggers service messages, cronService handles expiry reminders.
2. messagingService.notify(customerId, eventType, data): looks up customer mobile from users table, picks correct template from v2_whatsapp_templates, substitutes variables, sends via WhatsApp/SMS.
3. cronService.js: add jobs for daily expiry scan at 9 AM and 5 PM.
4. All notifications logged in v2_notification_logs.

### EXAMPLE / USER SCENARIO
> Admin approves booking for Raj → system automatically sends WhatsApp to Raj's number.
> Admin advances job cart to "complete" → Raj gets: "Your car is ready! Please come for pickup.".
> June 8: Raj's Silver Package expires June 15 → On June 8 and June 14, he gets reminder messages.

### DATABASE CHANGES (Migration File Required)
- Uses v2_whatsapp_templates (already seeded with template bodies) and v2_notification_logs.

### BACKEND / API REQUIREMENTS
- Add notify(customerId, templateName, variables) helper in messagingService.js.
- Call this helper in: bookingsController.approve, bookingsController.reject, jobCartController.complete, deliveriesController.startDelivery, deliveriesController.completeDelivery, paymentsController.verifyPayment.
- cronService.js: add expiry reminder job querying user_packages WHERE expiry_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY).

### FRONTEND REQUIREMENTS
- Admin MessagesPage: shows log of all sent notifications with status.
- Customer can opt-out of promotional messages (not transactional) from profile settings.
- Show notification preferences toggle in customer profile page.

> [!NOTE]
> **AGENT NOTES:** Transactional messages (booking confirm, service done) cannot be opted out. Only promotional/reminder messages respect opt-out preference.

---

## UPDATE 14 | ROLE-BASED ACCESS CONTROL — EXTENDED

### OVERVIEW
Extend the existing 3-role system (admin/staff/customer) with granular permission control using the v2_roles and v2_role_permissions tables. This allows creating custom roles like "Reception", "Manager", "Technician" with specific access to modules.

### WHAT IT DOES
- Admin can create custom roles: e.g., "Reception" (can create bookings, view customers) vs "Technician" (can update job cart status, view today's queue).
- Each role has a set of permissions: array of allowed actions like ["bookings:read","bookings:create","job_carts:status_update"].
- Users can be assigned a custom role in addition to their base role (staff).
- Permission checks on backend: middleware reads user's role permissions and validates against requested action.
- Frontend: menu items are shown/hidden based on the user's effective permissions.

### HOW IT WORKS
1. Admin goes to Settings → Role Management → creates "Reception" role with permissions: view customers, create bookings, approve simple bookings.
2. Staff member Divya is assigned "Reception" role → she can now approve pending bookings but cannot see financial reports.
3. Backend middleware: checkPermission("bookings:approve") → looks up v2_role_permissions → allows/denies.

### EXAMPLE / USER SCENARIO
> Reception staff Divya logs in → her sidebar shows: Customers, Bookings, Quick Wash, Today's Jobs. No payroll, no financial reports.
> Admin creates a "Senior Tech" role with access to complete job carts AND view pricing. Assigns to senior mechanic.

### DATABASE CHANGES (Migration File Required)
- v2_roles and v2_role_permissions tables exist. Add staff_role_id FK to users or staff_members table if needed.

### BACKEND / API REQUIREMENTS
- Create permissionsMiddleware.js: reads user's assigned role from v2_roles → fetches permissions from v2_role_permissions → validates.
- Create CRUD routes for role management: GET/POST/PUT/DELETE /api/admin/roles, GET/POST /api/admin/roles/:id/permissions.
- Update user assignment: PUT /api/staff/:id now also accepts custom_role_id.

### FRONTEND REQUIREMENTS
- Admin Settings: add "Role Management" section — list roles, create role, assign permissions via checkbox grid.
- Staff sidebar and admin sidebar: filter menu items based on effective permissions fetched from /api/auth/me.
- Store permissions in Zustand auth store so they're available app-wide.

> [!NOTE]
> **AGENT NOTES:** Keep existing admin/staff/customer roles as "super roles" that override permission checks. Custom roles are additive for staff members.

---

## UPDATE 15 | PICKUP OPTIONS

### OVERVIEW
Activate and extend the v2_pickup_requests module. Allow customers to request vehicle pickup from their location during booking. Admin assigns a driver, and customer can track pickup status.

### WHAT IT DOES
- During booking, customer can opt for "Vehicle Pickup from My Location" (add-on service, chargeable or free based on settings).
- Customer provides their address and preferred pickup time.
- Admin sees pickup requests in a dedicated "Pickups" tab.
- Admin assigns a staff driver to the pickup.
- Driver gets notified (WhatsApp/in-app) of their pickup assignment.
- Customer can track driver location via existing Google Maps integration.
- Pickup status: pending → assigned → picked_up → at_workshop.

### HOW IT WORKS
1. Customer opts for pickup during booking: frontend shows address input + time picker.
2. Backend: POST /api/pickup-requests with booking_id, address, scheduled_time → inserts to v2_pickup_requests.
3. Admin panel: GET /api/pickup-requests → list of pending pickups → assign driver: PATCH /api/pickup-requests/:id/assign → updates assigned_staff_id, sends WhatsApp to driver.
4. Driver marks pickup done: PATCH /api/pickup-requests/:id/picked-up → status changes → customer notified.
5. Integrate with deliveries module for return drop-off.

### EXAMPLE / USER SCENARIO
> Customer Ananya books a Full Detailing and checks "Vehicle Pickup". She enters her address: "12 Sunrise Apartments, Bodakdev".
> Admin sees pickup request → assigns Driver Ravi.
> Ravi gets WhatsApp: "Pickup assigned: Ananya, 12 Sunrise Apartments. ETA 10:30 AM. GK AutoHerb."
> Customer's app shows: "Driver is on the way — Track Here" with live map.

### DATABASE CHANGES (Migration File Required)
- v2_pickup_requests table exists with all required columns.
- Add pickup_charges DECIMAL(10,2) DEFAULT 0.00 to v2_pickup_requests if not present.

### BACKEND / API REQUIREMENTS
- Create pickupController.js with methods: create, list, assign, markPickedUp, getMyPickup.
- Create routes/pickup.js and mount in app.js.
- Reuse deliveriesController location tracking for live pickup tracking.

### FRONTEND REQUIREMENTS
- Booking flow: add "Request Pickup" toggle with address and time fields.
- Admin panel: add "Pickups" menu item in sidebar → PickupsPage showing pending/assigned requests.
- Customer dashboard: show pickup status badge when pickup is requested.

> [!NOTE]
> **AGENT NOTES:** Pickup charge amount should be in settings: key "pickup_charge_amount". 0 means free pickup.

---

## UPDATE 16 | MANUAL SLOT BOOKING — OFFLINE CLIENT

### OVERVIEW
Allow admin to manually create a booking for a walk-in or phone customer without requiring the customer to log in or use the app. This bypasses the normal customer-initiated booking flow.

### WHAT IT DOES
- Admin can book a slot for any existing customer (lookup by mobile/name) or create a guest booking.
- Admin selects: customer, vehicle, date/slot, services — and confirms booking directly (skipping "pending_approval" stage).
- Admin-created bookings are auto-confirmed (status = "confirmed" immediately).
- Customer receives WhatsApp/SMS confirmation of their admin-created booking.
- Admin can add internal notes (booking_notes) on the booking.
- These bookings appear in all the same lists and reports as online bookings.

### HOW IT WORKS
1. Admin goes to Bookings → "Create Manual Booking" button.
2. Searches customer by mobile → selects Mahesh → selects his Honda City → picks June 20 11 AM slot → selects "Full Body Wash".
3. System creates booking with status = "confirmed", approved_by = admin_id, approved_at = now().
4. Mahesh gets WhatsApp: "Your appointment for Full Body Wash on June 20 at 11 AM is confirmed!".

### DATABASE CHANGES (Migration File Required)
- No new tables. bookings table has all required columns including booking_notes, approved_by.

### BACKEND / API REQUIREMENTS
- Add POST /api/bookings/manual (admin only) in bookingsController.js.
- Logic: validate slot availability → insert booking with status = "confirmed", approved_by = admin, approved_at = NOW() → increment slot booked_count → deduct package credits if applicable → send confirmation message.
- Reuse existing slot capacity check logic from bookingsController.create.

### FRONTEND REQUIREMENTS
- Admin Bookings page: add "Create Manual Booking" button.
- Modal with: customer search (LiveSearch component exists), vehicle selector, date picker, slot selector, service multi-select, notes.
- After creation, redirect to booking detail page.

> [!NOTE]
> **AGENT NOTES:** This is different from Update #20 (offline slot blocking). This creates actual bookings for real customers, not blocks.

---

## UPDATE 17 | CAR DETAILS IN MANUAL BILLING WITHOUT JOB CARD

### OVERVIEW
Enhance the manual billing (Quick Billing / manual_bills) flow to capture and display car details (brand, model, registration number) even when there is no associated job cart. Currently manual_bills has customer_name, customer_mobile but no vehicle fields.

### WHAT IT DOES
- Manual bill form has optional vehicle fields: Brand, Model, Registration Number.
- These are stored on the manual bill record for invoice accuracy.
- Invoice PDF generated for manual bills shows car details if provided.
- Admin can search manual bills by registration number.
- Car details on manual bill do not create a vehicles record — they are ad-hoc fields.

### HOW IT WORKS
1. Customer Ramesh arrives without prior registration. Admin creates a quick manual bill.
2. Admin fills: Name = Ramesh, Mobile = 9876543210, Car = Maruti Baleno, Reg = GJ06ZZ1234.
3. Invoice PDF shows: "Vehicle: Maruti Baleno | GJ06ZZ1234".
4. Admin can later search "GJ06ZZ1234" and find this bill.

### DATABASE CHANGES (Migration File Required)
- Add columns to manual_bills: vehicle_brand VARCHAR(80), vehicle_model VARCHAR(80), vehicle_reg_no VARCHAR(20).
- Create migration: server/migrations/061_add_vehicle_to_manual_bills.sql.

### BACKEND / API REQUIREMENTS
- Update billingController.create and billingController.getOne to handle vehicle_brand, vehicle_model, vehicle_reg_no fields.
- Update manual_bills list query to support filtering by vehicle_reg_no.
- Update invoiceService.js manual bill PDF template to include vehicle details row.

### FRONTEND REQUIREMENTS
- QuickBillingPage.tsx: add optional Vehicle section with Brand, Model, Reg No inputs.
- Manual bill invoice PDF: show vehicle row below customer info if vehicle fields are present.
- Add search filter in manual bills list by registration number.

> [!NOTE]
> **AGENT NOTES:** Fields are optional. Existing manual bills without vehicle data should display gracefully.

---

## UPDATE 18 | CUSTOM PACKAGE CREATION MODULE

### OVERVIEW
Allow admin to create fully custom packages tailored to specific customer needs — choosing specific services, counts, validity, and price — beyond the standard catalog packages (Bronze/Silver/Gold). These custom packages can be assigned directly to a customer.

### WHAT IT DOES
- Admin can create a one-off custom package for a specific customer.
- Custom package: admin defines name, included services, service counts, validity in days, and price per car type.
- Custom packages are NOT shown in the public packages catalog (visible_to_customer = 0).
- Once created, admin assigns it directly to the customer → creates user_packages entry.
- Customer sees their custom package on their dashboard just like a standard package.
- Custom packages appear in admin's packages list with a "Custom" badge.

### HOW IT WORKS
1. Admin opens Packages → "Create Custom Package" button.
2. Fills: Name = "VIP Plan - Raj", Services: [Full Wash x5, Interior x2, Waxing x1], Validity = 90 days, Price SUV = ₹9,500.
3. Saves package → assigned directly to Raj's account.
4. Raj opens app → sees "VIP Plan - Raj" package with his entitlements.

### DATABASE CHANGES (Migration File Required)
- No new tables. Uses existing packages, package_services, and user_packages tables.
- Add column to packages: is_custom TINYINT(1) DEFAULT 0.
- Create migration: server/migrations/062_add_custom_package_flag.sql.

### BACKEND / API REQUIREMENTS
- Update packagesController.create to accept is_custom flag.
- Add POST /api/packages/custom-assign (admin only): create package + assign to customer in one transaction.
- Ensure custom packages are excluded from public GET /api/packages list (WHERE is_custom = 0 OR is_custom IS NULL for customers).

### FRONTEND REQUIREMENTS
- Admin PackagesPage: add "Create Custom Package" button that opens a full-featured form.
- Custom package form: service multi-select with count inputs per service, validity days, per-car-type pricing.
- Custom packages shown in admin list with "CUSTOM" badge, hidden from customer catalog.
- After creation, prompt admin: "Assign to customer?" → customer search → assign.

> [!NOTE]
> **AGENT NOTES:** Custom package creation is an admin-only operation. Customers cannot request or see custom packages in the catalog.

---

## UPDATE 19 | OLD CUSTOMER PACKAGE HISTORY DATA EXPORT

### OVERVIEW
Allow admin to export the full package usage history for any customer or for all customers. Data includes package purchased, services used, dates, remaining credits, and renewal history. Export as Excel (.xlsx) or PDF.

### WHAT IT DOES
- Admin opens a customer profile → exports that customer's full package history.
- Admin can also bulk export all customers' package histories for a date range.
- Export includes: Package Name, Purchase Date, Expiry Date, Services Used, Services Remaining, Renewal Dates, Amount Paid.
- File format: Excel (.xlsx using ExcelJS — already installed) or PDF (Puppeteer).
- Export button available on CustomerDetailPage and on a dedicated Reports section.

### HOW IT WORKS
1. Admin opens Meera's profile → clicks "Export Package History".
2. Gets an Excel file: "Meera_Package_History_2026.xlsx" with rows for each package cycle.
3. Also exports "All Customers Package Data" filtered by June 2026 — for monthly audit.

### DATABASE CHANGES (Migration File Required)
- No new tables. Uses user_packages, v2_package_renewals, v2_package_usage_logs, package_requests.

### BACKEND / API REQUIREMENTS
- Add GET /api/customers/:id/package-history/export?format=xlsx|pdf (admin only).
- Add GET /api/reports/package-history?date_from=&date_to=&format=xlsx (admin bulk export).
- Use ExcelJS to build multi-sheet workbook: Sheet 1 = Summary, Sheet 2 = Usage Log, Sheet 3 = Renewals.
- Use Puppeteer for PDF export of the same data.

### FRONTEND REQUIREMENTS
- CustomerDetailPage: add "Export Package History" button.
- ReportsPage: add "Package History Report" section with date range + customer filter + format selector.
- Download triggers file download via Axios blob response.

> [!NOTE]
> **AGENT NOTES:** Use existing reportService.js pattern for Excel generation — it already uses ExcelJS.

---

## UPDATE 20 | OFFLINE SLOT BOOKING VIA ADMIN

### OVERVIEW
Allow admin to reserve/block specific slots for walk-in customers or planned maintenance — without creating a customer booking. This is different from manual booking (#16) which creates a booking for a specific customer. This is pure slot-level management.

### WHAT IT DOES
- Admin can block a specific slot (date + time) with a reason: "Walk-in Reserved", "Staff Training", "Equipment Maintenance".
- Blocked slots have a label/note visible to admin but appear as "Unavailable" to customers.
- Admin can unblock slots at any time.
- Admin can also reduce max_capacity of a slot (e.g., reduce from 6 to 3 for a day).
- Blocked slots are tracked in the v2_blocked_slots table.

### HOW IT WORKS
1. Admin blocks Tuesday 2 PM slot → "Blocked: Staff Training". Customers trying to book see "Unavailable".
2. Admin reduces Thursday capacity from 6 to 4 → only 4 customers can book that day.
3. Admin unblocks the slot after training ends → slot immediately available again.

### DATABASE CHANGES (Migration File Required)
- v2_blocked_slots table exists. slots table has is_blocked flag and max_capacity column.

### BACKEND / API REQUIREMENTS
- Update slotsController.toggleBlock to accept an optional reason parameter and log to v2_blocked_slots.
- Add PATCH /api/slots/:id/capacity (admin only): update max_capacity on a specific slot.
- Ensure GET /api/slots filters blocked slots for customer role.

### FRONTEND REQUIREMENTS
- Admin SlotsPage: show "Block Slot" modal with reason input when clicking a slot.
- Show blocked reason as tooltip on blocked slots in admin calendar view.
- Slot capacity edit: inline number input on each slot in admin view.

> [!NOTE]
> **AGENT NOTES:** v2_blocked_slots is for audit/notes. The actual block is controlled by slots.is_blocked flag. Keep both in sync.

---

## UPDATE 21 | LIVE TRACKING OF SERVICE

### OVERVIEW
Build a real-time service status tracker for customers — showing the current stage of their vehicle's service from check-in to completion. Uses the existing Socket.io infrastructure and v2_tracking_history table.

### WHAT IT DOES
- Customer sees a real-time progress tracker: Check-in → Inspection → Washing → Polishing → Quality Check → Ready.
- Each stage is updated by admin/staff from the job cart detail page.
- Updates are pushed via Socket.io to the customer's app instantly.
- Stage history is saved in v2_tracking_history for post-service review.
- Customer receives WhatsApp notification when their car is "Ready for Pickup".
- Estimated completion time is shown alongside the current stage.

### HOW IT WORKS
1. Admin opens Job Cart for GJ01AB1234 → clicks "Start Service" → stage moves to "Washing".
2. Customer Kapil's app shows: "Washing" stage highlighted in the progress bar.
3. Admin clicks "Complete" → stage = "Ready for Pickup" → Kapil gets WhatsApp: "Your car is ready!".
4. Kapil can see the full timeline: "9:00 Check-in → 9:15 Washing → 10:30 Quality Check → 11:00 Ready".

### DATABASE CHANGES (Migration File Required)
- v2_tracking_history exists. Verify columns: job_cart_id, stage, changed_by, notes, created_at.
- Add estimated_completion_at DATETIME DEFAULT NULL to job_carts if not present.

### BACKEND / API REQUIREMENTS
- Add PATCH /api/job-carts/:id/tracking-stage (admin/staff) — stage values: ["checked_in","inspection","washing","polishing","quality_check","ready","delivered"].
- On update: INSERT to v2_tracking_history → emit socket event "job:stage_updated" with { jobCartId, stage, timestamp }.
- Add GET /api/job-carts/:id/tracking — returns v2_tracking_history for a job cart.
- Add estimated_completion_at to job cart update endpoints.

### FRONTEND REQUIREMENTS
- Customer My Jobs / Job Detail page: add service timeline component using v2_tracking_history data.
- Socket.io client: listen for "job:stage_updated" → update stage in real-time.
- Admin Job Cart Detail: add stage stepper with "Advance Stage" button.
- Show estimated completion time input for admin when starting service.

> [!NOTE]
> **AGENT NOTES:** Socket.io is already set up (socket.io v4.7.5 on backend, socket.io-client on frontend). Reuse existing io instance.

---

## UPDATE 22 | SHARE / SEND FILES FROM WEBAPP

### OVERVIEW
Activate the file sharing module. The v2_file_attachments table, fileSharingController.js, and routes/sharedFiles.js already exist. Allow admin to share invoices, before/after photos, and reports with customers via shareable links.

### WHAT IT DOES
- Admin can generate a shareable link for any invoice, job photo, or report.
- Shareable link works without login — customer opens it in browser.
- Links can have expiry (24h, 7 days, permanent).
- Customer portal: "Share" button on invoice and job photos → generates link or WhatsApp share.
- Admin can send file link directly via WhatsApp from the admin panel.
- File types supported: PDF invoices, Cloudinary image URLs (before/after photos).

### HOW IT WORKS
1. Admin completes job → clicks "Share Before/After Photos" → gets shareable link.
2. Admin pastes link into WhatsApp → customer opens → sees both photos side by side.
3. Customer on portal: opens their completed job → clicks "Share Invoice" → copies link or shares via WhatsApp.

### DATABASE CHANGES (Migration File Required)
- v2_file_attachments table exists. Add columns: share_token VARCHAR(64) UNIQUE, share_expires_at DATETIME, share_created_by INT.
- Create migration: server/migrations/063_add_share_token.sql.

### BACKEND / API REQUIREMENTS
- Mount sharedFiles routes in app.js if not done: GET /api/shared-files, POST /api/shared-files/generate-link, GET /api/shared/:token (public — no auth).
- generateLink endpoint: creates a UUID token, stores in v2_file_attachments, returns shareable URL.
- Public GET /api/shared/:token: validates token, checks expiry, returns file URL or renders PDF.

### FRONTEND REQUIREMENTS
- Job Cart Detail admin/customer: add "Share" button on photos and invoice sections.
- Share modal: shows generated link with copy button + WhatsApp share button.
- WhatsApp share uses: https://wa.me/?text=Your+photos+are+ready:+{link}.

> [!NOTE]
> **AGENT NOTES:** For security, share tokens should be cryptographically random (crypto.randomBytes(32).toString("hex")). Never expose internal file IDs.

---

## UPDATE 23 | SHOW SERVICES WITH DURATION

### OVERVIEW
Display service duration prominently on all service listing pages and the booking flow so customers know how long each service takes. The services table already has duration_minutes column.

### WHAT IT DOES
- Every service card shows: "~60 min" or "~2 hrs" duration label.
- Booking flow: when customer selects multiple services, show total estimated duration.
- Admin services management: duration is editable per service.
- Quick Wash queue: shows estimated completion time based on duration.
- Package services list: shows per-service duration so customer knows session length.

### HOW IT WORKS
1. Customer selects "Full Body Wash (45 min)" + "Interior Cleaning (60 min)" → sees "Total: ~1 hr 45 min".
2. Quick Wash queue admin view: car entered queue at 10:00 AM, duration 45 min → shows "Est. done by 10:45 AM".

### DATABASE CHANGES (Migration File Required)
- No DB changes. duration_minutes already exists in services table.

### BACKEND / API REQUIREMENTS
- GET /api/services: ensure duration_minutes is included in response (verify it's not excluded in current SELECT).
- GET /api/bookings (detail): calculate and return total_duration from sum of linked service durations.

### FRONTEND REQUIREMENTS
- Services page: add duration badge on each service card: "clock icon + 45 min".
- Booking modal: show running total duration as services are selected.
- Admin ServicesPage: duration field is editable inline.
- Format helper: formatDuration(minutes) → "45 min" or "1 hr 30 min".

> [!NOTE]
> **AGENT NOTES:** Add formatDuration() to client/src/utils/formatters.ts — this fits the existing utility pattern.

---

## UPDATE 24 | NEW CUSTOMER DISCOUNT REWARDS

### OVERVIEW
Automatically apply a welcome discount or reward points to new customers on their first booking. Configurable by admin via settings. Works with the existing wallet/reward system (v2_wallets, v2_reward_logs).

### WHAT IT DOES
- New customers (first booking ever) automatically get a welcome reward: ₹50 off or 100 reward points.
- Reward type and amount are configurable in admin settings.
- Welcome bonus is applied at time of first booking confirmation.
- Customer sees "Welcome Bonus Applied: -₹50" on their booking confirmation.
- Admin can see which customers received welcome bonuses in a report.
- Welcome bonus is a one-time offer — not repeatable.

### HOW IT WORKS
1. New customer Kiran books for the first time → system checks: is this Kiran's first ever confirmed booking? YES.
2. System credits 100 points to Kiran's v2_wallets → logs in v2_reward_logs with action = "welcome".
3. Kiran's profile shows: "Welcome Bonus: 100 Points".
4. Admin settings: "New Customer Welcome Reward: 100 points | ₹50 cash discount". Toggle on/off.

### DATABASE CHANGES (Migration File Required)
- v2_wallets and v2_reward_logs exist with all required columns.
- Add settings keys: "welcome_reward_type" (points/discount), "welcome_reward_value" (number).

### BACKEND / API REQUIREMENTS
- In bookingsController.approve: after confirming booking, query COUNT(*) of all previous confirmed bookings for this customer. If count = 0 (this is first) → trigger welcome reward.
- Welcome reward: if type = "points" → upsert v2_wallets, insert v2_reward_logs. If type = "discount" → apply to booking total or create a discount code.
- Add GET /api/reports/welcome-rewards (admin) — list of customers who received welcome bonuses.

### FRONTEND REQUIREMENTS
- Booking confirmation screen: show "Welcome Bonus!" banner if welcome reward was applied.
- Customer wallet/rewards page: show "Welcome Bonus: 100 pts on [date]".
- Admin SettingsPage: add "New Customer Rewards" section.

> [!NOTE]
> **AGENT NOTES:** Check for first booking AFTER approval, not on creation — to avoid awarding points to cancelled/rejected bookings.

---

## UPDATE 25 | SMS AND WHATSAPP MESSAGES — JOB EVENTS

### OVERVIEW
Ensure that job-lifecycle events (booking created, confirmed, service started, service done, delivery) all trigger both WhatsApp and SMS messages. This is the message trigger wiring — complementary to Update #13 which sets up the messaging infrastructure.

### WHAT IT DOES
- Booking Requested (by customer): WhatsApp + SMS → "Booking received. We'll confirm shortly."
- Booking Confirmed (by admin): WhatsApp + SMS → "Confirmed for [date] at [time]."
- Job Started (job cart open): WhatsApp → "Your vehicle service has begun."
- Job Done (job cart complete): WhatsApp + SMS → "Your vehicle is ready for pickup!"
- Delivery Started: WhatsApp → "Your vehicle is on its way. Driver: [name]."
- Delivery Done: WhatsApp + SMS → "Your vehicle has been delivered. Thank you!"

### HOW IT WORKS
1. Each event calls messagingService.notify() with the correct template name and variables.
2. Two-channel delivery: attempt WhatsApp first. If fails, fallback to SMS automatically.
3. Log both attempts in v2_notification_logs.
4. Admin can see message delivery status per job in the Messages log.

### EXAMPLE / USER SCENARIO
> Raj books → gets WhatsApp. Admin confirms → Raj gets another WhatsApp + SMS.
> When job cart status changes to "complete" → Raj gets WhatsApp: "Your car is ready!".
> Driver dispatched → Raj gets WhatsApp: "On the way! Driver Suresh: 9876543210."

### DATABASE CHANGES (Migration File Required)
- No new tables. Uses messages_log and v2_notification_logs.

### BACKEND / API REQUIREMENTS
- Update each controller to call notify() at the right trigger point.
- bookingsController: create → notify "booking_received". approve → notify "booking_confirmed". reject → notify "booking_rejected".
- jobCartController: complete → notify "service_complete".
- deliveriesController: startDelivery → notify "delivery_started". completeDelivery → notify "delivery_done".

### FRONTEND REQUIREMENTS
- MessagesPage admin: show all notifications grouped by customer with delivery status.
- Job Cart Detail admin: show "Messages Sent" section — list of triggered notifications.

> [!NOTE]
> **AGENT NOTES:** Keep a MESSAGES_ENABLED env flag so messaging can be disabled during development/testing.

---

## UPDATE 26 | CUSTOMER PACKAGE DETAILS FROM ADMIN

### OVERVIEW
Give admin a clear, comprehensive view of any customer's package details: current package, services remaining, usage history, and upcoming expiry — all in one place accessible from CustomerDetailPage.

### WHAT IT DOES
- Admin opens any customer profile → "Package" tab shows: active package name, car type, total/remaining/used counts per service, expiry date, and renewal history.
- Admin can see ALL packages the customer ever had (including expired ones).
- Admin can see which bookings consumed package credits (usage log).
- From this view, admin can: renew package, manually adjust service credits, add note.
- If customer has no package, show "No active package. Assign package?" CTA.

### HOW IT WORKS
1. Admin searches customer Priya → opens her profile → clicks "Packages" tab.
2. Sees: Silver Package | Honda City SUV | Active until July 30 | Washes: 8 used, 4 remaining | Waxing: 1 used, 1 remaining.
3. Also sees expired Bronze Package from March 2026.
4. Admin clicks "Adjust Credits" → manually adds 2 wash credits (with reason note).

### DATABASE CHANGES (Migration File Required)
- No new tables. Uses user_packages, v2_package_usage_logs, v2_package_renewals, package_services.

### BACKEND / API REQUIREMENTS
- GET /api/customers/:id/packages: ensure it returns full detail including service entitlements with used/remaining counts.
- Add GET /api/customers/:id/packages/:packageId/usage-log: returns v2_package_usage_logs for this customer-package.
- Add PATCH /api/user-packages/:id/adjust-credits (admin only): manually add/subtract service credits with reason note.

### FRONTEND REQUIREMENTS
- CustomerDetailPage: enhance "Packages" tab — show service-by-service credit breakdown as a mini-table.
- Add usage log collapsible section per package.
- Add "Adjust Credits" button with modal (service select, delta amount, reason).
- Show renewal history as timeline.

> [!NOTE]
> **AGENT NOTES:** Credit adjustments must be logged in v2_audit_logs with old_value and new_value for audit trail.

---

## UPDATE 27 | MULTIPLE PACKAGES FOR MULTIPLE CARS

### OVERVIEW
Allow a customer with multiple vehicles to have separate packages for each vehicle. Currently user_packages links to user_id but not specifically to a vehicle_id. This update adds vehicle-level package tracking.

### WHAT IT DOES
- Customer can have Package A for Car 1 and Package B for Car 2.
- Each user_packages record is associated with a specific vehicle_id.
- During booking, system checks the package for the specific vehicle being booked.
- Admin can assign different packages to different cars of the same customer.
- Customer dashboard shows package per car: "i20 → Silver Package | City → Gold Package".

### HOW IT WORKS
1. Priya has two cars: Honda i20 (Hatchback) with Silver Package, and Innova (SUV) with Gold Package.
2. When she books for i20, system uses Silver Package credits. When for Innova, uses Gold Package credits.
3. Admin's CustomerDetailPage shows both packages with their respective cars.

### DATABASE CHANGES (Migration File Required)
- Add vehicle_id FK to user_packages: ALTER TABLE user_packages ADD COLUMN vehicle_id INT UNSIGNED DEFAULT NULL.
- Create migration: server/migrations/064_add_vehicle_to_user_packages.sql.
- NULL vehicle_id = package applies to primary vehicle (backward compatible).

### BACKEND / API REQUIREMENTS
- Update userPackagesController.getActivePackage: if vehicle_id is passed in query, filter by vehicle_id.
- Update packagesController.assignPackage: accept and store vehicle_id.
- Update bookingsController: when checking package credits, use vehicle_id to find the correct user_package.

### FRONTEND REQUIREMENTS
- Customer profile: show packages grouped by vehicle.
- Booking flow: when customer selects a vehicle, auto-load that vehicle's package.
- Admin assign package modal: add "Select Vehicle" dropdown.

> [!NOTE]
> **AGENT NOTES:** Backward compatibility: user_packages with vehicle_id = NULL are treated as applying to the customer's primary vehicle.

---

## UPDATE 28 | INVENTORY MANAGEMENT WITH ACCESSORIES IMAGES

### OVERVIEW
Enhance the inventory module (currently covers consumables like shampoos, pads) to include car accessories (seat covers, perfumes, mats, etc.) with product images. The v2_inventory_items table is schema-ready with image_url. The inventory table also has images_json.

### WHAT IT DOES
- Admin can create inventory items in two categories: Consumables (chemicals, pads) and Accessories (products for resale).
- Each item can have up to 5 product images (uploaded to Cloudinary).
- Accessories items have: purchase_price, selling_price, SKU/barcode, category, vendor, min/max stock levels.
- Stock movements (purchase_in, usage_out, adjustment) logged in v2_inventory_movements.
- Low stock alerts when current_stock < min_stock_level → shown on admin dashboard.
- Admin can generate purchase orders when stock is low.
- Accessories can be added to job carts and manual bills as line items.

### HOW IT WORKS
1. Admin adds: Car Freshener — Brand: Ambi Pur, SKU: AP-001, Purchase ₹120, Selling ₹200, Stock: 25.
2. Uploads 2 product photos.
3. Staff sells one at counter → admin records in manual bill as "Ambi Pur Freshener x1 = ₹200".
4. Stock updates: 25 → 24. When stock hits 5 (min level), admin dashboard shows: "⚠ Ambi Pur Freshener: Low Stock (5 left)".

### DATABASE CHANGES (Migration File Required)
- v2_inventory_items has: item_name, sku, barcode, category, unit, current_stock, min_stock_level, max_stock_level, purchase_price, selling_price, vendor_id, image_url.
- v2_inventory_movements exists for stock log.
- Add item_type ENUM("consumable","accessory") DEFAULT "consumable" to v2_inventory_items.
- Create migration: server/migrations/065_add_item_type_to_inventory.sql.

### BACKEND / API REQUIREMENTS
- Create inventoryV2Controller.js: CRUD for v2_inventory_items + stock movement recording + image upload.
- Mount at /api/v2/inventory with full CRUD + POST /api/v2/inventory/:id/images (Cloudinary upload) + POST /api/v2/inventory/:id/stock-in + POST /api/v2/inventory/:id/stock-out.
- Add GET /api/v2/inventory/low-stock for dashboard alerts.

### FRONTEND REQUIREMENTS
- Admin InventoryPage: add tabs — "Consumables" | "Accessories".
- Accessories tab: product card grid with image, price, stock badge.
- Image upload (up to 5 photos) using existing FileUpload component.
- Low stock section on admin dashboard: use existing StatCard pattern.
- Add accessories to job cart and manual bill line items.

> [!NOTE]
> **AGENT NOTES:** Keep existing /api/inventory routes for backward compatibility. New v2 inventory is a parallel enhanced system.

---

## UPDATE 29 | ACCOUNTS MANAGEMENT — FULL MODULE

### OVERVIEW
Build a comprehensive accounts and financial management module covering sales bills, purchase bills, GST records, payment management, and all financial reports. Many tables are schema-ready (v2_gst_records, v2_purchases, v2_expenses, v2_purchase_items).

### WHAT IT DOES
- Sales Bills: generate GST-compliant tax invoices for all services rendered. Track paid/unpaid status.
- Purchase Bills: record vendor purchases with item-level detail using v2_purchases + v2_purchase_items.
- Sales Return / Purchase Return: record credit/debit notes against existing bills.
- GST Report: monthly GSTR-1 (sales) and GSTR-2 (purchase) summaries with CGST/SGST/IGST breakdown.
- Payment Management: track all incoming and outgoing payments with due dates.
- Auto Reminders: cron job sends reminders for pending payments and overdue amounts.
- Balance Sheet: income vs expenses with net profit (extends Update #10).
- Service-wise Sales Report: how much revenue per service type per period.
- All Reports: daily/weekly/monthly P&L, top customers, top services.

### HOW IT WORKS
1. Admin records a vendor purchase: Cartronics, 10 Carnauba Wax tins @ ₹350 each = ₹3,500 + 18% GST.
2. System creates v2_purchases record + v2_purchase_items + v2_gst_records entry.
3. At month end, admin runs "GST Report June 2026" → gets GSTR-1 (sales) CSV with all taxable transactions.
4. "Service-wise Report" shows: Full Wash → ₹45,000 revenue | Coating → ₹82,000 revenue.

### DATABASE CHANGES (Migration File Required)
- v2_gst_records: record_type (sales/purchase), taxable_amount, cgst, sgst, igst, period_month, period_year.
- v2_purchases + v2_purchase_items: purchase header + line items.
- v2_expenses: operational expenses already exist.
- Add is_gst_applicable TINYINT(1) DEFAULT 0 and gstin VARCHAR(20) to settings.
- Add return_bills table: id, original_bill_id, return_type ENUM("sales_return","purchase_return"), amount, reason, created_at.
- Create migration: server/migrations/066_accounts_module.sql.

### BACKEND / API REQUIREMENTS
- Create accountsController.js with all financial aggregation queries.
- Create purchaseBillsController.js: CRUD for v2_purchases + auto-update v2_inventory_items.current_stock on purchase.
- Create gstController.js: generate GSTR-1 and GSTR-2 data from v2_gst_records.
- On every invoice generation (job cart complete, package sale, manual bill): auto-insert v2_gst_records if GST is enabled.
- Create route files and mount in app.js: /api/accounts, /api/purchase-bills, /api/gst-reports.
- Add service-wise revenue query in reportsController.js.

### FRONTEND REQUIREMENTS
- Admin AccountsPage: multi-tab layout — Overview | Sales Bills | Purchase Bills | GST | Payments | Reports.
- Purchase bill form: vendor selector + line items table (item, qty, unit price, total).
- GST Report: month/year selector → summary card + downloadable CSV/Excel.
- Service-wise report: bar chart (Recharts) showing revenue per service.
- ReportsPage: add new report cards for service-wise sales and GST summaries.

> [!NOTE]
> **AGENT NOTES:** AccountsPage.tsx already exists with basic structure. Enhance rather than replace. The existing accounts route may already be partially mounted — check app.js first.

---

## UPDATE 30 | STAFF SEPARATE LOGIN AND HR MODULES

### OVERVIEW
Build out the complete staff HR system: task assignment, salary management, role-based access, and leave management. Tables v2_tasks, v2_payroll, v2_leaves, and staff_attendance already exist. StaffHRPage.tsx and staffHRController.js exist.

### WHAT IT DOES
- Task Assignment: admin assigns tasks to staff (v2_tasks table) with priority, due date, linked job cart.
- Staff can view their tasks and mark them as in_progress / completed from their dashboard.
- Salary Management: admin sets base salary per staff, processes monthly payroll using v2_payroll.
- Payroll calculation: (present_days / working_days) * base_salary + overtime_pay + bonuses - deductions.
- Leave Management: staff applies for leave (v2_leaves). Admin approves/rejects. Leave days deducted from payroll.
- Staff can see their: tasks, attendance history, salary slips, leave balance.
- Admin HR view: all staff tasks, payroll summary, leave requests.
- Role assignment: assign custom roles (from Update #14) to staff members.

### HOW IT WORKS
1. Admin assigns task to Suresh: "Vacuum and dry Honda City (Job #45)", Priority: High, Due: Today 3 PM.
2. Suresh logs in → sees task in his dashboard → marks "In Progress" → later "Completed".
3. Month end: admin goes to HR → Payroll → "Process June Salary" for all staff.
4. Mechanic Ravi applied for 2 sick leaves → admin approves → payroll auto-deducts 2 days.

### DATABASE CHANGES (Migration File Required)
- v2_tasks: title, description, assigned_to, assigned_by, job_cart_id, priority, status, due_date.
- v2_payroll: staff_id, month, year, base_salary, present_days, absent_days, leave_days, overtime_hours, overtime_pay, deductions, bonuses, net_salary, payment_status.
- v2_leaves: staff_id, leave_type, from_date, to_date, days_count, status.
- staff_attendance: already exists with clock-in/out.

### BACKEND / API REQUIREMENTS
- Mount staffHR routes in app.js (staffHRController and staffHRPage exist but may not be fully wired).
- Add task routes: GET/POST /api/tasks (admin), GET /api/tasks/my (staff), PATCH /api/tasks/:id/status (staff).
- Add payroll routes: POST /api/payroll/process (admin), GET /api/payroll/:staffId (admin/staff).
- Add leave routes: POST /api/leaves (staff), GET /api/leaves (admin/staff), PATCH /api/leaves/:id/approve (admin).
- Payroll calculation: query staff_attendance for the month → compute present_days → apply formula.

### FRONTEND REQUIREMENTS
- StaffHRPage: add tabs — Tasks | Payroll | Leaves | Attendance.
- Staff dashboard: add "My Tasks" widget showing pending tasks with priority color codes.
- Payroll tab: process button, payroll summary table, individual salary slips (PDF download).
- Leave tab: staff leave request form + admin approval table.
- Task creation modal: staff selector, priority, due date, optional job cart link.

> [!NOTE]
> **AGENT NOTES:** StaffHRPage.tsx and staffHRController.js exist — check what's already implemented and build on top rather than rewriting.

---

## UPDATE 31 | FEEDBACK COLLECTION VIA CRM

### OVERVIEW
Activate the feedback/review system. v2_feedback, v2_review_requests tables exist. feedbackController.js exists. The system should automatically request feedback after service completion, collect ratings, and allow admin to respond.

### WHAT IT DOES
- After job cart completion, system auto-sends a feedback request link via WhatsApp/SMS.
- Feedback form (public page — no login required): collects overall_rating, service_rating, staff_rating, cleanliness_rating, comments.
- Admin can view all feedback, respond to individual reviews, and mark them as public.
- Public feedback (is_public = 1) can be shown on the customer-facing website.
- Automated follow-up: if customer doesn't respond in 24h, send one reminder.
- Admin dashboard shows: avg rating, rating distribution chart, recent feedback.
- Admin can filter feedback by: date, rating, service, staff.

### HOW IT WORKS
1. Kapil's car service is done. He gets WhatsApp: "How was your experience? Rate us: [link]".
2. He opens the link (no login needed) → gives 5 stars, writes "Excellent work!".
3. Admin sees new review in FeedbackPage → clicks "Reply" → "Thank you Kapil! See you soon.".
4. Admin marks it as "Public" → shows on homepage widget.
5. Dashboard shows: Average Rating: 4.7 ⭐ (from 48 reviews this month).

### DATABASE CHANGES (Migration File Required)
- v2_feedback: customer_id, booking_id, job_cart_id, overall_rating, service_rating, staff_rating, cleanliness_rating, comments, is_public, admin_reply, admin_replied_at.
- v2_review_requests: customer_id, booking_id, job_cart_id, sent_via, status, sent_at, responded_at.
- Add feedback_token VARCHAR(64) to v2_review_requests for tokenized public link.
- Create migration: server/migrations/067_add_feedback_token.sql.

### BACKEND / API REQUIREMENTS
- Mount feedbackController routes in app.js: POST /api/feedback (public, token-based), GET /api/feedback (admin), PATCH /api/feedback/:id/reply (admin), PATCH /api/feedback/:id/publish (admin).
- Add POST /api/feedback/request (admin — manual trigger), auto-trigger from jobCartController.complete.
- Add public GET /api/feedback/form/:token — validates token, returns job/customer context for form prefill.
- Add GET /api/feedback/stats (admin) — returns avg rating, distribution, recent feedback.

### FRONTEND REQUIREMENTS
- Admin FeedbackPage.tsx exists — wire to mounted API. Add rating stats cards at top.
- Public feedback form page (no login): simple star rating + text area. Accessible at /feedback/:token.
- Admin can reply and toggle public visibility per review.
- Add "Avg Rating" to admin dashboard stats cards.

> [!NOTE]
> **AGENT NOTES:** Feedback tokens must be single-use: mark v2_review_requests.status = "responded" once feedback is submitted to prevent duplicate submissions.

---

## IMPLEMENTATION SUMMARY — ALL 31 UPDATES

| Update # | Feature | New Tables | DB Migration | Backend Work | Frontend Work |
| --- | --- | --- | --- | --- | --- |
| 1 | Razorpay Payment | None | No | paymentsController | Pay Online button |
| 2 | Package Renewal | None | No | userPackagesController extend | RenewModal wire |
| 3 | Service Change 1 Day | None | No | PATCH bookings/change-services | Change button + timer |
| 4 | Advance Payment | bookings + settings | 058 | advance endpoints | Advance step in booking |
| 5 | Vehicle Year Dropdown | vehicles.year | 058 | vehiclesController | Year dropdown |
| 6 | UI/UX Polish | None | No | Minor response additions | Price matrix + skeletons |
| 7 | Staff Login Restrict | None | No | Date filter in jobCartController | Staff sidebar cleanup |
| 8 | Wash Sequence + Rates | bookings.phase | 059 | PATCH phase endpoint | Phase stepper + price matrix |
| 9 | Referral Program | users.referral_code | 060 | referralController mount | Referral code UI |
| 10 | Balance Sheet | None | No | balanceSheetController enhance | Charts + export buttons |
| 11 | Book Button Control | settings keys | No | bookings_paused setting | Button state logic |
| 12 | WhatsApp Full | None | No | messagingService real API | Delivery status UI |
| 13 | WA/SMS Triggers | None | No | notify() in all controllers | Message log view |
| 14 | Role-Based Access | v2_roles, v2_role_permissions | No (exists) | permissionsMiddleware | Role management UI |
| 15 | Pickup Options | v2_pickup_requests | No (exists) | pickupController | Pickup toggle in booking |
| 16 | Manual Slot Booking | None | No | POST bookings/manual | Admin manual booking modal |
| 17 | Car in Manual Bill | manual_bills vehicle cols | 061 | billingController extend | Vehicle fields in billing |
| 18 | Custom Package | packages.is_custom | 062 | packagesController extend | Custom package form |
| 19 | Package History Export | None | No | Export endpoints | Export button on profile |
| 20 | Offline Slot Admin | None | No (exists) | toggleBlock + reason | Block modal with reason |
| 21 | Live Service Tracking | bookings.current_phase | 059 | PATCH tracking-stage | Stage stepper + socket |
| 22 | File Share | file_attachments.share_token | 063 | sharedFiles route mount | Share button + modal |
| 23 | Service Duration | None | No | duration_minutes in response | Duration badge + total |
| 24 | New Customer Reward | settings keys | No | Welcome reward in approve | Welcome banner |
| 25 | SMS/WA Job Events | None | No | notify() wiring | Message log per job |
| 26 | Package View Admin | None | No | Enhanced customer packages API | Package tab enhance |
| 27 | Multi-Car Packages | user_packages.vehicle_id | 064 | vehicle-aware package logic | Per-car package display |
| 28 | Inventory + Images | v2_inventory_items.item_type | 065 | inventoryV2Controller | Image gallery + tabs |
| 29 | Accounts Module | return_bills + GST | 066 | Full accounts suite | Multi-tab accounts page |
| 30 | Staff HR Module | None (all exist) | No | HR controllers mount | Tasks + payroll + leaves |
| 31 | Feedback CRM | review_requests.token | 067 | feedbackController mount | Public form + admin reply |

> [!TIP]
> **DEVELOPMENT APPROACH RECOMMENDATION:**
> - **Phase 1 (Core Revenue — Implement First):** Updates 1, 2, 9, 24 (Payment + Renewals + Referrals + Rewards)
> - **Phase 2 (Operations Enhancement):** Updates 3, 4, 7, 8, 11, 15, 16, 20, 21 (Booking controls, Staff, Tracking)
> - **Phase 3 (Communication Layer):** Updates 12, 13, 25 (WhatsApp + SMS full wiring)
> - **Phase 4 (Data + Finance):** Updates 10, 19, 22, 29 (Accounts, Balance Sheet, Reports, File Share)
> - **Phase 5 (Staff + CRM):** Updates 14, 30, 31 (Role Access, HR Module, Feedback)
> - **Phase 6 (UX + Data Enrichment):** Updates 5, 6, 17, 18, 23, 26, 27, 28 (Year, UI, Custom Pkg, Inventory)
