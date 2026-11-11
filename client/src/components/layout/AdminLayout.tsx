import { Suspense } from 'react';
import PageLoader from '../shared/PageLoader';
import { Outlet } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import AdminTopBar from './AdminTopBar';
import MobileNavbar from './MobileNavbar';
import LiveSearch from '../shared/LiveSearch';

export default function AdminLayout() {
  return (
    <div className="min-h-screen bg-[#F3F6FB] bg-[radial-gradient(ellipse_at_top_right,rgba(37,99,235,0.07),transparent_55%)]">
      <MobileNavbar />
      <AdminSidebar />
      <main className="admin-main lg:ml-[260px] pt-20 lg:pt-8 px-3 pb-6 sm:p-6 lg:p-8 min-h-screen overflow-x-hidden">
        {/* Global search bar - desktop only */}
        <div className="hidden lg:block mb-6 max-w-md">
          <LiveSearch />
        </div>
        <Suspense fallback={<PageLoader />}><Outlet /></Suspense>
      </main>
    </div>
  );
}
