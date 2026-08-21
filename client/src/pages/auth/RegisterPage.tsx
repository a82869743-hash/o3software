import { useState } from 'react';
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

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  mobile: z.string().regex(/^[0-9]{10}$/, 'Enter valid 10-digit mobile number'),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
  carBrand: z.string().optional(),
  carModel: z.string().optional(),
  carRegNo: z.string().optional(),
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

  const { data: brandsRes } = useBrands();
  const { data: modelsRes } = useModels(selectedBrand);

  const liveBrands: string[] = brandsRes?.data || [];
  const carBrands = liveBrands.length > 0 ? Array.from(new Set([...liveBrands, 'Others'])) : fallbackCarBrands;

  const liveModels: string[] = modelsRes?.data || [];
  const models = selectedBrand
    ? (liveModels.length > 0 ? Array.from(new Set([...liveModels, 'Other'])) : getModelsForBrand(selectedBrand))
    : [];

  const isOtherBrand = selectedBrand === 'Others';
  const isOtherModel = selectedModel === 'Other';

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = (data: RegisterForm) => {
    const finalBrand = isOtherBrand ? customBrand : selectedBrand;
    const finalModel = isOtherModel ? customModel : selectedModel;

    registerMutation.mutate(
      { 
        name: data.name, 
        mobile: data.mobile, 
        email: data.email || undefined, 
        password: data.password,
        car_brand: finalBrand || undefined,
        car_model: finalModel || undefined,
        car_reg_no: data.carRegNo || undefined,
        referral_code: data.referralCode || undefined
      },
      {
        onSuccess: (result) => {
          login(result.token, result.user);
          toast.success(`Welcome to O3 Car Spa, ${result.user.name}!`);
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
        <div className="absolute inset-0 bg-gradient-to-br from-[#0284C7]/20 via-transparent to-[#0369A1]/10 animate-gradient-shift" />
        <div className="relative z-10 px-16 max-w-md">
          <div className="mb-6">
            <Logo size="lg" variant="light" />
          </div>
          <div className="w-16 h-1 bg-gradient-to-r from-[#0284C7] to-[#38BDF8] mt-6 mb-6 rounded-full" />
          <p className="text-slate-300 text-sm leading-relaxed font-medium">
            Join O3 Car Spa for a premium car care experience. Track your ceramic coating,
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
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md animate-fade-in-up">
          {/* Mobile brand header */}
          <div className="lg:hidden text-center mb-8 flex flex-col items-center">
            <Logo size="lg" />
            <div className="w-12 h-1 bg-[#0284C7] mx-auto mt-4 rounded-full" />
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
                  Car Brand <span className="text-slate-400 normal-case tracking-normal">(optional)</span>
                </label>
                <select
                  value={selectedBrand}
                  onChange={(e) => { setSelectedBrand(e.target.value); setSelectedModel(''); setCustomBrand(''); setCustomModel(''); }}
                  className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-[#0284C7]/20 focus:bg-white focus:border-[#0284C7] transition-all duration-200 cursor-pointer"
                >
                  <option value="">Select brand...</option>
                  {carBrands.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-600 mb-1.5">
                  Car Model <span className="text-slate-400 normal-case tracking-normal">(optional)</span>
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
                  <select
                    value={selectedModel}
                    onChange={(e) => { setSelectedModel(e.target.value); setCustomModel(''); }}
                    className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-[#0284C7]/20 focus:bg-white focus:border-[#0284C7] cursor-pointer"
                    disabled={!selectedBrand}
                  >
                    <option value="">{selectedBrand ? 'Select model...' : 'Select brand first'}</option>
                    {models.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-600 mb-1.5">
                Registration No. <span className="text-slate-400 normal-case tracking-normal">(optional)</span>
              </label>
              <input
                {...register('carRegNo')}
                type="text"
                placeholder="e.g. GJ06AB1234"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-[#0284C7]/20 focus:bg-white focus:border-[#0284C7] placeholder:text-slate-400 transition-all duration-200 uppercase"
              />
            </div>

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
              O3 Car Spa v2.0 · Anand, Gujarat (388121)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
