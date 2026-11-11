import { useState } from 'react';
import { Lock, ShieldCheck, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import api from '../../api/axiosInstance';
import Button from '../ui/Button';

export default function ForcePasswordChangeModal() {
  const { user, login } = useAuthStore();
  const toast = useUIStore((s) => s.toast);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // staff & admin passwords are set by their admin and are permanent; only customers are ever asked to change
  if (!user || !user.must_change_password || user.role !== 'customer') {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');


    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    if (!/\d/.test(newPassword) || !/[a-zA-Z]/.test(newPassword)) {
      setError('New password must contain both letters and numbers.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    try {
      setLoading(true);
      const res = await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });

      if (res.data.success) {
        toast('success', 'Password updated successfully! Welcome to O3 Car Spaa.');
        // Update user state and session token
        if (res.data.data?.token && res.data.data?.user) {
          login(res.data.data.token, res.data.data.user);
        } else {
          useAuthStore.getState().updateUser({ must_change_password: false });
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update password. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8 border border-slate-100 relative animate-in fade-in zoom-in-95 duration-200">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4 border border-amber-100 shadow-sm">
          <ShieldCheck size={28} />
        </div>

        <h2 className="text-xl font-extrabold text-slate-900 text-center tracking-tight">
          Security Update Required
        </h2>
        <p className="text-xs text-slate-500 text-center mt-1.5 leading-relaxed">
          You are logging in with a temporary password or your password was reset by an administrator. Please create a new permanent password to continue.
        </p>

        {error && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle size={15} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Current / Temporary Password (leave blank if you signed in with OTP)
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              New Permanent Password
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 chars (letters & numbers)"
                className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <span className="text-[10px] text-slate-400 block mt-1">Must be at least 8 characters with letters & digits</span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            className="w-full py-3 text-xs font-bold rounded-xl shadow-lg mt-2 cursor-pointer"
            disabled={loading}
          >
            {loading ? 'Securing Account...' : 'Set New Password & Continue'}
          </Button>
        </form>
      </div>
    </div>
  );
}
