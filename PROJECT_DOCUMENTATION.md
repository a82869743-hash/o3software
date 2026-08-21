# GK AutoHerb - Comprehensive Project Documentation

## 1. Project Overview
**GK AutoHerb** is an end-to-end, full-featured vehicle service and package management platform. It facilitates customers in browsing, purchasing, and booking vehicle maintenance services and packages. For administrators, it provides a highly robust and extensive backend dashboard to manage every aspect of the workshop operations, from customer tracking and package approvals to job carts, staff management, and invoicing.

---

## 2. Technology Stack (0-100)

### Frontend
*   **Core Library**: React (v18.3.1)
*   **Language**: TypeScript
*   **Build Tool**: Vite
*   **Styling**: Tailwind CSS, PostCSS, Autoprefixer
*   **Routing**: React Router DOM (v6)
*   **State Management**: Zustand
*   **Data Fetching & Caching**: @tanstack/react-query
*   **HTTP Client**: Axios
*   **Forms & Validation**: React Hook Form combined with Zod for strict schema validation.
*   **Real-time Communication**: `socket.io-client` for real-time dashboard updates and tracking.
*   **Maps & Location**: `@googlemaps/js-api-loader`
*   **Data Export/Import**: `xlsx` for Excel operations.
*   **UI Components & Icons**: `lucide-react` for iconography, `react-hot-toast` for toast notifications.
*   **Date Handling**: `react-datepicker`, `date-fns`

### Backend
*   **Environment**: Node.js
*   **Framework**: Express.js
*   **Database**: MySQL (using `mysql2` driver)
*   **Security & Authentication**: 
    *   JWT (JSON Web Tokens) for stateless authentication.
    *   `bcryptjs` for secure password hashing.
    *   `helmet` for setting secure HTTP headers.
    *   `cors` for Cross-Origin Resource Sharing.
*   **Data Validation**: `express-validator`
*   **File Uploads & Cloud Storage**: `multer`, `multer-storage-cloudinary`, and `cloudinary` for handling and storing media/images.
*   **Real-time Communication**: `socket.io` for emitting events to connected clients.
*   **Background Jobs & Scheduling**: `node-cron` for automated tasks.
*   **Document & Report Generation**: 
    *   `puppeteer` for generating highly formatted PDF invoices and reports.
    *   `exceljs` and `xlsx` for Excel file generation and parsing.
*   **External Integrations**: MSG91 for SMS notifications (Approvals/Rejections/Booking Updates/OTP).

---

## 3. Architecture & Key Workflows

*   **Deferred Deduction Workflow**: Ensures package credits are strictly managed and only depleted when services are confirmed or packages are explicitly approved, mitigating credit disputes.
*   **Atomic Transactions**: Booking creation and credit deduction logic is separated to guarantee consistency in the database.
*   **Real-time Capabilities**: Web-sockets power real-time updates for tracking vehicle progress and instant notifications on the dashboard.

---

## 4. Features - Customer Dashboard
The Customer Dashboard provides an intuitive and seamless interface for users to manage their vehicle maintenance.

1.  **Dashboard Overview (`DashboardPage`)**: A summarized view of active packages, upcoming bookings, and loyalty points.
2.  **Profile Management (`ProfilePage`)**: Manage user details, contact info, and addresses.
3.  **Vehicle Management (`VehiclesPage`)**: Add, edit, and view vehicles associated with the customer's account.
4.  **Browse Services (`ServicesPage`)**: Explore the catalogue of general and premium services offered by the workshop.
5.  **Browse & Buy Packages (`BuyPackagesPage`)**:
    *   View available service packages tailored for different vehicle types.
    *   Initiate a purchase which goes into a "Pending" state until admin review.
6.  **Service Booking (`BookingPage`)**:
    *   Book vehicle services dynamically filtered by what is included in their approved active packages.
    *   Bookings register as an intent; package credits are deducted only upon admin approval.
7.  **Booking History (`BookingsPage`)**: Track past, upcoming, and rejected/cancelled bookings.
8.  **Job Carts (`JobCartsPage`)**: View detailed logs and history of job carts created for their vehicles during service.
9.  **Live Tracking (`TrackingPage`)**: Track the real-time status of their vehicle while it is in the workshop (e.g., Queued, Washing, Polishing, Ready).
10. **Loyalty Program (`LoyaltyPage`)**: Track earned loyalty points, rewards, and redemption history.

---

## 5. Features - Admin Dashboard
The Admin Dashboard is an exhaustive control hub designed to run the entire workshop ecosystem efficiently.

1.  **Analytics & Dashboard (`DashboardPage`)**: Centralized analytics displaying total revenue, bookings, active staff, inventory alerts, and pending approvals.
2.  **Manual Registration (`ManualRegistrationPage`)**: Quickly register walk-in customers and their vehicles.
3.  **Customer Management**:
    *   **Customers List (`CustomersListPage`)**: Directory of all registered users.
    *   **Customer Detail (`CustomerDetailPage`)**: 360-degree view of a single customer, showing their full history of vehicles, packages, bookings, and invoices.
4.  **Package Management**:
    *   **Packages (`PackagesPage`)**: Create, edit, and manage the catalogue of service packages.
    *   **Package Approvals (`PackageApprovalsPage`)**: 
        *   Manage customer package purchase requests.
        *   Approve to activate the package, or Reject with a mandatory `rejection_reason`.
        *   Triggers automated SMS notifications upon decision.
5.  **Service & Slot Management**:
    *   **Regular & Premium Services (`ServicesPage`, `PremiumServicesPage`)**: Manage the offerings, pricing, and details of services.
    *   **Slots Management (`SlotsPage`)**: Configure available time slots, block dates, and manage workshop capacity.
6.  **Operations & Bookings**:
    *   **Customer Bookings (`CustomerBookingsPage`)**: Review, accept, or reject incoming bookings. Credits are deducted/restored based on these actions.
    *   **Quick Wash (`QuickWashPage`)**: A streamlined interface specifically for fast-tracking simple wash jobs without full job cart overhead.
7.  **Job Carts (Core Workshop Operations)**:
    *   **Job Cart List (`JobCartListPage`)**: Overview of all active and past jobs.
    *   **Create Job Cart (`JobCartCreatePage`)**: Open a new job cart for a vehicle, noting initial conditions, fuel level, required parts, and assigned staff.
    *   **Job Cart Detail (`JobCartDetailPage`)**: Manage the lifecycle of a job, update status (updates trackable by customer), add parts/labor, and close the job.
8.  **Billing & Deliveries**:
    *   **Quick Billing (`QuickBillingPage`)**: Rapidly generate invoices for walk-ins or parts sales.
    *   **All Invoices (`AllInvoicesPage`)**: Central repository of all generated invoices with PDF download capabilities (via Puppeteer).
    *   **Deliveries (`DeliveriesPage`)**: Track and manage vehicles that are ready for customer pickup or delivery.
9.  **Inventory & Accounts**:
    *   **Inventory (`InventoryPage`)**: Manage stock levels, spare parts, and trigger low-stock alerts.
    *   **Accounts (`AccountsPage`)**: Track income, expenses, and financial health of the workshop.
10. **Staff Management**:
    *   **Staff Directory (`StaffPage`)**: Manage mechanics, cleaners, and administrative staff.
    *   **Staff Detail (`StaffDetailPage`)**: Individual staff performance and details.
    *   **Staff Salary (`StaffSalaryPage`)**: Process payroll, track attendance, and manage salary payouts.
11. **Loyalty Program Management**:
    *   **Loyalty Settings (`LoyaltySettingsPage`)**: Configure point conversion rates and rules.
    *   **Loyalty Award (`LoyaltyAwardPage`)**: Manually award or adjust loyalty points for customers.
12. **CRM & Communication**:
    *   **Inquiries (`InquiriesPage`)**: Track leads and customer questions.
    *   **Messages (`MessagesPage`)**: Internal messaging system or SMS campaign logs.
13. **Other Tools**:
    *   **Buy/Sell (`BuySellPage`)**: Platform for managing the buying and selling of used vehicles.
    *   **Archive (`ArchivePage`)**: Access deleted or highly historical records.
    *   **Import (`ImportPage`)**: Bulk import data via Excel/CSV.
    *   **Settings (`SettingsPage`)**: Global system configurations (taxes, company info, SMS gateways).
