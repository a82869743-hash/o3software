import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useRegister } from '../../api/hooks/useAuth';
import { useAuthStore } from '../../store/authStore';
import { carBrands as fallbackCarBrands, getModelsForBrand } from '../../utils/carData';
import { useBrands, useModels } from '../../api/hooks/useVehicles';
import Logo from '../../components/shared/Logo';
import api from '../../api/axiosInstance';
import { regNoError, normalizeRegNo } from '../../utils/validators';
import { carBrands as datasetBrands } from '../../utils/carData';
import Dropdown from '../../components/ui/Dropdown';
import { locationPermission, getLocation, distanceM } from '../../utils/location';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  mobile: z.string().regex(/^[6-9][0-9]{9}$/, 'Enter valid 10-digit mobile number'),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  password: z.string().min(8, 'At least 8 characters').regex(/(?=.*[a-zA-Z])(?=.*\d)/, 'Use letters and numbers'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
  carBrand: z.string().optional(),
  carModel: z.string().optional(),
  carRegNo: z.string().min(1, 'Enter your car registration number').refine(v => !regNoError(v), { message: 'Invalid number plate (e.g. MH01AB1234)' }),
  whatsapp: z.string().optional(),
  referralCode: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const navigate = useNavigate();
  const registerMutation = useRegister();
  const { login } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);

  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [customBrand, setCustomBrand] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [waSame, setWaSame] = useState(true);
  const [studios, setStudios] = useState<{ id: number; name: string; city?: string; address?: string; latitude?: string; longitude?: string }[]>([]);
  const [studioId, setStudioId] = useState('');
  const [nearNote, setNearNote] = useState('');

  // Studios to choose from; if location is already allowed, the nearest one is picked for them
  useEffect(() => {
    api.get('/franchises/public').then(async r => {
      const list = r.data.data || [];
      setStudios(list);
      if (list.length === 1) { setStudioId(String(list[0].id)); return; }
      if ((await locationPermission()) !== 'granted') return;
      try {
        const me = await getLocation(8000);
        const withPin = list.filter((s: any) => s.latitude != null);
        if (!withPin.length) return;
        const near = withPin.map((s: any) => ({ s, d: distanceM(me, { lat: +s.latitude, lng: +s.longitude }) })).sort((a: any, b: any) => a.d - b.d)[0];
        setStudioId(String(near.s.id));
        setNearNote(`Nearest to you (${near.d < 1000 ? near.d + ' m' : (near.d / 1000).toFixed(1) + ' km'})`);
      } catch { /* they can choose themselves */ }
    }).catch(() => {});
  }, []);

  const { data: brandsRes } = useBrands();
  const { data: modelsRes } = useModels(selectedBrand);

  const liveBrands: string[] = brandsRes?.data || [];
  const carBrands = Array.from(new Set([...datasetBrands.filter(b => b !== 'Others'), ...liveBrands, 'Others']));

  const liveModels: string[] = modelsRes?.data || [];
  const models = selectedBrand
    ? Array.from(new Set([...getModelsForBrand(selectedBrand).filter(m => m !== 'Other'), ...liveModels, 'Other']))
    : [];

  const isOtherBrand = selectedBrand === 'Others';
  const isOtherModel = selectedModel === 'Other';

  const refFromLink = new URLSearchParams(window.location.search).get('ref') || '';
  const { register, handleSubmit, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { referralCode: refFromLink.toUpperCase() },
  });

  const onSubmit = (data: RegisterForm) => {
    const finalBrand = isOtherBrand ? customBrand : selectedBrand;
    const finalModel = isOtherModel ? customModel : selectedModel;
    if (!finalBrand?.trim() || !finalModel?.trim()) { toast.error('Select your car brand and model'); return; }
    if (studios.length > 1 && !studioId) { toast.error('Choose your studio'); return; }
    const wa = (data.whatsapp || '').replace(/\D/g, '');
    if (!waSame && !/^[6-9]\d{9}$/.test(wa)) { toast.error('Enter a valid 10-digit WhatsApp number'); return; }

    registerMutation.mutate(
      { 
        name: data.name, 
        mobile: data.mobile, 
        email: data.email || undefined, 
        password: data.password,
        car_brand: finalBrand,
        car_model: finalModel,
        car_reg_no: normalizeRegNo(data.carRegNo),
        whatsapp_number: waSame ? undefined : wa,
        referral_code: data.referralCode || undefined,
        franchise_id: studioId ? Number(studioId) : undefined,
      } as any,
      {
        onSuccess: (result) => {
          login(result.token, result.user);
          toast.success(`Welcome to O3 Car Spaa, ${result.user.name}!`);
          navigate('/customer/services');
        },
        onError: (err: any) => {
          const message = err.response?.data?.error || 'Registration failed. Please try again.';
          toast.error(message);
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Left — brand panel */}
      <div className="hidden lg:flex w-1/2 bg-[#0F172A] relative overflow-hidden items-center justify-center pattern-overlay">
        <img src="/photos/studio-hero.webp" alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#0284C7]/20 via-transparent to-[#0369A1]/10 animate-gradient-shift" />
        <div className="relative z-10 px-16 max-w-md">
          <div className="mb-6">
            <Logo size="lg" variant="light" />
          </div>
          <div className="w-16 h-1 bg-gradient-to-r from-[#0284C7] to-[#38BDF8] mt-6 mb-6 rounded-full" />
          <p className="text-slate-300 text-sm leading-relaxed font-medium">
            Join O3 Car Spaa for a premium car care experience. Track your ceramic coating,
            earn loyalty rewards, and book service slots with ease.
          </p>
          <div className="mt-10 space-y-3">
            {[
              { icon: '✓', text: 'Track your job cards & live detailing status' },
              { icon: '✓', text: 'Earn loyalty points & reward washes' },
              { icon: '✓', text: 'Book service slots online in seconds' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 opacity-0 animate-fade-in-up" style={{ animationDelay: `${0.5 + i * 0.15}s`, animationFillMode: 'forwards' }}>
                <div className="w-8 h-8 rounded-full bg-[#0284C7]/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-[#0284C7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-slate-300 text-sm font-medium">{item.text}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em] mt-10 font-bold">
            Vitthal Udyognagar, Anand, Gujarat (388121)
          </p>
        </div>
        {/* Decorative elements */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#0284C7] via-[#0284C7]/50 to-transparent" />
        <div className="absolute top-10 right-10 w-40 h-40 rounded-full border border-white/5 animate-float" />
        <div className="absolute bottom-20 right-20 w-24 h-24 rounded-full border border-[#0284C7]/20" />
      </div>

      {/* Right — register form */}
      <div className="w-full lg:w-1/2 flex items-start lg:items-center justify-center px-5 pt-6 pb-10 lg:p-8 bg-white">
        <div className="w-full max-w-md animate-fade-in-up">
          {/* Mobile app hero */}
          <div className="lg:hidden -mx-5 -mt-6 mb-6 px-6 pt-10 pb-16 rounded-b-[32px] bg-gradient-to-br from-[#0F172A] via-[#1E3A8A] to-[#2563EB] text-white text-center relative overflow-hidden">
            <img src="/photos/studio-hero.webp" alt="" className="absolute inset-0 w-full h-full object-cover opacity-45" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#0B1F4D]/40 via-[#0B1F4D]/60 to-[#1D4ED8]/80" />
            <div className="relative inline-flex bg-white rounded-2xl p-2 shadow-xl"><Logo size="md" /></div>
            <p className="relative mt-5 text-2xl font-black leading-tight">At your time.<br /><span className="text-sky-300">Showroom shine.</span></p>
            <p className="relative mt-2 text-xs text-white/80">Ceramic · PPF · Detailing · Premium wash</p>
          </div>

          <div className="mb-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0284C7] mb-1.5">
              New Customer Account
            </p>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              Create Account
            </h2>
            <p className="text-sm text-slate-500 mt-1.5 font-medium">
              Register to track your car care services
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-600 mb-1.5">
                Full Name
              </label>
              <input
                {...register('name')}
                type="text"
                placeholder="Enter your full name"
                className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-[#0284C7]/20 focus:bg-white focus:border-[#0284C7] placeholder:text-slate-400 transition-all duration-200 ${
                  errors.name ? 'ring-2 ring-rose-400 border-rose-400' : ''
                }`}
                autoComplete="name"
              />
              {errors.name && (
                <p className="text-[11px] text-rose-600 mt-1.5 font-medium">{errors.name.message}</p>
              )}
            </div>

            {/* Mobile Number */}
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-600 mb-1.5">
                Mobile Number
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-semibold">
                  +91
                </span>
                <input
                  {...register('mobile')}
                  type="tel"
                  maxLength={10}
                  onInput={(e) => { e.currentTarget.value = e.currentTarget.value.replace(/\D/g, '').slice(0, 10); }}
                  placeholder="Enter 10-digit mobile"
                  className={`w-full pl-14 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-[#0284C7]/20 focus:bg-white focus:border-[#0284C7] placeholder:text-slate-400 transition-all duration-200 ${
                    errors.mobile ? 'ring-2 ring-rose-400 border-rose-400' : ''
                  }`}
                  autoComplete="tel"
                />
              </div>
              {errors.mobile && (
                <p className="text-[11px] text-rose-600 mt-1.5 font-medium">{errors.mobile.message}</p>
              )}
            </div>

            {/* WhatsApp number (updates, invoices and reminders go here) */}
            <div>
              <label className="flex items-center gap-2 text-[13px] font-semibold text-slate-700 cursor-pointer select-none">
                <input type="checkbox" checked={waSame} onChange={e => setWaSame(e.target.checked)} className="w-4 h-4 accent-[#0284C7]" />
                My WhatsApp number is the same as my mobile
              </label>
              {!waSame && (
                <div className="relative mt-2">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-semibold">+91</span>
                  <input
                    {...register('whatsapp')}
                    type="tel"
                    maxLength={10}
                    onInput={(e) => { e.currentTarget.value = e.currentTarget.value.replace(/\D/g, '').slice(0, 10); }}
                    placeholder="WhatsApp number"
                    className="w-full pl-14 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-[#0284C7]/20 focus:bg-white focus:border-[#0284C7] placeholder:text-slate-400"
                  />
                </div>
              )}
            </div>

            {/* Email (optional) */}
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-600 mb-1.5">
                Email <span className="text-slate-400 normal-case tracking-normal">(optional)</span>
              </label>
              <input
                {...register('email')}
                type="email"
                placeholder="Enter email address"
                className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-[#0284C7]/20 focus:bg-white focus:border-[#0284C7] placeholder:text-slate-400 transition-all duration-200 ${
                  errors.email ? 'ring-2 ring-rose-400 border-rose-400' : ''
                }`}
                autoComplete="email"
              />
              {errors.email && (
                <p className="text-[11px] text-rose-600 mt-1.5 font-medium">{errors.email.message}</p>
              )}
            </div>

            {/* Vehicle Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-600 mb-1.5">
                  Car Brand <span className="text-rose-500">*</span>
                </label>
                <Dropdown
                  value={selectedBrand}
                  onChange={(e) => { setSelectedBrand(e.target.value); setSelectedModel(''); setCustomBrand(''); setCustomModel(''); }}
                  className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-[#0284C7]/20 focus:bg-white focus:border-[#0284C7] transition-all duration-200 cursor-pointer"
                >
                  <option value="">Select brand...</option>
                  {carBrands.map(b => <option key={b} value={b}>{b}</option>)}
                </Dropdown>
              </div>
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-600 mb-1.5">
                  Car Model <span className="text-rose-500">*</span>
                </label>
                {isOtherBrand ? (
                  <input
                    type="text"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    placeholder="Enter model"
                    className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-[#0284C7]/20 focus:bg-white focus:border-[#0284C7]"
                  />
                ) : (
                  <Dropdown
                    value={selectedModel}
                    onChange={(e) => { setSelectedModel(e.target.value); setCustomModel(''); }}
                    className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-[#0284C7]/20 focus:bg-white focus:border-[#0284C7] cursor-pointer"
                    disabled={!selectedBrand}
                  >
                    <option value="">{selectedBrand ? 'Select model...' : 'Select brand first'}</option>
                    {models.map(m => <option key={m} value={m}>{m}</option>)}
                  </Dropdown>
                )}
                {isOtherModel && !isOtherBrand && (
                  <input type="text" value={customModel} onChange={(e) => setCustomModel(e.target.value)} placeholder="Type your model"
                    className="mt-2 w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-[#0284C7]/20 focus:bg-white focus:border-[#0284C7]" />
                )}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-600 mb-1.5">
                Registration No. <span className="text-rose-500">*</span>
              </label>
              <input
                {...register('carRegNo')}
                maxLength={11}
                type="text"
                placeholder="e.g. MH01AB1234"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-[#0284C7]/20 focus:bg-white focus:border-[#0284C7] placeholder:text-slate-400 transition-all duration-200 uppercase"
              />
              {errors.carRegNo && <p className="text-[11px] text-rose-600 mt-1.5 font-medium">{errors.carRegNo.message}</p>}
            </div>

            {/* Studio (only when there is more than one) */}
            {studios.length > 1 && (
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-600 mb-1.5">
                  Your studio <span className="text-rose-500">*</span>
                </label>
                <Dropdown value={studioId} onChange={(e) => { setStudioId(e.target.value); setNearNote(''); }}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium">
                  <option value="">Choose the studio you will visit</option>
                  {studios.map(s => <option key={s.id} value={s.id}>{s.name}{s.city ? ` — ${s.city}` : ''}</option>)}
                </Dropdown>
                {nearNote && <p className="text-[11px] text-emerald-600 mt-1.5 font-semibold">{nearNote}</p>}
              </div>
            )}

            {/* Referral Code */}
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-600 mb-1.5">
                Referral Code <span className="text-slate-400 normal-case tracking-normal">(optional)</span>
              </label>
              <input
                {...register('referralCode')}
                type="text"
                placeholder="Enter referral code (e.g. O31234)"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-[#0284C7]/20 focus:bg-white focus:border-[#0284C7] placeholder:text-slate-400 transition-all duration-200 uppercase"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-600 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min. 6 characters"
                  className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-[#0284C7]/20 focus:bg-white focus:border-[#0284C7] placeholder:text-slate-400 transition-all duration-200 pr-12 ${
                    errors.password ? 'ring-2 ring-rose-400 border-rose-400' : ''
                  }`}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {showPassword ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.462 6.462M9.878 9.878l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                    ) : (
                      <>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
              {errors.password && (
                <p className="text-[11px] text-rose-600 mt-1.5 font-medium">{errors.password.message}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-600 mb-1.5">
                Confirm Password
              </label>
              <input
                {...register('confirmPassword')}
                type={showPassword ? 'text' : 'password'}
                placeholder="Re-enter password"
                className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-[#0284C7]/20 focus:bg-white focus:border-[#0284C7] placeholder:text-slate-400 transition-all duration-200 ${
                  errors.confirmPassword ? 'ring-2 ring-rose-400 border-rose-400' : ''
                }`}
                autoComplete="new-password"
              />
              {errors.confirmPassword && (
                <p className="text-[11px] text-rose-600 mt-1.5 font-medium">{errors.confirmPassword.message}</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full py-4 bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold rounded-xl shadow-lg shadow-[#0284C7]/20 hover:shadow-xl hover:shadow-[#0284C7]/30 hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 uppercase tracking-wider text-sm"
            >
              {registerMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating Account...
                </span>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          {/* Sign-in link */}
          <div className="mt-6 text-center">
            <p className="text-sm text-slate-500 font-medium">
              Already have an account?{' '}
              <Link to="/login" className="text-[#0284C7] font-bold hover:underline">
                Sign In
              </Link>
            </p>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-[10px] text-slate-400 font-medium">
              O3 Car Spaa v2.0 · Anand, Gujarat (388121)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
