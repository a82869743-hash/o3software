import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/axiosInstance';

type Step = 'mobile' | 'otp' | 'reset';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('mobile');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[0-9]{10}$/.test(mobile)) { toast.error('Enter a valid 10-digit mobile number'); return; }
    try {
      setIsPending(true);
      const res = await api.post('/auth/forgot-password', { mobile });
      toast.success(res.data.message || 'OTP sent!');
      setStep('otp');
    } catch (err: any) { toast.error(err.response?.data?.error || 'Failed to send OTP'); }
    finally { setIsPending(false); }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length < 4) { toast.error('Enter the OTP sent to your mobile'); return; }
    try {
      setIsPending(true);
      const res = await api.post('/auth/verify-otp', { mobile, otp });
      setResetToken(res.data.data.resetToken);
      toast.success('OTP verified!');
      setStep('reset');
    } catch (err: any) { toast.error(err.response?.data?.error || 'Invalid OTP'); }
    finally { setIsPending(false); }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) { toast.error('Use at least 8 characters with letters and numbers'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    try {
      setIsPending(true);
      await api.post('/auth/reset-password', { resetToken, newPassword });
      toast.success('Password reset successfully! Please login.');
      navigate('/login');
    } catch (err: any) { toast.error(err.response?.data?.error || 'Failed to reset password'); }
    finally { setIsPending(false); }
  };

  const inputCls = 'w-full px-4 py-4 bg-[#F1F5F9] border border-transparent rounded-lg text-[#0F172A] font-medium focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white focus:border-[#2563EB]/30 placeholder:text-[#94A3B8]/60 transition-all duration-200';
  const btnCls = 'w-full py-4 bg-gradient-to-br from-[#1D4ED8] to-[#2563EB] text-white font-bold rounded-lg shadow-lg shadow-[#2563EB]/20 hover:shadow-xl hover:shadow-[#2563EB]/30 hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 uppercase tracking-wider text-sm';
  const labelCls = 'block text-[10px] font-extrabold uppercase tracking-widest text-[#64748B] mb-2';

  const Spinner = () => (
    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );

  const steps = [{ key: 'mobile', num: 1 }, { key: 'otp', num: 2 }, { key: 'reset', num: 3 }];
  const idx = steps.findIndex(s => s.key === step);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex w-1/2 bg-[#0F172A] relative overflow-hidden items-center justify-center pattern-overlay">
        <div className="absolute inset-0 bg-gradient-to-br from-[#2563EB]/15 via-transparent to-[#2563EB]/5 animate-gradient-shift" />
        <div className="relative z-10 px-16 max-w-md">
          <div className="mb-6"><img src="/assets/logo.png" alt="O3 Car Spaa" className="w-48 h-auto drop-shadow-lg" /></div>
          <h1 className="text-4xl font-black text-white tracking-tight leading-tight">O3 Car Spaa</h1>
          <div className="w-16 h-1 bg-gradient-to-r from-[#2563EB] to-[#3B82F6] mt-6 mb-6 rounded-full" />
          <p className="text-gray-400 text-sm leading-relaxed font-medium">Reset your password securely with OTP verification.</p>
          <div className="mt-10 space-y-3">
            {['Enter registered mobile', 'Verify with OTP', 'Set new password'].map((text, i) => (
              <div key={i} className="flex items-center gap-3 opacity-0 animate-fade-in-up" style={{ animationDelay: `${0.5 + i * 0.15}s`, animationFillMode: 'forwards' }}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black ${idx >= i ? 'bg-[#2563EB] text-white' : 'bg-[#2563EB]/20 text-[#2563EB]'}`}>
                  {idx > i ? '✓' : i + 1}
                </div>
                <span className={`text-sm ${idx >= i ? 'text-white' : 'text-gray-500'}`}>{text}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-600 uppercase tracking-[0.2em] mt-10 font-bold">Anand, Gujarat</p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#2563EB] via-[#2563EB]/50 to-transparent" />
        <div className="absolute top-10 right-10 w-40 h-40 rounded-full border border-white/5 animate-float" />
      </div>

      {/* Right form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md animate-fade-in-up">
          <div className="lg:hidden text-center mb-10">
            <img src="/assets/logo.png" alt="O3 Car Spaa" className="w-36 h-auto mx-auto mb-3" />
            <h1 className="text-3xl font-black text-[#0F172A] tracking-tight">O3 Car Spaa</h1>
            <div className="w-12 h-1 bg-[#2563EB] mx-auto mt-3 rounded-full" />
          </div>

          {/* Step indicator mobile */}
          <div className="flex items-center justify-center gap-2 mb-8 lg:hidden">
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${idx >= i ? 'bg-[#2563EB] text-white' : 'bg-gray-200 text-gray-500'}`}>{idx > i ? '✓' : s.num}</div>
                {i < steps.length - 1 && <div className={`w-8 h-0.5 ${idx > i ? 'bg-[#2563EB]' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>

          <div className="mb-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2563EB] mb-2">Password Recovery</p>
            <h2 className="text-3xl font-extrabold text-[#0F172A] tracking-tight">
              {step === 'mobile' ? 'Forgot Password' : step === 'otp' ? 'Verify OTP' : 'New Password'}
            </h2>
            <p className="text-sm text-[#64748B] mt-2 font-medium">
              {step === 'mobile' ? 'Enter your registered mobile number' : step === 'otp' ? `We sent a code to +91 ${mobile}` : 'Choose a strong new password'}
            </p>
          </div>

          {step === 'mobile' && (
            <form onSubmit={handleSendOtp} className="space-y-6">
              <div>
                <label className={labelCls}>Mobile Number</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B] text-sm font-semibold">+91</span>
                  <input type="tel" maxLength={10} value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} placeholder="Enter 10-digit mobile" className={`${inputCls} pl-14`} autoFocus />
                </div>
              </div>
              <button type="submit" disabled={isPending} className={btnCls}>
                {isPending ? <span className="flex items-center justify-center gap-2"><Spinner />Sending OTP...</span> : 'Send OTP'}
              </button>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div>
                <label className={labelCls}>Verification Code</label>
                <input type="text" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="Enter 6-digit OTP" className={`${inputCls} text-center text-2xl tracking-[0.5em] placeholder:text-base placeholder:tracking-normal`} autoFocus />
              </div>
              <button type="submit" disabled={isPending} className={btnCls}>
                {isPending ? <span className="flex items-center justify-center gap-2"><Spinner />Verifying...</span> : 'Verify OTP'}
              </button>
              <div className="text-center">
                <button type="button" onClick={() => { setStep('mobile'); setOtp(''); }} className="text-sm text-[#2563EB] font-bold hover:underline">← Change mobile number</button>
              </div>
            </form>
          )}

          {step === 'reset' && (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div>
                <label className={labelCls}>New Password</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min. 8 characters, letters + numbers" className={`${inputCls} pr-12`} autoFocus />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A] transition-colors">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      {showPassword ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M3 3l18 18" /> : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>}
                    </svg>
                  </button>
                </div>
              </div>
              <div>
                <label className={labelCls}>Confirm New Password</label>
                <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter new password" className={`${inputCls} ${confirmPassword && confirmPassword !== newPassword ? 'ring-2 ring-blue-400 border-blue-400' : ''}`} />
                {confirmPassword && confirmPassword !== newPassword && <p className="text-[11px] text-blue-600 mt-1.5 font-medium">Passwords do not match</p>}
              </div>
              <button type="submit" disabled={isPending} className={btnCls}>
                {isPending ? <span className="flex items-center justify-center gap-2"><Spinner />Resetting...</span> : 'Reset Password'}
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <p className="text-sm text-[#64748B] font-medium">
              Remember your password?{' '}<Link to="/login" className="text-[#2563EB] font-bold hover:underline">Sign In</Link>
            </p>
          </div>
          <div className="mt-8 text-center"><p className="text-[10px] text-[#64748B] font-medium">O3 Car Spaa v1.0 · Anand, Gujarat</p></div>
        </div>
      </div>
    </div>
  );
}
