import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../../store/authStore';
import { API_BASE } from '../../utils/endpoints';

/** Local review only: /dev-login?as=customer|staff|admin|super_admin signs in with that test account. */
export default function DevLoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [err, setErr] = useState('');
  useEffect(() => {
    const user = params.get('user');
    const as = params.get('as') || 'customer';

    axios.get(`${API_BASE}/auth/dev-login`, { params: user ? { user } : { as } })
      .then(({ data }) => {
        login(data.data.token, data.data.user);
        const role = data.data.user?.role || as;
        const home = role === 'customer' ? '/customer/dashboard' : role === 'staff' && !(data.data.user?.permissions || []).length ? '/admin/my/attendance' : '/admin';
        navigate(params.get('to') || home, { replace: true });
      })
      .catch(e => setErr(e?.response?.data?.error || 'Dev login is switched off'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">{err || 'Signing in…'}</div>;
}
