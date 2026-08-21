import { Outlet } from 'react-router-dom';
import StaffSidebar from './StaffSidebar';
import MobileNavbar from './MobileNavbar';

export default function StaffLayout() {
  return (
    <div className="min-h-screen bg-[#fcf9f8]">
      <MobileNavbar />
      <StaffSidebar />
      <main className="lg:ml-[240px] pt-20 lg:pt-8 p-4 sm:p-6 lg:p-8 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
