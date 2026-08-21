# GK AutoHerb - Comprehensive Project Analysis & Overview

This document provides a complete technical analysis and catalog of the **GK AutoHerb** Car Studio Management Platform. It serves as an architectural blueprint, developer reference, and readiness assessment for any modifications or feature enhancements.

---

## 1. Executive Summary & Domain Map

**GK AutoHerb** is a full-featured, end-to-end vehicle service and package management platform. It consists of three portals tailored to different roles:
1. **Customer Portal (`/customer`)**: Allows vehicle owners to manage vehicle profiles, buy and renew detailing packages, book service slots, track service progress in real-time, and manage loyalty rewards.
2. **Admin Dashboard (`/admin`)**: A control hub for studio owners/managers to oversee bay schedules, process bookings, create custom customer packages, assign mechanics, track inventory/P&L, generate GST invoices, and process staff salaries.
3. **Staff Portal (`/staff`)**: A simplified, mobile-friendly panel for mechanics and detailers to clock attendance, view their assigned tasks for the day, and update step-by-step progress without exposing financial data.

### Domain & Hosting Coordinates
*   **Production URL**: `http://localhost:5000`
*   **Database Host**: Local MySQL instance (`o3_car_spa`) on port `3306`
*   **API Base Origin**: `http://localhost:5000` (or reverse proxied via Nginx under `/api`)
*   **Client Origin**: `http://localhost:5173` (Vite dev server)

---

## 2. Technical Stack (Exact Versions)

The codebase is built on modern, lightweight, and type-safe technologies:

### Frontend
*   **Framework**: React `v18.3.1` (compiled using Vite)
*   **Language**: TypeScript (`tsconfig.json` rules enforced)
*   **Styling**: Tailwind CSS `v3.4.7` + PostCSS `v8.4.40` + Autoprefixer `v10.4.19`
*   **Routing**: React Router DOM `v6.26.0` (with role guards)
*   **State Management**: Zustand `v4.5.4` (persisted via `sessionStorage`)
*   **Data Fetching**: TanStack React Query `v5.51.21`
*   **HTTP Client**: Axios `v1.7.3` (configured with JWT auto-inject interceptor)
*   **Forms & Validation**: React Hook Form `v7.52.2` + Zod `v3.23.8`
*   **Real-time Communication**: Socket.io-client `v4.7.5`
*   **Charts & Visuals**: Recharts `v3.8.1` & Framer Motion `v12.40.0`

### Backend
*   **Runtime**: Node.js
*   **Framework**: Express.js `v4.19.2`
*   **Database Client**: `mysql2` `v3.10.3` (leveraging Promise Connection Pools)
*   **Authentication**: JSON Web Tokens (`jsonwebtoken` `v9.0.2`, 7-day duration)
*   **Security & Policy**: `helmet` `v7.1.0` (Cross-Origin Resource Policy allowed), `cors` `v2.8.5`
*   **Password Cryptography**: `bcryptjs` `v2.4.3`
*   **File Management**: `multer` + `cloudinary` + `multer-storage-cloudinary`
*   **Document Engines**: Puppeteer `v22.14.0` (for HTML-to-PDF invoice rendering) & `exceljs` `v4.4.0` (for workbook generation)
*   **Cron Jobs**: `node-cron` `v3.0.3`
*   **Websockets**: Socket.io `v4.7.5`
*   **Notification Integration**: MSG91 API (with internal redirection to 2Factor.in SMS and Meta Cloud API for WhatsApp Business)

---

## 3. Directory Structure Tree

```
Software/
├── client/                     # Frontend Vite + React project
│   ├── dist/                   # Production build outputs (static files)
│   ├── public/                 # Static assets (favicons, logos)
│   ├── src/
│   │   ├── api/                # Custom React Query hooks & Axios setup
│   │   │   ├── hooks/          # useBookings, useInventory, usePackages, etc.
│   │   │   └── client.ts       # Axios instance with interceptors
│   │   ├── components/         # Reusable UI components & layouts
│   │   │   ├── ui/             # Input, Button, Card, SearchableSelect, etc.
│   │   │   └── Layout.tsx      # Sidebar, navbar, and role layouts
│   │   ├── pages/              # Portal pages grouped by role
│   │   │   ├── admin/          # PackagesPage, InventoryPage, SettingsPage, etc.
│   │   │   ├── customer/       # BookingPage, TrackingPage, LoyaltyPage, etc.
│   │   │   ├── staff/          # StaffJobCartsPage, StaffBenefitsPage, etc.
│   │   │   └── auth/           # Login, Register, ForgotPassword
│   │   ├── store/              # Zustand global store states
│   │   │   └── authStore.ts    # Session and user profile stores
│   │   ├── types/              # TS interfaces & schemas (booking.ts, etc.)
│   │   ├── utils/              # Client-side utility functions & formatters
│   │   ├── App.tsx             # Main routing configurations & state providers
│   │   └── main.tsx            # React DOM mounting
│   ├── tailwind.config.ts      # Tailwind color definitions & styles
│   └── vite.config.ts          # Vite build config
│
├── server/                     # Backend Node.js + Express project
│   ├── migrations/             # SQL schema files (001_users.sql to 069_...)
│   ├── src/
│   │   ├── app.js              # Express app entrypoint & middleware definitions
│   │   ├── config/             # DB & Cloudinary credentials configurations
│   │   │   └── db.js           # MySQL pool connection config
│   │   ├── controllers/        # Route controllers containing SQL transaction logic
│   │   │   ├── bookingsController.js
│   │   │   ├── jobCartsController.js
│   │   │   ├── paymentsController.js
│   │   │   └── ...
│   │   ├── middleware/         # Auth guards, role-checkers, and audit loggers
│   │   │   ├── auth.js         # JWT authorization checks
│   │   │   └── auditLog.js     # System action logger
│   │   ├── routes/             # Express Route files
│   │   ├── services/           # MSG91, WhatsApp, and Cron background tasks
│   │   │   ├── whatsappService.js
│   │   │   └── cronService.js
│   │   └── utils/              # Puppeteer PDF compiler & Excel export helpers
│   └── package.json            # Node server scripts & dependencies
```

---

## 4. Key Features & Modules Matrix (31 Core Updates)

| Update ID | Feature Category | Module Name | Scope & Technical Implementation |
| :---: | :--- | :--- | :--- |
| **01** | Revenue / Payment | **Razorpay Gateway** | Active checkout popup. Handles payment verification via HMAC-SHA256 signatures and handles delayed captures via Razorpay Webhook. |
| **02** | Revenue / Payment | **Package Renewal** | Within 30 days of package expiry, allows online/offline renewals. Resets washes, wax, and service entitlements back to catalog defaults. |
| **03** | Operations | **Service Change 24h Window** | Customers can swap services on confirmed bookings up to 24 hours before the slot. Logs differences to audit logs and locks booking afterwards. |
| **04** | Operations | **Advance Payment** | Settings-controlled fixed or percentage deposit requirement during service bookings. Deducts advance from final job invoice. |
| **05** | Onboarding | **Vehicle Year Dropdown** | Replaces vehicle registration year text inputs with a dynamic 1990-current select dropdown, storing `manufacture_year` in DB. |
| **06** | UX/UI | **UI/UX Polish** | Implements service price matrices based on car categories (Hatchback/Sedan/SUV), countdown alerts, skeleton loaders, and table row animations. |
| **07** | Staff / Security | **Restricted Staff Dashboard** | Restricts staff views to current day's job cards. Automatically hides prices/billing data from the UI when a user has a `staff` role. |
| **08** | Operations | **Wash Sequence Progress** | Stepper display for Quick Wash queue (`Pre-wash` to `Dry`). Emits WebSocket events on phase shifts to instantly update customer tracker UI. |
| **09** | Marketing | **Referral Program** | Generates unique 6-character referral codes. Applies welcome points to new users and credits referrers on the new user's first confirmed booking. |
| **10** | Finance | **Balance Sheet** | Combines revenues (job cards, packages, manual bills) and expenses (salary, purchases, operating) to output dynamic P&L charts & PDF/XLSX exports. |
| **11** | Operations | **Booking Availability Toggle** | Enables admin to pause new bookings globally. Automatically disables the "Book Now" button on the customer portal if slots are full or paused. |
| **12** | Integrations | **WhatsApp Business API** | Connects template notifications via official Meta Cloud API or MSG91 gateways, utilizing SMS only as a fallback option. |
| **13** | Marketing | **Auto Lifecycle Notifications** | Cron-triggered warnings sent 7 days and 1 day before package expiration, alongside automated status updates (confirmed, started, ready). |
| **14** | Security | **Extended RBAC** | Custom role creation (e.g. Reception, Manager) with granular permissions mapping (e.g., `bookings:read`, `job_carts:write`). |
| **15** | Operations | **Pickup & Delivery Options** | Integrates request toggle during customer booking. Details driver assignments and stores coordinates in the database. |
| **16** | Operations | **Admin Manual Booking** | Allows administrators to book a specific slot directly for walk-in or offline clients, auto-populating client profile info. |
| **17** | Finance | **Car Info in Manual Billing** | Admin can optionally record vehicle specifications (Reg No, Brand, Model) directly on a manual invoice without creating a permanent vehicle record. |
| **18** | Operations | **Custom Packages** | Admin tool to create bespoke packages (services list, specific counts, price, validity) and assign them directly to a customer profile. |
| **19** | Finance | **Data History Exports** | Generates detailed Excel workbooks (.xlsx) outlining comprehensive customer package usage histories, logs, and renewals. |
| **20** | Operations | **Offline Slot Blocking** | Gives administrators the ability to completely block specific calendar slots for studio maintenance or training, marking it unavailable to users. |
| **21** | Operations | **Live Tracking Timeline** | Step-by-step progress tracking widget for customers, linking to `v2_tracking_history` database entries. |
| **22** | Collaboration | **Public File Sharing** | Generates cryptographically secure, time-expiring links for invoices and before/after job photos, viewable without logging in. |
| **23** | UX/UI | **Service Durations** | Displays estimated service time (e.g., `1h 45m`) on service cards and aggregates booking time totals on checkout. |
| **24** | Marketing | **New Customer Welcome** | Checks history upon booking confirmation. If it is the user's first booking, applies admin-configured welcome rewards (points/discounts). |
| **25** | Integrations | **Lifecycle Messengers** | Wires event hooks across booking confirmations, job-card initiations, and delivery stages to trigger dual-channel notifications. |
| **26** | UX/UI | **Admin Customer Package View** | Interactive breakdown in Customer Detail view showing total vs. remaining counts per service, usage logs, and credit modification tools. |
| **27** | Operations | **Multi-Vehicle Packages** | Links `user_packages` directly to `vehicle_id`. Customers with multiple vehicles can hold distinct active packages per car. |
| **28** | Inventory | **Resale Inventory Gallery** | Enhances inventory with Accessories vs. Consumables categorization. Supports 5 Cloudinary images per product, barcodes, and SKU levels. |
| **29** | Finance | **Accounts & GST Reports** | Generates GSTR-1 & GSTR-2 reports. Tracks purchases, vendor payments, sales returns, and outputs GST-compliant tax invoices. |
| **30** | HR / Payroll | **Staff HR Suite** | Integrates task trackers, payroll calculation engines, leave forms, and salary slip generators in the admin panel. |
| **31** | CRM | **Feedback Collection** | Auto-sends unique, single-use review tokens upon service completion. Form collects star ratings and reviews, with admin reply controls. |

---

## 5. Database Schema & Data Models

### 5.1 Core Database Tables

#### 1. `users`
*   `id` (INT UNSIGNED, PK, AUTO_INCREMENT)
*   `name` (VARCHAR(100))
*   `mobile` (VARCHAR(15), UNIQUE) - Login ID
*   `email` (VARCHAR(150), UNIQUE)
*   `password_hash` (VARCHAR(255))
*   `role` (ENUM('admin', 'customer', 'staff'), DEFAULT 'customer')
*   `referral_code` (VARCHAR(20), UNIQUE) - Referral identification

#### 2. `vehicles`
*   `id` (INT UNSIGNED, PK, AUTO_INCREMENT)
*   `registration_no` (VARCHAR(20))
*   `customer_id` (INT UNSIGNED, FK -> `users.id`)
*   `brand` (VARCHAR(80))
*   `model` (VARCHAR(80))
*   `manufacture_year` (SMALLINT UNSIGNED)
*   `is_primary` (TINYINT(1), DEFAULT 1)

#### 3. `slots`
*   `id` (INT UNSIGNED, PK, AUTO_INCREMENT)
*   `slot_date` (DATE)
*   `start_time` (TIME)
*   `end_time` (TIME)
*   `max_capacity` (INT UNSIGNED, DEFAULT 1)
*   `booked_count` (INT UNSIGNED, DEFAULT 0)
*   `is_blocked` (TINYINT(1), DEFAULT 0)

#### 4. `bookings`
*   `id` (INT UNSIGNED, PK, AUTO_INCREMENT)
*   `customer_id` (INT UNSIGNED, FK -> `users.id`)
*   `vehicle_id` (INT UNSIGNED, FK -> `vehicles.id`)
*   `slot_id` (INT UNSIGNED, FK -> `slots.id`)
*   `package_id` (INT UNSIGNED, FK -> `packages.id`) - NULL for non-package bookings
*   `total_duration` (INT UNSIGNED) - Cumulative service time (minutes)
*   `status` (ENUM('pending_approval', 'confirmed', 'cancelled', 'completed', 'expired', 'rejected'))
*   `advance_amount` (DECIMAL(10,2), DEFAULT 0.00)
*   `advance_payment_id` (INT)
*   `current_phase` (VARCHAR(30), DEFAULT 'pre_wash')
*   `job_type` (ENUM('standard', 'quick_wash'), DEFAULT 'standard')

#### 5. `booking_services`
*   `id` (INT UNSIGNED, PK, AUTO_INCREMENT)
*   `booking_id` (INT UNSIGNED, FK -> `bookings.id` ON DELETE CASCADE)
*   `service_id` (INT UNSIGNED, FK -> `services.id`)

#### 6. `job_carts`
*   `id` (INT UNSIGNED, PK, AUTO_INCREMENT)
*   `vehicle_id` (INT UNSIGNED, FK -> `vehicles.id`)
*   `booking_id` (INT UNSIGNED, FK -> `bookings.id`)
*   `visit_date` (DATE)
*   `status` (ENUM('draft', 'open', 'complete', 'cancelled'), DEFAULT 'draft')
*   `discount_type` (ENUM('percentage', 'fixed'))
*   `discount_value` (DECIMAL(10,2))
*   `advance_amount` (DECIMAL(10,2), DEFAULT 0.00)
*   `balance_due` (DECIMAL(10,2), DEFAULT 0.00)
*   `invoice_number` (VARCHAR(50))

#### 7. `services` & `packages`
*   `services`: Details service names, pricing (Hatchback/Sedan/SUV), and duration.
*   `packages`: Pre-configured service matrices, validity terms, and total pricing.

#### 8. `user_packages` & `package_usage`
*   `user_packages`: User package bindings showing active status and expiration.
*   `package_usage`: Transactional ledger tracks package items debited.

### 5.2 Extended Tables (Phase 2 & 3 Modules)
*   `v2_wallets` & `v2_wallet_transactions`: Customer wallet storage for points and refunds.
*   `v2_payments` & `v2_payment_transactions`: Log online Razorpay payments and webhooks.
*   `v2_referrals`: Tracks referrer-referee loops.
*   `v2_roles` & `v2_permissions` & `v2_role_permissions`: Core entities governing RBAC access control.
*   `v2_tracking_history`: Historical milestones for live customer dashboard timelines.
*   `v2_blocked_slots`: Database entries of blocked time slots.

---

## 6. API Endpoints Map

The backend mounts controllers to API sub-routes in `server/src/app.js`:

| Target Route Prefix | Target Express Route File | Core Actions Mapping |
| :--- | :--- | :--- |
| `/api/auth` | `routes/auth.js` | User Login, Registration, OTP request, Password Reset |
| `/api/bookings` | `routes/bookings.js` | Create booking, Approve/Reject booking, Slot verification |
| `/api/job-carts` | `routes/jobCarts.js` | Job cart creation, Update stages (Washing/Polishing), Add services/products, Close cart & generate Invoice |
| `/api/inventory` | `routes/inventory.js` | Stock checks, Add products, Cloudinary upload hooks, SKU update |
| `/api/slots` | `routes/slots.js` | Fetch slots calendar, block slots, edit max capacity |
| `/api/packages` | `routes/packages.js` | CRUD packages, manage custom packages per customer |
| `/api/user-packages` | `routes/userPackages.js` | Package purchases, renewal verification, custom activations |
| `/api/payments` | `routes/payments.js` | Create Razorpay orders, Verify signatures, Webhook endpoint |
| `/api/feedback` | `routes/feedback.js` | Request reviews, Token authorization, Save ratings, Reply to feedback |
| `/api/balance-sheet` | `routes/balanceSheet.js` | Sum accounts, expenses, manual bills, output financial sheets |
| `/api/staff-hr` | `routes/staffHR.js` | Staff Attendance (checkin/checkout), process Salaries, Leave requests |
| `/api/shared-files` | `routes/sharedFiles.js` | Expiry shared links creation |

---

## 7. Frontend State & Navigation

*   **Global Stores (`client/src/store/`)**:
    *   `authStore.ts`: Coordinates JWT token verification, checks user roles (`admin` / `customer` / `staff`), and logs out when Axios registers a `401 Unauthorized` token expiry.
*   **React Query Caching (`client/src/api/hooks/`)**:
    *   Unified queries and mutations for resources like bookings, inventory, and staff management to ensure automatic cache updates, optimistic UI states, and background syncing.
*   **Routing System (`client/src/App.tsx` & `router/`)**:
    *   Uses React Router DOM browser router. Routes are wrapped with dynamic guards (`ProtectedRoute`) that evaluate `role` permissions and redirect user access accordingly.

---

## 8. Current System Readiness & Analysis

1.  **Architecture Consistency**: The database schema is extensively pre-configured with 69 migration scripts. All core structures (users, bookings, vehicles, job carts) are ready and fully matched in database layers.
2.  **Visual Integrations**: The frontend client contains UI layouts for all features. Forms include React Hook Form inputs and Zod safety validations.
3.  **Active Integrations**: Payments gateway (Razorpay) webhook raw body parsing is pre-mounted at `app.js:38`.
4.  **Operational Paths**: Standard workflows (Job Cart lifecycle -> Invoicing via Puppeteer -> SMS updates) are active.
