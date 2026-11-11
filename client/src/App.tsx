import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useInactivityTimer, useTokenRefresh } from './utils/useInactivityTimer';
import AdminLayout from './components/layout/AdminLayout';
import CustomerLayout from './components/layout/CustomerLayout';
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
import RequireAccess from './router/RequireAccess';
import { can, landingPath } from './utils/access';
import { useSessionSync } from './utils/useSessionSync';
import PageLoader from './components/shared/PageLoader';
const ReferralsPage = lazy(() => import('./pages/admin/ReferralsPage'));
const MyHRPage = lazy(() => import('./pages/staff/MyHRPage'));
const ProfileHubPage = lazy(() => import('./pages/customer/ProfileHubPage'));
const ReferEarnPage = lazy(() => import('./pages/customer/ReferEarnPage'));
const SupportPage = lazy(() => import('./pages/customer/SupportPage'));
const ImageCreditsPage = lazy(() => import('./pages/ImageCreditsPage'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'));
const DeleteAccountInfoPage = lazy(() => import('./pages/DeleteAccountInfoPage'));
const DevLoginPage = lazy(() => import('./pages/auth/DevLoginPage'));

const AllJobCardsPage = lazy(() => import('./pages/admin/AllJobCardsPage'));
const JobCartCreatePage = lazy(() => import('./pages/admin/JobCartCreatePage'));
const JobCartDetailPage = lazy(() => import('./pages/admin/JobCartDetailPage'));

const CustomerJobCartsPage = lazy(() => import('./pages/customer/JobCartsPage'));

// Inventory pages
const InventoryPage = lazy(() => import('./pages/admin/InventoryPage'));

// Slots & Bookings pages
const SlotsPage = lazy(() => import('./pages/admin/SlotsPage'));
const CustomerBookingsPage = lazy(() => import('./pages/admin/CustomerBookingsPage'));
const BookingPage = lazy(() => import('./pages/customer/BookingPage'));
const BookingsPage = lazy(() => import('./pages/customer/BookingsPage'));

// Services, Packages & Loyalty pages
const ServicesPage = lazy(() => import('./pages/admin/ServicesPage'));
const PackagesPage = lazy(() => import('./pages/admin/PackagesPage'));
const LoyaltyAwardPage = lazy(() => import('./pages/admin/LoyaltyAwardPage'));
const CustomerServicesPage = lazy(() => import('./pages/customer/ServicesPage'));
const LoyaltyPage = lazy(() => import('./pages/customer/LoyaltyPage'));
const VehiclesPage = lazy(() => import('./pages/customer/VehiclesPage'));
const ProfilePage = lazy(() => import('./pages/customer/ProfilePage'));
const CustomerDashboardPage = lazy(() => import('./pages/customer/DashboardPage'));
const CustomerBuyPackagesPage = lazy(() => import('./pages/customer/BuyPackagesPage'));
const CustomerProductsPage = lazy(() => import('./pages/customer/ProductsPage'));
const AdminProductOrdersPage = lazy(() => import('./pages/admin/ProductOrdersPage'));

// Staff & Accounts pages
const StaffPage = lazy(() => import('./pages/admin/StaffPage'));
const StaffDetailPage = lazy(() => import('./pages/admin/StaffDetailPage'));
const StaffSalaryPage = lazy(() => import('./pages/admin/StaffSalaryPage'));
const AccountsPage = lazy(() => import('./pages/admin/AccountsPage'));
const BuySellPage = lazy(() => import('./pages/admin/BuySellPage'));
const CustomersListPage = lazy(() => import('./pages/admin/CustomersListPage'));
const CustomerDetailPage = lazy(() => import('./pages/admin/CustomerDetailPage'));
const ManualRegistrationPage = lazy(() => import('./pages/admin/ManualRegistrationPage'));
const PackageApprovalsPage = lazy(() => import('./pages/admin/PackageApprovalsPage'));
const StaffBenefitsPage = lazy(() => import('./pages/staff/StaffBenefitsPage'));
const CheckInOutPage = lazy(() => import('./pages/staff/CheckInOutPage'));

// Messages, Inquiries & Import pages
const MessagesPage = lazy(() => import('./pages/admin/MessagesPage'));
const InquiriesPage = lazy(() => import('./pages/admin/InquiriesPage'));
const ImportPage = lazy(() => import('./pages/admin/ImportPage'));

// Settings & Dashboard Pages
// Settings, Dashboard & Billing Pages
const DashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage'));
const QuickBillingPage = lazy(() => import('./pages/admin/QuickBillingPage'));
const AllInvoicesPage = lazy(() => import('./pages/admin/AllInvoicesPage'));
const ArchivePage = lazy(() => import('./pages/admin/ArchivePage'));
const ReportsPage = lazy(() => import('./pages/admin/ReportsPage'));
const VendorsPage = lazy(() => import('./pages/admin/VendorsPage'));

// Phase 2 pages
const QuickWashPage = lazy(() => import('./pages/admin/QuickWashPage'));
const LoyaltySettingsPage = lazy(() => import('./pages/admin/LoyaltySettingsPage'));
const PremiumServicesPage = lazy(() => import('./pages/admin/PremiumServicesPage'));
const AdminDeliveriesPage = lazy(() => import('./pages/admin/DeliveriesPage'));
const PickupsPage = lazy(() => import('./pages/admin/PickupsPage'));

// Phase 2 Extended pages
const PaymentsPage = lazy(() => import('./pages/admin/PaymentsPage'));
const FeedbackPage = lazy(() => import('./pages/admin/FeedbackPage'));
const BalanceSheetPage = lazy(() => import('./pages/admin/BalanceSheetPage'));
const AuditLogPage = lazy(() => import('./pages/admin/AuditLogPage'));
const StaffHRPage = lazy(() => import('./pages/admin/StaffHRPage'));
const WhatsAppPage = lazy(() => import('./pages/admin/WhatsAppPage'));
const CustomerRewardsPage = lazy(() => import('./pages/admin/CustomerRewardsPage'));
const PackageTrackingPage = lazy(() => import('./pages/admin/PackageTrackingPage'));

// Quotations pages
const QuotationsListPage = lazy(() => import('./pages/admin/QuotationsListPage'));
const QuotationCreatePage = lazy(() => import('./pages/admin/QuotationCreatePage'));

// New Features (Leads, Alerts, Pending Payments, Stock Approvals)
const LeadManagementPage = lazy(() => import('./pages/admin/LeadManagementPage'));
const PackageAlertsPage = lazy(() => import('./pages/admin/PackageAlertsPage'));
const PendingPaymentsPage = lazy(() => import('./pages/admin/PendingPaymentsPage'));
const FranchiseStockApprovalsPage = lazy(() => import('./pages/admin/FranchiseStockApprovalsPage'));
const FranchiseStockOrdersPage = lazy(() => import('./pages/admin/FranchiseStockOrdersPage'));
const FranchiseManagementPage = lazy(() => import('./pages/admin/FranchiseManagementPage'));


// Phase 5 pages
const RoleManagementPage = lazy(() => import('./pages/admin/RoleManagementPage'));
const FeedbackFormPage = lazy(() => import('./pages/customer/FeedbackFormPage'));

// Delivery pages
const DeliveryPage = lazy(() => import('./pages/staff/DeliveryPage'));
const TrackingPage = lazy(() => import('./pages/customer/TrackingPage'));
const JobTrackingPage = lazy(() => import('./pages/customer/JobTrackingPage'));

// ─── App ──────────────────────────────────────────────────
export default function App() {
  const { isAuthenticated, user } = useAuthStore();

  // Auto-logout after 30 min inactivity
  useInactivityTimer();

  // Silent token refresh (checks expiry on mount, refreshes every 45 min)
  useTokenRefresh();

  // Keep role / permissions in sync with what the admin or Super Admin changes
  useSessionSync();

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
    return landingPath(user);
  };

  return (
    <>
      <ImpersonationBanner />
      <ForcePasswordChangeModal />
      <ToastContainer />
      <Suspense fallback={<PageLoader />}>
      <Routes>
      {/* 403 Access Denied */}
      <Route path="/403" element={<NoAccessPage />} />
      <Route path="/image-credits" element={<ImageCreditsPage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/delete-account" element={<DeleteAccountInfoPage />} />
      {import.meta.env.DEV && <Route path="/dev-login" element={<DevLoginPage />} />}
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

      {/* Internal app (Super Admin, Franchise Admin, Manager, Staff) — every page is permission-gated */}
      <Route path="/admin" element={
        <ProtectedRoute><RoleRoute allowedRoles={['admin', 'manager', 'staff']}><AdminLayout /></RoleRoute></ProtectedRoute>
      }>
        <Route index element={can(user, 'dashboard') ? <DashboardPage /> : <Navigate to={landingPath(user)} replace />} />
        <Route path="job-carts" element={<RequireAccess module="job_cards"><AllJobCardsPage /></RequireAccess>} />
        <Route path="job-carts/new" element={<RequireAccess module="job_cards" action="create"><JobCartCreatePage /></RequireAccess>} />
        <Route path="job-carts/:id" element={<RequireAccess module="job_cards"><JobCartDetailPage /></RequireAccess>} />
        <Route path="quick-wash" element={<RequireAccess module="quick_wash"><QuickWashPage /></RequireAccess>} />
        <Route path="slots" element={<RequireAccess module="slots"><SlotsPage /></RequireAccess>} />
        <Route path="customer-bookings" element={<RequireAccess module="bookings"><CustomerBookingsPage /></RequireAccess>} />
        <Route path="pickups" element={<RequireAccess module="pickups"><PickupsPage /></RequireAccess>} />
        <Route path="deliveries" element={<RequireAccess module="deliveries"><AdminDeliveriesPage /></RequireAccess>} />

        <Route path="customers" element={<RequireAccess module="customers"><CustomersListPage /></RequireAccess>} />
        <Route path="customers/:id" element={<RequireAccess module="customers"><CustomerDetailPage /></RequireAccess>} />
        <Route path="add-customer" element={<RequireAccess module="customers" action="create"><ManualRegistrationPage /></RequireAccess>} />
        <Route path="leads" element={<RequireAccess module="leads"><LeadManagementPage /></RequireAccess>} />
        <Route path="inquiries" element={<RequireAccess module="inquiries"><InquiriesPage /></RequireAccess>} />
        <Route path="packages" element={<RequireAccess module="packages"><PackagesPage /></RequireAccess>} />
        <Route path="package-approvals" element={<RequireAccess module="packages"><PackageApprovalsPage /></RequireAccess>} />
        <Route path="package-tracking" element={<RequireAccess module="packages"><PackageTrackingPage /></RequireAccess>} />
        <Route path="package-alerts" element={<RequireAccess module="packages"><PackageAlertsPage /></RequireAccess>} />
        <Route path="loyalty" element={<RequireAccess module="loyalty"><LoyaltySettingsPage /></RequireAccess>} />
        <Route path="customer-rewards" element={<RequireAccess module="loyalty"><CustomerRewardsPage /></RequireAccess>} />
        <Route path="referrals" element={<RequireAccess module="referrals"><ReferralsPage /></RequireAccess>} />
        <Route path="feedback" element={<RequireAccess module="feedback"><FeedbackPage /></RequireAccess>} />

        <Route path="services" element={<RequireAccess module="services"><ServicesPage /></RequireAccess>} />
        <Route path="premium-services" element={<RequireAccess module="services"><PremiumServicesPage /></RequireAccess>} />
        <Route path="inventory" element={<RequireAccess module="inventory"><InventoryPage /></RequireAccess>} />
        <Route path="buy-sell" element={<RequireAccess module="inventory"><BuySellPage /></RequireAccess>} />
        <Route path="product-orders" element={<RequireAccess module="inventory"><AdminProductOrdersPage /></RequireAccess>} />
        <Route path="franchise-orders" element={<RequireAccess module="franchise_stock"><FranchiseStockOrdersPage /></RequireAccess>} />
        <Route path="stock-approvals" element={<SuperAdminRoute><FranchiseStockApprovalsPage /></SuperAdminRoute>} />

        <Route path="accounts" element={<RequireAccess module="accounts"><AccountsPage /></RequireAccess>} />
        <Route path="vendors" element={<RequireAccess module="accounts"><VendorsPage /></RequireAccess>} />
        <Route path="pending-payments" element={<RequireAccess module="payments"><PendingPaymentsPage /></RequireAccess>} />
        <Route path="payments" element={<RequireAccess module="payments"><PaymentsPage /></RequireAccess>} />
        <Route path="billing" element={<RequireAccess module="billing"><QuickBillingPage /></RequireAccess>} />
        <Route path="invoices" element={<RequireAccess module="invoices"><AllInvoicesPage /></RequireAccess>} />
        <Route path="quotations" element={<RequireAccess module="quotations"><QuotationsListPage /></RequireAccess>} />
        <Route path="quotations/new" element={<RequireAccess module="quotations" action="create"><QuotationCreatePage /></RequireAccess>} />
        <Route path="quotations/edit/:id" element={<RequireAccess module="quotations" action="edit"><QuotationCreatePage /></RequireAccess>} />
        <Route path="balance-sheet" element={<RequireAccess module="balance_sheet"><BalanceSheetPage /></RequireAccess>} />
        <Route path="reports" element={<RequireAccess module="reports"><ReportsPage /></RequireAccess>} />

        <Route path="staff" element={<RequireAccess module="staff"><StaffPage /></RequireAccess>} />
        <Route path="staff/:id" element={<RequireAccess module="staff"><StaffDetailPage /></RequireAccess>} />
        <Route path="salary" element={<RequireAccess module="salary"><StaffSalaryPage /></RequireAccess>} />
        <Route path="staff-hr" element={<RequireAccess module="staff_hr"><StaffHRPage /></RequireAccess>} />

        <Route path="whatsapp" element={<RequireAccess module="whatsapp"><WhatsAppPage /></RequireAccess>} />
        <Route path="messages" element={<RequireAccess module="whatsapp"><MessagesPage /></RequireAccess>} />

        <Route path="roles" element={<RequireAccess module="roles"><RoleManagementPage /></RequireAccess>} />
        <Route path="import" element={<RequireAccess module="import" action="create"><ImportPage /></RequireAccess>} />
        <Route path="settings" element={<RequireAccess module="settings"><SettingsPage /></RequireAccess>} />
        <Route path="franchises" element={<SuperAdminRoute><FranchiseManagementPage /></SuperAdminRoute>} />
        <Route path="audit-logs" element={<SuperAdminRoute><AuditLogPage /></SuperAdminRoute>} />
        <Route path="archive" element={<SuperAdminRoute><ArchivePage /></SuperAdminRoute>} />

        {/* My workspace — every internal user, own data only */}
        <Route path="my/attendance" element={<CheckInOutPage />} />
        <Route path="my/benefits" element={<StaffBenefitsPage />} />
        <Route path="my/hr" element={<MyHRPage />} />
        <Route path="my/deliveries" element={<DeliveryPage />} />
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
        <Route path="profile" element={<ProfileHubPage />} />
        <Route path="profile/edit" element={<ProfilePage />} />
        <Route path="refer" element={<ReferEarnPage />} />
        <Route path="support" element={<SupportPage />} />
        <Route path="delivery/:id" element={<TrackingPage />} />
      </Route>

      {/* Legacy staff URLs → unified internal app */}
      <Route path="/staff" element={<Navigate to="/admin" replace />} />
      <Route path="/staff/job-carts" element={<Navigate to="/admin/job-carts" replace />} />
      <Route path="/staff/job-carts/new" element={<Navigate to="/admin/job-carts/new" replace />} />
      <Route path="/staff/check-in" element={<Navigate to="/admin/my/attendance" replace />} />
      <Route path="/staff/benefits" element={<Navigate to="/admin/my/benefits" replace />} />
      <Route path="/staff/delivery" element={<Navigate to="/admin/my/deliveries" replace />} />
      <Route path="/staff/*" element={<Navigate to="/admin" replace />} />

      {/* Public Tracking Page */}
      <Route path="/job/:id" element={<JobTrackingPage />} />
      <Route path="/feedback/:token" element={<FeedbackFormPage />} />

      {/* Redirects */}
      <Route path="/" element={<Navigate to={getDefaultRedirect()} replace />} />
      <Route path="*" element={<Navigate to={getDefaultRedirect()} replace />} />
    </Routes>
    </Suspense>
    </>
  );
}
