import { Outlet } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import AdminTopBar from './AdminTopBar';
import MobileNavbar from './MobileNavbar';
import LiveSearch from '../shared/LiveSearch';

export default function AdminLayout() {
  return (
    <div className="min-h-screen bg-[#fcf9f8]">
      <MobileNavbar />
      <AdminSidebar />
      <main className="lg:ml-[250px] pt-20 lg:pt-8 p-4 sm:p-6 lg:p-8 min-h-screen">
        {/* Global search bar - desktop only */}
        <div className="hidden lg:block mb-6 max-w-md">
          <LiveSearch />
        </div>
        <Outlet />
      </main>
    </div>
  );
}
