import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import api from '../../api/axiosInstance';
import { useAuthStore } from '../../store/authStore';

/** Customer: close the account for good (Google Play requires this inside the app). */
export default function DeleteAccountCard() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => { if (!busy) { setOpen(false); setPassword(''); setConfirmText(''); setError(''); } };

  const submit = async () => {
    setError('');
    if (!password) { setError('Enter your password'); return; }
    if (confirmText.trim().toUpperCase() !== 'DELETE') { setError('Type DELETE to confirm'); return; }
    setBusy(true);
    try {
      await api.post('/auth/delete-account', { password });
      toast.success('Your account has been deleted');
      useAuthStore.getState().logout();
      window.location.replace('/login');
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not delete the account. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-red-100 p-5 mt-6">
      <h3 className="text-sm font-extrabold text-red-700">Delete my account</h3>
      <p className="text-sm text-slate-600 mt-1">
        Permanently close your O3 Car Spaa account and remove your name, mobile number, email, address and photo.
      </p>
      <button type="button" onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-red-600 border border-red-200 rounded-xl px-4 py-2 hover:bg-red-50">
        <Trash2 size={16} /> Delete account
      </button>

      <Modal open={open} onClose={close} title="Delete your account?">
        <div className="p-5 space-y-4">
          <ul className="text-sm text-slate-700 list-disc pl-5 space-y-1">
            <li>You will be signed out and cannot sign in again with this account.</li>
            <li>Your name, mobile, email, address, photo and saved addresses are removed.</li>
            <li>Unused reward points, wallet balance and package washes are lost.</li>
            <li>Bills and service records are kept without your details, because the studio must keep them for tax.</li>
            <li>This cannot be undone.</li>
          </ul>
          <Input label="Your password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          <Input label='Type "DELETE" to confirm' value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
          <div className="flex gap-3 justify-end pt-1">
            <Button type="button" variant="secondary" onClick={close} disabled={busy}>Keep my account</Button>
            <Button type="button" variant="danger" onClick={submit} loading={busy}>Delete forever</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
