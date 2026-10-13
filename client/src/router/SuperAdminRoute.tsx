import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

interface SuperAdminRouteProps {
  children: React.ReactNode;
}

/**
 * SuperAdminRoute — Restricts access strictly to Platform Super Admins (role === 'super_admin').
 * Franchise admins and employees are blocked.
 */
export default function SuperAdminRoute({ children }: SuperAdminRouteProps) {
  const { user } = useAuthStore();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isSuperAdmin = user.role === 'super_admin';

  if (!isSuperAdmin) {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}
