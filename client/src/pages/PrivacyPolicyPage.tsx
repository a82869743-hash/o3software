import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const UPDATED = '11 November 2026';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-5">
    <h2 className="text-[15px] font-extrabold text-slate-900">{title}</h2>
    <div className="mt-1.5 text-sm text-slate-700 leading-relaxed space-y-2">{children}</div>
  </section>
);

/** Public privacy policy (linked from the app, the sign-in page and the Google Play listing). */
export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm p-5 sm:p-7">
        <button onClick={() => (history.length > 1 ? history.back() : window.location.assign('/'))} className="flex items-center gap-1 text-sm font-bold text-[#2563EB] mb-3"><ArrowLeft size={16} /> Back</button>
        <h1 className="text-2xl font-black text-slate-900">Privacy policy</h1>
        <p className="text-xs text-slate-500 mt-1">O3 Car Spaa · Anand, Gujarat 388121, India · Last updated {UPDATED}</p>

        <Section title="Who we are">
          <p>O3 Car Spaa ("we") runs car detailing studios and the O3 Car Spaa app and website at o3carspa.cloud. This policy explains what information the app collects, why, and the choices you have.</p>
        </Section>

        <Section title="Information we collect">
          <p><b>Customers:</b> name, mobile number, WhatsApp number, email (optional), address (optional, for pick-up and drop), your cars (brand, model, number plate), bookings, packages, bills and payments, reward points, feedback, and photos of your car taken during service.</p>
          <p><b>Studio team (staff and managers):</b> name, mobile number, attendance check-in and check-out times, your location at check-in / check-out and while you are on a pick-up or drop trip, attendance selfies, tasks, leave and salary records.</p>
          <p><b>Device information:</b> basic technical data such as browser / app version and IP address, used to keep the service secure and working.</p>
        </Section>

        <Section title="Permissions the app asks for">
          <p><b>Location</b> — only for the studio team, only while the app is open: to confirm attendance at the studio and to show customers where their pick-up / drop driver is. The app does not track location in the background.</p>
          <p><b>Camera and photos</b> — to take attendance selfies, car photos for job cards, and profile pictures. Photos are uploaded only when you choose to.</p>
        </Section>

        <Section title="How we use your information">
          <ul className="list-disc pl-5 space-y-1">
            <li>To create your account and let you sign in.</li>
            <li>To take bookings, run job cards, send bills, invoices and service updates.</li>
            <li>To send booking reminders and, unless you opt out in Account settings, offers on WhatsApp.</li>
            <li>To run studio operations: attendance, payroll, stock and accounts.</li>
            <li>To answer questions sent to our WhatsApp number, partly with automatic (AI) replies.</li>
            <li>To keep the service secure and prevent misuse.</li>
          </ul>
          <p>We do not sell your personal information and we do not show third-party ads.</p>
        </Section>

        <Section title="Who we share it with">
          <p>Only with services we need to run the app, and only what they need:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><b>Hostinger</b> — the server and database that hold the app's data.</li>
            <li><b>WhatsApp (Meta)</b> — to deliver messages to your mobile number.</li>
            <li><b>Groq</b> — an AI service that reads incoming WhatsApp enquiries to suggest replies.</li>
            <li><b>Google Maps / OpenStreetMap</b> — map pictures and directions when you open a map.</li>
            <li>Your payment app (UPI) when you choose to pay; we do not see or store your card or bank details.</li>
          </ul>
          <p>We may also share information if the law requires it.</p>
        </Section>

        <Section title="How long we keep it">
          <p>We keep your account information while your account is open. Bills, invoices and payment records are kept for as long as Indian tax law requires (usually up to 8 years), even after an account is deleted, but without your name and contact details.</p>
        </Section>

        <Section title="Your choices and rights">
          <ul className="list-disc pl-5 space-y-1">
            <li>See and correct your details in <b>Profile → Account settings</b>.</li>
            <li>Stop offers and reminders in <b>Account settings → Notification preferences</b>.</li>
            <li>Delete your account in <b>Profile → Account settings → Delete my account</b>, or see <Link to="/delete-account" className="text-[#2563EB] font-semibold underline">how to delete your account</Link>.</li>
          </ul>
        </Section>

        <Section title="Security">
          <p>Data is sent over encrypted connections (HTTPS), passwords are stored only in scrambled (hashed) form, and access inside the studio is limited by role.</p>
        </Section>

        <Section title="Children">
          <p>The app is meant for adults (18+) and is not directed at children.</p>
        </Section>

        <Section title="Changes and contact">
          <p>If we change this policy we will update the date above. For any privacy question or request, use <b>Help &amp; support</b> in the app or visit the studio in Anand, Gujarat.</p>
        </Section>
      </div>
    </div>
  );
}
