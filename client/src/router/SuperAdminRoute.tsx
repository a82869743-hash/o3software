import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

interface SuperAdminRouteProps {
  children: React.ReactNode;
}

/**
 * SuperAdminRoute — Restricts access strictly to Main Studio Branch Super Admins.
 * Non-main branch admins are redirected back to the main admin dashboard (/admin).
 */
export default function SuperAdminRoute({ children }: SuperAdminRouteProps) {
  const { user } = useAuthStore();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isSuperAdmin = user.role === 'admin' || user.role === 'super_admin';

  if (!isSuperAdmin) {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}
