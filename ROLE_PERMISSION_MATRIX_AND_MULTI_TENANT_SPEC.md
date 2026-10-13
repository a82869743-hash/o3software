# O3 Car Spaa — Phase 2: Role & Permission Matrix and Multi-Tenant Foundation

## 1. Role Hierarchy & Authority Levels

The platform enforces a 5-tier role hierarchy with integer security weights (`ROLE_LEVELS`):

```
Super Admin (50)
      │
      ▼
Franchise Admin / Branch Admin (40)
      │
      ▼
Branch Manager (30)
      │
      ▼
Staff / Technician (20)
      │
      ▼
Customer (10)
```

| Role | Weight | Scope | Key Capabilities | Prohibited Operations |
| :--- | :--- | :--- | :--- | :--- |
| **Super Admin** | 50 | Cross-Network (Global) | • Manage franchise entities (create, edit, disable)<br>• Consolidated multi-branch analytics & revenue<br>• Per-franchise configurations & branding<br>• Full system override & package authority | Cannot disable HQ (Main Studio, Franchise 1) |
| **Franchise Admin** | 40 | Assigned Franchise (`franchise_id`) | • Full branch operations & billing<br>• Package creation, customization & approval<br>• Branch staff & inventory management<br>• Branch financial balance sheets & reports | • Access data of any other franchise (403)<br>• Manage other franchise profiles (403)<br>• Disable franchise entities (403) |
| **Branch Manager** | 30 | Assigned Franchise (`franchise_id`) | • Daily booking schedule & slot approvals<br>• Job card creation, tracking & status updates<br>• Stock usage tracking & stock requests<br>• POS manual billing | • Package creation / editing / approvals (403)<br>• Franchise entity settings (403)<br>• System RBAC or salary structure changes (403) |
| **Staff / Technician** | 20 | Assigned Franchise (`franchise_id`) | • View today's assigned job cards<br>• Advance job card pipeline stages<br>• Upload inspection photos & customer belongings<br>• Clock attendance & view personal tasks | • Access financial metrics, profits, or wholesale prices<br>• Package creation or approvals (403)<br>• Access customer CRM records outside active jobs (403) |
| **Customer** | 10 | Self-owned records only (`customer_id = req.user.id`) | • Book slots & request pick-up<br>• View personal vehicles & booking history<br>• Track live vehicle service progress<br>• Submit package purchase requests<br>• View loyalty points & rewards | • Access any admin/technician endpoint (403)<br>• View any other customer's job card, bill, or booking (403) |

---

## 2. Multi-Tenant Isolation Architecture

### 2.1 Database Tenancy
Every operational tenant table in `o3_car_spa` carries an indexed `franchise_id` column:
- `job_carts`
- `manual_bills`
- `bookings`
- `slots`
- `inventory`
- `packages`
- `users`
- `settings`
- `deliveries`
- `expenses`
- `feedback`
- `inquiries`
- `package_requests`
- `product_orders`
- `quotations`
- `services`
- `staff_attendance`
- `staff_payments`
- `transactions`
- `user_packages`
- `vendors`
- `franchise_inventory_pricing`
- `franchise_stock_requests`

### 2.2 Data Migration 096 (Zero Data Loss)
- Created `franchises` table with comprehensive branding, UPI, GSTIN, and slot duration configuration.
- Ensured Default Franchise #1 (`MAIN`: Main Studio) and Franchise #2 (`VJN`: Vijay Nagar Studio).
- Non-destructive backfill: assigned all historical pre-existing records to `franchise_id = 1` with zero data loss.

### 2.3 Middleware Enforcement
1. **`auth` (`server/src/middleware/auth.js`)**:
   - Decodes JWT and inspects `franchise_id` and `role`.
   - Distinguishes Super Admins (`role === 'super_admin'` or `role === 'admin'` with `franchise_id === 1`).
   - If user is NOT a Super Admin, `req.franchiseId` is **strictly locked** to `req.user.franchise_id`. Any client attempt to send a spoofed `x-franchise-id` or `?franchise_id` header is automatically ignored.
   - Provides safe SQL parameter generator `req.getFranchiseCondition(columnAlias)`.
2. **`superAdmin` (`server/src/middleware/superAdmin.js`)**:
   - Restricts cross-network endpoints (franchise creation, disablement, cross-branch consolidated overview) strictly to Super Admins.
3. **`role` (`server/src/middleware/role.js`)**:
   - Enforces hierarchical security levels. Lower tiers (Manager, Staff, Customer) attempting package creation/modification are rejected with **HTTP 403 Forbidden**.

### 2.4 IDOR Protection (Anti-ID Guessing)
All controllers ([jobCartController.js](file:///c:/Users/Divya/Desktop/handoff-export/server/src/controllers/jobCartController.js), [bookingsController.js](file:///c:/Users/Divya/Desktop/handoff-export/server/src/controllers/bookingsController.js), [billingController.js](file:///c:/Users/Divya/Desktop/handoff-export/server/src/controllers/billingController.js), [customersController.js](file:///c:/Users/Divya/Desktop/handoff-export/server/src/controllers/customersController.js), [inventoryController.js](file:///c:/Users/Divya/Desktop/handoff-export/server/src/controllers/inventoryController.js)) inspect the requested record's `franchise_id`:
```javascript
if (!req.isSuperAdmin && record.franchise_id && req.franchiseId && parseInt(record.franchise_id, 10) !== parseInt(req.franchiseId, 10)) {
  return res.status(403).json({ success: false, error: 'Access denied: Cannot access resource from another franchise' });
}
```
If Franchise 2 Admin attempts to access, edit, or delete a Franchise 1 record directly by ID, the API returns **HTTP 403 Forbidden**.

---

## 3. Package Management & Approval Guards

All package management routes in `server/src/routes/packages.js` are protected by `auth, role(['admin'])`:
- `POST /api/packages` (Create package)
- `PUT /api/packages/:id` (Update package)
- `PATCH /api/packages/:id/toggle` (Toggle publish)
- `PATCH /api/packages/:id/visibility` (Toggle customer visibility)
- `DELETE /api/packages/:id` (Delete package)
- `PUT /api/packages/requests/:id/approve` (Approve package purchase request)
- `PUT /api/packages/requests/:id/reject` (Reject package purchase request)
- `POST /api/packages/assign` (Assign package to customer)
- `POST /api/packages/custom-assign` (Custom package builder assignment)

Lower roles (`manager`, `staff`, `customer`) calling any of these endpoints receive **HTTP 403 Forbidden**.

---

## 4. Super Admin UI Features

Accessible at `/admin/franchises` (guarded by `<SuperAdminRoute>`):
1. **Franchise Locations**:
   - Card grid with branch code badges, active/disabled pills, contact information, hours, slot duration, and live counts for Job Cards, Bookings, and Staff.
   - Quick "Enter Workspace" switcher.
   - "Add Franchise" modal with validation and branch code uppercase formatting.
   - "Edit Franchise" modal.
   - Instant "Enable / Disable" toggle (with Main Studio HQ protection).
2. **Consolidated Overview**:
   - Network KPI cards: Combined Revenue, Total Job Cards, Active Bookings, Active Studios.
   - Comparative multi-studio breakdown table with per-branch revenue, job completion ratios, booking counts, registered customer counts, active staff, and stock valuation.
3. **Per-Franchise Settings & Customization**:
   - Studio selector dropdown.
   - Operational hours: opening time, closing time, slot duration (30/45/60/90/120 min).
   - Branding & Billing: phone, email, GSTIN, UPI ID (VPA) for branch QR payments.
