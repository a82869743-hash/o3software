import { Outlet } from 'react-router-dom';
import CustomerNavbar from './CustomerNavbar';

export default function CustomerLayout() {
  return (
    <div className="min-h-screen bg-[#f4f4f5]">
      <CustomerNavbar />
      {/* Offset for top bar + desktop tabs */}
      <main className="pt-16 sm:pt-[108px] pb-20 sm:pb-8 px-4 sm:px-6 max-w-6xl mx-auto">
        <Outlet />
      </main>
    </div>
  );
}
