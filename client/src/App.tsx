import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useInactivityTimer, useTokenRefresh } from './utils/useInactivityTimer';
import AdminLayout from './components/layout/AdminLayout';
import CustomerLayout from './components/layout/CustomerLayout';
import StaffLayout from './components/layout/StaffLayout';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ProtectedRoute from './router/ProtectedRoute';
import RoleRoute from './router/RoleRoute';
import SuperAdminRoute from './router/SuperAdminRoute';
import ToastContainer from './components/shared/Toast';
import ImpersonationBanner from './components/shared/ImpersonationBanner';
import ForcePasswordChangeModal from './components/shared/ForcePasswordChangeModal';
import NoAccessPage from './pages/shared/NoAccessPage';

import AllJobCardsPage from './pages/admin/AllJobCardsPage';
import JobCartCreatePage from './pages/admin/JobCartCreatePage';
import JobCartDetailPage from './pages/admin/JobCartDetailPage';

import CustomerJobCartsPage from './pages/customer/JobCartsPage';

// Inventory pages
import InventoryPage from './pages/admin/InventoryPage';
import StaffInventoryPage from './pages/staff/InventoryPage';

// Slots & Bookings pages
import SlotsPage from './pages/admin/SlotsPage';
import CustomerBookingsPage from './pages/admin/CustomerBookingsPage';
import BookingPage from './pages/customer/BookingPage';
import BookingsPage from './pages/customer/BookingsPage';

// Services, Packages & Loyalty pages
import ServicesPage from './pages/admin/ServicesPage';
import PackagesPage from './pages/admin/PackagesPage';
import LoyaltyAwardPage from './pages/admin/LoyaltyAwardPage';
import CustomerServicesPage from './pages/customer/ServicesPage';
import LoyaltyPage from './pages/customer/LoyaltyPage';
import VehiclesPage from './pages/customer/VehiclesPage';
import ProfilePage from './pages/customer/ProfilePage';
import CustomerDashboardPage from './pages/customer/DashboardPage';
import CustomerBuyPackagesPage from './pages/customer/BuyPackagesPage';
import CustomerProductsPage from './pages/customer/ProductsPage';
import AdminProductOrdersPage from './pages/admin/ProductOrdersPage';

// Staff & Accounts pages
import StaffPage from './pages/admin/StaffPage';
import StaffDetailPage from './pages/admin/StaffDetailPage';
import StaffSalaryPage from './pages/admin/StaffSalaryPage';
import AccountsPage from './pages/admin/AccountsPage';
import BuySellPage from './pages/admin/BuySellPage';
import CustomersListPage from './pages/admin/CustomersListPage';
import CustomerDetailPage from './pages/admin/CustomerDetailPage';
import ManualRegistrationPage from './pages/admin/ManualRegistrationPage';
import PackageApprovalsPage from './pages/admin/PackageApprovalsPage';
import StaffJobCartsPage from './pages/staff/StaffJobCartsPage';
import StaffBenefitsPage from './pages/staff/StaffBenefitsPage';
import CheckInOutPage from './pages/staff/CheckInOutPage';

// Messages, Inquiries & Import pages
import MessagesPage from './pages/admin/MessagesPage';
import InquiriesPage from './pages/admin/InquiriesPage';
import ImportPage from './pages/admin/ImportPage';
import StaffInquiryPage from './pages/staff/InquiryPage';

// Settings & Dashboard Pages
// Settings, Dashboard & Billing Pages
import DashboardPage from './pages/admin/DashboardPage';
import SettingsPage from './pages/admin/SettingsPage';
import QuickBillingPage from './pages/admin/QuickBillingPage';
import AllInvoicesPage from './pages/admin/AllInvoicesPage';
import ArchivePage from './pages/admin/ArchivePage';
import ReportsPage from './pages/admin/ReportsPage';
import VendorsPage from './pages/admin/VendorsPage';

// Phase 2 pages
import QuickWashPage from './pages/admin/QuickWashPage';
import LoyaltySettingsPage from './pages/admin/LoyaltySettingsPage';
import PremiumServicesPage from './pages/admin/PremiumServicesPage';
import AdminDeliveriesPage from './pages/admin/DeliveriesPage';
import PickupsPage from './pages/admin/PickupsPage';

// Phase 2 Extended pages
import PaymentsPage from './pages/admin/PaymentsPage';
import FeedbackPage from './pages/admin/FeedbackPage';
import BalanceSheetPage from './pages/admin/BalanceSheetPage';
import AuditLogPage from './pages/admin/AuditLogPage';
import StaffHRPage from './pages/admin/StaffHRPage';
import WhatsAppPage from './pages/admin/WhatsAppPage';
import CustomerRewardsPage from './pages/admin/CustomerRewardsPage';
import PackageTrackingPage from './pages/admin/PackageTrackingPage';

// Quotations pages
import QuotationsListPage from './pages/admin/QuotationsListPage';
import QuotationCreatePage from './pages/admin/QuotationCreatePage';

// New Features (Leads, Alerts, Pending Payments, Stock Approvals)
import LeadManagementPage from './pages/admin/LeadManagementPage';
import PackageAlertsPage from './pages/admin/PackageAlertsPage';
import PendingPaymentsPage from './pages/admin/PendingPaymentsPage';
import FranchiseStockApprovalsPage from './pages/admin/FranchiseStockApprovalsPage';
import FranchiseStockOrdersPage from './pages/admin/FranchiseStockOrdersPage';
import FranchiseManagementPage from './pages/admin/FranchiseManagementPage';


// Phase 5 pages
import RoleManagementPage from './pages/admin/RoleManagementPage';
import FeedbackFormPage from './pages/customer/FeedbackFormPage';

// Delivery pages
import DeliveryPage from './pages/staff/DeliveryPage';
import TrackingPage from './pages/customer/TrackingPage';
import JobTrackingPage from './pages/customer/JobTrackingPage';

// ─── Placeholder pages (replaced in later phases) ────────
const Placeholder = ({ title }: { title: string }) => (
  <div className="flex items-center justify-center py-20">
    <div className="text-center">
      <div className="w-12 h-12 rounded-full bg-[#f6f3f2] flex items-center justify-center mx-auto mb-4">
        <span className="text-xl">🚧</span>
      </div>
      <h2 className="text-xl font-bold text-[#0F172A]">{title}</h2>
      <p className="text-sm text-[#5f5e5e] mt-1">Building in next phase</p>
    </div>
  </div>
);

// ─── App ──────────────────────────────────────────────────
export default function App() {
  const { isAuthenticated, user } = useAuthStore();

  // Auto-logout after 30 min inactivity
  useInactivityTimer();

  // Silent token refresh (checks expiry on mount, refreshes every 45 min)
  useTokenRefresh();

  // Global Theme Overrides Effect
  useEffect(() => {
    const applyTheme = () => {
      const accentColor = localStorage.getItem('crm-accent') || 'red';
      const accentStyles: any = {
        red: {
          primary: '#2563EB',
          hover: '#1D4ED8',
          gradient: 'linear-gradient(135deg, #1D4ED8 0%, #2563EB 50%, #3B82F6 100%)',
          shadow: 'rgba(211, 47, 47, 0.2)',
        },
        emerald: {
          primary: '#10B981',
          hover: '#059669',
          gradient: 'linear-gradient(135deg, #059669 0%, #10B981 50%, #34D399 100%)',
          shadow: 'rgba(16, 185, 129, 0.2)',
        },
        blue: {
          primary: '#2563EB',
          hover: '#1D4ED8',
          gradient: 'linear-gradient(135deg, #1D4ED8 0%, #2563EB 50%, #60A5FA 100%)',
          shadow: 'rgba(37, 99, 235, 0.2)',
        },
        violet: {
          primary: '#8B5CF6',
          hover: '#7C3AED',
          gradient: 'linear-gradient(135deg, #7C3AED 0%, #8B5CF6 50%, #A78BFA 100%)',
          shadow: 'rgba(139, 92, 246, 0.2)',
        }
      };

      const activeStyle = accentStyles[accentColor] || accentStyles.red;
      
      let styleTag = document.getElementById('crm-global-theme') as HTMLStyleElement;
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'crm-global-theme';
        document.head.appendChild(styleTag);
      }
      
      styleTag.innerHTML = `
        :root {
          --primary-accent: ${activeStyle.primary};
          --primary-hover: ${activeStyle.hover};
          --primary-gradient: ${activeStyle.gradient};
          --primary-shadow: ${activeStyle.shadow};
        }
        
        /* Global button / text / border overrides */
        .bg-gradient-to-br.from-\\[\\#1D4ED8\\].to-\\[\\#2563EB\\] {
          background: var(--primary-gradient) !important;
        }
        .bg-gradient-to-br.from-blue-50.to-blue-100 {
          border-color: var(--primary-accent) !important;
        }
        .text-\\[\\#2563EB\\] {
          color: var(--primary-accent) !important;
        }
        .text-[#2563EB] {
          color: var(--primary-accent) !important;
        }
        .text-blue-600 {
          color: var(--primary-accent) !important;
        }
        .bg-\\[\\#2563EB\\] {
          background-color: var(--primary-accent) !important;
        }
        .bg-[#2563EB] {
          background-color: var(--primary-accent) !important;
        }
        .bg-blue-600 {
          background-color: var(--primary-accent) !important;
        }
        .hover\\:bg-blue-700:hover {
          background-color: var(--primary-hover) !important;
        }
        .from-blue-600 {
          --tw-gradient-from: var(--primary-accent) !important;
        }
        .to-blue-800 {
          --tw-gradient-to: var(--primary-hover) !important;
        }
        .border-blue-200 {
          border-color: var(--primary-accent) !important;
        }
        .bg-blue-50 {
          background-color: rgba(211, 47, 47, 0.05) !important;
        }
        .text-blue-700 {
          color: var(--primary-accent) !important;
        }
        .border-l-4.pl-6 {
          border-left-color: var(--primary-accent) !important;
          border-image: none !important;
        }
        .border-t-\\[\\#2563EB\\] {
          border-top-color: var(--primary-accent) !important;
        }
        .hover\\:text-\\[\\#2563EB\\]:hover {
          color: var(--primary-accent) !important;
        }
        .hover\\:bg-\\[\\#2563EB\\]:hover {
          background-color: var(--primary-accent) !important;
        }
        .group:hover .group-hover\\:text-\\[\\#2563EB\\] {
          color: var(--primary-accent) !important;
        }
        .group:hover .group-hover\\:bg-gradient-to-br {
          background: var(--primary-gradient) !important;
        }
        .focus\\:ring-\\[\\#2563EB\\]:focus {
          --tw-ring-color: var(--primary-accent) !important;
        }
        .focus\\:border-\\[\\#2563EB\\]:focus {
          border-color: var(--primary-accent) !important;
        }
        .border-\\[\\#2563EB\\] {
          border-color: var(--primary-accent) !important;
        }
        
        /* Sidebar active highlights */
        .text-[#2563EB] {
          color: var(--primary-accent) !important;
        }
      `;
    };

    applyTheme();

    const handleThemeChange = () => {
      applyTheme();
    };
    window.addEventListener('crm-theme-changed', handleThemeChange);
    window.addEventListener('storage', handleThemeChange);

    return () => {
      window.removeEventListener('crm-theme-changed', handleThemeChange);
      window.removeEventListener('storage', handleThemeChange);
    };
  }, []);

  const getDefaultRedirect = () => {
    if (!isAuthenticated || !user) return '/login';
    const redirects: Record<string, string> = {
      super_admin: '/admin',
      admin: '/admin',
      manager: '/admin',
      customer: '/customer',
      staff: '/staff/job-carts',
    };
    return redirects[user.role] || '/login';
  };

  return (
    <>
      <ImpersonationBanner />
      <ForcePasswordChangeModal />
      <ToastContainer />
      <Routes>
      {/* 403 Access Denied */}
      <Route path="/403" element={<NoAccessPage />} />
      {/* Public routes */}
      <Route path="/login" element={
        isAuthenticated ? <Navigate to={getDefaultRedirect()} replace /> : <LoginPage />
      } />
      <Route path="/register" element={
        isAuthenticated ? <Navigate to={getDefaultRedirect()} replace /> : <RegisterPage />
      } />
      <Route path="/forgot-password" element={
        isAuthenticated ? <Navigate to={getDefaultRedirect()} replace /> : <ForgotPasswordPage />
      } />

      {/* Admin routes */}
      <Route path="/admin" element={
        <ProtectedRoute><RoleRoute allowedRoles={['admin']}><AdminLayout /></RoleRoute></ProtectedRoute>
      }>
        <Route index element={<DashboardPage />} />
        <Route path="job-carts" element={<AllJobCardsPage />} />

        <Route path="job-carts/new" element={<JobCartCreatePage />} />
        <Route path="job-carts/:id" element={<JobCartDetailPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="slots" element={<SlotsPage />} />
        <Route path="customer-bookings" element={<CustomerBookingsPage />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="packages" element={<PackagesPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="staff/:id" element={<StaffDetailPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="buy-sell" element={<BuySellPage />} />
        <Route path="product-orders" element={<AdminProductOrdersPage />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="inquiries" element={<InquiriesPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="customers" element={<CustomersListPage />} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="add-customer" element={<ManualRegistrationPage />} />
        <Route path="package-approvals" element={<PackageApprovalsPage />} />
        <Route path="package-tracking" element={<PackageTrackingPage />} />
        {/* ─── New Admin Routes ─── */}
        <Route path="reports" element={<ReportsPage />} />
        <Route path="billing" element={<QuickBillingPage />} />
        <Route path="invoices" element={<AllInvoicesPage />} />
        <Route path="salary" element={<StaffSalaryPage />} />
        <Route path="vendors" element={<VendorsPage />} />
        <Route path="archive" element={<SuperAdminRoute><ArchivePage /></SuperAdminRoute>} />
        {/* ─── Phase 2 Routes ─── */}
        <Route path="quick-wash" element={<QuickWashPage />} />
        <Route path="loyalty" element={<LoyaltySettingsPage />} />
        <Route path="premium-services" element={<PremiumServicesPage />} />
        <Route path="deliveries" element={<AdminDeliveriesPage />} />
        <Route path="pickups" element={<PickupsPage />} />
        {/* ─── Phase 2 Extended Routes ─── */}
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="feedback" element={<FeedbackPage />} />
        <Route path="balance-sheet" element={<BalanceSheetPage />} />
        <Route path="audit-logs" element={<SuperAdminRoute><AuditLogPage /></SuperAdminRoute>} />
        <Route path="staff-hr" element={<StaffHRPage />} />
        <Route path="whatsapp" element={<WhatsAppPage />} />
        <Route path="customer-rewards" element={<CustomerRewardsPage />} />
        <Route path="roles" element={<SuperAdminRoute><RoleManagementPage /></SuperAdminRoute>} />
        {/* ─── Quotations Routes ─── */}
        <Route path="quotations" element={<QuotationsListPage />} />
        <Route path="quotations/new" element={<QuotationCreatePage />} />
        <Route path="quotations/edit/:id" element={<QuotationCreatePage />} />
        {/* ─── New Admin Routes ─── */}
        <Route path="leads" element={<LeadManagementPage />} />
        <Route path="package-alerts" element={<PackageAlertsPage />} />
        <Route path="pending-payments" element={<PendingPaymentsPage />} />
        <Route path="stock-approvals" element={<SuperAdminRoute><FranchiseStockApprovalsPage /></SuperAdminRoute>} />
        <Route path="franchise-orders" element={<FranchiseStockOrdersPage />} />
        <Route path="franchises" element={<SuperAdminRoute><FranchiseManagementPage /></SuperAdminRoute>} />
      </Route>


      {/* Customer routes */}
      <Route path="/customer" element={
        <ProtectedRoute><RoleRoute allowedRoles={['customer']}><CustomerLayout /></RoleRoute></ProtectedRoute>
      }>
        <Route index element={<CustomerDashboardPage />} />
        <Route path="services" element={<CustomerServicesPage />} />
        <Route path="job-carts" element={<CustomerJobCartsPage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="bookings/new" element={<BookingPage />} />
        <Route path="loyalty" element={<LoyaltyPage />} />
        <Route path="vehicles" element={<VehiclesPage />} />
        <Route path="buy-packages" element={<CustomerBuyPackagesPage />} />
        <Route path="products" element={<CustomerProductsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="delivery/:id" element={<TrackingPage />} />
      </Route>

      {/* Staff routes */}
      <Route path="/staff" element={
        <ProtectedRoute><RoleRoute allowedRoles={['staff']}><StaffLayout /></RoleRoute></ProtectedRoute>
      }>
        <Route index element={<Navigate to="job-carts" replace />} />
        <Route path="job-carts" element={<StaffJobCartsPage />} />
        <Route path="job-carts/new" element={<JobCartCreatePage />} />
        <Route path="job-carts/:id" element={<JobCartDetailPage />} />
        <Route path="inventory" element={<StaffInventoryPage />} />
        <Route path="benefits" element={<StaffBenefitsPage />} />
        <Route path="inquiry" element={<StaffInquiryPage />} />
        <Route path="delivery" element={<DeliveryPage />} />
        <Route path="check-in" element={<CheckInOutPage />} />
        <Route path="quick-wash" element={<QuickWashPage />} />
      </Route>

      {/* Public Tracking Page */}
      <Route path="/job/:id" element={<JobTrackingPage />} />
      <Route path="/feedback/:token" element={<FeedbackFormPage />} />

      {/* Redirects */}
      <Route path="/" element={<Navigate to={getDefaultRedirect()} replace />} />
      <Route path="*" element={<Navigate to={getDefaultRedirect()} replace />} />
    </Routes>
    </>
  );
}
