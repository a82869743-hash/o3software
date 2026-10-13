// ═══════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════
export type UserRole = 'admin' | 'customer' | 'staff' | 'super_admin' | 'manager' | 'franchise';

export interface User {
  id: number;
  name: string;
  mobile: string;
  email?: string;
  role: UserRole;
  is_active: boolean;
  created_at?: string;
  opt_out_promotional?: number;
  custom_role_id?: number | null;
  base_salary?: number;
  permissions?: string[];
  profile_picture?: string | null;
  franchise_id?: number;
  must_change_password?: boolean;
  is_impersonating?: boolean;
  impersonator_id?: number;
  impersonator_name?: string;
  franchise_name?: string;
}

// ═══════════════════════════════════════════
// VEHICLES & JOB CARTS
// ═══════════════════════════════════════════
export interface Vehicle {
  id: number;
  registration_no: string;
  customer_id: number;
  brand: string;
  model: string;
  variant?: string;
  car_variant?: string;
  is_primary?: number;
  customer?: User;
  car_year?: number;
  manufacture_year?: number;
  registration_year?: number | string;
}

// ═══════════════════════════════════════════
// USER PACKAGE SUBSCRIPTIONS
// ═══════════════════════════════════════════
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
  custom_notes?: string;
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
  advance_amount?: number;
  advance_paid?: number;
  balance_due?: number;
  booking_id?: number;
  customer?: { id: number; name: string; mobile?: string; email?: string; };
  gst_type?: 'with_gst' | 'none';
  gst_pct?: number;
  discount_type?: 'fixed' | 'percentage';
  discount_value?: number;
  pickup_type?: string;
  pickup_charge?: number;
  invoice_notes?: string;
  pre_inspector_name?: string;
  referral_person?: string;
  handler_id?: number;
  technician_id?: number;
  team_incentive_users?: any[];
  incentive_amount?: number;
  incentive_splits?: any[];
  edit_logs?: any[];
}

export interface JobCartCreatePayload {
  registration_no: string;
  customer_id?: number;
  customer_name?: string;
  customer_mobile?: string;
  customer_email?: string;
  car_brand: string;
  car_model: string;
  visit_date: string;
  notes?: string;
}

export interface VehicleLookup {
  found: boolean;
  vehicle?: Vehicle;
  customer?: User;
  visit_count?: number;
  next_visit_number?: number;
}

// ═══════════════════════════════════════════
// INVENTORY
// ═══════════════════════════════════════════
export interface InventoryItem {
  id: number;
  product_name: string;
  unit: string;
  quantity: number;
  low_stock_threshold: number;
  is_low_stock: boolean;
  is_deleted: number;
  cost_price?: number;
  franchise_price?: number;
  selling_price?: number;
  staff_price?: number;
  price_visible_to_staff?: number;
  category?: string;
  sub_category?: string;
  brand?: string;
  sku?: string;
  barcode?: string;
  vehicle_compatibility?: string;
  variant?: string;
  warehouse_location?: string;
  description?: string;
  images_json?: string | string[];
  status?: string;
}

// ═══════════════════════════════════════════
// SERVICES & PACKAGES
// ═══════════════════════════════════════════
export type VehicleCategory = 'hatchback' | 'medium_hatchback' | 'sedan' | 'premium_sedan' | 'suv';

export interface Service {
  id: number;
  name: string;
  description?: string;
  price_hatchback: number;
  price_medium_hatchback: number;
  price_sedan: number;
  price_premium_sedan: number;
  price_suv: number;
  duration_minutes: number;
  category_id?: number;
  category_name?: string;
  is_active: boolean;
}

export interface PackageProduct {
  product_id: number;
  product_name?: string;
  quantity: number;
}

export interface Package {
  id: number;
  name: string;
  description?: string;
  price_hatchback: number;
  price_medium_hatchback: number;
  price_sedan: number;
  price_premium_sedan: number;
  price_suv: number;
  wash_count: number;
  wax_count: number;
  is_published: boolean;
  services?: Service[];
  products?: PackageProduct[];
}

// ═══════════════════════════════════════════
// SLOTS & BOOKINGS
// ═══════════════════════════════════════════
export interface Slot {
  id: number;
  slot_date: string;
  start_time: string;
  end_time: string;
  max_capacity: number;
  booked_count: number;
  is_blocked: boolean;
  is_available: boolean;
  bookings?: Booking[];
}

export type BookingStatus = 'pending_payment' | 'pending_approval' | 'confirmed' | 'cancelled' | 'completed' | 'expired' | 'rejected';

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
  advance_amount?: number;
  total_amount?: number;
  advance_payment_id?: number;
  created_at: string;
}

// ═══════════════════════════════════════════
// LOYALTY
// ═══════════════════════════════════════════
export interface Loyalty {
  customer_id: number;
  credits: number;
  free_washes: number;
  wax_count: number;
  updated_at?: string;
}

// ═══════════════════════════════════════════
// STAFF
// ═══════════════════════════════════════════
export type AttendanceStatus = 'present' | 'absent' | 'half_day';

export interface StaffProfile {
  specialisations?: string;
}

export interface AttendanceRecord {
  id: number;
  staff_id: number;
  att_date: string;
  status: AttendanceStatus;
  note?: string;
}

export interface StaffPayment {
  id: number;
  staff_id: number;
  amount: number;
  purpose: string;
  status: PaymentStatus;
  payment_date: string;
  created_at: string;
  paid_at?: string;
}

export interface StaffMember extends User {
  profile?: StaffProfile;
  attendance?: AttendanceRecord[];
  payments?: StaffPayment[];
}

// ═══════════════════════════════════════════
// ACCOUNTS
// ═══════════════════════════════════════════
export type TransactionType = 'job_revenue' | 'purchase' | 'sale_b2b' | 'sale_b2c' | 'staff_payment' | 'loyalty_award';
export type TransactionDirection = 'in' | 'out';

export interface Transaction {
  id: number;
  type: TransactionType;
  reference_id?: number;
  amount: number;
  direction: TransactionDirection;
  note?: string;
  transaction_date: string;
  created_at: string;
}

export type BuySellType = 'buy' | 'sell_b2b' | 'sell_b2c';
export type BuySellStatus = 'pending' | 'complete';

export interface BuySell {
  id: number;
  type: BuySellType;
  party_name: string;
  party_mobile?: string;
  product_id?: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  note?: string;
  status: BuySellStatus;
  transaction_date: string;
}

export interface AccountSummary {
  today_revenue: number;
  month_revenue: number;
  total_purchases_month: number;
  total_b2b_sales_month: number;
  total_b2c_sales_month: number;
  pending_staff_payments: number;
  open_job_carts: number;
  low_stock_items: number;
}

// ═══════════════════════════════════════════
// INQUIRIES
// ═══════════════════════════════════════════
export type InquirySource = 'staff' | 'website';
export type InquiryStatus = 'new' | 'followed_up' | 'converted';

export interface Inquiry {
  id: number;
  source: InquirySource;
  name: string;
  mobile: string;
  email?: string;
  vehicle_brand?: string;
  vehicle_model?: string;
  services_interested?: string;
  status: InquiryStatus;
  submitted_by?: number;
  created_at: string;
}

// ═══════════════════════════════════════════
// DELIVERIES
// ═══════════════════════════════════════════
export type DeliveryStatus = 'in_transit' | 'delivered';

export interface Delivery {
  id: number;
  job_cart_id: number;
  staff_id: number;
  staff?: User;
  customer_id: number;
  customer?: User;
  status: DeliveryStatus;
  started_at: string;
  delivered_at?: string;
  job_cart?: JobCart;
}

export interface GpsCoordinates {
  lat: number;
  lng: number;
  timestamp?: number;
}

// ═══════════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════════
export type MessageType = 'job_complete' | 'credits_awarded' | 'wash_awarded' | 'booking_confirm' | 'delivery_started' | 'monthly_reminder' | 'bulk_free_wash' | 'bulk_credits' | 'bulk_reengagement';
export type MessageChannel = 'whatsapp' | 'sms';
export type MessageStatus = 'sent' | 'failed' | 'queued';

export interface MessageLog {
  id: number;
  customer_id?: number;
  customer?: User;
  mobile: string;
  type: MessageType;
  channel: MessageChannel;
  status: MessageStatus;
  message_preview?: string;
  sent_at: string;
}

// ═══════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════
export interface Settings {
  studio_name: string;
  studio_address: string;
  studio_mobile: string;
  studio_email: string;
  studio_gst: string;
  invoice_prefix: string;
  invoice_counter: string;
  booking_advance_days: string;
  admin_whatsapp: string;
  low_stock_threshold: string;
}

// ═══════════════════════════════════════════
// API RESPONSES
// ═══════════════════════════════════════════
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

// ═══════════════════════════════════════════
// UI
// ═══════════════════════════════════════════
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

// ═══════════════════════════════════════════
// MANUAL BILLING
// ═══════════════════════════════════════════
export interface ManualBill {
  id: number;
  customer_id?: number;
  customer_name?: string;
  customer_mobile?: string;
  amount: number;
  description?: string;
  services_json?: string;
  payment_method: 'cash' | 'upi' | 'card' | 'bank_transfer' | 'other';
  created_by: number;
  created_by_name?: string;
  created_at: string;
}

// ═══════════════════════════════════════════
// VENDORS
// ═══════════════════════════════════════════
export interface Vendor {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  service_type?: string;
  address?: string;
  is_active: boolean;
  created_at: string;
}

// ═══════════════════════════════════════════
// SERVICE CATEGORIES
// ═══════════════════════════════════════════
export interface ServiceCategory {
  id: number;
  name: string;
  description?: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

// ═══════════════════════════════════════════
// PHASE 2: LOYALTY TRANSACTIONS
// ═══════════════════════════════════════════
export type LoyaltyTransactionType = 'earn' | 'redeem' | 'bonus' | 'adjustment' | 'expire';

export interface LoyaltyTransaction {
  id: number;
  customer_id: number;
  type: LoyaltyTransactionType;
  points: number;
  balance_after: number;
  reference_type?: string;
  reference_id?: number;
  description?: string;
  created_by?: number;
  created_by_name?: string;
  created_at: string;
}

export interface LoyaltyData {
  customer_id: number;
  credits: number;
  free_washes: number;
  wax_count: number;
  points: number;
  loyalty_settings?: LoyaltySettings;
}

export interface LoyaltySettings {
  points_ratio: number;
  min_redeem: number;
  point_value: number;
  enabled: boolean;
}

// ═══════════════════════════════════════════
// PHASE 2: QUICK WASH
// ═══════════════════════════════════════════
export type WashStatus = 'pending' | 'washing' | 'completed' | 'delivered';

export interface QuickWashBooking {
  id: number;
  customer_id: number;
  vehicle_id?: number;
  slot_id: number;
  service_id?: number;
  vehicle_brand?: string;
  vehicle_model?: string;
  vehicle_reg_no?: string;
  vehicle_category?: string;
  job_type: 'quick_wash';
  status: string;
  wash_status: WashStatus;
  current_phase?: string;
  phase_updated_at?: string;
  queue_position: number;
  notes?: string;
  started_at?: string;
  completed_at?: string;
  delivered_at?: string;
  created_at: string;
  customer_name?: string;
  customer_mobile?: string;
  service_name?: string;
}

export interface QuickWashStats {
  pending_count: number;
  washing_count: number;
  completed_count: number;
  delivered_count: number;
  total_today: number;
}

// ═══════════════════════════════════════════
// PHASE 2: SEARCH
// ═══════════════════════════════════════════
export interface SearchCustomer {
  id: number;
  name: string;
  mobile: string;
  email?: string;
  vehicle_count?: number;
  job_count?: number;
}

export interface SearchVehicle {
  id: number;
  registration_no: string;
  brand: string;
  model: string;
  customer_id: number;
  customer_name?: string;
  customer_mobile?: string;
}

export interface GlobalSearchResult {
  customers: SearchCustomer[];
  vehicles: SearchVehicle[];
  inventory: Array<{ id: number; product_name: string; quantity: number }>;
  vendors: Array<{ id: number; name: string; phone?: string }>;
}

// ═══════════════════════════════════════════
// PHASE 2: PREMIUM SERVICES
// ═══════════════════════════════════════════
export interface ServiceAddon {
  id: number;
  service_id: number;
  addon_name: string;
  addon_price: number;
  duration_minutes: number;
  is_active: boolean;
}

export interface PremiumService {
  id: number;
  name: string;
  description?: string;
  price_hatchback: number;
  price_medium_hatchback: number;
  price_sedan: number;
  price_premium_sedan: number;
  price_suv: number;
  price_luxury: number;
  duration_minutes: number;
  is_premium: boolean;
  is_active: boolean;
  image_url?: string;
  sort_order: number;
  addons?: ServiceAddon[];
}

// ─── Phase 2 Extended Types ──────────────────────────────

export interface Payment {
  id: number;
  customer_id: number;
  job_cart_id?: number;
  booking_id?: number;
  amount: number;
  payment_type: 'full' | 'advance' | 'balance' | 'refund';
  payment_method: 'cash' | 'upi' | 'card' | 'net_banking' | 'cheque';
  payment_status: 'pending' | 'completed' | 'failed' | 'refunded';
  transaction_ref?: string;
  notes?: string;
  paid_at?: string;
  created_by?: number;
  customer_name?: string;
  customer_mobile?: string;
  created_at: string;
}

export interface AdvancePayment {
  id: number;
  customer_id: number;
  booking_id?: number;
  job_cart_id?: number;
  advance_amount: number;
  total_amount: number;
  balance_due: number;
  payment_method: string;
  status: 'advance_paid' | 'fully_paid' | 'cancelled';
  due_date?: string;
  notes?: string;
  created_at: string;
}

export interface Refund {
  id: number;
  payment_id: number;
  customer_id: number;
  amount: number;
  reason?: string;
  status: 'pending' | 'approved' | 'processed' | 'rejected';
  created_at: string;
}

export interface Feedback {
  id: number;
  customer_id: number;
  job_cart_id?: number;
  booking_id?: number;
  rating: number;
  review_text?: string;
  service_quality?: number;
  timeliness?: number;
  value_for_money?: number;
  admin_reply?: string;
  replied_at?: string;
  is_public: boolean;
  customer_name?: string;
  created_at: string;
}

export interface ReferralCode {
  id: number;
  customer_id: number;
  code: string;
  reward_points: number;
  max_uses: number;
  current_uses: number;
  is_active: boolean;
}

export interface Wallet {
  id: number;
  customer_id: number;
  balance: number;
  total_earned: number;
  total_spent: number;
}

export interface AuditLog {
  id: number;
  user_id: number;
  action: string;
  entity_type: string;
  entity_id?: number;
  details?: string;
  ip_address?: string;
  user_name?: string;
  user_role?: string;
  created_at: string;
}

export interface StaffTask {
  id: number;
  assigned_to: number;
  assigned_by: number;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string;
  completed_at?: string;
  staff_name?: string;
  created_at: string;
}

export interface StaffLeave {
  id: number;
  staff_id: number;
  leave_type: 'casual' | 'sick' | 'earned' | 'unpaid';
  from_date: string;
  to_date: string;
  days: number;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  approved_by?: number;
  staff_name?: string;
  created_at: string;
}

export interface StaffPerformance {
  id: number;
  staff_id: number;
  period: string;
  jobs_completed: number;
  avg_rating: number;
  attendance_pct: number;
  bonus_amount: number;
  notes?: string;
  staff_name?: string;
}

export interface Expense {
  id: number;
  category_id: number;
  category_name?: string;
  amount: number;
  description?: string;
  expense_date: string;
  payment_method: string;
  gst_amount: number;
  gst_number?: string;
  created_by: number;
  created_by_name?: string;
  created_at: string;
}

export interface ExpenseCategory {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
}

export interface BalanceSheet {
  period: { from: string; to: string };
  income: {
    job_revenue: number;
    bill_revenue: number;
    package_revenue: number;
    payments_collected: number;
    total: number;
  };
  expenses: {
    operational: number;
    staff_payments: number;
    purchases: number;
    gst_paid: number;
    total: number;
    by_category: Array<{ category: string; total: number }>;
  };
  refunds: number;
  net_profit: number;
  profit_margin: number;
}

export interface PaymentStats {
  today_collected: number;
  month_collected: number;
  pending_amount: number;
  today_count: number;
  refund_count: number;
  total_balance_due: number;
  pending_count: number;
}

