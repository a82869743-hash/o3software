# O3 Car Spa - Comprehensive AI Developer Reference & Software Context

---

## SECTION 1 — PROJECT OVERVIEW

**O3 Car Spa** is an end-to-end, full-featured vehicle service and package management platform designed for car detailing studios and workshops. The system handles browsing, purchasing, and booking vehicle maintenance packages (e.g., Bronze, Silver, Gold, Diamond, Platinum) for customers, while providing a robust admin panel to manage operational flows such as vehicle check-ins, job carts, staff assignments, inventory alerts, manual billing, and payroll.

*   **Business Domain**: Vehicle detailing and service workshop management.
*   **Deployment Domain**: `http://localhost:5000`
*   **Database Name**: `o3_car_spa` (hosted on a local MySQL instance on port 3306).
*   **User Roles**:
    *   `admin`: Full access to settings, bookings, package approvals, manual billing, payroll, staff management, and system analytics.
    *   `staff`: Limited access. Mechanics, washers, and drivers can clock in/out, view assigned job carts, report GPS location updates for deliveries, and update inventory stock counts. Staff are restricted from seeing prices, labor charges, or financial ledgers.
    *   `customer`: Mobile-responsive portal to browse services, purchase packages, reserve booking slots, monitor vehicle progress, track live delivery status, and view historical invoices.
*   **Current Development Status**: The frontend is fully completed and visual designs are frozen. Core backend flows (JWT auth, booking slots, job cart creation, and Puppeteer invoicing) are active. Advanced Phase 2 modules (wallets, reviews, referrals, and custom roles) have schemas defined in MySQL via migrations and hooks configured in the frontend, but their backend controllers and routers are not yet mounted.

---

## SECTION 2 — TECH STACK (EXACT VERSIONS)

### Frontend
*   **Core Library**: React v18.3.1 (with TypeScript and Vite)
*   **Styling**: Tailwind CSS v3.4.7, PostCSS v8.4.40, Autoprefixer v10.4.19
*   **Routing**: React Router DOM v6.26.0 (handling role-based routing guards)
*   **State Management**: Zustand v4.5.4 (with sessionStorage-based persistence)
*   **Data Fetching & Caching**: TanStack React Query v5.51.21
*   **HTTP Client**: Axios v1.7.3 (with custom interceptors for JWT injection and 401 redirection)
*   **Forms & Validation**: React Hook Form v7.52.2 + Zod v3.23.8
*   **Real-time Communication**: Socket.io-client v4.7.5
*   **Date Utilities**: date-fns v3.6.0, react-datepicker v7.3.0
*   **Charts**: Recharts v3.8.1
*   **Excel Parsing**: xlsx v0.18.5
*   **Maps API**: @googlemaps/js-api-loader v1.16.8
*   **Visual Assets**: Lucide React v0.414.0 (for icons), Framer Motion v12.40.0 (for UI transitions)

### Backend
*   **Runtime**: Node.js
*   **Framework**: Express.js v4.19.2
*   **Database Driver**: mysql2 v3.10.3 (using promise pool connections)
*   **Authentication**: jsonwebtoken v9.0.2 (using 7-day tokens signed by `JWT_SECRET`)
*   **Security Headers**: helmet v7.1.0, cors v2.8.5
*   **Password Hashing**: bcryptjs v2.4.3
*   **File Uploads**: multer v1.4.5-lts.1, cloudinary v2.4.0, multer-storage-cloudinary v4.0.0
*   **PDF Generation**: Puppeteer v22.14.0
*   **Excel Processing**: exceljs v4.4.0, xlsx v0.18.5
*   **Task Scheduler**: node-cron v3.0.3
*   **Real-time Server**: socket.io v4.7.5
*   **SMS Gateway**: MSG91 API configuration (internally routes to 2Factor.in API)

---

## SECTION 3 — COMPLETE DATABASE SCHEMA

### Core Tables

#### TABLE: `users`
*   **Purpose**: Stores authentication credentials, contact details, and system roles for all customers, admins, and staff members.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `name` (varchar(100)) [NOT NULL] — User's display name
    *   `mobile` (varchar(15)) [NOT NULL, UNIQUE] — Masked/unmasked login mobile number
    *   `email` (varchar(150)) [UNIQUE] — Optional email address
    *   `password_hash` (varchar(255)) [NOT NULL] — Bcrypt password hash
    *   `role` (enum('admin','customer','staff')) [NOT NULL, DEFAULT 'customer'] — User permission tier
    *   `is_active` (tinyint(1)) [NOT NULL, DEFAULT 1] — Active flag for deactivation
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]

#### TABLE: `vehicles`
*   **Purpose**: Stores vehicle profiles associated with customers.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `registration_no` (varchar(20)) [] — Uppercase clean registration number
    *   `customer_id` (int unsigned) [NOT NULL]
    *   `brand` (varchar(80)) [NOT NULL] — Vehicle manufacturer (e.g., Hyundai)
    *   `model` (varchar(80)) [NOT NULL] — Model name (e.g., i20)
    *   `is_primary` (tinyint(1)) [DEFAULT 1] — Primary vehicle flag
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `customer_id` -> `users(id)` ON DELETE RESTRICT

#### TABLE: `vehicle_master`
*   **Purpose**: Reference catalog of pre-populated car brands and models.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `make` (varchar(100)) [NOT NULL] — Brand name
    *   `model` (varchar(150)) [NOT NULL] — Model name
    *   `variant` (varchar(200)) [] — Engine / trim variant
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]

#### TABLE: `slots`
*   **Purpose**: Manages daily workshop booking capacities and blocked intervals.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `slot_date` (date) [NOT NULL] — Date of slot
    *   `start_time` (time) [NOT NULL] — Opening time
    *   `end_time` (time) [NOT NULL] — Closing time
    *   `max_capacity` (int unsigned) [NOT NULL, DEFAULT 1] — Max parallel bookings
    *   `booked_count` (int unsigned) [NOT NULL, DEFAULT 0] — Active reservations
    *   `is_blocked` (tinyint(1)) [NOT NULL, DEFAULT 0] — Admin lock override
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]

#### TABLE: `bookings`
*   **Purpose**: Tracks customer service slot requests, package credit usage intent, and completion statuses.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `customer_id` (int unsigned) [NOT NULL]
    *   `vehicle_id` (int unsigned) []
    *   `slot_id` (int unsigned) [NOT NULL]
    *   `service_id` (int unsigned) [] — Primary service ID (direct booking)
    *   `package_id` (int unsigned) [] — Master package catalog reference (if package-based)
    *   `vehicle_brand` (varchar(80)) []
    *   `vehicle_model` (varchar(80)) []
    *   `vehicle_reg_no` (varchar(20)) []
    *   `total_duration` (int unsigned) [] — Aggregated duration of services (minutes)
    *   `vehicle_category` (enum('hatchback','medium_hatchback','sedan','premium_sedan','suv')) []
    *   `status` (enum('pending_approval','confirmed','cancelled','completed','expired','rejected')) [NOT NULL, DEFAULT 'pending_approval']
    *   `is_free_wash` (tinyint(1)) [NOT NULL, DEFAULT 0] — Loyalty points free-wash flag
    *   `notes` (text) [] — Customer comments
    *   `booking_notes` (text) [] — Admin remarks
    *   `expires_at` (timestamp) [] — 5-minute timeout window for slot reservation
    *   `approved_by` (int unsigned) []
    *   `approved_at` (timestamp) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `job_type` (enum('standard','quick_wash')) [NOT NULL, DEFAULT 'standard']
    *   `wash_status` (enum('pending','washing','completed','delivered')) [] — Quick wash specific
    *   `queue_position` (int) []
    *   `started_at` (timestamp) []
    *   `completed_at` (timestamp) []
    *   `delivered_at` (timestamp) []
*   **Relationships**:
    *   `customer_id` -> `users(id)`
    *   `slot_id` -> `slots(id)`
    *   `vehicle_id` -> `vehicles(id)`

#### TABLE: `booking_services`
*   **Purpose**: M2M mapping table to associate multiple services with a single booking.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `booking_id` (int unsigned) [NOT NULL]
    *   `service_id` (int unsigned) [NOT NULL]
*   **Relationships**:
    *   `booking_id` -> `bookings(id)` ON DELETE CASCADE
    *   `service_id` -> `services(id)`

#### TABLE: `job_carts`
*   **Purpose**: Represents active work orders in the detailing bay. Links vehicles, services performed, and photos.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `vehicle_id` (int unsigned) [NOT NULL]
    *   `visit_date` (date) [NOT NULL]
    *   `visit_number` (int unsigned) [NOT NULL, DEFAULT 1]
    *   `status` (enum('draft','open','complete','cancelled')) [NOT NULL, DEFAULT 'draft']
    *   `discount_type` (enum('percentage','fixed')) []
    *   `discount_value` (decimal(10,2)) []
    *   `invoice_notes` (text) []
    *   `notes` (text) []
    *   `created_by` (int unsigned) [NOT NULL] — Staff or admin ID
    *   `booking_id` (int unsigned) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]
    *   `completed_at` (timestamp) []
    *   `invoice_number` (varchar(50)) [] — Auto-generated on completion
*   **Relationships**:
    *   `vehicle_id` -> `vehicles(id)`
    *   `created_by` -> `users(id)`

#### TABLE: `job_services`
*   **Purpose**: Logs services associated with a job cart. Holds specific prices billed at that instant.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `job_cart_id` (int unsigned) [NOT NULL]
    *   `service_name` (varchar(150)) [NOT NULL]
    *   `service_price` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `labor_charges` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `job_cart_id` -> `job_carts(id)` ON DELETE CASCADE

#### TABLE: `job_products`
*   **Purpose**: Records inventory items / spare parts consumed during a specific job service.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `job_service_id` (int unsigned) [NOT NULL]
    *   `product_id` (int unsigned) [NOT NULL]
    *   `quantity` (decimal(10,2)) [NOT NULL] — Consumed count/volume
    *   `unit_cost` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
*   **Relationships**:
    *   `job_service_id` -> `job_services(id)` ON DELETE CASCADE
    *   `product_id` -> `inventory(id)`

#### TABLE: `job_photos`
*   **Purpose**: Cloudinary URLs of vehicle conditions before and after detailing.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `job_cart_id` (int unsigned) [NOT NULL]
    *   `type` (enum('before','after')) [NOT NULL]
    *   `url` (varchar(500)) [NOT NULL]
    *   `public_id` (varchar(200)) []
    *   `uploaded_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `job_cart_id` -> `job_carts(id)` ON DELETE CASCADE

#### TABLE: `services`
*   **Purpose**: Catalog of individual services offered by the detailing workshop.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `name` (varchar(150)) [NOT NULL, UNIQUE]
    *   `description` (text) []
    *   `price_hatchback` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `price_medium_hatchback` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `price_sedan` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `price_premium_sedan` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `price_suv` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `price_luxury` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `is_active` (tinyint(1)) [NOT NULL, DEFAULT 1]
    *   `duration_minutes` (int unsigned) [NOT NULL, DEFAULT 60]
    *   `category_id` (int unsigned) []
    *   `is_premium` (tinyint(1)) [NOT NULL, DEFAULT 0]
    *   `image_url` (varchar(500)) []
    *   `image_public_id` (varchar(200)) []
    *   `sort_order` (int) [NOT NULL, DEFAULT 0]
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `category_id` -> `service_categories(id)`

#### TABLE: `service_categories`
*   **Purpose**: Grouping container for regular/premium services.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `name` (varchar(100)) [NOT NULL, UNIQUE]
    *   `description` (text) []
    *   `sort_order` (int unsigned) [NOT NULL, DEFAULT 0]
    *   `is_active` (tinyint(1)) [NOT NULL, DEFAULT 1]
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]

#### TABLE: `service_addons`
*   **Purpose**: Addons linked to master services (e.g., extra vacuuming, engine bay polish).
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `service_id` (int unsigned) [NOT NULL]
    *   `addon_name` (varchar(150)) [NOT NULL]
    *   `addon_price` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `duration_minutes` (int) [NOT NULL, DEFAULT 30]
    *   `is_active` (tinyint(1)) [NOT NULL, DEFAULT 1]
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `service_id` -> `services(id)` ON DELETE CASCADE

#### TABLE: `packages`
*   **Purpose**: Catalog definition of annual maintenance packages (Bronze, Gold, etc.).
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `name` (varchar(150)) [NOT NULL, UNIQUE]
    *   `description` (text) []
    *   `price_hatchback` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `price_medium_hatchback` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `price_sedan` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `price_premium_sedan` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `price_suv` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `price_luxury` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `wash_count` (int unsigned) [NOT NULL, DEFAULT 0] — Entitled wash count
    *   `wax_count` (int unsigned) [NOT NULL, DEFAULT 0] — Entitled wax count
    *   `paid_wash_count` (int unsigned) [NOT NULL, DEFAULT 0]
    *   `is_published` (tinyint(1)) [NOT NULL, DEFAULT 0]
    *   `is_active` (tinyint(1)) [NOT NULL, DEFAULT 1]
    *   `visible_to_customer` (tinyint(1)) [NOT NULL, DEFAULT 1]
    *   `sort_order` (int) [NOT NULL, DEFAULT 0]
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]

#### TABLE: `package_services`
*   **Purpose**: Entitlements of specific services inside a master package catalog.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `package_id` (int unsigned) [NOT NULL]
    *   `service_id` (int unsigned) [NOT NULL]
    *   `total_count` (int unsigned) [NOT NULL, DEFAULT 1]
*   **Relationships**:
    *   `package_id` -> `packages(id)` ON DELETE CASCADE
    *   `service_id` -> `services(id)`

#### TABLE: `package_products`
*   **Purpose**: Complementary products allocated during package purchase.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `package_id` (int unsigned) [NOT NULL]
    *   `product_id` (int unsigned) [NOT NULL]
    *   `quantity` (decimal(10,2)) [NOT NULL, DEFAULT 1.00]
*   **Relationships**:
    *   `package_id` -> `packages(id)` ON DELETE CASCADE
    *   `product_id` -> `inventory(id)`

#### TABLE: `package_pricing`
*   **Purpose**: Extended package pricing matrix separating basic vs premium detours.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `package_id` (int unsigned) [NOT NULL]
    *   `car_type` (enum('SMALL_HATCHBACK','MEDIUM_HATCHBACK','SEDAN_SUV','PREMIUM_SEDAN','LARGE_CAR')) [NOT NULL]
    *   `pricing_type` (enum('basic','premium')) [NOT NULL, DEFAULT 'basic']
    *   `price` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `package_id` -> `packages(id)` ON DELETE CASCADE

#### TABLE: `package_requests`
*   **Purpose**: Customer requests to buy packages. Pending requests wait for admin approval.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `customer_id` (int unsigned) [NOT NULL]
    *   `vehicle_id` (int unsigned) [NOT NULL]
    *   `package_id` (int unsigned) [NOT NULL]
    *   `price` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `pricing_type` (enum('basic','premium')) [NOT NULL, DEFAULT 'basic']
    *   `car_type` (varchar(50)) []
    *   `status` (enum('pending','approved','rejected')) [DEFAULT 'pending']
    *   `rejection_reason` (varchar(255)) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `approved_at` (timestamp) []
*   **Relationships**:
    *   `customer_id` -> `users(id)`
    *   `vehicle_id` -> `vehicles(id)`
    *   `package_id` -> `packages(id)`

#### TABLE: `user_packages`
*   **Purpose**: Active customer package subscriptions. Replaces individual counters with unified usages.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `user_id` (int unsigned) [NOT NULL]
    *   `package_id` (int unsigned) [NOT NULL]
    *   `start_date` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `end_date` (timestamp) [] — Calculated expiry (1 year from activation)
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `renewed_from_id` (int unsigned) [] — Points to previous expired subscription
    *   `payment_status` (enum('pending','paid','failed','refunded')) [NOT NULL, DEFAULT 'paid']
    *   `package_status` (enum('active','expired','cancelled','renewed')) [NOT NULL, DEFAULT 'active']
    *   `price_paid` (decimal(10,2)) []
    *   `vehicle_segment` (varchar(50)) []
    *   `vehicle_id` (int unsigned) []
    *   `renewed_at` (timestamp) []
    *   `cancelled_at` (timestamp) []
    *   `pricing_type` (enum('basic','premium')) [DEFAULT 'basic']
    *   `car_type` (varchar(50)) []
*   **Relationships**:
    *   `user_id` -> `users(id)`
    *   `package_id` -> `packages(id)`

#### TABLE: `package_usage`
*   **Purpose**: Usage ledger for specific package subscriptions. Keeps count of consumed vs reserved credits.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `user_package_id` (int unsigned) [NOT NULL]
    *   `service_name` (varchar(150)) [NOT NULL]
    *   `used_count` (int unsigned) [NOT NULL, DEFAULT 0]
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `usage_status` (enum('available','reserved','consumed','cancelled')) [NOT NULL, DEFAULT 'available']
    *   `booking_id` (int unsigned) []
    *   `job_card_id` (int unsigned) []
    *   `reserved_at` (timestamp) []
    *   `consumed_at` (timestamp) []
    *   `cancelled_at` (timestamp) []
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `user_package_id` -> `user_packages(id)` ON DELETE CASCADE

#### TABLE: `loyalty`
*   **Purpose**: Stores active loyalty points, free washes, and wax counts for customer accounts.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `customer_id` (int unsigned) [NOT NULL, UNIQUE]
    *   `credits` (decimal(10,2)) [NOT NULL, DEFAULT 0.00] — Direct cashback credit
    *   `free_washes` (int unsigned) [NOT NULL, DEFAULT 0] — Available free foam washes
    *   `wax_count` (int unsigned) [NOT NULL, DEFAULT 0]
    *   `points` (decimal(10,2)) [NOT NULL, DEFAULT 0.00] — Active loyalty points
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `customer_id` -> `users(id)` ON DELETE CASCADE

#### TABLE: `loyalty_transactions`
*   **Purpose**: Ledger tracking changes in loyalty points (earnings, redemptions, adjustments).
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `customer_id` (int unsigned) [NOT NULL]
    *   `type` (enum('earn','redeem','bonus','adjustment','expire')) [NOT NULL, DEFAULT 'earn']
    *   `points` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `balance_after` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `reference_type` (varchar(50)) [] — e.g. booking, job_cart
    *   `reference_id` (int unsigned) []
    *   `description` (varchar(500)) []
    *   `created_by` (int unsigned) [] — Admin ID who manually awarded/adjusted points
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `customer_id` -> `users(id)`

#### TABLE: `staff_profiles`
*   **Purpose**: Extension details for staff users (e.g. specialized skills like ceramic coat, paint correction).
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `user_id` (int unsigned) [NOT NULL, UNIQUE]
    *   `specialisations` (text) [] — Comma separated skill tags
*   **Relationships**:
    *   `user_id` -> `users(id)` ON DELETE CASCADE

#### TABLE: `staff_attendance`
*   **Purpose**: Daily clock-in logs for staff.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `staff_id` (int unsigned) [NOT NULL]
    *   `att_date` (date) [NOT NULL]
    *   `status` (enum('present','absent','half_day')) [NOT NULL, DEFAULT 'present']
    *   `note` (varchar(255)) []
    *   `check_in_time` (timestamp) []
    *   `check_out_time` (timestamp) []
*   **Relationships**:
    *   `staff_id` -> `users(id)`

#### TABLE: `staff_payments`
*   **Purpose**: Salary advances, incentives, or direct payouts to staff.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `staff_id` (int unsigned) [NOT NULL]
    *   `amount` (decimal(10,2)) [NOT NULL]
    *   `purpose` (varchar(255)) [NOT NULL]
    *   `status` (enum('pending','paid')) [NOT NULL, DEFAULT 'pending']
    *   `payment_date` (date) [NOT NULL]
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `paid_at` (timestamp) []
*   **Relationships**:
    *   `staff_id` -> `users(id)`

#### TABLE: `staff_salary`
*   **Purpose**: Monthly processed payroll summaries.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `staff_id` (int unsigned) [NOT NULL]
    *   `month_year` (varchar(10)) [NOT NULL] — e.g. "06-2026"
    *   `base_salary` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `bonus` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `deductions` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `final_salary` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `status` (enum('pending','paid')) [NOT NULL, DEFAULT 'pending']
    *   `notes` (text) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `staff_id` -> `users(id)`

#### TABLE: `transactions`
*   **Purpose**: Double-entry financial bookkeeping ledger.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `type` (enum('job_revenue','purchase','sale_b2b','sale_b2c','staff_payment','loyalty_award')) [NOT NULL]
    *   `reference_id` (int unsigned) [] — ID of source event
    *   `amount` (decimal(10,2)) [NOT NULL]
    *   `direction` (enum('in','out')) [NOT NULL]
    *   `note` (text) []
    *   `transaction_date` (date) [NOT NULL]
    *   `created_by` (int unsigned) [NOT NULL] — User ID initiating transaction
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `created_by` -> `users(id)`

#### TABLE: `buy_sell`
*   **Purpose**: Marketplace log for buying and selling cars (B2B/B2C).
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `type` (enum('buy','sell_b2b','sell_b2c')) [NOT NULL]
    *   `party_name` (varchar(150)) [NOT NULL]
    *   `party_mobile` (varchar(15)) []
    *   `product_id` (int unsigned) [] — References inventory ID
    *   `product_name` (varchar(150)) [NOT NULL]
    *   `quantity` (decimal(10,2)) [NOT NULL]
    *   `unit_price` (decimal(10,2)) [NOT NULL]
    *   `total_amount` (decimal(10,2)) [NOT NULL]
    *   `note` (text) []
    *   `status` (enum('pending','complete')) [NOT NULL, DEFAULT 'pending']
    *   `transaction_date` (date) [NOT NULL]
    *   `created_by` (int unsigned) [NOT NULL]
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `product_id` -> `inventory(id)`
    *   `created_by` -> `users(id)`

#### TABLE: `inquiries`
*   **Purpose**: Lead management system tracking potential clients.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `source` (enum('staff','website')) [NOT NULL]
    *   `name` (varchar(100)) [NOT NULL]
    *   `mobile` (varchar(15)) [NOT NULL]
    *   `email` (varchar(150)) []
    *   `vehicle_brand` (varchar(80)) []
    *   `vehicle_model` (varchar(80)) []
    *   `services_interested` (text) []
    *   `status` (enum('new','followed_up','converted')) [NOT NULL, DEFAULT 'new']
    *   `submitted_by` (int unsigned) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `submitted_by` -> `users(id)`

#### TABLE: `deliveries`
*   **Purpose**: Real-time vehicle delivery statuses.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `job_cart_id` (int unsigned) [NOT NULL, UNIQUE]
    *   `staff_id` (int unsigned) [NOT NULL]
    *   `customer_id` (int unsigned) [NOT NULL]
    *   `status` (enum('in_transit','delivered')) [NOT NULL, DEFAULT 'in_transit']
    *   `started_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `delivered_at` (timestamp) []
*   **Relationships**:
    *   `job_cart_id` -> `job_carts(id)`
    *   `staff_id` -> `users(id)`
    *   `customer_id` -> `users(id)`

#### TABLE: `messages_log`
*   **Purpose**: Logs transactional messages sent out via the MSG91/2Factor API.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `customer_id` (int unsigned) []
    *   `mobile` (varchar(15)) [NOT NULL]
    *   `type` (enum('job_complete','credits_awarded','wash_awarded','booking_confirm','delivery_started','monthly_reminder','bulk_free_wash','bulk_credits','bulk_reengagement')) [NOT NULL]
    *   `channel` (enum('whatsapp','sms')) [NOT NULL]
    *   `status` (enum('sent','failed','queued')) [NOT NULL, DEFAULT 'queued']
    *   `message_preview` (text) []
    *   `sent_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `customer_id` -> `users(id)`

#### TABLE: `settings`
*   **Purpose**: Stores studio settings such as tax values, counters, names, and contact details.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `key_name` (varchar(100)) [NOT NULL, UNIQUE]
    *   `value` (text) []
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]

#### TABLE: `inventory`
*   **Purpose**: Tracks consumable parts and products (polishing pads, shampoos, wax bottles).
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `product_name` (varchar(150)) [NOT NULL]
    *   `unit` (varchar(30)) [NOT NULL, DEFAULT 'pcs']
    *   `quantity` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `low_stock_threshold` (decimal(10,2)) [NOT NULL, DEFAULT 5.00]
    *   `is_deleted` (tinyint(1)) [NOT NULL, DEFAULT 0]
    *   `images_json` (json) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]

#### TABLE: `vendors`
*   **Purpose**: Records profiles of inventory suppliers.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `name` (varchar(100)) [NOT NULL]
    *   `phone` (varchar(15)) []
    *   `email` (varchar(150)) []
    *   `service_type` (varchar(100)) []
    *   `address` (text) []
    *   `is_active` (tinyint(1)) [NOT NULL, DEFAULT 1]
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]

#### TABLE: `manual_bills`
*   **Purpose**: Manual invoices generated directly for walk-in services or over-the-counter sales.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `customer_id` (int unsigned) []
    *   `customer_name` (varchar(100)) []
    *   `customer_mobile` (varchar(15)) []
    *   `amount` (decimal(10,2)) [NOT NULL]
    *   `discount_type` (enum('percentage','fixed')) []
    *   `discount_value` (decimal(10,2)) []
    *   `description` (text) []
    *   `services_json` (json) []
    *   `products_json` (json) []
    *   `payment_method` (enum('cash','upi','card','bank_transfer','other')) [NOT NULL, DEFAULT 'cash']
    *   `status` (enum('paid','voided','cancelled')) [NOT NULL, DEFAULT 'paid']
    *   `created_by` (int unsigned) [NOT NULL]
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `customer_id` -> `users(id)`
    *   `created_by` -> `users(id)`

#### TABLE: `customer_notes`
*   **Purpose**: Sticky notes or logs attached to customer profile sheets.
*   **Columns**:
    *   `id` (int unsigned) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `customer_id` (int unsigned) [NOT NULL]
    *   `note` (text) [NOT NULL]
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `customer_id` -> `users(id)` ON DELETE CASCADE

---

### Phase 2/3 Extended Tables (Schema-Ready / Gaps)

#### TABLE: `v2_wallets`
*   **Purpose**: Customer wallet configuration storing cashback and points.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `customer_id` (int unsigned) [NOT NULL, UNIQUE]
    *   `balance` (decimal(10,2)) [DEFAULT 0.00]
    *   `reward_points` (int) [DEFAULT 0]
    *   `total_earned` (decimal(10,2)) [DEFAULT 0.00]
    *   `total_spent` (decimal(10,2)) [DEFAULT 0.00]
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `customer_id` -> `users(id)` ON DELETE CASCADE

#### TABLE: `v2_wallet_transactions`
*   **Purpose**: Ledger of wallet balance movements.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `wallet_id` (int) [NOT NULL]
    *   `customer_id` (int unsigned) [NOT NULL]
    *   `transaction_type` (enum('credit','debit','reward_earned','reward_redeemed','refund','referral_bonus','welcome_bonus')) [NOT NULL]
    *   `amount` (decimal(10,2)) [DEFAULT 0.00]
    *   `points` (int) [DEFAULT 0]
    *   `description` (text) []
    *   `reference_type` (enum('booking','package','payment','manual','referral','system')) []
    *   `reference_id` (int) []
    *   `balance_after` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `wallet_id` -> `v2_wallets(id)` ON DELETE CASCADE

#### TABLE: `v2_payments`
*   **Purpose**: Log of transaction checkout sessions (Cash, Wallet, Razorpay).
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `customer_id` (int unsigned) [NOT NULL]
    *   `booking_id` (int) []
    *   `invoice_id` (int) []
    *   `package_id` (int) []
    *   `amount` (decimal(10,2)) [NOT NULL]
    *   `currency` (varchar(10)) [DEFAULT 'INR']
    *   `payment_method` (enum('razorpay','upi','qr','netbanking','card','cash','wallet')) [NOT NULL, DEFAULT 'cash']
    *   `status` (enum('pending','captured','failed','refunded','partial_refund')) [DEFAULT 'pending']
    *   `razorpay_order_id` (varchar(100)) []
    *   `razorpay_payment_id` (varchar(100)) []
    *   `razorpay_signature` (varchar(255)) []
    *   `notes` (text) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `customer_id` -> `users(id)` ON DELETE CASCADE

#### TABLE: `v2_payment_transactions`
*   **Purpose**: Detailed transaction attempts under checkouts.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `payment_id` (int) [NOT NULL]
    *   `transaction_type` (enum('debit','credit','refund')) [NOT NULL]
    *   `amount` (decimal(10,2)) [NOT NULL]
    *   `status` (enum('success','failed','pending')) [NOT NULL, DEFAULT 'pending']
    *   `gateway_response` (json) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `payment_id` -> `v2_payments(id)` ON DELETE CASCADE

#### TABLE: `v2_refunds`
*   **Purpose**: Logs payment refunds processed via gateway or cash.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `payment_id` (int) [NOT NULL]
    *   `amount` (decimal(10,2)) [NOT NULL]
    *   `reason` (text) []
    *   `status` (enum('pending','processed','failed')) [DEFAULT 'pending']
    *   `razorpay_refund_id` (varchar(100)) []
    *   `processed_at` (timestamp) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `payment_id` -> `v2_payments(id)` ON DELETE CASCADE

#### TABLE: `v2_reward_logs`
*   **Purpose**: Individual point credit/debit logs.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `customer_id` (int unsigned) [NOT NULL]
    *   `points` (int) [NOT NULL]
    *   `action` (enum('earn','redeem','expire','adjust','welcome','referral')) [NOT NULL]
    *   `description` (text) []
    *   `expiry_date` (date) []
    *   `is_expired` (tinyint(1)) [DEFAULT 0]
    *   `reference_type` (varchar(50)) []
    *   `reference_id` (int) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `customer_id` -> `users(id)` ON DELETE CASCADE

#### TABLE: `v2_referrals`
*   **Purpose**: Customer referral code tracker.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `referrer_id` (int unsigned) [NOT NULL]
    *   `referred_id` (int unsigned) [NOT NULL]
    *   `referral_code` (varchar(20)) [NOT NULL]
    *   `status` (enum('pending','completed','rewarded')) [DEFAULT 'pending']
    *   `reward_given` (tinyint(1)) [DEFAULT 0]
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `referrer_id` -> `users(id)`
    *   `referred_id` -> `users(id)`

#### TABLE: `v2_package_renewals`
*   **Purpose**: Captures renewal event attributes.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `customer_id` (int unsigned) [NOT NULL]
    *   `package_id` (int) [NOT NULL]
    *   `customer_package_id` (int) [NOT NULL]
    *   `renewal_date` (date) [NOT NULL]
    *   `amount_paid` (decimal(10,2)) []
    *   `payment_id` (int) []
    *   `renewed_by` (enum('customer','admin','auto')) [DEFAULT 'customer']
    *   `notes` (text) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `customer_id` -> `users(id)` ON DELETE CASCADE

#### TABLE: `v2_package_usage_logs`
*   **Purpose**: Detail log of specific package credit usage attempts.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `customer_package_id` (int) [NOT NULL]
    *   `customer_id` (int unsigned) [NOT NULL]
    *   `service_id` (int) []
    *   `booking_id` (int) []
    *   `services_used` (int) [DEFAULT 1]
    *   `notes` (text) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]

#### TABLE: `v2_whatsapp_templates`
*   **Purpose**: Configured notification body text triggers.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `template_name` (varchar(100)) [NOT NULL, UNIQUE]
    *   `event_trigger` (varchar(100)) [NOT NULL]
    *   `message_body` (text) [NOT NULL]
    *   `variables` (json) []
    *   `is_active` (tinyint(1)) [DEFAULT 1]
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]

#### TABLE: `v2_notification_logs`
*   **Purpose**: Tracks outbound template notification statuses.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `customer_id` (int) []
    *   `mobile` (varchar(15)) [NOT NULL]
    *   `channel` (enum('whatsapp','sms','both')) [NOT NULL, DEFAULT 'whatsapp']
    *   `template_name` (varchar(100)) []
    *   `message_body` (text) [NOT NULL]
    *   `status` (enum('sent','failed','pending','retry')) [DEFAULT 'pending']
    *   `attempts` (int) [DEFAULT 0]
    *   `last_attempt_at` (timestamp) []
    *   `response_data` (json) []
    *   `reference_type` (varchar(50)) []
    *   `reference_id` (int) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]

#### TABLE: `v2_roles`
*   **Purpose**: Custom user permission definitions.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `role_name` (varchar(50)) [NOT NULL, UNIQUE]
    *   `description` (text) []
    *   `is_system_role` (tinyint(1)) [DEFAULT 0]
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]

#### TABLE: `v2_permissions`
*   **Purpose**: Master list of policy keys.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `permission_key` (varchar(100)) [NOT NULL, UNIQUE]
    *   `module` (varchar(50)) [NOT NULL]
    *   `action` (varchar(50)) [NOT NULL]
    *   `description` (text) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]

#### TABLE: `v2_role_permissions`
*   **Purpose**: Maps permissions to custom roles.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `role_id` (int) [NOT NULL]
    *   `permission_id` (int) [NOT NULL]
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `role_id` -> `v2_roles(id)` ON DELETE CASCADE
    *   `permission_id` -> `v2_permissions(id)` ON DELETE CASCADE

#### TABLE: `v2_attendance`
*   **Purpose**: Extended staff attendance table.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `staff_id` (int) [NOT NULL]
    *   `date` (date) [NOT NULL]
    *   `check_in` (time) []
    *   `check_out` (time) []
    *   `status` (enum('present','absent','half_day','leave','holiday')) [DEFAULT 'present']
    *   `notes` (text) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]

#### TABLE: `v2_audit_logs`
*   **Purpose**: Tracks mutation histories of administrative operations.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `user_id` (int) []
    *   `user_type` (enum('admin','staff','customer')) []
    *   `action` (varchar(100)) [NOT NULL]
    *   `resource` (varchar(100)) [NOT NULL]
    *   `resource_id` (int) []
    *   `old_value` (json) []
    *   `new_value` (json) []
    *   `ip_address` (varchar(50)) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]

#### TABLE: `v2_blocked_slots`
*   **Purpose**: Allows blocking specific time slots on specific dates.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `blocked_date` (date) [NOT NULL]
    *   `slot_time` (time) []
    *   `reason` (text) []
    *   `blocked_by` (int) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]

#### TABLE: `v2_expenses`
*   **Purpose**: Studio operational expenses.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `category` (varchar(100)) [NOT NULL]
    *   `description` (text) [NOT NULL]
    *   `amount` (decimal(10,2)) [NOT NULL]
    *   `expense_date` (date) [NOT NULL]
    *   `payment_mode` (enum('cash','bank','upi','card')) [DEFAULT 'cash']
    *   `vendor_id` (int) []
    *   `receipt_url` (varchar(500)) []
    *   `added_by` (int) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]

#### TABLE: `v2_feedback`
*   **Purpose**: Customer review log.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `customer_id` (int unsigned) [NOT NULL]
    *   `booking_id` (int) []
    *   `job_cart_id` (int) []
    *   `overall_rating` (int) [NOT NULL]
    *   `service_rating` (int) []
    *   `staff_rating` (int) []
    *   `cleanliness_rating` (int) []
    *   `comments` (text) []
    *   `is_public` (tinyint(1)) [DEFAULT 0]
    *   `admin_reply` (text) []
    *   `admin_replied_at` (timestamp) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `customer_id` -> `users(id)` ON DELETE CASCADE

#### TABLE: `v2_file_attachments`
*   **Purpose**: Keeps trace of file attachment lists.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `file_name` (varchar(255)) []
    *   `file_url` (varchar(500)) [NOT NULL]
    *   `file_type` (enum('image','pdf','video')) [NOT NULL, DEFAULT 'image']
    *   `reference_type` (varchar(50)) []
    *   `reference_id` (int) []
    *   `uploaded_by` (int) []
    *   `cloudinary_public_id` (varchar(255)) []
    *   `is_before_image` (tinyint(1)) [DEFAULT 0]
    *   `is_after_image` (tinyint(1)) [DEFAULT 0]
    *   `file_size` (int) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]

#### TABLE: `v2_gst_records`
*   **Purpose**: Financial tax records.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `record_type` (enum('sales','purchase')) [NOT NULL]
    *   `invoice_id` (int) []
    *   `purchase_id` (int) []
    *   `gstin` (varchar(20)) []
    *   `taxable_amount` (decimal(10,2)) [DEFAULT 0.00]
    *   `cgst` (decimal(10,2)) [DEFAULT 0.00]
    *   `sgst` (decimal(10,2)) [DEFAULT 0.00]
    *   `igst` (decimal(10,2)) [DEFAULT 0.00]
    *   `total_gst` (decimal(10,2)) [DEFAULT 0.00]
    *   `period_month` (int) []
    *   `period_year` (int) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]

#### TABLE: `v2_inventory_items`
*   **Purpose**: Replaces legacy inventory tracking with barcode logs.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `item_name` (varchar(200)) [NOT NULL]
    *   `sku` (varchar(100)) [UNIQUE]
    *   `barcode` (varchar(100)) []
    *   `category` (varchar(100)) []
    *   `unit` (varchar(20)) [DEFAULT 'pcs']
    *   `current_stock` (int) [DEFAULT 0]
    *   `min_stock_level` (int) [DEFAULT 5]
    *   `max_stock_level` (int) [DEFAULT 100]
    *   `purchase_price` (decimal(10,2)) []
    *   `selling_price` (decimal(10,2)) []
    *   `vendor_id` (int) []
    *   `location` (varchar(100)) []
    *   `is_active` (tinyint(1)) [DEFAULT 1]
    *   `image_url` (varchar(500)) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]

#### TABLE: `v2_inventory_movements`
*   **Purpose**: Stores inventory movement log history.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `item_id` (int) [NOT NULL]
    *   `movement_type` (enum('purchase_in','usage_out','adjustment','return','damaged')) [NOT NULL]
    *   `quantity` (int) [NOT NULL]
    *   `stock_before` (int) [NOT NULL, DEFAULT 0]
    *   `stock_after` (int) [NOT NULL, DEFAULT 0]
    *   `reference_type` (varchar(50)) []
    *   `reference_id` (int) []
    *   `notes` (text) []
    *   `performed_by` (int) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `item_id` -> `v2_inventory_items(id)` ON DELETE CASCADE

#### TABLE: `v2_leaves`
*   **Purpose**: Employee leaves list.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `staff_id` (int) [NOT NULL]
    *   `leave_type` (enum('casual','sick','earned','unpaid')) [NOT NULL]
    *   `from_date` (date) [NOT NULL]
    *   `to_date` (date) [NOT NULL]
    *   `days_count` (int) [NOT NULL, DEFAULT 1]
    *   `reason` (text) []
    *   `status` (enum('pending','approved','rejected')) [DEFAULT 'pending']
    *   `approved_by` (int) []
    *   `approved_at` (timestamp) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]

#### TABLE: `v2_pickup_requests`
*   **Purpose**: Booking valet request tracker.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `booking_id` (int unsigned) [NOT NULL]
    *   `customer_id` (int unsigned) [NOT NULL]
    *   `address` (text) [NOT NULL]
    *   `scheduled_time` (datetime) []
    *   `assigned_staff_id` (int) []
    *   `status` (enum('pending','assigned','picked_up','cancelled')) [DEFAULT 'pending']
    *   `notes` (text) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `booking_id` -> `bookings(id)` ON DELETE CASCADE

#### TABLE: `v2_purchases`
*   **Purpose**: Vendor purchases transactions.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `vendor_id` (int) [NOT NULL]
    *   `purchase_date` (date) [NOT NULL]
    *   `invoice_number` (varchar(100)) []
    *   `total_amount` (decimal(10,2)) []
    *   `tax_amount` (decimal(10,2)) []
    *   `status` (enum('pending','received','partial','cancelled')) [DEFAULT 'pending']
    *   `notes` (text) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `vendor_id` -> `v2_vendors(id)`

#### TABLE: `v2_purchase_items`
*   **Purpose**: Individual items matching purchase orders.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `purchase_id` (int) [NOT NULL]
    *   `item_id` (int) [NOT NULL]
    *   `quantity` (int) [NOT NULL]
    *   `unit_price` (decimal(10,2)) [NOT NULL]
    *   `total_price` (decimal(10,2)) [NOT NULL]
    *   `received_quantity` (int) [DEFAULT 0]
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `purchase_id` -> `v2_purchases(id)` ON DELETE CASCADE
    *   `item_id` -> `v2_inventory_items(id)` ON DELETE RESTRICT

#### TABLE: `v2_review_requests`
*   **Purpose**: Logs links sent for feedback collection.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `customer_id` (int unsigned) [NOT NULL]
    *   `booking_id` (int) []
    *   `job_cart_id` (int) []
    *   `sent_via` (enum('whatsapp','sms','email')) [NOT NULL, DEFAULT 'whatsapp']
    *   `status` (enum('sent','responded','failed')) [DEFAULT 'sent']
    *   `sent_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `responded_at` (timestamp) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `customer_id` -> `users(id)` ON DELETE CASCADE

#### TABLE: `v2_tasks`
*   **Purpose**: Staff task dispatch tracker.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `title` (varchar(200)) [NOT NULL]
    *   `description` (text) []
    *   `assigned_to` (int) [NOT NULL]
    *   `assigned_by` (int) [NOT NULL]
    *   `job_cart_id` (int) []
    *   `priority` (enum('low','medium','high','urgent')) [DEFAULT 'medium']
    *   `status` (enum('pending','in_progress','completed','cancelled')) [DEFAULT 'pending']
    *   `due_date` (date) []
    *   `completed_at` (timestamp) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]

#### TABLE: `v2_tracking_history`
*   **Purpose**: Logs state movements of vehicle workflow status.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `job_cart_id` (int unsigned) [NOT NULL]
    *   `stage` (varchar(100)) [NOT NULL]
    *   `changed_by` (int) []
    *   `notes` (text) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]
*   **Relationships**:
    *   `job_cart_id` -> `job_carts(id)` ON DELETE CASCADE

#### TABLE: `v2_vendors`
*   **Purpose**: Extends vendor accounts with GST parameters.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `name` (varchar(200)) [NOT NULL]
    *   `contact_person` (varchar(100)) []
    *   `phone` (varchar(15)) []
    *   `email` (varchar(100)) []
    *   `address` (text) []
    *   `gstin` (varchar(20)) []
    *   `payment_terms` (text) []
    *   `is_active` (tinyint(1)) [DEFAULT 1]
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]

#### TABLE: `v2_payroll`
*   **Purpose**: Elaborate staff salary payroll ledger.
*   **Columns**:
    *   `id` (int) [NOT NULL, PRIMARY KEY, auto_increment]
    *   `staff_id` (int) [NOT NULL]
    *   `month` (int) [NOT NULL]
    *   `year` (int) [NOT NULL]
    *   `base_salary` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `present_days` (int) [DEFAULT 0]
    *   `absent_days` (int) [DEFAULT 0]
    *   `leave_days` (int) [DEFAULT 0]
    *   `overtime_hours` (decimal(5,2)) [DEFAULT 0.00]
    *   `overtime_pay` (decimal(10,2)) [DEFAULT 0.00]
    *   `deductions` (decimal(10,2)) [DEFAULT 0.00]
    *   `bonuses` (decimal(10,2)) [DEFAULT 0.00]
    *   `net_salary` (decimal(10,2)) [NOT NULL, DEFAULT 0.00]
    *   `payment_status` (enum('pending','paid')) [DEFAULT 'pending']
    *   `paid_at` (timestamp) []
    *   `payment_mode` (enum('cash','bank_transfer','upi')) []
    *   `created_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP]
    *   `updated_at` (timestamp) [DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP]

---

## SECTION 4 — COMPLETE API ENDPOINT MAP

### Auth Routes (`/api/auth`)
*   `POST /api/auth/register`
    *   Auth: `public`
    *   Controller: `authController.register`
    *   Purpose: Registers a new customer user and optionally records their primary vehicle. Returns token.
*   `POST /api/auth/login`
    *   Auth: `public`
    *   Controller: `authController.login`
    *   Purpose: Customer, admin, or staff login via mobile and password.
*   `POST /api/auth/forgot-password`
    *   Auth: `public`
    *   Controller: `forgotPasswordController.forgotPassword`
    *   Purpose: Initiates OTP generation for password recovery.
*   `POST /api/auth/verify-otp`
    *   Auth: `public`
    *   Controller: `forgotPasswordController.verifyOtp`
    *   Purpose: Validates reset OTP.
*   `POST /api/auth/reset-password`
    *   Auth: `public`
    *   Controller: `forgotPasswordController.resetPassword`
    *   Purpose: Commits new password to db after OTP confirmation.
*   `GET /api/auth/me`
    *   Auth: `protect`
    *   Controller: `authController.getMe`
    *   Purpose: Fetch current authenticated user's profile and active loyalty status.
*   `PUT /api/auth/profile`
    *   Auth: `protect`
    *   Controller: `authController.updateProfile`
    *   Purpose: Updates user name and email.
*   `POST /api/auth/change-password`
    *   Auth: `protect`
    *   Controller: `authController.changePassword`
    *   Purpose: Manually updates user password.
*   `POST /api/auth/refresh`
    *   Auth: `protect`
    *   Controller: `authController.refreshToken`
    *   Purpose: Silent token refresh. Checks if session is active and extends JWT.
*   `POST /api/auth/admin/create-customer`
    *   Auth: `protect` + `authorize('admin')`
    *   Controller: `authController.adminCreateCustomer`
    *   Purpose: Manually create a walk-in customer account.

### Job Cart Routes (`/api/job-carts`)
*   `GET /api/job-carts/vehicles/lookup/:regNo`
    *   Auth: `protect` + `authorize('admin')`
    *   Controller: `jobCartController.lookup`
    *   Purpose: Checks if vehicle is registered and returns historical visit count.
*   `GET /api/job-carts`
    *   Auth: `protect` + `role(['admin', 'customer'])`
    *   Controller: `jobCartController.list`
    *   Purpose: Fetches list of job carts (filtered by customer ID if not admin).
*   `POST /api/job-carts`
    *   Auth: `protect` + `role(['admin', 'staff'])`
    *   Controller: `jobCartController.create`
    *   Purpose: Opens a new job cart. Automatically registers vehicle or customer if not found.
*   `GET /api/job-carts/:id`
    *   Auth: `protect` + `role(['admin', 'customer', 'staff'])`
    *   Controller: `jobCartController.getOne`
    *   Purpose: Fetches single job cart. Hides pricing attributes if role is `staff`.
*   `PUT /api/job-carts/:id`
    *   Auth: `protect` + `role(['admin', 'staff'])`
    *   Controller: `jobCartController.update`
    *   Purpose: Modifies basic attributes of a draft/open job cart.
*   `PATCH /api/job-carts/:id/submit`
    *   Auth: `protect` + `role(['admin', 'staff'])`
    *   Controller: `jobCartController.submit`
    *   Purpose: Advances cart status from `draft` to `open`.
*   `PATCH /api/job-carts/:id/complete`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `jobCartController.complete`
    *   Purpose: Processes completion. Deducts inventory stocks, awards loyalty points, allocates transactional entries, and sets unique invoice number.
*   `POST /api/job-carts/:id/services`
    *   Auth: `protect` + `role(['admin', 'staff'])`
    *   Controller: `jobCartController.addService`
    *   Purpose: Attaches service and items list to job cart.
*   `PUT /api/job-carts/:id/services/:sid`
    *   Auth: `protect` + `role(['admin', 'staff'])`
    *   Controller: `jobCartController.updateService`
    *   Purpose: Modifies service details inside job cart.
*   `DELETE /api/job-carts/:id/services/:sid`
    *   Auth: `protect` + `role(['admin', 'staff'])`
    *   Controller: `jobCartController.deleteService`
    *   Purpose: Removes service from job cart.
*   `POST /api/job-carts/:id/photos`
    *   Auth: `protect` + `role(['admin', 'staff'])`
    *   Controller: `jobCartController.uploadPhoto`
    *   Purpose: Uploads vehicle photo to Cloudinary and saves database reference.
*   `DELETE /api/job-carts/:id/photos/:pid`
    *   Auth: `protect` + `role(['admin', 'staff'])`
    *   Controller: `jobCartController.deletePhoto`
    *   Purpose: Removes photo record and deletes remote asset from Cloudinary.
*   `GET /api/job-carts/:id/invoice`
    *   Auth: `protect` + `role(['admin', 'customer'])`
    *   Controller: `jobCartController.getInvoice`
    *   Purpose: Stream generated invoice PDF in response (accepts token query parameter fallback for PDF downloads).
*   `DELETE /api/job-carts/:id`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `jobCartController.softDelete`
    *   Purpose: Soft-delete job cart by setting status to `cancelled`.
*   `POST /api/job-carts/:id/restore`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `jobCartController.restore`
    *   Purpose: Restores cancelled job cart back to `open` status.

### Booking Routes (`/api/bookings`)
*   `GET /api/bookings/vehicle-history/:regNo`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `bookingsController.vehicleHistory`
    *   Purpose: Fetches complete service history of a vehicle.
*   `GET /api/bookings`
    *   Auth: `protect` + `role(['admin', 'customer'])`
    *   Controller: `bookingsController.list`
    *   Purpose: Returns bookings (filtered by customer ID if not admin).
*   `GET /api/bookings/pending`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `bookingsController.listPending`
    *   Purpose: Admin route to list pending booking slots awaiting decision.
*   `GET /api/bookings/:id`
    *   Auth: `protect` + `role(['admin', 'customer'])`
    *   Controller: `bookingsController.getOne`
    *   Purpose: Fetch single booking details.
*   `POST /api/bookings`
    *   Auth: `protect` + `role(['customer', 'admin'])`
    *   Controller: `bookingsController.create`
    *   Purpose: Atomic booking reservation. Checks slot status, resolves vehicle brand/model, checks package credit eligibility, increments slot booked count, and inserts a `pending_approval` booking with a 5-minute timeout.
*   `PATCH /api/bookings/:id/cancel`
    *   Auth: `protect` + `role(['admin', 'customer'])`
    *   Controller: `bookingsController.cancel`
    *   Purpose: Cancels active booking. Restores slots, free wash counts, and package credits (if booking was already confirmed).
*   `PATCH /api/bookings/:id/approve`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `bookingsController.approve`
    *   Purpose: Confirms booking. Deducts package credits at this instant (Deferred Deduction) and updates booking status to `confirmed`.
*   `PATCH /api/bookings/:id/reject`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `bookingsController.reject`
    *   Purpose: Rejects booking and restores slots and package credits.

### User Package Routes (`/api/user-packages`)
*   `GET /api/user-packages/active`
    *   Auth: `protect`
    *   Controller: `userPackagesController.getActivePackage`
    *   Purpose: Returns active package subscription for the user with calculated remaining credits and expiration date.
*   `GET /api/user-packages/history`
    *   Auth: `protect`
    *   Controller: `userPackagesController.listUserPackages`
    *   Purpose: Returns package subscription history for the user.
*   `POST /api/user-packages/:id/renew`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `userPackagesController.renewPackage`
    *   Purpose: Renews an expired or active package subscription.
*   `POST /api/user-packages/consume`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `userPackagesController.consumeService`
    *   Purpose: Consumes reserved service credits.

### Package Catalog Routes (`/api/packages`)
*   `GET /api/packages`
    *   Auth: `optionalAuth`
    *   Controller: `packagesController.list`
    *   Purpose: List packages (customers see only active/visible packages).
*   `POST /api/packages/requests`
    *   Auth: `protect` + `role(['customer'])`
    *   Controller: `packagesController.createRequest`
    *   Purpose: Customers purchase a package. Status is marked as `pending`.
*   `GET /api/packages/requests/my`
    *   Auth: `protect` + `role(['customer'])`
    *   Controller: `packagesController.getMyRequests`
    *   Purpose: Customer lists own package requests.
*   `GET /api/packages/requests`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `packagesController.listRequests`
    *   Purpose: Admin lists pending package requests.
*   `PUT /api/packages/requests/:id/approve`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `packagesController.approveRequest`
    *   Purpose: Approves package request, adds user package subscription, and populates package usage entitlements.
*   `PUT /api/packages/requests/:id/reject`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `packagesController.rejectRequest`
    *   Purpose: Rejects package request with reason.
*   `GET /api/packages/requests/:id/invoice`
    *   Auth: `optionalAuth`
    *   Controller: `packagesController.downloadInvoice`
    *   Purpose: Downloads Puppeteer-generated package invoice PDF.
*   `GET /api/packages/:id/services`
    *   Auth: `protect`
    *   Controller: `packagesController.getPackageServices`
    *   Purpose: Get list of services included in a specific package.
*   `GET /api/packages/:id`
    *   Auth: `public`
    *   Controller: `packagesController.getOne`
    *   Purpose: Get single package details.
*   `POST /api/packages`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `packagesController.create`
    *   Purpose: Admin creates package catalog item.
*   `PUT /api/packages/:id`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `packagesController.update`
    *   Purpose: Admin updates package catalog item.
*   `PATCH /api/packages/:id/toggle`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `packagesController.togglePublish`
    *   Purpose: Admin toggles package publish status.
*   `PATCH /api/packages/:id/visibility`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `packagesController.toggleVisibility`
    *   Purpose: Admin toggles package customer visibility status.
*   `DELETE /api/packages/:id`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `packagesController.delete`
    *   Purpose: Delete package from catalog.
*   `POST /api/packages/assign`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `userPackagesController.assignPackage`
    *   Purpose: Directly assign package subscription to user (bypasses request flow).

### Loyalty Routes (`/api/loyalty`)
*   `GET /api/loyalty/mine`
    *   Auth: `protect` + `role(['customer'])`
    *   Controller: `loyaltyController.get`
    *   Purpose: Fetch active loyalty details.
*   `GET /api/loyalty/mine/history`
    *   Auth: `protect` + `role(['customer'])`
    *   Controller: `loyaltyController.history`
    *   Purpose: Fetch points ledger history.
*   `GET /api/loyalty/search`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `loyaltyController.search`
    *   Purpose: Find loyalty record by customer.
*   `GET /api/loyalty/settings`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `loyaltyController.getSettings`
    *   Purpose: Fetch global loyalty point rules.
*   `PUT /api/loyalty/settings`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `loyaltyController.updateSettings`
    *   Purpose: Edit global loyalty rules.
*   `POST /api/loyalty/award`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `loyaltyController.award`
    *   Purpose: Manually award or adjust customer loyalty points.

### Staff & HR Routes (`/api/staff`)
*   `GET /api/staff/my-payments`
    *   Auth: `protect` + `role(['staff'])`
    *   Controller: `staffController.getMyPayments`
    *   Purpose: Fetch personal payments history.
*   `POST /api/staff/check-in`
    *   Auth: `protect` + `role(['staff'])`
    *   Controller: `staffController.checkIn`
    *   Purpose: Marks attendance check-in.
*   `POST /api/staff/check-out`
    *   Auth: `protect` + `role(['staff'])`
    *   Controller: `staffController.checkOut`
    *   Purpose: Marks attendance check-out.
*   `GET /api/staff/my-attendance`
    *   Auth: `protect` + `role(['staff'])`
    *   Controller: `staffController.getMyAttendance`
    *   Purpose: Fetches personal attendance.
*   `GET /api/staff`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `staffController.list`
    *   Purpose: Admin lists all staff.
*   `GET /api/staff/:id`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `staffController.getOne`
    *   Purpose: Fetch single staff details.
*   `POST /api/staff`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `staffController.create`
    *   Purpose: Creates new staff member.
*   `PUT /api/staff/:id`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `staffController.update`
    *   Purpose: Edit staff details.
*   `POST /api/staff/:id/attendance`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `staffController.markAttendance`
    *   Purpose: Manually check attendance.
*   `GET /api/staff/:id/attendance`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `staffController.getAttendance`
    *   Purpose: Fetch attendance log for specific staff.
*   `POST /api/staff/:id/payment`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `staffController.addPayment`
    *   Purpose: Record payment transaction for staff.
*   `GET /api/staff/:id/payments`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `staffController.getPayments`
    *   Purpose: Fetch staff payment history.
*   `PATCH /api/staff/:id/payment/:pid/complete`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `staffController.completePayment`
    *   Purpose: Marks salary/advance payment as complete.

### Accounts Routes (`/api/accounts`)
*   `GET /api/accounts/summary`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `accountsController.summary`
    *   Purpose: Fetch quick dashboard account metrics.
*   `GET /api/accounts/transactions`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `accountsController.transactions`
    *   Purpose: List transaction ledger.
*   `GET /api/accounts/report`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `accountsController.report`
    *   Purpose: Generate profit/loss account report.
*   `GET /api/accounts/kpis`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `accountsController.kpis`
    *   Purpose: Fetch key performance indicators.

### Buy-Sell Routes (`/api/buy-sell`)
*   `GET /api/buy-sell`
    *   Auth: `protect`
    *   Controller: `buySellController.list`
    *   Purpose: Fetch all transactions.
*   `POST /api/buy-sell`
    *   Auth: `protect`
    *   Controller: `buySellController.create`
    *   Purpose: Record buy/sell deal.
*   `GET /api/buy-sell/:id`
    *   Auth: `protect`
    *   Controller: `buySellController.getOne`
    *   Purpose: Fetch single transaction.
*   `PATCH /api/buy-sell/:id/status`
    *   Auth: `protect`
    *   Controller: `buySellController.updateStatus`
    *   Purpose: Toggle pending vs completed status.
*   `GET /api/buy-sell/:id/invoice`
    *   Auth: `protect`
    *   Controller: `buySellController.downloadInvoice`
    *   Purpose: Download Deal Invoice PDF.

### Messages Routes (`/api/messages`)
*   `GET /api/messages`
    *   Auth: `protect`
    *   Controller: `messagesController.list`
    *   Purpose: Fetch logs.
*   `POST /api/messages/bulk`
    *   Auth: `protect`
    *   Controller: `messagesController.sendBulk`
    *   Purpose: Initiate transactional bulk SMS campaign.

### Inquiry Routes (`/api/inquiries`)
*   `POST /api/inquiries`
    *   Auth: `public` (website widget support) or `protect`
    *   Controller: `inquiriesController.create`
    *   Purpose: Submits inquiry lead.
*   `GET /api/inquiries`
    *   Auth: `protect`
    *   Controller: `inquiriesController.list`
    *   Purpose: List leads.
*   `GET /api/inquiries/:id`
    *   Auth: `protect`
    *   Controller: `inquiriesController.getOne`
    *   Purpose: Fetch details.
*   `PATCH /api/inquiries/:id/status`
    *   Auth: `protect`
    *   Controller: `inquiriesController.updateStatus`
    *   Purpose: Update status enum.
*   `POST /api/inquiries/:id/convert`
    *   Auth: `protect`
    *   Controller: `inquiriesController.convert`
    *   Purpose: Converts lead and auto-creates vehicle and customer profile.
*   `DELETE /api/inquiries/:id`
    *   Auth: `protect` + `authorize('admin')`
    *   Controller: `inquiriesController.delete`
    *   Purpose: Deletes inquiries lead.

### Delivery Routes (`/api/deliveries`)
*   `GET /api/deliveries`
    *   Auth: `protect`
    *   Controller: `deliveriesController.list`
    *   Purpose: List active deliveries.
*   `GET /api/deliveries/active`
    *   Auth: `protect` + `authorize('staff')`
    *   Controller: `deliveriesController.getActiveDelivery`
    *   Purpose: Staff gets their active assigned delivery.
*   `GET /api/deliveries/my`
    *   Auth: `protect` + `authorize('customer')`
    *   Controller: `deliveriesController.getMyDelivery`
    *   Purpose: Customer gets active delivery tracking attributes.
*   `GET /api/deliveries/:id`
    *   Auth: `protect`
    *   Controller: `deliveriesController.getOne`
    *   Purpose: Fetch delivery.
*   `POST /api/deliveries`
    *   Auth: `protect` + `authorize('admin', 'staff')`
    *   Controller: `deliveriesController.startDelivery`
    *   Purpose: Dispatches driver with vehicle.
*   `PATCH /api/deliveries/:id/complete`
    *   Auth: `protect` + `authorize('admin', 'staff')`
    *   Controller: `deliveriesController.completeDelivery`
    *   Purpose: Mark delivery status as completed.
*   `PATCH /api/deliveries/:id/location`
    *   Auth: `protect` + `authorize('admin', 'staff')`
    *   Controller: `deliveriesController.updateLocation`
    *   Purpose: Updates current latitude/longitude coordinate (falls back to socket broadcast).
*   `GET /api/deliveries/:id/location`
    *   Auth: `protect`
    *   Controller: `deliveriesController.getLocation`
    *   Purpose: Get current location coordinates.

### Settings Routes (`/api/settings`)
*   `GET /api/settings`
    *   Auth: `protect`
    *   Controller: `settingsController.get`
    *   Purpose: Fetch global configurations.
*   `PUT /api/settings`
    *   Auth: `protect`
    *   Controller: `settingsController.update`
    *   Purpose: Edit configurations.

### Dashboard Routes (`/api/dashboard`)
*   `GET /api/dashboard/admin`
    *   Auth: `protect`
    *   Controller: `dashboardController.adminSummary`
    *   Purpose: Returns admin revenue charts, active staff count, and low stock alarms.
*   `GET /api/dashboard/customer`
    *   Auth: `protect`
    *   Controller: `dashboardController.customerSummary`
    *   Purpose: Returns active packages and booking summaries for customer.

### Vehicles Routes (`/api/vehicles`)
*   `GET /api/vehicles`
    *   Auth: `protect`
    *   Controller: `vehiclesController.list`
    *   Purpose: List vehicles (filtered by customer ID if not admin).
*   `POST /api/vehicles`
    *   Auth: `protect`
    *   Controller: `vehiclesController.create`
    *   Purpose: Creates new vehicle entry.
*   `GET /api/vehicles/:id`
    *   Auth: `protect`
    *   Controller: `vehiclesController.getOne`
    *   Purpose: Fetch vehicle.
*   `PUT /api/vehicles/:id`
    *   Auth: `protect`
    *   Controller: `vehiclesController.update`
    *   Purpose: Edit vehicle.
*   `DELETE /api/vehicles/:id`
    *   Auth: `protect`
    *   Controller: `vehiclesController.delete`
    *   Purpose: Delete vehicle.
*   `PATCH /api/vehicles/:id/primary`
    *   Auth: `protect`
    *   Controller: `vehiclesController.setPrimary`
    *   Purpose: Sets vehicle as primary.

### Customers Routes (`/api/customers`)
*   `GET /api/customers`
    *   Auth: `protect`
    *   Controller: `customersController.list`
    *   Purpose: Admin directory list.
*   `GET /api/customers/:id`
    *   Auth: `protect`
    *   Controller: `customersController.getOne`
    *   Purpose: Detailed 360 profile.
*   `GET /api/customers/:id/vehicles`
    *   Auth: `protect`
    *   Controller: `customersController.getVehicles`
    *   Purpose: List customer's vehicles.
*   `GET /api/customers/:id/loyalty`
    *   Auth: `protect`
    *   Controller: `customersController.getLoyalty`
    *   Purpose: Fetch customer loyalty ledger.
*   `GET /api/customers/:id/packages`
    *   Auth: `protect`
    *   Controller: `customersController.getPackages`
    *   Purpose: Fetch customer packages list.
*   `GET /api/customers/:id/bookings`
    *   Auth: `protect`
    *   Controller: `customersController.getBookings`
    *   Purpose: Fetch bookings for customer.
*   `GET /api/customers/:id/job-carts`
    *   Auth: `protect`
    *   Controller: `customersController.getJobCarts`
    *   Purpose: Fetch customer job carts.
*   `GET /api/customers/:id/invoices`
    *   Auth: `protect`
    *   Controller: `customersController.getInvoices`
    *   Purpose: Fetch list of customer invoices.

### Slots Routes (`/api/slots`)
*   `GET /api/slots`
    *   Auth: `protect`
    *   Controller: `slotsController.list`
    *   Purpose: Lists slots.
*   `POST /api/slots`
    *   Auth: `protect`
    *   Controller: `slotsController.create`
    *   Purpose: Create slot.
*   `POST /api/slots/bulk`
    *   Auth: `protect`
    *   Controller: `slotsController.createBulk`
    *   Purpose: Generate slots for multiple days.
*   `PATCH /api/slots/:id/block`
    *   Auth: `protect`
    *   Controller: `slotsController.toggleBlock`
    *   Purpose: Blocks slot.
*   `DELETE /api/slots/:id`
    *   Auth: `protect`
    *   Controller: `slotsController.delete`
    *   Purpose: Deletes slot.

### Inventory Routes (`/api/inventory`)
*   `GET /api/inventory`
    *   Auth: `protect`
    *   Controller: `inventoryController.list`
    *   Purpose: List items.
*   `POST /api/inventory`
    *   Auth: `protect`
    *   Controller: `inventoryController.create`
    *   Purpose: Create product.
*   `GET /api/inventory/:id`
    *   Auth: `protect`
    *   Controller: `inventoryController.getOne`
    *   Purpose: Fetch item.
*   `PUT /api/inventory/:id`
    *   Auth: `protect`
    *   Controller: `inventoryController.update`
    *   Purpose: Edit product.
*   `DELETE /api/inventory/:id`
    *   Auth: `protect`
    *   Controller: `inventoryController.delete`
    *   Purpose: Delete product.
*   `POST /api/inventory/:id/images`
    *   Auth: `protect`
    *   Controller: `inventoryController.uploadImage`
    *   Purpose: Cloudinary upload for item.

### Services Routes (`/api/services`)
*   `GET /api/services`
    *   Auth: `public` or `protect`
    *   Controller: `servicesController.list`
    *   Purpose: List services.
*   `POST /api/services`
    *   Auth: `protect`
    *   Controller: `servicesController.create`
    *   Purpose: Create service.
*   `GET /api/services/:id`
    *   Auth: `public` or `protect`
    *   Controller: `servicesController.getOne`
    *   Purpose: Fetch service.
*   `PUT /api/services/:id`
    *   Auth: `protect`
    *   Controller: `servicesController.update`
    *   Purpose: Edit service.
*   `DELETE /api/services/:id`
    *   Auth: `protect`
    *   Controller: `servicesController.delete`
    *   Purpose: Delete service.
*   `PATCH /api/services/:id/toggle`
    *   Auth: `protect`
    *   Controller: `servicesController.toggleActive`
    *   Purpose: Toggle active/inactive.
*   `PATCH /api/services/:id/premium`
    *   Auth: `protect`
    *   Controller: `servicesController.togglePremium`
    *   Purpose: Set service as premium.
*   `POST /api/services/:id/addons`
    *   Auth: `protect`
    *   Controller: `servicesController.addAddon`
    *   Purpose: Add addon option.
*   `DELETE /api/services/:id/addons/:addonId`
    *   Auth: `protect`
    *   Controller: `servicesController.deleteAddon`
    *   Purpose: Delete addon option.

### Reports Routes (`/api/reports`)
*   `GET /api/reports/generate`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `reportsController.generate`
    *   Purpose: Generates xlsx report of studio performance.
*   `GET /api/reports/pdf`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `reportsController.generatePDF`
    *   Purpose: PDF report via Puppeteer.

### Billing Routes (`/api/billing`)
*   `GET /api/billing`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `billingController.list`
    *   Purpose: List manual bills.
*   `GET /api/billing/:id/invoice`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `billingController.downloadInvoice`
    *   Purpose: Downloads Manual Bill PDF invoice.
*   `GET /api/billing/:id`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `billingController.getOne`
    *   Purpose: Get bill details.
*   `POST /api/billing`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `billingController.create`
    *   Purpose: Creates new manual bill transaction.
*   `DELETE /api/billing/:id`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `billingController.softDelete`
    *   Purpose: Soft-delete manual bill (status = `cancelled`).
*   `POST /api/billing/:id/restore`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `billingController.restore`
    *   Purpose: Restores cancelled manual bill.

### Salary Routes (`/api/salary`)
*   `GET /api/salary`
    *   Auth: `protect`
    *   Controller: `salaryController.list`
    *   Purpose: Lists salary records.
*   `POST /api/salary`
    *   Auth: `protect`
    *   Controller: `salaryController.process`
    *   Purpose: Processes payroll.
*   `POST /api/salary/:id/payout`
    *   Auth: `protect`
    *   Controller: `salaryController.payout`
    *   Purpose: Finalize payment.

### Archive Routes (`/api/archive`)
*   `GET /api/archive`
    *   Auth: `protect` + `role(['admin'])`
    *   Controller: `archiveController.listArchived`
    *   Purpose: Lists soft-deleted / archived tables.

### Search Routes (`/api/search`)
*   `GET /api/search`
    *   Auth: `protect`
    *   Controller: `searchController.globalSearch`
    *   Purpose: Triggers global search across customers, vehicles, inventory, and vendors.

### Import Routes (`/api/import`)
*   `GET /api/import/template`
    *   Auth: `public`
    *   Controller: `importController.downloadTemplate`
    *   Purpose: Download Excel template.
*   `POST /api/import/customers`
    *   Auth: `protect`
    *   Controller: `importController.importCustomers`
    *   Purpose: Import customer profiles via Excel file upload.
*   `POST /api/import/inventory`
    *   Auth: `protect`
    *   Controller: `importController.importInventory`
    *   Purpose: Import inventory products.

### Quick Wash Routes (`/api/quick-wash`)
*   `GET /api/quick-wash`
    *   Auth: `protect`
    *   Controller: `quickWashController.list`
    *   Purpose: Lists quick wash queue bookings.
*   `POST /api/quick-wash`
    *   Auth: `protect`
    *   Controller: `quickWashController.create`
    *   Purpose: Registers quick wash.
*   `GET /api/quick-wash/stats`
    *   Auth: `protect`
    *   Controller: `quickWashController.stats`
    *   Purpose: Returns stats.
*   `PATCH /api/quick-wash/:id/status`
    *   Auth: `protect`
    *   Controller: `quickWashController.updateStatus`
    *   Purpose: Update status.
*   `GET /api/quick-wash/:id/invoice`
    *   Auth: `protect`
    *   Controller: `quickWashController.downloadInvoice`
    *   Purpose: Download PDF bill for quick wash.

---

## SECTION 5 — FRONTEND ROUTE MAP

Frontend paths are defined in [App.tsx](file:///c:/Users/Aryan/OneDrive/Desktop/Software%20(1)/Software/client/src/App.tsx) and wrapped inside permission routers:
*   `ProtectedRoute`: Redirects to `/login` if `isAuthenticated` state in `useAuthStore` is false.
*   `RoleRoute`: Verifies current user's role exists inside `allowedRoles` array. If not authorized, calls `getDefaultRedirect()` redirecting users to their own portal page.

### Public Routes
*   `/login` -> `LoginPage` — Account log-in screen
*   `/register` -> `RegisterPage` — Customer register screen (supports registration of vehicle make and variant)
*   `/forgot-password` -> `ForgotPasswordPage` — Password recovery screen

### Admin Private Routes (Role Guard: `admin`)
*   `/admin` -> `DashboardPage` — Analytics dashboard
*   `/admin/job-carts` -> `JobCartListPage` — Lists draft/open/completed job sheets
*   `/admin/job-carts/new` -> `JobCartCreatePage` — Opens a new detailing sheet
*   `/admin/job-carts/:id` -> `JobCartDetailPage` — Edit, update, add service/products, complete job cart, upload photos
*   `/admin/inventory` -> `InventoryPage` — Stock ledger, reorder level warnings
*   `/admin/slots` -> `SlotsPage` — Booking calendar settings, slot creations
*   `/admin/customer-bookings` -> `CustomerBookingsPage` — Booking slot confirmations/rejections
*   `/admin/services` -> `ServicesPage` — Detailing service catalog
*   `/admin/packages` -> `PackagesPage` — Package catalog
*   `/admin/staff` -> `StaffPage` — Employee list
*   `/admin/staff/:id` -> `StaffDetailPage` — Employee details
*   `/admin/accounts` -> `AccountsPage` — Transaction ledgers
*   `/admin/buy-sell` -> `BuySellPage` — Used cars trading logs
*   `/admin/messages` -> `MessagesPage` — Message logs
*   `/admin/inquiries` -> `InquiriesPage` — Leads tracker
*   `/admin/import` -> `ImportPage` — Data uploads (Excel)
*   `/admin/settings` -> `SettingsPage` — Global studio parameters
*   `/admin/customers` -> `CustomersListPage` — Customer directory
*   `/admin/customers/:id` -> `CustomerDetailPage` — Customer details
*   `/admin/add-customer` -> `ManualRegistrationPage` — Customer manual registration
*   `/admin/package-approvals` -> `PackageApprovalsPage` — Customer package buy request approvals
*   `/admin/reports` -> `ReportsPage` — Studio report downloads
*   `/admin/billing` -> `QuickBillingPage` — Direct manual billing invoices
*   `/admin/invoices` -> `AllInvoicesPage` — Central invoice list
*   `/admin/salary` -> `StaffSalaryPage` — Payroll processing
*   `/admin/vendors` -> `VendorsPage` — Supplier directory
*   `/admin/archive` -> `ArchivePage` — Historical/deleted records
*   `/admin/quick-wash` -> `QuickWashPage` — Streamlined quick wash queue
*   `/admin/loyalty` -> `LoyaltySettingsPage` — Loyalty configurations
*   `/admin/premium-services` -> `PremiumServicesPage` — Premium service tier configuration
*   `/admin/deliveries` -> `AdminDeliveriesPage` — Deliveries tracking
*   `/admin/payments` -> `PaymentsPage` — Payment ledger
*   `/admin/feedback` -> `FeedbackPage` — Customer reviews list
*   `/admin/balance-sheet` -> `BalanceSheetPage` — Financial statement
*   `/admin/audit-logs` -> `AuditLogPage` — Logs of system mutations
*   `/admin/staff-hr` -> `StaffHRPage` — Staff attendance and leaves log
*   `/admin/whatsapp` -> `WhatsAppPage` — Notification templates log
*   `/admin/customer-rewards` -> `CustomerRewardsPage` — Custom points management

### Customer Private Routes (Role Guard: `customer`)
*   `/customer` -> `CustomerDashboardPage` — Overview (active package, points, bookings)
*   `/customer/services` -> `CustomerServicesPage` — Services catalog
*   `/customer/job-carts` -> `CustomerJobCartsPage` — Detailing history list
*   `/customer/bookings` -> `BookingsPage` — Booking history
*   `/customer/bookings/new` -> `BookingPage` — Book slot calendar (filters services by package credits)
*   `/customer/loyalty` -> `LoyaltyPage` — Loyalty point details
*   `/customer/vehicles` -> `VehiclesPage` — Vehicles CRUD
*   `/customer/buy-packages` -> `CustomerBuyPackagesPage` — Select and buy packages
*   `/customer/profile` -> `ProfilePage` — Edit profile details
*   `/customer/delivery/:id` -> `TrackingPage` — Real-time Google Maps GPS delivery tracker

### Staff Private Routes (Role Guard: `staff`)
*   `/staff/job-carts` -> `StaffJobCartsPage` — View and edit assigned open job carts (prices hidden)
*   `/staff/inventory` -> `StaffInventoryPage` — View stock levels and edit count
*   `/staff/benefits` -> `StaffBenefitsPage` — Personal check-in history and payment logs
*   `/staff/inquiry` -> `StaffInquiryPage` — Submit leads
*   `/staff/delivery` -> `DeliveryPage` — GPS delivery driver tracking interface

---

## SECTION 6 — AUTHENTICATION & AUTHORIZATION SYSTEM

*   **JWT Payload Format**:
    ```json
    {
      "id": 12,
      "role": "customer",
      "name": "Aryan",
      "mobile": "9876543210"
    }
    ```
*   **Session Token Storage**: Handled by Zustand store `useAuthStore` under the sessionStorage key `gk-auth-v1` (with built-in migration that checks and clears legacy localStorage entries to secure tokens across public computers).
*   **Token Validity**: Verified on backend with `protect` middleware checking token signature. Expiration set to 7 days (`JWT_EXPIRES_IN=7d` inside `server/.env`).
*   **Auto-Logout Inactivity Trigger**: Monitored by client hook [useInactivityTimer.ts](file:///c:/Users/Aryan/OneDrive/Desktop/Software%20(1)/Software/client/src/utils/useInactivityTimer.ts). After 25 minutes of inactivity (no keydown, mousedown, mousemove, touchstart, or scroll events throttled to 30-second checks), the app dispatches a custom window event `gk-inactivity-warning` displaying a warning toast to the user. At 30 minutes, it automatically calls the `logout` store action and redirects to `/login`.
*   **Silent Token Refresh**: Handled by `useTokenRefresh` hook. Checks token expiry on app launch. If expired, logs out immediately; otherwise, runs a silent `POST /api/auth/refresh` request every 45 minutes to get a fresh token before hitting the 1-hour JWT limit.
*   **Unauthorized Request Handling (401 Response)**: Axios interceptor intercepts any 401 response and clears Zustand session keys before redirecting the page to `/login`.
*   **Socket.io Handshake Auth**: The Socket server uses a JWT authorization handshake middleware. Clients must provide token payload on initial connection:
    ```javascript
    const socket = io(SERVER_URL, {
      auth: { token: useAuthStore.getState().token }
    });
    ```

---

## SECTION 7 — CRITICAL BUSINESS WORKFLOWS

### Workflow 1: Customer Package Purchase & Approval
1.  **Selection**: Customer visits `/customer/buy-packages` ([BuyPackagesPage.tsx](file:///c:/Users/Aryan/OneDrive/Desktop/Software%20(1)/Software/client/src/pages/customer/BuyPackagesPage.tsx)), selects a package (e.g. Gold Package), chooses a car category, and submits purchase intent.
2.  **Purchase Request Creation**: The frontend triggers `POST /api/packages/requests` passing the vehicle ID, package ID, selected pricing type, and calculated segment price. An entry is created in the `package_requests` table with `status = 'pending'`.
3.  **Admin Review**: Admin opens `/admin/package-approvals` ([PackageApprovalsPage.tsx](file:///c:/Users/Aryan/OneDrive/Desktop/Software%20(1)/Software/client/src/pages/admin/PackageApprovalsPage.tsx)) listing pending requests.
4.  **Approval Logic**: Admin clicks "Approve", which calls `PUT /api/packages/requests/:id/approve` inside `packagesController.js` (`approveRequest`):
    *   Starts a database transaction.
    *   Updates `package_requests.status = 'approved'` and sets `approved_at = CURRENT_TIMESTAMP`.
    *   Inserts subscription row into `user_packages` with `package_status = 'active'`, `pricing_type` and `car_type`. Expiry (`end_date`) is calculated as 1 year from activation.
    *   Resolves total service entitlements (paid + complimentary) using `getServiceBreakdown`. Inserts matching rows into `package_usage` with `used_count = 0` and `usage_status = 'available'`.
    *   Commits transaction.
5.  **Notifications**: Dispatches a fire-and-forget confirmation SMS via MSG91/2Factor API.

### Workflow 2: Customer Booking Creation & Approval (Deferred Deduction Pattern)
1.  **Booking Submission**: Customer opens `/customer/bookings/new` ([BookingPage.tsx](file:///c:/Users/Aryan/OneDrive/Desktop/Software%20(1)/Software/client/src/pages/customer/BookingPage.tsx)). If selecting a package service, the booking calls the API to verify credit availability.
2.  **Credit Check**: Frontend triggers the backend `POST /api/bookings` handler (`bookingsController.create`):
    *   Acquires a row-level lock on the slot (`SELECT FOR UPDATE`) to prevent double-booking. Checks that capacity is not exceeded.
    *   If package-based booking: calls `userPackagesController.checkServiceAvailability` to verify that active package subscription exists and has available credits (`total_count` - `used_count` > 0) for the service. **Crucially: No credits are deducted from the database at this step.**
    *   Increments slot `booked_count`.
    *   Creates a booking record with `status = 'pending_approval'`, `expires_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE)`.
3.  **Expiry Cron Job**: A 1-minute background cron task checks for pending bookings whose `expires_at` has passed. It updates status to `expired`, decrements slot `booked_count`, and restores free washes if applicable.
4.  **Admin Decision (Confirm/Deduct)**: Admin reviews requests at `/admin/customer-bookings` ([CustomerBookingsPage.tsx](file:///c:/Users/Aryan/OneDrive/Desktop/Software%20(1)/Software/client/src/pages/admin/CustomerBookingsPage.tsx)) and clicks "Approve". Calls `PATCH /api/bookings/:id/approve` inside `bookingsController.js` (`approve`):
    *   Starts a transaction.
    *   If booking type is `package`, calls `userPackagesController.checkAndUseService`:
        *   Locks the package usage row using `FOR UPDATE`.
        *   Checks remaining balance.
        *   Increments `used_count` for the service in `package_usage` (Deduction executes now).
    *   Updates `bookings.status = 'confirmed'`, `approved_by = req.user.id`, `approved_at = NOW()`, and clears `expires_at`.
    *   Commits transaction and triggers confirmation SMS.
5.  **Rejection/Cancellation (Refund)**: If booking is cancelled or rejected, slot count is decremented. If booking was already `confirmed` (meaning credits were deducted), `userPackagesController.cancelReservation` is called to decrement `used_count` (restoring credits). If status was still `pending_approval`, no credit restoration is needed.

### Workflow 3: Job Cart Lifecycle (Core Detailing Workflow)
1.  **Creation**: Admin/Staff opens a job cart via `/admin/job-carts/new` ([JobCartCreatePage.tsx](file:///c:/Users/Aryan/OneDrive/Desktop/Software%20(1)/Software/client/src/pages/admin/JobCartCreatePage.tsx)). If the vehicle or customer does not exist, they are automatically created during submission. Initial job cart status is set to `draft`.
2.  **Submission**: Staff adds requested services and saves cart. Once finalized, clicks "Submit" which sets `status = 'open'`.
3.  **Operational Modifications**: While `open`, staff can add consumables (which record products from inventory and unit costs), specify labor charges, and upload photos of detailing stages (before/after).
4.  **Completion**: Admin clicks "Complete" at `/admin/job-carts/:id` ([JobCartDetailPage.tsx](file:///c:/Users/Aryan/OneDrive/Desktop/Software%20(1)/Software/client/src/pages/admin/JobCartDetailPage.tsx)). Backend processes completion via `jobCartController.complete`:
    *   Locks transaction pool.
    *   Updates job cart `status = 'complete'`, sets `completed_at = NOW()`.
    *   Deducts all consumed products from `inventory`.
    *   Calculates service total + labor charges + product costs, deducts discounts, and creates transaction record in `transactions` with type `job_revenue`.
    *   Acquires lock on invoice counter, formats invoice number (`GKA-YYYY-[COUNTER]`), updates setting `invoice_counter = invoice_counter + 1`, and saves to job cart.
    *   Commits transaction and dispatches completing messages (SMS & WhatsApp).

### Workflow 4: Loyalty Points System
*   **Point Accumulation**: Configured under `loyalty_settings` points ratio (points awarded per rupee spent on services). Loyalty awards are recorded automatically during job cart completion or package approval.
*   **Redemption**: During slot booking, customers can redeem points. Points are converted to cash equivalents based on `point_value` settings and recorded as transactions in `loyalty_transactions`.
*   **Award Adjustments**: Admins can manually award bonus points via `/admin/loyalty` ([LoyaltyAwardPage.tsx](file:///c:/Users/Aryan/OneDrive/Desktop/Software%20(1)/Software/client/src/pages/admin/LoyaltyAwardPage.tsx)).

### Workflow 5: Quick Wash Flow
*   **Bypassing overhead**: Used for simple washes. Walk-ins are registered directly in `/admin/quick-wash` ([QuickWashPage.tsx](file:///c:/Users/Aryan/OneDrive/Desktop/Software%20(1)/Software/client/src/pages/admin/QuickWashPage.tsx)).
*   **Execution**: Does not require inventory deduction or staff specializations. Car enters a queue (`washing` -> `completed` -> `delivered`).
*   **Billing**: Completing a wash generates a simplified invoice (`QW-[BOOKING_ID]`) and records transaction revenue.

### Workflow 6: Invoice/PDF Generation
*   **Puppeteer Engine**: Configured in `invoiceService.js`. Invoices use pre-compiled HTML templates with base64 embedded assets.
*   **Bypass JWT restrictions**: Browser PDF downloads in a new tab cannot easily inject authorization headers. Thus, the system permits passing a short-lived query token (`?token=JWT`) which the `protect` middleware automatically intercepts and decodes.

### Workflow 7: Staff Attendance & Salary
*   **Attendance**: Staff check-in/out via their dashboard.
*   **Automated Absenteeism**: A cron job runs daily at 9:00 PM. It inserts `absent` attendance rows for any active staff member who has not clocked in.
*   **Payroll**: Admins review attendance counts, apply bonuses/deductions, and process salary records at `/admin/salary` ([StaffSalaryPage.tsx](file:///c:/Users/Aryan/OneDrive/Desktop/Software%20(1)/Software/client/src/pages/admin/StaffSalaryPage.tsx)).

---

## SECTION 8 — REAL-TIME FEATURES (Socket.io)

*   **Server Setup**: Integrated directly into the Express HTTP server instances inside [app.js](file:///c:/Users/Aryan/OneDrive/Desktop/Software%20(1)/Software/server/src/app.js).
*   **Authentication Check**: Handshake middleware validates the JWT token in `socket.handshake.auth.token` before connection is accepted.
*   **GPS Delivery Tracking Flow**:
    1.  Driver dispatches and enters `/staff/delivery` ([DeliveryPage.tsx](file:///c:/Users/Aryan/OneDrive/Desktop/Software%20(1)/Software/client/src/pages/staff/DeliveryPage.tsx)). Clicking "Start Delivery" triggers an API call that updates status to `in_transit` and initiates GPS tracking.
    2.  Driver joins the tracking room by emitting `join_delivery` with `{ deliveryId }`.
    3.  Customer opens `/customer/delivery/:id` ([TrackingPage.tsx](file:///c:/Users/Aryan/OneDrive/Desktop/Software%20(1)/Software/client/src/pages/customer/TrackingPage.tsx)) which joins the same delivery room.
    4.  Driver's device emits `location_update` with `{ deliveryId, lat, lng }` at regular intervals.
    5.  The server broadcasts `location` events to all clients in the delivery room, updating the customer's Google Map in real-time.
*   **Other events**:
    *   `new_booking`: Emitted on booking creation to notify the admin panel to refresh lists.

---

## SECTION 9 — EXTERNAL INTEGRATIONS

### MSG91 / 2Factor.in SMS Gateway
*   **Dual implementation**: Named `MSG91` in configurations, but calls the 2Factor.in transactional SMS API (`https://2factor.in/API/R1/`) under the hood when `MSG91_AUTH_KEY` is present.
*   **Mock Mode**: If `MSG91_AUTH_KEY` is missing, the service logs SMS content to the terminal (`[MOCK SMS] To: ...`).
*   **DLT Templates**: The sender ID is configured as `GKAHER` or `GKAUTO`. Text parameters must exactly match registered templates.

### Cloudinary Storage
*   **Config**: Setup in `config/cloudinary.js`.
*   **Multer Integration**: Middleware `middleware/upload.js` maps uploads directly to Cloudinary storage. Automatically scales images to 1200x1200px.

### Razorpay Gateway
*   **Partial Integration**: Credentials (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`) are read by the environment. API hooks exist on the frontend, but the checkout completion and webhook validation are currently stubbed.

### Google Maps API
*   **Integration**: Loaded in customer maps tracking pages via `@googlemaps/js-api-loader`. Requires `GOOGLE_MAPS_API_KEY`.

---

## SECTION 10 — BACKGROUND JOBS (CRON)

All scheduled background tasks are managed in [cronService.js](file:///c:/Users/Aryan/OneDrive/Desktop/Software%20(1)/Software/server/src/services/cronService.js):

| Schedule | Task Name | Description |
| :--- | :--- | :--- |
| `0 9 * * *` | Service Reminders | Daily at 9:00 AM. Scans for customer vehicles whose last completed service was exactly 90 days ago and dispatches re-engagement messages. |
| `0 21 * * *` | Auto Absentee | Daily at 9:00 PM. Auto-inserts `absent` attendance records for staff members who failed to check-in. |
| `* * * * *` | Booking Expiry | Every minute. Expires pending bookings whose `expires_at` has passed. Releases slot counts and restores free wash counts. |
| `0 0 * * *` | Package Expiry | Daily at midnight. Marks active customer package subscriptions as `expired` if their end date has passed. |

---

## SECTION 11 — ENVIRONMENT VARIABLES REFERENCE

```bash
# Database Parameters
DB_HOST=localhost
DB_PORT=3306
DB_NAME=o3_car_spa
DB_USER=root
DB_PASSWORD=1234

# Security Secrets
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=7d

# Outbound SMS Configurations
MSG91_AUTH_KEY=YOUR_2FACTOR_API_KEY
MSG91_SENDER_ID=GKAUTO
MSG91_WHATSAPP_NUMBER=
ADMIN_WHATSAPP_NUMBER=

# Cloud Media parameters
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# External API Keys
GOOGLE_MAPS_API_KEY=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=

# Server Runtime parameters
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:5173
SERVER_URL=http://localhost:5000
APP_BASE_URL=http://localhost:5000

# Puppeteer Executable
PUPPETEER_EXECUTABLE_PATH=
```

---

## SECTION 12 — FILE STRUCTURE MAP

```
Software/
├── server/                          # Node.js/Express backend
│   ├── .env                         # Backend environment variables
│   ├── package.json                 # Backend dependencies & scripts
│   ├── src/
│   │   ├── app.js                   # Main application entry point & routes mounting
│   │   ├── config/
│   │   │   ├── db.js                # Database pool connection manager
│   │   │   └── cloudinary.js        # Cloudinary configurations
│   │   ├── middleware/
│   │   │   ├── auth.js              # Session JWT verify & role guards
│   │   │   ├── role.js              # Role-based middleware checkers
│   │   │   ├── upload.js            # Multer/Cloudinary media pipeline
│   │   │   └── optionalAuth.js      # Token parsing for optional auth routes
│   │   ├── controllers/             # Backend controller logic
│   │   │   ├── authController.js
│   │   │   ├── bookingsController.js
│   │   │   ├── jobCartController.js
│   │   │   ├── userPackagesController.js
│   │   │   ├── packagesController.js
│   │   │   ├── loyaltyController.js
│   │   │   ├── invoicesController.js
│   │   │   ├── paymentsController.js
│   │   │   └── [all other controllers]
│   │   ├── routes/                  # Express route routers
│   │   │   └── [all route files]
│   │   └── services/
│   │       ├── cronService.js       # Background cron jobs manager
│   │       ├── invoiceService.js    # Puppeteer PDF generator templates
│   │       ├── messagingService.js  # SMS/WhatsApp dispatch gateway
│   │       ├── reportService.js     # Excel report formatter
│   │       └── importService.js     # Excel customer importer
│   └── migrations/                  # MySQL schema migrations (001 to 057)
│
├── client/                          # React/TypeScript frontend
│   ├── package.json                 # Frontend dependencies
│   ├── vite.config.ts               # Vite configuration
│   ├── tailwind.config.ts           # CUSTOM COLOR TOKENS (FROZEN - DO NOT TOUCH)
│   ├── src/
│   │   ├── App.tsx                  # App routing catalog & layout wraps
│   │   ├── main.tsx                 # React entry point
│   │   ├── index.css                # Base CSS classes (FROZEN - DO NOT TOUCH)
│   │   ├── types/
│   │   │   └── index.ts             # TypeScript definitions
│   │   ├── api/
│   │   │   ├── axiosInstance.ts     # Axios configurations & interceptors
│   │   │   └── hooks/               # React Query queries & mutations
│   │   ├── store/
│   │   │   ├── authStore.ts         # Authentication session store
│   │   │   ├── toastStore.ts        # Notifications toast store
│   │   │   └── uiStore.ts           # UI drawer & modals state store
│   │   ├── components/
│   │   │   ├── layout/              # Sidebar & layout definitions
│   │   │   ├── shared/              # Reusable pages indicators
│   │   │   └── ui/                  # Design system buttons, inputs
│   │   ├── pages/
│   │   │   ├── admin/               # Admin panel screens
│   │   │   ├── customer/            # Customer portal screens
│   │   │   ├── staff/               # Staff portal screens
│   │   │   └── auth/                # Login, Register, Forgot Password
│   │   └── utils/
│   │       ├── constants.ts         # Color variables and status badges
│   │       ├── formatters.ts        # Currency (INR) and date formatters
│   │       ├── validators.ts        # Zod & Regex formats
│   │       └── useInactivityTimer.ts # Inactivity logs and silent refresh
│
└── PROJECT_DOCUMENTATION.md        # Overview document
```

---

## SECTION 13 — FRONTEND COMPONENT REFERENCE (FROZEN UI — DO NOT MODIFY)

### Layout Wrappers (`components/layout/`)
*   `AdminLayout.tsx`: Structure of admin portal dashboard (sidebar + topbar).
*   `AdminSidebar.tsx`: Navigation menu links for admin panel.
*   `AdminTopBar.tsx`: Top header displaying name, settings link, and logout button.
*   `CustomerLayout.tsx`: Layout container for customer pages.
*   `CustomerNavbar.tsx`: Customer portal navbar.
*   `MobileNavbar.tsx`: Responsive navigation panel for mobile devices.
*   `StaffLayout.tsx`: Container layout for staff interfaces.
*   `StaffSidebar.tsx`: Navigation sidebar for staff interface options.

### Shared Indicators (`components/shared/`)
*   `AddCarModal.tsx`: Popup form to add/edit customer vehicle registration.
*   `ConfirmDialog.tsx`: Generic yes/no validation dialog.
*   `EmptyState.tsx`: Fallback view when catalog lists are empty.
*   `ErrorState.tsx`: Fallback view when API queries fail.
*   `LiveSearch.tsx`: Real-time auto-complete search bar.
*   `Logo.tsx`: O3 Car Spa branding component.
*   `PackageRenewModal.tsx`: Modal trigger to configure package renewal parameters.
*   `PageHeader.tsx`: Title banner used across standard pages.
*   `PremiumPageHeader.tsx`: Premium service styling page header.
*   `PremiumStatCard.tsx`: Visual statistic cards for premium modules.
*   `StatCard.tsx`: Visual statistic cards for regular modules.
*   `StatusBadge.tsx`: Displays colored pills matching status constants.
*   `Toast.tsx`: Container for toast alerts.

### UI primitives (`components/ui/`)
*   `Animations.tsx`: Framer Motion wrappers for smooth component mountings.
*   `Button.tsx`: Customizable button component (supports primary, secondary, danger variants).
*   `ConfirmModal.tsx`: Basic confirmation modal wrapper.
*   `DataTable.tsx`: Generic data table component (supports pagination, filtering, search).
*   `DatePicker.tsx`: React Datepicker wrapper.
*   `FileUpload.tsx`: File upload interface.
*   `Input.tsx`: Form input component.
*   `Modal.tsx`: Modal window container.
*   `Pagination.tsx`: Pagination controls.
*   `SearchInput.tsx`: Search field.
*   `Select.tsx`: Dropdown select menu.
*   `SkeletonLoader.tsx`: Visual loading placeholders.
*   `Tabs.tsx`: Tab navigation switcher.
*   `Textarea.tsx`: Multiline text input component.

---

## SECTION 14 — KEY TYPESCRIPT TYPES

Exported from [client/src/types/index.ts](file:///c:/Users/Aryan/OneDrive/Desktop/Software%20(1)/Software/client/src/types/index.ts):

```typescript
export type UserRole = 'admin' | 'customer' | 'staff';

export interface User {
  id: number;
  name: string;
  mobile: string;
  email?: string;
  role: UserRole;
  is_active: boolean;
  created_at?: string;
}

export interface Vehicle {
  id: number;
  registration_no: string;
  customer_id: number;
  brand: string;
  model: string;
  is_primary?: number;
  customer?: User;
}

export interface PackageUsageItem {
  service_name: string;
  total_count: number;
  used_count: number;
  remaining: number;
}

export type PackageStatus = 'active' | 'expired' | 'cancelled' | 'renewed';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface UserPackage {
  id: number;
  package_id: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  package_name: string;
  package_description?: string;
  description?: string;
  usage: PackageUsageItem[];
  package_status: PackageStatus;
  payment_status: PaymentStatus;
  price_paid?: number;
  vehicle_segment?: string;
  vehicle_id?: number;
  renewed_from_id?: number;
  renewed_at?: string;
  days_remaining?: number | null;
  wash_count?: number;
  wax_count?: number;
}

export type JobCartStatus = 'draft' | 'open' | 'complete';

export interface JobProduct {
  id?: number;
  job_service_id?: number;
  product_id: number;
  product_name?: string;
  quantity: number;
  unit_cost: number;
}

export interface JobService {
  id?: number;
  job_cart_id?: number;
  service_name: string;
  service_price: number;
  labor_charges: number;
  products: JobProduct[];
  subtotal?: number;
}

export interface JobPhoto {
  id: number;
  job_cart_id: number;
  type: 'before' | 'after';
  url: string;
  public_id?: string;
}

export interface JobCart {
  id: number;
  vehicle: Vehicle;
  visit_date: string;
  visit_number: number;
  status: JobCartStatus;
  notes?: string;
  services: JobService[];
  photos: JobPhoto[];
  created_by?: number;
  created_at: string;
  completed_at?: string;
  invoice_number?: string;
  total_amount?: number;
}

export type BookingStatus = 'pending_approval' | 'confirmed' | 'cancelled' | 'completed' | 'expired' | 'rejected';

export interface Booking {
  id: number;
  customer_id: number;
  customer?: User;
  slot: Slot;
  service?: Service;
  package?: Package;
  vehicle_id?: number;
  vehicle_brand?: string;
  vehicle_model?: string;
  vehicle_reg_no?: string;
  total_duration?: number;
  status: BookingStatus;
  is_free_wash: boolean;
  notes?: string;
  booking_notes?: string;
  expires_at?: string;
  approved_by?: number;
  approved_by_name?: string;
  approved_at?: string;
  linked_services?: { service_id: number; name: string; duration_minutes: number }[];
  created_at: string;
}
```

---

## SECTION 15 — UTILITY FUNCTIONS REFERENCE

### Currency and Date Formatters (`client/src/utils/formatters.ts`)
*   `formatINR(amount)`: Formats numeric amount to Indian Rupee (INR) currency format (no fraction digits).
    *   *Input*: `amount: number | string | null | undefined`
    *   *Output*: `₹ X,XX,XXX`
*   `formatDate(date)`: Formats datetime strings to display dates.
    *   *Input*: `date: string | null | undefined`
    *   *Output*: `DD MMM YYYY` (e.g. `15 Jun 2026`)
*   `formatTime(time)`: Formats 24-hour time to AM/PM format.
    *   *Input*: `time: string` (e.g. `14:30:00`)
    *   *Output*: `2:30 PM`
*   `maskMobile(mobile)`: Masks customer contact details in list tables.
    *   *Input*: `mobile: string` (e.g. `9876543210`)
    *   *Output*: `987654****`
*   `formatRegNo(regNo)`: Normalizes vehicle registration strings.
    *   *Input*: `regNo: string` (e.g. `GJ 01 AB 1234`)
    *   *Output*: `GJ01AB1234`
*   `timeAgo(date)`: Formats datetime strings to relative time ago.
    *   *Input*: `date: string`
    *   *Output*: `5m ago`, `2h ago`, `3d ago`

### Input Validators (`client/src/utils/validators.ts`)
*   `isValidMobile(mobile)`: Checks for 10-digit Indian mobile format.
*   `isValidRegNo(regNo)`: Validates Indian vehicle registration plate format.
*   `isValidEmail(email)`: Standard email string validation.

---

## SECTION 16 — DEPLOYMENT & INFRASTRUCTURE NOTES

*   **Production Host**: VPS running Linux with Nginx web server.
*   **SSL Certificate**: Certbot Let's Encrypt serving `http://localhost:5000`.
*   **Database Setup**: Local MySQL instance running on localhost port 3306.
*   **Server Process Management**: Run via PM2 in production.
*   **Nginx Configuration**:
    *   Frontend static assets are served from the compiled `client/dist` directory.
    *   API requests (`/api/*`) are proxied to the backend port `5000`.
    *   WebSocket requests (`/socket.io/*`) are proxied to backend port `5000` with connection upgrade headers enabled.

---

## SECTION 17 — KNOWN PATTERNS & CONVENTIONS

### Backend Conventions
*   **Uniform Response Shape**: All API controllers must return responses matching this structure:
    *   Success: `{ success: true, data: [...] }` or `{ success: true, message: 'Done' }`
    *   Error: `{ success: false, error: 'Reason description' }`
*   **Database Resilience**: All queries must use parameterized queries (`pool.query('... WHERE id = ?', [id])`) to prevent SQL injection.
*   **Transaction Integrity**: Database modifications involving multiple updates (such as booking confirmations or job cart completions) must run within SQL transactions (`conn.beginTransaction()`).

### Frontend Conventions
*   **Data Hydration**: All queries and mutations must use hooks from `client/src/api/hooks/` powered by TanStack React Query. Inline Axios fetches are prohibited.
*   **Zustand Auth Store**: User role checks and token validations must access the `useAuthStore` slice.
*   **Frozen Layout**: The styling, spacing, typography, animations, and color scheme are locked. Code modifications must only affect business logic.

---

## SECTION 18 — WHAT TO NEVER CHANGE (PROTECTED AREAS)

⛔ **UI & Styles**:
*   `client/tailwind.config.ts`: Custom design tokens, fonts, and brand colors (`#D32F2F`, `#111111`) are frozen.
*   `client/src/index.css`: Global base styles and animations are frozen.
*   Page components must not have their visual layout altered.

⛔ **Database Schema Integrity**:
*   Existing migration files in `server/migrations/` must never be altered or renamed.
*   Existing tables and columns must not be renamed. New columns must have default values to prevent breaking existing queries.

⛔ **API Route Contracts**:
*   Existing endpoints must maintain their response structure to avoid breaking the frontend.

---

## SECTION 19 — HOW TO ADD NEW FEATURES (DEVELOPER CHECKLIST)

For future backend or schema additions, follow these steps:
1.  **Schema Migration**: Add a new SQL migration file in `server/migrations/` using the next sequential prefix (e.g. `058_add_feature.sql`).
2.  **Run Migration**: Run the migration script locally using `node server/scripts/migrate.js`.
3.  **Backend Controller**: Add the operational methods inside `server/src/controllers/`. Ensure SQL actions run inside database transactions where necessary.
4.  **Backend Route**: Map the routes in `server/src/routes/` and import the new route file inside `server/src/app.js`.
5.  **TypeScript Types**: Add matching interfaces inside `client/src/types/index.ts`.
6.  **React Query Hooks**: Add query/mutation hooks in `client/src/api/hooks/`.
7.  **Frontend Call**: Implement the hooks in the corresponding page components. **Remember: do not modify existing UI layouts.**

---

## SECTION 20 — OPEN ITEMS & PARTIAL INTEGRATIONS

*   **Payment Gateway (Razorpay)**: Razorpay keys are configured in the environment, but the full checkout verification loop and webhooks are stubbed.
*   **WhatsApp Messaging**: WhatsApp templates are defined in MySQL, but the messaging service currently falls back to SMS.
*   **Extended Phase 2 Modules**: Tables for wallets (`v2_wallets`), feedback (`v2_feedback`), and audit logs (`v2_audit_logs`) are created in the database, and API hooks exist in the frontend code. However, the corresponding backend routers and controller files are not yet mounted in `app.js`.
