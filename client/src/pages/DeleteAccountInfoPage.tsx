import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

/** Public "how to delete your account" page (Google Play asks for a web link to this). */
export default function DeleteAccountInfoPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm p-5 sm:p-7 text-sm text-slate-700 leading-relaxed">
        <button onClick={() => (history.length > 1 ? history.back() : window.location.assign('/'))} className="flex items-center gap-1 text-sm font-bold text-[#2563EB] mb-3"><ArrowLeft size={16} /> Back</button>
        <h1 className="text-2xl font-black text-slate-900">Delete your O3 Car Spaa account</h1>

        <h2 className="mt-5 text-[15px] font-extrabold text-slate-900">Customers</h2>
        <ol className="list-decimal pl-5 mt-1.5 space-y-1">
          <li>Open the O3 Car Spaa app or <b>o3carspa.cloud</b> and sign in.</li>
          <li>Go to <b>Profile → Account settings</b>.</li>
          <li>Scroll down to <b>Delete my account</b>, enter your password and type DELETE.</li>
        </ol>
        <p className="mt-2">Forgot your password? Use <b>Forgot Password</b> on the sign-in page first.</p>

        <h2 className="mt-5 text-[15px] font-extrabold text-slate-900">What is deleted</h2>
        <p className="mt-1.5">Your name, mobile number, WhatsApp number, email, address, profile photo, saved addresses and the studio's notes about you. You are signed out everywhere and cannot sign in again. Unused reward points, wallet balance and package washes are lost.</p>

        <h2 className="mt-5 text-[15px] font-extrabold text-slate-900">What is kept</h2>
        <p className="mt-1.5">Bills, invoices, payments and service records are kept for as long as Indian tax law requires (usually up to 8 years), without your name or contact details.</p>

        <h2 className="mt-5 text-[15px] font-extrabold text-slate-900">Studio team</h2>
        <p className="mt-1.5">Staff and manager accounts are closed by the studio admin. Ask your admin, or visit the studio.</p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/login" className="bg-[#2563EB] text-white font-bold rounded-xl px-5 py-2.5">Sign in</Link>
          <Link to="/privacy" className="text-[#2563EB] font-bold rounded-xl px-5 py-2.5 border border-blue-200">Privacy policy</Link>
        </div>
      </div>
    </div>
  );
}
